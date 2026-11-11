"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { HALF_TERMS, TERMS, halfTermLabel } from "@/lib/learn/curriculumUnits";
import { yearLabel } from "@/lib/learn/curriculum";
import {
  FOUNDING_NOTE,
  PACK_MATRIX_DIR,
  PACK_OVERVIEW_DIR,
  PACK_SUBJECT_DIR,
  PLAN_SUBJECTS,
  focusTitle,
  isFoundingHalfTerm,
  lessonLinks,
  loadPlan,
  subjectPlan,
  termOf,
  unitsOfYear,
  type PlanSource,
  type PlanUnit,
  type SubjectPlan,
} from "@/lib/learn/syllabusPlan";
import { Status, ui } from "@/components/learn/ui";
import { SidePanel } from "@/components/learn/kit";
import { Icon, type IconName } from "@/components/learn/Icon";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { Select } from "@/components/ui/Dropdown";

const BUCKET = "lesson-decks";
const SUBJECT_KEY = "tga-syllabus-subject";
const ICONS: Record<string, IconName> = {
  english: "notebookPen",
  mathematics: "calculator",
  science: "flask",
  quran: "bookMarked",
  arabic: "languages",
  "islamic-studies": "moon",
  history: "hourglass",
  geography: "globe",
  computing: "monitor",
  art: "palette",
  pshe: "heartHandshake",
  business: "briefcase",
};
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const eyebrow = "text-xs font-semibold uppercase tracking-wide text-ink/65";
type View = "plan" | "years" | "progression" | "exams";
type PackFile = { name: string; path: string };
type PackDocs = { pdf?: PackFile; editable?: PackFile };

/** "Pearson Edexcel International GCSE (9-1) English Literature", without repeating the board when the qualification already names it. */
const qualName = (board: string, qual: string) => {
  const b = board.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return qual.toLowerCase().startsWith(b.split(" ")[0].toLowerCase()) ? qual : `${b} ${qual}`;
};
const yearShort = (y: string) => yearLabel(y).replace("Year ", "Y");
const span = (p: SubjectPlan) => (p.yearKeys.length ? `${yearLabel(p.yearKeys[0])} to ${yearLabel(p.yearKeys[p.yearKeys.length - 1])}` : "");

/**
 * Syllabus (owner, 10 Nov 2026: "one page, everything reachable in place"): every subject's
 * curriculum, Year 1 to Year 11, on a single page. The subject list stays on the left (a
 * dropdown on phones); the subject's long-term plan, year by year units, progression and
 * exams are tabs; a unit opens in place (a side panel from the long-term plan, alongside the
 * list in Year by year), so nothing sends you to another page. The address keeps
 * ?subject=&view=&year=&unit=, so links from before still open the same thing. Reads the
 * Curriculum planner (curriculum_units), falling back to the published syllabus index.
 */
export function SyllabusBrowser({ area }: { area: "teach" | "admin" }) {
  const { roles } = useLearnSession();
  const canEdit = roles.some((r) => r.role === "teacher" || r.role === "head_teacher" || r.role === "admin");
  const [plan, setPlan] = useState<PlanSource | null>(null);
  const [slug, setSlug] = useState("");
  const [view, setView] = useState<View>("plan");
  const [year, setYear] = useState("");
  const [unitKey, setUnitKey] = useState<string | null>(null);
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, PackDocs>>({});
  const [docError, setDocError] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const [restored, setRestored] = useState(false);

  // Start from a link (?subject=&view=&year=&unit=), else the subject looked at last.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let s = q.get("subject") || "";
    if (!s) {
      try {
        s = window.localStorage.getItem(SUBJECT_KEY) || "";
      } catch {
        /* private mode */
      }
    }
    /* eslint-disable react-hooks/set-state-in-effect -- restore the linked or remembered view once after mount */
    if (PLAN_SUBJECTS.some((x) => x.slug === s)) setSlug(s);
    const v = q.get("view");
    if (v === "plan" || v === "years" || v === "progression" || v === "exams") setView(v);
    if (q.get("year")) setYear(q.get("year") || "");
    if (q.get("unit")) {
      if (v === "years") setUnitKey(q.get("unit"));
      else setPanelKey(q.get("unit"));
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    loadPlan().then(setPlan);
  }, []);

  // Keep the address in step, so a view can be shared or bookmarked (only once the link has
  // been read: writing earlier would wipe it before it is used).
  useEffect(() => {
    if (!restored) return;
    const q = new URLSearchParams();
    if (slug) q.set("subject", slug);
    if (slug && view !== "plan") q.set("view", view);
    if (slug && view === "years" && year) q.set("year", year);
    if (slug && view === "years" && unitKey) q.set("unit", unitKey);
    if (slug && view === "plan" && panelKey) q.set("unit", panelKey);
    const s = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
    try {
      if (slug) window.localStorage.setItem(SUBJECT_KEY, slug);
    } catch {
      /* ignore */
    }
  }, [restored, slug, view, year, unitKey, panelKey]);

  // The pack's documents in storage (staff-only bucket).
  useEffect(() => {
    let live = true;
    (async () => {
      const sb = getSupabaseClient();
      if (!sb) return;
      const list = async (dir: string): Promise<PackDocs> => {
        const { data } = await sb.storage.from(BUCKET).list(dir, { limit: 50 });
        const files = (data || []).filter((f) => f.id).map((f) => ({ name: f.name, path: `${dir}/${f.name}` }));
        return { pdf: files.find((f) => f.name.endsWith(".pdf")), editable: files.find((f) => /\.(docx|pptx)$/.test(f.name)) };
      };
      const dirs: [string, string][] = [["overview", PACK_OVERVIEW_DIR], ["matrix", PACK_MATRIX_DIR], ...(slug ? ([[slug, PACK_SUBJECT_DIR(slug)]] as [string, string][]) : [])];
      const out: Record<string, PackDocs> = {};
      for (const [k, d] of dirs) {
        try {
          out[k] = await list(d);
        } catch {
          out[k] = {};
        }
      }
      if (live) setDocs((x) => ({ ...x, ...out }));
    })();
    return () => {
      live = false;
    };
  }, [slug]);

  const openFile = async (f: PackFile, download: boolean) => {
    setDocError(null);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Not connected.");
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 600, download ? { download: f.name } : undefined);
      if (error || !data) throw error || new Error("No link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch {
      setDocError("Could not open that document. Try again in a moment.");
    }
  };

  // Subjects with something to show, in the pack's order; the chosen one (or the first).
  const available = useMemo(() => (plan ? PLAN_SUBJECTS.map((s) => ({ s, p: subjectPlan(s, plan.units) })).filter((x) => x.p.unitCount > 0) : []), [plan]);
  const current = available.find((x) => x.s.slug === slug) || available[0] || null;
  const sp: SubjectPlan | null = current?.p || null;
  const years = sp?.yearKeys || [];
  const activeYear = years.includes(year) ? year : years[0] || "";
  const yearUnits = useMemo(() => (sp && activeYear ? unitsOfYear(sp, activeYear) : []), [sp, activeYear]);
  const activeUnit = yearUnits.find((u) => u.key === unitKey) || yearUnits.find((u) => isFoundingHalfTerm(u.halfTerm)) || yearUnits[0] || null;
  const allUnits = useMemo(() => (sp ? sp.yearKeys.flatMap((y) => unitsOfYear(sp, y)) : []), [sp]);
  const panelUnit = panelKey ? allUnits.find((u) => u.key === panelKey) || null : null;
  const panelSiblings = panelUnit ? unitsOfYear(sp as SubjectPlan, panelUnit.year) : [];
  const panelIndex = panelUnit ? panelSiblings.findIndex((u) => u.key === panelUnit.key) : -1;

  const openInYears = useCallback((u: PlanUnit) => {
    setView("years");
    setYear(u.year);
    setUnitKey(u.key);
    setPanelKey(null);
    window.setTimeout(() => detailRef.current?.focus({ preventScroll: true }), 0);
  }, []);
  const chooseSubject = (s: string) => {
    setSlug(s);
    setView("plan");
    setYear("");
    setUnitKey(null);
    setPanelKey(null);
  };

  if (!plan)
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-16">
        <div className="portal-progress w-40" aria-hidden="true" />
        <p className="t-meta">Loading the syllabus</p>
      </div>
    );

  const views: { key: View; label: string }[] = sp
    ? [
        { key: "plan", label: "Long-term plan" },
        { key: "years", label: "Year by year" },
        ...(sp.syllabus?.progression?.length ? [{ key: "progression" as View, label: "Progression" }] : []),
        ...(sp.specs.length ? [{ key: "exams" as View, label: "Exams" }] : []),
      ]
    : [];
  const activeView = views.some((v) => v.key === view) ? view : "plan";

  return (
    <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
      {/* Subjects: always in view on wide screens, a dropdown on phones. */}
      <aside className="space-y-5 lg:sticky lg:top-[76px] lg:self-start">
        <div data-guide="syllabus-subject">
          <div className="lg:hidden">
            <Select value={current?.s.slug || ""} onChange={(e) => chooseSubject(e.target.value)} aria-label="Subject">
              {available.map(({ s }) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <nav aria-label="Subjects" className="hidden lg:block">
            <p className="t-eyebrow mb-2 px-2.5">Subjects</p>
            <ul className="space-y-px">
              {available.map(({ s, p }) => {
                const on = current?.s.slug === s.slug;
                return (
                  <li key={s.slug}>
                    <button type="button" onClick={() => chooseSubject(s.slug)} aria-current={on ? "true" : undefined} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${on ? "bg-white font-semibold text-forest-900 shadow-[var(--portal-shadow-lift)]" : "text-ink-700 hover:bg-[var(--portal-hover)] hover:text-ink"}`}>
                      <Icon name={ICONS[s.slug] || "bookOpen"} className={`h-4 w-4 shrink-0 ${on ? "text-forest-700" : "text-ink-500"}`} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-xs font-normal tabular-nums text-ink-500">{p.unitCount}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <WholeSchool docs={docs} openFile={openFile} />
      </aside>

      <div className="min-w-0 space-y-5">
        {docError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {docError}
          </p>
        )}
        {!sp ? (
          <p className="rounded-2xl border border-dashed border-gold-light px-6 py-12 text-center text-sm text-ink-500">No subject curriculum has been published yet.</p>
        ) : (
          <>
            <SubjectHeader sp={sp} live={plan.live} docs={docs[sp.subject.slug]} overview={docs.overview} openFile={openFile} canEdit={canEdit} area={area} />
            <Tabs variant="switch" items={views} value={activeView} onChange={(v) => { setView(v); setPanelKey(null); }} label="Syllabus views" idBase="syl" />
            <div {...tabPanelProps("syl", activeView)} className="focus:outline-none">
              {activeView === "plan" && <PlanView sp={sp} onOpen={(u) => setPanelKey(u.key)} />}
              {activeView === "years" && (
                <YearsView sp={sp} years={years} year={activeYear} units={yearUnits} active={activeUnit} onYear={(y) => { setYear(y); setUnitKey(null); }} onUnit={(u) => openInYears(u)} detailRef={detailRef} area={area} canEdit={canEdit} />
              )}
              {activeView === "progression" && <ProgressionView sp={sp} />}
              {activeView === "exams" && <ExamsView sp={sp} />}
            </div>
          </>
        )}
      </div>

      {panelUnit && sp && (
        <SidePanel
          title={panelUnit.kind === "spec" ? panelUnit.title : focusTitle(panelUnit.title)}
          eyebrow={`${panelUnit.kind === "spec" ? `${termOf(panelUnit)} · ${panelUnit.ref}` : halfTermLabel(panelUnit.halfTerm)} · ${yearLabel(panelUnit.year)}`}
          onClose={() => setPanelKey(null)}
          footer={
            <>
              {panelIndex > 0 && (
                <button type="button" className={`${ui.btnGhost} ${ui.sm}`} onClick={() => setPanelKey(panelSiblings[panelIndex - 1].key)}>
                  <Icon name="chevronLeft" className="h-4 w-4" /> Previous unit
                </button>
              )}
              {panelIndex >= 0 && panelIndex < panelSiblings.length - 1 && (
                <button type="button" className={`${ui.btnGhost} ${ui.sm}`} onClick={() => setPanelKey(panelSiblings[panelIndex + 1].key)}>
                  Next unit <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              )}
              <button type="button" className={`${ui.btnSecondary} ${ui.sm} ml-auto`} onClick={() => openInYears(panelUnit)}>
                Open in Year by year
              </button>
            </>
          }
        >
          <UnitDetail key={panelUnit.key} u={panelUnit} sp={sp} area={area} canEdit={canEdit} bare />
        </SidePanel>
      )}
    </div>
  );
}

function DocButtons({ docs, openFile, pdfLabel = "Print or save the PDF", small = false }: { docs?: PackDocs; openFile: (f: PackFile, d: boolean) => void; pdfLabel?: string; small?: boolean }) {
  const btn = `${ui.btnSecondary}${small ? ` ${ui.sm}` : ""}`;
  if (!docs?.pdf && !docs?.editable) return <span className="text-xs text-ink-500">Being built; check back in about 30 minutes.</span>;
  const ext = docs.editable?.name.split(".").pop();
  return (
    <span className="flex flex-wrap gap-2">
      {docs.pdf && (
        <button type="button" className={btn} onClick={() => openFile(docs.pdf as PackFile, false)}>
          <Icon name="printer" className="h-4 w-4" /> {pdfLabel}
        </button>
      )}
      {docs.editable && (
        <button type="button" className={btn} onClick={() => openFile(docs.editable as PackFile, true)}>
          <Icon name="download" className="h-4 w-4" /> {ext === "pptx" ? "PowerPoint" : "Word"}
        </button>
      )}
    </span>
  );
}

/** The two whole-school documents, under the subject list. */
function WholeSchool({ docs, openFile }: { docs: Record<string, PackDocs>; openFile: (f: PackFile, d: boolean) => void }) {
  const row = (label: string, hint: string, d: PackDocs | undefined) => (
    <li className="px-2.5 py-2">
      <p className="text-[0.8125rem] font-medium text-ink">{label}</p>
      <p className="t-meta text-xs">{hint}</p>
      <div className="mt-1.5">
        {d?.pdf ? (
          <button type="button" className="text-xs font-semibold text-forest-700 hover:underline" onClick={() => openFile(d.pdf as PackFile, false)}>
            Open the PDF
          </button>
        ) : (
          <span className="text-xs text-ink-500">Being built</span>
        )}
      </div>
    </li>
  );
  return (
    <section aria-labelledby="syl-whole" className="border-t border-gold-light pt-4">
      <h2 id="syl-whole" className="t-eyebrow mb-1 px-2.5">
        Whole school
      </h2>
      <ul>
        {row("Curriculum overview", "Every year group's long-term plan and the exams pupils sit.", docs.overview)}
        {row("Cross-curricular matrices", "How the subjects link, year by year.", docs.matrix)}
      </ul>
    </section>
  );
}

function SubjectHeader({ sp, live, docs, overview, openFile, canEdit, area }: { sp: SubjectPlan; live: boolean; docs?: PackDocs; overview?: PackDocs; openFile: (f: PackFile, d: boolean) => void; canEdit: boolean; area: string }) {
  const facts: [string, string][] = [];
  if (sp.syllabus) facts.push(["Years 1 to 9", sp.syllabus.framework]);
  sp.specs.forEach(({ info }) => facts.push([`Years 10 and 11${sp.specs.length > 1 ? `: ${info.subject}` : ""}`, info.examEntry ? `Taught from ${info.board} ${info.code}; pupils sit ${qualName(info.examEntry.board, info.examEntry.qualification)} (${info.examEntry.code})` : `${qualName(info.board, info.qualification)} (${info.code})`]));
  const statuses = [sp.syllabus?.status, ...sp.specs.map((s) => s.info.status)].filter(Boolean);
  const verified = statuses.every((s) => s === "Verified");
  return (
    <section aria-labelledby="syl-subject" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="syl-subject" className="text-lg font-semibold tracking-tight text-ink">
            {sp.subject.name}
          </h2>
          <p className="t-meta mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {span(sp)} · {sp.unitCount} units
            </span>
            <Status kind={verified ? "approved" : "attention"}>{verified ? "Verified" : "Provisional"}</Status>
          </p>
        </div>
        <DocButtons docs={docs} openFile={openFile} small />
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 border-y border-gold-light py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="t-meta font-medium">{k}</dt>
            <dd className="text-ink-700">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="t-meta text-xs">
        {live ? "Live from the Curriculum planner; the documents are rebuilt after each change." : "Showing the last published copy: the Curriculum planner could not be reached."}{" "}
        {canEdit && (
          <Link href={`/${area}/planner`} className="font-semibold text-forest-700 underline-offset-2 hover:underline">
            Edit in the Curriculum planner
          </Link>
        )}
        {overview?.pdf && (
          <>
            {" · "}
            <button type="button" className="font-semibold text-forest-700 underline-offset-2 hover:underline" onClick={() => openFile(overview.pdf as PackFile, false)}>
              Whole-school overview (PDF)
            </button>
          </>
        )}
      </p>
    </section>
  );
}

function FoundingLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/75">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-forest-200 bg-forest-100" /> Taught in the founding year (January to July 2027)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-gold-light bg-white" /> From September 2027
      </span>
    </p>
  );
}

const cellBtn = `block w-full rounded-md border px-2 py-1.5 text-left text-[13px] leading-snug text-ink [overflow-wrap:anywhere] transition-colors hover:border-forest-700 hover:bg-white ${focusRing}`;

function PlanView({ sp, onOpen }: { sp: SubjectPlan; onOpen: (u: PlanUnit) => void }) {
  const ks13Years = Object.keys(sp.years).filter((y) => y !== "y10" && y !== "y11");
  return (
    <div className="space-y-4">
      {ks13Years.length > 0 && (
        <section aria-labelledby="ltp-h" className={ui.card}>
          <div className={ui.cardHead}>
            <h3 id="ltp-h" className={ui.sectionTitle}>
              {yearLabel(ks13Years[0])} to {yearLabel(ks13Years[ks13Years.length - 1])}: one unit each half term
            </h3>
            <FoundingLegend />
          </div>
          {/* Wide screens: the grid. */}
          <table className="hidden w-full table-fixed border-separate border-spacing-1 text-sm md:table">
            <caption className="sr-only">Long-term plan: years down the side, half terms across the top. Select a unit to see it in full.</caption>
            <thead>
              <tr>
                <th scope="col" className="w-20" />
                {HALF_TERMS.map((h) => (
                  <th key={h.key} scope="col" className={`rounded-md px-2 py-2 text-left text-xs font-semibold ${isFoundingHalfTerm(h.key) ? "bg-forest-100 text-forest-900" : "bg-[var(--portal-sunken)] text-ink-700"}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ks13Years.map((y) => (
                <tr key={y}>
                  <th scope="row" className="px-2 text-left align-middle text-[0.8125rem] font-semibold text-ink">
                    {yearLabel(y)}
                  </th>
                  {HALF_TERMS.map((h) => {
                    const us = sp.years[y].filter((u) => u.halfTerm === h.key);
                    return (
                      <td key={h.key} className="align-top">
                        {us.length ? (
                          <div className="space-y-1">
                            {us.map((u) => (
                              <button key={u.key} type="button" onClick={() => onOpen(u)} className={`${cellBtn} ${isFoundingHalfTerm(h.key) ? "border-forest-200 bg-forest-50" : "border-gold-light bg-white"}`}>
                                {focusTitle(u.title)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="block px-2 py-1.5 text-xs italic text-ink/55">No unit</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Phones: one block per year. */}
          <div className="space-y-4 md:hidden">
            {ks13Years.map((y) => (
              <div key={y}>
                <h4 className="mb-1.5 text-sm font-semibold text-ink">{yearLabel(y)}</h4>
                <ol className="space-y-1">
                  {HALF_TERMS.map((h) =>
                    sp.years[y]
                      .filter((u) => u.halfTerm === h.key)
                      .map((u) => (
                        <li key={u.key}>
                          <button type="button" onClick={() => onOpen(u)} className={`${cellBtn} flex items-baseline gap-2 ${isFoundingHalfTerm(h.key) ? "border-forest-200 bg-forest-50" : "border-gold-light bg-white"}`}>
                            <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-xs font-semibold text-ink/70">{h.label}</span>
                            <span>{focusTitle(u.title)}</span>
                          </button>
                        </li>
                      )),
                  )}
                </ol>
              </div>
            ))}
          </div>
          {ks13Years.some((y) => sp.years[y].some((u) => !u.halfTerm)) && <p className="mt-3 text-xs text-ink/70">Some units have not been placed in a half term yet; they are listed under Year by year.</p>}
          <p className="mt-3 text-xs text-ink/70">{FOUNDING_NOTE}</p>
        </section>
      )}

      {sp.specs.map(({ slug, info }) => (
        <section key={slug} aria-labelledby={`route-${slug}`} className={ui.card}>
          <div className={ui.cardHead}>
            <h3 id={`route-${slug}`} className={ui.sectionTitle}>
              Years 10 and 11{sp.specs.length > 1 ? `: ${info.subject}` : ""}
            </h3>
            <span className="text-xs text-ink/70">{info.label}</span>
          </div>
          <div className="space-y-4">
            {["y10", "y11"].map((y) => {
              const us = sp.specUnits[slug]?.[y] || [];
              if (!us.length) return null;
              return (
                <div key={y}>
                  <h4 className="mb-1.5 text-sm font-semibold text-ink">{yearLabel(y)}</h4>
                  <div className="grid gap-2 md:grid-cols-3">
                    {TERMS.map((t) => (
                      <div key={t} className="rounded-lg border border-gold-light p-2">
                        <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink/70">{t}</p>
                        <ul className="space-y-1">
                          {us
                            .filter((u) => termOf(u) === t)
                            .map((u) => (
                              <li key={u.key}>
                                <button type="button" onClick={() => onOpen(u)} className={`${cellBtn} flex gap-2 border-gold-light bg-white`}>
                                  <span className="shrink-0 font-semibold tabular-nums text-teal-700">{u.ref}</span>
                                  <span>{u.title}</span>
                                </button>
                              </li>
                            ))}
                          {!us.some((u) => termOf(u) === t) && <li className="px-1 text-xs italic text-ink/55">None</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {slug === sp.specs[0].slug && sp.syllabus?.toKS4 && (
            <details className="mt-4 rounded-xl border border-gold-light px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">From Year 9 to Year 10</summary>
              <p className="mt-2 text-ink/80">{sp.syllabus.toKS4}</p>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function YearsView({ sp, years, year, units, active, onYear, onUnit, detailRef, area, canEdit }: { sp: SubjectPlan; years: string[]; year: string; units: PlanUnit[]; active: PlanUnit | null; onYear: (y: string) => void; onUnit: (u: PlanUnit) => void; detailRef: React.RefObject<HTMLElement | null>; area: string; canEdit: boolean }) {
  const i = active ? units.findIndex((u) => u.key === active.key) : -1;
  const label = (u: PlanUnit) => (u.kind === "spec" ? `${termOf(u)} · ${u.ref}` : u.halfTerm ? halfTermLabel(u.halfTerm) : "Not placed yet");
  return (
    <div className="space-y-4">
      <div>
        <Tabs variant="switch" items={years.map((y) => ({ key: y, label: yearShort(y) }))} value={year} onChange={onYear} label="Year group" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label={`${sp.subject.name} units in ${yearLabel(year)}`} className="self-start lg:sticky lg:top-[76px]">
          <ol className="space-y-1">
            {units.map((u) => {
              const on = active?.key === u.key;
              const fy = u.kind === "syllabus" && isFoundingHalfTerm(u.halfTerm);
              return (
                <li key={u.key}>
                  <button type="button" aria-current={on ? "true" : undefined} onClick={() => onUnit(u)} className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition ${focusRing} ${on ? "bg-white text-forest-900 shadow-[var(--portal-shadow-lift)]" : "text-ink hover:bg-[var(--portal-hover)]"}`}>
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${on ? "text-forest-700" : "text-ink-500"}`}>
                      {fy && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full "bg-forest-500"`} />}
                      {label(u)}
                      {u.kind === "spec" && sp.specs.length > 1 ? ` · ${u.subject}` : ""}
                    </span>
                    <span className="text-sm font-medium leading-snug">{u.kind === "spec" ? u.title : focusTitle(u.title)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        {active ? (
          <UnitDetail key={active.key} u={active} sp={sp} detailRef={detailRef} area={area} canEdit={canEdit} prev={i > 0 ? units[i - 1] : null} next={i >= 0 && i < units.length - 1 ? units[i + 1] : null} onUnit={onUnit} />
        ) : (
          <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No units for {yearLabel(year)} yet.</p>
        )}
      </div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x} className="rounded-md border border-gold-light bg-cream px-2 py-0.5 text-sm text-ink">
          {x}
        </li>
      ))}
    </ul>
  );
}

function UnitDetail({ u, sp, detailRef, area, canEdit, prev = null, next = null, onUnit, bare = false }: { u: PlanUnit; sp: SubjectPlan; detailRef?: React.RefObject<HTMLElement | null>; area: string; canEdit: boolean; prev?: PlanUnit | null; next?: PlanUnit | null; onUnit?: (u: PlanUnit) => void; bare?: boolean }) {
  const spec = u.kind === "spec";
  const fy = !spec && isFoundingHalfTerm(u.halfTerm);
  const links = lessonLinks(u);
  const matched = links.filter((l) => l.matched);
  const others = links.filter((l) => !l.matched);
  const libHref = (l: { slug: string; year: string; unit: string }) => `/${area}/curriculum?year=${l.year}&subject=${encodeURIComponent(l.slug)}&unit=${encodeURIComponent(l.unit)}`;
  const h = `unit-${u.key.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <article ref={detailRef} tabIndex={-1} aria-labelledby={bare ? undefined : h} aria-label={bare ? (spec ? u.title : focusTitle(u.title)) : undefined} className={bare ? "min-w-0 focus:outline-none" : "min-w-0 self-start scroll-mt-24 rounded-2xl border border-gold-light bg-white focus:outline-none"}>
      {!bare && (
      <header className="rounded-t-2xl border-b border-gold-light px-4 py-4 sm:px-6">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="t-eyebrow !text-forest-800">{spec ? u.ref : halfTermLabel(u.halfTerm)}</span>
          {spec && <span className="text-ink/75">{[u.paper, u.term].filter(Boolean).join(" · ")}</span>}
          {!spec && u.halfTerm && <span className={fy ? "text-teal-900" : "text-ink/70"}>{fy ? "Taught in the founding year, 2027" : "From September 2027"}</span>}
        </p>
        <h3 id={h} className="mt-2 text-xl font-semibold leading-snug text-ink">
          {spec ? u.title : focusTitle(u.title)}
        </h3>
        <p className="text-sm text-ink/70">
          {yearLabel(u.year)} · {spec ? u.subject : sp.subject.name}
        </p>
      </header>
      )}

      <div className={bare ? "space-y-5" : "space-y-5 px-4 py-4 sm:px-6 sm:py-5"}>
        {spec ? (
          <section aria-labelledby={`${h}-pts`}>
            <h4 id={`${h}-pts`} className={eyebrow}>
              What the specification requires
            </h4>
            <ol className="mt-2 space-y-1.5 text-sm text-ink">
              {u.focus.map((p, k) => (
                <li key={k} className="grid grid-cols-[2rem_minmax(0,1fr)]">
                  <span className="font-semibold tabular-nums text-teal-700">{k + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-ink/65">Paraphrased from the board&apos;s specification. Always teach from the board&apos;s own document.</p>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section aria-labelledby={`${h}-k`}>
              <h4 id={`${h}-k`} className={eyebrow}>
                Key knowledge
              </h4>
              {u.focus.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink marker:text-teal-500">
                  {u.focus.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink/65">Not recorded.</p>
              )}
            </section>
            <div className="space-y-4">
              {u.skills.length > 0 && (
                <section aria-labelledby={`${h}-s`}>
                  <h4 id={`${h}-s`} className={eyebrow}>
                    Skills
                  </h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink marker:text-teal-500">
                    {u.skills.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {u.keyTerms.length > 0 && (
                <section aria-labelledby={`${h}-v`}>
                  <h4 id={`${h}-v`} className={`${eyebrow} mb-2`}>
                    Vocabulary
                  </h4>
                  <Chips items={u.keyTerms} />
                </section>
              )}
            </div>
          </div>
        )}
        {spec && u.keyTerms.length > 0 && (
          <section aria-labelledby={`${h}-v`}>
            <h4 id={`${h}-v`} className={`${eyebrow} mb-2`}>
              Key terms
            </h4>
            <Chips items={u.keyTerms} />
          </section>
        )}

        {!spec && (
          <dl className={`grid overflow-hidden rounded-lg border border-gold-light text-sm ${bare ? "" : "sm:grid-cols-3"}`}>
            {[
              ["Builds on", u.prereq],
              ["How it is checked", u.assess],
              ["Leads to", u.leadsTo],
            ].map(([k, v], n) => (
              <div key={k} className={`px-3 py-2.5 ${n ? (bare ? "border-t border-gold-light" : "border-t border-gold-light sm:border-l sm:border-t-0") : ""}`}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">{k}</dt>
                <dd className={`mt-0.5 ${v ? "text-ink" : "text-ink/60"}`}>{v || "Not recorded"}</dd>
              </div>
            ))}
          </dl>
        )}
        {(u.resources || u.foundingYear) && (
          <dl className="space-y-1 text-sm">
            {u.resources && (
              <div>
                <dt className="inline font-semibold text-ink">Resources: </dt>
                <dd className="inline text-ink/85">{u.resources}</dd>
              </div>
            )}
            {u.foundingYear && (
              <div>
                <dt className="inline font-semibold text-ink">Founding year: </dt>
                <dd className="inline text-ink/85">{u.foundingYear}</dd>
              </div>
            )}
          </dl>
        )}

        <section aria-labelledby={`${h}-w`}>
          <h4 id={`${h}-w`} className={`${ui.sectionTitle} mb-2`}>
            Week by week
          </h4>
          {u.weeks.length ? (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-gold-light text-left text-xs uppercase tracking-wide text-ink/65">
                    <th scope="col" className="w-16 py-2 pr-2 font-semibold">
                      Week
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Lessons
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Key vocabulary
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Home activity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {u.weeks.map((w, k) => (
                    <tr key={k} className="border-b border-gold-light/70 align-top last:border-0">
                      <th scope="row" className="py-2 pr-2 text-left font-semibold tabular-nums text-teal-700">
                        {w.week}
                      </th>
                      <td className="py-2 pr-3 text-ink">
                        <ul className="space-y-0.5">
                          {w.lessons.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-2 pr-3 text-ink/85">{w.vocabulary.join(", ")}</td>
                      <td className="py-2 text-ink/85">{w.home}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ol className="space-y-2 md:hidden">
                {u.weeks.map((w, k) => (
                  <li key={k} className="rounded-xl border border-gold-light p-3 text-sm">
                    <p className="font-semibold text-teal-700">Week {w.week}</p>
                    <ul className="mt-1 list-disc pl-5 text-ink">
                      {w.lessons.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    {w.vocabulary.length > 0 && <p className="mt-1 text-ink/80">Vocabulary: {w.vocabulary.join(", ")}</p>}
                    {w.home && <p className="mt-1 text-ink/80">At home: {w.home}</p>}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-gold-light px-3 py-3 text-sm text-ink/70">
              No week-by-week plan yet.{" "}
              {canEdit && (
                <Link href={`/${area}/planner`} className="font-semibold text-teal-700 underline">
                  Add one in the Curriculum planner
                </Link>
              )}
            </p>
          )}
        </section>

        <section aria-labelledby={`${h}-l`}>
          <h4 id={`${h}-l`} className={`${ui.sectionTitle} mb-2`}>
            In the Lesson library
          </h4>
          {links.length === 0 ? (
            <p className="text-sm text-ink/70">
              {spec ? "No lessons matched to this unit's points yet." : `No ${yearLabel(u.year)} lessons for this subject in the Lesson library yet.`}{" "}
              <Link href={`/${area}/curriculum?year=${u.year}`} className="font-semibold text-teal-700 underline">
                Open {yearLabel(u.year)} in the Lesson library
              </Link>
            </p>
          ) : (
            <>
              {matched.length > 0 && (
                <ul className="space-y-1">
                  {matched.map((l) => (
                    <li key={l.unit}>
                      <Link href={libHref(l)} className={`flex items-center justify-between gap-3 rounded-lg border border-gold-light px-3 py-2 text-sm text-ink hover:border-teal-700 hover:bg-cream ${focusRing}`}>
                        <span className="min-w-0">{l.unit}</span>
                        <span className="shrink-0 text-xs text-ink/65">
                          {l.count} lesson{l.count === 1 ? "" : "s"} <Icon name="chevronRight" className="inline h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {others.length > 0 && (
                <details className="mt-2 text-sm" open={matched.length === 0}>
                  <summary className="cursor-pointer font-medium text-teal-700">
                    {matched.length ? "Other" : "All"} {yearLabel(u.year)} {u.subject} units in the library ({others.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {others.map((l) => (
                      <li key={l.unit}>
                        <Link href={libHref(l)} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-ink hover:bg-cream ${focusRing}`}>
                          <span className="min-w-0">{l.unit}</span>
                          <span className="shrink-0 text-xs text-ink/65">
                            {l.count} lesson{l.count === 1 ? "" : "s"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!spec && <p className="mt-1 text-xs text-ink/65">Lessons are being rewritten to the new plan, so library unit names may not match the half-term units yet.</p>}
                </details>
              )}
            </>
          )}
        </section>
      </div>

      {!bare && onUnit && (
      <footer className="flex flex-wrap justify-between gap-2 border-t border-gold-light px-4 py-3 sm:px-6">
        {prev ? (
          <button type="button" className={`${ui.btnGhost} ${ui.sm}`} onClick={() => onUnit(prev)}>
            <Icon name="chevronLeft" className="h-4 w-4" /> {prev.kind === "spec" ? prev.ref : halfTermLabel(prev.halfTerm)}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" className={`${ui.btnGhost} ${ui.sm}`} onClick={() => onUnit(next)}>
            {next.kind === "spec" ? next.ref : halfTermLabel(next.halfTerm)} <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        )}
      </footer>
      )}
    </article>
  );
}

const stepKey = (k: string) => (/^Y?\d+$/i.test(k) ? `y${k.replace(/^Y/i, "")}` : k.toLowerCase());
function ProgressionView({ sp }: { sp: SubjectPlan }) {
  const threads = sp.syllabus?.progression || [];
  const order = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/75">How the key ideas of {sp.subject.name} build from year to year: the milestone reached by the end of each year.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {threads.map((t) => (
          <section key={t.thread} aria-label={t.thread} className={ui.card}>
            <h3 className={ui.sectionTitle}>{t.thread}</h3>
            <ol className="mt-3 space-y-0 border-l-2 border-teal-100 pl-4">
              {Object.entries(t.steps)
                .sort((a, b) => order.indexOf(stepKey(a[0])) - order.indexOf(stepKey(b[0])))
                .map(([k, v]) => (
                  <li key={k} className="relative pb-3 last:pb-0">
                    <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-500" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">{/^reception$/i.test(k) ? "Reception" : yearLabel(stepKey(k))}</p>
                    <p className="text-sm text-ink">{v}</p>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function ExamsView({ sp }: { sp: SubjectPlan }) {
  return (
    <div className="space-y-4">
      {sp.specs.map(({ slug, info }) => (
        <section key={slug} aria-labelledby={`ex-${slug}`} className={ui.card}>
          <h3 id={`ex-${slug}`} className={ui.sectionTitle}>
            {info.subject}
          </h3>
          <p className="text-sm text-ink/75">{info.label}</p>
          {info.examEntry && (
            <div className="mt-3 rounded-xl border-l-4 border-gold-500 bg-cream px-4 py-3 text-sm">
              <p className="font-semibold text-ink">
                Pupils sit {qualName(info.examEntry.board, info.examEntry.qualification)} ({info.examEntry.code})
              </p>
              {info.examEntry.papers && <p className="mt-1 text-ink/85">{info.examEntry.papers}</p>}
              {info.examEntry.notes.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium text-teal-700">What teachers add or change for the exam ({info.examEntry.notes.length})</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-ink/85">
                    {info.examEntry.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <h4 className={`${eyebrow} mt-4`}>{info.examEntry ? `How ${info.board} ${info.code} is examined` : "How it is examined"}</h4>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {info.assessment.map((a) => (
              <li key={a.paper + a.title} className="rounded-xl border border-gold-light p-3 text-sm">
                <p className="font-semibold text-ink">
                  {a.paper}: {a.title}
                </p>
                <p className="text-xs text-ink/70">
                  {[a.duration, a.marks !== "" ? `${a.marks} marks` : "", a.weight].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-ink/85">{a.content}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
