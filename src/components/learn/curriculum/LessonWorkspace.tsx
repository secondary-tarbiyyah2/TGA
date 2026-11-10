"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { LESSON_COLUMNS, LESSON_COLUMNS_EDITOR, downloadDeck, fileNameFor, pathFor, saveBlob, yearLabel, type CurriculumLesson, type LessonFileKind } from "@/lib/learn/curriculum";
import { loadReviews, lessonRef, reviewKey, type ReviewRow } from "@/lib/learn/curriculumReview";
import { WorkspaceHeader, WorkflowBadge, type MenuAction } from "@/components/learn/kit";
import { Button, LoadingState, Notice, ui } from "@/components/learn/ui";
import { Icon, type IconName } from "@/components/learn/Icon";
import { Modal } from "@/components/learn/curriculum/Modal";
import { LessonStudio } from "@/components/learn/curriculum/LessonStudio";
import { LessonEditor, type LessonContent } from "@/components/learn/curriculum/LessonEditor";
import { FeedbackDialog } from "@/components/learn/curriculum/LessonFeedback";
import { HistoryDialog, ReplaceDialog, ShareDialog } from "@/components/learn/curriculum/CurriculumLibrary";
import { ReviewPanel } from "@/components/learn/curriculum/ReviewPanel";
import { rememberLesson } from "@/components/learn/curriculum/RecentLessons";
import { useLessonPins } from "@/lib/learn/pins";
import { loadLessonResources, type CurriculumResource } from "@/lib/learn/resources";
import { LessonResourceList } from "@/components/learn/curriculum/TermResources";

type Sibling = Pick<CurriculumLesson, "id" | "lesson_no" | "title">;
type Full = CurriculumLesson & { content?: LessonContent | null; content_updated_at?: string | null; content_updated_by_name?: string | null; pupil_pdf_path?: string | null };

const FILE_LABEL: Record<LessonFileKind, string> = {
  "slides-pdf": "Slides (PDF)",
  "slides-pptx": "Slides (PowerPoint, editable)",
  "plan-pdf": "Lesson plan (PDF)",
  "plan-docx": "Lesson plan (Word, editable)",
};
const MIME: Record<LessonFileKind, string> = {
  "slides-pdf": "application/pdf",
  "slides-pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "plan-pdf": "application/pdf",
  "plan-docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : typeof v === "string" && v.trim() ? [v] : []);

/** A titled part of the workspace: a heading row and its content, separated by a hairline (no cards inside cards). */
function Part({ title, action, children, id, guide }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string; guide?: string }) {
  return (
    <section aria-labelledby={id} data-guide={guide} className="border-t border-gold-light py-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One file of the lesson: what it is, then its actions (open is the main one). */
function Material({ icon, title, detail, onOpen, openLabel = "Open", menu }: { icon: IconName; title: string; detail: string; onOpen?: () => void; openLabel?: string; menu?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700" aria-hidden="true">
        <Icon name={icon} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink/60">{detail}</span>
      </span>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={ui.btnLink}>
          {openLabel}
        </button>
      ) : (
        <span className="text-xs text-ink/50">Not built yet</span>
      )}
      {menu}
    </li>
  );
}

/**
 * A lesson's own workspace (owner brief, Nov 2026): everything about one lesson
 * on one page, information first. Overview, materials (slides, plan, pupil
 * PDF), objectives and success criteria, key words, resources and teacher
 * notes from the lesson itself, the rest of its unit, and on the right the
 * review status with its history and the lesson's versions.
 */
export function LessonWorkspace({ id, at, area }: { id: string; at?: { subject: string; year: string; n: number }; area: "teach" | "admin" }) {
  const supabase = getSupabaseClient();
  const { roles } = useLearnSession();
  const roleNames = roles.map((r) => r.role);
  const reviewer = roleNames.some((r) => r === "head_teacher" || r === "admin");
  const canEdit = reviewer || roleNames.includes("teacher");
  const [lesson, setLesson] = useState<Full | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [review, setReview] = useState<ReviewRow | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; url: string | null } | null>(null);
  const [dialog, setDialog] = useState<"studio" | "form" | "share" | "feedback" | "history" | "replace" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { pinned, toggle: togglePin } = useLessonPins();
  const [termResources, setTermResources] = useState<CurriculumResource[]>([]);
  const atSubject = at?.subject;
  const atYear = at?.year;
  const atN = at?.n;

  const load = useCallback(async () => {
    if (!supabase) return;
    // Fall back to the older columns if a migration hasn't reached the database yet.
    // By id, or by subject, year and lesson number (links from the term resource list).
    const one = async (cols: string) => {
      const q = supabase.from("curriculum_lessons").select(cols);
      return id || !atSubject ? q.eq("id", id).maybeSingle() : q.eq("subject_slug", atSubject).eq("year", atYear || "").eq("lesson_no", atN || 0).maybeSingle();
    };
    const full = await one(`${LESSON_COLUMNS_EDITOR}, content, content_updated_at, content_updated_by_name, pupil_pdf_path`);
    const data = full.error ? (await one(LESSON_COLUMNS)).data : full.data;
    const l = data as unknown as Full | null;
    if (!l) return setState("missing");
    setLesson(l);
    setState("ready");
    rememberLesson({ id: l.id, title: l.title, subject: l.subject, year: l.year, unit: l.unit });
    loadLessonResources(l.subject_slug, l.year, l.lesson_no).then(setTermResources);
    const [sib, reviews] = await Promise.all([
      supabase.from("curriculum_lessons").select("id, lesson_no, title, unit").eq("subject_slug", l.subject_slug).eq("year", l.year).order("lesson_no"),
      loadReviews(),
    ]);
    setSiblings(((sib.data as (Sibling & { unit: string | null })[] | null) || []).filter((s) => (s.unit || null) === (l.unit || null)));
    setReview(reviews[reviewKey(l.subject_slug, "lesson", lessonRef(l.year, l.lesson_no))]);
  }, [supabase, id, atSubject, atYear, atN]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the lesson when the id changes
    load();
  }, [load]);

  const open = async (kind: "slides-pdf" | "plan-pdf" | "pupil", title: string) => {
    if (!lesson) return;
    const path = kind === "pupil" ? lesson.pupil_pdf_path || null : pathFor(lesson, kind);
    if (!path) return;
    setViewer({ title, url: null });
    const blob = await downloadDeck(path);
    if (!blob) {
      setViewer(null);
      return setMessage("Couldn't open that file. Try again in a moment.");
    }
    setViewer({ title, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
  };
  const closeViewer = () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };
  const download = async (kind: LessonFileKind) => {
    if (!lesson) return;
    const p = pathFor(lesson, kind);
    if (!p) return;
    setBusy(kind);
    const blob = await downloadDeck(p);
    setBusy(null);
    if (!blob) return setMessage("Couldn't download that file.");
    saveBlob(new Blob([blob], { type: MIME[kind] }), fileNameFor(lesson, kind));
  };

  const base = `/${area}/curriculum`;
  if (state === "missing") {
    return (
      <div className="space-y-3">
        <Notice tone="warn">We couldn&apos;t find that lesson. It may have been retired or renumbered.</Notice>
        <Link href={base} className={ui.btnLink}>
          Back to the curriculum
        </Link>
      </div>
    );
  }
  if (!lesson) return <LoadingState rows={6} label="Loading the lesson" />;

  const c = lesson.content || null;
  const objectives = (c?.objectives?.length ? c.objectives : lesson.objectives) || [];
  const criteria = asList(c?.successCriteria);
  const keywords = (c?.keywords || []).filter((k) => k && k.term);
  const resources = asList(c?.resources);
  const homework = asList(c?.homework);
  const idx = siblings.findIndex((s) => s.id === lesson.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const files = (Object.keys(FILE_LABEL) as LessonFileKind[]).filter((k) => pathFor(lesson, k));
  const unitHref = `${base}?year=${lesson.year}&subject=${encodeURIComponent(lesson.subject_slug)}&unit=${encodeURIComponent(lesson.unit || "Lessons")}`;

  const menu: MenuAction[] = [
    ...((files.length ? [{ section: "Download", label: "" }, ...files.map((k) => ({ label: busy === k ? "Downloading…" : FILE_LABEL[k], icon: "download", onSelect: () => download(k) }))] : []) as MenuAction[]),
    { section: "Lesson", label: "" },
    { label: pinned.has(lesson.id) ? "Unpin from my dashboard" : "Pin to my dashboard", icon: "star", onSelect: () => void togglePin(lesson.id) },
    { label: "Share to a class", icon: "send", onSelect: () => setDialog("share"), disabled: !lesson.deck_path },
    { label: "Give feedback", icon: "messageSquarePlus", onSelect: () => setDialog("feedback") },
    { label: "Version history", icon: "refresh", onSelect: () => setDialog("history") },
    ...((canEdit ? [{ label: "Edit in the full form", icon: "pencil", onSelect: () => setDialog("form") }, { label: "Upload my own slides", icon: "upload", onSelect: () => setDialog("replace") }] : []) as MenuAction[]),
  ];

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        eyebrow={[
          { label: lesson.subject, href: `${base}?year=${lesson.year}&subject=${encodeURIComponent(lesson.subject_slug)}` },
          { label: lesson.unit || "Lessons", href: unitHref },
          { label: `Lesson ${String(lesson.lesson_no).padStart(2, "0")}` },
        ]}
        title={lesson.title}
        status={
          <>
            <WorkflowBadge status={review?.status} />
            {pinned.has(lesson.id) && <span className="text-xs font-medium text-gold-700">Pinned</span>}
          </>
        }
        meta={
          <>
            {yearLabel(lesson.year)} · {lesson.subject}
            {lesson.board ? ` · ${lesson.board}` : ""}
            {lesson.duration ? ` · ${lesson.duration} minutes` : ""}
            {lesson.version > 1 ? ` · version ${lesson.version}` : ""}
          </>
        }
        description={c?.bigQuestion ? <>Big question: {c.bigQuestion}</> : undefined}
        primary={
          lesson.pdf_path ? (
            <Button variant="primary" icon="presentation" onClick={() => open("slides-pdf", `Slides: ${lesson.title}`)}>
              Present slides
            </Button>
          ) : canEdit ? (
            <Button variant="primary" icon="pencil" onClick={() => setDialog("studio")}>
              Edit lesson
            </Button>
          ) : undefined
        }
        menu={[...((lesson.pdf_path && canEdit ? [{ label: "Edit lesson", icon: "pencil", onSelect: () => setDialog("studio") }] : []) as MenuAction[]), ...menu]}
      />

      {message && <Notice tone="info">{message}</Notice>}
      {lesson.rebuild_requested && <Notice tone="info">This lesson was edited: new slides and a new plan are being built and appear here in a few minutes.</Notice>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Part title="Lesson materials" id="lw-materials" guide="lesson-materials">
            <ul className="divide-y divide-gold-light/70">
              <Material icon="presentation" title="Teaching slides" detail="Presentation · the main teaching resource" onOpen={lesson.pdf_path ? () => open("slides-pdf", `Slides: ${lesson.title}`) : undefined} openLabel="Preview" />
              <Material icon="fileText" title="Lesson plan" detail="Teaching guidance and sequence" onOpen={lesson.plan_pdf_path ? () => open("plan-pdf", `Lesson plan: ${lesson.title}`) : undefined} openLabel="Preview" />
              {lesson.pupil_pdf_path && <Material icon="file" title="Pupil copy" detail="Everything pupils need, given at the start" onOpen={() => open("pupil", `Pupil copy: ${lesson.title}`)} openLabel="Preview" />}
            </ul>
          </Part>

          {termResources.length > 0 && (
            <Part
              title="Resources this lesson uses"
              id="lw-term-resources"
              action={
                <Link href={`${base}/resources`} className={ui.btnLink}>
                  All term resources
                </Link>
              }
            >
              <LessonResourceList resources={termResources} area={area} />
            </Part>
          )}

          <Part title="Learning objectives" id="lw-objectives">
            {objectives.length === 0 ? (
              <p className="text-sm text-ink/60">No objectives written yet.</p>
            ) : (
              <ol className="space-y-2">
                {objectives.map((o, i) => (
                  <li key={o + i} className="flex gap-3 text-sm text-ink">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-xs font-semibold tabular-nums text-forest-800">{i + 1}</span>
                    <span className="pt-0.5">{o}</span>
                  </li>
                ))}
              </ol>
            )}
            {criteria.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/55">Success criteria</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/85">
                  {criteria.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </Part>

          {keywords.length > 0 && (
            <Part title="Key words" id="lw-keywords">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {keywords.map((k) => (
                  <div key={k.term} className="text-sm">
                    <dt className="font-medium text-ink">{k.term}</dt>
                    <dd className="text-ink/70">{k.def}</dd>
                  </div>
                ))}
              </dl>
            </Part>
          )}

          {(c?.crossCurricular || c?.smsc || c?.islamicLink?.text) && (
            <Part title="Connections" id="lw-connections">
              <dl className="space-y-2 text-sm">
                {c?.islamicLink?.text && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-ink/55">Islamic foundation</dt>
                    <dd className="mt-0.5 text-ink/85">{c.islamicLink.text}</dd>
                  </div>
                )}
                {c?.crossCurricular && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-ink/55">Cross-curricular</dt>
                    <dd className="mt-0.5 text-ink/85">{c.crossCurricular}</dd>
                  </div>
                )}
                {c?.smsc && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-ink/55">SMSC</dt>
                    <dd className="mt-0.5 text-ink/85">{c.smsc}</dd>
                  </div>
                )}
              </dl>
            </Part>
          )}

          {(resources.length > 0 || homework.length > 0 || c?.send) && (
            <Part title="Resources and teacher notes" id="lw-resources">
              <div className="space-y-3 text-sm">
                {resources.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-ink/85">
                    {resources.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {c?.send && (
                  <p className="text-ink/85">
                    <span className="font-medium text-ink">SEND, EAL and most able: </span>
                    {c.send}
                  </p>
                )}
                {homework.length > 0 && (
                  <p className="text-ink/85">
                    <span className="font-medium text-ink">Homework: </span>
                    {homework.join(" ")}
                  </p>
                )}
              </div>
            </Part>
          )}

          <Part
            title="In this unit"
            id="lw-unit"
            action={
              <Link href={unitHref} className={ui.btnLink}>
                Open the unit
              </Link>
            }
          >
            <ol className="divide-y divide-gold-light/70">
              {siblings.map((s) => (
                <li key={s.id}>
                  {s.id === lesson.id ? (
                    <span aria-current="page" className="flex items-center gap-3 py-2 text-sm font-semibold text-forest-800">
                      <span className="w-6 text-right tabular-nums">{s.lesson_no}</span>
                      {s.title}
                    </span>
                  ) : (
                    <Link href={`${base}/lesson?id=${s.id}`} className="flex items-center gap-3 py-2 text-sm text-ink/85 hover:text-forest-700">
                      <span className="w-6 text-right tabular-nums text-ink/50">{s.lesson_no}</span>
                      {s.title}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex justify-between gap-3 text-sm">
              {prev ? (
                <Link href={`${base}/lesson?id=${prev.id}`} className={ui.btnLink}>
                  ‹ {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={`${base}/lesson?id=${next.id}`} className={ui.btnLink}>
                  {next.title} ›
                </Link>
              )}
            </div>
          </Part>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-[84px] lg:self-start">
          <div id="review" className="scroll-mt-24 rounded-2xl border border-gold-light bg-white p-4">
            <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">Teacher review</h2>
            <ReviewPanel slug={lesson.subject_slug} scope="lesson" refKey={lessonRef(lesson.year, lesson.lesson_no)} row={review} reviewer={reviewer} canSubmit={canEdit} currentVersion={lesson.version} onChanged={load} />
          </div>
          <div className="rounded-2xl border border-gold-light bg-white p-4 text-sm">
            <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Versions</h2>
            <p className="text-ink/75">
              Version {lesson.version}
              {lesson.custom_deck ? " · own slides" : ""}
            </p>
            {lesson.content_updated_at && (
              <p className="mt-1 text-xs text-ink/60">
                Words last changed {new Date(lesson.content_updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {lesson.content_updated_by_name ? ` by ${lesson.content_updated_by_name}` : ""}
              </p>
            )}
            <button type="button" onClick={() => setDialog("history")} className={`mt-2 ${ui.btnLink}`}>
              See every version
            </button>
          </div>
        </aside>
      </div>

      {viewer && (
        <Modal title={viewer.title} onClose={closeViewer} wide>
          {viewer.url ? <iframe src={viewer.url} title={viewer.title} className="h-full min-h-[70vh] w-full" /> : <p className="p-6 text-sm text-ink/65">Opening…</p>}
        </Modal>
      )}
      {dialog === "studio" && (
        <LessonStudio
          lesson={lesson}
          canEdit={canEdit}
          isHead={reviewer}
          onClose={() => {
            setDialog(null);
            load();
          }}
          onSaved={(m) => setMessage(m)}
          onOpenForm={() => setDialog("form")}
          onFeedback={() => setDialog("feedback")}
        />
      )}
      {dialog === "form" && (
        <LessonEditor
          lesson={lesson}
          canEdit={canEdit}
          onClose={() => setDialog(null)}
          onSaved={(m) => {
            setDialog(null);
            setMessage(m);
            load();
          }}
        />
      )}
      {dialog === "share" && <ShareDialog lesson={lesson} area={area} onClose={() => setDialog(null)} onDone={(n) => { setDialog(null); setMessage(`Shared to ${n}. Pupils will see it under Classwork.`); }} />}
      {dialog === "feedback" && <FeedbackDialog lesson={lesson} content={c as never} onClose={() => setDialog(null)} onSent={(m) => { setDialog(null); setMessage(m); }} />}
      {dialog === "history" && <HistoryDialog lesson={lesson} onClose={() => setDialog(null)} onChanged={() => { setDialog(null); setMessage("Version restored."); load(); }} />}
      {dialog === "replace" && <ReplaceDialog lesson={lesson} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setMessage("New version saved."); load(); }} />}
    </div>
  );
}

