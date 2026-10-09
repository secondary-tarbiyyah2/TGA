"use client";

import { useState } from "react";
import type { ApplicationPatch, ApplicationRow } from "@/components/admissions/applicationShared";
import { EmailComposer } from "@/components/learn/admissions/EmailComposer";
import { sendTemplateEmail } from "@/components/learn/admissions/admissionsData";
import { buildTemplate, type TemplateContext } from "@/components/learn/admissions/messageTemplates";
import { OUTCOME_LABELS, fmtLondon, fromLondonInput, toLondonInput, type InterviewOutcome, type StageDetails } from "@/components/learn/admissions/stageTypes";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import { Group, Pill, fieldCls, ghostBtn, primaryBtn } from "@/components/learn/admissions/ui";

type Draft = { at: string; interviewer: string; link: string; notes: string; outcome: string; autoEmail: boolean };
const nz = (s: string) => (s.trim() === "" ? null : s.trim());

export function InterviewPanel({
  app,
  ctx,
  baseCtx,
  onPatch,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  baseCtx: TemplateContext;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
}) {
  const init = (): Draft => ({
    at: toLondonInput(app.interview_at),
    interviewer: ctx.details?.interview_interviewer || "",
    link: ctx.details?.interview_link || "",
    notes: ctx.details?.interview_notes || "",
    outcome: ctx.details?.interview_outcome || "",
    autoEmail: ctx.templates.interview_invite?.auto_send ?? true,
  });
  const [d, setD] = useState<Draft>(init);
  const [saved, setSaved] = useState<Draft>(d);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [composing, setComposing] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify({ ...d, autoEmail: 0 }) !== JSON.stringify({ ...saved, autoEmail: 0 });
  const defaultLink = ctx.settings?.interview_join_url || "";

  async function save() {
    setSaving(true);
    setMsg(null);
    const at = fromLondonInput(d.at);
    const okApp = at !== app.interview_at ? await onPatch(app.id, { interview_at: at }) : true;
    const okDet = await ctx.saveDetails({
      interview_interviewer: nz(d.interviewer),
      interview_link: nz(d.link),
      interview_notes: nz(d.notes),
      interview_outcome: (d.outcome || null) as InterviewOutcome | null,
    });
    if (!(okApp && okDet)) {
      setSaving(false);
      return setMsg({ ok: false, text: "Couldn't save. Please try again." });
    }
    setSaved(d);
    let text = "Saved.";
    let ok = true;
    if (d.autoEmail && at && at !== app.interview_at) {
      const out = await sendTemplateEmail({
        app: { ...app, interview_at: at },
        key: "interview_invite",
        auto: false, // the tick-box is the staff member's choice for this save
        data: {
          settings: ctx.settings,
          bands: ctx.bands,
          planIntent: ctx.planIntent,
          fees: ctx.fees,
          details: { ...(ctx.details as StageDetails), interview_interviewer: nz(d.interviewer), interview_link: nz(d.link) },
        },
      });
      text = out.emailSent ? `Saved, and the interview invitation emailed to ${app.parent_email}.` : `Saved, but the invitation email could not be sent. ${out.text}`;
      ok = out.emailSent;
      await ctx.reload();
    }
    setSaving(false);
    setMsg({ ok, text });
  }

  return (
    <div className="space-y-4">
      <Group title="Interview" help="A short conversation with the parent(s) and child, held after the assessment has been reviewed. Separate from the website call bookings.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Date &amp; time (UK time)
            <input type="datetime-local" value={d.at} onChange={(e) => set("at", e.target.value)} className={fieldCls} />
            {d.at && <span className="mt-1 block text-xs font-normal text-ink/55">{fmtLondon(fromLondonInput(d.at))}</span>}
          </label>
          <label className="block text-sm font-medium text-ink">
            Interviewer
            <input value={d.interviewer} onChange={(e) => set("interviewer", e.target.value)} maxLength={200} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Join link
            <input type="url" value={d.link} onChange={(e) => set("link", e.target.value)} placeholder={defaultLink ? `Default: ${defaultLink}` : "https://…"} maxLength={500} className={fieldCls} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={d.autoEmail} onChange={(e) => set("autoEmail", e.target.checked)} />
          <span>Email the interview invitation to the parent when I save a new date/time{ctx.templates.interview_invite?.auto_send === false ? " (automatic sending is switched off in Email settings; tick to send this time)" : ""}</span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { setComposing((c) => !c); setMsg(null); }} disabled={!app.interview_at || dirty} className={ghostBtn}>
            Email interview invitation
          </button>
          {(!app.interview_at || dirty) && <span className="text-xs text-ink/55">{dirty ? "Save first." : "Set a date and time first."}</span>}
          {ctx.details?.interview_emailed_at && <Pill tone="good">Invited {new Date(ctx.details.interview_emailed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</Pill>}
        </div>
        {composing && (
          <EmailComposer
            app={app}
            template="interview_invite"
            initial={buildTemplate("interview_invite", app, { ...baseCtx, details: ctx.details })}
            sendLabel="Send invitation"
            onCancel={() => setComposing(false)}
            onSent={(o) => {
              setComposing(false);
              setMsg({ ok: true, text: o.text });
              void ctx.reload();
            }}
          />
        )}
      </Group>

      <Group title="Interview notes &amp; outcome">
        <label className="block text-sm font-medium text-ink">
          Notes <span className="text-xs font-normal text-ink/65">(staff only)</span>
          <textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={5} maxLength={10000} className={fieldCls} />
        </label>
        <label className="mt-3 block text-sm font-medium text-ink">
          Outcome
          <select value={d.outcome} onChange={(e) => set("outcome", e.target.value)} className={fieldCls}>
            <option value="">Not recorded</option>
            {(Object.keys(OUTCOME_LABELS) as InterviewOutcome[]).map((o) => (
              <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
            ))}
          </select>
        </label>
      </Group>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className={primaryBtn}>{saving ? "Saving…" : "Save interview"}</button>
        {dirty && !saving && <span className="text-xs text-ink/55">Unsaved changes</span>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
