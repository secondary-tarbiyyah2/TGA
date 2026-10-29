"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { loadEnrolments, loadIssuedChildren, loadTermReports, reportsHref, stateOf, type ClassInfo, type Mode, type PupilState } from "./data";
import type { TermOption } from "./summary";

type Counts = Record<PupilState, number> & { total: number };

/** Every class for the term with how far its reports have got and the next thing to do. */
export function ReportsOverview({ mode, classes, term, termKey, tick }: { mode: Mode; classes: ClassInfo[]; term: TermOption | null; termKey: string; tick: number }) {
  const [counts, setCounts] = useState<Record<string, Counts> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      try {
        const enrol = await loadEnrolments(supabase, classes.map((c) => c.id));
        const childIds = Array.from(new Set(Object.values(enrol).flat().map((p) => p.id)));
        const [reports, issued] = await Promise.all([loadTermReports(supabase, term?.id || null, mode === "admin" ? undefined : childIds), loadIssuedChildren(supabase, term?.id || null, mode === "admin" ? undefined : childIds)]);
        const out: Record<string, Counts> = {};
        for (const c of classes) {
          const n: Counts = { total: 0, not_started: 0, draft: 0, returned: 0, pending: 0, released: 0 };
          for (const p of enrol[c.id] || []) {
            n.total++;
            n[stateOf(reports[p.id], issued.has(p.id))]++;
          }
          out[c.id] = n;
        }
        if (alive) {
          setCounts(out);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classes, term, mode, tick]);

  const totals = useMemo(() => {
    const t: Counts = { total: 0, not_started: 0, draft: 0, returned: 0, pending: 0, released: 0 };
    // A pupil in several classes is counted once per class here; the headline is "class reports".
    for (const c of Object.values(counts || {})) for (const k of Object.keys(t) as (keyof Counts)[]) t[k] += c[k];
    return t;
  }, [counts]);

  const groups = useMemo(() => {
    const m = new Map<string, ClassInfo[]>();
    for (const c of classes) m.set(c.group, [...(m.get(c.group) || []), c]);
    return Array.from(m.entries());
  }, [classes]);

  if (classes.length === 0) {
    return (
      <EmptyState title={mode === "admin" ? "No classes yet" : "You haven't been given any classes yet"} icon="fileText" tile="tile-blue">
        {mode === "admin" ? "Reports are written per class. Add classes in Academic setup first." : "Once the office adds you to a class, its reports appear here."}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Some figures couldn&apos;t load. Refresh to try again.</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Not started" value={counts ? totals.not_started : "–"} />
        <Tile label="Drafts" value={counts ? totals.draft + totals.returned : "–"} sub={totals.returned ? `${totals.returned} sent back` : undefined} warn={totals.returned > 0} />
        <Tile label="Awaiting approval" value={counts ? totals.pending : "–"} warn={mode === "admin" && totals.pending > 0} />
        <Tile label="Issued" value={counts ? totals.released : "–"} sub={counts && totals.total ? `of ${totals.total} class reports` : undefined} />
      </dl>

      {groups.map(([group, list]) => (
        <section key={group} aria-labelledby={`grp-${group}`} className="rounded-2xl border border-gold-light bg-white">
          <h2 id={`grp-${group}`} className="border-b border-gold-light px-4 py-2.5 text-sm font-semibold text-ink">
            {group}
          </h2>
          <ul className="divide-y divide-gold-light/50">
            {list.map((c) => {
              const n = counts?.[c.id];
              const next = n ? nextAction(mode, n) : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-[10rem] flex-1">
                    <Link href={reportsHref(mode, { view: "class", term: termKey, cls: c.id })} className="font-medium text-ink hover:text-teal-800 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-ink/65">
                      {[mode === "admin" ? c.teacher || "No teacher assigned" : null, n ? `${n.total} pupil${n.total === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="w-full sm:w-56">{n ? <Progress n={n} /> : <div className="h-2 animate-pulse rounded-full bg-cream" />}</div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-36 sm:justify-end">
                    {n && <span className="text-xs text-ink/65 sm:hidden">{summaryText(n)}</span>}
                    {next &&
                      (next.done ? (
                        <StatusChip tone={next.tone}>{next.label}</StatusChip>
                      ) : (
                        <Link href={reportsHref(mode, { view: "class", term: termKey, cls: c.id })} className={`${next.primary ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
                          {next.label}
                        </Link>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function summaryText(n: Counts): string {
  return `${n.released} issued · ${n.pending} awaiting · ${n.draft + n.returned} drafts`;
}

function nextAction(mode: Mode, n: Counts): { label: string; primary?: boolean; done?: boolean; tone?: "good" | "warn" | "neutral" } | null {
  if (n.total === 0) return { label: "No pupils", done: true, tone: "neutral" };
  if (n.released === n.total) return { label: "All issued", done: true, tone: "good" };
  if (mode === "teach") {
    if (n.returned > 0) return { label: `Fix ${n.returned} sent back`, primary: true };
    if (n.not_started > 0) return { label: n.not_started === n.total ? "Start reports" : `Start ${n.not_started} more`, primary: true };
    if (n.draft > 0) return { label: `Finish ${n.draft} draft${n.draft === 1 ? "" : "s"}`, primary: true };
    return { label: "With the Headteacher", done: true, tone: "warn" };
  }
  if (n.pending > 0) return { label: `Review ${n.pending}`, primary: true };
  if (n.not_started === n.total) return { label: "Not started", done: true, tone: "neutral" };
  return { label: "Open", primary: false };
}

function Progress({ n }: { n: Counts }) {
  const pct = (v: number) => `${n.total ? (v / n.total) * 100 : 0}%`;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-cream" role="img" aria-label={summaryText(n)}>
        <span className="h-full bg-green-600" style={{ width: pct(n.released) }} />
        <span className="h-full bg-amber-500" style={{ width: pct(n.pending) }} />
        <span className="h-full bg-teal-600/60" style={{ width: pct(n.draft + n.returned) }} />
      </div>
      <p className="mt-1 hidden text-[11px] text-ink/65 sm:block">{summaryText(n)}</p>
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: number | string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <dt className="text-xs font-medium text-ink/65">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-amber-900" : "text-ink"}`}>{value}</dd>
      {sub && <dd className="text-xs text-ink/65">{sub}</dd>}
    </div>
  );
}
