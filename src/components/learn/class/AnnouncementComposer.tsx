"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toggleList, wrapSelection, type Edit } from "@/lib/learn/markup";
import { type Attachment } from "@/components/learn/class/Attachments";
import { AttachmentsField } from "@/components/learn/class/AttachmentsField";
import { PupilPicker } from "@/components/learn/class/PupilPicker";
import { Dialog } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { Button, Switch as UiSwitch, ui } from "@/components/learn/ui";

const TOOL = "rounded-md px-2.5 py-1 text-sm text-ink/80 hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700";

/** A native switch (role="switch") used for the composer's options. */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink/65">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-forest-700" : "bg-[var(--portal-control-line)]"}`}
      >
        <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform motion-reduce:transition-none ${checked ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
      </button>
    </div>
  );
}

const seg = (on: boolean) =>
  `flex-1 rounded-[0.5625rem] px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700 ${on ? "bg-white text-ink shadow-[0_1px_3px_rgba(20,25,20,0.15)]" : "text-ink-500 hover:text-ink"}`;

/**
 * "Add a post" for the class stream: a dialog sized to fit the screen without scrolling (owner,
 * 11 Nov 2026). Left: the title, a formatted message (bold, italic, underline, list) and what is
 * attached (a file, a link, or a printable from the resource library). Right: who it is for (the
 * whole class or chosen pupils), when it appears (now or a set time), comments and pinning.
 */
export function PostDialog({ classId, onClose, onPosted }: { classId: string; onClose: () => void; onPosted: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  // null: the whole class; otherwise the chosen pupils.
  const [audience, setAudience] = useState<string[] | null>(null);
  const [later, setLater] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const ids = useId();

  const apply = (fn: (value: string, s: number, e: number) => Edit) => {
    const el = area.current;
    if (!el) return;
    const r = fn(body, el.selectionStart, el.selectionEnd);
    setBody(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };

  const post = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim() || !body.trim()) return setError("Add a title and a message.");
    if (audience !== null && audience.length === 0) return setError("Choose at least one pupil, or send to the whole class.");
    let at: string | null = null;
    if (later) {
      const d = new Date(publishAt);
      if (!publishAt || Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return setError("Pick a time in the future.");
      at = d.toISOString();
    }
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setError("You are signed out.");
      const { error: err } = await supabase.from("announcements").insert({
        scope: "class",
        class_id: classId,
        title: title.trim(),
        body: body.trim(),
        body_format: "markup",
        attachments: [...files, ...links],
        allow_comments: allowComments,
        pinned,
        publish_at: at,
        audience_child_ids: audience,
        author_id: user.id,
      });
      if (err) return setError("Could not post. Try again.");
      onPosted();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add a post"
      description="It appears on the class stream for the pupils you choose and their families."
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
            {busy ? "Posting…" : later ? "Schedule post" : "Post"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-1 sm:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          <div>
            <label htmlFor={`${ids}-title`} className={ui.label}>
              Title
            </label>
            <input id={`${ids}-title`} data-autofocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="For example: Bring your Qur'an on Thursday" className={`${ui.input} mt-1`} />
          </div>
          <div>
            <label htmlFor={`${ids}-body`} className={ui.label}>
              Message
            </label>
            <div className="mt-1 rounded-[0.6875rem] border border-[var(--portal-control-line)] focus-within:border-forest-500 focus-within:shadow-[0_0_0_3px_rgba(61,122,95,0.18)]">
              <div className="flex flex-wrap gap-0.5 border-b border-gold-light/70 px-1.5 py-1" role="toolbar" aria-label="Formatting">
                <button type="button" className={`${TOOL} font-bold`} aria-label="Bold" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "**"))}>
                  B
                </button>
                <button type="button" className={`${TOOL} italic`} aria-label="Italic" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "*"))}>
                  I
                </button>
                <button type="button" className={`${TOOL} underline`} aria-label="Underline" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "++"))}>
                  U
                </button>
                <button type="button" className={TOOL} aria-label="Bulleted list" onClick={() => apply(toggleList)}>
                  List
                </button>
              </div>
              <textarea id={`${ids}-body`} ref={area} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message" rows={6} maxLength={6000} className="block w-full resize-none rounded-b-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div>
            <p className={`${ui.label} mb-1.5`}>Attach</p>
            <AttachmentsField classId={classId} files={files} links={links} onFiles={setFiles} onLinks={setLinks} onError={setError} onBusy={setUploading} />
          </div>
        </div>

        <div className="space-y-4 sm:border-l sm:border-gold-light sm:pl-5">
          <PupilPicker classId={classId} value={audience} onChange={setAudience} label="For" />
          <div>
            <p id={`${ids}-when`} className={ui.label}>
              When
            </p>
            <div role="radiogroup" aria-labelledby={`${ids}-when`} className="mt-1 flex rounded-xl bg-[var(--portal-sunken)] p-1">
              <button type="button" role="radio" aria-checked={!later} className={seg(!later)} onClick={() => setLater(false)}>
                Now
              </button>
              <button type="button" role="radio" aria-checked={later} className={seg(later)} onClick={() => setLater(true)}>
                Schedule
              </button>
            </div>
            {later && (
              <>
                <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-label="Post at" className={`${ui.input} mt-2`} />
                <p className={`${ui.hint} mt-1`}>Hidden from pupils and families until then.</p>
              </>
            )}
          </div>
          <div className="-mx-3 space-y-0.5">
            <UiSwitch checked={allowComments} onChange={setAllowComments} label="Allow comments" hint="Pupils comment only if the class allows it." />
            <UiSwitch checked={pinned} onChange={setPinned} label="Pin to the top" hint="Stays first on the stream." />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** The stream's "Add a post" row; the dialog opens over the page, which stays where it was. */
export function AnnouncementComposer({ classId, onPosted, classworkHref }: { classId: string; onPosted: () => void; /** Where each kind of classwork is created (Classwork, with its own form open). */ classworkHref?: (kind: "assignment" | "quiz" | "question" | "material") => string }) {
  const [open, setOpen] = useState(false);
  const kinds = [
    { k: "assignment", label: "Assignment", icon: "notebookPen" },
    { k: "quiz", label: "Quiz", icon: "listChecks" },
    { k: "question", label: "Question", icon: "circleHelp" },
    { k: "material", label: "Material", icon: "bookOpen" },
  ] as const;
  return (
    <section aria-label="Post to the class" className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-full bg-forest-700 text-white" aria-hidden="true">
          <Icon name="megaphone" size="sm" />
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-guide="stream-add-post"
          className="flex min-h-11 min-w-0 flex-1 items-center rounded-[0.6875rem] border border-[var(--portal-control-line)] bg-[var(--portal-row-hover)] px-4 text-left text-sm text-ink-500 transition-colors hover:border-[var(--portal-control-line-hover)] hover:text-ink-700 focus-visible:shadow-[0_0_0_3px_var(--portal-focus-ring)] focus-visible:outline-none"
        >
          <span className="truncate">Share something with your class</span>
        </button>
        <Button variant="primary" onClick={() => setOpen(true)} className="max-sm:hidden">
          Post
        </Button>
      </div>
      {classworkHref && (
        <nav aria-label="Or set classwork" className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--portal-line-soft)] pt-3 text-sm">
          <span className="mr-1 text-[0.8125rem] text-ink-500">Or set classwork</span>
          {kinds.map((x) => (
            <Link key={x.k} href={classworkHref(x.k)} scroll={false} className={ui.chip}>
              <Icon name={x.icon} size="sm" />
              {x.label}
            </Link>
          ))}
        </nav>
      )}
      {open && <PostDialog classId={classId} onClose={() => setOpen(false)} onPosted={onPosted} />}
    </section>
  );
}
