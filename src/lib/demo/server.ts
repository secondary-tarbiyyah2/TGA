"use client";

// Portal demo only: answers every request the portal makes to "Supabase"
// (REST, RPC, auth, storage, edge functions) from the in-memory school. The
// demo client passes this as supabase-js's fetch, and window.fetch and
// XMLHttpRequest are pointed here for the demo host, so nothing leaves the
// browser.

import { matchRows, parseQuery, runSelect, tableColumns, type Row, type Tables } from "@/lib/demo/postgrest";
import { db, getRole, recordDelete, recordInsert, recordUpdate, whoAmI } from "@/lib/demo/store";
import { rpc } from "@/lib/demo/rpc";
import { edgeFunction } from "@/lib/demo/functions";

export const DEMO_URL = "https://demo.tga-portal.invalid";
export const DEMO_HOST = new URL(DEMO_URL).host;

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function demoSession() {
  const me = whoAmI();
  if (!me) return null;
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: me.userId, exp, role: "authenticated", aal: "aal1", email: me.email, session_id: "demo" })}.demo`;
  const user = { id: me.userId, aud: "authenticated", role: "authenticated", email: me.email, email_confirmed_at: "2026-09-01T09:00:00Z", phone: "", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: me.name }, identities: [], factors: [], created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z", last_sign_in_at: new Date().toISOString() };
  return { access_token: jwt, refresh_token: "demo-refresh", token_type: "bearer", expires_in: 3600 * 24 * 30, expires_at: exp, user };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const pgError = (message: string, code = "PGRST000", status = 400) => json({ message, code, details: null, hint: null }, status);

// ── row scoping, the demo's stand-in for RLS ─────────────────────────────
function myChildIds(): string[] {
  return whoAmI()?.childIds || [];
}
function threadIdsForMe(t: Tables, me: string): Set<string> {
  return new Set((t.message_thread_members || []).filter((m) => m.user_id === me).map((m) => String(m.thread_id)));
}
function scope(t: Tables, table: string, rows: Row[]): Row[] {
  const me = whoAmI();
  if (!me) return rows;
  const family = me.role === "parent" || me.role === "student";
  if (table === "message_threads" && me.role !== "head_teacher") {
    const mine = threadIdsForMe(t, me.userId);
    return rows.filter((r) => mine.has(String(r.id)));
  }
  if ((table === "message_thread_messages" || table === "message_thread_members") && me.role !== "head_teacher") {
    const mine = threadIdsForMe(t, me.userId);
    return rows.filter((r) => mine.has(String(r.thread_id)));
  }
  if (me.role === "teacher") {
    // A teacher's marking lists cover their own classes (RLS on homework).
    const mine = new Set((t.class_subject_teachers || []).filter((x) => x.teacher_id === me.userId).map((x) => String(x.class_id)));
    if (["homework", "homework_review_queue", "homework_attention", "homework_status"].includes(table)) return rows.filter((r) => mine.has(String(r.class_id)));
    if (table === "homework_submissions") {
      const hw = new Set((t.homework || []).filter((h) => mine.has(String(h.class_id))).map((h) => String(h.id)));
      return rows.filter((r) => hw.has(String(r.homework_id)));
    }
    return rows;
  }
  if (!family) return rows;
  const kids = new Set(myChildIds());
  if (table === "children") return rows.filter((r) => kids.has(String(r.id)));
  if (table === "announcements" || table === "class_materials" || table === "class_topics" || table === "homework" || table === "calendar_events" || table === "class_post_comments") {
    const myClasses = new Set((t.enrolments || []).filter((e) => kids.has(String(e.child_id))).map((e) => String(e.class_id)));
    return rows.filter((r) => r.class_id == null || myClasses.has(String(r.class_id)));
  }
  if (table === "user_roles" || table === "user_permissions" || table === "portal_prefs" || table === "notification_reads" || table === "message_prefs") return rows.filter((r) => r.user_id === me.userId);
  if (table === "fee_accounts" || table === "fee_charges" || table === "absence_notes" || table === "withdrawal_notices") return rows.filter((r) => r.parent_user_id === me.userId || (r.child_id != null && kids.has(String(r.child_id))));
  if (table === "fee_payments") {
    const charges = new Set((t.fee_charges || []).filter((c) => c.parent_user_id === me.userId).map((c) => String(c.id)));
    return rows.filter((r) => charges.has(String(r.charge_id)));
  }
  if (table === "term_reports") return rows.filter((r) => kids.has(String(r.child_id)) && r.status === "released");
  if (table === "student_accounts" || table === "student_logins") return rows.filter((r) => kids.has(String(r.child_id)));
  if (table === "safeguarding_concerns" || table === "safeguarding_chronology" || table === "safeguarding_reviews") return [];
  if (table === "send_support_plans" || table === "send_plan_targets" || table === "send_plan_reviews") return rows.filter((r) => kids.has(String(r.child_id)) && (table !== "send_support_plans" || r.status === "active"));
  if (table === "homework_submissions" || table === "assessments" || table === "behaviour_records" || table === "quran_progress" || table === "quran_targets") return rows.filter((r) => kids.has(String(r.child_id)));
  const sample = rows[0];
  if (sample && "child_id" in sample && !["star_of_the_week", "message_threads"].includes(table)) return rows.filter((r) => r.child_id == null || kids.has(String(r.child_id)));
  return rows;
}

// ── views, worked out from the tables each time ───────────────────────────
function computeViews(t: Tables, table: string): Row[] | null {
  const nowIso = new Date().toISOString();
  const by = <T extends Row>(rows: T[] | undefined, key: string) => new Map((rows || []).map((r) => [String(r[key]), r]));
  switch (table) {
    case "homework_status": {
      const out: Row[] = [];
      const subs = t.homework_submissions || [];
      for (const h of t.homework || []) {
        for (const e of (t.enrolments || []).filter((e) => e.class_id === h.class_id)) {
          const assigned = h.assigned_child_ids as string[] | null;
          if (assigned && !assigned.includes(String(e.child_id))) continue;
          const s = subs.find((x) => x.homework_id === h.id && x.child_id === e.child_id);
          const submitted = (s?.submitted_at as string | null) || null;
          const status = !submitted && nowIso > String(h.due_at) ? "missing" : submitted && submitted > String(h.due_at) ? "late" : submitted ? "on_time" : "not_yet_due";
          out.push({ homework_id: h.id, class_id: h.class_id, due_at: h.due_at, child_id: e.child_id, submission_id: s?.id ?? null, submitted_at: submitted, status });
        }
      }
      return out;
    }
    case "homework_review_queue": {
      const hw = by(t.homework, "id");
      const classes = by(t.classes, "id");
      const kids = by(t.children, "id");
      return (t.homework_submissions || [])
        .filter((s) => s.submitted_at && hw.get(String(s.homework_id)) && !hw.get(String(s.homework_id))!.archived_at)
        .filter((s) => !(t.homework_marks || []).some((m) => m.submission_id === s.id && m.released))
        .filter((s) => !(t.homework_feedback || []).some((f) => f.submission_id === s.id && ["feedback_given", "resubmission_requested", "returned"].includes(String(f.status))))
        .map((s) => {
          const h = hw.get(String(s.homework_id))!;
          return { submission_id: s.id, homework_id: h.id, homework_title: h.title, class_id: h.class_id, class_name: classes.get(String(h.class_id))?.name ?? null, child_id: s.child_id, child_name: kids.get(String(s.child_id))?.name ?? null, due_at: h.due_at, submitted_at: s.submitted_at, is_late: String(s.submitted_at) > String(h.due_at) };
        });
    }
    case "homework_attention": {
      const status = computeViews(t, "homework_status") || [];
      const hw = by(t.homework, "id");
      const classes = by(t.classes, "id");
      const kids = by(t.children, "id");
      return status
        .map((s) => ({ s, f: (t.homework_feedback || []).find((f) => f.submission_id === s.submission_id) }))
        .filter(({ s, f }) => (s.status === "late" || s.status === "missing" || f?.status === "resubmission_requested") && !hw.get(String(s.homework_id))?.archived_at)
        .map(({ s, f }) => ({ homework_id: s.homework_id, homework_title: hw.get(String(s.homework_id))?.title, class_id: s.class_id, class_name: classes.get(String(s.class_id))?.name ?? null, due_at: s.due_at, child_id: s.child_id, child_name: kids.get(String(s.child_id))?.name ?? null, submission_id: s.submission_id, submitted_at: s.submitted_at, attention: f?.status === "resubmission_requested" ? "resubmission_requested" : s.status, resubmission_requested_at: f?.requested_at ?? null }));
    }
    case "fee_charges_finance": {
      const acc = by(t.fee_accounts, "id");
      const kids = by(t.children, "id");
      const yg = by(t.year_groups, "id");
      const apps = by(t.admissions_applications, "id");
      return (t.fee_charges || []).map((c) => {
        const a = acc.get(String(c.fee_account_id));
        const ch = kids.get(String(c.child_id));
        const ap = apps.get(String(c.application_id));
        const y = ch ? yg.get(String(ch.year_group_id)) : undefined;
        return { id: c.id, invoice_number: c.invoice_number, description: c.description, amount_pence: c.amount_pence, paid_pence: c.paid_pence, balance_pence: Math.max(Number(c.amount_pence) - Number(c.paid_pence), 0), due_date: c.due_date, status: c.status, kind: c.kind, plan: c.plan, instalment_no: c.instalment_no, instalment_count: c.instalment_count, created_at: c.created_at, voided_at: c.voided_at, waived_reason: c.waived_reason, fee_account_id: c.fee_account_id, family_reference: a?.reference ?? null, billing_name: a?.billing_name ?? null, billing_email: a?.billing_email ?? null, stripe_customer_id: null, child_id: c.child_id, child_name: ch?.name ?? null, pupil_number: ch?.pupil_number ?? null, year_group: y?.name ?? null, application_id: c.application_id, application_reference: ap?.reference ?? null, pupil_name: ch?.name ?? (ap ? `${ap.child_first_name} ${ap.child_last_name}` : null), year_group_label: y?.name ?? ap?.year_group_applying ?? null };
      });
    }
    case "my_outstanding_signatures": {
      const me = whoAmI();
      if (!me) return [];
      const myRoles = (t.user_roles || []).filter((r) => r.user_id === me.userId).map((r) => String(r.role));
      return (t.signable_documents || [])
        .filter((d) => d.requires_signature && (d.target_roles as string[]).some((r) => myRoles.includes(r)))
        .filter((d) => !(t.document_signatures || []).some((s) => s.document_id === d.id && s.signer_id === me.userId && s.asset_id_signed === d.current_asset_id))
        .map((d) => ({ document_id: d.id, title: d.title, current_asset_id: d.current_asset_id, file_url: d.file_url, body: d.body }));
    }
    case "outstanding_signatures": {
      const profiles = by(t.profiles, "id");
      const out: Row[] = [];
      for (const d of (t.signable_documents || []).filter((d) => d.requires_signature)) {
        const users = new Set((t.user_roles || []).filter((r) => (d.target_roles as string[]).includes(String(r.role))).map((r) => String(r.user_id)));
        for (const u of users) {
          if ((t.document_signatures || []).some((s) => s.document_id === d.id && s.signer_id === u && s.asset_id_signed === d.current_asset_id)) continue;
          const p = profiles.get(u);
          out.push({ user_id: u, full_name: p?.full_name ?? null, email: p?.email ?? null, document_id: d.id, title: d.title, current_asset_id: d.current_asset_id });
        }
      }
      return out;
    }
    case "document_signature_progress":
      return (t.signable_documents || [])
        .filter((d) => d.requires_signature)
        .map((d) => ({ document_id: d.id, required_count: new Set((t.user_roles || []).filter((r) => (d.target_roles as string[]).includes(String(r.role))).map((r) => r.user_id)).size, signed_count: new Set((t.document_signatures || []).filter((s) => s.document_id === d.id && s.asset_id_signed === d.current_asset_id).map((s) => s.signer_id)).size }));
    case "assessments_for_family":
      return (t.assessments || []).map((a) => ({ ...a }));
    case "year_group_places":
      return (t.year_groups || []).map((y) => {
        const classIds = new Set((t.classes || []).filter((c) => c.year_group_id === y.id).map((c) => c.id));
        const used = new Set((t.enrolments || []).filter((e) => classIds.has(e.class_id)).map((e) => e.child_id)).size;
        return { year_group_id: y.id, name: y.name, sort_order: y.sort_order, capacity: y.capacity, places_used: used, places_remaining: y.capacity != null ? Math.max(Number(y.capacity) - used, 0) : null };
      });
    case "bookable_staff":
      return (t.staff_members || []).filter((s) => s.bookable).map((s) => ({ id: s.id, display_name: s.display_name, role_title: s.role_title }));
    case "bursary_seats_public":
      return (t.site_settings || []).map((s) => ({ bursary_seats: s.bursary_seats }));
  }
  return null;
}

/** The tables as the signed-in person may see them (views worked out, rows scoped). */
export function visibleTables(): Tables {
  const t = db().tables;
  const memo = new Map<string, Row[]>();
  return new Proxy(t, {
    get(target, prop: string) {
      if (typeof prop !== "string") return undefined;
      const hit = memo.get(prop);
      if (hit) return hit;
      const view = computeViews(target, prop);
      const rows = scope(target, prop, view ?? target[prop] ?? []);
      memo.set(prop, rows);
      return rows;
    },
  });
}

// ── writes ────────────────────────────────────────────────────────────────
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${h()}${h()}-${h()}-4${h().slice(1)}-8${h().slice(1)}-${h()}${h()}${h()}`;
  }
}

function withDefaults(table: string, row: Row): Row {
  const cols = tableColumns(table);
  const now = new Date().toISOString();
  const out: Row = {};
  for (const c of cols) out[c] = null;
  if (cols.includes("id") || !cols.length) out.id = newId();
  for (const c of ["created_at", "updated_at", "submitted_at_default"]) if (cols.includes(c)) out[c] = now;
  const me = whoAmI();
  if (me) for (const c of ["created_by", "recorded_by", "author_id", "sender_id", "given_by", "marked_by", "entered_by", "nominated_by", "awarded_by", "uploaded_by", "submitted_by", "set_by", "added_by", "granted_by", "updated_by", "teacher_id"]) if (cols.includes(c) && out[c] == null) out[c] = me.userId;
  if (cols.includes("user_id") && me) out.user_id = me.userId;
  Object.assign(out, row);
  if (out.id == null && (cols.includes("id") || !cols.length)) out.id = newId();
  return out;
}

function conflictKeys(table: string, onConflict: string | null): string[] {
  if (onConflict) return onConflict.split(",").map((s) => s.trim());
  const cols = tableColumns(table);
  if (cols.includes("id")) return ["id"];
  if (cols.includes("user_id")) return ["user_id"];
  return [];
}

async function readBody(init?: RequestInit, req?: Request): Promise<unknown> {
  const body = init?.body ?? (req ? await req.clone().text() : null);
  if (body == null) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

async function rest(method: string, url: URL, headers: Headers, body: unknown): Promise<Response> {
  const parts = url.pathname.replace(/^\/rest\/v1\//, "").split("/");
  const prefer = headers.get("prefer") || "";
  const accept = headers.get("accept") || "";
  const single = accept.includes("vnd.pgrst.object");
  const wantCount = /count=(exact|planned|estimated)/.test(prefer);
  const head = method === "HEAD";

  if (parts[0] === "rpc") {
    const name = parts[1];
    const args = (method === "GET" || head ? Object.fromEntries(url.searchParams) : (body as Record<string, unknown>)) || {};
    const res = await rpc(name, args, visibleTables());
    if (res && typeof res === "object" && "__error" in (res as Row)) return pgError(String((res as Row).__error), "P0001");
    // An rpc returning rows can be filtered and shaped like a table.
    let data: unknown = res === undefined ? null : res;
    if (Array.isArray(data) && [...url.searchParams.keys()].some((k) => k !== "select")) {
      const q = parseQuery("__rpc", url.searchParams);
      data = runSelect({ __rpc: data as Row[] }, q);
    }
    if (single) {
      if (Array.isArray(data)) {
        if (data.length !== 1) return pgError("JSON object requested, multiple (or no) rows returned", "PGRST116", 406);
        data = data[0];
      }
    }
    return json(data, 200, wantCount && Array.isArray(data) ? { "content-range": `0-${Math.max(0, data.length - 1)}/${data.length}` } : {});
  }

  const table = parts[0];
  const t = db().tables;
  const vt = visibleTables();
  const q = parseQuery(table, url.searchParams);
  const returnRep = prefer.includes("return=representation");

  const respond = (rows: Row[], total?: number) => {
    const headersOut: Record<string, string> = {};
    if (wantCount || total !== undefined) {
      const n = total ?? rows.length;
      const start = q.offset || 0;
      headersOut["content-range"] = rows.length ? `${start}-${start + rows.length - 1}/${n}` : `*/${n}`;
    }
    if (head) return new Response(null, { status: 200, headers: headersOut });
    if (single) {
      if (rows.length !== 1) return pgError(rows.length ? "JSON object requested, multiple (or no) rows returned" : "JSON object requested, multiple (or no) rows returned", "PGRST116", 406);
      return json(rows[0], 200, headersOut);
    }
    return json(rows, 200, headersOut);
  };

  if (method === "GET" || head) {
    // Range header (supabase-js range()).
    const range = headers.get("range");
    if (range) {
      const [a, b] = range.split("-").map(Number);
      q.offset = a;
      q.limit = b - a + 1;
    }
    const all = runSelect(vt, { ...q, limit: undefined, offset: undefined });
    const off = q.offset || 0;
    const page = q.limit !== undefined ? all.slice(off, off + q.limit) : all.slice(off);
    return respond(page, wantCount ? all.length : undefined);
  }

  if (method === "POST") {
    const items = (Array.isArray(body) ? body : [body]).filter(Boolean) as Row[];
    const upsert = prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates");
    const ignore = prefer.includes("resolution=ignore-duplicates");
    const keys = conflictKeys(table, url.searchParams.get("on_conflict"));
    const out: Row[] = [];
    const inserted: Row[] = [];
    for (const item of items) {
      const existing = upsert && keys.length ? (t[table] || []).find((r) => keys.every((k) => item[k] !== undefined && String(r[k]) === String(item[k]))) : undefined;
      if (existing) {
        if (!ignore) {
          Object.assign(existing, item, tableColumns(table).includes("updated_at") ? { updated_at: new Date().toISOString() } : {});
          recordUpdate(table, [existing], item);
        }
        out.push(existing);
      } else {
        const row = withDefaults(table, item);
        (t[table] ||= []).push(row);
        inserted.push(row);
        out.push(row);
      }
    }
    if (inserted.length) recordInsert(table, inserted);
    if (!returnRep) return new Response(null, { status: 201 });
    const ids = new Set(out);
    const shaped = runSelect({ ...vtSnapshot(vt, table), [table]: (t[table] || []).filter((r) => ids.has(r)) }, { ...q, conds: [] });
    return respond(shaped);
  }

  if (method === "PATCH") {
    const rows = matchRows(vt, q).map((r) => (t[table] || []).find((x) => x === r || (r.id != null && x.id === r.id)) || r);
    const patch = (body || {}) as Row;
    const stamp = tableColumns(table).includes("updated_at") && !("updated_at" in patch) ? { updated_at: new Date().toISOString() } : {};
    for (const r of rows) Object.assign(r, patch, stamp);
    recordUpdate(table, rows, { ...patch, ...stamp });
    if (!returnRep) return new Response(null, { status: 204 });
    const ids = new Set(rows);
    return respond(runSelect({ ...vtSnapshot(vt, table), [table]: (t[table] || []).filter((r) => ids.has(r)) }, { ...q, conds: [] }));
  }

  if (method === "DELETE") {
    const rows = matchRows(vt, q).map((r) => (t[table] || []).find((x) => x === r || (r.id != null && x.id === r.id)) || r);
    const gone = new Set(rows);
    const before = runSelect({ ...vtSnapshot(vt, table), [table]: rows }, { ...q, conds: [] });
    t[table] = (t[table] || []).filter((r) => !gone.has(r));
    recordDelete(table, rows);
    if (!returnRep) return new Response(null, { status: 204 });
    return respond(before);
  }
  return pgError("method not allowed", "PGRST000", 405);
}

/** The scoped tables as a plain object (for shaping a write's result with embeds). */
function vtSnapshot(vt: Tables, table: string): Tables {
  void table;
  return new Proxy({} as Tables, { get: (_t, p: string) => vt[p] });
}

// ── auth ──────────────────────────────────────────────────────────────────
function auth(method: string, url: URL): Response {
  const p = url.pathname.replace(/^\/auth\/v1/, "");
  const s = demoSession();
  if (p.startsWith("/user")) return s ? json(s.user) : json({ message: "not signed in", code: "no_session" }, 401);
  if (p.startsWith("/token") || p.startsWith("/verify") || p.startsWith("/signup")) return s ? json(s) : json({ error: "invalid_grant", error_description: "Choose a role on the demo sign-in page" }, 400);
  if (p.startsWith("/logout")) return new Response(null, { status: 204 });
  if (p.startsWith("/otp") || p.startsWith("/recover") || p.startsWith("/resend")) return json({});
  if (p.startsWith("/factors")) return json({ all: [], totp: [], phone: [] });
  if (p.startsWith("/settings")) return json({ external: { email: true }, disable_signup: true, mailer_autoconfirm: false });
  void method;
  return json({});
}

// ── storage (only reached by uploads; signed URLs are made in ./client) ───
function storageApi(method: string, url: URL): Response {
  const p = url.pathname.replace(/^\/storage\/v1/, "");
  if (p.startsWith("/object/list/")) return json([]);
  if (p.startsWith("/object/sign/")) return json({ signedURL: `/object/sign/${p.slice(13)}?token=demo` });
  if (method === "POST" || method === "PUT") return json({ Key: p.replace(/^\/object\//, ""), Id: newId() });
  if (method === "DELETE") return json([]);
  return json({});
}

export async function handleDemoRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method || req?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers || req?.headers || {});
  // A short pause, so loading states show briefly as they would for real.
  await new Promise((r) => setTimeout(r, 15));
  try {
    if (url.pathname.startsWith("/rest/v1/")) return await rest(method, url, headers, method === "GET" || method === "HEAD" ? null : await readBody(init, req ?? undefined));
    if (url.pathname.startsWith("/auth/v1/")) return auth(method, url);
    if (url.pathname.startsWith("/storage/v1/")) return storageApi(method, url);
    if (url.pathname.startsWith("/functions/v1/")) {
      const name = url.pathname.replace(/^\/functions\/v1\//, "").split("/")[0];
      const body = await readBody(init, req ?? undefined);
      const out = await edgeFunction(name, (body && typeof body === "object" ? body : {}) as Record<string, unknown>, url, visibleTables());
      if (out instanceof Response) return out;
      return json(out);
    }
    return json({});
  } catch (e) {
    console.warn("[demo] request failed", url.pathname, e);
    return pgError(e instanceof Error ? e.message : "demo error", "XX000", 500);
  }
}

export function currentRole() {
  return getRole();
}
