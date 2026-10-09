"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fmtDate, todayIso, type Detention, type DetentionStatus } from "./data";

type View = "board" | "register" | "roster";

function Item({ d, canAct, busy, onSet, showDate }: { d: Detention; canAct: boolean; busy: boolean; onSet: (id: string, s: DetentionStatus) => void; showDate?: boolean }) {
  return (
    <li className="rounded-lg border border-gold-light/50 bg-white p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{d.children?.name || "Student"}</p>
          <p className="text-xs text-ink/55">
            {showDate ? `${fmtDate(d.scheduled_for)} · ` : ""}
            {d.duration_minutes} min{d.notes ? ` · ${d.notes}` : ""}
          </p>
        </div>
        {d.status !== "scheduled" && <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-xs capitalize text-ink/70">{d.status}</span>}
      </div>
      {canAct && d.status === "scheduled" && (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => onSet(d.id, "served")} className="rounded-md bg-gold-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            Mark served
          </button>
          <button type="button" disabled={busy} onClick={() => onSet(d.id, "missed")} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            Mark missed
          </button>
        </div>
      )}
    </li>
  );
}

function Column({ title, tone, children, count, empty }: { title: string; tone: string; children: React.ReactNode; count: number; empty: string }) {
  return (
    <div className="min-w-0">
      <h4 className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title}
        <span className="rounded-full bg-cream px-1.5 py-0.5 text-[11px] text-ink/60">{count}</span>
      </h4>
      {count === 0 ? <p className="rounded-lg border border-dashed border-gold-light px-3 py-4 text-center text-xs text-ink/65">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  );
}

/** Today / Overdue / Upcoming detentions, with take-register and roster views. */
export function DetentionRegister({ detentions, canAct = true, onChanged }: { detentions: Detention[]; canAct?: boolean; onChanged: () => void }) {
  const [view, setView] = useState<View>("board");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const open = detentions.filter((d) => d.status === "scheduled");
  const todays = open.filter((d) => d.scheduled_for === today);
  const overdue = open.filter((d) => d.scheduled_for < today);
  const upcoming = open.filter((d) => d.scheduled_for > today);

  const set = async (id: string, status: DetentionStatus) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("detentions").update({ status }).eq("id", id);
    setBusy(false);
    if (err) return setError("Couldn't update that follow-up session.");
    onChanged();
  };

  const markAll = async (list: Detention[], status: DetentionStatus) => {
    const supabase = getSupabaseClient();
    if (!supabase || list.length === 0) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("detentions").update({ status }).in("id", list.map((d) => d.id));
    setBusy(false);
    if (err) return setError("Couldn't update the register.");
    onChanged();
  };

  const roster = [...detentions].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)).slice(-100);
  const btn = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(view === v ? "board" : v)}
      aria-pressed={view === v}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${view === v ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/75 hover:bg-cream"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">Online follow-up sessions</h3>
        <div className="flex gap-2">
          {canAct && btn("register", "Take register")}
          {btn("roster", "View roster")}
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {view === "board" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Column title="Today" tone="text-teal-700" count={todays.length} empty="No follow-up sessions today.">
            {todays.map((d) => (
              <Item key={d.id} d={d} canAct={canAct} busy={busy} onSet={set} />
            ))}
          </Column>
          <Column title="Overdue" tone="text-red-700" count={overdue.length} empty="Nothing overdue.">
            {overdue.map((d) => (
              <Item key={d.id} d={d} canAct={canAct} busy={busy} onSet={set} showDate />
            ))}
          </Column>
          <Column title="Upcoming" tone="text-ink/60" count={upcoming.length} empty="Nothing scheduled.">
            {upcoming.map((d) => (
              <Item key={d.id} d={d} canAct={false} busy={busy} onSet={set} showDate />
            ))}
          </Column>
        </div>
      )}

      {view === "register" && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink/70">Register for {fmtDate(today)}, including anything overdue.</p>
            {todays.length + overdue.length > 1 && (
              <button type="button" disabled={busy} onClick={() => markAll([...overdue, ...todays], "served")} className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                Mark all served
              </button>
            )}
          </div>
          {todays.length + overdue.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gold-light px-3 py-6 text-center text-sm text-ink/55">No follow-up sessions to register today.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {[...overdue, ...todays].map((d) => (
                <Item key={d.id} d={d} canAct busy={busy} onSet={set} showDate />
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "roster" &&
        (roster.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gold-light px-3 py-6 text-center text-sm text-ink/55">No follow-up sessions have been set yet.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {roster.map((d) => (
              <Item key={d.id} d={d} canAct={canAct} busy={busy} onSet={set} showDate />
            ))}
          </ul>
        ))}
    </section>
  );
}
