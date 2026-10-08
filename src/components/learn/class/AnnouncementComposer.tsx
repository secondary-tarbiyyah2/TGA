"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeHttpUrl, toggleList, wrapSelection, type Edit } from "@/lib/learn/markup";
import { uploadClassFile, type Attachment } from "@/components/learn/class/Attachments";

type Pupil = { id: string; name: string };

const TOOL = "rounded-md px-2.5 py-1 text-sm text-ink/80 hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700";

/** A native switch (role="switch") used for the composer's options. */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink/60">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-teal-700" : "bg-ink/25"}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

/**
 * Class announcement composer: title, a formatted message (bold / italic /
 * underline / list), attached links and files, who it goes to (whole class or
 * chosen pupils), when it appears (now or later) and whether pupils may comment
 * (also needs the class setting). Collapsed to one line until clicked.
 */
export function AnnouncementComposer({ classId, onPosted }: { classId: string; onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [later, setLater] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || audience !== "selected" || pupils.length > 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("enrolments")
      .select("child_id, children(name)")
      .eq("class_id", classId)
      .then(({ data }) => {
        const rows = ((data as unknown as { child_id: string; children: { name: string } | null }[]) || []).map((r) => ({ id: r.child_id, name: r.children?.name || "Pupil" }));
        setPupils(rows.sort((a, b) => a.name.localeCompare(b.name)));
      });
  }, [open, audience, classId, pupils.length]);

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

  const addLink = () => {
    const url = safeHttpUrl(linkDraft);
    if (!url) {
      setError("That doesn't look like a web address.");
      return;
    }
    setError(null);
    setLinks((l) => [...l, { label: url.replace(/^https?:\/\//, "").slice(0, 60), url }]);
    setLinkDraft("");
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    for (const f of Array.from(list)) {
      const r = await uploadClassFile(classId, f);
      if ("error" in r) setError(r.error);
      else setFiles((x) => [...x, r.attachment]);
    }
    setBusy(false);
  };

  const reset = () => {
    setTitle("");
    setBody("");
    setLinks([]);
    setFiles([]);
    setLinkDraft("");
    setAudience("all");
    setPicked(new Set());
    setLater(false);
    setPublishAt("");
    setAllowComments(true);
    setError(null);
    setOpen(false);
  };

  const post = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim() || !body.trim()) return setError("Add a title and a message.");
    if (audience === "selected" && picked.size === 0) return setError("Choose at least one pupil, or send to the whole class.");
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
        publish_at: at,
        audience_child_ids: audience === "selected" ? Array.from(picked) : null,
        author_id: user.id,
      });
      if (err) return setError("Could not post. Try again.");
      reset();
      onPosted();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-gold-light bg-white px-5 py-4 text-left text-sm text-ink/60 shadow-sm hover:bg-cream/50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white" aria-hidden="true">
          +
        </span>
        Announce something to your class
      </button>
    );
  }

  return (
    <section aria-label="New announcement" className="rounded-2xl border border-gold-light bg-white p-5 shadow-sm">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Title"
        maxLength={140}
        className="w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm"
      />
      <div className="mt-3 rounded-lg border border-gold-light/70">
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
        <textarea
          ref={area}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message"
          aria-label="Message"
          rows={5}
          maxLength={6000}
          className="block w-full resize-y rounded-b-lg px-3 py-2 text-sm"
        />
      </div>

      {(files.length > 0 || links.length > 0) && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`f${i}`} className="inline-flex items-center gap-2 rounded-lg bg-cream px-2.5 py-1 text-sm text-ink/80">
              {f.label}
              <button type="button" aria-label={`Remove ${f.label}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-ink/65 hover:text-red-700">
                ×
              </button>
            </li>
          ))}
          {links.map((l, i) => (
            <li key={`l${i}`} className="inline-flex items-center gap-2 rounded-lg bg-cream px-2.5 py-1 text-sm text-ink/80">
              {l.label}
              <button type="button" aria-label={`Remove ${l.label}`} onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} className="text-ink/65 hover:text-red-700">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
          Attach file
          <input type="file" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        </label>
        <input
          type="text"
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
          placeholder="Paste a link"
          aria-label="Link address"
          className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm"
        />
        <button type="button" onClick={addLink} disabled={!linkDraft.trim()} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
          Add link
        </button>
      </div>

      <div className="mt-5 space-y-4 border-t border-gold-light/60 pt-4">
        <div>
          <label htmlFor="ann-audience" className="text-sm font-medium text-ink">
            For
          </label>
          <select
            id="ann-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as "all" | "selected")}
            className="ml-3 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm"
          >
            <option value="all">All pupils in this class</option>
            <option value="selected">Selected pupils</option>
          </select>
          {audience === "selected" && (
            <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto rounded-lg border border-gold-light/60 p-2 sm:grid-cols-2">
              {pupils.length === 0 && <li className="text-sm text-ink/60">Loading pupils…</li>}
              {pupils.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={picked.has(p.id)}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                    />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Switch checked={later} onChange={setLater} label="Schedule for later" hint="It stays hidden from pupils and families until then." />
        {later && (
          <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-label="Publish at" className="rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm" />
        )}
        <Switch checked={allowComments} onChange={setAllowComments} label="Allow comments" hint="Pupils can only comment if the class setting &ldquo;Students can comment&rdquo; is on." />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={reset} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/70 hover:bg-cream">
          Cancel
        </button>
        <button type="button" onClick={post} disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60">
          {busy ? "Working…" : later ? "Schedule" : "Post"}
        </button>
      </div>
    </section>
  );
}
