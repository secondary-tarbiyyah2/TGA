"use client";

import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { isoToUkLocal, ukLocalToIso } from "@/lib/learn/openEvening";
import {
  AI_RECOMMENDATIONS,
  APPLICATION_STATUSES,
  DBS_STATUS,
  HOURS_PREFERENCE,
  ONLINE_EXPERIENCE,
  RIGHT_TO_WORK,
  TEACHER_STATUS,
  YEARS_EXPERIENCE,
  labelFor,
  monthLabel,
  type ApplicationStatus,
} from "@/lib/careers";
import { Button, StatusChip, btn, ui } from "@/components/learn/ui";
import { FilePreview } from "@/components/learn/admissions/FilePreview";
import { RECRUITMENT_BUCKET, ukDate, ukDateTime, type ApplicationEvent, type JobApplication } from "./types";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "" || (Array.isArray(children) && children.length === 0);
  return (
    <div className="grid gap-0.5 sm:grid-cols-[13rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm text-ink">{empty ? <span className="text-ink/65">Not given</span> : children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={ui.card}>
      <h3 className={`${ui.sectionTitle} mb-3`}>{title}</h3>
      <dl className="space-y-2.5">{children}</dl>
    </section>
  );
}

const statusLabel = (s: string | null) => APPLICATION_STATUSES.find((x) => x.value === s)?.label || s || "";

export function ApplicationDetail({
  app,
  onBack,
  onChanged,
  staffNames,
  userId,
}: {
  app: JobApplication;
  onBack: () => void;
  onChanged: (patch: Partial<JobApplication>) => void;
  staffNames: Map<string, string>;
  userId: string | null;
}) {
  const [screening, setScreening] = useState(false);
  const supabase = getSupabaseClient();
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [interview, setInterview] = useState(app.interview_at ? isoToUkLocal(app.interview_at) : "");
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);

  const loadEvents = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("job_application_events").select("*").eq("application_id", app.id).order("created_at", { ascending: false });
    setEvents((data as ApplicationEvent[] | null) || []);
  }, [supabase, app.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadEvents();
  }, [loadEvents]);

  async function update(patch: Partial<Pick<JobApplication, "status" | "rating" | "interview_at">>, done: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("job_applications").update(patch).eq("id", app.id);
    setBusy(false);
    if (error) return setMessage({ text: "Couldn't save that change. Please try again.", error: true });
    onChanged(patch);
    setMessage({ text: done });
    await loadEvents();
  }

  async function runScreening() {
    setScreening(true);
    setMessage(null);
    const res = await callEdgeFunction("recruitment-screen", { action: "screen", ids: [app.id] });
    setScreening(false);
    const one = (res.results as Record<string, { ok: boolean; error?: string }> | undefined)?.[app.id];
    if (!res.ok || !one?.ok || res.stopped) {
      const code = res.stopped ? "ai_daily_limit" : one?.error || res.error;
      return setMessage({
        text: code === "ai_not_configured" ? "AI isn't set up yet: add an ANTHROPIC_API_KEY to the Supabase secrets." : code === "ai_daily_limit" ? "Today's AI limit has been reached. Please try again tomorrow." : res.ok ? "The AI couldn't read this application just now. Please try again." : edgeErrorMessage(res),
        error: true,
      });
    }
    if (supabase) {
      const { data } = await supabase.from("job_applications").select("ai_score, ai_recommendation, ai_screening, ai_screened_at").eq("id", app.id).maybeSingle();
      if (data) onChanged(data as Partial<JobApplication>);
    }
    setMessage({ text: "AI screening updated." });
    await loadEvents();
  }

  async function addNote() {
    if (!supabase || !note.trim() || !userId) return;
    setBusy(true);
    const { error } = await supabase.from("job_application_events").insert({ application_id: app.id, kind: "note", body: note.trim().slice(0, 4000), created_by: userId });
    setBusy(false);
    if (error) return setMessage({ text: "Couldn't save the note. Please try again.", error: true });
    setNote("");
    setMessage({ text: "Note added." });
    await loadEvents();
  }

  async function openFile(path: string, name: string, type: string, download: boolean) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from(RECRUITMENT_BUCKET).createSignedUrl(path, 300, download ? { download: name } : undefined);
    if (error || !data?.signedUrl) return setMessage({ text: "Couldn't open the file. Please try again.", error: true });
    if (download) {
      window.location.href = data.signedUrl;
      return;
    }
    setPreview({ url: data.signedUrl, type, name });
  }

  const cvExt = (app.cv_path || "").split(".").pop() || "";
  const cvType = cvExt === "pdf" ? "application/pdf" : "";
  const fullName = `${app.first_name} ${app.last_name}`;
  const callName = app.preferred_name || app.first_name;
  const mailto = (subject: string, body = "") => `mailto:${app.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  const statusTone = APPLICATION_STATUSES.find((s) => s.value === app.status)?.tone || "neutral";

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className={ui.btnLink}>
        ← All applications
      </button>

      <header className={ui.card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">{app.reference} · applied {ukDate(app.created_at)}</p>
            <h2 className="mt-1 break-words text-xl font-semibold text-ink">
              {fullName}
              {app.preferred_name ? <span className="font-normal text-ink/65"> (known as {app.preferred_name})</span> : null}
            </h2>
            <p className="text-ink/80">{app.vacancy_title}</p>
            <p className="mt-2 text-sm">
              <StatusChip tone={statusTone}>{statusLabel(app.status)}</StatusChip>
              <span className="ml-2 text-ink/65">since {ukDate(app.status_changed_at)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={mailto(`Your application for ${app.vacancy_title} (${app.reference})`, `Assalamu alaikum ${callName},\n\n`)} className={btn("secondary", "sm")}>Email candidate</a>
            {app.cv_path && (
              <>
                {cvType && <Button size="sm" onClick={() => openFile(app.cv_path!, app.cv_filename || "CV.pdf", cvType, false)}>View CV</Button>}
                <Button size="sm" icon="download" onClick={() => openFile(app.cv_path!, `${app.reference} CV ${fullName}.${cvExt}`, cvType, true)}>Download CV</Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-gold-light/60 pt-4 sm:grid-cols-3">
          <label className="text-sm text-ink">
            Status
            <Select
              className={`mt-1 ${ui.select}`}
              value={app.status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as ApplicationStatus;
                if ((next === "unsuccessful" || next === "withdrawn") && !(await askConfirm(`Mark ${fullName} as ${statusLabel(next)}? The application, its notes and files are deleted automatically 6 months after this decision. The candidate is not emailed automatically.`))) return;
                void update({ status: next }, `Moved to ${statusLabel(next)}.`);
              }}
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </label>
          <div className="text-sm text-ink">
            <span id="rating-label">Rating</span>
            <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-labelledby="rating-label">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={app.rating === n}
                  aria-label={`${n} out of 5`}
                  disabled={busy}
                  onClick={() => update({ rating: app.rating === n ? null : n }, app.rating === n ? "Rating cleared." : `Rated ${n} out of 5.`)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border text-lg ${app.rating && n <= app.rating ? "border-gold-500 bg-gold-100 text-gold-900" : "border-gold-light bg-white text-ink/40 hover:bg-cream"}`}
                >
                  <Icon name="star" size="md" />
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-ink">
            <label htmlFor="rec-interview">Interview (UK time)</label>
            <div className="mt-1 flex gap-2">
              <input id="rec-interview" type="datetime-local" className={ui.input} value={interview} onChange={(e) => setInterview(e.target.value)} />
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  const iso = interview ? ukLocalToIso(interview) : null;
                  void update({ interview_at: iso, ...(iso && ["new", "reviewing", "shortlisted"].includes(app.status) ? { status: "interview" as ApplicationStatus } : {}) }, iso ? `Interview set for ${ukDateTime(iso)}.` : "Interview time cleared.");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
        {message && (
          <p role={message.error ? "alert" : "status"} className={`mt-4 rounded-lg border px-4 py-2 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>
            {message.text}
          </p>
        )}
      </header>

      {preview && (
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <h3 className={ui.sectionTitle}>{preview.name}</h3>
            <div className="flex gap-2">
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>Open in new tab</a>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
            </div>
          </div>
          <FilePreview url={preview.url} type={preview.type} name={preview.name} heightClass="h-[40rem]" />
        </section>
      )}

      <AiPanel app={app} busy={screening} onRun={runScreening} />

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Block title="1. Personal details">
            <Row label="Name">{`${app.title ? `${app.title} ` : ""}${fullName}`}</Row>
            <Row label="Email"><a href={`mailto:${app.email}`} className="text-teal-700 underline">{app.email}</a></Row>
            <Row label="Phone"><a href={`tel:${app.phone.replace(/[^\d+]/g, "")}`} className="text-teal-700 underline">{app.phone}</a></Row>
            <Row label="Lives in">{[app.town, app.country].filter(Boolean).join(", ")}</Row>
            <Row label="Right to work">{labelFor(RIGHT_TO_WORK, app.right_to_work)}</Row>
          </Block>

          <Block title="2. Qualifications">
            <Row label="Teacher status">{labelFor(TEACHER_STATUS, app.teacher_status)}</Row>
            <Row label="Highest qualification">{app.highest_qualification}</Row>
            <Row label="Other qualifications">{app.qualifications}</Row>
            <Row label="Islamic qualifications">{app.islamic_qualifications}</Row>
            <Row label="Subjects">{app.subjects.join(", ")}</Row>
            <Row label="Year groups">{app.year_groups.join(", ")}</Row>
            <Row label="Languages">{app.languages}</Row>
          </Block>

          <Block title="3. Experience">
            <Row label="Teaching experience">{labelFor(YEARS_EXPERIENCE, app.years_experience)}</Row>
            <Row label="Online teaching">{labelFor(ONLINE_EXPERIENCE, app.online_experience)}</Row>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">Employment history</dt>
              <dd className="mt-2">
                {app.employment.length === 0 ? (
                  <span className="text-sm text-ink/65">None given</span>
                ) : (
                  <ol className="space-y-2">
                    {app.employment.map((j, i) => (
                      <li key={i} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
                        <p className="font-semibold text-ink">{j.role}, {j.employer}</p>
                        <p className="text-ink/70">{monthLabel(j.from)} to {j.current ? "present" : monthLabel(j.to)}</p>
                        {j.reason && <p className="mt-1 text-ink/80">{j.current ? "Why moving: " : "Reason for leaving: "}{j.reason}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
            <Row label="Gaps explained">{app.employment_gaps}</Row>
          </Block>

          <Block title="4. Availability">
            <Row label="Hours">{labelFor(HOURS_PREFERENCE, app.hours_preference)}</Row>
            <Row label="Days">{app.available_days.join(", ")}</Row>
            <Row label="Earliest start">{app.earliest_start}</Row>
            <Row label="Notice period">{app.notice_period}</Row>
            <Row label="Equipment and internet">{app.has_equipment ? "Confirmed" : "Not confirmed"}</Row>
          </Block>

          <section className={ui.card}>
            <h3 className={`${ui.sectionTitle} mb-3`}>5. Supporting statement</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{app.statement}</p>
            {app.why_tga && (
              <>
                <h4 className="mt-4 text-sm font-semibold text-ink">Why Tarbiyyah Global Academy</h4>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{app.why_tga}</p>
              </>
            )}
          </section>

          <section className={ui.card}>
            <h3 className={`${ui.sectionTitle} mb-3`}>6. References</h3>
            <ol className="grid gap-3 md:grid-cols-2">
              {app.referees.map((r, i) => (
                <li key={i} className="rounded-lg border border-gold-light/60 p-3 text-sm">
                  <p className="font-semibold text-ink">{r.name}{r.position ? `, ${r.position}` : ""}</p>
                  <p className="text-ink/80">{r.organisation}</p>
                  <p className="text-ink/70">{r.relationship}</p>
                  <p className="mt-1"><a href={`mailto:${r.email}`} className="text-teal-700 underline">{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</p>
                  <p className="mt-1">
                    <StatusChip tone={r.contactBeforeInterview ? "good" : "warn"}>{r.contactBeforeInterview ? "May contact before interview" : "Don't contact before interview"}</StatusChip>
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <Block title="7. Checks and declarations">
            <Row label="DBS">{labelFor(DBS_STATUS, app.dbs_status)}</Row>
            <Row label="Heard about us">{app.how_heard}</Row>
            <Row label="Declaration signed by">{app.declaration_name}</Row>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">Documents</dt>
              <dd className="mt-2">
                <ul className="space-y-1.5 text-sm">
                  {app.cv_path && (
                    <li className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">CV: {app.cv_filename || "CV"}</span>
                      <button type="button" className={ui.btnLink} onClick={() => openFile(app.cv_path!, `${app.reference} CV ${fullName}.${cvExt}`, cvType, true)}>Download</button>
                    </li>
                  )}
                  {app.documents.map((d) => (
                    <li key={d.path} className="flex flex-wrap items-center gap-3">
                      <span>{d.name}</span>
                      {(d.type === "application/pdf" || d.type.startsWith("image/")) && (
                        <button type="button" className={ui.btnLink} onClick={() => openFile(d.path, d.name, d.type, false)}>View</button>
                      )}
                      <button type="button" className={ui.btnLink} onClick={() => openFile(d.path, d.name, d.type, true)}>Download</button>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </Block>
        </div>

        <aside className="space-y-5">
          <section className={ui.card}>
            <h3 className={`${ui.sectionTitle} mb-3`}>Notes and history</h3>
            <label htmlFor="rec-note" className={ui.label}>Add a note for the panel</label>
            <textarea id="rec-note" className={`mt-1 ${ui.textarea}`} rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Strong statement; check gap in 2022 at interview." />
            <Button className="mt-2" variant="primary" size="sm" disabled={busy || !note.trim()} onClick={addNote}>Add note</Button>
            <ol className="mt-5 space-y-3 border-t border-gold-light/60 pt-4">
              {events.length === 0 && <li className="text-sm text-ink/65">Nothing yet.</li>}
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-xs text-ink/65">
                    {ukDateTime(e.created_at)}
                    {e.created_by ? ` · ${staffNames.get(e.created_by) || "Staff"}` : e.kind === "email" || e.kind === "ai" ? " · automatic" : ""}
                  </p>
                  {e.kind === "status" ? (
                    <p className="text-ink">Moved from <strong>{statusLabel(e.from_status)}</strong> to <strong>{statusLabel(e.to_status)}</strong></p>
                  ) : (
                    <p className={`whitespace-pre-wrap break-words ${e.kind === "email" ? "text-ink/75" : "text-ink"}`}>{e.body}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <section className={`${ui.card} text-sm text-ink/80`}>
            <h3 className={`${ui.sectionTitle} mb-2`}>Safer recruitment checklist</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Shortlist against the role&apos;s requirements and note why.</li>
              <li>Ask shortlisted candidates to complete a self-disclosure.</li>
              <li>Take up references before interview where allowed, and explore any gaps at interview.</li>
              <li>Verify identity, right to work and qualifications.</li>
              <li>Enhanced DBS with barred list check (or overseas check) before starting.</li>
              <li>Record checks on the Single Central Record in Staff.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

const MET_TONE = { yes: "good", partly: "warn", no: "bad", unclear: "neutral" } as const;
const MET_LABEL = { yes: "Met", partly: "Partly", no: "Not shown", unclear: "Unclear" } as const;

function AiList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink/85">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** The AI's first read. Advisory only: shown to the panel, never acted on automatically. */
function AiPanel({ app, busy, onRun }: { app: JobApplication; busy: boolean; onRun: () => void }) {
  const ai = app.ai_screening;
  const rec = AI_RECOMMENDATIONS.find((r) => r.value === app.ai_recommendation);
  return (
    <section className={`${ui.card} border-gold-500/60`}>
      <div className={ui.cardHead}>
        <div>
          <h3 className={ui.sectionTitle}>AI first read</h3>
          <p className={ui.hint}>Advisory only. It doesn&apos;t see the candidate&apos;s name, contact details, location or check answers. A person makes every decision.</p>
        </div>
        <Button size="sm" onClick={onRun} disabled={busy}>{busy ? "Reading the application…" : ai ? "Run again" : "Screen with AI"}</Button>
      </div>
      {!ai ? (
        <p className="text-sm text-ink/70">Not screened yet. New applications are screened automatically when that is switched on in Email settings.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold tabular-nums text-ink">{ai.score}<span className="text-base font-normal text-ink/60">/100</span></span>
            {rec && <StatusChip tone={rec.tone}>{rec.label}</StatusChip>}
            <span className="text-xs text-ink/65">
              {app.ai_screened_at ? `Screened ${ukDateTime(app.ai_screened_at)}` : ""}
              {ai.cv_read ? " · CV read" : " · CV not read"}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-ink">{ai.summary}</p>
          {ai.subjects_fit && <p className="text-sm text-ink/85"><strong>Subjects:</strong> {ai.subjects_fit}</p>}
          {ai.requirements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gold-light/60 text-xs uppercase tracking-wide text-ink/65">
                    <th className="py-2 pr-3 font-medium">Requirement</th>
                    <th className="py-2 pr-3 font-medium">Shown?</th>
                    <th className="py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-light/40">
                  {ai.requirements.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 align-top">{r.requirement}</td>
                      <td className="py-2 pr-3 align-top"><StatusChip tone={MET_TONE[r.met]}>{MET_LABEL[r.met]}</StatusChip></td>
                      <td className="py-2 align-top text-ink/80">{r.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <AiList title="Strengths" items={ai.strengths} />
            <AiList title="Concerns" items={ai.concerns} />
            <AiList title="To check" items={ai.checks} />
            <AiList title="Suggested interview questions" items={ai.interview_questions} />
          </div>
        </div>
      )}
    </section>
  );
}
