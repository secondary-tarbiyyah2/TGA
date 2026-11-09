"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, chapterEnd, clock, mediaUrl, toSeconds, type SummarySlide } from "@/lib/learn/revision";
import { ui } from "@/components/learn/ui";

import { Select } from "@/components/ui/Dropdown";
/**
 * Make (or edit) a revision pack in the portal, the way Aqeedah 1 was made:
 *
 *   1. Upload one summary video (e.g. a narrated slideshow exported as MP4).
 *   2. Mark where each chapter starts while watching it, or paste a list of
 *      times like "0:00 What is aqeedah?". Each chapter stops at its own end,
 *      so pupils never see the start of the next one; trim the end if needed.
 *   3. Write the chapter's summary slide: Arabic term, transliteration, key
 *      points, a Qur'an or hadith quote, key words.
 *   4. Add quiz questions for each chapter.
 *   5. Confirm the Arabic and references are checked, then show it to pupils.
 *
 * Nothing leaves the school: the video goes to the private revision-media
 * bucket and only pupils in that year can stream it once the pack is shown.
 */

const MAX_MB = 200; // the revision-media bucket limit (0094)
const input = `mt-1 ${ui.input}`;
const btn = ui.btnSecondary;
const btnPrimary = ui.btnPrimary;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unit";

type Chapter = {
  key: string;
  title: string;
  start: number;
  end: number | null;
  term: string;
  transliteration: string;
  points: string;
  quoteText: string;
  quoteSrc: string;
  keywords: string;
};

type StaffQ = { id: string; topic: string; question: string; options: string[]; answer: number; explanation: string | null; hint: string | null; source: string };

let keySeq = 0;
const newKey = () => `c${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function toChapter(s: SummarySlide & { start?: number | null; end?: number | null }): Chapter {
  return {
    key: newKey(),
    title: s.title || "",
    start: typeof s.start === "number" ? s.start : toSeconds(s.time),
    end: typeof s.end === "number" ? s.end : null,
    term: s.term || "",
    transliteration: s.transliteration || "",
    points: (s.points || []).join("\n"),
    quoteText: s.quote?.text || "",
    quoteSrc: s.quote?.src || "",
    keywords: (s.keywords || []).join("\n"),
  };
}

function toSlide(c: Chapter): SummarySlide {
  const lines = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    title: c.title.trim(),
    start: Math.round(c.start * 10) / 10,
    end: c.end === null ? null : Math.round(c.end * 10) / 10,
    term: c.term.trim() || null,
    transliteration: c.transliteration.trim() || null,
    points: lines(c.points),
    quote: c.quoteText.trim() ? { text: c.quoteText.trim(), src: c.quoteSrc.trim() } : null,
    keywords: lines(c.keywords),
  };
}

/** "0:00 What is aqeedah?" / "02:35 - Tawhid" lines -> chapters. */
function parseTimes(text: string): Chapter[] {
  return text
    .split("\n")
    .map((l) => l.trim().match(/^(\d{1,2}(?::\d{1,2}){1,2})\s*[-–—:.)]?\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => toChapter({ title: m[2].trim(), time: m[1], points: [] }));
}

export function PackBuilder({
  year,
  yearLabel,
  subjects,
  initial,
  packId,
  onDone,
  onCancel,
}: {
  year: string;
  yearLabel: string;
  subjects: { slug: string; name: string }[];
  initial?: { subject_slug?: string; subject?: string; unit?: string };
  packId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const supabase = getSupabaseClient();
  const [id, setId] = useState<string | null>(packId || null);
  const [subjectSlug, setSubjectSlug] = useState(initial?.subject_slug || subjects[0]?.slug || "");
  const [newSubject, setNewSubject] = useState("");
  const [unit, setUnit] = useState(initial?.unit || "");
  const [title, setTitle] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [questions, setQuestions] = useState<StaffQ[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(!!packId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);

  const subjectName = subjectSlug === "__new" ? newSubject.trim() : subjects.find((s) => s.slug === subjectSlug)?.name || initial?.subject || "";
  const realSlug = subjectSlug === "__new" ? slug(newSubject) : subjectSlug;
  const sorted = [...chapters].sort((a, b) => a.start - b.start);
  const slides = sorted.map(toSlide);

  // Load an existing pack.
  useEffect(() => {
    if (!supabase || !packId) return;
    let alive = true;
    (async () => {
      const [{ data: u }, { data: qs }] = await Promise.all([
        supabase.from("revision_units").select("subject_slug, subject, unit, title, summary, video_path, published, checked_at").eq("id", packId).maybeSingle(),
        supabase.from("revision_questions").select("id, topic, question, options, answer, explanation, hint, source").eq("unit_id", packId).eq("active", true).order("lesson_no").order("qkey"),
      ]);
      if (!alive) return;
      const row = u as { subject_slug: string; subject: string; unit: string; title: string; summary: SummarySlide[]; video_path: string | null; published: boolean; checked_at: string | null } | null;
      if (row) {
        setSubjectSlug(row.subject_slug);
        setUnit(row.unit);
        setTitle(row.title);
        setVideoPath(row.video_path);
        setChapters((row.summary || []).map(toChapter));
        setPublished(row.published);
        setCheckedAt(row.checked_at);
      }
      setQuestions((qs as StaffQ[]) || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, packId]);

  useEffect(() => {
    if (!videoPath) return;
    let alive = true;
    mediaUrl(videoPath).then((url) => alive && setVideoUrl(url));
    return () => {
      alive = false;
    };
  }, [videoPath]);

  const say = (text: string, error = false) => setMsg({ text, error });
  /** Shows a problem and gives back null, for the early exits in save(). */
  const fail = (text: string): null => {
    setMsg({ text, error: true });
    return null;
  };

  /** Creates the pack the first time, then saves its details and chapters. */
  async function save(extra: Record<string, unknown> = {}, quiet = false): Promise<string | null> {
    if (!supabase) return null;
    if (!realSlug || !subjectName) return fail("Choose the subject first.");
    if (!unit.trim()) return fail("Give the unit a name, e.g. “Aqeedah 1”.");
    const bad = slides.find((s) => !s.title);
    if (bad) return fail("Every chapter needs a title.");
    setBusy("save");
    const row = {
      title: title.trim() || unit.trim(),
      summary: slides,
      video_path: videoPath,
      ...extra,
    };
    let result: string | null = id;
    if (!id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("revision_units")
        .insert({ ...row, subject_slug: realSlug, subject: subjectName, year, unit: unit.trim(), kind: "summary", published: false, source: "staff", created_by: user?.id || null, sort_order: 100 })
        .select("id")
        .single();
      setBusy(null);
      if (error) {
        say(/duplicate|unique/i.test(error.message) ? `${subjectName} · ${unit.trim()} already has a revision pack for ${yearLabel}. Open it from the Lesson library instead.` : `Couldn't save: ${error.message}`, true);
        return null;
      }
      result = (data as { id: string }).id;
      setId(result);
    } else {
      const { error } = await supabase.from("revision_units").update(row).eq("id", id);
      setBusy(null);
      if (error) return fail(`Couldn't save: ${error.message}`);
    }
    if (!quiet) say("Saved.");
    return result;
  }

  async function uploadVideo(file: File) {
    if (!supabase) return;
    if (!/^video\/(mp4|webm)$/.test(file.type)) return say("Upload an MP4 or WebM video.", true);
    if (file.size > MAX_MB * 1024 * 1024)
      return say(`That video is ${Math.round(file.size / 1048576)} MB; the limit is ${MAX_MB} MB. Export it at 720p (in PowerPoint: File › Export › Create a Video › HD 720p) and try again.`, true);
    setBusy("upload");
    say(`Uploading ${Math.round(file.size / 1048576)} MB… keep this page open; a long video can take a few minutes.`);
    const ext = file.type === "video/webm" ? "webm" : "mp4";
    const path = `staff/${year}/${realSlug || "subject"}/${slug(unit || "unit")}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setBusy(null);
      return say(`Upload failed: ${error.message}`, true);
    }
    const old = videoPath;
    setVideoPath(path);
    setVideoUrl(null);
    if (id) await supabase.from("revision_units").update({ video_path: path }).eq("id", id);
    if (old?.startsWith("staff/")) await supabase.storage.from(MEDIA_BUCKET).remove([old]);
    setBusy(null);
    say(chapters.length ? "Video replaced. Check the chapter times still line up." : "Uploaded. Now play it and press “New chapter here” at the start of each chapter.");
  }

  const addChapterHere = () => {
    const t = Math.round((videoRef.current?.currentTime || 0) * 10) / 10;
    if (chapters.some((c) => Math.abs(c.start - t) < 1)) return say("There is already a chapter starting here.", true);
    const c = toChapter({ title: "", start: t, points: [] });
    setChapters((cs) => [...cs, c]);
    setOpen(c.key);
    setMsg(null);
  };

  const setCh = (key: string, patch: Partial<Chapter>) => setChapters((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  /** Plays the last few seconds of a chapter and stops where pupils' video will stop. */
  const previewEnding = (k: number) => {
    const v = videoRef.current;
    if (!v) return;
    const end = chapterEnd(slides, k, duration);
    stopAt.current = end;
    v.currentTime = Math.max(slides[k].start || 0, end - 5);
    v.play().catch(() => {});
  };
  const playFrom = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = null;
    v.currentTime = t;
    v.play().catch(() => {});
  };

  async function markChecked(on: boolean) {
    if (!supabase || !id) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const patch = on ? { checked_at: new Date().toISOString(), checked_by: user?.id || null } : { checked_at: null, checked_by: null, published: false };
    const { error } = await supabase.from("revision_units").update(patch).eq("id", id);
    if (error) return say(`Couldn't save that: ${error.message}`, true);
    setCheckedAt(patch.checked_at);
    if (!on) setPublished(false);
  }

  async function togglePublished() {
    const saved = await save({ published: !published }, true);
    if (!saved) return;
    setPublished(!published);
    say(!published ? "Pupils in this year can now see the pack under Unit revision." : "Hidden from pupils.");
  }

  async function removePack() {
    if (!supabase || !id) return;
    setBusy("delete");
    const { error } = await supabase.from("revision_units").delete().eq("id", id);
    if (!error && videoPath?.startsWith("staff/")) await supabase.storage.from(MEDIA_BUCKET).remove([videoPath]);
    setBusy(null);
    if (error) return say(`Couldn't delete: ${error.message}`, true);
    onDone();
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;

  const step = (n: number, t: string, done: boolean) => (
    <h3 className="flex items-center gap-2 font-semibold text-ink">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-teal-700 text-white" : "bg-gold-100 text-gold-900"}`}>{done ? "✓" : n}</span>
      {t}
    </h3>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-ink/65">{yearLabel} · revision pack</p>
          <h2 className="text-h3 font-semibold text-ink">{id ? `Edit: ${title || unit}` : "New revision pack"}</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={onCancel}>
            {id ? "Done" : "Cancel"}
          </button>
          <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => save().then((r) => r && onDone())}>
            {busy === "save" ? "Saving…" : "Save and close"}
          </button>
        </div>
      </div>

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-red-50 text-red-800" : "bg-teal-100 text-teal-900"}`}>
          {msg.text}
        </p>
      )}

      {/* 1. Unit */}
      <section className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        {step(1, "Which unit is it for?", !!id)}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-ink">
            Subject
            <Select allowEmpty className={input} value={subjectSlug} disabled={!!id} onChange={(e) => setSubjectSlug(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
              <option value="__new">Another subject…</option>
            </Select>
          </label>
          {subjectSlug === "__new" && (
            <label className="text-sm font-medium text-ink">
              Subject name
              <input className={input} value={newSubject} disabled={!!id} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Islamic Studies" />
            </label>
          )}
          <label className="text-sm font-medium text-ink">
            Unit
            <input className={input} value={unit} disabled={!!id} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Aqeedah 1" />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-3">
            Title pupils see
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Aqeedah 1: Tawhid and its opposite" />
          </label>
        </div>
      </section>

      {/* 2. Video and chapters */}
      <section className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        {step(2, "Summary video and chapters", !!videoPath && chapters.length > 1)}
        <p className="text-sm text-ink/75">
          One video for the whole unit (MP4, up to {MAX_MB} MB). Play it and press <strong>New chapter here</strong> wherever a new chapter begins. Each chapter stops at its own end, so it never runs into the
          next one.
        </p>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-2`}>
          {busy === "upload" ? "Uploading…" : videoPath ? "Replace the video" : "Upload the video"}
          <input
            type="file"
            accept="video/mp4,video/webm"
            className="sr-only"
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadVideo(f);
              e.target.value = "";
            }}
          />
        </label>

        {videoPath && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    setNow(v.currentTime);
                    if (stopAt.current !== null && v.currentTime >= stopAt.current - 0.12) {
                      v.pause();
                      stopAt.current = null;
                    }
                  }}
                  className="aspect-video w-full rounded-lg bg-ink"
                />
              ) : (
                <div role="status" className="flex aspect-video w-full items-center justify-center rounded-lg bg-cream text-sm text-ink/65">
                  Loading the video…
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnPrimary} onClick={addChapterHere} disabled={!videoUrl}>
                  + New chapter here ({clock(now)})
                </button>
                <span className="text-xs text-ink/65">{duration ? `Video length ${clock(duration)}` : ""}</span>
              </div>
              {/* Chapter timeline */}
              {duration > 0 && sorted.length > 0 && (
                <div className="relative h-3 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                  {sorted.map((c, k) => {
                    const end = chapterEnd(slides, k, duration);
                    return (
                      <div
                        key={c.key}
                        className={`absolute top-0 h-3 ${k % 2 ? "bg-teal-500" : "bg-teal-700"}`}
                        style={{ left: `${(c.start / duration) * 100}%`, width: `${Math.max(0.5, ((end - c.start) / duration) * 100)}%` }}
                      />
                    );
                  })}
                  <div className="absolute top-0 h-3 w-0.5 bg-gold-500" style={{ left: `${(now / duration) * 100}%` }} />
                </div>
              )}
              {chapters.length === 0 && (
                <details className="rounded-lg bg-cream p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-ink">Already have the chapter times? Paste them</summary>
                  <p className="mt-2 text-ink/70">One per line, like a YouTube description: “0:00 What is aqeedah?”</p>
                  <textarea className={`${input} h-28 font-mono`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"0:00 What is aqeedah?\n1:10 Tawhid and ar-Rububiyyah\n3:47 Al-Uluhiyyah"} />
                  <button
                    type="button"
                    className={`${btn} mt-2`}
                    onClick={() => {
                      const cs = parseTimes(paste);
                      if (!cs.length) return say("No times found. Use lines like “2:35 Tawhid”.", true);
                      setChapters(cs);
                      setPaste("");
                      say(`${cs.length} chapters added. Fill in each one's summary below.`);
                    }}
                  >
                    Add these chapters
                  </button>
                </details>
              )}
            </div>

            <ol className="space-y-2">
              {sorted.map((c, k) => {
                const end = chapterEnd(slides, k, duration);
                const isOpen = open === c.key;
                return (
                  <li key={c.key} className={`rounded-xl border ${isOpen ? "border-teal-700" : "border-gold-light"} bg-white`}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : c.key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-3 text-left">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-100 text-xs font-bold text-teal-900">{k + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{c.title || <em className="font-normal text-ink/65">Untitled chapter</em>}</span>
                        <span className="block text-xs tabular-nums text-ink/65">
                          {clock(c.start)}–{duration || c.end ? clock(end) : "end"}
                          {c.term && (
                            <span lang="ar" dir="rtl" className="ml-2 text-sm text-teal-700">
                              {c.term}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-gold-light/60 p-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={btn} onClick={() => playFrom(c.start)}>
                            ▶ From start
                          </button>
                          <button type="button" className={btn} onClick={() => previewEnding(k)}>
                            ▶ Check the ending
                          </button>
                          <button type="button" className={btn} onClick={() => setCh(c.key, { start: Math.round(now * 10) / 10 })}>
                            Start here ({clock(now)})
                          </button>
                          <button type="button" className={btn} onClick={() => setCh(c.key, { end: Math.round(now * 10) / 10 })}>
                            End here ({clock(now)})
                          </button>
                          {c.end !== null && (
                            <button type="button" className={btn} onClick={() => setCh(c.key, { end: null })}>
                              End at next chapter
                            </button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-sm font-medium text-ink sm:col-span-2">
                            Chapter title
                            <input className={input} value={c.title} onChange={(e) => setCh(c.key, { title: e.target.value })} placeholder="e.g. Tawhid and ar-Rububiyyah" />
                          </label>
                          <label className="text-sm font-medium text-ink">
                            Arabic term
                            <input lang="ar" dir="rtl" className={`${input} text-lg`} value={c.term} onChange={(e) => setCh(c.key, { term: e.target.value })} placeholder="الرُّبُوبِيَّة" />
                          </label>
                          <label className="text-sm font-medium text-ink">
                            Transliteration
                            <input className={input} value={c.transliteration} onChange={(e) => setCh(c.key, { transliteration: e.target.value })} placeholder="ar-Rububiyyah" />
                          </label>
                          <label className="text-sm font-medium text-ink sm:col-span-2">
                            Key points <span className="font-normal text-ink/65">(one per line)</span>
                            <textarea className={`${input} h-24`} value={c.points} onChange={(e) => setCh(c.key, { points: e.target.value })} />
                          </label>
                          <label className="text-sm font-medium text-ink">
                            Qur&apos;an or hadith quote
                            <textarea className={`${input} h-16`} value={c.quoteText} onChange={(e) => setCh(c.key, { quoteText: e.target.value })} />
                          </label>
                          <label className="text-sm font-medium text-ink">
                            Reference
                            <input className={input} value={c.quoteSrc} onChange={(e) => setCh(c.key, { quoteSrc: e.target.value })} placeholder="e.g. Surah al-Mulk 67:1" />
                          </label>
                          <label className="text-sm font-medium text-ink sm:col-span-2">
                            Key words <span className="font-normal text-ink/65">(one per line)</span>
                            <textarea className={`${input} h-16`} value={c.keywords} onChange={(e) => setCh(c.key, { keywords: e.target.value })} />
                          </label>
                        </div>
                        <button type="button" className="text-sm font-medium text-red-700 hover:underline" onClick={() => setChapters((cs) => cs.filter((x) => x.key !== c.key))}>
                          Remove this chapter
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {sorted.length > 0 && (
                <li>
                  <button type="button" className={btn} disabled={!!busy} onClick={() => save()}>
                    {busy === "save" ? "Saving…" : "Save chapters"}
                  </button>
                </li>
              )}
            </ol>
          </div>
        )}
      </section>

      {/* 3. Questions */}
      <section className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        {step(3, "Quiz questions", questions.length >= 4)}
        {!id ? (
          <p className="text-sm text-ink/70">Save the pack first (step 1), then add questions here.</p>
        ) : (
          <QuestionEditor
            unitId={id}
            topics={slides.map((s) => s.title).filter(Boolean)}
            questions={questions}
            onChange={setQuestions}
            onError={(t) => say(t, true)}
          />
        )}
      </section>

      {/* 4. Check and publish */}
      <section className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        {step(4, "Check, then show to pupils", published)}
        {!id ? (
          <p className="text-sm text-ink/70">Save the pack first.</p>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={!!checkedAt} onChange={(e) => markChecked(e.target.checked)} />
              <span>
                I have checked the Arabic, the transliteration and every Qur&apos;an and hadith reference in this pack.
                {checkedAt && <span className="block text-xs text-ink/65">Checked {new Date(checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} disabled={!!busy || !checkedAt || !videoPath || slides.length === 0 || questions.length === 0} onClick={togglePublished}>
                {published ? "Hide from pupils" : "Show to pupils"}
              </button>
              <span className="text-xs text-ink/65">
                {published
                  ? "Pupils can see this pack."
                  : !checkedAt
                    ? "Tick the check above first."
                    : !videoPath || !slides.length
                      ? "Add the video and at least one chapter."
                      : !questions.length
                        ? "Add at least one question."
                        : "Ready."}
              </span>
              <span className="flex-1" />
              {confirmDelete ? (
                <>
                  <span className="text-sm text-ink/75">Delete the pack, its video and questions?</span>
                  <button type="button" className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!!busy} onClick={removePack}>
                    Yes, delete
                  </button>
                  <button type="button" className={btn} onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="text-sm font-medium text-red-700 hover:underline" onClick={() => setConfirmDelete(true)}>
                  Delete pack
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Add and remove quiz questions on any revision pack. Questions made here are
 * source 'staff', so the content sync never changes them.
 */
export function QuestionEditor({
  unitId,
  topics,
  questions,
  onChange,
  onError,
}: {
  unitId: string;
  topics: string[];
  questions: StaffQ[];
  onChange: (qs: StaffQ[]) => void;
  onError: (text: string) => void;
}) {
  const supabase = getSupabaseClient();
  const blank = { topic: topics[0] || "", question: "", options: ["", "", "", ""], answer: 0, explanation: "", hint: "" };
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const letters = "ABCDEF";

  /**
   * Many questions at once, typed or pasted like this (blank line between):
   *   What does tawhid mean?
   *   - Praying five times a day
   *   * Singling out Allah alone      <- the star marks the right answer
   *   - Giving charity
   *   Why: Tawhid means making Allah one in worship.   (optional)
   */
  async function addPasted() {
    if (!supabase) return;
    const topic = draft.topic.trim();
    if (!topic) return onError("Choose which chapter these questions are about.");
    const blocks = paste.split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
    const rows = [];
    for (const [n, b] of blocks.entries()) {
      const question = b[0].replace(/^\d+[.)]\s*/, "");
      const opts = b.slice(1).filter((l) => /^[-*•]/.test(l));
      const why = b.find((l) => /^why:/i.test(l));
      const options = opts.map((l) => l.replace(/^[-*•]\s*/, ""));
      const answer = opts.findIndex((l) => l.startsWith("*"));
      if (question.length < 3 || options.length < 2 || answer < 0) return onError(`Question ${n + 1} needs at least two answers starting with "-", and the right one starting with "*".`);
      rows.push({
        unit_id: unitId,
        qkey: `staff-${newKey()}`,
        lesson_no: Math.max(1, topics.indexOf(topic) + 1),
        topic,
        question,
        options,
        answer,
        explanation: why ? why.replace(/^why:\s*/i, "") : null,
        hint: null,
        source: "staff",
        in_quiz: true,
        active: true,
      });
    }
    if (!rows.length) return onError("Paste at least one question.");
    setBusy(true);
    const { data, error } = await supabase.from("revision_questions").insert(rows).select("id, topic, question, options, answer, explanation, hint, source");
    setBusy(false);
    if (error) return onError(`Couldn't add the questions: ${error.message}`);
    onChange([...questions, ...((data as StaffQ[]) || [])]);
    setPaste("");
  }

  async function add() {
    if (!supabase) return;
    const options = draft.options.map((o) => o.trim());
    const filled = options.filter(Boolean);
    if (!draft.topic.trim()) return onError("Choose which chapter the question is about.");
    if (draft.question.trim().length < 3) return onError("Write the question.");
    if (filled.length < 2) return onError("Give at least two answers.");
    if (!options[draft.answer]) return onError("Mark which answer is correct.");
    // Drop empty options, keeping the correct answer's position right.
    const kept = options.map((o, i) => ({ o, i })).filter((x) => x.o);
    const answer = kept.findIndex((x) => x.i === draft.answer);
    setBusy(true);
    const row = {
      unit_id: unitId,
      qkey: `staff-${newKey()}`,
      lesson_no: Math.max(1, topics.indexOf(draft.topic) + 1),
      topic: draft.topic.trim(),
      question: draft.question.trim(),
      options: kept.map((x) => x.o),
      answer,
      explanation: draft.explanation.trim() || null,
      hint: draft.hint.trim() || null,
      source: "staff",
      in_quiz: true,
      active: true,
    };
    const { data, error } = await supabase.from("revision_questions").insert(row).select("id, topic, question, options, answer, explanation, hint, source").single();
    setBusy(false);
    if (error) return onError(`Couldn't add the question: ${error.message}`);
    onChange([...questions, data as StaffQ]);
    setDraft({ ...blank, topic: draft.topic });
  }

  async function remove(q: StaffQ) {
    if (!supabase) return;
    const { error } = await supabase.from("revision_questions").update({ active: false }).eq("id", q.id);
    if (error) return onError(`Couldn't remove it: ${error.message}`);
    onChange(questions.filter((x) => x.id !== q.id));
  }

  return (
    <div className="space-y-4">
      {questions.length > 0 && (
        <ol className="space-y-2">
          {questions.map((q, n) => (
            <li key={q.id} className="rounded-xl border border-gold-light/70 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink">
                  {n + 1}. {q.question}
                  <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs font-normal text-ink/70">{q.topic}</span>
                </p>
                <button type="button" onClick={() => remove(q)} className="shrink-0 text-xs font-medium text-red-700 hover:underline" aria-label={`Remove question ${n + 1}`}>
                  Remove
                </button>
              </div>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i} className={`rounded-md px-2 py-1 ${i === q.answer ? "bg-green-50 font-semibold text-green-900" : "bg-cream/60 text-ink/80"}`}>
                    {letters[i]}. {o}
                    {i === q.answer && <span className="sr-only"> (correct)</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <details className="rounded-xl border border-gold-light/70 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Add several questions at once</summary>
        <p className="mt-2 text-xs text-ink/70">
          One question per block, a blank line between them. Start each answer with <code>-</code> and the right answer with <code>*</code>. An optional line starting <code>Why:</code> is shown after answering. They go into the chapter chosen below.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          aria-label="Questions to add"
          className={`mt-2 ${input} font-mono text-xs`}
          placeholder={"What does tawhid mean?\n- Praying five times a day\n* Singling out Allah alone\n- Giving charity\nWhy: Tawhid is making Allah one in worship.\n\nWhich surah is called the essence of tawhid?\n* Al-Ikhlas\n- Al-Fatihah\n- Al-Kawthar"}
        />
        <button type="button" className={`mt-2 ${btnPrimary}`} disabled={busy || !paste.trim()} onClick={addPasted}>
          {busy ? "Adding…" : "Add these questions"}
        </button>
      </details>
      <fieldset className="space-y-2 rounded-xl bg-cream/70 p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Add a question</legend>
        <label className="block text-sm font-medium text-ink">
          Chapter
          {topics.length ? (
            <Select allowEmpty className={input} value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })}>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          ) : (
            <input className={input} value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic" />
          )}
        </label>
        <label className="block text-sm font-medium text-ink">
          Question
          <input className={input} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Answers (choose the correct one)">
          {draft.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${unitId}`}
                checked={draft.answer === i}
                onChange={() => setDraft({ ...draft, answer: i })}
                aria-label={`Answer ${letters[i]} is correct`}
              />
              <input
                className="min-w-0 flex-1 rounded-lg border border-gold-light bg-white px-3 py-2 text-sm"
                value={o}
                onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={`Answer ${letters[i]}${i > 1 ? " (optional)" : ""}`}
                aria-label={`Answer ${letters[i]}`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-ink/65">Choose the circle beside the correct answer.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">
            Why it&apos;s right <span className="font-normal text-ink/65">(shown after answering)</span>
            <input className={input} value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-ink">
            Hint <span className="font-normal text-ink/65">(practice coach)</span>
            <input className={input} value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} />
          </label>
        </div>
        <button type="button" className={btnPrimary} disabled={busy} onClick={add}>
          {busy ? "Adding…" : "Add question"}
        </button>
      </fieldset>
    </div>
  );
}
