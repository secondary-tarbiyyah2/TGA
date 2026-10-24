"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { EmptyState, Notice, StatusChip, Switch, ui, type Tone } from "@/components/learn/ui";
import { Icon } from "@/components/learn/Icon";
import { EntryReport, type ReportData } from "@/components/learn/assess/EntryReport";

type Row = {
  id: string; candidate_name: string; year: number; status: string; created_at: string; started_at: string | null; submitted_at: string | null; completed_at: string | null;
  expires_at: string; application_id: string | null; child_id: string | null; eal: boolean; access: Record<string, unknown>; dob: string | null; invigilator: string | null;
  report: ReportData | null; marks: Record<string, unknown> | null;
};
type App = { id: string; reference: string | null; child_first_name: string; child_last_name: string; year_group_applying: string; status: string };
type Child = { id: string; name: string; year_groups: { name: string } | null };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  issued: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Needs marking", tone: "warn" },
  complete: { label: "Complete", tone: "good" },
  void: { label: "Cancelled", tone: "bad" },
};
const when = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–");

export function EntryAssessmentsAdmin() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"active" | "marking" | "complete" | "all">("active");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad" | "info"; text: string; link?: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("entry_assessments")
      .select("id, candidate_name, year, status, created_at, started_at, submitted_at, completed_at, expires_at, application_id, child_id, eal, access, dob, invigilator, report, marks")
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data as Row[]) || []);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const shown = useMemo(() => (rows || []).filter((r) => (filter === "all" ? true : filter === "active" ? ["issued", "in_progress"].includes(r.status) : filter === "marking" ? r.status === "submitted" : r.status === "complete")), [rows, filter]);
  const count = (s: string[]) => (rows || []).filter((r) => s.includes(r.status)).length;

  const act = async (id: string, action: "reissue" | "email" | "void", extra: Record<string, unknown> = {}) => {
    if (action === "void" && !confirm("Cancel this assessment? The link stops working. You can issue a new paper later.")) return;
    const res = await callEdgeFunction("entry-assessment", { action, id, ...extra });
    if (!res.ok) return setNotice({ tone: "bad", text: edgeErrorMessage(res) });
    if (action === "email") setNotice({ tone: "good", text: "Link emailed to the parent.", link: res.link as string });
    else if (action === "reissue") setNotice({ tone: "good", text: extra.newPaper ? "A new paper has been made with a new link. The old link no longer works." : "New link made. The old link no longer works.", link: res.link as string });
    else setNotice({ tone: "info", text: "Assessment cancelled." });
    load();
  };

  const open = rows?.find((r) => r.id === openId) || null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "active" as const, label: "Waiting for the pupil", n: count(["issued", "in_progress"]), icon: "hourglass" as const, tile: "tile-blue" },
          { k: "marking" as const, label: "Needs marking", n: count(["submitted"]), icon: "notebookPen" as const, tile: "tile-amber" },
          { k: "complete" as const, label: "Complete", n: count(["complete"]), icon: "circleCheck" as const, tile: "tile-green" },
          { k: "all" as const, label: "All assessments", n: (rows || []).length, icon: "listChecks" as const, tile: "tile-slate" },
        ].map((c) => (
          <button key={c.k} type="button" onClick={() => setFilter(c.k)} aria-pressed={filter === c.k} className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left transition hover:shadow-sm ${filter === c.k ? "border-teal-700 ring-1 ring-teal-700" : "border-gold-light"}`}>
            <span className={`portal-tile ${c.tile}`} aria-hidden="true"><Icon name={c.icon} /></span>
            <span><span className="block text-2xl font-semibold leading-none tabular-nums">{rows === null ? "…" : c.n}</span><span className="mt-1 block text-sm text-ink/70">{c.label}</span></span>
          </button>
        ))}
      </div>

      {notice && (
        <div className="space-y-2">
          <Notice tone={notice.tone}>{notice.text}</Notice>
          {notice.link && <CopyLink link={notice.link} />}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{filter === "active" ? "Waiting for the pupil" : filter === "marking" ? "Needs marking" : filter === "complete" ? "Complete" : "All assessments"}</h2>
        <button type="button" onClick={() => setCreating((v) => !v)} className={ui.btnPrimary}>
          <Icon name="userRoundPlus" className="h-4 w-4" /> New assessment
        </button>
      </div>

      {creating && (
        <CreateForm
          onDone={(link, emailed) => {
            setCreating(false);
            setNotice({ tone: "good", text: emailed ? "Assessment made and the link emailed to the parent." : "Assessment made. Send this link to the family:", link });
            load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {rows === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : shown.length === 0 ? (
        <EmptyState title={filter === "marking" ? "Nothing to mark" : "No assessments here yet"} icon="clipboardCheck" tile="tile-violet" action={<button type="button" onClick={() => setCreating(true)} className={ui.btnPrimary}>New assessment</button>}>
          Each pupil gets their own paper for their year group: Maths, English and Reasoning on screen, then Writing, Qur&apos;an and Arabic with a teacher on the family call.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-gold-light/60 overflow-hidden rounded-2xl border border-gold-light bg-white">
          {shown.map((r) => {
            const st = STATUS[r.status] || STATUS.issued;
            const expired = r.status === "issued" && new Date(r.expires_at) < new Date();
            const pending = (r.report?.pending || []) as string[];
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 flex-1 text-left">
                  <span className="block font-semibold text-ink hover:underline">{r.candidate_name}</span>
                  <span className="block text-sm text-ink/65">
                    Year {r.year} · made {when(r.created_at)}
                    {r.submitted_at ? ` · finished ${when(r.submitted_at)}` : r.started_at ? ` · started ${when(r.started_at)}` : ""}
                    {r.application_id ? " · applicant" : r.child_id ? " · pupil" : ""}
                  </span>
                </button>
                <span className="flex flex-wrap items-center gap-2">
                  {expired ? <StatusChip tone="bad">Link expired</StatusChip> : <StatusChip tone={st.tone}>{st.label}</StatusChip>}
                  {r.status === "submitted" && pending.length > 0 && <span className="text-xs text-ink/65">to mark: {pending.join(", ")}</span>}
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setOpenId(r.id)} className={`${ui.btnSecondary} ${ui.sm}`}>{r.status === "submitted" ? "Mark" : r.status === "complete" ? "Report" : "Open"}</button>
                  {["issued", "in_progress"].includes(r.status) && (
                    <>
                      <button type="button" onClick={() => act(r.id, "email")} className={`${ui.btnSecondary} ${ui.sm}`}>Email link</button>
                      <button type="button" onClick={() => act(r.id, "reissue")} className={`${ui.btnSecondary} ${ui.sm}`}>New link</button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {open && <Detail row={open} onClose={() => setOpenId(null)} onChanged={load} onAct={act} />}
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold-light bg-white p-2 pl-3">
      <code className="min-w-0 flex-1 truncate text-sm text-ink/80">{link}</code>
      <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`Assalamu alaykum. Here is the link for your child's entry assessment with Tarbiyyah Global Academy: ${link}`)}`} target="_blank" rel="noreferrer" className={`${ui.btnSecondary} ${ui.sm}`}>WhatsApp</a>
    </div>
  );
}

function CreateForm({ onDone, onCancel }: { onDone: (link: string, emailed: boolean) => void; onCancel: () => void }) {
  const supabase = getSupabaseClient();
  const [who, setWho] = useState<"applicant" | "pupil" | "other">("applicant");
  const [apps, setApps] = useState<App[]>([]);
  const [kids, setKids] = useState<Child[]>([]);
  const [appId, setAppId] = useState("");
  const [childId, setChildId] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [eal, setEal] = useState(false);
  const [extra, setExtra] = useState(0);
  const [readAloud, setReadAloud] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [skipLive, setSkipLive] = useState(false);
  const [invigilator, setInvigilator] = useState("");
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("admissions_applications").select("id, reference, child_first_name, child_last_name, year_group_applying, status").in("status", ["new", "assessment", "interview", "offered"]).order("created_at", { ascending: false }).limit(200).then(({ data }) => setApps((data as App[]) || []));
    supabase.from("children").select("id, name, year_groups(name)").order("name").limit(500).then(({ data }) => setKids((data as unknown as Child[]) || []));
  }, [supabase]);

  const yearFrom = (s: string | undefined | null) => Number(String(s || "").match(/\d+/)?.[0] || "");
  const pickedYear = who === "applicant" ? yearFrom(apps.find((a) => a.id === appId)?.year_group_applying) : who === "pupil" ? yearFrom(kids.find((k) => k.id === childId)?.year_groups?.name) : Number(year);
  const effectiveYear = year ? Number(year) : pickedYear;

  const submit = async () => {
    setErr(null);
    if (who === "applicant" && !appId) return setErr("Choose an applicant.");
    if (who === "pupil" && !childId) return setErr("Choose a pupil.");
    if (who === "other" && !name.trim()) return setErr("Enter the child's name.");
    if (!(effectiveYear >= 1 && effectiveYear <= 11)) return setErr("Choose the year group (1 to 11).");
    setBusy(true);
    const res = await callEdgeFunction("entry-assessment", {
      action: "create",
      applicationId: who === "applicant" ? appId : undefined,
      childId: who === "pupil" ? childId : undefined,
      candidateName: who === "other" ? name.trim() : undefined,
      year: effectiveYear,
      eal,
      access: { extraTimePct: extra, readAloud, largeText },
      skip: skipLive ? ["quran", "arabic"] : [],
      invigilator: invigilator.trim() || undefined,
      email: who === "applicant" && email ? true : undefined,
    });
    setBusy(false);
    if (!res.ok) return setErr(edgeErrorMessage(res));
    onDone(res.link as string, !!res.emailed);
  };

  return (
    <section className={`${ui.card} space-y-5`} aria-labelledby="new-ea">
      <h3 id="new-ea" className="text-base font-semibold text-ink">New entry assessment</h3>
      <div role="radiogroup" aria-label="Who is it for" className="inline-flex rounded-xl border border-gold-light bg-cream p-1">
        {(["applicant", "pupil", "other"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${who === k ? "bg-white shadow-sm" : "text-ink/65"}`}>{k === "applicant" ? "An applicant" : k === "pupil" ? "A current pupil" : "Someone else"}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {who === "applicant" && (
          <label className={`${ui.label} sm:col-span-2`}>Applicant
            <select value={appId} onChange={(e) => setAppId(e.target.value)} className={`mt-1 ${ui.input}`}>
              <option value="">Choose…</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.child_first_name} {a.child_last_name} · {a.year_group_applying}{a.reference ? ` · ${a.reference}` : ""}</option>)}
            </select>
          </label>
        )}
        {who === "pupil" && (
          <label className={`${ui.label} sm:col-span-2`}>Pupil
            <select value={childId} onChange={(e) => setChildId(e.target.value)} className={`mt-1 ${ui.input}`}>
              <option value="">Choose…</option>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.name}{k.year_groups?.name ? ` · ${k.year_groups.name}` : ""}</option>)}
            </select>
          </label>
        )}
        {who === "other" && (
          <label className={`${ui.label} sm:col-span-2`}>Child&apos;s full name
            <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${ui.input}`} />
          </label>
        )}
        <label className={ui.label}>Year group
          <select value={year || (pickedYear ? String(pickedYear) : "")} onChange={(e) => setYear(e.target.value)} className={`mt-1 ${ui.input}`}>
            <option value="">Choose…</option>
            {Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={i + 1}>Year {i + 1}</option>)}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className={ui.label}>Access arrangements</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-cream">
            <span className="font-medium text-ink">Extra time</span>
            <select value={extra} onChange={(e) => setExtra(Number(e.target.value))} className={`${ui.input} !w-auto`}>
              {[0, 25, 50].map((v) => <option key={v} value={v}>{v ? `${v}%` : "None"}</option>)}
            </select>
          </label>
          <Switch checked={readAloud} onChange={setReadAloud} label="Read questions aloud" hint="On automatically for Years 1–3" />
          <Switch checked={largeText} onChange={setLargeText} label="Bigger text" />
          <Switch checked={eal} onChange={setEal} label="English is an additional language" hint="Shown on the report so verbal results are read with care" />
          <Switch checked={skipLive} onChange={setSkipLive} label="Skip Qur'an and Arabic" hint="For example if already assessed another way" />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={ui.label}>Supervised by (optional)
          <input value={invigilator} onChange={(e) => setInvigilator(e.target.value)} placeholder="e.g. Ustadha Sumayyah, on Teams" className={`mt-1 ${ui.input}`} />
        </label>
        {who === "applicant" && <div className="self-end"><Switch checked={email} onChange={setEmail} label="Email the link to the parent now" /></div>}
      </div>

      {effectiveYear >= 1 && <p className="rounded-lg bg-cream px-3 py-2 text-sm text-ink/75">Year {effectiveYear}: {effectiveYear <= 2 ? "about 35 minutes on screen in three short parts (Numbers, Listening and reading, Puzzles), then writing, Qur'an and Arabic on the call." : effectiveYear <= 6 ? "about 1 hour 35 minutes on screen in four parts the child can spread over several sittings, then Qur'an and Arabic on the call." : "about 2 hours on screen in four parts the child can spread over several sittings, then Qur'an and Arabic on the call."}{extra ? ` Times include ${extra}% extra.` : ""}</p>}
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className={ui.btnPrimary}>{busy ? "Making the paper…" : "Make the assessment"}</button>
        <button type="button" onClick={onCancel} className={ui.btnSecondary}>Cancel</button>
      </div>
    </section>
  );
}

function Detail({ row, onClose, onChanged, onAct }: { row: Row; onClose: () => void; onChanged: () => void; onAct: (id: string, a: "reissue" | "email" | "void", extra?: Record<string, unknown>) => void }) {
  const supabase = getSupabaseClient();
  const [full, setFull] = useState<{ form: { sections: { key: string; writingPrompt?: { title: string; prompt: string; guide: string }; items: { id: string; type: string }[] }[] }; responses: Record<string, { value: unknown }>; sections_log: { key: string; timedOut: boolean }[]; events: { type: string }[] } | null>(null);
  const [report, setReport] = useState<ReportData | null>(row.report);
  const [status, setStatus] = useState(row.status);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("entry_assessments").select("form, responses, sections_log, events").eq("id", row.id).single().then(({ data }) => setFull(data as never));
  }, [supabase, row.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const writingSection = full?.form.sections.find((s) => s.key === "writing");
  const writingItem = writingSection?.items.find((i) => i.type === "text");
  const writingText = writingItem ? String(full?.responses[writingItem.id]?.value || "") : "";
  const hasSection = (k: string) => !!full?.form.sections.some((s) => s.key === k);

  const saveMark = async (section: "writing" | "quran" | "arabic", data: Record<string, unknown>) => {
    const res = await callEdgeFunction("entry-assessment", { action: "mark", id: row.id, section, data });
    if (!res.ok) return edgeErrorMessage(res);
    setReport(res.report as ReportData);
    setStatus(res.status as string);
    onChanged();
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="ea-title" className="flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-cream shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gold-light bg-white px-5 py-4">
          <div>
            <h2 id="ea-title" className="text-xl font-semibold text-ink">{row.candidate_name}</h2>
            <p className="text-sm text-ink/65">Year {row.year}{row.dob ? ` · born ${new Date(row.dob).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}{row.eal ? " · EAL" : ""}{row.invigilator ? ` · supervised by ${row.invigilator}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip tone={(STATUS[status] || STATUS.issued).tone}>{(STATUS[status] || STATUS.issued).label}</StatusChip>
            <button type="button" onClick={() => window.print()} className={`${ui.btnSecondary} ${ui.sm} print:hidden`}>Print</button>
            <button type="button" onClick={onClose} aria-label="Close" className="portal-icon-btn"><Icon name="x" /></button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {["issued", "in_progress"].includes(status) && (
            <Notice tone="info">The pupil hasn&apos;t finished the on-screen parts yet. You can still mark the Qur&apos;an and Arabic parts from the family call now.</Notice>
          )}

          {(hasSection("writing") || hasSection("quran") || hasSection("arabic")) && (
            <section className={`${ui.card} space-y-5`} aria-label="Teacher-marked parts">
              <h3 className="text-base font-semibold text-ink">Teacher-marked parts</h3>
              {hasSection("writing") && <WritingMark year={row.year} prompt={writingSection?.writingPrompt} text={writingText} live={!writingItem} initial={(row.marks as { writing?: { scores: Record<string, number>; notes?: string } } | null)?.writing} onSave={(d) => saveMark("writing", d)} />}
              {hasSection("quran") && <QuranMark initial={(row.marks as { quran?: Record<string, unknown> } | null)?.quran} onSave={(d) => saveMark("quran", d)} />}
              {hasSection("arabic") && <ArabicMark initial={(row.marks as { arabic?: Record<string, unknown> } | null)?.arabic} onSave={(d) => saveMark("arabic", d)} />}
            </section>
          )}

          {report ? <EntryReport report={report} name={row.candidate_name} /> : <EmptyState title="The report appears when the pupil finishes" icon="fileText" tile="tile-blue">Results are worked out as soon as the on-screen parts are done; the Writing, Qur&apos;an and Arabic parts are added when you mark them.</EmptyState>}

          <div className="flex flex-wrap gap-2 border-t border-gold-light pt-4 print:hidden">
            {status !== "void" && <button type="button" onClick={() => onAct(row.id, "reissue", { newPaper: true })} className={ui.btnSecondary}>Start again with a new paper</button>}
            {status !== "void" && status !== "complete" && <button type="button" onClick={() => onAct(row.id, "void")} className={ui.btnLinkDanger}>Cancel this assessment</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

const WRITING = [
  { key: "composition", label: "Content and effect", hint: "Ideas fit the task, purpose and reader" },
  { key: "organisation", label: "Organisation", hint: "Opening, paragraphs or sequence, ending" },
  { key: "vocabulary", label: "Vocabulary", hint: "Precise, varied word choice" },
  { key: "sentences", label: "Sentences and punctuation", hint: "Range of sentences, accurate punctuation" },
  { key: "accuracy", label: "Spelling and presentation", hint: "Spelling for the year group, handwriting or layout" },
];
const SCALE = ["Well below", "Below", "Expected", "Above", "Well above"];

function Scale({ value, onChange, labels = SCALE, name }: { value: number | undefined; onChange: (v: number) => void; labels?: string[]; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
      {labels.map((l, i) => (
        <button key={l} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${value === i ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/75 hover:bg-cream"}`}>{l}</button>
      ))}
    </div>
  );
}

function SaveRow({ onSave, ready }: { onSave: () => Promise<string | null>; ready: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={!ready || state === "saving"} onClick={async () => { setState("saving"); const e = await onSave(); setErr(e); setState(e ? "idle" : "saved"); }} className={`${ui.btnPrimary} ${ui.sm}`}>{state === "saving" ? "Saving…" : "Save marks"}</button>
      {state === "saved" && <span className="text-sm text-green-800">Saved, report updated</span>}
      {err && <span className="text-sm text-red-700">{err}</span>}
    </div>
  );
}

function WritingMark({ year, prompt, text, live, initial, onSave }: { year: number; prompt?: { title: string; prompt: string; guide: string }; text: string; live: boolean; initial?: { scores: Record<string, number>; notes?: string }; onSave: (d: Record<string, unknown>) => Promise<string | null> }) {
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores || {});
  const [notes, setNotes] = useState(initial?.notes || "");
  return (
    <div className="space-y-3 rounded-xl border border-gold-light/70 p-4">
      <div className="flex items-center gap-2"><span className="portal-tile tile-violet" aria-hidden="true"><Icon name="notebookPen" /></span><h4 className="font-semibold text-ink">Writing</h4></div>
      {prompt && <p className="text-sm text-ink/75"><b>{prompt.title}.</b> {prompt.prompt}<br /><span className="text-ink/60">Secure for this band: {prompt.guide}</span></p>}
      {live ? <p className="rounded-lg bg-cream px-3 py-2 text-sm text-ink/75">Done on the call: read the task aloud, the child writes on paper and holds it up to the camera. Mark what you see.</p> : text ? <blockquote className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gold-light/70 bg-cream/60 p-3 text-sm leading-relaxed text-ink/90">{text}<footer className="mt-2 text-xs text-ink/55">{text.trim().split(/\s+/).length} words</footer></blockquote> : <p className="text-sm text-ink/60">No writing submitted yet.</p>}
      <p className="text-xs text-ink/60">Mark each against what is expected for Year {year}.</p>
      <div className="space-y-2">
        {WRITING.map((c) => (
          <div key={c.key} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-center">
            <span className="text-sm"><span className="font-medium text-ink">{c.label}</span><span className="block text-xs text-ink/60">{c.hint}</span></span>
            <Scale name={c.label} value={scores[c.key]} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
          </div>
        ))}
      </div>
      <label className={ui.label}>Note for the report (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`mt-1 ${ui.input}`} /></label>
      <SaveRow ready={WRITING.every((c) => scores[c.key] !== undefined)} onSave={() => onSave({ scores, notes })} />
    </div>
  );
}

const STAGES = ["Doesn't know the letters yet", "Knows the letters", "Reads letters with short vowels", "Joins letters into words", "Reads sukun, shaddah, madd, tanween", "Reads the mushaf slowly", "Reads the mushaf fluently"];

function QuranMark({ initial, onSave }: { initial?: Record<string, unknown>; onSave: (d: Record<string, unknown>) => Promise<string | null> }) {
  const [stage, setStage] = useState<number | undefined>(initial?.stage as number | undefined);
  const [tajweed, setTajweed] = useState<number | undefined>(initial?.tajweed as number | undefined);
  const [fluency, setFluency] = useState<number | undefined>(initial?.fluency as number | undefined);
  const [juz, setJuz] = useState(String(initial?.juz ?? "0"));
  const [lastSurah, setLastSurah] = useState(String(initial?.lastSurah ?? ""));
  const [notes, setNotes] = useState(String(initial?.notes ?? ""));
  return (
    <div className="space-y-3 rounded-xl border border-gold-light/70 p-4">
      <div className="flex items-center gap-2"><span className="portal-tile tile-emerald" aria-hidden="true"><Icon name="bookMarked" /></span><h4 className="font-semibold text-ink">Qur&apos;an</h4></div>
      <p className="text-sm text-ink/70">Ask the child to read a short passage (Qa&apos;idah page or mushaf, depending on level) and recite their last memorised surah.</p>
      <label className={ui.label}>Reading stage
        <select value={stage ?? ""} onChange={(e) => setStage(e.target.value === "" ? undefined : Number(e.target.value))} className={`mt-1 ${ui.input}`}>
          <option value="">Choose…</option>
          {STAGES.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className={ui.label}>Tajweed</p><Scale name="Tajweed" value={tajweed} onChange={setTajweed} labels={["0", "1", "2", "3", "4"]} /></div>
        <div><p className={ui.label}>Fluency</p><Scale name="Fluency" value={fluency} onChange={setFluency} labels={["0", "1", "2", "3", "4"]} /></div>
        <label className={ui.label}>Juz&apos; memorised (whole juz&apos;)<input inputMode="numeric" value={juz} onChange={(e) => setJuz(e.target.value)} className={`mt-1 ${ui.input}`} /></label>
        <label className={ui.label}>Last surah memorised<input value={lastSurah} onChange={(e) => setLastSurah(e.target.value)} placeholder="e.g. al-Mulk" className={`mt-1 ${ui.input}`} /></label>
      </div>
      <label className={ui.label}>Note (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`mt-1 ${ui.input}`} /></label>
      <SaveRow ready={stage !== undefined && tajweed !== undefined && fluency !== undefined} onSave={() => onSave({ stage, tajweed, fluency, juz: Number(juz) || 0, lastSurah, notes })} />
    </div>
  );
}

function ArabicMark({ initial, onSave }: { initial?: Record<string, unknown>; onSave: (d: Record<string, unknown>) => Promise<string | null> }) {
  const [s, setS] = useState<Record<string, number | undefined>>({ letters: initial?.letters as number, vowelled: initial?.vowelled as number, unvowelled: initial?.unvowelled as number, understanding: initial?.understanding as number, speaking: initial?.speaking as number });
  const [notes, setNotes] = useState(String(initial?.notes ?? ""));
  const rows: { key: string; label: string; labels: string[] }[] = [
    { key: "letters", label: "Letters", labels: ["Not yet", "Some", "All, with forms"] },
    { key: "vowelled", label: "Reads vowelled text", labels: ["0", "1", "2", "3", "4"] },
    { key: "unvowelled", label: "Reads unvowelled text", labels: ["0", "1", "2", "3", "4"] },
    { key: "understanding", label: "Understands what they read", labels: ["0", "1", "2", "3", "4"] },
    { key: "speaking", label: "Speaks and answers in Arabic", labels: ["0", "1", "2", "3", "4"] },
  ];
  return (
    <div className="space-y-3 rounded-xl border border-gold-light/70 p-4">
      <div className="flex items-center gap-2"><span className="portal-tile tile-teal" aria-hidden="true"><Icon name="languages" /></span><h4 className="font-semibold text-ink">Arabic</h4></div>
      {rows.map((r) => (
        <div key={r.key} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-center">
          <span className="text-sm font-medium text-ink">{r.label}</span>
          <Scale name={r.label} value={s[r.key]} onChange={(v) => setS((x) => ({ ...x, [r.key]: v }))} labels={r.labels} />
        </div>
      ))}
      <label className={ui.label}>Note (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`mt-1 ${ui.input}`} /></label>
      <SaveRow ready={rows.every((r) => s[r.key] !== undefined)} onSave={() => onSave({ scores: s, notes })} />
    </div>
  );
}
