// Student accounts that sign in with a USERNAME and password instead of an
// email address. Used by admissions-create-accounts (automatic, on
// acceptance) and student-account (staff "Give login" and password resets).
//
// HOW IT WORKS
//   Supabase Auth identifies a user by email, so each student gets an auth user
//   whose email is <username>@students.tarbiyyah.internal. That address is an
//   implementation detail: it is never displayed or emailed to, and the sign-in
//   page turns a typed username into it (src/lib/learn/studentLogin.ts). The
//   public.student_logins table (migration 0082) records the username and the
//   "must change password at first sign-in" flag. No password is ever stored by
//   us: only Supabase's own hash exists, and the generated password is returned
//   once to the staff member who triggered it and emailed once to the parent.
//
// SECURITY TRADE-OFFS (deliberate, and the reason for each)
//   * The generated password is emailed to the PARENT in plain text. Children
//     under 13 have no email of their own and a setup link would need one, so
//     the parent is the delivery channel. Mitigations: the password is
//     temporary (the student must choose their own at first sign-in), it is
//     sent only to the address the family gave us, and parents themselves get a
//     setup LINK, never a password.
//   * Strength: three random common words plus two digits is about 30 bits
//     (249 words ~ 8 bits each, plus 8 x 8 digits ~ 6 bits). That is readable
//     and memorable for a child, but weak against an offline attack. It is
//     acceptable only because (a) it is temporary, (b) sign-in is online-only
//     behind Supabase Auth rate limiting plus the learn-login lockout, and
//     (c) the student replaces it on first use.
//   * The synthetic domain cannot receive mail, so "Forgotten password" by
//     email cannot reach a student account and nobody can take one over by
//     guessing a username. A reset is done by staff or the parent, who see the
//     new password once. Usernames are guessable (firstname.lastname) but give
//     away nothing without the password; sign-in errors are generic.
//   * Anyone who knows the username and the email-free scheme still needs the
//     password, and the lockout in learn-login is keyed on the synthetic
//     address, so it protects username sign-in in exactly the same way.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { setupCodeHtml } from "./setupCode.ts";
import { emailShell } from "./resend.ts";

export const STUDENT_EMAIL_DOMAIN = "students.tarbiyyah.internal";

export function studentEmail(username: string): string {
  return `${username.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

// ── username ─────────────────────────────────────────────────────────────

/** Lowercase ASCII letters and digits only, accents folded (Zoë -> zoe). */
function asciiToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * firstname.lastname from a full name. Hyphens and apostrophes are dropped
 * (Abdul-Rahman O'Neil -> abdulrahman.oneil); middle names are ignored. A name
 * with no Latin letters at all (e.g. Arabic script) falls back to "student".
 */
export function usernameBase(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .map(asciiToken)
    .filter((t) => t.length > 0);
  let base = tokens.length === 0 ? "student" : tokens.length === 1 ? tokens[0] : `${tokens[0]}.${tokens[tokens.length - 1]}`;
  if (!/^[a-z]/.test(base)) base = `s${base}`;
  if (base.length > 30) base = base.slice(0, 30).replace(/\.$/, "");
  if (base.length < 3) base = `${base}student`;
  return base;
}

// ── password ─────────────────────────────────────────────────────────────

// Common, easy-to-spell words, 4 to 6 letters. None starts with i, l or o, so
// the capitalised first word can never be misread (I / l / 1, O / 0).
const WORDS =
  "amber apple arrow aspen bamboo basil beach berry birch bison blaze bloom boat brave bread bridge brook bubble cabin camel candle canoe cedar charm cherry chess cliff clover cobalt comet coral cotton crane daisy dawn delta desert dragon dream eagle ember falcon fern field finch flame flute forest frost garden gentle ginger glow goat grape grove harbor hawk hazel heron honey hill jade jewel jungle kettle kite koala mango maple marble meadow melon mint moon moss nest north nutmeg panda parrot peach pearl pebble pepper pine planet plum pond poppy puffin quail quartz quill rabbit raven reef ribbon river robin rocket rose sage sail sand shell silver snow spice spring star stone storm summer sunny swan swift tiger timber tulip turtle valley velvet violet walnut water willow wind winter wolf yellow zebra badge bakery banner barley basket beacon beaver bell bolt bottle branch breeze brick bright button cactus camera carpet castle cheese circle clock cloud coast copper crown dancer dinner drum duck engine fabric ferry fiddle flower flying fossil friend galaxy gift glider gold guitar hammer happy heart hobby jacket jelly jigsaw jolly joyful kitten knight magnet market meteor mirror monkey muffin museum music needle noble noodle novel paddle palace paper pencil piano pillow pirate pocket pretty puzzle rainy riddle ripple saddle salad school secret shadow silent simple singer sketch smile soccer spider spoon square stable stream sugar supper tablet teapot tennis ticket toast tower trophy tunnel unique vessel video voyage wagon wander wheat window wizard wonder yacht zigzag"
    .split(" ");

// Digits without 0 and 1 (look like O, l and I).
const DIGITS = "23456789";

/** Uniform random integer in [0, max) with no modulo bias. */
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** e.g. "Maple-river-stone-47": three random words and two digits. */
export function generatePassword(): string {
  const words = [0, 1, 2].map(() => WORDS[randomBelow(WORDS.length)]);
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  const digits = `${DIGITS[randomBelow(DIGITS.length)]}${DIGITS[randomBelow(DIGITS.length)]}`;
  return `${first}-${words[1]}-${words[2]}-${digits}`;
}

// ── create / reset ───────────────────────────────────────────────────────

export type StudentLoginResult =
  | { ok: true; existing: true; profileId: string; username: string }
  | { ok: true; existing: false; profileId: string; username: string; password: string }
  | { ok: false; error: string; detail?: string };

/**
 * Creates the student's auth user, profile, role, student_accounts link and
 * student_logins row. Idempotent: a child who already has a login is returned
 * as `existing` (the password is not recoverable, use resetStudentPassword).
 */
export async function createStudentLogin(
  svc: SupabaseClient,
  opts: { childId: string; fullName: string; grantedBy: string | null },
): Promise<StudentLoginResult> {
  const { data: have } = await svc.from("student_logins").select("profile_id, username").eq("child_id", opts.childId).maybeSingle();
  if (have) return { ok: true, existing: true, profileId: have.profile_id as string, username: have.username as string };

  // A child linked earlier to a real email login (pre-0082 flow) keeps it.
  const { data: legacy } = await svc.from("student_accounts").select("profile_id").eq("child_id", opts.childId).maybeSingle();
  if (legacy?.profile_id) return { ok: false, error: "already_has_email_login" };

  const base = usernameBase(opts.fullName);
  const password = generatePassword();
  let userId: string | null = null;
  let username = "";
  for (let attempt = 0; attempt < 25 && !userId; attempt++) {
    // base, base2, base3 ... ; a fallback "student" name gets a random number instead.
    const suffix = attempt === 0 ? "" : base === "student" ? String(1000 + randomBelow(9000)) : String(attempt + 1);
    const candidate = `${base}${suffix}`;
    const { data: taken } = await svc.from("student_logins").select("id").eq("username", candidate).maybeSingle();
    if (taken) continue;
    const { data: created, error } = await svc.auth.admin.createUser({
      email: studentEmail(candidate),
      password,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName, username: candidate },
    });
    if (created?.user) {
      userId = created.user.id;
      username = candidate;
    } else if (!/already|registered|exists/i.test(error?.message || "")) {
      return { ok: false, error: "create_failed", detail: error?.message };
    }
  }
  if (!userId) return { ok: false, error: "username_unavailable" };

  const cleanup = async () => {
    await svc.auth.admin.deleteUser(userId as string).catch(() => undefined);
  };

  const { error: profileErr } = await svc
    .from("profiles")
    .upsert({ id: userId, role: "student", full_name: opts.fullName, email: studentEmail(username) }, { onConflict: "id" });
  if (profileErr) {
    await cleanup();
    return { ok: false, error: "profile_failed", detail: profileErr.message };
  }
  const { error: roleErr } = await svc
    .from("user_roles")
    .upsert({ user_id: userId, role: "student", scope_type: "none", scope_id: null, granted_by: opts.grantedBy }, { onConflict: "user_id,role,scope_type,scope_id" });
  if (roleErr) {
    await cleanup();
    return { ok: false, error: "role_grant_failed", detail: roleErr.message };
  }
  const { error: linkErr } = await svc
    .from("student_accounts")
    .upsert({ child_id: opts.childId, profile_id: userId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
  if (linkErr) {
    await cleanup();
    return { ok: false, error: "link_failed", detail: linkErr.message };
  }
  const { error: loginErr } = await svc
    .from("student_logins")
    .insert({ child_id: opts.childId, profile_id: userId, username, must_change_password: true, reset_by: opts.grantedBy });
  if (loginErr) {
    await cleanup();
    return { ok: false, error: "login_record_failed", detail: loginErr.message };
  }
  return { ok: true, existing: false, profileId: userId, username, password };
}

export type ResetResult =
  | { ok: true; profileId: string; username: string; password: string }
  | { ok: false; error: string; detail?: string };

/** Sets a fresh generated password and forces a change at next sign-in. */
export async function resetStudentPassword(svc: SupabaseClient, opts: { childId: string; by: string | null }): Promise<ResetResult> {
  const { data: row } = await svc.from("student_logins").select("profile_id, username").eq("child_id", opts.childId).maybeSingle();
  if (!row) return { ok: false, error: "no_username_login" };
  const password = generatePassword();
  const { error } = await svc.auth.admin.updateUserById(row.profile_id as string, { password });
  if (error) return { ok: false, error: "reset_failed", detail: error.message };
  const { error: markErr } = await svc
    .from("student_logins")
    .update({ must_change_password: true, password_generated_at: new Date().toISOString(), reset_by: opts.by })
    .eq("child_id", opts.childId);
  if (markErr) return { ok: false, error: "reset_record_failed", detail: markErr.message };
  return { ok: true, profileId: row.profile_id as string, username: row.username as string, password };
}

// ── email ────────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type CredentialsEmailInput = {
  parentFirstName: string;
  childName: string;
  learnSiteUrl: string;
  /** Present only when a student login was just created or reset. */
  student?: { username: string; password: string; reason: "new" | "reset" };
  /** Present when the parent has to set up (or re-set) their own account. */
  parentSetup?: { link: string; isNew: boolean; code?: string | null; email?: string };
  /** Any extra paragraph (e.g. "also a sibling") in plain text. */
  note?: string;
};

/** One email to the parent: their setup link and/or the child's username and temporary password. */
export function credentialsEmail(input: CredentialsEmailInput): { subject: string; html: string } {
  const child = escapeHtml(input.childName);
  const loginUrl = `${input.learnSiteUrl.replace(/\/$/, "")}/login`;
  const parts: string[] = [`<p style="margin:0 0 16px;">Assalamu alaikum ${escapeHtml(input.parentFirstName)},</p>`];

  if (input.student && input.student.reason === "new") {
    parts.push(`<p style="margin:0 0 16px;">${child}'s place at Tarbiyyah Global Academy has been confirmed, and their accounts are ready.</p>`);
  } else if (input.student) {
    parts.push(`<p style="margin:0 0 16px;">A new temporary password has been set for ${child}'s Learn account.</p>`);
  } else {
    parts.push(`<p style="margin:0 0 16px;">${child}'s place at Tarbiyyah Global Academy has been confirmed, and your account is ready.</p>`);
  }

  if (input.parentSetup) {
    parts.push(
      `<p style="margin:0 0 12px;"><strong>Your parent account.</strong> ${input.parentSetup.isNew ? "Set a password to sign in and follow your child's progress." : "Use this link to set a new password."}</p>`,
      `<p style="margin:0 0 24px;"><a href="${escapeHtml(input.parentSetup.link)}" style="display:inline-block;background:#B08E45;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">${input.parentSetup.isNew ? "Set up your account" : "Set a new password"}</a></p>`,
      setupCodeHtml(input.parentSetup.code, input.learnSiteUrl.replace(/\/$/, ""), input.parentSetup.email || ""),
    );
  }

  if (input.student) {
    parts.push(
      `<p style="margin:0 0 8px;"><strong>${child}'s login.</strong> ${child} signs in at <a href="${escapeHtml(loginUrl)}" style="color:#5E4B1E;">${escapeHtml(loginUrl)}</a> with the username and temporary password below. No email address is needed.</p>`,
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#FDFBF6;border:1px solid #B08E45;border-radius:8px;"><tr><td style="padding:12px 16px;font-size:13px;color:#777;">Username</td><td style="padding:12px 16px;font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:bold;">${escapeHtml(input.student.username)}</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#777;">Temporary password</td><td style="padding:12px 16px;font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:bold;">${escapeHtml(input.student.password)}</td></tr></table>`,
      `<p style="margin:0 0 16px;font-size:14px;">${child} will be asked to choose their own password the first time they sign in. Please keep this email private. If the password is lost, you or the school can create a new one.</p>`,
    );
  }

  if (input.note) parts.push(`<p style="margin:0 0 16px;font-size:14px;">${escapeHtml(input.note)}</p>`);
  parts.push(`<p style="margin:0;font-size:13px;color:#777;">If you did not expect this email, please reply to let us know.</p>`);

  const subject = input.student
    ? input.student.reason === "new"
      ? `${input.childName}'s Tarbiyyah Global Academy accounts are ready`
      : `A new temporary password for ${input.childName}`
    : `Your Tarbiyyah Global Academy account is ready`;
  return { subject, html: emailShell(parts.join("")) };
}
