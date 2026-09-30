"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { Card } from "@/components/learn/Card";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";

/**
 * Starts (or rejoins) the in-house video call for a booking — same
 * BigBlueButton system already running lessons, including native
 * moderator breakout rooms, rather than the old external Teams-link
 * workaround. Returns a role-scoped join URL the caller opens directly;
 * see supabase/functions/booking-join.
 */
async function startBookingCall(bookingId: string): Promise<{ ok: boolean; joinUrl?: string; error?: string }> {
  const supabase = getSupabaseClient();
  const url = getEdgeFunctionUrl("booking-join");
  if (!supabase || !url) return { ok: false, error: "not_configured" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ booking_id: bookingId }),
  });
  return res.json();
}

type StaffRow = { id: string; profile_id: string; display_name: string; role_title: string; teams_meeting_url: string | null; bookable: boolean };
type BookingRow = { id: string; starts_at: string; ends_at: string; status: string; contact_name: string | null; contact_email: string | null; notes: string | null };
type AvailabilityRule = { id: string; weekday: number; start_time: string; end_time: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Direct replacement for the booking/availability half of the old
 * src/components/staff/StaffApp.tsx (Teams link, bookable toggle, weekly
 * availability, bookings list + CSV export) — the old /staff route redirects
 * here once this is confirmed working (see public/.htaccess's comment on
 * that redirect, currently held back specifically until this page existed).
 *
 * StaffApp.tsx only ever showed this to non-teacher staff (teachers got a
 * placeholder "your dashboard will live here" screen instead) — this page's
 * own gate (head_teacher/admin/admissions) is a faithful continuation of
 * that same population, not a new restriction.
 *
 * "All staff" is genuinely new: StaffApp.tsx only ever showed someone their
 * OWN row. RLS already supports this without any migration — checked, not
 * assumed: staff_members/availability_rules/bookings all have an existing
 * "admin manage/update all" policy keyed off profiles.role = 'admin', and
 * learn-invite's legacyProfileRole() already maps head_teacher/admin/
 * admissions to that same legacy value on every invite.
 */
function StaffAvailabilityEditor({ staff, onStaffUpdated }: { staff: StaffRow; onStaffUpdated: (s: StaffRow) => void }) {
  const supabase = getSupabaseClient();
  const [teamsUrl, setTeamsUrl] = useState(staff.teams_meeting_url || "");
  const [savingTeamsUrl, setSavingTeamsUrl] = useState(false);
  const [savingBookable, setSavingBookable] = useState(false);
  const [bookableError, setBookableError] = useState<string | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("staff_id", staff.id)
      .eq("meeting_type", "admissions")
      .order("weekday", { ascending: true })
      .then(({ data }) => setRules((data as AvailabilityRule[]) || []));
  }, [supabase, staff.id]);

  async function saveTeamsUrl() {
    if (!supabase) return;
    setSavingTeamsUrl(true);
    const { error } = await supabase.from("staff_members").update({ teams_meeting_url: teamsUrl }).eq("id", staff.id);
    setSavingTeamsUrl(false);
    if (!error) onStaffUpdated({ ...staff, teams_meeting_url: teamsUrl });
  }

  async function toggleBookable(next: boolean) {
    if (!supabase) return;
    setBookableError(null);
    setSavingBookable(true);
    const { error } = await supabase.from("staff_members").update({ bookable: next }).eq("id", staff.id);
    setSavingBookable(false);
    if (error) {
      setBookableError("Couldn't update this setting. Please try again.");
      return;
    }
    onStaffUpdated({ ...staff, bookable: next });
  }

  async function addRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const form = new FormData(e.currentTarget);
    const { data } = await supabase
      .from("availability_rules")
      .insert({ staff_id: staff.id, meeting_type: "admissions", weekday: Number(form.get("weekday")), start_time: form.get("start_time"), end_time: form.get("end_time") })
      .select()
      .single();
    if (data) setRules((r) => [...(r || []), data as AvailabilityRule].sort((a, b) => a.weekday - b.weekday));
    e.currentTarget.reset();
  }

  async function removeRule(id: string) {
    if (!supabase) return;
    await supabase.from("availability_rules").delete().eq("id", id);
    setRules((r) => (r || []).filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-ink">
          Teams meeting link
          <div className="mt-1 flex max-w-lg gap-2">
            <input value={teamsUrl} onChange={(e) => setTeamsUrl(e.target.value)} type="url" placeholder="https://teams.microsoft.com/…" className="flex-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <button type="button" onClick={saveTeamsUrl} disabled={savingTeamsUrl} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 hover:brightness-95 disabled:opacity-50">
              Save
            </button>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-gold-light/50 bg-cream/40 p-3">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" checked={staff.bookable === true} disabled={savingBookable} onChange={(e) => toggleBookable(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Show on the public admissions booking page</span>
            <span className="mt-1 block text-xs text-ink/60">Visitors can only book calls with this person while this is on. Availability below is saved either way.</span>
          </span>
        </label>
        {bookableError && <p role="alert" className="mt-2 text-xs text-red-700">{bookableError}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-ink">Weekly availability (admissions calls)</p>
        <ul className="mt-2 space-y-1.5">
          {rules === null && <li className="text-sm text-ink/60">Loading…</li>}
          {(rules || []).map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-gold-light/50 bg-white px-3 py-1.5 text-sm">
              <span>
                {WEEKDAYS[r.weekday]}, {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} (UK time)
              </span>
              <button type="button" onClick={() => removeRule(r.id)} className="text-xs text-red-700">
                Remove
              </button>
            </li>
          ))}
          {rules?.length === 0 && <li className="text-sm text-ink/60">No weekly availability set yet.</li>}
        </ul>
        <form onSubmit={addRule} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink">
            Day
            <select name="weekday" className="mt-1 block rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm">
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink">
            From
            <input name="start_time" type="time" required defaultValue="09:00" className="mt-1 block rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-ink">
            To
            <input name="end_time" type="time" required defaultValue="15:00" className="mt-1 block rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:brightness-95">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

function StaffBookingsPanel({ staffId }: { staffId: string }) {
  const supabase = getSupabaseClient();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [callState, setCallState] = useState<Record<string, "starting" | "error">>({});

  async function joinCall(bookingId: string) {
    setCallState((s) => ({ ...s, [bookingId]: "starting" }));
    const result = await startBookingCall(bookingId);
    setCallState((s) => {
      const next = { ...s };
      delete next[bookingId];
      return next;
    });
    if (result.ok && result.joinUrl) {
      window.open(result.joinUrl, "_blank", "noopener");
    } else {
      setCallState((s) => ({ ...s, [bookingId]: "error" }));
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("bookings")
      .select("id, starts_at, ends_at, status, contact_name, contact_email, notes")
      .eq("staff_id", staffId)
      .order("starts_at", { ascending: true })
      .then(({ data }) => setBookings((data as BookingRow[]) || []));
  }, [supabase, staffId]);

  async function setOutcome(bookingId: string, status: string) {
    if (!supabase) return;
    await supabase.from("bookings").update({ status }).eq("id", bookingId);
    setBookings((b) => (b || []).map((x) => (x.id === bookingId ? { ...x, status } : x)));
  }

  function exportCsv() {
    const header = "starts_at,ends_at,status,contact_name,contact_email,notes\n";
    const rows = (bookings || [])
      .map((b) => [b.starts_at, b.ends_at, b.status, b.contact_name, b.contact_email, (b.notes || "").replace(/\n/g, " ")].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bookings.csv";
    a.click();
  }

  if (bookings === null) return <p className="text-sm text-ink/60">Loading…</p>;

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.starts_at) >= now && b.status === "confirmed");
  const past = bookings.filter((b) => new Date(b.starts_at) < now || b.status !== "confirmed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Upcoming bookings</p>
        <button type="button" onClick={exportCsv} className="rounded-full border border-gold-500 px-3 py-1 text-xs font-medium text-gold-700 hover:bg-cream">
          Export CSV
        </button>
      </div>
      <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
        {upcoming.length === 0 && <li className="p-3 text-sm text-ink/60">No upcoming bookings.</li>}
        {upcoming.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="text-sm font-medium text-ink">{new Date(b.starts_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</p>
              <p className="text-xs text-ink/60">
                {b.contact_name} — {b.contact_email}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {callState[b.id] === "error" && <span className="text-xs text-red-700">Couldn&apos;t start the call — try again.</span>}
              <button
                type="button"
                onClick={() => joinCall(b.id)}
                disabled={callState[b.id] === "starting"}
                className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {callState[b.id] === "starting" ? "Starting…" : "Start call"}
              </button>
              <button type="button" onClick={() => setOutcome(b.id, "completed")} className="rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">
                Mark completed
              </button>
              <button type="button" onClick={() => setOutcome(b.id, "no_show")} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50">
                No-show
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm font-medium text-ink">Past &amp; other bookings</p>
      <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
        {past.length === 0 && <li className="p-3 text-sm text-ink/60">Nothing here yet.</li>}
        {past.map((b) => (
          <li key={b.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {new Date(b.starts_at).toLocaleDateString("en-GB")} — {b.contact_name}
            </span>
            <span className="text-ink/60">{b.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyAvailability() {
  const { session } = useLearnSession();
  const supabase = getSupabaseClient();
  const [staff, setStaff] = useState<StaffRow | null | "none">(null);

  useEffect(() => {
    if (!supabase || !session || session === "loading") return;
    supabase
      .from("staff_members")
      .select("id, profile_id, display_name, role_title, teams_meeting_url, bookable")
      .eq("profile_id", session.user.id)
      .single()
      .then(({ data }) => setStaff((data as StaffRow) || "none"));
  }, [supabase, session]);

  if (staff === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (staff === "none") {
    return (
      <Card title="My availability">
        <p className="text-sm text-ink/60">
          No staff record is linked to your account yet, so there&apos;s nothing to show here. If you take admissions calls, ask
          another admin to set this up.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="My availability">
        <StaffAvailabilityEditor staff={staff} onStaffUpdated={setStaff} />
      </Card>
      <Card title="My bookings">
        <StaffBookingsPanel staffId={staff.id} />
      </Card>
    </div>
  );
}

function AllStaff() {
  const supabase = getSupabaseClient();
  const [staffList, setStaffList] = useState<StaffRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("staff_members")
      .select("id, profile_id, display_name, role_title, teams_meeting_url, bookable")
      .order("display_name", { ascending: true })
      .then(({ data }) => setStaffList((data as StaffRow[]) || []));
  }, [supabase]);

  const updateStaffInList = (updated: StaffRow) => {
    setStaffList((list) => (list || []).map((s) => (s.id === updated.id ? updated : s)));
  };

  return (
    <Card title="All staff" description="Manage any staff member's admissions availability, bookable status, or Teams link — e.g. while covering for someone on leave.">
      {staffList === null && <p className="text-sm text-ink/60">Loading…</p>}
      {staffList?.length === 0 && <p className="text-sm text-ink/60">No staff records yet.</p>}
      <ul className="space-y-2">
        {(staffList || []).map((s) => (
          <li key={s.id} className="rounded-xl border border-gold-light/50">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span>
                <span className="text-sm font-medium text-ink">{s.display_name}</span>
                <span className="ml-2 text-xs text-ink/50">{s.role_title}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${s.bookable ? "bg-green-600" : "bg-ink/30"}`} aria-hidden="true" />
                <span className="text-xs text-ink/50">{s.bookable ? "Bookable" : "Not bookable"}</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-3.5 w-3.5 text-ink/40 transition-transform ${expandedId === s.id ? "rotate-180" : ""}`}>
                  <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {expandedId === s.id && (
              <div className="border-t border-gold-light/40 p-4">
                <StaffAvailabilityEditor staff={s} onStaffUpdated={updateStaffInList} />
                <div className="mt-6 border-t border-gold-light/40 pt-4">
                  <StaffBookingsPanel staffId={s.id} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AdmissionsContent() {
  const { roles } = useLearnSession();
  const canManageOthers = roles.some((r) => r.role === "head_teacher" || r.role === "admin" || r.role === "admissions");
  const [tab, setTab] = useState<"mine" | "all">("mine");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Admissions</h1>
        <p className="mt-1 text-sm text-ink/60">Manage admissions-call availability, bookable status, and bookings.</p>
      </div>

      {canManageOthers && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`rounded-full px-4 py-1.5 font-medium ${tab === "mine" ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
          >
            My availability
          </button>
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-full px-4 py-1.5 font-medium ${tab === "all" ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
          >
            All staff
          </button>
        </div>
      )}

      {tab === "mine" ? <MyAvailability /> : <AllStaff />}
    </div>
  );
}

export default function AdminAdmissionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <AdmissionsContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
