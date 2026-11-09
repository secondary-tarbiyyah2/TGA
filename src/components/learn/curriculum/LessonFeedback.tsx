"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Modal } from "@/components/learn/curriculum/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { StatusChip, ui, type Tone } from "@/components/learn/ui";
import { ScrollArea } from "@/components/learn/ScrollArea";
import {
  STATUS_LABEL,
  answerFeedback,
  feedbackLog,
  lessonLabel,
  lessonParts,
  loadFeedback,
  sendFeedback,
  type FeedbackEvent,
  type FeedbackStatus,
  type LessonFeedback,
} from "@/lib/learn/lessonFeedback";

const btn = `${ui.btnSecondary} ${ui.sm}`;
const TONE: Record<FeedbackStatus, Tone> = { open: "warn", accepted: "info", done: "good", declined: "neutral" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FeedbackStatusChip({ status }: { status: FeedbackStatus }) {
  return <StatusChip tone={TONE[status]}>{STATUS_LABEL[status]}</StatusChip>;
}

/**
 * "Feedback on this lesson": any member of staff notes something to fix, on the whole lesson or
 * one part of it. It goes to the Headteacher and Admin (Action centre, Curriculum).
 */
export function FeedbackDialog({
  lesson,
  content,
  initialPart = "lesson",
  onClose,
  onSent,
}: {
  lesson: { id: string; title: string; lesson_no: number };
  content?: { teach?: { heading?: string }[]; hook?: unknown } | null;
  initialPart?: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const parts = lessonParts(content);
  const [part, setPart] = useState(parts.some((p) => p.key === initialPart) ? initialPart : "lesson");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<LessonFeedback[]>([]);
  const ids = useId();
  useEffect(() => {
    let live = true;
    loadFeedback({ lessonId: lesson.id }).then((r) => live && setMine(r));
    return () => {
      live = false;
    };
  }, [lesson.id]);

  const send = async () => {
    if (!body.trim()) return setError("Write what needs changing.");
    setBusy(true);
    const e = await sendFeedback(lesson.id, part, parts.find((p) => p.key === part)?.label || "The whole lesson", body);
    setBusy(false);
    if (e) return setError(e);
    onSent("Thank you. Your feedback has gone to the Headteacher, who will let you know what happens.");
  };

  return (
    <Modal title={`Feedback on lesson ${lesson.lesson_no}: ${lesson.title}`} onClose={onClose}>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-ink/75">Spotted something to fix? Say which part and what should change. Only the Headteacher and Admin see it. Pupils and parents never do.</p>
        <div>
          <span id={`${ids}-part`} className={ui.label}>
            Which part?
          </span>
          <Dropdown value={part} onChange={setPart} options={parts.map((p) => ({ value: p.key, label: p.label }))} aria-labelledby={`${ids}-part`} className={`mt-1 ${ui.select}`} />
        </div>
        <label className="block">
          <span className={ui.label}>What needs changing?</span>
          <span className={`block ${ui.hint}`}>For example: &ldquo;This slide needs a picture&rdquo; or &ldquo;Answer 3 is wrong, it should be 42&rdquo;.</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} className={`mt-1 ${ui.textarea}`} />
        </label>
        {error && <p role="alert" className={ui.error}>{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ui.btnPrimary} onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Send feedback"}
          </button>
          <button type="button" className={ui.btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
        {mine.length > 0 && (
          <div className="border-t border-gold-light pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Feedback you can see on this lesson</p>
            <ul className="mt-1 space-y-2">
              {mine.slice(0, 6).map((f) => (
                <li key={f.id} className="text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <FeedbackStatusChip status={f.status} />
                    <span className="text-ink/65">{f.part_label || "The whole lesson"}</span>
                  </span>
                  <span className="block text-ink">{f.body}</span>
                  {f.response && <span className="block text-xs text-ink/70">Reply: {f.response}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** One note with the Headteacher's actions: accept and edit, mark done, or decline with a reason. */
export function FeedbackItem({ f, onEdit, onChanged, compact }: { f: LessonFeedback; onEdit?: (f: LessonFeedback) => void; onChanged: (f: LessonFeedback, message: string) => void; compact?: boolean }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<FeedbackEvent[] | null>(null);
  const act = async (status: FeedbackStatus, response?: string | null) => {
    setBusy(true);
    setError(null);
    const e = await answerFeedback(f.id, status, response);
    setBusy(false);
    if (e) return setError(e);
    setDeclining(false);
    onChanged({ ...f, status, response: response === undefined ? f.response : response }, status === "done" ? "Marked done. The member of staff can see it." : status === "declined" ? "Declined. The member of staff can see your reason." : "Accepted.");
  };
  const open = f.status === "open" || f.status === "accepted";
  return (
    <li className="space-y-2 rounded-xl border border-gold-light bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FeedbackStatusChip status={f.status} />
        <span className="text-xs font-semibold text-ink">{f.part_label || "The whole lesson"}</span>
        <span className="ml-auto text-xs text-ink/65">
          {f.author_name || "A member of staff"} · {when(f.created_at)}
        </span>
      </div>
      {!compact && f.lesson && <p className="text-xs text-ink/70">{lessonLabel(f.lesson)}</p>}
      <p className="whitespace-pre-line text-sm text-ink">{f.body}</p>
      {f.response && (
        <p className="rounded-lg bg-cream px-2 py-1 text-xs text-ink/80">
          {f.status === "declined" ? "Declined" : "Reply"}: {f.response}
          {f.handled_by_name ? ` (${f.handled_by_name})` : ""}
        </p>
      )}
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          {onEdit && (
            <button type="button" className={`${ui.btnPrimary} ${ui.sm}`} disabled={busy} onClick={() => onEdit(f)}>
              Accept and edit
            </button>
          )}
          <button type="button" className={btn} disabled={busy} onClick={() => act("done", f.response || "Changed in the lesson")}>
            Mark done
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => setDeclining((d) => !d)} aria-expanded={declining}>
            Decline
          </button>
          <button
            type="button"
            className={`${ui.btnLink} !text-xs`}
            onClick={async () => setLog(log ? null : await feedbackLog(f.id))}
            aria-expanded={!!log}
          >
            {log ? "Hide history" : "History"}
          </button>
        </div>
      )}
      {declining && (
        <div className="space-y-2 rounded-lg bg-cream/70 p-2">
          <label className="block">
            <span className={ui.label}>Why not? (the member of staff sees this)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className={`mt-1 ${ui.input}`} placeholder="e.g. Answer 3 is correct: the units are in cm" />
          </label>
          <button type="button" className={`${ui.btnDanger} ${ui.sm}`} disabled={busy || !reason.trim()} onClick={() => act("declined", reason)}>
            Decline with this reason
          </button>
        </div>
      )}
      {log && (
        <ul className="space-y-0.5 border-t border-gold-light/70 pt-2 text-xs text-ink/70">
          {log.map((e) => (
            <li key={e.id}>
              {when(e.at)} · {e.actor_name || "Someone"} · {e.action === "created" ? "sent it" : e.action === "response" ? "replied" : e.action}
              {e.note && e.action !== "created" ? `: ${e.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className={ui.error}>{error}</p>}
    </li>
  );
}

/** Headteacher/Admin: every note, waiting ones first. */
export function FeedbackQueue({ onClose, onEdit }: { onClose: () => void; onEdit: (f: LessonFeedback) => void }) {
  const [all, setAll] = useState<LessonFeedback[] | null>(null);
  const [show, setShow] = useState<"waiting" | "all">("waiting");
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => setAll(await loadFeedback()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the queue once
    load();
  }, [load]);
  const waiting = (all || []).filter((f) => f.status === "open" || f.status === "accepted");
  const list = show === "waiting" ? waiting : all || [];
  return (
    <Modal title="Lesson feedback from staff" onClose={onClose} wide>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-2">
          <button type="button" className={show === "waiting" ? ui.chipOn : ui.chip} onClick={() => setShow("waiting")} aria-pressed={show === "waiting"}>
            Waiting ({waiting.length})
          </button>
          <button type="button" className={show === "all" ? ui.chipOn : ui.chip} onClick={() => setShow("all")} aria-pressed={show === "all"}>
            All ({(all || []).length})
          </button>
          {message && (
            <p role="status" className="ml-auto text-sm text-teal-900">
              {message}
            </p>
          )}
        </div>
        <ScrollArea label="Lesson feedback" className="min-h-0 flex-1 p-4">
          {all === null ? (
            <p className="text-sm text-ink/65">Loading…</p>
          ) : list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gold-light p-8 text-center text-sm text-ink/70">{show === "waiting" ? "Nothing waiting. Staff feedback on lessons appears here." : "No lesson feedback yet."}</p>
          ) : (
            <ul className="mx-auto max-w-3xl space-y-3">
              {list.map((f) => (
                <FeedbackItem
                  key={f.id}
                  f={f}
                  onEdit={onEdit}
                  onChanged={(nf, m) => {
                    setAll((a) => (a || []).map((x) => (x.id === nf.id ? nf : x)));
                    setMessage(m);
                  }}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>
    </Modal>
  );
}
