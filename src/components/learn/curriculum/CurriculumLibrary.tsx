"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadClassFile } from "@/components/learn/class/Attachments";
import { Tabs } from "@/components/learn/Tabs";
import { makeZip, type ZipEntry } from "@/lib/learn/zip";
import { mediaUrl, unitsForYear, type StaffUnit, type SummarySlide } from "@/lib/learn/revision";
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

type ClassOpt = { id: string; name: string };

const btn = "rounded-md border border-gold-light px-2.5 py-1 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50";
const btnPrimary = "rounded-md bg-gold-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-900 disabled:opacity-50";

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
type UnitTab = "lessons" | "revision" | "results";
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
  const [selected, setSelected] = useState<string | null>(null);
  // A link can open a particular unit and tab: ?year=y10&subject=…&unit=…&tab=results
  const [linked] = useState(() => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const t = p.get("tab");
    return { year: p.get("year"), subject: p.get("subject"), unit: p.get("unit"), tab: (t === "revision" || t === "results" ? t : "lessons") as UnitTab };
  });
  const [tab, setTab] = useState<UnitTab>(linked.tab);
  const [message, setMessage] = useState<string | null>(null);
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
        const { data } = await supabase.from("user_roles").select("classes(year_group)").eq("user_id", user.id).eq("scope_type", "class");
        mine = [...new Set(((data as unknown as { classes: { year_group: string | null } | null }[]) || []).map((r) => yearFromName(r.classes?.year_group)).filter(Boolean) as string[])];
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
  const subjects = useMemo(() => {
    const bySubject = new Map<string, { slug: string; name: string; units: Map<string, UnitGroup> }>();
    (lessons || []).forEach((l) => {
      const s = bySubject.get(l.subject_slug) || { slug: l.subject_slug, name: l.subject, units: new Map() };
      const u = l.unit || "Lessons";
      const k = unitKey(l.subject_slug, u);
      const g = s.units.get(u) || { key: k, subject_slug: l.subject_slug, subject: l.subject, board: l.board, unit: u, lessons: [] };
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
  }, [lessons, packs]);

  const allUnits = useMemo(() => subjects.flatMap((s) => s.units), [subjects]);
  const packFor = useCallback((g: UnitGroup | undefined) => (g ? packs.find((p) => p.subject_slug === g.subject_slug && p.unit === g.unit) : undefined), [packs]);

  // The unit on show: the one you picked, else the linked one, else the first.
  const wantedKey = wanted ? allUnits.find((u) => u.unit === wanted.unit && (!wanted.subject || u.subject_slug === wanted.subject))?.key : undefined;
  const activeKey = selected && allUnits.some((u) => u.key === selected) ? selected : wantedKey || allUnits[0]?.key || null;
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

  const downloadUnit = async (subjectName: string, unit: string, ls: CurriculumLesson[], withEditable: boolean) => {
    const key = `unit:${subjectName}:${unit}`;
    setBusyId(key);
    setMessage(null);
    const folder = unitFolderName(ls[0].year, subjectName, unit);
    const kinds: LessonFileKind[] = withEditable ? ["slides-pdf", "plan-pdf", "slides-pptx", "plan-docx"] : ["slides-pdf", "plan-pdf"];
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

  const openUnit = (key: string, t: UnitTab = "lessons") => {
    setSelected(key);
    setTab(t);
    setSearch("");
    setOpenLesson(null);
  };

  const yearTabs = YEARS.map((y) => ({ key: y, label: myYears.includes(y) ? `${yearLabel(y).replace("Year ", "Y")} •` : yearLabel(y).replace("Year ", "Y") }));

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
              {!showUnit && l.duration ? `${l.duration} min` : ""}
              {!showUnit && (l.objectives || []).length ? ` · ${l.objectives.length} objective${l.objectives.length === 1 ? "" : "s"}` : ""}
              {l.version > 1 && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-900">Edited · v{l.version}</span>}
            </span>
          </button>
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

      {!building && lessons && allUnits.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Units: a list on wide screens, a drop-down on phones. */}
          <div className="lg:hidden">
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
          <nav aria-label="Units" className="hidden max-h-[75vh] space-y-4 self-start overflow-y-auto rounded-2xl border border-gold-light bg-white p-3 lg:sticky lg:top-4 lg:block">
            {subjects.map((s) => (
              <div key={s.slug}>
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/55">{s.name}</p>
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
                          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs font-normal text-ink/55">
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
            <p className="flex items-center gap-1.5 border-t border-gold-light px-2 pt-2 text-xs text-ink/60">
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
                    <p className="text-xs text-ink/60">
                      {current.subject}
                      {current.board ? ` · ${current.board}` : ""}
                    </p>
                    <h2 className="text-h3 font-semibold text-ink">{current.unit}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink/65">
                        {current.lessons.length} lesson{current.lessons.length === 1 ? "" : "s"}
                        {current.lessons.length ? ` · ${Math.round((current.lessons.reduce((n, l) => n + (l.duration || 0), 0) / 60) * 10) / 10} h` : ""}
                      </span>
                      {currentPack && (
                        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-900">
                          Revision pack · {currentPack.questions} quiz questions{currentPack.takers ? ` · ${currentPack.takers} pupils` : ""}
                        </span>
                      )}
                      <span className="flex-1" />
                      {current.lessons.length > 0 && (
                        <ActionMenu
                          label={busyId === `unit:${current.subject}:${current.unit}` ? "Preparing…" : "Download unit"}
                          items={[
                            { label: "Slides + plans (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, false) },
                            { label: "Include editable files (ZIP)", onClick: () => downloadUnit(current.subject, current.unit, current.lessons, true) },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                  <Tabs
                    items={[
                      { key: "lessons" as UnitTab, label: "Lessons", count: current.lessons.length },
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
            <div role="status" className="flex aspect-video w-full items-center justify-center rounded-lg bg-cream text-sm text-ink/60">
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
        <p className="text-xs text-ink/55">In PowerPoint use File → Export → PDF. Without a PDF, pupils get the PowerPoint to download.</p>
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
          <p className="text-sm text-ink/60">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border border-gold-light/70 px-3 py-2 text-sm">
                <span className="font-semibold">v{v.version}</span>
                <span className="text-ink/60">{new Date(v.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
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
      const { data } = await supabase.from("user_roles").select("scope_id, classes(id, name)").eq("user_id", user.id).eq("scope_type", "class");
      const opts = ((data as unknown as { classes: ClassOpt | null }[]) || []).map((r) => r.classes).filter(Boolean) as ClassOpt[];
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
            <p className="text-xs text-ink/55">Posts the lesson slides as material in the class&apos;s Classwork. Pupils and families can view the PDF there.</p>
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
