"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { uploadClassFile } from "@/components/learn/class/Attachments";
import { yearLabel, YEARS } from "@/lib/learn/curriculum";
import { SOURCE_LABEL, STATUS_LABEL, TERMS, TYPE_ORDER, downloadResource, loadTermResources, resourceBlob, resourceFileName, typeLabel, type CurriculumResource, type ResourceFile } from "@/lib/learn/resources";
import { Modal } from "@/components/learn/curriculum/Modal";
import { Select } from "@/components/learn/Select";
import { Icon } from "@/components/learn/Icon";
import { ActionsMenu, Loading, StatStrip, StatTile, type MenuAction } from "@/components/learn/kit";
import { Button, EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";

type ClassOpt = { id: string; name: string };

/**
 * Share a resource's pupil copy (never the mark scheme) to a class: it is posted as material in the
 * class's Classwork, the same way lesson slides are shared. Pupils only ever see resources shared like this.
 */
export function ShareResourceDialog({ resource, area, onClose, onDone }: { resource: CurriculumResource; area: "teach" | "admin"; onClose: () => void; onDone: (className: string) => void }) {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState("");
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
      const opts: ClassOpt[] = (await myTeachingClasses()).map((c) => ({ id: c.id, name: c.name }));
      setClasses(opts);
      if (opts[0]) setClassId(opts[0].id);
    })();
  }, [supabase, area]);

  const share = async () => {
    if (!supabase || !classId) return setError("Choose a class.");
    setBusy(true);
    setError(null);
    const blob = await resourceBlob(resource, "pdf");
    if (!blob) {
      setBusy(false);
      return setError("Couldn't read the resource file.");
    }
    const r = await uploadClassFile(classId, new File([blob], resourceFileName(resource, "pdf"), { type: "application/pdf" }));
    if ("error" in r) {
      setBusy(false);
      return setError(r.error);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const lessons = resource.lesson_nos.length ? ` · lesson${resource.lesson_nos.length > 1 ? "s" : ""} ${resource.lesson_nos.join(", ")}` : "";
    const { error: err } = await supabase.from("class_materials").insert({
      class_id: classId,
      kind: "material",
      title: resource.title,
      body: `${resource.subject}${lessons}`,
      resources: [r.attachment],
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (err) return setError("Could not post to the class. You may not teach that class.");
    onDone(classes?.find((c) => c.id === classId)?.name || "the class");
  };

  return (
    <Modal title={`Share to class: ${resource.title}`} onClose={onClose}>
      <div className="space-y-3 p-4 text-sm text-ink/80">
        {classes === null ? (
          <p>Loading your classes…</p>
        ) : classes.length === 0 ? (
          <p>You don&apos;t teach any classes yet.</p>
        ) : (
          <>
            <label className="block font-medium">
              Class
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light px-3 py-2 text-sm">
                <option value="">Choose a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <p className="text-xs text-ink/65">Posts the pupil copy (PDF) as material in the class&apos;s Classwork. The mark scheme is never shared.</p>
          </>
        )}
        {error && <p className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={share} disabled={busy || !classId}>
            {busy ? "Sharing…" : "Share"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const statusTone = (s: string) => (s === "made" ? "good" : s === "to make" ? "warn" : "neutral");

/** One resource's actions: preview and download the files, share the pupil copy to a class. */
export function useResourceActions(area: "teach" | "admin") {
  const [viewer, setViewer] = useState<{ title: string; url: string | null } | null>(null);
  const [sharing, setSharing] = useState<CurriculumResource | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const preview = async (r: CurriculumResource, f: ResourceFile = "pdf") => {
    setViewer({ title: f === "mark-scheme" ? `${r.title}: mark scheme` : r.title, url: null });
    const b = await resourceBlob(r, f);
    if (!b) {
      setViewer(null);
      return setMessage("Couldn't open that file. Try again in a moment.");
    }
    setViewer({ title: f === "mark-scheme" ? `${r.title}: mark scheme` : r.title, url: URL.createObjectURL(b) });
  };
  const download = async (r: CurriculumResource, f: ResourceFile) => {
    if (!(await downloadResource(r, f))) setMessage("Couldn't download that file.");
  };
  const menu = (r: CurriculumResource): MenuAction[] => [
    ...(r.pdf_path ? [{ label: "Download pupil copy (PDF)", icon: "download", onSelect: () => download(r, "pdf") } as MenuAction] : []),
    ...(r.mark_scheme_path ? [{ label: "Mark scheme (PDF, staff only)", icon: "fileCheck", onSelect: () => preview(r, "mark-scheme") } as MenuAction, { label: "Download mark scheme", icon: "download", onSelect: () => download(r, "mark-scheme") } as MenuAction] : []),
    ...(r.docx_path ? [{ label: "Download Word copy (editable)", icon: "fileText", onSelect: () => download(r, "docx") } as MenuAction] : []),
    ...(r.pdf_path ? [{ label: "Share to a class", icon: "send", onSelect: () => setSharing(r) } as MenuAction] : []),
  ];
  const overlays = (
    <>
      {viewer && (
        <Modal
          title={viewer.title}
          onClose={() => {
            if (viewer.url) URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }}
          wide
        >
          {viewer.url ? <iframe src={viewer.url} title={viewer.title} className="h-full min-h-[70vh] w-full" /> : <p className="p-6 text-sm text-ink/65">Opening…</p>}
        </Modal>
      )}
      {sharing && (
        <ShareResourceDialog
          resource={sharing}
          area={area}
          onClose={() => setSharing(null)}
          onDone={(n) => {
            setSharing(null);
            setMessage(`Shared to ${n}. Pupils will see it under Classwork.`);
          }}
        />
      )}
    </>
  );
  return { preview, download, menu, overlays, message, setMessage };
}

/** The resources one lesson names, on its workspace page: made ones can be opened, downloaded and shared. */
export function LessonResourceList({ resources, area }: { resources: CurriculumResource[]; area: "teach" | "admin" }) {
  const act = useResourceActions(area);
  const made = resources.filter((r) => r.pdf_path);
  const rest = resources.filter((r) => !r.pdf_path);
  if (!resources.length) return null;
  return (
    <div className="space-y-3">
      {act.message && <Notice tone="info">{act.message}</Notice>}
      {made.length > 0 && (
        <ul className="divide-y divide-gold-light/70">
          {made.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700" aria-hidden="true">
                <Icon name="printer" size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{r.title}</span>
                <span className="block text-xs text-ink/60">
                  {typeLabel(r.type)} · printable A4{r.mark_scheme_path ? " · with mark scheme" : ""}
                  {r.docx_path ? " · Word copy" : ""}
                </span>
              </span>
              <button type="button" onClick={() => act.preview(r)} className={ui.btnLink}>
                Preview
              </button>
              <ActionsMenu label={`More for ${r.title}`} items={act.menu(r)} />
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="space-y-1 text-sm text-ink/85">
          {rest.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
              <span>{r.wording || r.title}</span>
              <span className="text-xs text-ink/55">{r.status === "to make" ? "· still being made" : `· ${SOURCE_LABEL[r.source] || r.source}`}</span>
            </li>
          ))}
        </ul>
      )}
      {act.overlays}
    </div>
  );
}

/**
 * Curriculum > Resources: every resource the lessons name in a term (the term resource list), with
 * filters by subject, year, type and status, and the made ones to preview, download and share.
 */
export function TermResources({ area }: { area: "teach" | "admin" }) {
  const [term, setTerm] = useState<string>(TERMS[0].id);
  const [rows, setRows] = useState<CurriculumResource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(150);
  const act = useResourceActions(area);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the term changes
    setRows(null);
    loadTermResources(term).then((r) => {
      if (!live) return;
      setFailed(r === null);
      setRows(r || []);
      setLimit(150);
    });
    return () => {
      live = false;
    };
  }, [term]);

  const subjects = useMemo(() => [...new Map((rows || []).map((r) => [r.subject_slug, r.subject])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const types = useMemo(() => TYPE_ORDER.filter((t) => (rows || []).some((r) => r.type === t)), [rows]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || []).filter(
      (r) =>
        (!subject || r.subject_slug === subject) &&
        (!year || r.year === year) &&
        (!type || r.type === type) &&
        (!status || r.status === status) &&
        words.every((w) => `${r.title} ${r.wording || ""} ${r.units.join(" ")}`.toLowerCase().includes(w)),
    );
  }, [rows, subject, year, type, status, q]);
  const count = (s: string) => (rows || []).filter((r) => r.status === s).length;
  const lessonHref = (r: CurriculumResource, n: number) => `/${area}/curriculum/lesson?s=${encodeURIComponent(r.subject_slug)}&y=${r.year}&n=${n}`;
  const t = TERMS.find((x) => x.id === term)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium text-ink">
          Term
          <Select value={term} onChange={(e) => setTerm(e.target.value)} className={`mt-1 w-44 ${ui.select}`}>
            {TERMS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} ({x.dates})
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Subject
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1 w-48 ${ui.select}`}>
            <option value="">All subjects</option>
            {subjects.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Year
          <Select value={year} onChange={(e) => setYear(e.target.value)} className={`mt-1 w-32 ${ui.select}`}>
            <option value="">All years</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {yearLabel(y)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Type
          <Select value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 w-48 ${ui.select}`}>
            <option value="">All types</option>
            {types.map((x) => (
              <option key={x} value={x}>
                {typeLabel(x)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Status
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 w-48 ${ui.select}`}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="block min-w-[12rem] flex-1 text-sm font-medium text-ink">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, unit or words" className={`mt-1 w-full ${ui.input}`} />
        </label>
      </div>

      {act.message && <Notice tone="info">{act.message}</Notice>}
      {rows === null ? (
        <Loading label="Loading the term's resources" lines={6} />
      ) : failed ? (
        <Notice tone="warn">The resource list isn&apos;t available yet. It appears once the &quot;Build term resources&quot; workflow has run after the latest update.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState title={`No resources listed for ${t.label} yet`} icon="library">
          The list is built from the lessons for this term.
        </EmptyState>
      ) : (
        <>
          <StatStrip>
            <StatTile value={rows.length} label={`Resources in ${t.label}`} hint={t.dates} />
            <StatTile value={count("made")} label="Ready to download" tone="accent" />
            <StatTile value={count("to make")} label="Still to make" tone={count("to make") ? "warn" : "neutral"} />
            <StatTile value={count("in school files")} label="In the school's files" />
          </StatStrip>
          <p className="text-sm text-ink/65">
            Showing {Math.min(shown.length, limit)} of {shown.length}
            {shown.length !== rows.length ? ` (filtered from ${rows.length})` : ""}. Pupils only see a resource when you share it to their class.
          </p>
          <ul className="divide-y divide-gold-light/70 rounded-xl border border-gold-light bg-white">
            {shown.slice(0, limit).map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">
                    {r.subject} · {yearLabel(r.year)} · {typeLabel(r.type)}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{r.title}</p>
                  {r.wording && r.wording !== r.title && <p className="mt-0.5 text-xs text-ink/60">Lesson wording: {r.wording}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink/70">
                    <span>{SOURCE_LABEL[r.source] || r.source}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {r.lessons.filter((l) => l.term === term).length === 1 ? "Lesson " : "Lessons "}
                      {r.lessons
                        .filter((l) => l.term === term)
                        .map((l, i) => (
                          <span key={l.n}>
                            {i > 0 && ", "}
                            <Link href={lessonHref(r, l.n)} className="underline decoration-gold-light underline-offset-2 hover:text-forest-700" title={l.title}>
                              {l.n}
                            </Link>
                          </span>
                        ))}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip tone={statusTone(r.status)}>{STATUS_LABEL[r.status] || r.status}</StatusChip>
                  {r.pdf_path && (
                    <Button size="sm" icon="eye" onClick={() => act.preview(r)}>
                      Preview
                    </Button>
                  )}
                  {r.pdf_path && <ActionsMenu label={`More for ${r.title}`} items={act.menu(r)} />}
                </div>
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <div className="flex justify-center">
              <Button onClick={() => setLimit((n) => n + 300)}>Show more</Button>
            </div>
          )}
        </>
      )}
      {act.overlays}
    </div>
  );
}
