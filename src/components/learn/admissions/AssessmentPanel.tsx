"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, MAX_REPORT_BYTES, type ApplicationPatch, type ApplicationRow } from "@/components/admissions/applicationShared";
import { EmailComposer } from "@/components/learn/admissions/EmailComposer";
import { sendTemplateEmail } from "@/components/learn/admissions/admissionsData";
import { buildTemplate, type TemplateContext } from "@/components/learn/admissions/messageTemplates";
import { fmtLondon, fromLondonInput, toLondonInput, type StageDetails } from "@/components/learn/admissions/stageTypes";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import type { StaffOption } from "@/components/learn/admissions/ApplicationDrawer";
import { Group, Pill, fieldCls, ghostBtn, primaryBtn } from "@/components/learn/admissions/ui";

import { Select } from "@/components/ui/Dropdown";
type Draft = {
  assessmentAt: string;
  link: string;
  duration: string;
  autoEmail: boolean;
  platform: string;
  invigilator: string;
  startedAt: string;
  finishedAt: string;
  idVerified: boolean;
  cameraOn: boolean;
  irregularities: string;
  rawScore: string;
  standardScore: string;
  recommendation: string;
};

const nz = (s: string) => (s.trim() === "" ? null : s.trim());

function fromState(app: ApplicationRow, d: StageDetails | null, autoEmail: boolean): Draft {
  return {
    assessmentAt: toLondonInput(app.assessment_at),
    link: d?.assessment_link || "",
    duration: d?.assessment_duration_text || "",
    autoEmail,
    platform: d?.assessment_platform || "",
    invigilator: d?.assessment_invigilator || "",
    startedAt: toLondonInput(d?.assessment_started_at ?? null),
    finishedAt: toLondonInput(d?.assessment_finished_at ?? null),
    idVerified: d?.assessment_id_verified ?? false,
    cameraOn: d?.assessment_camera_on ?? false,
    irregularities: d?.assessment_irregularities || "",
    rawScore: d?.assessment_raw_score || "",
    standardScore: d?.assessment_standard_score || "",
    recommendation: d?.assessment_recommendation || "",
  };
}

export function AssessmentPanel({
  app,
  ctx,
  staff,
  baseCtx,
  onPatch,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  staff: StaffOption[];
  baseCtx: TemplateContext;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
}) {
  const [d, setD] = useState<Draft>(() => fromState(app, ctx.details, ctx.templates.assessment_invite?.auto_send ?? true));
  const [saved, setSaved] = useState<Draft>(d);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [composing, setComposing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((c) => ({ ...c, [k]: v }));
  const { autoEmail: _a, ...dRest } = d;
  const { autoEmail: _b, ...sRest } = saved;
  void _a; void _b;
  const dirty = JSON.stringify(dRest) !== JSON.stringify(sRest);
  const defaultLink = ctx.settings?.assessment_join_url || "";

  async function save() {
    setSaving(true);
    setMsg(null);
    const newAt = fromLondonInput(d.assessmentAt);
    const dateChanged = newAt !== app.assessment_at;
    const okApp = dateChanged ? await onPatch(app.id, { assessment_at: newAt }) : true;
    const okDet = await ctx.saveDetails({
      assessment_link: nz(d.link),
      assessment_duration_text: nz(d.duration),
      assessment_platform: nz(d.platform),
      assessment_invigilator: d.invigilator || null,
      assessment_started_at: fromLondonInput(d.startedAt),
      assessment_finished_at: fromLondonInput(d.finishedAt),
      assessment_id_verified: d.idVerified,
      assessment_camera_on: d.cameraOn,
      assessment_irregularities: nz(d.irregularities),
      assessment_raw_score: nz(d.rawScore),
      assessment_standard_score: nz(d.standardScore),
      assessment_recommendation: nz(d.recommendation),
    });
    if (!okApp || !okDet) {
      setSaving(false);
      return setMsg({ ok: false, text: "Couldn't save everything. Please try again." });
    }
    setSaved(d);
    let text = "Saved.";
    let ok = true;
    if (d.autoEmail && newAt && dateChanged) {
      const out = await sendTemplateEmail({
        app: { ...app, assessment_at: newAt },
        key: "assessment_invite",
        auto: false, // the tick-box above is the staff member's choice for this save
        data: {
          settings: ctx.settings,
          bands: ctx.bands,
          planIntent: ctx.planIntent,
          fees: ctx.fees,
          details: { ...(ctx.details as StageDetails), assessment_link: nz(d.link), assessment_duration_text: nz(d.duration), assessment_platform: nz(d.platform) },
        },
      });
      text = out.emailSent ? `Saved, and the assessment invitation emailed to ${app.parent_email}.` : `Saved, but the invitation email could not be sent. ${out.text}`;
      ok = out.emailSent;
      await ctx.reload();
    }
    setSaving(false);
    setMsg({ ok, text });
  }

  async function uploadResults(file: File | null) {
    if (!file) return;
    if (file.type !== "application/pdf") return setMsg({ ok: false, text: "The results file must be a PDF." });
    if (file.size > MAX_REPORT_BYTES) return setMsg({ ok: false, text: "That file is over 10 MB." });
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUploading(true);
    setMsg(null);
    const path = `${app.id}/results-${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) {
      setUploading(false);
      return setMsg({ ok: false, text: "Couldn't upload the results. Migration 0061 (staff upload policy) may not be applied yet." });
    }
    const ok = await ctx.saveDetails({ assessment_results_path: path });
    setUploading(false);
    setMsg({ ok, text: ok ? "Results PDF uploaded. It now appears in the Documents tab." : "Uploaded, but couldn't record it. Check the Documents tab." });
  }

  const emailBuilt = () => buildTemplate("assessment_invite", app, { ...baseCtx, details: ctx.details });

  return (
    <div className="space-y-4">
      <Group
        title="Assessment (remote, supervised)"
        help={
          <>
            <p>
              <strong>Recommended set-up:</strong> use a standardised online test (for example GL Assessment / Testwise, or a school-hosted CEM or ISEB-type test) delivered with{" "}
              <strong>live remote invigilation</strong> over Teams or Zoom: camera on, screen share, an ID check at the start, a 1:1 invigilator, a secure room scan, and rules agreed with the family beforehand (the emailed details include them).
            </p>
            <p className="mt-1">Availability and licensing of any commercial test must be confirmed with the provider before it is offered to families. This is separate from the website <em>call bookings</em>.</p>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Assessment date &amp; time (UK time)
            <input type="datetime-local" value={d.assessmentAt} onChange={(e) => set("assessmentAt", e.target.value)} className={fieldCls} />
            {d.assessmentAt && <span className="mt-1 block text-xs font-normal text-ink/65">{fmtLondon(fromLondonInput(d.assessmentAt))}</span>}
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Join link (Teams / Zoom / other)
            <input type="url" value={d.link} onChange={(e) => set("link", e.target.value)} placeholder={defaultLink ? `Default: ${defaultLink}` : "https://…"} maxLength={500} className={fieldCls} />
            <span className="mt-1 block text-xs font-normal text-ink/65">Leave blank to use the default link from Admissions settings{defaultLink ? "" : " (none set yet)"}.</span>
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Duration shown to the family
            <input value={d.duration} onChange={(e) => set("duration", e.target.value)} placeholder={ctx.settings?.assessment_duration_text || "about 60 to 90 minutes"} maxLength={100} className={fieldCls} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={d.autoEmail} onChange={(e) => set("autoEmail", e.target.checked)} />
          <span>Email the assessment invitation to the parent when I save a new date/time{ctx.templates.assessment_invite?.auto_send === false ? " (automatic sending is switched off in Email settings; tick to send this time)" : ""}</span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { setComposing((c) => !c); setMsg(null); }} disabled={!app.assessment_at || dirty} className={ghostBtn}>
            Email assessment details
          </button>
          {(!app.assessment_at || dirty) && <span className="text-xs text-ink/65">{dirty ? "Save first." : "Set a date and time first."}</span>}
          {ctx.details?.assessment_emailed_at && <Pill tone="good">Emailed {new Date(ctx.details.assessment_emailed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</Pill>}
        </div>
        {composing && (
          <EmailComposer
            app={app}
            template="assessment_invite"
            initial={emailBuilt()}
            sendLabel="Send assessment details"
            onCancel={() => setComposing(false)}
            onSent={(o) => {
              setComposing(false);
              setMsg({ ok: true, text: o.text });
              void ctx.reload();
            }}
          />
        )}
      </Group>

      <Group title="Remote supervised assessment checklist" help="Complete during and straight after the session. Everything here is staff-only.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Provider / platform
            <input value={d.platform} onChange={(e) => set("platform", e.target.value)} placeholder="e.g. GL Assessment / Testwise, ISEB Common Pre-Test, CEM Select, internal" maxLength={200} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Invigilator
            <Select allowEmpty value={d.invigilator} onChange={(e) => set("invigilator", e.target.value)} className={fieldCls}>
              <option value="">Not assigned</option>
              {staff.map((s) => (
                <option key={s.profile_id} value={s.profile_id}>{s.display_name}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Started (UK time)
            <input type="datetime-local" value={d.startedAt} onChange={(e) => set("startedAt", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Finished (UK time)
            <input type="datetime-local" value={d.finishedAt} onChange={(e) => set("finishedAt", e.target.value)} className={fieldCls} />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={d.idVerified} onChange={(e) => set("idVerified", e.target.checked)} />
            ID verified at the start (parent and child)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={d.cameraOn} onChange={(e) => set("cameraOn", e.target.checked)} />
            Camera on throughout, child and screen/room visible
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-ink">
          Irregularities
          <textarea value={d.irregularities} onChange={(e) => set("irregularities", e.target.value)} rows={3} maxLength={5000} placeholder="Connection drops, interruptions, help given, rule breaches… leave blank if none" className={fieldCls} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Raw score
            <input value={d.rawScore} onChange={(e) => set("rawScore", e.target.value)} maxLength={60} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Standard score
            <input value={d.standardScore} onChange={(e) => set("standardScore", e.target.value)} maxLength={60} className={fieldCls} />
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-ink">
          Recommendation / outcome
          <textarea value={d.recommendation} onChange={(e) => set("recommendation", e.target.value)} rows={2} maxLength={2000} className={fieldCls} />
        </label>
        <div className="mt-3">
          <label className="block text-sm font-medium text-ink">
            Results PDF
            <input type="file" accept="application/pdf" disabled={uploading} onChange={(e) => { void uploadResults(e.target.files?.[0] || null); e.target.value = ""; }} className="mt-1 block w-full text-sm" />
          </label>
          <p className="mt-1 text-xs text-ink/65">
            {uploading ? "Uploading…" : ctx.details?.assessment_results_path ? "A results PDF is on file; see the Documents tab. Uploading another adds it alongside." : "Added to the Documents tab (PDF, up to 10 MB)."}
          </p>
        </div>
      </Group>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className={primaryBtn}>
          {saving ? "Saving…" : "Save assessment"}
        </button>
        {dirty && !saving && <span className="text-xs text-ink/65">Unsaved changes</span>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
