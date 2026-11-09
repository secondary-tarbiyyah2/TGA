"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { ButtonLink, EmptyState, StatusChip, ui } from "@/components/learn/ui";
import type { AttentionRow } from "@/lib/learn/homeworkFeedback";

const ATTENTION_COLUMNS = "homework_id, homework_title, class_id, class_name, due_at, child_id, child_name, submission_id, submitted_at, attention, resubmission_requested_at";

type QueueRow = { submission_id: string; homework_id: string; homework_title: string | null; class_id: string; class_name: string | null; child_id: string; child_name: string | null; due_at: string; submitted_at: string };
type Kind = "mark" | "missing" | "late" | "resub";
type Piece = { id: string; title: string; dueAt: string; mark: QueueRow[]; missing: AttentionRow[]; late: AttentionRow[]; resub: AttentionRow[] };
type ClassGroup = { id: string; name: string; pieces: Piece[]; counts: Record<Kind, number> };

const KINDS: { key: Kind; label: string }[] = [
  { key: "mark", label: "To mark" },
  { key: "missing", label: "Missing" },
  { key: "late", label: "Handed in late" },
  { key: "resub", label: "Resubmission asked" },
];

const WINDOWS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "This year" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const firstNames = (rows: { child_name: string | null }[], max = 4) => {
  const names = rows.map((r) => (r.child_name || "Pupil").split(" ")[0]);
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
};

/**
 * Classwork lives in each class (its Classwork tab is where work is set and
 * marked). This page is only the short list of what needs doing across the
 * classes: work to mark, missing, handed in late, or waiting for a
 * resubmission. Every row links straight into the class, to the right place.
 * Reads the RLS-scoped views homework_review_queue and homework_attention, so
 * a teacher sees their own classes and the head the whole school.
 */
export function ClassworkToAction({ scope }: { scope: "teach" | "admin" }) {
  const base = scope === "admin" ? "/admin" : "/teach";
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [attention, setAttention] = useState<AttentionRow[] | null>(null);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<Kind | "all">("all");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [q, a] = await Promise.all([
        supabase.from("homework_review_queue").select("submission_id, homework_id, homework_title, class_id, class_name, child_id, child_name, due_at, submitted_at").order("submitted_at").limit(2000),
        supabase.from("homework_attention").select(ATTENTION_COLUMNS).gte("due_at", since).order("due_at", { ascending: false }).limit(2000),
      ]);
      if (!alive) return;
      setError(!!(q.error || a.error));
      setQueue((q.data as unknown as QueueRow[]) || []);
      setAttention((a.data as unknown as AttentionRow[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [days]);

  const groups = useMemo<ClassGroup[] | null>(() => {
    if (!queue || !attention) return null;
    const classes = new Map<string, { name: string; pieces: Map<string, Piece> }>();
    const piece = (classId: string, className: string | null, hwId: string, title: string | null, dueAt: string) => {
      const c = classes.get(classId) || { name: className || "Class", pieces: new Map<string, Piece>() };
      classes.set(classId, c);
      const p = c.pieces.get(hwId) || { id: hwId, title: title || "Homework", dueAt, mark: [], missing: [], late: [], resub: [] };
      c.pieces.set(hwId, p);
      return p;
    };
    for (const r of queue) piece(r.class_id, r.class_name, r.homework_id, r.homework_title, r.due_at).mark.push(r);
    for (const r of attention) {
      const p = piece(r.class_id, r.class_name, r.homework_id, r.homework_title, r.due_at);
      if (r.attention === "missing") p.missing.push(r);
      else if (r.attention === "late") p.late.push(r);
      else p.resub.push(r);
    }
    return [...classes.entries()]
      .map(([id, c]) => {
        const pieces = [...c.pieces.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
        const counts = { mark: 0, missing: 0, late: 0, resub: 0 } as Record<Kind, number>;
        for (const p of pieces) for (const k of KINDS) counts[k.key] += p[k.key].length;
        return { id, name: c.name, pieces, counts };
      })
      .sort((a, b) => b.counts.mark + b.counts.missing - (a.counts.mark + a.counts.missing) || a.name.localeCompare(b.name));
  }, [queue, attention]);

  const totals = useMemo(() => {
    const t = { mark: 0, missing: 0, late: 0, resub: 0 } as Record<Kind, number>;
    for (const g of groups || []) for (const k of KINDS) t[k.key] += g.counts[k.key];
    return t;
  }, [groups]);
  const all = totals.mark + totals.missing + totals.late + totals.resub;

  const shown = (groups || [])
    .map((g) => ({ ...g, pieces: g.pieces.filter((p) => (kind === "all" ? KINDS.some((k) => p[k.key].length) : p[kind].length > 0)) }))
    .filter((g) => g.pieces.length > 0);

  const classwork = (id: string, extra = "") => `${base}/class?id=${id}&tab=classwork${extra}`;

  return (
    <>
      <PageHeader
        title="Classwork to action"
        subtitle="Work is set and marked inside each class. This page only lists what needs doing, with a link straight into the class."
        actions={
          <ButtonLink href={`${base}/classes`} size="sm" icon="presentation">
            {scope === "admin" ? "All classes" : "My classes"}
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Show">
        <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} className={kind === "all" ? ui.chipOn : ui.chip}>
          Everything ({all})
        </button>
        {KINDS.map((k) => (
          <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)} className={kind === k.key ? ui.chipOn : ui.chip}>
            {k.label} ({totals[k.key]})
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-1 text-xs text-ink/65" role="group" aria-label="How far back">
          {WINDOWS.map((w) => (
            <button key={w.days} type="button" aria-pressed={days === w.days} onClick={() => setDays(w.days)} className={`rounded-full px-2.5 py-1 font-medium ${days === w.days ? "bg-ink/10 text-ink" : "hover:bg-white hover:text-ink"}`}>
              {w.label}
            </button>
          ))}
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Some of this couldn&apos;t load. Refresh to try again.
        </p>
      )}

      {groups === null ? (
        <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Nothing to action."
          icon="circleCheck"
          tile="tile-green"
          action={
            <ButtonLink href={`${base}/classes`} variant="secondary" size="sm">
              Open a class to set work
            </ButtonLink>
          }
        >
          Nothing is waiting to be marked, missing, late or waiting for a resubmission{kind === "all" ? "" : " in this view"}. Work to mark is shown whatever its age; the rest covers {WINDOWS.find((w) => w.days === days)?.label.toLowerCase()}.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {shown.map((g) => (
            <section key={g.id} aria-labelledby={`cw-${g.id}`} className="rounded-2xl border border-gold-light bg-white">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gold-light px-4 py-3 sm:px-5">
                <h2 id={`cw-${g.id}`} className="mr-auto min-w-0 text-base font-semibold text-ink">
                  <Link href={classwork(g.id)} className="hover:text-teal-700 hover:underline">
                    {g.name}
                  </Link>
                </h2>
                <span className="flex flex-wrap gap-1.5">
                  {g.counts.mark > 0 && <StatusChip tone="info">{g.counts.mark} to mark</StatusChip>}
                  {g.counts.missing > 0 && <StatusChip tone="bad">{g.counts.missing} missing</StatusChip>}
                  {g.counts.late > 0 && <StatusChip tone="warn">{g.counts.late} late</StatusChip>}
                  {g.counts.resub > 0 && <StatusChip tone="warn">{g.counts.resub} resubmission{g.counts.resub === 1 ? "" : "s"}</StatusChip>}
                </span>
                <span className="flex gap-2">
                  {g.counts.mark > 0 && (
                    <Link href={classwork(g.id, "&view=review")} className={`${ui.btnPrimary} ${ui.sm}`}>
                      Mark work
                    </Link>
                  )}
                  <Link href={classwork(g.id)} className={`${ui.btnSecondary} ${ui.sm}`}>
                    Open classwork
                  </Link>
                </span>
              </div>
              <ul className="divide-y divide-gold-light/60">
                {g.pieces.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:px-5">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block truncate font-medium text-ink">{p.title}</span>
                      <span className="block text-xs text-ink/65">Due {shortDate(p.dueAt)}</span>
                    </span>
                    <span className="flex min-w-0 flex-[2] basis-72 flex-wrap items-center gap-x-4 gap-y-1">
                      {(kind === "all" || kind === "mark") && p.mark.length > 0 && (
                        <Link href={classwork(g.id, `&view=review&homework=${p.id}`)} className={ui.btnLink}>
                          Mark {plural(p.mark.length, "piece")}
                        </Link>
                      )}
                      {(kind === "all" || kind === "missing") && p.missing.length > 0 && (
                        <span className="text-ink/80">
                          <b className="font-semibold text-red-800">{p.missing.length} missing:</b> {firstNames(p.missing)}
                        </span>
                      )}
                      {(kind === "all" || kind === "late") && p.late.length > 0 && (
                        <span className="text-ink/80">
                          <b className="font-semibold text-amber-900">{p.late.length} late:</b> {firstNames(p.late)}
                        </span>
                      )}
                      {(kind === "all" || kind === "resub") && p.resub.length > 0 && (
                        <span className="text-ink/80">
                          <b className="font-semibold text-amber-900">{p.resub.length} to redo:</b> {firstNames(p.resub)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
