"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeHttpUrl } from "@/lib/learn/markup";
import { fetchClass } from "@/lib/learn/classes";
import { RESOURCE_COLUMNS, resourceBlob, resourceFileName, typeLabel, type CurriculumResource } from "@/lib/learn/resources";
import { uploadClassFile, type Attachment } from "@/components/learn/class/Attachments";
import { Icon } from "@/components/learn/Icon";
import { Button, ui } from "@/components/learn/ui";

/**
 * Attach things to a post or a piece of classwork: a file from the computer, a web link, or a
 * printable resource from the school's resource library (its PDF is copied into the class's own
 * files, the same path as "Share to class" in Resources). The library opens as a layer over the
 * dialog it sits in, with its own Back, so the dialog never grows or scrolls.
 *
 * Put it inside a positioned container (the portal `Dialog` and `SidePanel` both are).
 */
export function AttachmentsField({
  classId,
  files,
  links,
  onFiles,
  onLinks,
  onError,
  onBusy,
}: {
  classId: string;
  files: Attachment[];
  links: Attachment[];
  onFiles: (next: Attachment[]) => void;
  onLinks: (next: Attachment[]) => void;
  onError: (message: string | null) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [library, setLibrary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const libraryBtn = useRef<HTMLButtonElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  const busy = (b: boolean) => {
    setUploading(b);
    onBusy?.(b);
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    busy(true);
    onError(null);
    const added: Attachment[] = [];
    for (const f of Array.from(list)) {
      const r = await uploadClassFile(classId, f);
      if ("error" in r) onError(r.error);
      else added.push(r.attachment);
    }
    onFiles([...files, ...added]);
    busy(false);
  };

  const addLink = () => {
    const url = safeHttpUrl(linkDraft);
    if (!url) return onError("That doesn't look like a web address. It should start with https://");
    onError(null);
    onLinks([...links, { label: url.replace(/^https?:\/\//, "").slice(0, 60), url }]);
    setLinkDraft("");
    setLinkOpen(false);
  };

  useEffect(() => {
    if (linkOpen) linkInput.current?.focus();
  }, [linkOpen]);

  const all = [...files.map((a, i) => ({ a, remove: () => onFiles(files.filter((_, j) => j !== i)), kind: "file" as const })), ...links.map((a, i) => ({ a, remove: () => onLinks(links.filter((_, j) => j !== i)), kind: "link" as const }))];

  return (
    <div>
      {all.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Attached">
          {all.map(({ a, remove, kind }, i) => (
            <li key={`${kind}${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold-light bg-cream/60 py-0.5 pl-2.5 pr-1 text-sm text-ink/85">
              <Icon name={kind === "link" ? "externalLink" : "paperclip"} size="sm" />
              <span className="max-w-[14rem] truncate">{a.label}</span>
              <button type="button" onClick={remove} aria-label={`Remove ${a.label}`} className="flex h-6 w-6 items-center justify-center rounded-full text-ink/65 hover:bg-white hover:text-red-700">
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={linkInput}
            type="url"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkOpen(false);
              }
            }}
            placeholder="https://"
            aria-label="Link address"
            className={`${ui.input} min-w-0 flex-1`}
          />
          <Button size="sm" variant="primary" onClick={addLink} disabled={!linkDraft.trim()}>
            Add link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${ui.btnSecondary} ${ui.sm} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-forest-700`}>
            <Icon name="upload" size="sm" />
            {uploading ? "Uploading…" : "Upload a file"}
            <input type="file" multiple className="sr-only" disabled={uploading} onChange={(e) => addFiles(e.target.files)} />
          </label>
          <Button size="sm" icon="externalLink" onClick={() => setLinkOpen(true)}>
            Add a link
          </Button>
          <button type="button" ref={libraryBtn} onClick={() => setLibrary(true)} className={`${ui.btnSecondary} ${ui.sm}`}>
            <Icon name="library" size="sm" />
            From the resource library
          </button>
        </div>
      )}
      {library && (
        <ResourceLibraryLayer
          classId={classId}
          onClose={() => {
            setLibrary(false);
            requestAnimationFrame(() => libraryBtn.current?.focus());
          }}
          onPicked={(a) => {
            onFiles([...files, a]);
            setLibrary(false);
            requestAnimationFrame(() => libraryBtn.current?.focus());
          }}
        />
      )}
    </div>
  );
}

/** A layer over the dialog: search the resource library (made PDFs only) and attach one. */
function ResourceLibraryLayer({ classId, onClose, onPicked }: { classId: string; onClose: () => void; onPicked: (a: Attachment) => void }) {
  const [subject, setSubject] = useState<string | null | undefined>(undefined);
  const [onlyClassSubject, setOnlyClassSubject] = useState(true);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CurriculumResource[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
    fetchClass(classId).then((c) => setSubject(c?.subject ?? null));
  }, [classId]);

  // Escape closes this layer only, not the dialog underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (subject === undefined) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    const t = setTimeout(async () => {
      let q = supabase.from("curriculum_resources").select(RESOURCE_COLUMNS).not("pdf_path", "is", null);
      if (onlyClassSubject && subject) q = q.eq("subject", subject);
      const term = query.trim().replace(/[%,()]/g, " ");
      if (term) q = q.ilike("title", `%${term}%`);
      const { data, error: err } = await q.order("year").order("title").limit(40);
      if (!alive) return;
      if (err) setError("The resource library couldn't be loaded.");
      setRows((data as unknown as CurriculumResource[]) || []);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [subject, onlyClassSubject, query]);

  const pick = async (r: CurriculumResource) => {
    setWorking(r.id);
    setError(null);
    const blob = await resourceBlob(r, "pdf");
    if (!blob) {
      setWorking(null);
      return setError("That file couldn't be opened. Try another.");
    }
    const up = await uploadClassFile(classId, new File([blob], resourceFileName(r, "pdf"), { type: "application/pdf" }));
    setWorking(null);
    if ("error" in up) return setError(up.error);
    onPicked({ ...up.attachment, label: r.title });
  };

  return (
    <div role="group" aria-label="Attach from the resource library" className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gold-light px-4 py-3">
        <button type="button" onClick={onClose} className={`${ui.btnGhost} ${ui.sm}`}>
          <Icon name="arrowLeft" size="sm" />
          Back
        </button>
        <h3 className="t-section">Resource library</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search worksheets, quizzes, knowledge organisers" aria-label="Search the resource library" className={`${ui.input} min-w-0 flex-1`} />
        {subject && (
          <button type="button" aria-pressed={onlyClassSubject} onClick={() => setOnlyClassSubject((v) => !v)} className={onlyClassSubject ? ui.chipOn : ui.chip}>
            {subject} only
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-gold-light/60 overflow-y-auto px-2 pb-3" aria-label="Resources">
        {rows === null && <li className="px-3 py-3 text-sm text-ink/65">Loading…</li>}
        {rows && rows.length === 0 && <li className="px-3 py-3 text-sm text-ink/65">No printable resources match. Try fewer words{onlyClassSubject && subject ? ` or all subjects` : ""}.</li>}
        {rows?.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{r.title}</p>
              <p className="t-meta truncate">
                {typeLabel(r.type)} · {r.subject} · {r.year === "reception" ? "Reception" : `Year ${r.year.replace(/^y/i, "")}`}
                {r.units[0] ? ` · ${r.units[0]}` : ""}
              </p>
            </div>
            <Button size="sm" onClick={() => pick(r)} disabled={working !== null} aria-label={`Attach ${r.title}`}>
              {working === r.id ? "Attaching…" : "Attach"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
