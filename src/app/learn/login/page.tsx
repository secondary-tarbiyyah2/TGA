"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/learn/PasswordInput";
import { loginEmailFor } from "@/lib/learn/studentLogin";
import { useLearnSession, dashboardPathForRole, STAFF_ROLES, type LearnRole } from "@/lib/learn/session";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";

// Who is signing in. Every role uses the same field and the same sign-in
// call (a student's username is mapped to their login email by loginEmailFor
// either way), but the choice is enforced: an account that holds none of the
// chosen tab's roles is signed straight out again with a message naming the
// right tab (a staff account can't sign in on the Parent tab). Someone with
// several roles (a teacher who is also a parent) lands on the area they chose.
// This is about clarity, not security: RLS on every table is the boundary.
type Audience = "parent" | "student" | "staff";

const AUDIENCE_ROLES: Record<Audience, LearnRole[]> = {
  parent: ["parent"],
  student: ["student"],
  staff: STAFF_ROLES,
};

const audienceFor = (roles: string[]): Audience | null =>
  (Object.keys(AUDIENCE_ROLES) as Audience[]).find((a) => roles.some((r) => (AUDIENCE_ROLES[a] as string[]).includes(r))) ?? null;

const AUDIENCES: { id: Audience; label: string; field: string; placeholder: string; hint: string }[] = [
  {
    id: "parent",
    label: "Parent",
    field: "Email address",
    placeholder: "you@example.com",
    hint: "Use the email address you gave us when you applied. Your sign-in details are emailed to you when your place is confirmed.",
  },
  {
    id: "student",
    label: "Student",
    field: "Username",
    placeholder: "Your school username",
    hint: "Use the username the school gave you. Forgotten your password? Ask your parent or your teacher to reset it.",
  },
  {
    id: "staff",
    label: "Staff",
    field: "School email",
    placeholder: "Your school email address",
    hint: "Use your school email address. Accounts are created by the school office.",
  },
];

async function callLearnLogin(action: "check" | "record", body: Record<string, unknown>) {
  const url = getEdgeFunctionUrl("learn-login");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ action, ...body }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export default function LearnLoginPage() {
  const router = useRouter();
  const { session, roles, rolesLoaded } = useLearnSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Held while the post-sign-in "must change password" check runs, so the
  // already-signed-in redirect below cannot jump ahead of it.
  const [finishing, setFinishing] = useState(false);
  const [audience, setAudience] = useState<Audience>("parent");
  const [wrongTab, setWrongTab] = useState<Audience | null>(null);
  // Links can pre-select a tab, e.g. the website footer's "Staff sign-in"
  // goes to /login/?as=staff. Read after mount (static export, no server).
  useEffect(() => {
    try {
      const as = new URLSearchParams(window.location.search).get("as");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the query string once after mount
      if (as === "parent" || as === "student" || as === "staff") setAudience(as);
    } catch {
      /* ignore */
    }
  }, []);
  const current = AUDIENCES.find((a) => a.id === audience) ?? AUDIENCES[0];

  // Already signed in with a known role, send them straight to their
  // dashboard rather than showing the login form again.
  if (!finishing && session && session !== "loading" && rolesLoaded && roles.length > 0) {
    const preferred = roles.find((r) => AUDIENCE_ROLES[audience].includes(r.role)) ?? roles[0];
    router.replace(dashboardPathForRole(preferred.role));
    return <p className="text-ink/65">Redirecting…</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Students type a username; it maps to a synthetic email (see src/lib/learn/studentLogin.ts).
    const loginEmail = loginEmailFor(email);
    const lockCheck = await callLearnLogin("check", { email: loginEmail });
    if (lockCheck?.ok && lockCheck.locked) {
      const minutes = Math.ceil((lockCheck.retryAfterSeconds || 0) / 60);
      setError(`Too many failed attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      return;
    }

    setBusy(true);
    setFinishing(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);

    // Fire-and-forget: this is a supplementary lockout/audit layer, not the
    // security boundary (see learn-login's own comments) · a slow or failed
    // record call should never block the user's actual sign-in result.
    callLearnLogin("record", { email: loginEmail, success: !signInErr });

    if (signInErr) {
      setFinishing(false);
      const sc = (signInErr.code || "").toLowerCase();
      const sm = (signInErr.message || "").toLowerCase();
      setError(
        sc === "invalid_credentials"
          ? "Incorrect email, username or password. Check for typos and caps lock, or use \"Forgotten your password?\" below."
          : sc === "email_not_confirmed"
            ? "Your email address hasn't been confirmed yet. Open the invitation email we sent and follow its link first."
            : sc === "user_banned"
              ? "This account is disabled. Contact the school office."
              : sc === "over_request_rate_limit" || signInErr.status === 429
                ? "Too many sign-in attempts. Wait a few minutes and try again."
                : signInErr.name === "AuthRetryableFetchError" || signInErr.status === 0 || sm.includes("fetch") || sm.includes("network")
                  ? "Could not reach the server. Check your internet connection and try again."
                  : `Couldn't sign in. The service said: "${signInErr.message}".`,
      );
      return;
    }
    // The account must hold a role for the tab they chose.
    let landing = "/";
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        const held = ((roleRows as { role: string }[] | null) || []).map((r) => r.role);
        const match = held.find((r) => (AUDIENCE_ROLES[audience] as string[]).includes(r));
        if (held.length > 0 && !match) {
          await supabase.auth.signOut();
          setFinishing(false);
          const right = audienceFor(held);
          const label = AUDIENCES.find((a) => a.id === right)?.label;
          setWrongTab(right);
          setError(
            label
              ? `This is a ${label.toLowerCase()} account, so it can't sign in here as a ${current.label.toLowerCase()}. Choose "${label}" above, then sign in again.`
              : "This account can't sign in here. Contact the school office.",
          );
          return;
        }
        if (match) landing = dashboardPathForRole(match as LearnRole);
      }
    } catch {
      // Fall through: the portal's own role checks still apply on every page.
    }
    // A pupil with a temporary password has to choose their own before anything else.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: row } = await supabase.from("student_logins").select("must_change_password").eq("profile_id", uid).maybeSingle();
        if ((row as { must_change_password: boolean } | null)?.must_change_password) {
          router.replace("/login/change-password");
          return;
        }
      }
    } catch {
      // Fall through: the change-password page is also reachable by hand and the check repeats at next sign-in.
    }
    setFinishing(false);
    router.replace(landing);
  }

  return (
    <section className="app-pad">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-gold-light bg-white shadow-warm lg:grid-cols-[1fr_1.1fr]">
        {/* Brand panel: welcome and what the portal is for. */}
        <div className="geo-texture relative hidden flex-col justify-between bg-ink-900 p-10 text-cream lg:flex">
          <div>
            <p className="font-serif text-3xl font-semibold leading-tight text-white">
              Assalamu alaykum.
              <br />
              <span className="text-gold-300">Welcome back.</span>
            </p>
            <p className="mt-4 max-w-xs text-sm text-cream/80">
              Lessons, homework, Qur&apos;an progress and your Weekly Tarbiyah Note, all in one place.
            </p>
          </div>
          <ul className="mt-10 space-y-2 text-sm text-cream/80">
            {["Join today's live lessons", "See homework and feedback", "Messages between home and school"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Sign-in form. */}
        <div className="p-6 sm:p-10">
          <h1 className="font-serif text-h2 font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink/70">Choose who&apos;s signing in.</p>

          <div role="radiogroup" aria-label="I am a" className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-cream p-1">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={audience === a.id}
                onClick={() => {
                  setAudience(a.id);
                  setWrongTab(null);
                  setError(null);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  audience === a.id ? "bg-white text-ink shadow-sm ring-1 ring-gold-300" : "text-ink/70 hover:text-ink"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-ink">
              {current.field}
              <input
                type="text"
                inputMode={audience === "student" ? "text" : "email"}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={current.placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
              />
            </label>
            <PasswordInput label="Password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && (
              <div role="alert" className="text-sm text-red-700">
                <p>{error}</p>
                {wrongTab && wrongTab !== audience && (
                  <button
                    type="button"
                    onClick={() => {
                      setAudience(wrongTab);
                      setWrongTab(null);
                      setError(null);
                    }}
                    className="mt-1 font-semibold text-gold-700 underline underline-offset-2"
                  >
                    Switch to {AUDIENCES.find((a) => a.id === wrongTab)?.label} sign-in
                  </button>
                )}
              </div>
            )}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {audience !== "student" && (
            <Link href="/login/forgot" className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
              Forgotten your password?
            </Link>
          )}
          <p className="mt-4 text-xs text-ink/70">{current.hint}</p>
          <p className="mt-6 border-t border-gold-light/60 pt-4 text-xs text-ink/70">
            Not a family with us yet?{" "}
            <a href={`${MAIN_SITE_ORIGIN}/admissions/`} className="font-semibold text-gold-700 underline">
              Apply for January 2027
            </a>
            <span className="mx-2 text-ink/30">·</span>
            <Link href="/install" className="font-semibold text-gold-700 underline">
              Get the app
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
