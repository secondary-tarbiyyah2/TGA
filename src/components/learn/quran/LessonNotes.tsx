"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Dialog } from "@/components/learn/kit";
import { Button, EmptyState, ui } from "@/components/learn/ui";
import { DatePicker } from "@/components/learn/DatePicker";
import { AttachmentsField } from "@/components/learn/class/AttachmentsField";
import { AttachmentList, cleanAttachments, type Attachment } from "@/components/learn/class/Attachments";
import { getSupabaseClient } from "@/lib/supabase/client";
import { latestLessonDay, RECITATION_KINDS, type RecitationKind } from "./RecitationWorkspace";

type Note = { id: string; title: string; body: string; attachments: unknown; lesson_date: string | null; created_at: string };

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * Lesson notes for a Qur'an class (owner, 11 Nov 2026): a photo or PDF of the whiteboard or the notes from a
 * lesson, posted to the class stream so the class's pupils and their families can open it. Listed here by
 * lesson date, newest first. Stored as a stream post of kind "lesson_note" (migration 0208).
 */
export function LessonNotes({ classId }: { classId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, attachments, lesson_date, created_at")
      .eq("class_id", classId)
      .eq("kind", "lesson_note")
      .is("recalled_at", null)
      .order("lesson_date", { ascending: false })
      .limit(30);
    setNotes((data as Note[] | null) || []);
  }, [classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the class's notes from the database
    void load();
  }, [load, tick]);

  return (
    <section aria-labelledby="ln-title" className="rounded-2xl border border-gold-light bg-white" data-guide="quran-lesson-notes">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/70 px-4 py-3">
        <div>
          <h2 id="ln-title" className="t-section">
            Lesson notes
          </h2>
          <p className="t-meta">The whiteboard or notes from a lesson, for the class&apos;s pupils and families. They also appear on the stream.</p>
        </div>
        <Button icon="plus" onClick={() => setOpen(true)}>
          Post a lesson note
        </Button>
      </div>
      {notes === null ? (
        <p className="t-meta px-4 py-3">Loading…</p>
      ) : notes.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState title="No lesson notes yet." />
        </div>
      ) : (
        <ul className="divide-y divide-gold-light/60">
          {notes.map((n) => (
            <li key={n.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <span className="text-sm font-medium text-ink">{n.lesson_date ? fmtDay(n.lesson_date) : ""}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                {n.body && n.body !== "-" && <p className="mt-0.5 whitespace-pre-line text-sm text-ink/80">{n.body}</p>}
                <div className="mt-1.5">
                  <AttachmentList attachments={cleanAttachments(n.attachments)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <LessonNoteDialog classId={classId} onClose={() => setOpen(false)} onPosted={() => setTick((t) => t + 1)} />}
    </section>
  );
}

function LessonNoteDialog({ classId, onClose, onPosted }: { classId: string; onClose: () => void; onPosted: () => void }) {
  const ids = useId();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<RecitationKind | "">("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void latestLessonDay(classId).then((d) => {
      if (alive) setDate((cur) => cur || d);
    });
    return () => {
      alive = false;
    };
  }, [classId]);

  const post = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!date) return setError("Choose the lesson's date.");
    if (files.length + links.length === 0) return setError("Attach a photo or a PDF of the whiteboard or notes.");
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setError("You are signed out.");
      const kindLabel = RECITATION_KINDS.find((k) => k.value === kind)?.label;
      const autoTitle = `Lesson note, ${fmtDay(date)}${kindLabel ? ` · ${kindLabel}` : ""}`;
      const { error: e } = await supabase.from("announcements").insert({
        scope: "class",
        class_id: classId,
        kind: "lesson_note",
        lesson_date: date,
        title: (title.trim() || autoTitle).slice(0, 140),
        // A stream post needs a message; a note on its own is fine.
        body: note.trim() || "Notes from the lesson are attached.",
        body_format: "plain",
        attachments: [...files, ...links],
        allow_comments: false,
        pinned: false,
        author_id: user.id,
      });
      if (e) return setError("Could not post the note. Try again.");
      onPosted();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Post a lesson note"
      description="A photo or PDF of the whiteboard or notes. The class's pupils and their families can open it."
      size="lg"
      onClose={onClose}
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={post} disabled={busy || uploading}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-1 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-3">
          <div>
            <p className={`${ui.label} mb-1.5`}>Photo or PDF</p>
            <AttachmentsField classId={classId} files={files} links={links} onFiles={setFiles} onLinks={setLinks} onError={setError} onBusy={setUploading} />
          </div>
          <div>
            <label htmlFor={`${ids}-note`} className={ui.label}>
              Note for families (optional)
            </label>
            <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Anything families should know before opening it" className={`${ui.input} mt-1 resize-none`} />
          </div>
        </div>
        <div className="space-y-3 sm:border-l sm:border-gold-light sm:pl-5">
          <DatePicker label="Lesson date" value={date} onChange={setDate} />
          <div>
            <p id={`${ids}-kind`} className={ui.label}>
              What it covers (optional)
            </p>
            <div role="radiogroup" aria-labelledby={`${ids}-kind`} className="mt-1 grid gap-1">
              {RECITATION_KINDS.map((k) => (
                <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(kind === k.value ? "" : k.value)} className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${kind === k.value ? "border-forest-700 font-semibold text-forest-900" : "border-gold-light text-ink/80"}`}>
                  {k.label}
                  <span lang="ar" dir="rtl" className="text-ink/60">
                    {k.ar}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor={`${ids}-title`} className={ui.label}>
              Title (optional)
            </label>
            <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="For example: Tajweed, rules of noon saakin" className={`${ui.input} mt-1`} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
