"use client";

import { useId, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { type Attachment } from "@/components/learn/class/Attachments";
import { AttachmentsField } from "@/components/learn/class/AttachmentsField";
import { Dialog } from "@/components/learn/kit";
import { Icon, type IconName } from "@/components/learn/Icon";
import { Select } from "@/components/learn/Select";
import { Button, Switch, ui } from "@/components/learn/ui";

export type ClassworkType = "assignment" | "quiz" | "question" | "material";
export type CreatePick = ClassworkType | "post" | "topic";

/** The four kinds of classwork, each with what it is for, so a teacher picks the right one. */
export const CLASSWORK_TYPES: { kind: ClassworkType; icon: IconName; title: string; body: string; pupils: string }[] = [
  {
    kind: "assignment",
    icon: "notebookPen",
    title: "Assignment",
    body: "Work to hand in by a date: typed, a file, a photo or a link.",
    pupils: "You mark it, give a mark and feedback, and can ask for it again.",
  },
  {
    kind: "quiz",
    icon: "listChecks",
    title: "Quiz assignment",
    body: "Questions marked for you: multiple choice, true or false, short answer, matching and ordering.",
    pupils: "Build it yourself or have a draft written from the unit for you to check.",
  },
  {
    kind: "question",
    icon: "circleHelp",
    title: "Question",
    body: "One question for the class to answer, for a quick check or a discussion.",
    pupils: "Pupils reply in the class comments under it.",
  },
  {
    kind: "material",
    icon: "bookOpen",
    title: "Material",
    body: "Notes, files, links or a printable from the resource library.",
    pupils: "For pupils to read or use. Nothing to hand in.",
  },
];

/**
 * "Create": the kinds of classwork as large cards, not a dropdown (owner, 11 Nov 2026), each
 * saying what it is for. Picking one opens its own form; a post and a topic sit underneath.
 */
export function CreatePicker({ onPick, onClose }: { onPick: (k: CreatePick) => void; onClose: () => void }) {
  return (
    <Dialog title="Add to classwork" description="Choose what you are setting. Each has its own form." size="lg" onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Kinds of classwork">
        {CLASSWORK_TYPES.map((t, i) => (
          <li key={t.kind}>
            <button
              type="button"
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onPick(t.kind)}
              className="group flex h-full w-full items-start gap-3 rounded-xl border border-gold-light bg-white p-4 text-left transition-colors hover:border-forest-700 hover:bg-forest-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-light text-forest-700 group-hover:border-forest-700" aria-hidden="true">
                <Icon name={t.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold text-ink">{t.title}</span>
                <span className="mt-0.5 block text-sm text-ink/80">{t.body}</span>
                <span className="mt-1 block text-xs text-ink/65">{t.pupils}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gold-light pt-3">
        <span className="t-meta mr-1">Also:</span>
        <Button size="sm" variant="ghost" icon="megaphone" onClick={() => onPick("post")}>
          A post on the stream
        </Button>
        <Button size="sm" variant="ghost" icon="layers" onClick={() => onPick("topic")}>
          A new topic
        </Button>
      </div>
    </Dialog>
  );
}

type Topic = { id: string; name: string };

/**
 * A Question or a Material, each in its own well-sized dialog with a form that suits it: a
 * question is the question itself (pupils answer in the comments, so comments are always on); a
 * material is a title, notes and what is attached (files, links, a resource from the library).
 */
export function MaterialDialog({ classId, kind, topics, defaultTopic = "", onClose, onDone }: { classId: string; kind: "material" | "question"; topics: Topic[]; defaultTopic?: string; onClose: () => void; onDone: () => void }) {
  const q = kind === "question";
  const ids = useId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topicId, setTopicId] = useState(defaultTopic);
  const [allowComments, setAllowComments] = useState(true);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim()) return setError(q ? "Write the question." : "Add a title.");
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_materials").insert({
      class_id: classId,
      topic_id: topicId || null,
      kind,
      title: title.trim(),
      body: body.trim() || null,
      resources: [...files, ...links],
      // Pupils answer a question in the comments, so a question always has them.
      allow_comments: q ? true : allowComments,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (err) return setError("Could not save. Try again.");
    onDone();
  };

  return (
    <Dialog
      title={q ? "Ask the class a question" : "Share a material"}
      description={q ? "Pupils answer in the class comments under it. Families can read it." : "Something for pupils to read or use. Nothing to hand in."}
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
          <Button variant="primary" onClick={save} disabled={busy || uploading}>
            {busy ? "Saving…" : q ? "Ask" : "Share"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-1 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-3">
          <div>
            <label htmlFor={`${ids}-t`} className={ui.label}>
              {q ? "Question" : "Title"}
            </label>
            {q ? (
              <textarea id={`${ids}-t`} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} rows={2} maxLength={200} placeholder="For example: Why do we say Bismillah before we eat?" className={`${ui.input} mt-1 resize-none`} />
            ) : (
              <input id={`${ids}-t`} data-autofocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="For example: Knowledge organiser, Unit 2" className={`${ui.input} mt-1`} />
            )}
          </div>
          <div>
            <label htmlFor={`${ids}-b`} className={ui.label}>
              {q ? "Instructions" : "Notes"} <span className="font-normal text-ink/65">(optional)</span>
            </label>
            <textarea id={`${ids}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={q ? 3 : 5} maxLength={8000} placeholder={q ? "For example: Answer in two sentences and give one reason." : "What it is and how to use it."} className={`${ui.input} mt-1 resize-none`} />
          </div>
          <div>
            <p className={`${ui.label} mb-1.5`}>{q ? "Something to look at first" : "Attach"}</p>
            <AttachmentsField classId={classId} files={files} links={links} onFiles={setFiles} onLinks={setLinks} onError={setError} onBusy={setUploading} />
          </div>
        </div>
        <div className="space-y-4 sm:border-l sm:border-gold-light sm:pl-5">
          <div>
            <label htmlFor={`${ids}-topic`} className={ui.label}>
              Topic
            </label>
            <Select id={`${ids}-topic`} value={topicId} onChange={(e) => setTopicId(e.target.value)} className={`${ui.select} mt-1`}>
              <option value="">No topic</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          {q ? (
            <p className="text-sm text-ink/70">Answers appear as class comments, so pupils can see each other&apos;s replies. You can remove any comment.</p>
          ) : (
            <div className="-mx-3">
              <Switch checked={allowComments} onChange={setAllowComments} label="Allow comments" hint="Pupils comment only if the class allows it." />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** A new topic: one field in a small dialog. */
export function TopicDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const err = await onSave(name.trim());
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <Dialog
      title="New topic"
      description="Topics group the classwork list, for example by week or unit."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
            Add topic
          </Button>
        </>
      }
    >
      <label htmlFor={`${ids}-n`} className={ui.label}>
        Topic name
      </label>
      <input id={`${ids}-n`} data-autofocus type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={80} placeholder="For example: Week 3: Tajweed" className={`${ui.input} mt-1`} />
      {error && (
        <p role="alert" className={`${ui.error} mt-1`}>
          {error}
        </p>
      )}
    </Dialog>
  );
}
