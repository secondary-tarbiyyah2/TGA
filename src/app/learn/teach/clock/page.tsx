"use client";

import { useCallback, useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CLOCK_EVENT, formatDuration, formatHours } from "@/components/learn/ClockInGate";
import { STAFF_ROLES, useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type Shift = { id: string; clocked_in_at: string; clocked_out_at: string | null; note: string | null; auto_closed: boolean };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function MyHoursContent() {
  const { session } = useLearnSession();
  const userId = session && session !== "loading" ? session.user.id : null;
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    const first = new Date();
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    // Cover the whole of this week even when it began last month.
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const since = first < weekStart ? first : weekStart;
    const { data, error: err } = await supabase
      .from("staff_shifts")
      .select("id, clocked_in_at, clocked_out_at, note, auto_closed")
      .eq("user_id", userId)
      .gte("clocked_in_at", since.toISOString())
      .order("clocked_in_at", { ascending: false });
    setError(!!err);
    setShifts((data as Shift[] | null) || []);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this week's clock-ins when the page opens
    load();
    const onChange = () => {
      load();
    };
    window.addEventListener(CLOCK_EVENT, onChange);
    return () => window.removeEventListener(CLOCK_EVENT, onChange);
  }, [load]);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dur = (s: Shift) => new Date(s.clocked_out_at || now.toISOString()).getTime() - new Date(s.clocked_in_at).getTime();
  const sum = (from: Date) => (shifts || []).filter((s) => new Date(s.clocked_in_at) >= from).reduce((a, s) => a + dur(s), 0);
  const days = (from: Date) => new Set((shifts || []).filter((s) => new Date(s.clocked_in_at) >= from).map((s) => new Date(s.clocked_in_at).toDateString())).size;
  const current = (shifts || []).find((s) => !s.clocked_out_at);
  const monthShifts = (shifts || []).filter((s) => new Date(s.clocked_in_at) >= monthStart);

  const stat = (label: string, value: string, sub: string) => (
    <div className="rounded-2xl border border-gold-light bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-sm text-ink/65">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Couldn&apos;t load your shifts.</p>}
      <p className="rounded-xl border border-gold-light bg-white px-5 py-3 text-sm text-ink/75">
        {current ? (
          <>
            <span aria-hidden="true" className="text-teal-500">
              ●
            </span>{" "}
            Clocked in since {timeOf(current.clocked_in_at)} ({formatDuration(now.getTime() - new Date(current.clocked_in_at).getTime())}). Clock out from the top bar.
          </>
        ) : (
          "You are not clocked in."
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {stat("This week", formatHours(sum(weekStart)), `${days(weekStart)} days`)}
        {stat("This month", formatHours(sum(monthStart)), `${days(monthStart)} days`)}
      </div>
      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="border-b border-gold-light px-5 py-4">
          <h2 className="text-base font-semibold text-ink">This month&apos;s shifts</h2>
        </div>
        {shifts === null ? (
          <div className="h-24 animate-pulse" />
        ) : monthShifts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink/65">No shifts yet this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-gold-light text-left text-xs font-semibold uppercase tracking-wide text-ink/65">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">In</th>
                  <th className="px-4 py-2">Out</th>
                  <th className="px-4 py-2">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light">
                {monthShifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">{new Date(s.clocked_in_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td className="px-4 py-2.5">{timeOf(s.clocked_in_at)}</td>
                    <td className="px-4 py-2.5">
                      {s.clocked_out_at ? timeOf(s.clocked_out_at) : <span className="text-teal-700">On shift</span>}
                      {s.auto_closed && <span className="ml-1 text-xs text-amber-800">(auto-closed)</span>}
                    </td>
                    <td className="px-4 py-2.5">{formatHours(dur(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function MyHoursPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={STAFF_ROLES}>
        <PageHeader title="My hours" subtitle="Your clock-ins this week and month." />
        <MyHoursContent />
      </LearnGate>
    </section>
  );
}
