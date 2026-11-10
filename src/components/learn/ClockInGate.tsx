"use client";

import { Loading } from "@/components/learn/kit";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { STAFF_ROLES, useLearnSignOut, type LearnRole, type RoleGrant } from "@/lib/learn/session";
import { normalisePortalPath } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";

/** Fired on window whenever someone clocks in or out, so the gate and the
 * header chip (separate component trees) stay in step. */
export const CLOCK_EVENT = "tga:clock-changed";

/** Pages that are never gated: account recovery and safeguarding must always open. */
/** No mouse, keyboard or touch for this long and the portal stops counting the time. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;

const EXEMPT_PATHS = ["/account", "/report-concern"];

type Policy = { require_clock_in: boolean; clock_in_roles: string[]; auto_clock_out_hours: number };
type OpenShift = { id: string; clocked_in_at: string; note: string | null };

export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function formatHours(ms: number): string {
  return `${(Math.max(0, ms) / 3600000).toFixed(1)} h`;
}

function useClockState(userId: string, roles: RoleGrant[]) {
  const [loaded, setLoaded] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [shift, setShift] = useState<OpenShift | null>(null);
  const [failed, setFailed] = useState(false);

  const isStaff = roles.some((r) => STAFF_ROLES.includes(r.role));

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !isStaff) {
      setLoaded(true);
      return;
    }
    try {
      // Tidy up forgotten shifts first; a failure here is not fatal.
      await supabase.rpc("close_stale_shifts");
      const pol = await supabase.rpc("clock_in_policy");
      if (pol.error) throw pol.error;
      const rawPol = pol.data as Policy[] | Policy | null;
      const p = Array.isArray(rawPol) ? rawPol[0] || null : rawPol;
      const sh = await supabase
        .from("staff_shifts")
        .select("id, clocked_in_at, note")
        .eq("user_id", userId)
        .is("clocked_out_at", null)
        .maybeSingle();
      if (sh.error) throw sh.error;
      setPolicy(p);
      setShift((sh.data as OpenShift | null) || null);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoaded(true);
  }, [userId, isStaff]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the clock-in state when the page opens
    load();
    const onChange = () => {
      load();
    };
    window.addEventListener(CLOCK_EVENT, onChange);
    const t = window.setInterval(onChange, 5 * 60 * 1000);
    return () => {
      window.removeEventListener(CLOCK_EVENT, onChange);
      window.clearInterval(t);
    };
  }, [load]);

  // While a shift is open, tell the server every minute that the portal is
  // still open (0099). Closing the last tab stops this, and the shift is then
  // closed at the last heartbeat; a refresh or a second tab changes nothing.
  const shiftId = shift?.id || null;
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !shiftId) return;
    // Only count the portal as "in use" while someone is actually using it: a tab left open
    // overnight stops refreshing the shift, which then closes at the last real activity.
    let lastActive = Date.now();
    const bump = () => {
      lastActive = Date.now();
    };
    const events = ["pointerdown", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const beat = () => {
      const active = Date.now() - lastActive < IDLE_LIMIT_MS;
      void supabase.rpc("shift_heartbeat", { p_active: active }).then(({ error }) => {
        // The old one-argument-free version is still live until migration 0104 is applied.
        if (error && active) void supabase.rpc("shift_heartbeat");
      });
    };
    beat();
    const t = window.setInterval(beat, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [shiftId, load]);

  const myRoles: LearnRole[] = roles.map((r) => r.role);
  const required = !!policy && policy.require_clock_in && myRoles.some((r) => policy.clock_in_roles.includes(r));
  return { loaded, isStaff, policy, shift, failed, required, reload: load };
}

async function clockIn(userId: string, note: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  // Resumes the shift if it was closed for inactivity in the last 15 minutes (migration 0104).
  let { error } = await supabase.rpc("clock_in_or_resume", { p_note: note.trim() || null });
  // Until migration 0104 is live the function does not exist: clock in the plain way instead of failing.
  if (error && (error.code === "PGRST202" || error.code === "42883" || /clock_in_or_resume|schema cache/i.test(error.message || ""))) {
    ({ error } = await supabase.from("staff_shifts").insert({ user_id: userId, note: note.trim() || null }));
  }
  // 23505: already has an open shift (e.g. another tab) - that's fine.
  if (error && error.code !== "23505") return "Couldn't clock you in. Check your connection and try again.";
  window.dispatchEvent(new Event(CLOCK_EVENT));
  return null;
}

async function clockOut(shift: OpenShift, note: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  const extra = note.trim();
  const merged = extra ? (shift.note ? `${shift.note} | out: ${extra}` : `out: ${extra}`) : shift.note;
  const { error } = await supabase
    .from("staff_shifts")
    .update({ clocked_out_at: new Date().toISOString(), note: merged })
    .eq("id", shift.id)
    .is("clocked_out_at", null);
  if (error) return "Couldn't clock you out. Try again.";
  window.dispatchEvent(new Event(CLOCK_EVENT));
  return null;
}

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}

function GateScreen({ userId, signedInName }: { userId: string; signedInName: string | null }) {
  const signOut = useLearnSignOut();
  const now = useNow(1000);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = signedInName ? signedInName.split(" ")[0] : null;

  const go = async () => {
    setBusy(true);
    setError(null);
    const err = await clockIn(userId, note);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center py-10">
      <div className="w-full max-w-md rounded-2xl border border-gold-light bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-sm font-medium text-ink/65">
          {greeting}
          {first ? `, ${first}` : ""}
        </p>
        <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-ink sm:text-6xl" aria-live="off">
          {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
        <p className="mt-1 text-sm text-ink/65">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="mt-6 text-sm text-ink/75">You need to clock in before you can use the portal.</p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          maxLength={200}
          className="mt-4 w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
          aria-label="Note (optional)"
        />
        <button
          type="button"
          disabled={busy}
          onClick={go}
          className="mt-4 w-full rounded-xl bg-gold-500 px-6 py-4 text-lg font-semibold text-ink shadow-sm hover:bg-gold-700 hover:text-white disabled:opacity-60"
        >
          {busy ? "Clocking in…" : "Clock in"}
        </button>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <button type="button" onClick={signOut} className="mt-6 text-sm text-ink/65 underline hover:text-ink">
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * Staff who must clock in see this instead of the page until they do.
 * UX gate only (shifts themselves are RLS-protected). Fails open on
 * network/db errors so nobody is locked out by an outage.
 */
export function ClockInGate({ userId, roles, children }: { userId: string; roles: RoleGrant[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const { loaded, isStaff, shift, failed, required, reload } = useClockState(userId, roles);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !isStaff) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setName((data as { full_name?: string } | null)?.full_name || null));
  }, [userId, isStaff]);

  const p = normalisePortalPath(pathname);
  const exempt = EXEMPT_PATHS.some((x) => p === x || p.startsWith(x + "/"));

  if (!isStaff || exempt) return <>{children}</>;
  if (!loaded) return <Loading label="Loading…" bare />;
  if (!failed && required && !shift) return <GateScreen userId={userId} signedInName={name} />;

  return (
    <>
      {failed && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>We couldn&apos;t check your clock-in status, so the portal is open for now.</span>
          <button type="button" onClick={() => reload()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}
      {children}
    </>
  );
}

/** Header pill: elapsed time with a clock-out popover, or a quiet clock-in button. */
export function ClockChip({ userId, roles }: { userId: string; roles: RoleGrant[] }) {
  const { loaded, isStaff, shift, failed, required } = useClockState(userId, roles);
  const now = useNow(30000);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isStaff || !loaded || failed) return null;

  if (!shift) {
    // The gate is showing its own big button.
    if (required) return null;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await clockIn(userId, "");
          setBusy(false);
        }}
        aria-label="Clock in"
        title="Clock in"
        className="flex h-9 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-gold-light px-2 text-sm font-medium text-ink/70 hover:bg-cream disabled:opacity-50 sm:px-3"
      >
        <Icon name="clock" className="h-4 w-4 sm:hidden" />
        <span className="hidden sm:inline">Clock in</span>
      </button>
    );
  }

  const elapsed = formatDuration(now.getTime() - new Date(shift.clocked_in_at).getTime());
  const out = async () => {
    setBusy(true);
    setError(null);
    const err = await clockOut(shift, note);
    setBusy(false);
    if (err) setError(err);
    else {
      setOpen(false);
      setNote("");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="You are clocked in"
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-100 px-3 text-sm font-medium tabular-nums text-teal-900 hover:bg-teal-100/70"
      >
        <span aria-hidden="true" className="text-teal-500">
          ●
        </span>
        <span className="hidden sm:inline">Clocked in</span> {elapsed}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Clock out" className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-gold-light bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-ink">
              Clocked in at {new Date(shift.clocked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-xs text-ink/65">{elapsed} so far. Closing the portal clocks you out automatically within a few minutes. Clocking out locks the portal until you clock in again.</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={200}
              aria-label="Clock-out note (optional)"
              className="mt-3 w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
            />
            {error && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm text-ink/75 hover:bg-cream">
                Stay clocked in
              </button>
              <button type="button" disabled={busy} onClick={out} className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                {busy ? "Clocking out…" : "Clock out"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
