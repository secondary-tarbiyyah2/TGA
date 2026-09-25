"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

type StaffRow = { id: string; display_name: string; role_title: string; teams_meeting_url: string | null };
type BookingRow = {
  id: string; starts_at: string; ends_at: string; status: string;
  contact_name: string | null; contact_email: string | null; notes: string | null;
};
type AvailabilityRule = { id: string; weekday: number; start_time: string; end_time: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
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
    <form onSubmit={handleSubmit} className="max-w-sm">
      <label className="block text-sm font-medium text-ink">
        Staff email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
      </label>
      <button type="submit" className="mt-4 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
        Send sign-in link
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs text-ink/50">
        Staff accounts are created by an admin — this only works for emails already on file.
      </p>
    </form>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [staff, setStaff] = useState<StaffRow | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [teamsUrl, setTeamsUrl] = useState("");
  const [savingTeamsUrl, setSavingTeamsUrl] = useState(false);

  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("staff_members")
      .select("id, display_name, role_title, teams_meeting_url")
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
    </div>
  );
}

export function StaffApp() {
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
  return <Dashboard session={session} />;
}
