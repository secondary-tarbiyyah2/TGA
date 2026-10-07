"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPasswordError } from "@/lib/learn/passwordRules";
import { AdminStaffPanel } from "./AdminStaffPanel";

type StaffRow = { id: string; display_name: string; role_title: string; teams_meeting_url: string | null; bookable?: boolean };
type BookingRow = {
  id: string; starts_at: string; ends_at: string; status: string;
  contact_name: string | null; contact_email: string | null; notes: string | null;
};
type AvailabilityRule = { id: string; weekday: number; start_time: string; end_time: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SignIn() {
  // Password sign-in first: magic-link email delivery is currently broken
  // (Resend sending-domain isn't verified), so password is the only option
  // that actually works right now. Both stay available — once email is
  // fixed, magic link works again with no code change needed.
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // invalid_credentials covers both "wrong password" and "no such
      // account" (Supabase deliberately doesn't distinguish, to avoid
      // leaking which emails exist) — anything else is a real error
      // (network, rate limit, etc.) and shouldn't be misreported as that.
      setError(
        error.code === "invalid_credentials"
          ? "Incorrect email or password. If you were recently given a temporary password, check it wasn't already changed."
          : `Couldn't sign in: ${error.message}`,
      );
    }
  }

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // shouldCreateUser: false is the whole "invite-only, no public sign-up"
    // mechanism — Supabase Auth refuses to send a link for an email with no
    // existing auth.users account, no custom check needed.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setError("Something went wrong. If you're expecting staff access, contact an admin.");
    else setSent(true);
  }

  if (sent) {
    return <p className="text-ink/75">Check your email for a sign-in link.</p>;
  }

  return (
    <div className="max-w-sm">
      <div className="mb-4 flex gap-2 text-sm">
        <button type="button" onClick={() => setMode("password")} className={`rounded-full px-3 py-1 ${mode === "password" ? "bg-gold-500 text-ink-900" : "text-ink/60 underline"}`}>
          Password
        </button>
        <button type="button" onClick={() => setMode("link")} className={`rounded-full px-3 py-1 ${mode === "link" ? "bg-gold-500 text-ink-900" : "text-ink/60 underline"}`}>
          Email link
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit}>
          <label className="block text-sm font-medium text-ink">
            Staff email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink">
            Password
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <button type="submit" className="mt-4 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
            Sign in
          </button>
        </form>
      ) : (
        <form onSubmit={handleLinkSubmit}>
          <label className="block text-sm font-medium text-ink">
            Staff email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <button type="submit" className="mt-4 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
            Send sign-in link
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs text-ink/50">
        Staff accounts are created by an admin — this only works for emails already on file.
      </p>
    </div>
  );
}

function ForcePasswordChange({ userId, onDone }: { userId: string; onDone: () => void }) {
  const supabase = getSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // True once auth.updateUser has actually succeeded — lets a failed retry
  // below skip re-submitting the password (which would just no-op) and go
  // straight to the flag update, instead of asking for it again.
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!passwordChanged) {
      if (password.length < 8) {
        setError("Use at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
    }
    if (!supabase) return;
    setBusy(true);
    if (!passwordChanged) {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setBusy(false);
        setError(friendlyPasswordError(updateErr, "change"));
        return;
      }
      setPasswordChanged(true);
    }
    // Password is already changed at this point either way — a failure here
    // only means the "ask again next time" flag didn't clear, so it's safe
    // (and necessary) to let the user retry just this part without
    // re-entering a password that's already set.
    const { error: flagErr } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", userId);
    setBusy(false);
    if (flagErr) {
      setError("Your password was changed, but we couldn't finish updating your account — please try again.");
      return;
    }
    onDone();
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-gold-500/40 bg-gold-50 p-6">
      <h2 className="font-serif text-lg font-semibold text-ink">Set a new password</h2>
      <p className="mt-1 text-sm text-ink/70">You&apos;re signing in with a temporary password — choose a new one to continue.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-ink">
          New password
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Confirm password
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
          {busy ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}

function TeacherDashboard({ staff }: { staff: StaffRow }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-serif font-semibold text-ink">Welcome, {staff.display_name}.</h1>
        <p className="text-ink/60">{staff.role_title}</p>
      </div>
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <p className="text-ink/75">
          Your teacher dashboard — lessons, homework, attendance and grades will live here once the Learning
          Platform is built. For now this confirms your account is set up correctly with teacher access.
        </p>
      </div>
    </div>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [staff, setStaff] = useState<StaffRow | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [teamsUrl, setTeamsUrl] = useState("");
  const [savingTeamsUrl, setSavingTeamsUrl] = useState(false);
  const [savingBookable, setSavingBookable] = useState(false);
  const [bookableError, setBookableError] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);

  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) return;
    supabase.from("profiles").select("role, must_change_password").eq("id", session.user.id).single().then(({ data }) => {
      if (data) {
        setProfileRole(data.role);
        setMustChangePassword(data.must_change_password);
      }
    });
  }, [supabase, session.user.id]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("staff_members")
      .select("id, display_name, role_title, teams_meeting_url, bookable")
      .eq("profile_id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setStaff(data);
          setTeamsUrl(data.teams_meeting_url || "");
        }
      });
  }, [supabase, session.user.id]);

  useEffect(() => {
    if (!supabase || !staff) return;
    supabase
      .from("bookings")
      .select("id, starts_at, ends_at, status, contact_name, contact_email, notes")
      .eq("staff_id", staff.id)
      .order("starts_at", { ascending: true })
      .then(({ data }) => setBookings(data || []));
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("staff_id", staff.id)
      .eq("meeting_type", "admissions")
      .order("weekday", { ascending: true })
      .then(({ data }) => setRules(data || []));
  }, [supabase, staff]);

  async function saveTeamsUrl() {
    if (!supabase || !staff) return;
    setSavingTeamsUrl(true);
    await supabase.from("staff_members").update({ teams_meeting_url: teamsUrl }).eq("id", staff.id);
    setSavingTeamsUrl(false);
  }

  // The public booking page only lists staff whose `bookable` flag is true
  // (the bookable_staff view). Nothing else in the app ever sets it, so
  // without this switch saved availability is never shown to visitors.
  async function toggleBookable(next: boolean) {
    if (!supabase || !staff) return;
    setBookableError(null);
    setSavingBookable(true);
    const { error } = await supabase.from("staff_members").update({ bookable: next }).eq("id", staff.id);
    setSavingBookable(false);
    if (error) {
      setBookableError("Couldn't update this setting. Please try again, or ask an admin.");
      return;
    }
    setStaff({ ...staff, bookable: next });
  }

  async function addRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !staff) return;
    const form = new FormData(e.currentTarget);
    const { data } = await supabase
      .from("availability_rules")
      .insert({
        staff_id: staff.id,
        meeting_type: "admissions",
        weekday: Number(form.get("weekday")),
        start_time: form.get("start_time"),
        end_time: form.get("end_time"),
      })
      .select()
      .single();
    if (data) setRules((r) => [...r, data].sort((a, b) => a.weekday - b.weekday));
    e.currentTarget.reset();
  }

  async function removeRule(id: string) {
    if (!supabase) return;
    await supabase.from("availability_rules").delete().eq("id", id);
    setRules((r) => r.filter((x) => x.id !== id));
  }

  async function setOutcome(bookingId: string, status: string) {
    if (!supabase) return;
    await supabase.from("bookings").update({ status }).eq("id", bookingId);
    setBookings((b) => b.map((x) => (x.id === bookingId ? { ...x, status } : x)));
  }

  function exportCsv() {
    const header = "starts_at,ends_at,status,contact_name,contact_email,notes\n";
    const rows = bookings
      .map((b) => [b.starts_at, b.ends_at, b.status, b.contact_name, b.contact_email, (b.notes || "").replace(/\n/g, " ")].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bookings.csv";
    a.click();
  }

  if (!staff) return <p className="text-ink/60">Loading your staff profile…</p>;
  if (mustChangePassword) return <ForcePasswordChange userId={session.user.id} onDone={() => setMustChangePassword(false)} />;

  if (profileRole === "teacher") {
    return <TeacherDashboard staff={staff} />;
  }

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.starts_at) >= now && b.status === "confirmed");
  const past = bookings.filter((b) => new Date(b.starts_at) < now || b.status !== "confirmed");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-h2 font-serif font-semibold text-ink">Welcome, {staff.display_name}.</h1>
        <p className="text-ink/60">{staff.role_title}</p>
      </div>

      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">My Teams meeting link</h2>
        <div className="mt-2 flex max-w-lg gap-2">
          <input value={teamsUrl} onChange={(e) => setTeamsUrl(e.target.value)} type="url" placeholder="https://teams.microsoft.com/..." className="flex-1 rounded-lg border border-gold-light/60 px-3 py-2" />
          <button type="button" onClick={saveTeamsUrl} disabled={savingTeamsUrl} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:brightness-95">
            Save
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">Upcoming bookings</h2>
          <button type="button" onClick={exportCsv} className="rounded-full border border-gold-500 px-4 py-2 text-xs font-medium text-gold-700 hover:bg-cream">Export CSV</button>
        </div>
        <ul className="mt-3 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {upcoming.length === 0 && <li className="p-4 text-sm text-ink/60">No upcoming bookings.</li>}
          {upcoming.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium text-ink">{new Date(b.starts_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</p>
                <p className="text-sm text-ink/60">{b.contact_name} — {b.contact_email}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOutcome(b.id, "completed")} className="rounded-full border border-gold-500 px-3 py-1.5 text-xs text-gold-700 hover:bg-cream">Mark completed</button>
                <button type="button" onClick={() => setOutcome(b.id, "no_show")} className="rounded-full border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">No-show</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">Past &amp; other bookings</h2>
        <ul className="mt-3 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {past.length === 0 && <li className="p-4 text-sm text-ink/60">Nothing here yet.</li>}
          {past.map((b) => (
            <li key={b.id} className="flex items-center justify-between p-4 text-sm">
              <span>{new Date(b.starts_at).toLocaleDateString("en-GB")} — {b.contact_name}</span>
              <span className="text-ink/60">{b.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">Weekly availability (admissions calls)</h2>
        <div className="mt-3 max-w-xl rounded-lg border border-gold-light/50 bg-white p-4">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={staff.bookable === true}
              disabled={savingBookable}
              onChange={(e) => toggleBookable(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Show me on the public admissions booking page</span>
              <span className="mt-1 block text-ink/60">
                Visitors can only book calls with you while this is on. Your weekly availability below is saved either way.
              </span>
            </span>
          </label>
          {staff.bookable !== true && rules.length > 0 && (
            <p role="status" className="mt-3 text-sm text-red-700">
              Your availability is saved, but visitors can&apos;t see or book it until you turn this on.
            </p>
          )}
          {bookableError && <p role="alert" className="mt-3 text-sm text-red-700">{bookableError}</p>}
        </div>
        <ul className="mt-3 space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-gold-light/50 bg-white px-4 py-2 text-sm">
              <span>{WEEKDAYS[r.weekday]}, {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} (UK time)</span>
              <button type="button" onClick={() => removeRule(r.id)} className="text-xs text-red-700">Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addRule} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink">
            Day
            <select name="weekday" className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2">
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="text-sm text-ink">
            From
            <input name="start_time" type="time" required defaultValue="09:00" className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="text-sm text-ink">
            To
            <input name="end_time" type="time" required defaultValue="15:00" className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <button type="submit" className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:brightness-95">Add</button>
        </form>
      </section>

      {profileRole === "admin" && (
        <section>
          <h2 className="font-serif text-lg font-semibold text-ink">Admin</h2>
          <p className="mt-1 text-sm text-ink/60">Manage staff accounts, roles and see recent activity.</p>
          <div className="mt-4">
            <AdminStaffPanel />
          </div>
        </section>
      )}
    </div>
  );
}

function TeachersOnlyAdminGate({ session }: { session: Session }) {
  const supabase = getSupabaseClient();
  const [profileRole, setProfileRole] = useState<string | null | "loading">("loading");
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("profiles").select("role, must_change_password").eq("id", session.user.id).single().then(({ data }) => {
      if (data) {
        setProfileRole(data.role);
        setMustChangePassword(data.must_change_password);
      } else {
        setProfileRole(null);
      }
    });
  }, [supabase, session.user.id]);

  if (profileRole === "loading") return <p className="text-ink/60">Loading…</p>;
  if (mustChangePassword) return <ForcePasswordChange userId={session.user.id} onDone={() => setMustChangePassword(false)} />;
  if (profileRole !== "admin") {
    return <p className="text-ink/60">This page is only available to admin accounts.</p>;
  }
  return (
    <div>
      <h1 className="text-h2 font-serif font-semibold text-ink">Teacher accounts</h1>
      <p className="mt-2 text-ink/60">Create and manage teacher accounts. Teachers signing in land on their own dashboard, not this one.</p>
      <div className="mt-6">
        <AdminStaffPanel roleFilter="teacher" defaultInviteRole="teacher" />
      </div>
    </div>
  );
}

export function StaffApp({ view = "dashboard" }: { view?: "dashboard" | "teachers" }) {
  const [session, setSession] = useState<Session | null | "loading">("loading");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- whether Supabase is configured is only known post-mount
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === "loading") return <p className="text-ink/60">Loading…</p>;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <p className="text-ink/60">Staff area isn&apos;t connected yet.</p>;
  if (!session) return <SignIn />;
  if (view === "teachers") return <TeachersOnlyAdminGate session={session} />;
  return <Dashboard session={session} />;
}
