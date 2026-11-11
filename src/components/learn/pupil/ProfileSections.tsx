"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmptyState, Status, type StatusKind } from "@/components/learn/ui";
import { Loading } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { QuranPupilView } from "@/components/learn/quran/QuranPupilView";
import { Fig } from "./ProfileTabs";

// Sections of a pupil's full profile that read from other parts of the portal
// (classwork, gradebook, Qur'an, documents). Each reads the same RLS-scoped
// tables those pages use, so a teacher sees only what they may see.

const DAY = 86_400_000;
const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type WorkStatus = "on_time" | "late" | "missing" | "not_yet_due";
type WorkRow = { id: string; title: string; className: string; classId: string; due: string; status: WorkStatus; mark: string | null };
type GradeRow = { id: string; title: string; date: string; percent: number | null; grade_label: string | null; classes: { name: string } | null; class_id: string };

const WORK_STATUS: Record<WorkStatus, { kind: StatusKind; label: string }> = {
  on_time: { kind: "completed", label: "Handed in" },
  late: { kind: "attention", label: "Handed in late" },
  missing: { kind: "overdue", label: "Missing" },
  not_yet_due: { kind: "pending", label: "Not yet due" },
};

/** Classwork set to the pupil (handed in, late, missing, marks) and their gradebook results, filterable by class. */
export function PupilWorkTab({ childId }: { childId: string }) {
  const [work, setWork] = useState<WorkRow[] | null>(null);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [cls, setCls] = useState("");
  const [show, setShow] = useState<"all" | "missing">("all");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 120 * DAY).toISOString();
      const [st, gr] = await Promise.all([
        supabase.from("homework_status").select("homework_id, class_id, due_at, status, submission_id").eq("child_id", childId).gte("due_at", since).order("due_at", { ascending: false }).limit(300),
        supabase.from("assessments").select("id, title, date, percent, grade_label, class_id, classes(name)").eq("child_id", childId).order("date", { ascending: false }).limit(100),
      ]);
      const rows = (st.data as { homework_id: string; class_id: string; due_at: string; status: WorkStatus; submission_id: string | null }[] | null) || [];
      const hwIds = [...new Set(rows.map((r) => r.homework_id))];
      const subIds = rows.map((r) => r.submission_id).filter(Boolean) as string[];
      const [hw, mk] = await Promise.all([
        hwIds.length ? supabase.from("homework").select("id, title, classes(name)").in("id", hwIds) : Promise.resolve({ data: [] }),
        subIds.length ? supabase.from("homework_marks").select("submission_id, grade").in("submission_id", subIds) : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      const hwBy = new Map(((hw.data as { id: string; title: string; classes: { name: string } | null }[] | null) || []).map((h) => [h.id, h]));
      const markBy = new Map(((mk.data as { submission_id: string; grade: string | null }[] | null) || []).map((m) => [m.submission_id, m.grade]));
      setWork(
        rows.map((r) => ({
          id: r.homework_id,
          title: hwBy.get(r.homework_id)?.title || "Classwork",
          className: hwBy.get(r.homework_id)?.classes?.name || "",
          classId: r.class_id,
          due: r.due_at,
          status: r.status,
          mark: r.submission_id ? markBy.get(r.submission_id) || null : null,
        })),
      );
      setGrades((gr.data as unknown as GradeRow[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [childId]);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of work || []) if (w.className) m.set(w.classId, w.className);
    for (const g of grades) if (g.classes?.name) m.set(g.class_id, g.classes.name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [work, grades]);

  if (work === null) return <Loading label="Loading classwork and grades" bare />;
  const w = work.filter((r) => (!cls || r.classId === cls) && (show === "all" || r.status === "missing"));
  const g = grades.filter((r) => !cls || r.class_id === cls);
  const counted = work.filter((r) => (!cls || r.classId === cls) && r.status !== "not_yet_due");
  const handed = counted.filter((r) => r.status === "on_time" || r.status === "late").length;
  const missing = counted.filter((r) => r.status === "missing").length;
  const pct = g.map((r) => r.percent).filter((x): x is number => x !== null);
  const avg = pct.length ? Math.round(pct.reduce((a, b) => a + b, 0) / pct.length) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="t-eyebrow mb-1 block">Class</span>
          <Select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fig label="Handed in (120 days)" value={counted.length ? `${handed} of ${counted.length}` : "None set"} />
        <Fig label="Missing" value={String(missing)} warn={missing > 0} />
        <Fig label="Assessments" value={String(g.length)} />
        <Fig label="Average result" value={avg === null ? "No results" : `${avg}%`} warn={avg !== null && avg < 50} />
      </dl>

      <section aria-labelledby="pw-work">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="pw-work" className="t-section">
            Classwork
          </h3>
          <div role="group" aria-label="Show" className="flex gap-1">
            {(["all", "missing"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`rounded-full border px-3 py-1 text-xs font-medium ${show === k ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}>
                {k === "all" ? "Everything" : "Missing only"}
              </button>
            ))}
          </div>
        </div>
        {w.length === 0 ? (
          <EmptyState title={show === "missing" ? "Nothing missing." : "No classwork set in the last 120 days."} />
        ) : (
          <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white">
            {w.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{r.title}</span>
                  <span className="t-meta block">
                    {r.className} · due {fmt(r.due)}
                  </span>
                </span>
                {r.mark && <span className="tabular-nums text-ink">{r.mark}</span>}
                <Status kind={WORK_STATUS[r.status].kind}>{WORK_STATUS[r.status].label}</Status>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pw-grades">
        <h3 id="pw-grades" className="t-section mb-2">
          Gradebook results
        </h3>
        {g.length === 0 ? (
          <EmptyState title="No results recorded yet." />
        ) : (
          <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white">
            {g.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{r.title}</span>
                  <span className="t-meta block">{[r.classes?.name, fmt(r.date)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={`tabular-nums ${r.percent !== null && r.percent < 50 ? "font-semibold text-amber-800" : "text-ink"}`}>
                  {[r.grade_label, r.percent !== null ? `${Math.round(r.percent)}%` : null].filter(Boolean).join(" · ") || "Not marked"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The pupil's Qur'an and Qaidah, as the Qur'an page and their family see it, with a way into the class tracker. */
export function PupilQuranTab({ childId, name, area }: { childId: string; name: string; area: "admin" | "teach" }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/70">
        Marks, revision due, homework and one-to-one sessions.{" "}
        {area === "teach" && (
          <Link href={`/teach/quran?pupil=${childId}`} className="font-medium text-forest-700 hover:underline">
            Hear a recitation
          </Link>
        )}
      </p>
      <QuranPupilView childId={childId} name={name} />
    </div>
  );
}

type Doc = { id: string; title: string; kind: string; url: string; dated: string | null; created_at: string };
const DOC_KIND: Record<string, string> = { ehcp: "EHC plan", professional_report: "Professional's report", review_minutes: "Review minutes", assessment: "Assessment", family: "From the family", other: "Document" };

/**
 * Documents held about the pupil: issued term reports (opened in the Reports section) and, for staff
 * who may see them, support plan documents. Teachers never see SEND documents (0186), so the list is
 * simply empty for them.
 */
export function PupilDocumentsTab({ childId, onOpenReports }: { childId: string; onOpenReports: () => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [reports, setReports] = useState<{ id: string; released_at: string | null; terms: { name: string } | null }[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [d, r] = await Promise.all([
        supabase.from("send_plan_documents").select("id, title, kind, url, dated, created_at").eq("child_id", childId).order("created_at", { ascending: false }),
        supabase.from("term_report_versions").select("id, released_at, terms(name)").eq("child_id", childId).order("released_at", { ascending: false }).limit(20),
      ]);
      if (!alive) return;
      setDocs((d.data as Doc[] | null) || []);
      setReports((r.data as unknown as { id: string; released_at: string | null; terms: { name: string } | null }[] | null) || []);
    })();
    return () => {
      alive = false;
    };
  }, [childId]);
  if (docs === null) return <Loading label="Loading documents" bare />;
  type Item = { key: string; title: string; meta: string; action: { label: string; onClick?: () => void; href?: string } };
  const items: Item[] = [
    ...reports.map((r) => ({ key: `r${r.id}`, title: `Term report${r.terms?.name ? `: ${r.terms.name}` : ""}`, meta: r.released_at ? `Issued ${fmt(r.released_at)}` : "Issued", action: { label: "Open", onClick: onOpenReports } })),
    ...docs.map((d) => ({ key: `d${d.id}`, title: d.title, meta: [DOC_KIND[d.kind] || "Document", d.dated ? fmt(d.dated) : fmt(d.created_at)].join(" · "), action: { label: "Open", href: d.url } })),
  ];
  if (items.length === 0) return <EmptyState title="No documents yet." icon="fileText">Issued term reports and support plan documents appear here.</EmptyState>;
  return (
    <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white">
      {items.map((it) => (
        <li key={it.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">{it.title}</span>
            <span className="t-meta block">{it.meta}</span>
          </span>
          {it.action.href ? (
            <a href={it.action.href} target="_blank" rel="noopener noreferrer" className="font-medium text-forest-700 hover:underline">
              {it.action.label}
            </a>
          ) : (
            <button type="button" onClick={it.action.onClick} className="font-medium text-forest-700 hover:underline">
              {it.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
