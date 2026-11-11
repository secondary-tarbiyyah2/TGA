"use client";

import { Loading } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { btn, callFunction, chipCls, fieldCls, ghost } from "@/components/learn/timetable/api";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { ReconciliationPanel } from "@/components/learn/timetable/ReconciliationPanel";
import { DEFAULT_MAX_LESSONS_PER_DAY, teacherLoadTable } from "@/components/learn/timetable/checks";
import { defaultYearId, ukShortDate, type Conflict } from "@/components/learn/timetable/types";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { lessonPeriods } from "@/lib/learn/timetable";
import { getSupabaseClient } from "@/lib/supabase/client";

const STEPS = ["Choose year", "Check setup", "Generate", "Review & publish"];

function Step({ n, title, help, active, done, children }: { n: number; title: string; help: string; active?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}-title`} className={`rounded-2xl border bg-white p-4 sm:p-6 ${active ? "border-teal-500/60" : "border-gold-light"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-green-100 text-green-900" : "bg-gold-100 text-gold-900"}`}>{done ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : n}</span>
        <div className="min-w-0">
          <h2 id={`step-${n}-title`} className="font-serif text-h3 font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink/65">{help}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Check({ ok, children, fix }: { ok: boolean; children: React.ReactNode; fix?: React.ReactNode }) {
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${ok ? "border-green-200 bg-green-50/60 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span className="inline-flex items-start gap-2"><Icon name={ok ? "check" : "circleAlert"} className="mt-0.5 h-4 w-4" strokeWidth={2.25} /><span>{children}</span></span>
      {!ok && fix}
    </li>
  );
}

function GenerateContent() {
  const supabase = getSupabaseClient();
  const { data, reload } = useTimetableData();
  const [yearId, setYearId] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingFrom, setWaitingFrom] = useState<number | null>(null);

  const effYearId = yearId || defaultYearId(data.years);
  const year = data.years.find((y) => y.id === effYearId) || null;
  const yearClasses = data.classes.filter((c) => c.academic_year_id === effYearId);
  // Every class subject needs a teacher: the class's own subject plus any extra subject mapped to it.
  const gaps: { classId: string; label: string }[] = [];
  for (const c of yearClasses) {
    const sids = new Set<string>();
    if (c.subject_id) sids.add(c.subject_id);
    for (const r of data.subjectTeachers) if (r.class_id === c.id) sids.add(r.subject_id);
    for (const sid of sids) {
      const mapped = data.subjectTeachers.some((r) => r.class_id === c.id && r.subject_id === sid);
      const legacy = sid === c.subject_id && data.classTeachers.some((t) => t.scope_id === c.id);
      if (!mapped && !legacy) gaps.push({ classId: c.id, label: `${c.name} (${data.subjects.find((s) => s.id === sid)?.name || "subject"})` });
    }
  }
  // Pre-flight: lessons each teacher needs across ALL classes vs the periods they can work.
  const load = teacherLoadTable({ yearId: effYearId, classes: data.classes, subjects: data.subjects, subjectTeachers: data.subjectTeachers, classTeachers: data.classTeachers, teachers: data.teachers, availability: data.availability, protectedTimes: data.protectedTimes, periods: lessonPeriods(data.periods) });
  const overloaded = load.rows.filter((r) => r.status === "over" || r.status === "no_availability").map((r) => `${r.name} (${r.lessons} needed, ${r.capacity} possible)`);
  const teachersWithAvail = new Set(data.availability.filter((a) => a.academic_year_id === effYearId).map((a) => a.teacher_user_id));
  const needsSetup = !year || yearClasses.length === 0 || data.teachers.length === 0;
  // The newest version for the chosen year (runs are newest first).
  const latest = data.runs.find((r) => r.academic_year_id === effYearId) || null;
  const [latestConflicts, setLatestConflicts] = useState<Conflict[]>([]);
  const latestId = latest?.id || null;
  useEffect(() => {
    if (!supabase || !latestId) return;
    let cancelled = false;
    (async () => {
      const full = await supabase.from("timetable_conflicts").select("id, severity, message, resolved, kind, details").eq("run_id", latestId);
      const res = full.error ? await supabase.from("timetable_conflicts").select("id, severity, message, resolved").eq("run_id", latestId) : full;
      if (!cancelled) setLatestConflicts((res.data as Conflict[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, latestId, data.runs.length]);
  const shownConflicts = latestId ? latestConflicts : [];

  // After "Generate", the solver runs in GitHub Actions; poll for the new draft.
  useEffect(() => {
    if (waitingFrom === null) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      await reload();
      if (Date.now() - started > 10 * 60 * 1000) {
        setWaitingFrom(null);
        setMessage("Still no new draft after 10 minutes. Press \"Check for a new draft\" later, or try generating again.");
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [waitingFrom, reload]);

  useEffect(() => {
    if (waitingFrom !== null && data.runs.length > waitingFrom) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the new draft arriving
      setWaitingFrom(null);
      setMessage("Your new draft is ready.");
    }
  }, [data.runs.length, waitingFrom]);

  const generate = async () => {
    if (!year) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("trigger-timetable-generation", { academic_year_label: year.label, run_label: runLabel.trim() || undefined });
      if (result.ok) {
        setWaitingFrom(data.runs.length);
        setMessage("Started. The solver usually takes a couple of minutes. This page checks automatically and shows the draft when it appears.");
      } else {
        setMessage(`Could not start timetable generation: ${edgeErrorMessage(result)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const startBlank = async () => {
    if (!supabase || !year) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const label = runLabel.trim() || `${year.label} (by hand)`;
      const { error } = await supabase.from("timetable_runs").insert({ academic_year_id: year.id, label, status: "draft", generated_by: "manual", created_by: u.user?.id ?? null });
      if (error) return setMessage("Could not create a blank draft. Please try again.");
      await reload();
      setMessage("Blank draft created. Open it and click an empty spot in the grid to add lessons.");
    } finally {
      setBusy(false);
    }
  };

  const setupClean = !needsSetup && gaps.length === 0 && overloaded.length === 0 && data.teachers.every((t) => teachersWithAvail.has(t.id));
  const stepDone = [Boolean(year), Boolean(year) && setupClean, Boolean(latest), latest?.status === "published"];
  const loadProblems = load.rows.some((r) => r.status !== "ok");

  return (
    <div>
      <LessonsHeader title="Generate" subtitle="Build a new draft timetable in four steps. A draft never changes the live timetable." />
      <ol data-guide="generate-steps" aria-label="Progress" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={stepDone.findIndex((d) => !d) === i ? "step" : undefined} className="flex items-center gap-2 rounded-xl border border-gold-light bg-white px-3 py-2 text-xs font-medium text-ink/75">
            <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${stepDone[i] ? "bg-green-100 text-green-900" : "bg-gold-100 text-gold-900"}`}>{stepDone[i] ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}</span>
            {s}
            <span className="sr-only">{stepDone[i] ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-5">
        <Step n={1} title="Choose the academic year" help="Which school year is this timetable for?" active={!year} done={stepDone[0]}>
          {!data.loaded && <Loading label="Loading…" bare />}
          {data.loaded && data.years.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No academic year exists yet. <Link href="/admin/academic/years" className="font-semibold underline">Add one in Academic setup</Link>, then come back.
            </p>
          )}
          {data.years.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Academic year">
                {data.years.map((y) => <button key={y.id} type="button" aria-pressed={y.id === effYearId} onClick={() => setYearId(y.id)} className={chipCls(y.id === effYearId)}>{y.label}</button>)}
              </div>
              {year && <p className="text-xs text-ink/65">{year.starts_on} to {year.ends_on}</p>}
              <label className="block max-w-md text-xs font-medium text-ink/70">
                Name for this draft (optional)
                <input value={runLabel} onChange={(e) => setRunLabel(e.target.value)} placeholder="e.g. Autumn draft 2" className={fieldCls} />
              </label>
            </div>
          )}
        </Step>

        <Step n={2} title="Check classes, teachers and availability" help="The generator can only place what is set up. Fix anything marked ! first." active={Boolean(year) && needsSetup} done={stepDone[1]}>
          {!year ? (
            <p className="text-sm text-ink/65">Choose an academic year in step 1.</p>
          ) : (
            <ul className="space-y-2">
              <Check ok={yearClasses.length > 0} fix={<Link href="/admin/academic/classes" className="text-sm font-semibold underline">Add classes</Link>}>
                {yearClasses.length > 0 ? `${yearClasses.length} class${yearClasses.length === 1 ? "" : "es"} in ${year.label} (${yearClasses.reduce((n, c) => n + c.weekly_lessons, 0)} lessons a week to place)` : `No classes are set to ${year.label} yet.`}
              </Check>
              <Check ok={data.teachers.length > 0} fix={<Link href="/admin/people" className="text-sm font-semibold underline">Invite teachers</Link>}>
                {data.teachers.length > 0 ? `${data.teachers.length} teacher${data.teachers.length === 1 ? "" : "s"}` : "No teachers exist yet."}
              </Check>
              <Check ok={data.teachers.length > 0 && data.teachers.every((t) => teachersWithAvail.has(t.id))} fix={<Link href="/admin/lessons/availability" className="text-sm font-semibold underline">See availability</Link>}>
                {`${data.teachers.filter((t) => teachersWithAvail.has(t.id)).length} of ${data.teachers.length} teachers have set their availability for ${year.label}. Teachers without it cannot be given lessons.`}
              </Check>
              <Check ok={yearClasses.length === 0 || gaps.length === 0} fix={<Link href="/admin/academic/classes#teacher-matrix" className="text-sm font-semibold underline">Choose teachers</Link>}>
                {gaps.length === 0 ? "Every class subject has a teacher." : (
                  <>
                    {gaps.length} class subject{gaps.length === 1 ? " has" : "s have"} no teacher; any available teacher can be used for them:{" "}
                    {gaps.slice(0, 6).map((g, i) => (
                      <span key={g.label}>{i > 0 && ", "}<Link href="/admin/academic/classes#teacher-matrix" className="underline">{g.label}</Link></span>
                    ))}
                    {gaps.length > 6 ? `, and ${gaps.length - 6} more` : ""}.
                  </>
                )}
              </Check>
              <Check ok={overloaded.length === 0} fix={<Link href="/admin/academic/classes#teacher-matrix" className="text-sm font-semibold underline">Rebalance</Link>}>
                {overloaded.length === 0 ? "Every teacher has enough available periods for their lessons." : `Not enough available periods for: ${overloaded.join(", ")}.`}
              </Check>
              {load.unassignedLessons > 0 && (
                <Check ok={false}>{load.unassignedLessons} lessons a week have no fixed teacher; the solver will pick any teacher who is free.</Check>
              )}
              {data.terms.filter((t) => t.academic_year_id === effYearId).length === 0 && (
                <Check ok={false} fix={<Link href="/admin/academic/years" className="text-sm font-semibold underline">View terms</Link>}>No term dates are synced for {year.label}. Lessons are still generated, but term dates help later.</Check>
              )}
            </ul>
          )}
          {year && load.rows.length > 0 && (
            <details className="mt-4" open={loadProblems}>
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                Teacher load vs availability{" "}
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${loadProblems ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{loadProblems ? `${load.rows.filter((r) => r.status !== "ok").length} to check` : "all OK"}</span>
              </summary>
              <p className="mt-1 text-xs text-ink/65">Lessons a week each teacher needs across every class, against the periods they can work (at most {DEFAULT_MAX_LESSONS_PER_DAY} lessons a day). Fix red rows first or the generator will leave lessons out.</p>
              <div className="mt-2 overflow-x-auto rounded-xl border border-gold-light">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-cream/70 text-xs text-ink/65">
                      <th className="p-2 font-semibold">Teacher</th>
                      <th className="p-2 text-right font-semibold">Lessons needed</th>
                      <th className="p-2 text-right font-semibold">Available periods</th>
                      <th className="p-2 text-right font-semibold">Room for</th>
                      <th className="p-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.rows.map((r) => (
                      <tr key={r.teacherId} className="border-t border-gold-light/30 align-top">
                        <td className="p-2">
                          <span className="font-medium text-ink">{r.name}</span>
                          <span className="block text-[11px] text-ink/65">{r.contributors.map((c) => `${c.label} ${c.lessons}`).join(", ")}</span>
                        </td>
                        <td className="p-2 text-right tabular-nums">{r.lessons}</td>
                        <td className="p-2 text-right tabular-nums">{r.availablePeriods}</td>
                        <td className="p-2 text-right tabular-nums">{r.capacity}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "ok" ? "bg-green-100 text-green-900" : r.status === "tight" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"}`}>
                            {r.status === "ok" ? "OK" : r.status === "tight" ? "Tight" : r.status === "over" ? "Overbooked" : "No availability"}
                          </span>
                          {r.advice && <span className="mt-1 block text-[11px] text-ink/70">{r.advice}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Step>

        <Step n={3} title="Generate" help="Creates a new DRAFT for you to review. It never touches a published timetable, so it is safe to run again." active={Boolean(year) && !needsSetup} done={stepDone[2]}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={busy || !year || waitingFrom !== null || yearClasses.length === 0} onClick={generate}>
              {waitingFrom !== null ? "Generating…" : busy ? "Starting…" : "Generate timetable"}
            </button>
            <button type="button" className={ghost} disabled={!year || busy} onClick={startBlank}>Start a blank draft instead</button>
            <button
              type="button"
              className={ghost}
              onClick={async () => {
                const before = data.runs.length;
                const fresh = await reload();
                setMessage(fresh && fresh.runs.length > before ? "Your new draft is ready." : "No new draft yet. The solver usually takes a couple of minutes.");
              }}
            >
              Check for a new draft
            </button>
          </div>
          {waitingFrom !== null && <p className="mt-3 text-sm text-ink/70">Working… this page shows the draft by itself when it is ready.</p>}
          {message && (
            <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-500/30 bg-teal-100/60 px-4 py-3 text-sm text-teal-900">
              <span>{message}</span>
              {latest && waitingFrom === null && /ready|created/i.test(message) && <Link href="/admin/lessons/timetable" className={btn}>Open the draft &rarr;</Link>}
            </div>
          )}
          {yearClasses.length === 0 && year && <p className="mt-3 text-xs text-ink/65">Add classes for {year.label} first (step 2).</p>}
        </Step>

        <Step n={4} title="Review, fix and publish" help="Open the draft in the timetable to move lessons, resolve warnings and publish." active={Boolean(latest)} done={stepDone[3]}>
          {!latest ? (
            <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">No timetable for {year?.label || "this year"} yet. Complete steps 1 to 3, then your draft appears here.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink/80">Latest version for {year?.label}: <strong>{latest.label}</strong> <span className="text-ink/65">({latest.status}, {ukShortDate(latest.created_at)})</span></p>
              <Link href="/admin/lessons/timetable" className={btn}>Open in timetable &rarr;</Link>
            </div>
          )}
          {latest && shownConflicts.some((c) => !c.resolved) && (
            <div className="mt-4">
              <ReconciliationPanel conflicts={shownConflicts} canRerun={false} onRerun={() => undefined} busy={false} lockedCount={0} />
              <p className="mt-2 text-xs text-ink/65">To keep lessons you place by hand and re-generate the rest, open the draft in the timetable and use &ldquo;Re-run keeping locked lessons&rdquo;.</p>
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}

export default function AdminGeneratePage() {
  return (
    <LessonsFrame>
      <GenerateContent />
    </LessonsFrame>
  );
}
