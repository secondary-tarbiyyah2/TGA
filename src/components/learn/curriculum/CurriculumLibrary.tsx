"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { uploadClassFile } from "@/components/learn/class/Attachments";
import {
  LESSON_COLUMNS,
  YEARS,
  downloadDeck,
  fileNameFor,
  replaceDeck,
  saveBlob,
  yearLabel,
  type CurriculumLesson,
  type CurriculumVersion,
} from "@/lib/learn/curriculum";

type ClassOpt = { id: string; name: string };

const btn = "rounded-md border border-gold-light px-2.5 py-1 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50";
const btnPrimary = "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50";

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

export function CurriculumLibrary({ area }: { area: "teach" | "admin" }) {
  const supabase = getSupabaseClient();
  const [year, setYear] = useState("y7");
  const [subject, setSubject] = useState("");
  const [search, setSearch] = useState("");
  const [lessons, setLessons] = useState<CurriculumLesson[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<CurriculumLesson | null>(null);
  const [history, setHistory] = useState<CurriculumLesson | null>(null);
  const [sharing, setSharing] = useState<CurriculumLesson | null>(null);
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLessons(null);
    const { data, error } = await supabase.from("curriculum_lessons").select(LESSON_COLUMNS).eq("year", year).order("subject").order("lesson_no");
    if (error) {
      setMessage("Couldn't load the curriculum library.");
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
    const m = new Map<string, string>();
    (lessons || []).forEach((l) => m.set(l.subject_slug, l.subject));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lessons]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lessons || []).filter((l) => (!subject || l.subject_slug === subject) && (!q || l.title.toLowerCase().includes(q) || (l.unit || "").toLowerCase().includes(q)));
  }, [lessons, subject, search]);

  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, CurriculumLesson[]>>();
    shown.forEach((l) => {
      const s = out.get(l.subject) || new Map<string, CurriculumLesson[]>();
      const u = l.unit || "Lessons";
      s.set(u, [...(s.get(u) || []), l]);
      out.set(l.subject, s);
    });
    return out;
  }, [shown]);

  const download = async (l: CurriculumLesson, kind: "pptx" | "pdf") => {
    const path = kind === "pptx" ? l.deck_path : l.pdf_path;
    if (!path) return;
    setBusyId(l.id + kind);
    const blob = await downloadDeck(path);
    setBusyId(null);
    if (!blob) return setMessage("Couldn't download that file.");
    saveBlob(blob, fileNameFor(l, kind));
  };

  const view = async (l: CurriculumLesson) => {
    if (!l.pdf_path) return;
    setBusyId(l.id + "view");
    const blob = await downloadDeck(l.pdf_path);
    setBusyId(null);
    if (!blob) return setMessage("Couldn't open that file.");
    setViewing({ name: l.title, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
  };

  const closeViewer = () => {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gold-light bg-white p-4">
        <label className="text-sm font-medium text-ink/80">
          Year group
          <select value={year} onChange={(e) => { setYear(e.target.value); setSubject(""); }} className="mt-1 block rounded-md border border-gold-light px-3 py-2 text-sm">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {yearLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink/80">
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 block rounded-md border border-gold-light px-3 py-2 text-sm">
            <option value="">All subjects</option>
            {subjects.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-sm font-medium text-ink/80">
          Search
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lesson or unit title" className="mt-1 block w-full rounded-md border border-gold-light px-3 py-2 text-sm" />
        </label>
        <p className="pb-2 text-sm text-ink/55">{lessons ? `${shown.length} lesson${shown.length === 1 ? "" : "s"}` : "Loading…"}</p>
      </div>

      {message && (
        <p role="status" className="rounded-md border border-gold-light bg-cream px-3 py-2 text-sm text-ink/80">
          {message}
        </p>
      )}

      {lessons && shown.length === 0 && <p className="text-sm text-ink/60">No lessons found for that selection.</p>}

      {[...grouped.entries()].map(([subjectName, units]) => (
        <section key={subjectName} className="rounded-2xl border border-gold-light bg-white">
          <h2 className="border-b border-gold-light px-4 py-3 text-base font-semibold text-ink">{subjectName}</h2>
          {[...units.entries()].map(([unit, ls]) => (
            <div key={unit} className="border-b border-gold-light/60 last:border-b-0">
              <p className="bg-cream/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/55">{unit}</p>
              <ul>
                {ls.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 border-t border-gold-light/40 px-4 py-2.5 first:border-t-0">
                    <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-ink/65">{l.lesson_no}</span>
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm font-medium text-ink">{l.title}</p>
                      <p className="text-xs text-ink/55">
                        {l.duration ? `${l.duration} min` : ""}
                        {l.version > 1 && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-900">Edited · v{l.version}</span>}
                      </p>
                    </div>
                    {l.deck_path ? (
                      <div className="flex flex-wrap gap-1.5">
                        {l.pdf_path && (
                          <button type="button" className={btn} onClick={() => view(l)} disabled={busyId === l.id + "view"}>
                            View
                          </button>
                        )}
                        <button type="button" className={btn} onClick={() => download(l, "pptx")} disabled={busyId === l.id + "pptx"}>
                          PowerPoint
                        </button>
                        {l.pdf_path && (
                          <button type="button" className={btn} onClick={() => download(l, "pdf")} disabled={busyId === l.id + "pdf"}>
                            PDF
                          </button>
                        )}
                        <button type="button" className={btn} onClick={() => setReplacing(l)}>
                          Upload edited
                        </button>
                        <button type="button" className={btn} onClick={() => setHistory(l)}>
                          History
                        </button>
                        <button type="button" className={btnPrimary} onClick={() => setSharing(l)}>
                          Share to class
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink/65">Deck not built yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {viewing && (
        <Modal title={viewing.name} onClose={closeViewer} wide>
          <iframe src={viewing.url} title={viewing.name} className="h-full min-h-[70vh] w-full border-0" />
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
      const file = new File([blob], fileNameFor(lesson, it.ext), { type: it.mime });
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
