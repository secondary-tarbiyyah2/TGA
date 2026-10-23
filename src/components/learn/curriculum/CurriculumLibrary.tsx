"use client";

import Link from "next/link";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classColour, myTeachingClasses } from "@/lib/learn/classes";
import { uploadClassFile } from "@/components/learn/class/Attachments";
import { Tabs } from "@/components/learn/Tabs";
import { makeZip, type ZipEntry } from "@/lib/learn/zip";
import { mediaUrl, revisionOverview, unitsForYear, type StaffUnit, type SummarySlide } from "@/lib/learn/revision";
import { UnitResults } from "@/components/learn/revision/UnitResults";
import { PackBuilder, QuestionEditor } from "@/components/learn/revision/PackBuilder";
import {
  LESSON_COLUMNS,
  YEARS,
  downloadDeck,
  fileNameFor,
  pathFor,
  unitFolderName,
  type LessonFileKind,
  replaceDeck,
  saveBlob,
  yearLabel,
  type CurriculumLesson,
  type CurriculumVersion,
} from "@/lib/learn/curriculum";
import { StatusChip, ui } from "@/components/learn/ui";
import { allHubs, boardLabel, hubNodeLessons, matchSpecUnits, matchSyllabusUnits, sameSubject, specFor, syllabusFor } from "@/lib/learn/syllabusIndex";

type ClassOpt = { id: string; name: string };

const btn = `${ui.btnSecondary} ${ui.sm}`;
const btnPrimary = ui.btnPrimary;

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-3">
      <div className={`flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${wide ? "max-w-5xl h-full" : "max-w-lg"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-gold-light px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{title}</p>
          <button type="button" onClick={onClose} className={btn}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

const YEAR_KEY = "tga-library-year";
const KIND_LABEL: Record<LessonFileKind, string> = {
  "slides-pdf": "Slides (PDF)",
  "slides-pptx": "Slides (PowerPoint, editable)",
  "plan-pdf": "Lesson plan (PDF)",
  "plan-docx": "Lesson plan (Word, editable)",
};
const MIME: Record<LessonFileKind, string> = {
  "slides-pdf": "application/pdf",
  "slides-pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "plan-pdf": "application/pdf",
  "plan-docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** "Year 5" / "Reception" / "Y5" -> "y5" / "reception". */
function yearFromName(name: string | null | undefined): string | null {
  const n = String(name || "").toLowerCase();
  if (n.includes("reception")) return "reception";
  const m = n.match(/(?:year|y)\s*(\d{1,2})/);
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 11 ? `y${Number(m[1])}` : null;
}

/** Small drop-down menu of actions. */
function ActionMenu({ label, items, align = "right" }: { label: React.ReactNode; items: { label: string; onClick: () => void; disabled?: boolean }[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element)?.closest?.(`[data-menu="${id}"]`)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, id]);
  return (
    <div className="relative" data-menu={id}>
      <button type="button" className={btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <ul role="menu" className={`absolute z-20 mt-1 min-w-[15rem] rounded-xl border border-gold-light bg-white p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream disabled:opacity-50"
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type UnitGroup = { key: string; subject_slug: string; subject: string; board: string | null; unit: string; lessons: CurriculumLesson[] };
type UnitTab = "lessons" | "spec" | "connections" | "revision" | "results";
const FILTER_KEY = "tga-library-filters";
type Signoff = { subject_slug: string; scope: "spec" | "lesson"; ref: string; status: "in_review" | "approved" | "changes_needed"; note: string | null; checked_name: string | null; checked_at: string };
const SIGNOFF_LABEL: Record<Signoff["status"], string> = { in_review: "In review", approved: "Approved", changes_needed: "Changes needed" };
const signKey = (slug: string, scope: string, ref: string) => `${slug}|${scope}|${ref}`;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A small chip showing who signed a unit or lesson off, or that nobody has yet. */
function SignoffChip({ s }: { s: Signoff | undefined }) {
  if (!s) return <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-ink/65">Not signed off</span>;
  const tone = s.status === "approved" ? "bg-teal-100 text-teal-900" : s.status === "changes_needed" ? "bg-red-100 text-red-900" : "bg-gold-100 text-gold-900";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`} title={s.note || undefined}>
      {SIGNOFF_LABEL[s.status]}
      {s.checked_name ? ` · ${s.checked_name}` : ""} · {when(s.checked_at)}
    </span>
  );
}

/** Record a teacher's check of a specification unit or a lesson. Saved with their name and the date. */
function SignoffDialog({ target, current, onClose, onDone }: { target: { slug: string; scope: "spec" | "lesson"; ref: string; label: string }; current: Signoff | undefined; onClose: () => void; onDone: () => void }) {
  const supabase = getSupabaseClient();
  const [status, setStatus] = useState<Signoff["status"] | "">(current?.status || "approved");
  const [note, setNote] = useState(current?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (clear = false) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("curriculum_set_signoff", { p_subject: target.slug, p_scope: target.scope, p_ref: target.ref, p_status: clear ? null : status || null, p_note: clear ? null : note });
    setBusy(false);
    if (err) return setError("Couldn't save. Only teachers and admins can sign off.");
    onDone();
  };
  return (
    <Modal title={`Sign off: ${target.label}`} onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-ink/75">
          {target.scope === "spec" ? "Record that the specification points for this unit match the board's own document." : "Record that this lesson is accurate, teaches the spec points it claims, and is ready to use."} Your name and today&apos;s date are recorded.
        </p>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-ink">Result</legend>
          {(Object.keys(SIGNOFF_LABEL) as Signoff["status"][]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="radio" name="signoff-status" checked={status === k} onChange={() => setStatus(k)} />
              {SIGNOFF_LABEL[k]}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-semibold text-ink">
          Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light px-3 py-2 text-sm font-normal" placeholder="What you checked, or what needs changing" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !status} onClick={() => save(false)} className={btnPrimary}>
            {busy ? "Saving…" : "Save sign-off"}
          </button>
          {current && (
            <button type="button" disabled={busy} onClick={() => save(true)} className={btn}>
              Clear sign-off
            </button>
          )}
          <button type="button" onClick={onClose} className={btn}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
const boardFamily = (b: string) => (/aqa/i.test(b) ? "AQA" : /edexcel|pearson/i.test(b) ? "Pearson Edexcel" : /ocr/i.test(b) ? "OCR" : "School curriculum");
const unitKey = (subjectSlug: string, unit: string) => `${subjectSlug}::${unit}`;

/**
 * The Lesson library: pick a year, then a unit from the list on the left. Each unit
 * opens with three tabs: its lessons (slides and plans), its revision pack (what
 * pupils revise from) and pupil results (how the class did on the revision quiz).
 */
export function CurriculumLibrary({ area }: { area: "teach" | "admin" }) {
  const supabase = getSupabaseClient();
  const [year, setYearState] = useState<string | null>(null);
  const [myYears, setMyYears] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [lessons, setLessons] = useState<CurriculumLesson[] | null>(null);
  const [packs, setPacks] = useState<StaffUnit[]>([]);
  // Average latest quiz score per revision pack (from revision_overview).
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<string | null>(null);
  // A link can open a particular unit and tab: ?year=y10&subject=…&unit=…&tab=results
  const [linked] = useState(() => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const t = p.get("tab");
    return { year: p.get("year"), subject: p.get("subject"), unit: p.get("unit"), tab: (t === "revision" || t === "results" || t === "spec" || t === "connections" ? t : "lessons") as UnitTab };
  });
  const [tab, setTab] = useState<UnitTab>(linked.tab);
  const [message, setMessage] = useState<string | null>(null);
  const [signoffs, setSignoffs] = useState<Record<string, Signoff>>({});
  const [signing, setSigning] = useState<{ slug: string; scope: "spec" | "lesson"; ref: string; label: string } | null>(null);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const loadSignoffs = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("curriculum_signoffs").select("subject_slug, scope, ref, status, note, checked_name, checked_at").limit(5000);
    setSignoffs(Object.fromEntries(((data as Signoff[]) || []).map((r) => [signKey(r.subject_slug, r.scope, r.ref), r])));
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load sign-offs once
    loadSignoffs();
  }, [loadSignoffs]);
  // Filters, remembered on this device.
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [boardFilter, setBoardFilter] = useState("all");
  useEffect(() => {
    try {
      const f = JSON.parse(window.localStorage.getItem(FILTER_KEY) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved filters once on load
      if (typeof f.subject === "string") setSubjectFilter(f.subject);
      if (typeof f.board === "string") setBoardFilter(f.board);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify({ subject: subjectFilter, board: boardFilter }));
    } catch {
      /* ignore */
    }
  }, [subjectFilter, boardFilter]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<CurriculumLesson | null>(null);
  const [history, setHistory] = useState<CurriculumLesson | null>(null);
  const [sharing, setSharing] = useState<CurriculumLesson | null>(null);
  const [viewing, setViewing] = useState<{ lesson: CurriculumLesson; kind: "slides-pdf" | "plan-pdf"; url: string | null } | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [wanted, setWanted] = useState<{ subject: string | null; unit: string } | null>(linked.unit ? { subject: linked.subject, unit: linked.unit } : null);
  // Making or editing a revision pack (PackBuilder) takes over the main area.
  const [building, setBuilding] = useState<{ packId?: string; initial?: { subject_slug?: string; subject?: string; unit?: string } } | null>(null);

  const setYear = (y: string) => {
    setYearState(y);
    setSelected(null);
    setWanted(null);
    setTab("lessons");
    try {
      window.localStorage.setItem(YEAR_KEY, y);
    } catch {
      /* ignore */
    }
  };

  // Start on a linked unit (?year=&subject=&unit=&tab=), else the year you last
  // looked at, else the year of the first class you teach.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const linkedYear = linked.year;
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(YEAR_KEY);
      } catch {
        /* ignore */
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let mine: string[] = [];
      if (user) {
        mine = [...new Set((await myTeachingClasses()).map((c) => yearFromName(c.year_group_name || c.year_group)).filter(Boolean) as string[])];
        mine.sort((a, b) => YEARS.indexOf(a) - YEARS.indexOf(b));
      }
      if (!alive) return;
      setMyYears(mine);
      setYearState(linkedYear && YEARS.includes(linkedYear) ? linkedYear : saved && YEARS.includes(saved) ? saved : mine[0] || "y7");
    })();
    return () => {
      alive = false;
    };
  }, [supabase, linked.year]);

  const load = useCallback(async () => {
    if (!supabase || !year) return;
    setLessons(null);
    const [{ data, error }, packList] = await Promise.all([
      supabase.from("curriculum_lessons").select(LESSON_COLUMNS).eq("year", year).order("subject").order("lesson_no"),
      unitsForYear(year).catch(() => [] as StaffUnit[]),
    ]);
    setPacks(packList);
    revisionOverview()
      .then((rows) => setScores(Object.fromEntries(rows.map((r) => [r.unit_id, r.avg_pct ?? null]))))
      .catch(() => setScores({}));
    if (error) {
      setMessage("Couldn't load the Lesson library. Refresh to try again.");
      setLessons([]);
      return;
    }
    setLessons((data as unknown as CurriculumLesson[]) || []);
  }, [supabase, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load when the year changes
    load();
  }, [load]);

  // Subjects, each with its units in teaching order.
  const allSubjects = useMemo(() => {
    const bySubject = new Map<string, { slug: string; name: string; units: Map<string, UnitGroup> }>();
    (lessons || []).filter((l) => !approvedOnly || signoffs[signKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status === "approved").forEach((l) => {
      const s = bySubject.get(l.subject_slug) || { slug: l.subject_slug, name: l.subject, units: new Map() };
      const u = l.unit || "Lessons";
      const k = unitKey(l.subject_slug, u);
      const g = s.units.get(u) || { key: k, subject_slug: l.subject_slug, subject: l.subject, board: boardLabel(l.subject_slug, l.board, l.year), unit: u, lessons: [] };
      g.lessons.push(l);
      s.units.set(u, g);
      bySubject.set(l.subject_slug, s);
    });
    // Revision packs with no lessons in the library (e.g. a summary-only unit) still get a place.
    packs.forEach((p) => {
      const s = bySubject.get(p.subject_slug) || { slug: p.subject_slug, name: p.subject, units: new Map() };
      if (!s.units.has(p.unit)) s.units.set(p.unit, { key: unitKey(p.subject_slug, p.unit), subject_slug: p.subject_slug, subject: p.subject, board: null, unit: p.unit, lessons: [] });
      bySubject.set(p.subject_slug, s);
    });
    return [...bySubject.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ ...s, units: [...s.units.values()].sort((a, b) => (a.lessons[0]?.lesson_no ?? 0) - (b.lessons[0]?.lesson_no ?? 0)) }));
  }, [lessons, packs, approvedOnly, signoffs]);

  // Exam boards belong to subjects: once a subject is picked, only its own board(s) are offered.
  // With every subject showing, offer the few board families (AQA, Pearson Edexcel…) instead of every exact title.
  const boards = useMemo(() => {
    const all = allSubjects.filter((s) => subjectFilter === "all" || s.slug === subjectFilter).flatMap((s) => s.units.map((u) => u.board).filter(Boolean) as string[]);
    return [...new Set(subjectFilter === "all" ? all.map(boardFamily) : all)].sort();
  }, [allSubjects, subjectFilter]);
  const subjects = useMemo(
    () =>
      allSubjects
        .filter((s) => subjectFilter === "all" || s.slug === subjectFilter)
        .map((s) => ({ ...s, units: s.units.filter((u) => boardFilter === "all" || u.board === boardFilter || (!!u.board && boardFamily(u.board) === boardFilter)) }))
        .filter((s) => s.units.length > 0),
    [allSubjects, subjectFilter, boardFilter],
  );
  const filtersOn = subjectFilter !== "all" || boardFilter !== "all" || approvedOnly;
  const allUnits = useMemo(() => subjects.flatMap((s) => s.units), [subjects]);
  const packFor = useCallback((g: UnitGroup | undefined) => (g ? packs.find((p) => p.subject_slug === g.subject_slug && p.unit === g.unit) : undefined), [packs]);

  // The unit on show: the one you picked, else the linked one, else the first.
  const wantedKey = wanted ? allUnits.find((u) => u.unit === wanted.unit && (!wanted.subject || u.subject_slug === wanted.subject))?.key : undefined;
  // Nothing chosen yet: the library opens on the overview of every unit.
  const activeKey = selected && allUnits.some((u) => u.key === selected) ? selected : wantedKey || null;
  const current = allUnits.find((u) => u.key === activeKey);
  const currentPack = packFor(current);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (lessons || []).filter((l) => [l.title, l.unit || "", l.subject, ...(l.objectives || [])].some((v) => v.toLowerCase().includes(q)));
  }, [lessons, search]);

  const fetchFile = async (l: CurriculumLesson, kind: LessonFileKind): Promise<Blob | null> => {
    const p = pathFor(l, kind);
    return p ? downloadDeck(p) : null;
  };

  const download = async (l: CurriculumLesson, kind: LessonFileKind) => {
    setBusyId(l.id + kind);
    const blob = await fetchFile(l, kind);
    setBusyId(null);
    if (!blob) return setMessage("Couldn't download that file.");
    saveBlob(new Blob([blob], { type: MIME[kind] }), fileNameFor(l, kind));
  };

  const view = async (l: CurriculumLesson, kind: "slides-pdf" | "plan-pdf") => {
    if (viewing?.url) URL.revokeObjectURL(viewing.url);
    setViewing({ lesson: l, kind, url: null });
    const blob = await fetchFile(l, kind);
    if (!blob) {
      setViewing(null);
      return setMessage("Couldn't open that file.");
    }
    setViewing({ lesson: l, kind, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
  };

  const closeViewer = () => {
    if (viewing?.url) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  };

  const downloadUnit = async (subjectName: string, unit: string, ls: CurriculumLesson[], kinds: LessonFileKind[]) => {
    const key = `unit:${subjectName}:${unit}`;
    setBusyId(key);
    setMessage(null);
    const folder = unitFolderName(ls[0].year, subjectName, unit);
    const entries: ZipEntry[] = [];
    let missing = 0;
    for (const l of ls) {
      for (const k of kinds) {
        if (!pathFor(l, k)) continue;
        const blob = await fetchFile(l, k);
        if (!blob) {
          missing++;
          continue;
        }
        entries.push({ name: `${folder}/${fileNameFor(l, k)}`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
    }
    setBusyId(null);
    if (!entries.length) return setMessage("Nothing to download for that unit yet.");
    saveBlob(makeZip(entries), `${folder}.zip`);
    if (missing) setMessage(`Downloaded the unit, but ${missing} file${missing === 1 ? "" : "s"} couldn't be fetched.`);
  };

  const downloadBooklet = async (ls: CurriculumLesson[], unit: string) => {
    const slug = unit.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "unit";
    setBusyId(`booklet:${unit}`);
    setMessage(null);
    const blob = await downloadDeck(`revision-booklets/${ls[0].subject_slug}/${String(ls[0].year).toLowerCase()}/${slug}.pdf`);
    setBusyId(null);
    if (!blob) return setMessage("The revision booklet for this unit isn't ready yet. It is built automatically after lessons change, so try again shortly.");
    saveBlob(new Blob([blob], { type: "application/pdf" }), `${slug}-revision-booklet.pdf`);
  };

  const openUnit = (key: string, t: UnitTab = "lessons") => {
    setSelected(key);
    setTab(t);
    setSearch("");
    setOpenLesson(null);
  };

  const yearTabs = YEARS.map((y) => ({ key: y, label: myYears.includes(y) ? `${yearLabel(y).replace("Year ", "Y")} •` : yearLabel(y).replace("Year ", "Y") }));

  // Jump from a spec point to the lesson that teaches it (its slides and plan are on the lesson row).
  const openLessonById = (id: string, slug?: string) => {
    const [y, n] = id.split("/");
    const l = (lessons || []).find((x) => String(x.year).toLowerCase() === y && String(x.lesson_no) === n && (!slug || x.subject_slug === slug));
    if (!l) return;
    setSelected(unitKey(l.subject_slug, l.unit || "Lessons"));
    setWanted(null);
    setTab("lessons");
    setOpenLesson(l.id);
  };

  const lessonRow = (l: CurriculumLesson, showUnit = false) => {
    const expanded = openLesson === l.id;
    return (
      <li key={l.id} className="border-t border-gold-light/70 px-4 py-3 first:border-t-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-sm font-semibold tabular-nums text-ink">{l.lesson_no}</span>
          <button type="button" onClick={() => setOpenLesson(expanded ? null : l.id)} aria-expanded={expanded} className="min-w-[12rem] flex-1 text-left">
            <span className="block text-sm font-semibold text-ink">{l.title}</span>
            <span className="block text-xs text-ink/65">
              {showUnit ? `${l.subject} · ${l.unit || "Lessons"}` : ""}
              {!showUnit && (l.objectives || []).length ? `${l.objectives.length} objective${l.objectives.length === 1 ? "" : "s"}` : ""}
              {l.version > 1 && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-900">Edited · v{l.version}</span>}
            </span>
          </button>
          <span className="flex items-center gap-1.5">
            <SignoffChip s={signoffs[signKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]} />
            <button type="button" className={btn} onClick={() => setSigning({ slug: l.subject_slug, scope: "lesson", ref: `${l.year}/${l.lesson_no}`, label: `${l.subject}, lesson ${l.lesson_no}: ${l.title}` })}>
              Sign off
            </button>
          </span>
          {l.deck_path ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {l.pdf_path && (
                <button type="button" className={btnPrimary} onClick={() => view(l, "slides-pdf")}>
                  View slides
                </button>
              )}
              {l.plan_pdf_path && (
                <button type="button" className={btn} onClick={() => view(l, "plan-pdf")}>
                  Lesson plan
                </button>
              )}
              <ActionMenu
                label={busyId?.startsWith(l.id) ? "Downloading…" : "Download"}
                items={(Object.keys(KIND_LABEL) as LessonFileKind[]).filter((k) => pathFor(l, k)).map((k) => ({ label: KIND_LABEL[k], onClick: () => download(l, k) }))}
              />
              <button type="button" className={btn} onClick={() => setSharing(l)}>
                Share to class
              </button>
              <ActionMenu
                label={<span aria-label="More actions">⋯</span>}
                items={[
                  { label: "Upload my edited version", onClick: () => setReplacing(l) },
                  { label: "Version history", onClick: () => setHistory(l) },
                ]}
              />
            </div>
          ) : (
            <span className="text-xs text-ink/65">Slides not built yet</span>
          )}
        </div>
        {expanded && (l.objectives || []).length > 0 && (
          <ul className="ml-12 mt-2 list-disc space-y-0.5 pl-4 text-sm text-ink/80">
            {l.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Year group</p>
          {myYears.length > 0 && <p className="text-xs text-ink/65">• = a year you teach</p>}
        </div>
        {year && <Tabs variant="switch" items={yearTabs} value={year} onChange={setYear} label="Year group" />}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${year ? yearLabel(year) : ""} lessons by title, unit or objective`}
            aria-label="Search lessons"
            className="min-w-0 flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm"
          />
          <p className="text-sm text-ink/65" aria-live="polite">
            {!lessons ? "Loading…" : results ? `${results.length} match${results.length === 1 ? "" : "es"}` : `${lessons.length} lessons · ${allUnits.length} units`}
          </p>
          {year && !building && (
            <button type="button" className={btn} onClick={() => setBuilding({})}>
              + New revision pack
            </button>
          )}
        </div>
      </div>

      {(allSubjects.length > 1 || boards.length > 1) && (
        <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4" role="group" aria-label="Filters">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/65">Subject</p>
            <div className="flex flex-wrap gap-2">
              {[{ slug: "all", name: "All subjects", n: allSubjects.reduce((t, x) => t + x.units.length, 0) }, ...allSubjects.map((x) => ({ slug: x.slug, name: x.name, n: x.units.length }))].map((x) => {
                const on = subjectFilter === x.slug;
                return (
                  <button
                    key={x.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSubjectFilter(x.slug);
                      setBoardFilter("all");
                      setSelected(null);
                      setWanted(null);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-teal-700 bg-teal-700 font-semibold text-white" : "border-gold-light bg-white text-ink hover:bg-cream"}`}
                  >
                    {x.slug !== "all" && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-white/70" style={{ backgroundColor: classColour(x.slug) }} />}
                    {x.name}
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/25" : "bg-cream text-ink/65"}`}>{x.n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {boards.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink/65">Exam board</span>
                {subjectFilter === "all" && boards.length > 1 && (
                  <>
                    <button type="button" aria-pressed={boardFilter === "all"} onClick={() => setBoardFilter("all")} className={`rounded-full border px-3 py-1 text-sm ${boardFilter === "all" ? "border-gold-500 bg-gold-100 font-semibold text-gold-900" : "border-gold-light text-ink hover:bg-cream"}`}>
                      Any
                    </button>
                  </>
                )}
                {boards.length > 1 || subjectFilter === "all" ? (
                  boards.map((bd) => (
                    <button key={bd} type="button" aria-pressed={boardFilter === bd} onClick={() => setBoardFilter(boardFilter === bd ? "all" : bd)} className={`max-w-[18rem] truncate rounded-full border px-3 py-1 text-sm ${boardFilter === bd ? "border-gold-500 bg-gold-100 font-semibold text-gold-900" : "border-gold-light text-ink hover:bg-cream"}`} title={bd}>
                      {bd}
                    </button>
                  ))
                ) : (
                  <span className="rounded-full bg-gold-100 px-3 py-1 text-sm font-semibold text-gold-900">{boards[0]}</span>
                )}
              </div>
            )}
            <button
              type="button"
              aria-pressed={approvedOnly}
              onClick={() => {
                setApprovedOnly(!approvedOnly);
                setSelected(null);
                setWanted(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${approvedOnly ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink hover:border-teal-700"}`}
            >
              {approvedOnly ? "✓ " : ""}Signed-off lessons
            </button>
            {filtersOn && (
              <button
                type="button"
                className={`ml-auto ${ui.btnLink}`}
                onClick={() => {
                  setSubjectFilter("all");
                  setBoardFilter("all");
                  setApprovedOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {building && year && (
        <PackBuilder
          key={building.packId || "new"}
          year={year}
          yearLabel={yearLabel(year)}
          subjects={subjects.map((x) => ({ slug: x.slug, name: x.name }))}
          initial={building.initial}
          packId={building.packId}
          onCancel={() => {
            setBuilding(null);
            load();
          }}
          onDone={() => {
            setBuilding(null);
            load();
          }}
        />
      )}

      {message && (
        <p role="status" className="rounded-lg border border-gold-light bg-cream px-3 py-2 text-sm text-ink/80">
          {message}
        </p>
      )}

      {lessons === null && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
      {!building && lessons && allUnits.length === 0 && <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No lessons for this year yet.</p>}

      {!building && lessons && allUnits.length > 0 && !activeKey && !results && (
        <div className="space-y-6">
          {subjects.map((sub) => (
            <section key={sub.slug} aria-labelledby={`subj-${sub.slug}`}>
              <h2 id={`subj-${sub.slug}`} className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink/70">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: classColour(sub.slug) }} />
                {sub.name}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sub.units.map((u) => {
                  const p = packFor(u);
                  const avg = p ? scores[p.id] : undefined;
                  return (
                    <li key={u.key} className="flex flex-col overflow-hidden rounded-2xl border border-gold-light bg-white transition hover:shadow-sm">
                      <span aria-hidden="true" className="h-1.5" style={{ backgroundColor: classColour(sub.slug) }} />
                      <button type="button" onClick={() => openUnit(u.key)} className="flex-1 px-4 pb-2 pt-3 text-left">
                        <span className="block font-semibold text-ink">{u.unit}</span>
                        <span className="mt-0.5 block text-xs text-ink/65">
                          {u.lessons.length ? `${u.lessons.length} lesson${u.lessons.length === 1 ? "" : "s"}` : "Revision only"}
                          {u.board ? ` · ${u.board}` : ""}
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 border-t border-gold-light/60 px-4 py-2.5">
                        {p ? (
                          <>
                            <StatusChip tone={p.published ? "good" : "neutral"}>{p.published ? "Revision live" : "Revision hidden"}</StatusChip>
                            <span className="text-xs text-ink/65">
                              {p.questions} questions
                              {p.takers ? ` · ${p.takers} pupils · avg ${avg ?? "–"}%` : ""}
                            </span>
                            <button type="button" onClick={() => openUnit(u.key, p.takers ? "results" : "revision")} className={`ml-auto ${ui.btnLink}`}>
                              {p.takers ? "Results" : "Open"}
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setBuilding({ initial: { subject_slug: u.subject_slug, subject: u.subject, unit: u.unit } })} className={`${ui.btnSecondary} ${ui.sm}`}>
                            + Add summary and quiz
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!building && lessons && allUnits.length > 0 && (activeKey || results) && (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Units: a list on wide screens, a drop-down on phones. */}
          <div className="lg:hidden">
            <button type="button" onClick={() => { setSelected(null); setWanted(null); setSearch(""); }} className={`mb-2 ${ui.btnLink}`}>
              ‹ All units
            </button>
            <label className="block text-sm font-semibold text-ink">
              Unit
              <select value={activeKey || ""} onChange={(e) => openUnit(e.target.value, tab)} className="mt-1 block w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm">
                {subjects.map((s) => (
                  <optgroup key={s.slug} label={s.name}>
                    {s.units.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.unit}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          <nav aria-label="Units" className="hidden max-h-[75vh] space-y-4 self-start overflow-y-auto rounded-2xl border border-gold-light bg-white p-3 lg:sticky lg:top-[76px] lg:block">
            <button type="button" onClick={() => { setSelected(null); setWanted(null); setSearch(""); }} className={`px-2 ${ui.btnLink}`}>
              ‹ All units
            </button>
            {subjects.map((s) => (
              <div key={s.slug}>
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/65">{s.name}</p>
                <ul className="space-y-0.5">
                  {s.units.map((u) => {
                    const p = packFor(u);
                    const active = u.key === activeKey && !results;
                    return (
                      <li key={u.key}>
                        <button
                          type="button"
                          onClick={() => openUnit(u.key, tab)}
                          aria-current={active ? "true" : undefined}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${active ? "bg-teal-100 font-semibold text-teal-900" : "text-ink/85 hover:bg-cream"}`}
                        >
                          <span className="min-w-0 flex-1">{u.unit}</span>
                          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs font-normal text-ink/65">
                            {u.lessons.length > 0 && <span className="tabular-nums">{u.lessons.length}</span>}
                            {p && <span title={p.takers ? `${p.takers} pupils have revised` : "Revision pack ready"} className={`h-2 w-2 rounded-full ${p.takers ? "bg-teal-700" : "bg-gold-500"}`} />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="flex items-center gap-1.5 border-t border-gold-light px-2 pt-2 text-xs text-ink/65">
              <span className="h-2 w-2 rounded-full bg-gold-500" /> revision pack
              <span className="ml-2 h-2 w-2 rounded-full bg-teal-700" /> pupils have revised
            </p>
          </nav>

          <div className="min-w-0 space-y-3">
            {results ? (
              <section aria-label="Search results" className="overflow-hidden rounded-2xl border border-gold-light bg-white">
                {results.length === 0 ? (
                  <p className="p-8 text-center text-sm text-ink/70">No lessons match. Try other words or another year.</p>
                ) : (
                  <ol>{results.map((l) => lessonRow(l, true))}</ol>
                )}
              </section>
            ) : (
              current && (
                <section aria-label={current.unit} className="space-y-3">
                  <div className="rounded-2xl border border-gold-light bg-white p-4">
                    <p className="text-xs text-ink/65">
                      {current.subject}
                      {current.board ? ` · ${current.board}` : ""}
                    </p>
                    <h2 className="text-h3 font-semibold text-ink">{current.unit}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink/65">
                        {current.lessons.length} lesson{current.lessons.length === 1 ? "" : "s"}
                      </span>
                      {currentPack && (
                        <Link href={`/${area}/revision`} className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-900 hover:bg-gold-300/60" title="Open the revision results">
                          Revision pack · {currentPack.questions} quiz questions{currentPack.takers ? ` · ${currentPack.takers} pupils` : ""} →
                        </Link>
                      )}
                      <span className="flex-1" />
                      {current.lessons.length > 0 && (
                        <ActionMenu
                          label={busyId === `unit:${current.subject}:${current.unit}` ? "Preparing…" : "Download unit"}
                          items={[
                            { label: "Revision booklet (PDF)", onClick: () => downloadBooklet(current.lessons, current.unit) },
                            { label: "PDFs: slides + lesson plans (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, ["slides-pdf", "plan-pdf"]) },
                            { label: "PDFs: slides only (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, ["slides-pdf"]) },
                            { label: "PDFs: lesson plans only (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, ["plan-pdf"]) },
                            { label: "Editable: PowerPoint + Word (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, ["slides-pptx", "plan-docx"]) },
                            { label: "Everything: PDFs + editable (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, ["slides-pdf", "plan-pdf", "slides-pptx", "plan-docx"]) },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                  <Tabs
                    items={[
                      { key: "lessons" as UnitTab, label: "Lessons", count: current.lessons.length },
                      { key: "spec" as UnitTab, label: "Spec points" },
                      { key: "connections" as UnitTab, label: "Connections" },
                      { key: "revision" as UnitTab, label: "Revision pack" },
                      { key: "results" as UnitTab, label: "Pupil results", count: currentPack?.takers || undefined },
                    ]}
                    value={tab}
                    onChange={setTab}
                    label="Unit"
                  />
                  {tab === "lessons" &&
                    (current.lessons.length ? (
                      <ol className="overflow-hidden rounded-2xl border border-gold-light bg-white">{current.lessons.map((l) => lessonRow(l))}</ol>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">This unit is a revision pack only; its summary and video are on the Revision pack tab.</p>
                    ))}
                  {tab === "spec" && <SpecPanel slug={current.subject_slug} unit={current.unit} year={year || ""} signoffs={signoffs} onSign={(ref, label) => setSigning({ slug: current.subject_slug, scope: "spec", ref, label })} onOpenLesson={openLessonById} />}
                  {tab === "connections" && <ConnectionsPanel subject={current.subject} unit={current.unit} onOpenLesson={(id, slug) => openLessonById(id, slug)} />}
                  {tab === "revision" && (
                    <RevisionPackPanel
                      pack={currentPack}
                      onChanged={load}
                      onBuild={() =>
                        setBuilding(currentPack ? { packId: currentPack.id } : { initial: { subject_slug: current.subject_slug, subject: current.subject, unit: current.unit } })
                      }
                    />
                  )}
                  {tab === "results" &&
                    (currentPack ? (
                      <UnitResults key={currentPack.id} unitId={currentPack.id} />
                    ) : (
                      <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">This unit has no revision pack yet, so there are no pupil results.</p>
                    ))}
                </section>
              )
            )}
          </div>
        </div>
      )}

      {viewing && (
        <Modal title={`${viewing.lesson.title}: ${viewing.kind === "plan-pdf" ? "lesson plan" : "slides"}`} onClose={closeViewer} wide>
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-2">
              <Tabs
                variant="switch"
                items={[
                  { key: "slides-pdf", label: "Slides" },
                  ...(viewing.lesson.plan_pdf_path ? [{ key: "plan-pdf", label: "Lesson plan" }] : []),
                ]}
                value={viewing.kind}
                onChange={(k) => view(viewing.lesson, k as "slides-pdf" | "plan-pdf")}
                label="Show"
              />
              <span className="flex-1" />
              {viewing.url && (
                <a href={viewing.url} target="_blank" rel="noopener noreferrer" className={btn}>
                  Open full screen
                </a>
              )}
              <button type="button" className={btn} onClick={() => download(viewing.lesson, viewing.kind)}>
                Download
              </button>
            </div>
            {viewing.url ? (
              <iframe src={viewing.url} title={viewing.lesson.title} className="min-h-[70vh] w-full flex-1 border-0" />
            ) : (
              <p className="p-8 text-center text-sm text-ink/65">Opening…</p>
            )}
          </div>
        </Modal>
      )}
      {signing && (
        <SignoffDialog
          target={signing}
          current={signoffs[signKey(signing.slug, signing.scope, signing.ref)]}
          onClose={() => setSigning(null)}
          onDone={() => {
            setSigning(null);
            setMessage("Sign-off saved.");
            loadSignoffs();
          }}
        />
      )}
      {replacing && (
        <ReplaceDialog
          lesson={replacing}
          onClose={() => setReplacing(null)}
          onDone={() => {
            setReplacing(null);
            setMessage("New version saved. Everyone now sees your edited deck.");
            load();
          }}
        />
      )}
      {history && (
        <HistoryDialog
          lesson={history}
          onClose={() => setHistory(null)}
          onChanged={() => {
            setHistory(null);
            setMessage("Version restored.");
            load();
          }}
        />
      )}
      {sharing && <ShareDialog lesson={sharing} area={area} onClose={() => setSharing(null)} onDone={(n) => { setSharing(null); setMessage(`Shared to ${n}. Pupils will see it under Classwork.`); }} />}
    </div>
  );
}

type PackQuestion = { id: string; topic: string; lesson_no: number | null; question: string; options: string[]; answer: number; explanation: string | null; in_quiz: boolean };

/** The whole specification for this subject, laid out like the board's own document, with the units this lesson unit seems to cover opened first. Matching is by name, so treat it as a suggestion. */
function SpecPanel({ slug, unit, year, signoffs, onSign, onOpenLesson }: { slug: string; unit: string; year: string; signoffs: Record<string, Signoff>; onSign: (ref: string, label: string) => void; onOpenLesson: (id: string) => void }) {
  const spec = specFor(slug);
  const syl = syllabusFor(slug);
  const matches = useMemo(() => matchSpecUnits(slug, unit), [slug, unit]);
  const matchRefs = useMemo(() => new Set(matches.map((m) => m.ref)), [matches]);
  const [q, setQ] = useState("");
  const [openRefs, setOpenRefs] = useState<Set<string> | null>(null);
  const [view, setView] = useState<"unit" | "all">("unit");
  if (!spec && !syl) return <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No specification or syllabus is loaded for this subject yet.</p>;

  if (!spec && syl) {
    const here = matchSyllabusUnits(slug, year, unit);
    const list = view === "unit" && here.length ? here : syl.years[year] || [];
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-gold-light bg-cream px-3 py-2 text-xs text-ink/75">
          {syl.framework} · {view === "unit" && here.length ? "Units for this lesson unit." : `All ${yearLabel(year)} units.`}
        </p>
        {here.length > 0 && <Tabs variant="switch" items={[{ key: "unit", label: "This unit" }, { key: "all", label: `All ${yearLabel(year)}` }]} value={view} onChange={(k) => setView(k as "unit" | "all")} label="Show" />}
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No syllabus units for {yearLabel(year)} in this subject.</p>}
        {list.map((u) => (
          <section key={u.unit} className="rounded-2xl border border-gold-light bg-white p-4">
            <h3 className="text-sm font-semibold text-ink">{u.unit}</h3>
            {u.focus.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/85">
                {u.focus.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {u.skills.length > 0 && <p className="mt-2 text-xs text-ink/70"><strong>Skills:</strong> {u.skills.join("; ")}</p>}
            {u.keyTerms.length > 0 && <p className="mt-1 text-xs text-ink/70"><strong>Key terms:</strong> {u.keyTerms.join(", ")}</p>}
            {u.assess && <p className="mt-1 text-xs text-ink/70"><strong>Assessment:</strong> {u.assess}</p>}
          </section>
        ))}
      </div>
    );
  }

  if (!spec) return null;
  const ql = q.trim().toLowerCase();
  const visible = spec.units.filter((u) => !ql || `${u.ref} ${u.title} ${u.points.join(" ")}`.toLowerCase().includes(ql));
  const groups = new Map<string, typeof visible>();
  visible.forEach((u) => {
    const k = u.paper || "Units";
    groups.set(k, [...(groups.get(k) || []), u]);
  });
  const isOpen = (u: { ref: string }) => (openRefs ? openRefs.has(u.ref) : matchRefs.has(u.ref)) || (!!ql && visible.length <= 8);
  const toggle = (ref: string) => {
    const base = openRefs ? new Set(openRefs) : new Set(matchRefs);
    if (base.has(ref)) base.delete(ref);
    else base.add(ref);
    setOpenRefs(base);
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gold-light bg-cream px-3 py-2 text-xs text-ink/75">
        <strong>
          {spec.board} {spec.code}
        </strong>{" "}
        · {spec.qualification}
        {spec.tiers ? ` · ${spec.tiers}` : ""}
      </div>

      <details className="rounded-2xl border border-gold-light bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How it is assessed ({spec.assessment.length} paper{spec.assessment.length === 1 ? "" : "s"}{spec.nonExam && !/^none/i.test(spec.nonExam) ? " + non-exam" : ""})</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/65">
              <tr>
                <th className="py-1 pr-3">Paper</th>
                <th className="py-1 pr-3">Time</th>
                <th className="py-1 pr-3">Marks</th>
                <th className="py-1 pr-3">Weight</th>
                <th className="py-1">Covers</th>
              </tr>
            </thead>
            <tbody>
              {spec.assessment.map((a) => (
                <tr key={a.paper} className="border-t border-gold-light/70 align-top">
                  <td className="py-1.5 pr-3 font-semibold">
                    {a.paper}
                    {a.title ? <span className="block text-xs font-normal text-ink/65">{a.title}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3">{a.duration}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{a.marks}</td>
                  <td className="py-1.5 pr-3">{a.weight}</td>
                  <td className="py-1.5 text-ink/80">{a.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {spec.nonExam && !/^none/i.test(spec.nonExam) && <p className="mt-2 text-sm text-ink/80"><strong>Non-exam:</strong> {spec.nonExam}</p>}
        {spec.aos.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-ink/80">
            {spec.aos.map((a) => (
              <li key={a.code}>
                <strong>{a.code}</strong> ({a.weight}): {a.desc}
              </li>
            ))}
          </ul>
        )}
        {spec.commandWords.length > 0 && (
          <p className="mt-2 text-xs text-ink/70">
            <strong>Command words:</strong> {spec.commandWords.map((c) => `${c.word} (${c.meaning})`).join("; ")}
          </p>
        )}
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this specification" placeholder={`Search ${spec.units.length} units and points`} className="min-w-0 flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm" />
        <button type="button" className={btn} onClick={() => setOpenRefs(new Set(spec.units.map((u) => u.ref)))}>
          Expand all
        </button>
        <button type="button" className={btn} onClick={() => setOpenRefs(new Set())}>
          Collapse all
        </button>
      </div>
      {matches.length > 0 && !ql && (
        <p className="text-xs text-ink/65">
          Opened for this unit: {matches.map((m) => m.ref).join(", ")}
        </p>
      )}
      {visible.length === 0 && <p className="rounded-2xl border border-dashed border-gold-light bg-white p-6 text-center text-sm text-ink/70">Nothing in the specification matches “{q}”.</p>}
      {[...groups.entries()].map(([paper, us]) => (
        <section key={paper} aria-label={paper} className="overflow-hidden rounded-2xl border border-gold-light bg-white">
          <h3 className="border-b border-gold-light bg-cream px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink/65">
            {paper} · {us.length} unit{us.length === 1 ? "" : "s"}
          </h3>
          <ul>
            {us.map((u) => {
              const open = isOpen(u);
              const hit = matchRefs.has(u.ref);
              return (
                <li key={u.ref} className={`border-t border-gold-light/70 first:border-t-0 ${hit ? "bg-teal-50" : ""}`}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(u.ref)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left">
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-ink/70">{u.ref}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                      {u.title}
                      {hit && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">this unit</span>}
                      <span className="block text-xs font-normal text-ink/65">
                        {[u.year, `${u.points.length} points`, u.pl?.length ? `${u.pl.filter((x) => x.length).length}/${u.points.length} have a lesson` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span aria-hidden="true" className="pt-0.5 text-ink/65">{open ? "–" : "+"}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 pl-[4.5rem]">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <SignoffChip s={signoffs[signKey(slug, "spec", u.ref)]} />
                        <button type="button" className={btn} onClick={() => onSign(u.ref, `${spec.board} ${u.ref} ${u.title}`)}>
                          Sign off this unit
                        </button>
                      </div>
                      <ol className="list-none space-y-1 text-sm text-ink/85">
                        {u.points.map((p, i) => (
                          <li key={p} className="flex gap-2">
                            <span className="w-10 shrink-0 font-mono text-xs text-ink/65">
                              {u.ref}.{i + 1}
                            </span>
                            <span className="min-w-0 flex-1">{p}</span>
                            {u.pl?.[i]?.length ? (
                              <span className="shrink-0 text-xs text-teal-800" title="Open the lesson and its slides">
                                {u.pl[i].map((id) => (
                                  <button key={id} type="button" onClick={() => onOpenLesson(id)} className="mr-1.5 underline decoration-teal-700/40 underline-offset-2 hover:text-teal-950">
                                    {id.replace("y", "Y").replace("/", " L")}
                                  </button>
                                ))}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-red-50 px-2 text-xs text-red-800" title="No lesson yet">
                                no lesson yet
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Cross-curricular links as a map: subjects sit round a circle, a line joins two subjects for every teaching hub they share,
 * and picking a subject lists just the hubs that join it to this one.
 */
function ConnectionsPanel({ subject, unit, onOpenLesson }: { subject: string; unit: string; onOpenLesson: (id: string, slug: string) => void }) {
  const hubs = allHubs();
  const names = useMemo(() => {
    const m = new Map<string, string>();
    hubs.forEach((h) => h.nodes.forEach((n) => m.set(n.subject.toLowerCase(), n.subject)));
    return [...m.values()].sort();
  }, [hubs]);
  const home = names.find((n) => sameSubject(n, subject)) || null;
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const R = 118;
  const C = 150;
  const pos = (i: number) => {
    const a = (i / names.length) * Math.PI * 2 - Math.PI / 2;
    return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
  };
  const shared = (a: string, b: string) => hubs.filter((h) => h.nodes.some((n) => n.subject === a) && h.nodes.some((n) => n.subject === b));
  const uw = useMemo(() => new Set(unit.toLowerCase().split(/\W+/).filter((w) => w.length > 3)), [unit]);
  const score = (h: (typeof hubs)[number]) => h.nodes.filter((n) => home && n.subject === home).reduce((t, n) => t + `${n.ref} ${n.note}`.toLowerCase().split(/\W+/).filter((w) => uw.has(w)).length, 0);
  if (!home) return <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No cross-curricular hubs include this subject yet.</p>;
  const openHub = hubs.find((h) => h.id === open) || null;
  const list = (pick ? shared(home, pick) : hubs.filter((h) => h.nodes.some((n) => n.subject === home))).sort((a, b) => score(b) - score(a));
  const edges: { a: number; b: number; n: number; on: boolean }[] = [];
  names.forEach((a, i) =>
    names.forEach((b, j) => {
      if (j <= i) return;
      const n = shared(a, b).length;
      if (n) edges.push({ a: i, b: j, n, on: a === home || b === home });
    }),
  );
  return (
    <div className="grid gap-4 md:grid-cols-[24rem_minmax(0,1fr)]">
      <div>
        <svg viewBox="-60 -8 420 316" role="img" aria-label={`Map of cross-curricular links around ${home}`} className="w-full max-w-[24rem]">
          {edges.map((e) => {
            const p = pos(e.a);
            const q = pos(e.b);
            const sel = pick && ((names[e.a] === home && names[e.b] === pick) || (names[e.b] === home && names[e.a] === pick));
            return <line key={`${e.a}-${e.b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={sel ? "#0f766e" : e.on ? "#0f766e" : "#c9c2b3"} strokeWidth={sel ? 4 : e.on ? 1 + e.n : 0.6 + e.n * 0.4} strokeOpacity={sel ? 1 : e.on ? 0.55 : 0.35} />;
          })}
          {names.map((n, i) => {
            const p = pos(i);
            const isHome = n === home;
            const linked = !isHome && shared(home, n).length > 0;
            const on = pick === n;
            const left = p.x < C - 8;
            const right = p.x > C + 8;
            return (
              <g key={n} onClick={() => linked && setPick(on ? null : n)} style={{ cursor: linked ? "pointer" : "default" }} role={linked ? "button" : undefined} tabIndex={linked ? 0 : undefined} aria-label={linked ? `${n}: ${shared(home, n).length} shared hubs` : n} onKeyDown={(e) => linked && (e.key === "Enter" || e.key === " ") && setPick(on ? null : n)}>
                <circle cx={p.x} cy={p.y} r={isHome ? 11 : on ? 9 : 7} fill={isHome ? "#0f766e" : on ? "#b8892b" : linked ? "#ffffff" : "#e5e0d4"} stroke={isHome || linked ? "#0f766e" : "#c9c2b3"} strokeWidth={2} />
                <text x={p.x + (left ? -13 : right ? 13 : 0)} y={p.y + (left || right ? 4 : p.y < C ? -14 : 20)} textAnchor={left ? "end" : right ? "start" : "middle"} fontSize="10" fontWeight={isHome || on ? 700 : 400} fill="currentColor">
                  {n.replace("English ", "Eng. ")}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-ink/65">Thick lines join {home} to other subjects. Click a subject to see the hubs you share with it.</p>
        {pick && (
          <button type="button" className={ui.btnLink} onClick={() => setPick(null)}>
            Show all {home} hubs
          </button>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">
          {pick ? `${home} + ${pick}` : `Hubs involving ${home}`} · {list.length}
        </p>
        {openHub ? (
          <div className="space-y-3">
            <button type="button" className={ui.btnLink} onClick={() => setOpen(null)}>
              ← All hubs
            </button>
            <div className="rounded-2xl bg-teal-900 p-5 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">Big idea for pupils</p>
              <h3 className="mt-1 font-serif text-xl font-semibold">{openHub.title}</h3>
              <p className="mt-1 text-sm text-white/85">{openHub.hook}</p>
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm">
                <strong>Challenge:</strong> find one fact about this idea in each subject below, then explain in two sentences how they fit together.
              </p>
            </div>
            <ul className="space-y-2">
              {openHub.nodes.map((n) => {
                const hl = hubNodeLessons(n.subject, n.ref);
                return (
                  <li key={`${n.subject}-${n.ref}`} className={`rounded-xl border px-4 py-3 text-sm ${n.subject === home ? "border-teal-700 bg-teal-50" : "border-gold-light bg-white"}`}>
                    <span className="font-semibold text-ink">
                      {n.subject} <span className="font-normal text-ink/65">({n.ref})</span>
                    </span>
                    <span className="block text-ink/80">{n.note}</span>
                    <span className="mt-1 block text-xs italic text-ink/65">Ask pupils: what does {n.subject} add to the story of “{openHub.title}”?</span>
                    {hl && hl.ids.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {hl.ids.slice(0, 6).map((id) => (
                          <button key={id} type="button" className="rounded-full border border-teal-700/40 bg-white px-2.5 py-0.5 text-xs font-medium text-teal-900 hover:bg-teal-50" onClick={() => onOpenLesson(id, hl.slug)}>
                            {id.replace("y", "Y").replace("/", " L")}
                          </button>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          list.map((h) => (
            <button key={h.id} type="button" onClick={() => setOpen(h.id)} className="flex w-full items-start gap-3 rounded-2xl border border-gold-light bg-white px-4 py-3 text-left hover:border-teal-700">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{h.title}</span>
                <span className="block text-sm text-ink/70">{h.hook}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {h.nodes.map((n) => (
                    <span key={`${n.subject}-${n.ref}`} className={`rounded-full px-2 py-0.5 text-[11px] ${n.subject === home ? "bg-teal-100 font-semibold text-teal-900" : "bg-cream text-ink/75"}`}>
                      {n.subject}
                    </span>
                  ))}
                </span>
              </span>
              <span aria-hidden="true" className="pt-1 text-sm font-semibold text-teal-800">Open →</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** What pupils revise from for this unit: status, the quiz questions with answers, and a switch to hide it. */
function RevisionPackPanel({ pack, onChanged, onBuild }: { pack: StaffUnit | undefined; onChanged: () => void; onBuild: () => void }) {
  const supabase = getSupabaseClient();
  const [qs, setQs] = useState<PackQuestion[] | null>(null);
  // The pack's videos: one per chapter for chaptered packs, otherwise the unit video.
  const [videos, setVideos] = useState<{ path: string; label: string }[]>([]);
  const [chapter, setChapter] = useState(0);
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !pack) return;
    let alive = true;
    (async () => {
      const [{ data }, { data: unit }] = await Promise.all([
        supabase.from("revision_questions").select("id, topic, lesson_no, question, options, answer, explanation, in_quiz").eq("unit_id", pack.id).eq("active", true).order("lesson_no").order("qkey"),
        supabase.from("revision_units").select("video_path, summary").eq("id", pack.id).maybeSingle(),
      ]);
      if (!alive) return;
      setQs((data as PackQuestion[]) || []);
      const u = unit as { video_path: string | null; summary: SummarySlide[] | null } | null;
      const chapters = (u?.summary || []).flatMap((x, k) => (x.video_path ? [{ path: x.video_path, label: `Chapter ${k + 1}: ${x.title}${x.length ? ` (${x.length})` : ""}` }] : []));
      setVideos(chapters.length ? chapters : u?.video_path ? [{ path: u.video_path, label: "Unit video" }] : []);
      setChapter(0);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, pack]);

  const videoPath = videos[chapter]?.path || null;
  useEffect(() => {
    if (!videoPath) return;
    let alive = true;
    mediaUrl(videoPath).then((url) => alive && setLoaded({ path: videoPath, url }));
    return () => {
      alive = false;
    };
  }, [videoPath]);
  const video = loaded && loaded.path === videoPath ? loaded.url : null;

  if (!pack)
    return (
      <div className="space-y-2 rounded-2xl border border-dashed border-gold-light bg-white p-6 text-sm text-ink/75">
        <p className="font-semibold text-ink">No revision pack for this unit yet.</p>
        <p>
          A pack is made automatically once the unit&apos;s lessons have at least four hinge questions (the “check” slides). Or make one yourself: upload a summary video, mark its chapters and add
          quiz questions.
        </p>
        <button type="button" className={btnPrimary} onClick={onBuild}>
          Make a revision pack
        </button>
      </div>
    );

  const togglePublished = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("revision_units").update({ published: !pack.published }).eq("id", pack.id);
    setBusy(false);
    if (err) return setError("Couldn't change that. Only teachers and the head can.");
    onChanged();
  };

  const quiz = (qs || []).filter((q) => q.in_quiz);
  const topics = [...new Set(quiz.map((q) => q.topic))];
  const letters = "ABCDEF";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold-light bg-white p-4">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pack.published ? "bg-green-50 text-green-800 ring-1 ring-green-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>
          {pack.published ? "Pupils can see this pack" : "Hidden from pupils"}
        </span>
        <span className="text-sm text-ink/75">
          {pack.kind === "summary" ? "Summary slides" : "The unit's lesson slides"}
          {pack.has_video ? " · video" : ""} · {pack.questions} quiz questions · {pack.practice_questions} extra practice questions from the key words
        </span>
        <span className="flex-1" />
        {pack.source === "staff" ? (
          <button type="button" className={btnPrimary} onClick={onBuild}>
            Edit pack
          </button>
        ) : (
          <button type="button" className={btn} disabled={busy} onClick={togglePublished}>
            {pack.published ? "Hide from pupils" : "Show to pupils"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="rounded-2xl border border-gold-light bg-white p-4 text-sm text-ink/75">
        <p className="font-semibold text-ink">How pupils use it</p>
        <p>
          Under <strong>Unit revision</strong> pupils see this unit for their year. They revise from the {pack.kind === "summary" ? "summary slides and video" : "lesson slides"}, take the quiz (marked on the
          server, so answers never reach their browser early), then the practice coach works on their weakest topics with hints. No AI is involved; every question comes from the teacher-checked lessons.
        </p>
      </div>
      {videos.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-gold-light bg-white p-3">
          {videos.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              Video
              <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className="min-w-0 flex-1 rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                {videos.map((v, k) => (
                  <option key={v.path} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {video ? (
            <video key={videoPath} src={video} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-ink" />
          ) : (
            <div role="status" className="flex aspect-video w-full items-center justify-center rounded-lg bg-cream text-sm text-ink/65">
              Loading the video…
            </div>
          )}
        </div>
      )}
      {pack.source !== "staff" && (
        <details className="rounded-2xl border border-gold-light bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Add your own question to this pack</summary>
          <p className="mt-1 text-sm text-ink/70">Questions you add here are kept when the pack is updated.</p>
          <div className="mt-3">
            <QuestionEditor unitId={pack.id} topics={topics} questions={[]} onChange={() => onChanged()} onError={setError} />
          </div>
        </details>
      )}
      {qs === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      ) : (
        topics.map((t) => (
          <section key={t} aria-label={t} className="rounded-2xl border border-gold-light bg-white p-4">
            <h3 className="mb-2 font-semibold text-ink">{t}</h3>
            <ol className="space-y-3">
              {quiz
                .filter((q) => q.topic === t)
                .map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="font-medium text-ink">{q.question}</p>
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                      {q.options.map((o, i) => (
                        <li key={i} className={`rounded-md px-2 py-1 ${i === q.answer ? "bg-green-50 font-semibold text-green-900" : "bg-cream/60 text-ink/80"}`}>
                          {letters[i]}. {o}
                          {i === q.answer && <span className="sr-only"> (correct)</span>}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && <p className="mt-1 text-xs text-ink/65">Why: {q.explanation}</p>}
                  </li>
                ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

function ReplaceDialog({ lesson, onClose, onDone }: { lesson: CurriculumLesson; onClose: () => void; onDone: () => void }) {
  const [pptx, setPptx] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!pptx) return setError("Choose the edited PowerPoint (.pptx).");
    setBusy(true);
    setError(null);
    const err = await replaceDeck(lesson, pptx, pdf, note);
    setBusy(false);
    if (err) return setError(err);
    onDone();
  };
  return (
    <Modal title={`Upload edited deck: ${lesson.title}`} onClose={onClose}>
      <div className="space-y-3 p-4 text-sm text-ink/80">
        <p>Download the PowerPoint, change it in PowerPoint, then upload it here. The old version is kept in History.</p>
        <label className="block font-medium">
          Edited PowerPoint (.pptx)
          <input type="file" accept=".pptx,.ppt,.odp" onChange={(e) => setPptx(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </label>
        <label className="block font-medium">
          PDF copy for pupils (optional)
          <input type="file" accept=".pdf,application/pdf" onChange={(e) => setPdf(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </label>
        <p className="text-xs text-ink/65">In PowerPoint use File → Export → PDF. Without a PDF, pupils get the PowerPoint to download.</p>
        <label className="block font-medium">
          What did you change? (optional)
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Shortened for a catch-up lesson" className="mt-1 block w-full rounded-md border border-gold-light px-3 py-2 text-sm" />
        </label>
        {error && <p className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save new version"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HistoryDialog({ lesson, onClose, onChanged }: { lesson: CurriculumLesson; onClose: () => void; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [versions, setVersions] = useState<CurriculumVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("curriculum_lesson_versions")
      .select("id, version, deck_path, pdf_path, note, created_at")
      .eq("lesson_id", lesson.id)
      .order("version", { ascending: false })
      .then(({ data }) => setVersions((data as CurriculumVersion[]) || []));
  }, [supabase, lesson.id]);
  const restore = async (v: CurriculumVersion) => {
    if (!supabase) return;
    const { error: err } = await supabase.rpc("curriculum_restore_version", { p_version: v.id });
    if (err) return setError("Could not restore that version.");
    onChanged();
  };
  const get = async (v: CurriculumVersion) => {
    if (!v.deck_path) return;
    const blob = await downloadDeck(v.deck_path);
    if (!blob) return setError("Couldn't download that version.");
    saveBlob(blob, fileNameFor(lesson, "pptx").replace(/\.pptx$/, ` v${v.version}.pptx`));
  };
  return (
    <Modal title={`History: ${lesson.title}`} onClose={onClose}>
      <div className="p-4">
        {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
        {!versions ? (
          <p className="text-sm text-ink/65">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border border-gold-light/70 px-3 py-2 text-sm">
                <span className="font-semibold">v{v.version}</span>
                <span className="text-ink/65">{new Date(v.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="min-w-0 flex-1 truncate text-ink/70">{v.note || (v.version === 1 ? "Original" : "")}</span>
                <button type="button" className={btn} onClick={() => get(v)}>
                  Download
                </button>
                {v.version !== lesson.version && (
                  <button type="button" className={btn} onClick={() => restore(v)}>
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function ShareDialog({ lesson, area, onClose, onDone }: { lesson: CurriculumLesson; area: "teach" | "admin"; onClose: () => void; onDone: (className: string) => void }) {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState("");
  const [withPptx, setWithPptx] = useState(!lesson.pdf_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      if (area === "admin") {
        const { data } = await supabase.from("classes").select("id, name").order("name");
        setClasses((data as ClassOpt[]) || []);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const opts: ClassOpt[] = (await myTeachingClasses()).map((c) => ({ id: c.id, name: c.name }));
      setClasses(opts);
      if (opts[0]) setClassId(opts[0].id);
    })();
  }, [supabase, area]);

  const share = async () => {
    if (!supabase || !classId) return setError("Choose a class.");
    setBusy(true);
    setError(null);
    const resources: { label: string; path?: string; mime?: string }[] = [];
    const items: { path: string; ext: string; mime: string }[] = [];
    if (lesson.pdf_path) items.push({ path: lesson.pdf_path, ext: "pdf", mime: "application/pdf" });
    if ((withPptx || !lesson.pdf_path) && lesson.deck_path) items.push({ path: lesson.deck_path, ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    for (const it of items) {
      const blob = await downloadDeck(it.path);
      if (!blob) {
        setBusy(false);
        return setError("Couldn't read the lesson file.");
      }
      const file = new File([blob], fileNameFor(lesson, it.ext === "pdf" ? "slides-pdf" : "slides-pptx"), { type: it.mime });
      const r = await uploadClassFile(classId, file);
      if ("error" in r) {
        setBusy(false);
        return setError(r.error);
      }
      resources.push(r.attachment);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_materials").insert({
      class_id: classId,
      kind: "material",
      title: `${lesson.title}`,
      body: `Lesson ${lesson.lesson_no}${lesson.unit ? ` · ${lesson.unit}` : ""}`,
      resources,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (err) return setError("Could not post to the class. You may not teach that class.");
    onDone(classes?.find((c) => c.id === classId)?.name || "the class");
  };

  return (
    <Modal title={`Share to class: ${lesson.title}`} onClose={onClose}>
      <div className="space-y-3 p-4 text-sm text-ink/80">
        {classes === null ? (
          <p>Loading your classes…</p>
        ) : classes.length === 0 ? (
          <p>You don&apos;t teach any classes yet.</p>
        ) : (
          <>
            <label className="block font-medium">
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light px-3 py-2 text-sm">
                <option value="">Choose a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {lesson.pdf_path && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withPptx} onChange={(e) => setWithPptx(e.target.checked)} />
                Also attach the editable PowerPoint
              </label>
            )}
            <p className="text-xs text-ink/65">Posts the lesson slides as material in the class&apos;s Classwork. Pupils and families can view the PDF there.</p>
          </>
        )}
        {error && <p className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={share} disabled={busy || !classId}>
            {busy ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
