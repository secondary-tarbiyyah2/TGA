"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { EmptyState, Notice, StatusChip, Switch, ui, type Tone } from "@/components/learn/ui";
import { Icon } from "@/components/learn/Icon";
import { EntryReport, type ReportData } from "@/components/learn/assess/EntryReport";
import { MathText } from "@/components/learn/assess/MathText";
import { printElement } from "@/components/learn/printScope";
import { PrintHeader } from "@/components/learn/print";
import { Select } from "@/components/learn/Select";

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
const when = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) : "–");
type ActResult = { tone: "good" | "bad" | "info"; text: string; link?: string };

export function EntryAssessmentsAdmin() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"active" | "marking" | "complete" | "all">("active");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActResult | null>(null);
  // Result of an action taken on one row, shown under that row rather than at the top of the page.
  const [rowNotice, setRowNotice] = useState<(ActResult & { id: string }) | null>(null);

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

  /** Runs a row action and returns what happened (null if the user backed out of a confirm). */
  const act = async (id: string, action: "reissue" | "email" | "void", extra: Record<string, unknown> = {}): Promise<ActResult | null> => {
    if (action === "void" && !confirm("Cancel this assessment? The link stops working. You can issue a new paper later.")) return null;
    if (action === "reissue" && !confirm(extra.newPaper ? "Start again with a new paper? The old link and any answers so far stop counting." : "Make a new link? The old link stops working.")) return null;
    const res = await callEdgeFunction("entry-assessment", { action, id, ...extra });
    let out: ActResult;
    if (!res.ok) out = { tone: "bad", text: edgeErrorMessage(res) };
    else if (action === "email") out = { tone: "good", text: "Link emailed to the parent.", link: res.link as string };
    else if (action === "reissue") out = { tone: "good", text: extra.newPaper ? "A new paper has been made with a new link. The old link no longer works." : "New link made. The old link no longer works.", link: res.link as string };
    else out = { tone: "info", text: "Assessment cancelled." };
    if (res.ok) load();
    return out;
  };
  const actOnRow = async (id: string, action: "reissue" | "email") => {
    const out = await act(id, action);
    if (out) setRowNotice({ ...out, id });
  };

  const open = rows?.find((r) => r.id === openId) || null;

  return (
    <div className="space-y-5">
      {/* When a report is open, only the report prints. */}
      <div className={`space-y-5 ${open ? "print:hidden" : ""}`}>
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
                      <button type="button" onClick={() => actOnRow(r.id, "email")} className={`${ui.btnSecondary} ${ui.sm}`}>Email link</button>
                      <button type="button" onClick={() => actOnRow(r.id, "reissue")} className={`${ui.btnSecondary} ${ui.sm}`}>New link</button>
                    </>
                  )}
                </span>
                {rowNotice?.id === r.id && (
                  <div className="basis-full space-y-2">
                    <Notice tone={rowNotice.tone}>{rowNotice.text}</Notice>
                    {rowNotice.link && <CopyLink link={rowNotice.link} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      </div>
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
  const [breaks, setBreaks] = useState<"default" | "0" | "1" | "2" | "3" | "4" | "6">("default");
  const [breakMins, setBreakMins] = useState(0);
  const [other, setOther] = useState("");
  const [leaveLimit, setLeaveLimit] = useState(0);
  const [invigilator, setInvigilator] = useState("");
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fromPlan, setFromPlan] = useState<string | null>(null);

  // A current pupil with an active support plan (0169): apply its access arrangements to the paper.
  const pickPupil = async (id: string) => {
    setChildId(id);
    setFromPlan(null);
    if (!supabase || !id) return;
    const { data } = await supabase.rpc("send_access_arrangements", { p_child: id });
    const a = data as { extra_time_pct: number; reader: boolean; scribe: boolean; rest_breaks: boolean; word_processor: boolean; separate_room: boolean; other: string | null } | null;
    if (!a) return;
    const extras = [a.scribe ? "scribe" : "", a.word_processor ? "word processor" : "", a.separate_room ? "separate breakout room" : "", a.rest_breaks ? "supervised rest breaks" : "", a.other || ""].filter(Boolean);
    setExtra(a.extra_time_pct || 0);
    setReadAloud(!!a.reader);
    if (extras.length) setOther(extras.join(", ").slice(0, 200));
    setFromPlan([a.extra_time_pct ? `${a.extra_time_pct}% extra time` : "", a.reader ? "reader (questions read aloud)" : "", ...extras].filter(Boolean).join(", ") || null);
  };

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
      access: {
        extraTimePct: extra, readAloud, largeText, other: other.trim() || undefined, leaveLimit: leaveLimit || undefined,
        breaks: breaks === "default" && !breakMins ? undefined : { perSection: breaks === "default" ? defaultBreaks(effectiveYear).perSection : Number(breaks), minutes: breakMins || defaultBreaks(effectiveYear).minutes },
      },
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
            <Select value={appId} onChange={(e) => setAppId(e.target.value)} className={`mt-1 ${ui.input}`}>
              <option value="">Choose…</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.child_first_name} {a.child_last_name} · {a.year_group_applying}{a.reference ? ` · ${a.reference}` : ""}</option>)}
            </Select>
          </label>
        )}
        {who === "pupil" && (
          <label className={`${ui.label} sm:col-span-2`}>Pupil
            <Select value={childId} onChange={(e) => void pickPupil(e.target.value)} className={`mt-1 ${ui.input}`}>
              <option value="">Choose…</option>
              {kids.map((k) => <option key={k.id} value={k.id}>{k.name}{k.year_groups?.name ? ` · ${k.year_groups.name}` : ""}</option>)}
            </Select>
          </label>
        )}
        {who === "other" && (
          <label className={`${ui.label} sm:col-span-2`}>Child&apos;s full name
            <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${ui.input}`} />
          </label>
        )}
        <label className={ui.label}>Year group
          <Select value={year || (pickedYear ? String(pickedYear) : "")} onChange={(e) => setYear(e.target.value)} className={`mt-1 ${ui.input}`}>
            <option value="">Choose…</option>
            {Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={i + 1}>Year {i + 1}</option>)}
          </Select>
        </label>
      </div>

      <fieldset>
        <legend className={ui.label}>Access arrangements</legend>
        {who === "pupil" && fromPlan && <div className="mt-2"><Notice tone="info">From the pupil&apos;s support plan: {fromPlan}. Check them before making the paper.</Notice></div>}
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-cream">
            <span className="font-medium text-ink">Extra time</span>
            <Select value={extra} onChange={(e) => setExtra(Number(e.target.value))} className={`${ui.input} !w-auto`}>
              {[...new Set([0, 25, 50, 100, extra])].sort((x, y) => x - y).map((v) => <option key={v} value={v}>{v ? `${v}%` : "None"}</option>)}
            </Select>
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-cream">
            <label className="flex items-center gap-2"><span className="font-medium text-ink">Breaks in each part</span>
              <Select value={breaks} onChange={(e) => setBreaks(e.target.value as typeof breaks)} className={`${ui.input} !w-auto`}>
                <option value="default">{effectiveYear >= 1 ? `Usual for Year ${effectiveYear} (${defaultBreaks(effectiveYear).perSection})` : "Usual for the year"}</option>
                {["0", "1", "2", "3", "4", "6"].map((v) => <option key={v} value={v}>{v === "0" ? "No breaks" : v}</option>)}
              </Select>
            </label>
            <label className="flex items-center gap-2"><span className="text-ink/70">of</span>
              <Select value={breakMins} onChange={(e) => setBreakMins(Number(e.target.value))} className={`${ui.input} !w-auto`} aria-label="Length of each break">
                <option value={0}>{effectiveYear >= 1 ? `${defaultBreaks(effectiveYear).minutes} min (usual)` : "usual length"}</option>
                {[2, 3, 5, 8, 10].map((v) => <option key={v} value={v}>{v} min</option>)}
              </Select>
            </label>
          </div>
          <label className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-cream">
            <span className="font-medium text-ink">End a part if the child leaves it</span>
            <Select value={leaveLimit} onChange={(e) => setLeaveLimit(Number(e.target.value))} className={`${ui.input} !w-auto`}>
              <option value={0}>Never (just count it)</option>
              {[3, 5, 10].map((v) => <option key={v} value={v}>{v} times</option>)}
            </Select>
          </label>
          <Switch checked={readAloud} onChange={setReadAloud} label="Read questions aloud" hint="Available to Years 1–3 anyway; when on, each question is also read out automatically" />
          <Switch checked={largeText} onChange={setLargeText} label="Bigger text" />
          <Switch checked={eal} onChange={setEal} label="English is an additional language" hint="Shown on the report so verbal results are read with care" />
          <Switch checked={skipLive} onChange={setSkipLive} label="Skip Qur'an and Arabic" hint="For example if already assessed another way" />
        </div>
        <label className={`${ui.label} mt-2`}>Other arrangements (optional, shown on the report)
          <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} placeholder="e.g. a parent reads the screen's buttons; coloured overlay" className={`mt-1 ${ui.input}`} />
        </label>
        <p className={`${ui.hint} mt-2`}>Leaving the page (another tab, window or app) always covers the questions, is counted and shows on the report. Ending a part is stricter: unanswered questions in it count as wrong, so use it only when the child knows the rule. Breaks pause the clock and hide the questions; the report notes them as allowed. Years 1–2 are offered a break halfway through each part and between parts.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={ui.label}>Supervised by (optional)
          <input value={invigilator} onChange={(e) => setInvigilator(e.target.value)} placeholder="e.g. Ustadha Sumayyah, on Teams" className={`mt-1 ${ui.input}`} />
        </label>
        {who === "applicant" && <div className="self-end"><Switch checked={email} onChange={setEmail} label="Email the link to the parent now" /></div>}
      </div>

      {effectiveYear >= 1 && <p className="rounded-lg bg-cream px-3 py-2 text-sm text-ink/75">Year {effectiveYear}: {effectiveYear <= 2 ? "about 35 minutes on screen in three short parts (Numbers, Listening and reading, Puzzles), then writing, Qur'an and Arabic on the call." : effectiveYear <= 6 ? "about 1 hour 35 minutes on screen in four parts the child can spread over several sittings, then Qur'an and Arabic on the call." : "about 2 hours on screen in four parts the child can spread over several sittings, then Qur'an and Arabic on the call."}{extra ? ` Times include ${extra}% extra.` : ""} Breaks pause the clock.</p>}
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className={ui.btnPrimary}>{busy ? "Making the paper…" : "Make the assessment"}</button>
        <button type="button" onClick={onCancel} className={ui.btnSecondary}>Cancel</button>
      </div>
    </section>
  );
}

type AdminItem = { id: string; type: string; strand: string; level: number; objective: string; stem: string; choices?: string[]; choiceSvgs?: string[]; answer: string | number; unit?: string; tolerance?: number; passageId?: string };
type Full = {
  form: { year: number; sections: { key: string; title: string; candidate: boolean; writingPrompt?: { title: string; prompt: string; guide: string }; items: AdminItem[] }[] };
  responses: Record<string, { value: unknown; ms?: number; g?: number; n?: number }>;
  sections_log: { key: string; timedOut: boolean }[];
};
export type WritingMarkRow = {
  id: string; source: "ai" | "estimate" | "staff"; status: "ok" | "error"; model: string | null; strands: Record<string, { score: number; comment?: string }>;
  overall: string | null; feedback: string | null; next_steps: string[] | null; flags: string[] | null; confidence: string | null; word_count: number | null;
  error: string | null; decision: string | null; override_reason: string | null; notes: string | null; created_by_email: string | null; created_at: string; based_on: string | null;
};

function Detail({ row, onClose, onChanged, onAct }: { row: Row; onClose: () => void; onChanged: () => void; onAct: (id: string, a: "reissue" | "email" | "void", extra?: Record<string, unknown>) => Promise<ActResult | null> }) {
  // Print only this report (not the page behind the drawer), laid out for paper.
  const printRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabaseClient();
  const [full, setFull] = useState<Full | null>(null);
  const [wmarks, setWmarks] = useState<WritingMarkRow[]>([]);
  const [report, setReport] = useState<ReportData | null>(row.report);
  const [status, setStatus] = useState(row.status);
  const [actNotice, setActNotice] = useState<ActResult | null>(null);
  const runAct = async (a: "reissue" | "void", extra?: Record<string, unknown>) => {
    const out = await onAct(row.id, a, extra);
    if (!out) return;
    setActNotice(out);
    if (out.tone !== "bad") setStatus(a === "void" ? "void" : "issued");
  };

  const loadMarks = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("entry_assessment_writing_marks").select("*").eq("assessment_id", row.id).order("created_at", { ascending: false }).limit(20);
    setWmarks((data as WritingMarkRow[]) || []);
  }, [supabase, row.id]);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("entry_assessments").select("form, responses, sections_log").eq("id", row.id).single().then(({ data }) => setFull(data as never));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    loadMarks();
  }, [supabase, row.id, loadMarks]);
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
    if (section === "writing") loadMarks();
    onChanged();
    return null;
  };
  const remark = async () => {
    const res = await callEdgeFunction("entry-assessment", { action: "ai_mark", id: row.id });
    if (!res.ok) return edgeErrorMessage(res);
    if (res.report) setReport(res.report as ReportData);
    if (res.status) setStatus(res.status as string);
    await loadMarks();
    onChanged();
    return res.aiError ? `AI marking didn't work (${String(res.aiError)}), so an estimate was made instead.` : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 print:static print:block print:bg-transparent" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={printRef} role="dialog" aria-modal="true" aria-labelledby="ea-title" className="flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-cream shadow-2xl print:h-auto print:max-w-none print:overflow-visible print:bg-white print:shadow-none">
        <PrintHeader title="Entry assessment report" />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gold-light bg-white px-5 py-4 print:static print:border-0 print:px-0">
          <div>
            <h2 id="ea-title" className="text-xl font-semibold text-ink">{row.candidate_name}</h2>
            <p className="text-sm text-ink/65">Year {row.year}{row.dob ? ` · born ${new Date(`${row.dob.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}{row.eal ? " · EAL" : ""}{row.invigilator ? ` · supervised by ${row.invigilator}` : ""}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <StatusChip tone={(STATUS[status] || STATUS.issued).tone}>{(STATUS[status] || STATUS.issued).label}</StatusChip>
            <button type="button" onClick={() => printElement(printRef.current)} className={`${ui.btnSecondary} ${ui.sm}`}>Print</button>
            <button type="button" onClick={onClose} aria-label="Close" className="portal-icon-btn"><Icon name="x" /></button>
          </div>
        </div>

        <div className="space-y-5 p-5 print:p-0">
          {["issued", "in_progress"].includes(status) && (
            <div className="print:hidden"><Notice tone="info">The pupil hasn&apos;t finished the on-screen parts yet. You can still mark the Qur&apos;an and Arabic parts from the family call now.</Notice></div>
          )}

          {report ? <EntryReport report={report} name={row.candidate_name} /> : <EmptyState title="The report appears when the pupil finishes" icon="fileText" tile="tile-blue">Results are worked out as soon as the on-screen parts are done; Writing is first-marked automatically and checked by you, and Qur&apos;an and Arabic are added when you mark them.</EmptyState>}

          {(hasSection("writing") || hasSection("quran") || hasSection("arabic")) && (
            <section className={`${ui.card} space-y-5 print:hidden`} aria-label="Teacher-marked parts">
              <h3 className="text-base font-semibold text-ink">Teacher-marked parts</h3>
              {hasSection("writing") && <WritingMark year={row.year} prompt={writingSection?.writingPrompt} text={writingText} live={!writingItem} initial={(row.marks as { writing?: WritingInitial } | null)?.writing} marks={wmarks} onSave={(d) => saveMark("writing", d)} onRemark={writingItem && ["submitted", "complete"].includes(status) ? remark : undefined} />}
              {hasSection("quran") && <QuranMark initial={(row.marks as { quran?: Record<string, unknown> } | null)?.quran} onSave={(d) => saveMark("quran", d)} />}
              {hasSection("arabic") && <ArabicMark initial={(row.marks as { arabic?: Record<string, unknown> } | null)?.arabic} onSave={(d) => saveMark("arabic", d)} />}
            </section>
          )}

          {full && <AnswerReview full={full} />}

          <div className="flex flex-wrap gap-2 border-t border-gold-light pt-4 print:hidden">
            {status !== "void" && <button type="button" onClick={() => runAct("reissue", { newPaper: true })} className={ui.btnSecondary}>Start again with a new paper</button>}
            {status !== "void" && status !== "complete" && <button type="button" onClick={() => runAct("void")} className={ui.btnLinkDanger}>Cancel this assessment</button>}
          </div>
          {actNotice && (
            <div className="space-y-2 print:hidden">
              <Notice tone={actNotice.tone}>{actNotice.text}</Notice>
              {actNotice.link && <CopyLink link={actNotice.link} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isRight(it: AdminItem, v: unknown): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  if (it.type === "numeric") {
    const n = Number(String(v).replace(/[,£\s]/g, "").replace(/[−–]/g, "-"));
    return Number.isFinite(n) && Math.abs(n - Number(it.answer)) <= (it.tolerance ?? 1e-9);
  }
  if (it.type === "mcq") return String(v).trim() === String(it.answer).trim();
  return null;
}

/** Every question the pupil saw, their answer, the right answer and the time taken. */
function AnswerReview({ full }: { full: Full }) {
  const sections = full.form.sections.filter((s) => s.candidate && s.items.some((i) => i.type !== "text"));
  if (!sections.length) return null;
  return (
    <details className={`${ui.card} print:hidden`}>
      <summary className="cursor-pointer text-base font-semibold text-ink">Answers, question by question</summary>
      <p className="mt-2 text-xs text-ink/60">For checking and appeals. Times under 2.5 seconds are shown in amber.</p>
      {sections.map((s) => (
        <div key={s.key} className="mt-4 overflow-x-auto">
          <h4 className="text-sm font-semibold text-ink">{s.title}</h4>
          <table className="mt-1 w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-ink/60"><tr><th className="py-1 pr-2 font-medium">#</th><th className="py-1 pr-2 font-medium">Question</th><th className="py-1 pr-2 font-medium">Answer given</th><th className="py-1 pr-2 font-medium">Right answer</th><th className="py-1 pr-2 font-medium">Time</th></tr></thead>
            <tbody className="divide-y divide-gold-light/50">
              {s.items.filter((i) => i.type !== "text").map((it, n) => {
                const r = full.responses[it.id];
                const ok = isRight(it, r?.value);
                const t = r?.ms ?? r?.g;
                return (
                  <tr key={it.id} className="align-top">
                    <td className="py-1.5 pr-2 tabular-nums text-ink/60">{n + 1}</td>
                    <td className="py-1.5 pr-2"><MathText text={it.stem} className="line-clamp-2" /><span className="block text-xs text-ink/55">{it.objective} · level {it.level}</span></td>
                    <td className={`py-1.5 pr-2 ${ok === true ? "text-green-800" : ok === false ? "text-red-800" : "text-ink/50"}`}>{r?.value === undefined || r?.value === "" ? "–" : <MathText text={String(r.value)} />}{ok === true ? <Icon name="check" className="ml-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.5} /> : ok === false ? <Icon name="x" className="ml-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.5} /> : null}</td>
                    <td className="py-1.5 pr-2"><MathText text={String(it.answer)} />{it.unit && it.unit !== "£" ? ` ${it.unit}` : ""}</td>
                    <td className={`py-1.5 pr-2 tabular-nums ${typeof t === "number" && t < 2500 ? "text-amber-700" : "text-ink/60"}`}>{typeof t === "number" ? `${(t / 1000).toFixed(1)} s` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

// Same strands, in the same order, as supabase/functions/_shared/assess/writing.ts.
const WRITING = [
  { key: "composition", label: "Composition and effect", hint: "Ideas fit the task, purpose and reader" },
  { key: "organisation", label: "Organisation", hint: "Opening, paragraphs or sequence, ending" },
  { key: "sentences", label: "Sentence structure and punctuation", hint: "Range of sentence types, accurate punctuation" },
  { key: "accuracy", label: "Spelling", hint: "Spelling for the year group (and presentation)" },
  { key: "vocabulary", label: "Vocabulary", hint: "Precise, varied word choice" },
];
/** Usual breaks per part (mirrors defaultBreaks in the paper builder). */
function defaultBreaks(year: number) {
  return year <= 2 ? { perSection: 3, minutes: 3 } : year <= 6 ? { perSection: 2, minutes: 3 } : { perSection: 1, minutes: 5 };
}
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

function SaveRow({ onSave, ready, label = "Save marks" }: { onSave: () => Promise<string | null>; ready: boolean; label?: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={!ready || state === "saving"} onClick={async () => { setState("saving"); const e = await onSave(); setErr(e); setState(e ? "idle" : "saved"); }} className={`${ui.btnPrimary} ${ui.sm}`}>{state === "saving" ? "Saving…" : label}</button>
      {state === "saved" && <span className="text-sm text-green-800">Saved, report updated</span>}
      {err && <span className="text-sm text-red-700">{err}</span>}
    </div>
  );
}

type WritingInitial = { scores: Record<string, number>; notes?: string; overall?: string; overrideReason?: string; decision?: string; markedBy?: string; markedAt?: string };
const FLAG_LABEL: Record<string, string> = {
  very_short: "Very short for the time given", off_topic: "May not answer the task", possibly_not_own_work: "Style may not be the pupil's own",
  safeguarding_concern: "Possible safeguarding concern", not_in_english: "Not written in English", hard_to_read: "Hard to read",
};
const bandOfMean = (mean: number) => { const d = mean - 2; return d <= -1.5 ? "Well below" : d <= -0.5 ? "Below" : d < 0.75 ? "Expected" : d < 1.75 ? "Above" : "Well above"; };

function WritingMark({ year, prompt, text, live, initial, marks, onSave, onRemark }: {
  year: number; prompt?: { title: string; prompt: string; guide: string }; text: string; live: boolean; initial?: WritingInitial; marks: WritingMarkRow[];
  onSave: (d: Record<string, unknown>) => Promise<string | null>; onRemark?: () => Promise<string | null>;
}) {
  const first = marks.find((m) => m.source !== "staff" && m.status === "ok") || null;
  const failed = marks.find((m) => m.source === "ai" && m.status === "error");
  const lastStaff = marks.find((m) => m.source === "staff") || null;
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores || {});
  const [overall, setOverall] = useState(initial?.overall || "");
  const [reason, setReason] = useState(initial?.overrideReason || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [remarking, setRemarking] = useState(false);
  const [remarkMsg, setRemarkMsg] = useState<string | null>(null);
  // Start from the first mark when there is no staff mark yet.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || initial?.scores || !first) return;
    seeded.current = true;
    setScores(Object.fromEntries(WRITING.filter((c) => typeof first.strands?.[c.key]?.score === "number").map((c) => [c.key, first.strands[c.key].score])));
  }, [first, initial?.scores]);

  const complete = WRITING.every((c) => scores[c.key] !== undefined);
  const mean = complete ? WRITING.reduce((p, c) => p + scores[c.key], 0) / WRITING.length : null;
  const avgBand = mean === null ? null : bandOfMean(mean);
  const overriding = !!overall && overall !== avgBand;
  const unchanged = !!first && WRITING.every((c) => first.strands?.[c.key]?.score === scores[c.key]) && !overriding;

  return (
    <div className="space-y-3 rounded-xl border border-gold-light/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="portal-tile tile-violet" aria-hidden="true"><Icon name="notebookPen" /></span><h4 className="font-semibold text-ink">Writing</h4></div>
        {lastStaff ? <StatusChip tone="good">Checked by {lastStaff.created_by_email || "staff"} on {new Date(lastStaff.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</StatusChip> : first ? <StatusChip tone="warn">Waiting for a staff check</StatusChip> : null}
      </div>
      {prompt && <p className="text-sm text-ink/75"><b>{prompt.title}.</b> {prompt.prompt}<br /><span className="text-ink/60">Secure for this band: {prompt.guide}</span></p>}
      {live ? <p className="rounded-lg bg-cream px-3 py-2 text-sm text-ink/75">Done on the call: read the task aloud, the child writes on paper and holds it up to the camera. Mark what you see.</p> : text ? <blockquote className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gold-light/70 bg-cream/60 p-3 text-sm leading-relaxed text-ink/90">{text}<footer className="mt-2 text-xs text-ink/55">{text.trim().split(/\s+/).length} words</footer></blockquote> : <p className="text-sm text-ink/60">No writing submitted yet.</p>}

      {!live && first && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-ink">{first.source === "ai" ? "AI first mark" : "Estimate – needs staff marking"}{first.overall ? `: ${first.overall}` : ""}</p>
            <span className="text-xs text-ink/55">{first.source === "ai" ? `${first.model || "AI"}${first.confidence ? `, ${first.confidence} confidence` : ""}` : "length, sentences, punctuation and a short spelling list"} · {new Date(first.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {(first.flags || []).includes("safeguarding_concern") && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-900">Possible safeguarding concern flagged. Read the writing and follow the safeguarding policy.</p>}
          {first.feedback && <p className="mt-1 text-ink/80">{first.feedback}</p>}
          <ul className="mt-2 space-y-0.5 text-xs text-ink/75">{WRITING.map((c) => first.strands?.[c.key] && <li key={c.key}><b className="text-ink">{c.label}: {SCALE[first.strands[c.key].score]}.</b> {first.strands[c.key].comment}</li>)}</ul>
          {(first.next_steps || []).length > 0 && <p className="mt-2 text-xs text-ink/75"><b className="text-ink">Next steps:</b> {(first.next_steps || []).join("; ")}</p>}
          {(first.flags || []).filter((f) => f !== "safeguarding_concern").length > 0 && <p className="mt-1 text-xs text-ink/65">Notes: {(first.flags || []).filter((f) => f !== "safeguarding_concern").map((f) => FLAG_LABEL[f] || f).join("; ")}</p>}
        </div>
      )}
      {!live && failed && (!first || failed.created_at > first.created_at) && <p className="text-xs text-amber-800">The last AI marking didn&apos;t work ({failed.error}). {first ? "Showing the estimate instead." : ""}</p>}
      {!live && onRemark && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={remarking} onClick={async () => { setRemarking(true); setRemarkMsg(await onRemark()); setRemarking(false); }} className={`${ui.btnSecondary} ${ui.sm}`}>{remarking ? "Marking…" : first ? "First-mark again" : "First-mark this writing"}</button>
          {remarkMsg && <span className="text-xs text-ink/70">{remarkMsg}</span>}
        </div>
      )}

      <p className="text-xs text-ink/60">Your marks: each strand against what is expected for Year {year}. {first ? "They start from the first mark; change any you disagree with." : ""}</p>
      <div className="space-y-2">
        {WRITING.map((c) => (
          <div key={c.key} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-center">
            <span className="text-sm"><span className="font-medium text-ink">{c.label}</span><span className="block text-xs text-ink/60">{c.hint}</span></span>
            <Scale name={c.label} value={scores[c.key]} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={ui.label}>Overall judgement
          <Select value={overall} onChange={(e) => setOverall(e.target.value)} className={`mt-1 ${ui.input}`}>
            <option value="">{avgBand ? `From the strands: ${avgBand}` : "From the strands"}</option>
            {SCALE.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </label>
        {overriding && (
          <label className={ui.label}>Reason for changing it (needed)
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className={`mt-1 ${ui.input}`} placeholder="e.g. strong ideas held back by handwriting speed" />
          </label>
        )}
      </div>
      <label className={ui.label}>Note for the report (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`mt-1 ${ui.input}`} /></label>
      <SaveRow ready={complete && (!overriding || reason.trim().length >= 3)} label={unchanged ? "Accept the first mark" : "Save my marks"} onSave={() => onSave({ scores, notes, overall: overriding ? overall : undefined, overrideReason: overriding ? reason.trim() : undefined, basedOn: first?.id })} />
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
        <Select value={stage ?? ""} onChange={(e) => setStage(e.target.value === "" ? undefined : Number(e.target.value))} className={`mt-1 ${ui.input}`}>
          <option value="">Choose…</option>
          {STAGES.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </Select>
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
