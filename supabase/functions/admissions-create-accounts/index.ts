// Creates the accounts for an ACCEPTED admissions application, automatically
// (the portal calls this the moment an application moves to Accepted) or on
// demand from the application drawer:
//   * the parent / legal guardian account (a setup LINK is emailed, never a
//     password), with the Parent role;
//   * the pupil record (children) linked to that parent, in the year group
//     applied for;
//   * optional class enrolments (a child can be in several classes);
//   * optional student login: a username + generated temporary password
//     (no email needed, see _shared/studentAccount.ts).
// One email goes to the parent with the setup link and the child's credentials.
// The temporary password is also returned ONCE in the response so the staff
// member can show it on screen; it is never stored or logged. Every step is
// idempotent, so running again only fills gaps ("resend" issues a fresh setup
// link and a fresh temporary password).
// Deployed WITH JWT verification; the caller's own user_roles are re-checked:
// Headteacher, Admin or Admissions only. The recipient is read from the
// application row, never from the request body.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { createStudentLogin, credentialsEmail, resetStudentPassword } from "../_shared/studentAccount.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const learnSiteUrl = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";
const serviceClient = createClient(supabaseUrl, serviceRoleKey);
const ALLOWED = ["head_teacher", "admin", "admissions"];

async function requireStaff(authHeader: string | null): Promise<{ id: string } | null> {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: roleRows } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  const roles = (roleRows || []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => ALLOWED.includes(r))) return null;
  return { id: userData.user.id };
}

async function findUserByEmail(email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const staff = await requireStaff(req.headers.get("Authorization"));
  if (!staff) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const applicationId = String(body.applicationId || "");
  if (!UUID.test(applicationId)) return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  const resend = body.resend === true;

  const { data: app } = await serviceClient.from("admissions_applications").select("*").eq("id", applicationId).maybeSingle();
  if (!app) return jsonResponse({ ok: false, error: "application_not_found" }, 404);
  if (app.status !== "accepted") return jsonResponse({ ok: false, error: "not_accepted" }, 409);

  const { data: stage } = await serviceClient
    .from("admissions_stage_details")
    .select("account_class_ids, account_student_login")
    .eq("application_id", applicationId)
    .maybeSingle();

  const notes: string[] = [];
  const childName = `${String(app.child_first_name).trim()} ${String(app.child_last_name).trim()}`.trim();

  // ── 1. the parent / legal guardian ────────────────────────────────────
  // A child with a different legal guardian (blended families) gets an account
  // for THAT guardian; otherwise the family's main contact.
  const useGuardian = app.guardian_is_other === true && typeof app.guardian_email === "string" && app.guardian_email.trim() !== "";
  const contactName = String(useGuardian ? app.guardian_name : app.parent_name).trim();
  const contactEmail = String(useGuardian ? app.guardian_email : app.parent_email).trim().toLowerCase();

  let parentId = "";
  let isNewUser = false;
  try {
    const existing = await findUserByEmail(contactEmail);
    if (existing) {
      // The application form is public, so the email on it is whatever the
      // applicant typed. If it matches a STAFF account, linking the child to
      // it (and, with resend, minting a recovery link for it) would hand a
      // staff login's reset link to whoever accepted the application. Refuse
      // and let the office sort out the real parent address first.
      const { data: existingRoles } = await serviceClient.from("user_roles").select("role").eq("user_id", existing.id);
      const staffRoles = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"];
      if ((existingRoles || []).some((r) => staffRoles.includes(String(r.role)))) {
        return jsonResponse({ ok: false, error: "email_belongs_to_staff_account" }, 409);
      }
      parentId = existing.id;
    } else {
      const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({ email: contactEmail, email_confirm: true });
      if (createErr || !created?.user) return jsonResponse({ ok: false, error: "create_failed", detail: createErr?.message }, 500);
      parentId = created.user.id;
      isNewUser = true;
    }
  } catch (e) {
    return jsonResponse({ ok: false, error: "lookup_failed", detail: String(e) }, 500);
  }

  // An existing account (e.g. a parent who is also staff, or the second child
  // of a family) keeps its profile as it is.
  const { error: profileErr } = await serviceClient
    .from("profiles")
    .upsert({ id: parentId, role: "parent", full_name: contactName, email: contactEmail }, { onConflict: "id", ignoreDuplicates: !isNewUser });
  if (profileErr) return jsonResponse({ ok: false, error: "profile_failed", detail: profileErr.message }, 500);
  const { error: roleErr } = await serviceClient
    .from("user_roles")
    .upsert({ user_id: parentId, role: "parent", scope_type: "none", scope_id: null, granted_by: staff.id }, { onConflict: "user_id,role,scope_type,scope_id" });
  if (roleErr) return jsonResponse({ ok: false, error: "role_grant_failed", detail: roleErr.message }, 500);

  let setupLink: string | null = null;
  let setupCode: string | null = null;
  if (isNewUser || resend) {
    const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email: contactEmail,
      options: { redirectTo: `${learnSiteUrl}/login/invite` },
    });
    if (linkErr || !linkData) return jsonResponse({ ok: false, error: "link_generation_failed", detail: linkErr?.message }, 500);
    const hashed = linkData.properties.hashed_token;
    setupLink = hashed ? `${learnSiteUrl}/login/invite?token_hash=${encodeURIComponent(hashed)}&type=recovery` : linkData.properties.action_link;
    setupCode = linkData.properties.email_otp || null;
  }
  notes.push(isNewUser ? "Parent account created." : "Parent account already existed.");

  // ── 2. the pupil record ───────────────────────────────────────────────
  let childId: string | null = (app.child_id as string | null) || null;
  if (!childId) {
    const { data: same } = await serviceClient
      .from("children")
      .select("id")
      .eq("parent_user_id", parentId)
      .eq("name", childName)
      .eq("dob", app.child_dob)
      .limit(1);
    childId = (same as { id: string }[] | null)?.[0]?.id || null;
  }
  if (!childId) {
    let yearGroupId: string | null = typeof body.yearGroupId === "string" && UUID.test(body.yearGroupId) ? body.yearGroupId : null;
    if (!yearGroupId) {
      const { data: yg } = await serviceClient.from("year_groups").select("id").ilike("name", String(app.year_group_applying)).limit(1);
      yearGroupId = (yg as { id: string }[] | null)?.[0]?.id || null;
    }
    const { data: inserted, error: childErr } = await serviceClient
      .from("children")
      .insert({ parent_user_id: parentId, name: childName, dob: app.child_dob, year_group_id: yearGroupId })
      .select("id")
      .single();
    if (childErr || !inserted) return jsonResponse({ ok: false, error: "child_failed", detail: childErr?.message }, 500);
    childId = inserted.id as string;
    notes.push(`${childName} added as a pupil.`);
  } else {
    notes.push(`${childName} already had a pupil record.`);
  }

  // ── 2b. start the pupil's details with the home address from the form (0151) ──
  // Only when the pupil has no details record yet: anything the family or
  // staff have already entered is never overwritten.
  const line1 = typeof app.address_line1 === "string" ? app.address_line1.trim() : "";
  if (line1) {
    const { data: existingDetails } = await serviceClient.from("pupil_details").select("id").eq("child_id", childId).maybeSingle();
    if (!existingDetails) {
      const { error: detailsErr } = await serviceClient.from("pupil_details").insert({
        child_id: childId,
        address_line1: line1,
        address_line2: (typeof app.address_line2 === "string" && app.address_line2.trim()) || null,
        town: (typeof app.address_town === "string" && app.address_town.trim()) || null,
        postcode: (typeof app.address_postcode === "string" && app.address_postcode.trim()) || null,
      });
      notes.push(detailsErr ? `Could not copy the home address into the pupil's details (${detailsErr.message}).` : "Home address copied into the pupil's details.");
    }
  }

  // ── 3. class enrolments (a child may be in several) ───────────────────
  const rawClassIds: unknown[] = Array.isArray(body.classIds) ? (body.classIds as unknown[]) : ((stage?.account_class_ids as unknown[] | null) || []);
  const classIds = [...new Set(rawClassIds.filter((c): c is string => typeof c === "string" && UUID.test(c)))];
  const enrolled: string[] = [];
  if (classIds.length > 0) {
    const { error: enrolErr } = await serviceClient
      .from("enrolments")
      .upsert(classIds.map((class_id) => ({ class_id, child_id: childId })), { onConflict: "class_id,child_id" });
    if (enrolErr) notes.push(`Could not enrol in every class (${enrolErr.message}). Do it from the pupil's profile.`);
    else {
      enrolled.push(...classIds);
      notes.push(`Enrolled in ${classIds.length} ${classIds.length === 1 ? "class" : "classes"}.`);
    }
  }

  // ── 4. the student login (username + temporary password) ──────────────
  const wantLogin = typeof body.createStudentLogin === "boolean" ? body.createStudentLogin : stage?.account_student_login !== false;
  let student: { profileId: string; username: string; password?: string; existing: boolean } | null = null;
  let studentCreds: { username: string; password: string; reason: "new" | "reset" } | undefined;
  if (wantLogin) {
    const made = await createStudentLogin(serviceClient, { childId, fullName: childName, grantedBy: staff.id });
    if (made.ok && !made.existing) {
      student = { profileId: made.profileId, username: made.username, password: made.password, existing: false };
      studentCreds = { username: made.username, password: made.password, reason: "new" };
      notes.push(`Student login created (username ${made.username}).`);
    } else if (made.ok) {
      if (resend) {
        const reset = await resetStudentPassword(serviceClient, { childId, by: staff.id });
        if (reset.ok) {
          student = { profileId: reset.profileId, username: reset.username, password: reset.password, existing: true };
          studentCreds = { username: reset.username, password: reset.password, reason: "reset" };
          notes.push(`A new temporary password was set for ${reset.username}.`);
        } else {
          student = { profileId: made.profileId, username: made.username, existing: true };
          notes.push(`Student login exists (${made.username}) but its password could not be reset: ${reset.error}.`);
        }
      } else {
        student = { profileId: made.profileId, username: made.username, existing: true };
        notes.push(`Student login already exists (${made.username}).`);
      }
    } else if (made.error === "already_has_email_login") {
      notes.push("The pupil already has a login with an email address, so no username login was created.");
    } else {
      notes.push(`The student login could not be created: ${made.error}${made.detail ? ` (${made.detail})` : ""}.`);
    }
  }

  // ── 5. remember what was created (idempotency anchors) ────────────────
  const patch: Record<string, unknown> = { parent_profile_id: parentId, child_id: childId };
  if (student) patch.student_profile_id = student.profileId;
  if (!app.accounts_created_at) patch.accounts_created_at = new Date().toISOString();
  const { error: patchErr } = await serviceClient.from("admissions_applications").update(patch).eq("id", applicationId);
  if (patchErr) notes.push(`The accounts exist but the application could not be updated: ${patchErr.message}`);

  // ── 6. one email to the parent ─────────────────────────────────────────
  let emailSent = false;
  let emailError: string | undefined;
  let loggedSubject = "";
  if (setupLink || studentCreds) {
    const mail = credentialsEmail({
      parentFirstName: contactName.split(/\s+/)[0] || "there",
      childName,
      learnSiteUrl,
      student: studentCreds,
      parentSetup: setupLink ? { link: setupLink, isNew: isNewUser, code: setupCode, email: contactEmail } : undefined,
    });
    loggedSubject = mail.subject;
    try {
      const sent = await sendEmail({ to: contactEmail, toName: contactName, subject: mail.subject, html: mail.html });
      emailSent = sent.ok;
      if (!sent.ok) emailError = sent.detail;
    } catch (e) {
      emailError = String(e);
    }
    // History entry WITHOUT any secret (no link, no password).
    await serviceClient.from("admissions_messages").insert({
      application_id: applicationId,
      template: "accounts",
      subject: loggedSubject,
      body: [
        setupLink ? "Parent account setup link sent by email." : "",
        studentCreds ? `Student login: username ${studentCreds.username}. The temporary password was sent by email and is not stored.` : "",
      ].filter(Boolean).join("\n"),
      sent_by: staff.id,
      email_sent: emailSent,
      email_error: emailError ? emailError.slice(0, 500) : null,
    });
  } else {
    notes.push("Nothing new to email: the accounts already existed.");
  }

  return jsonResponse({
    ok: true,
    notes,
    parent: {
      profileId: parentId,
      email: contactEmail,
      isNewUser,
      // Only handed back when the email did not go, so staff can pass it on by hand.
      setupLink: setupLink && !emailSent ? setupLink : undefined,
      setupCode: setupLink && !emailSent ? setupCode : undefined,
    },
    childId,
    enrolledClassIds: enrolled,
    student: student ? { profileId: student.profileId, username: student.username, password: student.password, existing: student.existing } : null,
    emailSent,
    emailError,
  });
});
