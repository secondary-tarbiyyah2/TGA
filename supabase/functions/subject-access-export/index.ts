// One-click subject-access export (UK GDPR Art. 15). Deployed WITH JWT
// verification; on top of that the caller must hold the Headteacher or Admin
// /learn role, checked with the caller's OWN token (current_has_role runs
// under their RLS context), never a role the client merely claims.
//
// Input (POST JSON):
//   subject_type            "pupil" | "parent"
//   subject_id              children.id (pupil) or profiles.id (parent)
//   include_child_records   parent only: also include each linked child's own
//                           records (use only when the parent is acting for the child)
//   include_safeguarding    include safeguarding concern summaries about the pupil.
//                           Allowed only for the Headteacher or a Safeguarding Lead,
//                           and OFF by default: safeguarding material usually needs a
//                           human decision about exemptions before release.
//   request_id              optional data_rights_requests.id to link the export to
//
// Output: a single JSON file and a human-readable HTML summary, written to the
// PRIVATE data-exports bucket and returned as 24-hour signed URLs. The export is
// recorded in data_export_log and in the audit trail. Files are deleted once
// the link has expired (see _shared/exportPurge.ts).
//
// Deliberately EXCLUDED (third-party data / not the subject's to receive):
// staff names and identities on records, other pupils and parents, emergency
// contacts' phone numbers and emails, internal staff notes on admissions,
// safeguarding keyword flags, and safeguarding concern content unless
// explicitly included by an authorised person. The HTML says so on its face
// so whoever releases it knows to review it first.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { purgeExpiredExports } from "../_shared/exportPurge.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceKey);

const BUCKET = "data-exports";
const LINK_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
type Section = { title: string; note?: string; rows: Row[] };
type Sections = Record<string, Section>;
type QueryResult = { data: unknown; error: { message: string } | null };

async function rows(q: PromiseLike<QueryResult>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as Row[]) : data ? [data as Row] : [];
}

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (k in row) out[k] = row[k];
  return out;
}

function omit(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!keys.includes(k)) out[k] = v;
  return out;
}

function nested(row: Row, key: string, field: string): unknown {
  const v = row[key];
  if (Array.isArray(v)) return v.length > 0 ? (v[0] as Row)[field] : null;
  if (v && typeof v === "object") return (v as Row)[field];
  return null;
}

// ── sections ──────────────────────────────────────────────────────────────

async function messageSection(threads: Row[]): Promise<Section> {
  const ids = threads.map((t) => String(t.id));
  if (ids.length === 0) return { title: "Messages", rows: [] };
  const msgs = await rows(
    service.from("message_thread_messages").select("thread_id, sender_id, body, created_at, recalled_at").in("thread_id", ids).order("created_at", { ascending: true }),
  );
  const byThread = new Map(threads.map((t) => [String(t.id), t]));
  const out: Row[] = msgs.map((m) => {
    const t = byThread.get(String(m.thread_id));
    let from = "School staff";
    if (t && m.sender_id === t.parent_id) from = "Parent/carer";
    else if (t && m.sender_id === t.teacher_id) from = "Teacher";
    return {
      sent: m.created_at,
      from,
      message: m.recalled_at ? "[message was withdrawn by its sender]" : m.body,
    };
  });
  return {
    title: "Messages",
    note: "Staff names are replaced by their role. Messages the school flagged internally are included without the flag.",
    rows: out,
  };
}

async function signaturesSection(profileId: string | null): Promise<Section> {
  if (!profileId) return { title: "Document signatures", rows: [] };
  const sigs = await rows(
    service.from("document_signatures").select("document_title_signed, typed_full_name, signed_at, method").eq("signer_id", profileId).order("signed_at", { ascending: true }),
  );
  return { title: "Document signatures", rows: sigs.map((s) => ({ document: s.document_title_signed, signed_as: s.typed_full_name, signed_at: s.signed_at, method: s.method })) };
}

const APP_CHILD_FIELDS = [
  "reference", "status", "created_at", "updated_at",
  "child_first_name", "child_last_name", "child_dob", "child_gender",
  "year_group_applying", "preferred_start", "current_school", "current_school_year",
  "previous_islamic_education", "send_or_medical_notes", "sibling_at_tarbiyyah", "sibling_details",
];
const APP_PARENT_FIELDS = ["parent_name", "parent_email", "parent_phone", "relationship", "address", "address_line1", "address_line2", "address_town", "address_postcode", "address_country", "how_heard", "consent_contact", "consent_data", "declaration_name"];

async function admissionsSection(parentEmail: string | null, childName: string | null, childDob: string | null, includeParentFields: boolean): Promise<Section> {
  const title = "Admissions record";
  if (!parentEmail) return { title, rows: [] };
  const wanted = parentEmail.trim().toLowerCase();
  const apps = (
    await rows(service.from("admissions_applications").select("*").ilike("parent_email", parentEmail.trim().replace(/[\\%_]/g, "\\$&")))
  ).filter((a) => String(a.parent_email || "").trim().toLowerCase() === wanted);
  const matched = apps.filter((a) => {
    if (!childName && !childDob) return true;
    const full = `${a.child_first_name} ${a.child_last_name}`.trim().toLowerCase();
    return (childName ? full === childName.trim().toLowerCase() : true) && (childDob ? a.child_dob === childDob : true);
  });
  const fields = includeParentFields ? [...APP_PARENT_FIELDS, ...APP_CHILD_FIELDS] : APP_CHILD_FIELDS;
  return {
    title,
    note: "Internal staff notes and decision notes are excluded and need a separate manual review before release.",
    rows: matched.map((a) => pick(a, fields)),
  };
}

async function safeguardingSection(childId: string): Promise<Section> {
  const concerns = await rows(
    service.from("safeguarding_concerns").select("created_at, severity, status, summary, outcome, safeguarding_categories(label)").eq("child_id", childId).order("created_at", { ascending: true }),
  );
  return {
    title: "Safeguarding concerns (INCLUDED ON REQUEST - REVIEW BEFORE RELEASE)",
    note: "Reporter identities, actions taken and referral details are excluded. Safeguarding information is often exempt from disclosure: the Designated Safeguarding Lead must decide what may be released.",
    rows: concerns.map((c) => ({
      recorded: c.created_at,
      category: nested(c, "safeguarding_categories", "label"),
      severity: c.severity,
      status: c.status,
      summary: c.summary,
      outcome: c.outcome,
    })),
  };
}

async function pupilSections(childId: string, opts: { includeSafeguarding: boolean; includeAdmissions: boolean }): Promise<{ sections: Sections; child: Row; parentEmail: string | null }> {
  const kids = await rows(service.from("children").select("id, name, dob, created_at, year_group_id, parent_user_id").eq("id", childId));
  if (kids.length === 0) throw new Error("not_found");
  const kid = kids[0];

  const yg = kid.year_group_id ? await rows(service.from("year_groups").select("name").eq("id", String(kid.year_group_id))) : [];
  const parent = kid.parent_user_id ? await rows(service.from("profiles").select("email").eq("id", String(kid.parent_user_id))) : [];
  const parentEmail = parent.length > 0 ? String(parent[0].email) : null;
  const studentAcct = await rows(service.from("student_accounts").select("profile_id").eq("child_id", childId));
  const studentProfileId = studentAcct.length > 0 && studentAcct[0].profile_id ? String(studentAcct[0].profile_id) : null;

  const sections: Sections = {};
  sections.child_record = {
    title: "Child record",
    rows: [{ name: kid.name, date_of_birth: kid.dob, year_group: yg.length > 0 ? yg[0].name : null, record_created: kid.created_at }],
  };

  const details = await rows(service.from("pupil_details").select("*").eq("child_id", childId));
  sections.pupil_details = {
    title: "Pupil information (including health and consents)",
    rows: details.map((d) => omit(d, ["id", "child_id", "updated_by", "completed_by"])),
  };

  const contacts = await rows(
    service.from("pupil_emergency_contacts").select("name, relationship, is_authorised_collector, parental_responsibility, priority").eq("child_id", childId).order("priority", { ascending: true }),
  );
  sections.contacts = {
    title: "Emergency contacts on file",
    note: "Telephone numbers and email addresses of the contacts are third-party data and are not included.",
    rows: contacts,
  };

  const enrol = await rows(service.from("enrolments").select("created_at, classes(name)").eq("child_id", childId));
  sections.enrolments = { title: "Class enrolments", rows: enrol.map((e) => ({ class: nested(e, "classes", "name"), enrolled: e.created_at })) };

  const att = await rows(service.from("attendance_records").select("status, marked_at, note, lesson_instances(date)").eq("child_id", childId).order("marked_at", { ascending: true }));
  sections.attendance = { title: "Attendance", rows: att.map((a) => ({ lesson_date: nested(a, "lesson_instances", "date"), status: a.status, marked_at: a.marked_at, note: a.note })) };

  const abs = await rows(service.from("absence_notices").select("reason, created_at, lesson_instances(date)").eq("child_id", childId).order("created_at", { ascending: true }));
  sections.absence_notices = { title: "Absence notices from home", rows: abs.map((a) => ({ lesson_date: nested(a, "lesson_instances", "date"), reason: a.reason, sent: a.created_at })) };

  const beh = await rows(service.from("behaviour_records").select("occurred_on, kind, points, category, note, voided_at").eq("child_id", childId).order("occurred_on", { ascending: true }));
  sections.behaviour = {
    title: "Behaviour records",
    note: "The member of staff who recorded each entry is not shown. Notes are included as written and may need redaction if they mention other pupils.",
    rows: beh,
  };

  const reports = await rows(
    service.from("term_reports").select("status, overall_comment, subject_comments, narrative, released_at, created_at, terms(name)").eq("child_id", childId).order("created_at", { ascending: true }),
  );
  const subjects = await rows(service.from("subjects").select("id, name"));
  const subjectName = new Map(subjects.map((s) => [String(s.id), String(s.name)]));
  sections.reports = {
    title: "Term reports",
    note: "Authors and approvers are not shown.",
    rows: reports.map((r) => {
      const named: Row = {};
      const sc = r.subject_comments;
      if (sc && typeof sc === "object") for (const [k, v] of Object.entries(sc as Row)) named[subjectName.get(k) || k] = v;
      return { term: nested(r, "terms", "name"), status: r.status, overall_comment: r.overall_comment, subject_comments: named, summary: r.narrative, released_at: r.released_at };
    }),
  };

  const threads = await rows(service.from("message_threads").select("id, parent_id, teacher_id").eq("child_id", childId));
  sections.messages = await messageSection(threads);

  sections.signatures = await signaturesSection(studentProfileId);
  if (opts.includeAdmissions) {
    sections.admissions = await admissionsSection(parentEmail, String(kid.name), String(kid.dob), false);
  }
  if (opts.includeSafeguarding) sections.safeguarding = await safeguardingSection(childId);

  return { sections, child: kid, parentEmail };
}

async function parentSections(profileId: string, opts: { includeChildRecords: boolean; includeSafeguarding: boolean }): Promise<{ sections: Sections; label: string }> {
  const profs = await rows(service.from("profiles").select("id, full_name, email, timezone, created_at").eq("id", profileId));
  if (profs.length === 0) throw new Error("not_found");
  const p = profs[0];
  const sections: Sections = {};

  const roles = await rows(service.from("user_roles").select("role").eq("user_id", profileId));
  sections.profile = {
    title: "Account profile",
    rows: [{ name: p.full_name, email: p.email, timezone: p.timezone, account_created: p.created_at, roles: [...new Set(roles.map((r) => r.role))].join(", ") }],
  };

  const kids = await rows(service.from("children").select("id, name, dob").eq("parent_user_id", profileId).order("name"));
  sections.children = { title: "Children linked to this account", note: "Names and dates of birth only. Use the pupil export (or include child records) for their school records.", rows: kids.map((k) => ({ name: k.name, date_of_birth: k.dob })) };

  const threads = await rows(service.from("message_threads").select("id, parent_id, teacher_id").eq("parent_id", profileId));
  sections.messages = await messageSection(threads);
  sections.signatures = await signaturesSection(profileId);
  sections.admissions = await admissionsSection(String(p.email), null, null, true);

  if (opts.includeChildRecords) {
    for (const k of kids) {
      const r = await pupilSections(String(k.id), { includeSafeguarding: opts.includeSafeguarding, includeAdmissions: false });
      for (const [key, sec] of Object.entries(r.sections)) {
        if (key === "messages" || key === "signatures") continue; // the parent's own messages/signatures are already above
        sections[`child_${String(k.id).slice(0, 8)}_${key}`] = { ...sec, title: `${String(k.name)}: ${sec.title}` };
      }
    }
  }
  return { sections, label: String(p.full_name) };
}

// ── rendering ─────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return esc(JSON.stringify(v));
  return esc(v);
}

function renderHtml(subject: Row, sections: Sections, exclusions: string[], generatedAt: string): string {
  const body = Object.values(sections)
    .map((s) => {
      const cols = [...new Set(s.rows.flatMap((r) => Object.keys(r)))];
      const table =
        s.rows.length === 0
          ? `<p class="none">No records held in this category.</p>`
          : `<table><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${s.rows
              .map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join("")}</tr>`)
              .join("")}</tbody></table>`;
      return `<section><h2>${esc(s.title)} <small>(${s.rows.length})</small></h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}${table}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Subject access export</title>
<style>
body{font-family:Georgia,serif;color:#1b1e21;max-width:960px;margin:2rem auto;padding:0 1rem;line-height:1.45}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}small{color:#777;font-weight:normal}
table{border-collapse:collapse;width:100%;font-size:.85rem}th,td{border:1px solid #ddd;padding:.3rem .5rem;text-align:left;vertical-align:top}th{background:#faf6ea;text-transform:capitalize}
.warn{background:#fff4e5;border:1px solid #e0b060;padding:.75rem 1rem;border-radius:8px}.note{color:#555;font-size:.85rem}.none{color:#777}
@media print{.warn{border-color:#999}}
</style></head><body>
<h1>Subject access export</h1>
<p><strong>${esc(subject.type === "pupil" ? "Pupil" : "Parent / carer")}:</strong> ${esc(subject.label)}<br>
<strong>Prepared:</strong> ${esc(generatedAt)} by ${esc(subject.generated_by)}</p>
<div class="warn"><strong>Review before release.</strong> This bundle was assembled automatically. Third-party personal data and information that may be exempt from disclosure have been left out or reduced as listed below, but a person must check it before it is sent to the requester.
<ul>${exclusions.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
${body}
</body></html>`;
}

// ── handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const user = userData?.user;
  if (!user) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: isHeadOrAdmin } = await caller.rpc("current_has_role", { roles: ["head_teacher", "admin"] });
  if (isHeadOrAdmin !== true) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const subjectType = body.subject_type === "parent" ? "parent" : body.subject_type === "pupil" ? "pupil" : null;
  const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
  const requestId = typeof body.request_id === "string" && UUID_RE.test(body.request_id) ? body.request_id : null;
  const includeChildRecords = body.include_child_records === true;
  const includeSafeguarding = body.include_safeguarding === true;
  if (!subjectType || !UUID_RE.test(subjectId)) return jsonResponse({ ok: false, error: "invalid_subject" }, 400);

  if (includeSafeguarding) {
    const { data: isHead } = await caller.rpc("current_has_role", { roles: ["head_teacher"] });
    const { data: isLead } = await caller.rpc("current_has_permission", { perm: "safeguarding_lead" });
    if (isHead !== true && isLead !== true) {
      return jsonResponse({ ok: false, error: "safeguarding_forbidden", detail: "Only the Headteacher or a Safeguarding Lead can include safeguarding content." }, 403);
    }
  }

  try {
    const { data: actorRow } = await service.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
    const actorEmail = (actorRow as { email?: string } | null)?.email || user.email || null;
    const actorName = (actorRow as { full_name?: string } | null)?.full_name || actorEmail || "School administrator";

    let sections: Sections;
    let label: string;
    let profileId: string | null = null;
    let childId: string | null = null;

    if (subjectType === "pupil") {
      const r = await pupilSections(subjectId, { includeSafeguarding, includeAdmissions: true });
      sections = r.sections;
      label = String(r.child.name);
      childId = subjectId;
    } else {
      const r = await parentSections(subjectId, { includeChildRecords, includeSafeguarding });
      sections = r.sections;
      label = r.label;
      profileId = subjectId;
    }

    const generatedAt = new Date().toISOString();
    const exclusions = [
      "Names of staff who wrote, marked or approved records (replaced by their role or removed).",
      "Other pupils and parents, including emergency contacts' phone numbers and email addresses.",
      "Internal staff notes and decision notes on admissions.",
      "Internal safeguarding keyword flags on messages.",
      includeSafeguarding
        ? "Safeguarding concern summaries ARE included at an authorised person's request; reporter identities, actions and referral details are not."
        : "Safeguarding concern content (not included unless an authorised person asks for it).",
      "Categories not listed in this bundle (for example homework marks, fees and lesson recordings) are not covered and must be gathered separately if the request asks for them.",
    ];
    const counts: Record<string, number> = {};
    for (const [k, s] of Object.entries(sections)) counts[k] = s.rows.length;

    const subject: Row = { type: subjectType, label, generated_by: actorName };
    const json = JSON.stringify({ generated_at: generatedAt, subject, exclusions, sections }, null, 2);
    const html = renderHtml(subject, sections, exclusions, generatedAt);

    const logId = crypto.randomUUID();
    const bucket = service.storage.from(BUCKET);
    const up1 = await bucket.upload(`${logId}/subject-access.json`, new Blob([json], { type: "application/json" }), { contentType: "application/json", upsert: false });
    const up2 = await bucket.upload(`${logId}/subject-access.html`, new Blob([html], { type: "text/html" }), { contentType: "text/html", upsert: false });
    if (up1.error || up2.error) {
      await bucket.remove([`${logId}/subject-access.json`, `${logId}/subject-access.html`]);
      return jsonResponse({ ok: false, error: "upload_failed", detail: (up1.error || up2.error)?.message }, 500);
    }

    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000).toISOString();
    const { error: logErr } = await service.from("data_export_log").insert({
      id: logId,
      subject_type: subjectType,
      subject_profile_id: profileId,
      subject_child_id: childId,
      subject_label: label,
      include_child_records: includeChildRecords,
      include_safeguarding: includeSafeguarding,
      requested_by: user.id,
      data_rights_request_id: requestId,
      sections: counts,
      storage_prefix: logId,
      expires_at: expiresAt,
    });
    if (logErr) {
      await bucket.remove([`${logId}/subject-access.json`, `${logId}/subject-access.html`]);
      return jsonResponse({ ok: false, error: "log_failed", detail: logErr.message }, 500);
    }

    await service.from("audit_log").insert({
      actor_id: user.id,
      actor_email: actorEmail,
      action: "SUBJECT_ACCESS_EXPORT",
      target_table: "data_export_log",
      target_id: logId,
      changes: { subject_type: subjectType, subject_id: subjectId, include_child_records: includeChildRecords, include_safeguarding: includeSafeguarding, request_id: requestId, record_counts: counts },
    });

    const jsonUrl = await bucket.createSignedUrl(`${logId}/subject-access.json`, LINK_SECONDS);
    const htmlUrl = await bucket.createSignedUrl(`${logId}/subject-access.html`, LINK_SECONDS);
    if (jsonUrl.error || htmlUrl.error) return jsonResponse({ ok: false, error: "sign_failed" }, 500);

    // Best effort: clear out older bundles whose links have expired.
    await purgeExpiredExports(service as SupabaseClient).catch(() => 0);

    return jsonResponse({
      ok: true,
      export_id: logId,
      expires_at: expiresAt,
      counts,
      files: [
        { name: "subject-access.html", label: "Readable summary (HTML)", url: htmlUrl.data.signedUrl },
        { name: "subject-access.json", label: "Full data (JSON)", url: jsonUrl.data.signedUrl },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "not_found") return jsonResponse({ ok: false, error: "not_found" }, 404);
    return jsonResponse({ ok: false, error: "export_failed", detail: msg.slice(0, 300) }, 500);
  }
});
