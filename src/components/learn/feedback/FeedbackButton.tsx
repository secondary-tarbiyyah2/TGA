"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getRecentActivity, safePath, type ActivityEvent } from "@/lib/learn/activityLog";
import { ACCEPT_ATTR, KIND_LABEL, MAX_FILES, environmentSnapshot, fileProblem, formatBytes, submitFeedback, ticketRef, type FeedbackKind } from "@/lib/learn/feedback";
import { Icon, type IconName } from "@/components/learn/Icon";
import { ActivityList } from "@/components/learn/feedback/ActivityList";

const KINDS: { key: FeedbackKind; icon: IconName; hint: string; titlePh: string; detailsPh: string }[] = [
  { key: "problem", icon: "bug", hint: "An error, something broken or confusing", titlePh: "The register won't save", detailsPh: "What did you do, what happened, and what did you expect to happen?" },
  { key: "idea", icon: "lightbulb", hint: "A way to make the portal better", titlePh: "Show homework due dates on the calendar", detailsPh: "What would you like, and how would it help you?" },
  { key: "question", icon: "circleHelp", hint: "Not sure how something works", titlePh: "How do I change my child's class?", detailsPh: "What are you trying to do?" },
];

/** Top-bar button that opens the "Send feedback" dialog. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(true)} title="Send feedback" aria-label="Send feedback" aria-haspopup="dialog" className="portal-topbar-btn text-sm font-medium text-ink/75" data-activity-ignore>
        <Icon name="messageSquarePlus" className="h-[18px] w-[18px]" />
        <span className="hidden xl:inline">Feedback</span>
      </button>
      {open &&
        createPortal(
          <FeedbackDialog
            onClose={() => {
              setOpen(false);
              btnRef.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Snapshot what was happening *before* the dialog opened.
  const [activity] = useState<ActivityEvent[]>(() => getRecentActivity());
  const [pagePath] = useState(() => safePath(pathname, typeof window === "undefined" ? "" : window.location.search));
  const [env] = useState(() => environmentSnapshot());
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ title?: string; details?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const meta = KINDS.find((k) => k.key === kind)!;

  // Latest values for the key handler, so the effect below runs once
  // (re-running it would move focus back to the first field).
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input[type=radio]:checked")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']), input:not([disabled]):not([type=hidden]):not([tabindex='-1']), textarea, a[href], summary");
        const list = Array.from(f).filter((el) => el.offsetParent !== null || el.matches("input[type=radio]"));
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const addFiles = (incoming: File[]) => {
    setFileError(null);
    const next = [...files];
    for (const f of incoming) {
      if (next.length >= MAX_FILES) {
        setFileError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      const problem = fileProblem(f);
      if (problem) {
        setFileError(problem);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault();
      addFiles(images.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `screenshot-${Date.now()}-${i + 1}.png`, { type: f.type })));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const submit = async () => {
    const errs: typeof errors = {};
    if (title.trim().length < 3) errs.title = "Add a short summary (at least 3 characters).";
    if (!details.trim()) errs.details = "Tell us a bit more so we can help.";
    setErrors(errs);
    if (errs.title || errs.details) {
      panelRef.current?.querySelector<HTMLElement>(errs.title ? "#fb-title" : "#fb-details")?.focus();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrors({ form: "The portal isn't connected right now. Try again later." });
      return;
    }
    setBusy(true);
    const res = await submitFeedback(supabase, { kind, title, details, pagePath, activity, files });
    setBusy(false);
    if (res.ok) setSent(res.number);
    else setErrors({ form: res.error });
  };

  return (
    <div className="portal fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" data-activity-ignore>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-ink/40" onClick={() => !busy && onClose()} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gold-light px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              Send feedback
            </h2>
            <p className="text-sm text-ink/70">Report a problem, suggest an improvement or ask a question.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="portal-icon-btn -mr-2 shrink-0">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {sent !== null ? (
          <div className="px-5 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700">
              <Icon name="circleCheck" className="h-6 w-6" />
            </span>
            <p className="mt-3 text-base font-semibold text-ink">Thank you, we&apos;ve got it</p>
            <p className="mt-1 text-sm text-ink/70">
              Your reference is <span className="font-semibold text-ink">{ticketRef(sent)}</span>. You can follow its progress and read our reply in Your feedback.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/feedback" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink hover:bg-cream">
                Your feedback
              </Link>
              <button type="button" onClick={onClose} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                <Icon name="shieldAlert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Worried about a child&apos;s safety or wellbeing? Don&apos;t use this form.{" "}
                  <Link href="/report-concern" onClick={onClose} className="font-semibold underline">
                    Report a concern
                  </Link>{" "}
                  instead.
                </span>
              </p>

              <fieldset>
                <legend className="text-sm font-semibold text-ink">What is it about?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {KINDS.map((k) => (
                    <label key={k.key} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-700 ${kind === k.key ? "border-teal-700 bg-teal-100/60" : "border-gold-light hover:bg-cream"}`}>
                      <input type="radio" name="fb-kind" value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} className="sr-only" />
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <Icon name={k.icon} className={`h-[18px] w-[18px] ${kind === k.key ? "text-teal-700" : "text-ink/65"}`} />
                        {KIND_LABEL[k.key]}
                      </span>
                      <span className="text-xs text-ink/65">{k.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="fb-title" className="text-sm font-semibold text-ink">
                  Short summary
                </label>
                <input
                  id="fb-title"
                  value={title}
                  maxLength={140}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
                  }}
                  placeholder={meta.titlePh}
                  aria-invalid={!!errors.title || undefined}
                  aria-describedby={errors.title ? "fb-title-err" : undefined}
                  className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
                />
                {errors.title && (
                  <p id="fb-title-err" className="mt-1 text-sm text-red-700">
                    {errors.title}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="fb-details" className="text-sm font-semibold text-ink">
                  Details
                </label>
                <textarea
                  id="fb-details"
                  value={details}
                  maxLength={5000}
                  rows={5}
                  onPaste={onPaste}
                  onChange={(e) => {
                    setDetails(e.target.value);
                    if (errors.details) setErrors((x) => ({ ...x, details: undefined }));
                  }}
                  placeholder={meta.detailsPh}
                  aria-invalid={!!errors.details || undefined}
                  aria-describedby={`fb-details-hint${errors.details ? " fb-details-err" : ""}`}
                  className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
                />
                <p id="fb-details-hint" className="mt-1 text-xs text-ink/65">
                  Tip: you can paste a screenshot straight into this box.
                </p>
                {errors.details && (
                  <p id="fb-details-err" className="mt-1 text-sm text-red-700">
                    {errors.details}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">Attachments</p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm ${dragging ? "border-teal-700 bg-teal-100/50" : "border-gold-light"}`}
                >
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES} className="inline-flex items-center gap-1.5 rounded-lg border border-gold-light bg-white px-3 py-1.5 font-medium text-ink hover:bg-cream disabled:opacity-50">
                    <Icon name="paperclip" className="h-4 w-4" />
                    Add files
                  </button>
                  <span className="text-xs text-ink/65">or drag them here. Screenshots, PDFs, documents or short videos, up to {MAX_FILES} files, 10 MB each.</span>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files || []));
                      e.target.value = "";
                    }}
                  />
                </div>
                {fileError && (
                  <p role="alert" className="mt-1 text-sm text-red-700">
                    {fileError}
                  </p>
                )}
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-cream px-3 py-1.5 text-sm">
                        <Icon name={f.type.startsWith("image/") ? "image" : "file"} className="h-4 w-4 shrink-0 text-ink/65" />
                        <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                        <span className="shrink-0 text-xs text-ink/65">{formatBytes(f.size)}</span>
                        <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="-mr-1 rounded p-1 text-ink/65 hover:bg-white hover:text-ink">
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <details className="group rounded-xl border border-gold-light">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-ink">Also sent: what you were just doing</span>
                    <span className="block text-xs text-ink/65">
                      This page, your browser and your last {activity.length} action{activity.length === 1 ? "" : "s"} in the portal, so we can see what happened.
                    </span>
                  </span>
                  <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-ink/65 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t border-gold-light px-4 py-3 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-ink/65">Page</dt>
                    <dd className="break-all text-ink">{pagePath}</dd>
                    <dt className="text-ink/65">Browser</dt>
                    <dd className="break-words text-ink">{String(env.userAgent)}</dd>
                    <dt className="text-ink/65">Window</dt>
                    <dd className="text-ink">
                      {String(env.viewport)} · {String(env.language)} · {String(env.timeZone)}
                    </dd>
                  </dl>
                  <ActivityList events={activity} />
                  <p className="text-xs text-ink/65">It never includes anything you typed into a form or your password. It&apos;s deleted 90 days after your request is closed.</p>
                </div>
              </details>

              {errors.form && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errors.form}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gold-light px-5 py-3">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink hover:bg-cream">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
                {busy ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
