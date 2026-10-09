"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadClassFile } from "@/components/learn/class/Attachments";
import { Tabs } from "@/components/learn/Tabs";
import { Icon } from "@/components/learn/Icon";
import { makeZip, type ZipEntry } from "@/lib/learn/zip";
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

export function CurriculumLibrary({ area }: { area: "teach" | "admin" }) {
  const supabase = getSupabaseClient();
  const [year, setYearState] = useState<string | null>(null);
  const [myYears, setMyYears] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [search, setSearch] = useState("");
  const [lessons, setLessons] = useState<CurriculumLesson[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<CurriculumLesson | null>(null);
  const [history, setHistory] = useState<CurriculumLesson | null>(null);
  const [sharing, setSharing] = useState<CurriculumLesson | null>(null);
  const [viewing, setViewing] = useState<{ lesson: CurriculumLesson; kind: "slides-pdf" | "plan-pdf"; url: string | null } | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  const setYear = (y: string) => {
    setYearState(y);
    setSubject("");
    try {
      window.localStorage.setItem(YEAR_KEY, y);
    } catch {
      /* ignore */
    }
  };

  // Start on the year you last looked at, else the year of the first class you teach.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
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
      setYearState(saved && YEARS.includes(saved) ? saved : mine[0] || "y7");
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const load = useCallback(async () => {
    if (!supabase || !year) return;
    setLessons(null);
    const { data, error } = await supabase.from("curriculum_lessons").select(LESSON_COLUMNS).eq("year", year).order("subject").order("lesson_no");
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

  const subjects = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    (lessons || []).forEach((l) => m.set(l.subject_slug, { name: l.subject, count: (m.get(l.subject_slug)?.count || 0) + 1 }));
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [lessons]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lessons || []).filter(
      (l) => (!subject || l.subject_slug === subject) && (!q || [l.title, l.unit || "", ...(l.objectives || [])].some((v) => v.toLowerCase().includes(q))),
    );
  }, [lessons, subject, search]);

  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, CurriculumLesson[]>>();
    shown.forEach((l) => {
      const s2 = out.get(l.subject) || new Map<string, CurriculumLesson[]>();
      const u = l.unit || "Lessons";
      s2.set(u, [...(s2.get(u) || []), l]);
      out.set(l.subject, s2);
    });
    return out;
  }, [shown]);

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

  const yearTabs = YEARS.map((y) => ({ key: y, label: myYears.includes(y) ? `${yearLabel(y).replace("Year ", "Y")} •` : yearLabel(y).replace("Year ", "Y") }));

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Year group</p>
          {myYears.length > 0 && <p className="text-xs text-ink/65">• = a year you teach</p>}
        </div>
        {year && <Tabs variant="switch" items={yearTabs} value={year} onChange={setYear} label="Year group" />}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
          <button type="button" aria-pressed={!subject} onClick={() => setSubject("")} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!subject ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}>
            All subjects{lessons ? ` (${lessons.length})` : ""}
          </button>
          {subjects.map(([slug, info]) => (
            <button key={slug} type="button" aria-pressed={subject === slug} onClick={() => setSubject(slug)} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${subject === slug ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}>
              {info.name} ({info.count})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lesson titles, units or objectives" aria-label="Search lessons" className="min-w-[14rem] flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm" />
          <p className="text-sm text-ink/65" aria-live="polite">
            {lessons ? `${shown.length} lesson${shown.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
      </div>

      {message && (
        <p role="status" className="rounded-lg border border-gold-light bg-cream px-3 py-2 text-sm text-ink/80">
          {message}
        </p>
      )}

      {lessons === null && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
      {lessons && shown.length === 0 && <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">No lessons match. Try another subject or clear the search.</p>}

      {[...grouped.entries()].map(([subjectName, units]) => (
        <section key={subjectName} aria-label={subjectName} className="space-y-3">
          <h2 className="text-h3 font-semibold text-ink">{subjectName}</h2>
          {[...units.entries()].map(([unit, ls], ui) => {
            const unitKey = `unit:${subjectName}:${unit}`;
            const minutes = ls.reduce((n, l) => n + (l.duration || 0), 0);
            return (
              <details key={unit} open={ui === 0 || !!search.trim() || undefined} className="group overflow-visible rounded-2xl border border-gold-light bg-white">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-ink/60 transition-transform group-open:rotate-180" />
                  <span className="min-w-0 flex-1 font-semibold text-ink">{unit}</span>
                  <span className="text-xs text-ink/65">
                    {ls.length} lesson{ls.length === 1 ? "" : "s"}
                    {minutes ? ` · ${Math.round(minutes / 60 * 10) / 10} h` : ""}
                  </span>
                </summary>
                <div className="flex flex-wrap items-center gap-2 border-t border-gold-light bg-cream/50 px-4 py-2">
                  <span className="text-xs text-ink/70">Whole unit:</span>
                  <button type="button" className={btn} disabled={busyId === unitKey} onClick={() => downloadUnit(subjectName, unit, ls, false)}>
                    {busyId === unitKey ? "Preparing…" : "Download slides + plans (ZIP)"}
                  </button>
                  <button type="button" className={btn} disabled={busyId === unitKey} onClick={() => downloadUnit(subjectName, unit, ls, true)}>
                    Include editable files
                  </button>
                </div>
                <ol>
                  {ls.map((l) => {
                    const expanded = openLesson === l.id;
                    return (
                      <li key={l.id} className="border-t border-gold-light/70 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-sm font-semibold tabular-nums text-ink">{l.lesson_no}</span>
                          <button type="button" onClick={() => setOpenLesson(expanded ? null : l.id)} aria-expanded={expanded} className="min-w-[12rem] flex-1 text-left">
                            <span className="block text-sm font-semibold text-ink">{l.title}</span>
                            <span className="block text-xs text-ink/65">
                              {l.duration ? `${l.duration} min` : ""}
                              {(l.objectives || []).length ? ` · ${l.objectives.length} objective${l.objectives.length === 1 ? "" : "s"}` : ""}
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
                  })}
                </ol>
              </details>
            );
          })}
        </section>
      ))}

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
