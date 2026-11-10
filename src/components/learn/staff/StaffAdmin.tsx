"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, useLearnSession, type LearnRole } from "@/lib/learn/session";
import { dueState, trainingDue, type DueState, type Vetting } from "@/lib/learn/staffProfiles";
import { StaffProfileForm } from "@/components/learn/staff/StaffProfileForm";
import { Tabs } from "@/components/learn/Tabs";
import { SencoToggle } from "@/components/learn/send/SencoToggle";
import { ukToday } from "@/lib/learn/ukTime";
import { btn, FormSection, ui } from "@/components/learn/ui";

import { askConfirm } from "@/components/learn/kit";
import { PhoneInput } from "@/components/ui/PhoneInput";
type StaffRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  roles: LearnRole[];
  active: boolean;
  is_dsl: boolean;
};
type DirectoryRow = { user_id: string; full_name: string; email: string | null; phone: string | null; display_title: string | null; roles: string[]; active: boolean; is_dsl: boolean };

const STAFF_ROLE_LIST: LearnRole[] = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco"];
/** Roles the Headteacher can switch on/off here (head_teacher itself is never changed from this screen). */
const EDITABLE_ROLES: LearnRole[] = ["teacher", "teaching_assistant_cover", "senco", "admissions", "admin"];

function errText(e: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): string {
  if (!e) return "unknown error";
  return [e.message, e.code ? `(${e.code})` : "", e.hint || ""].filter(Boolean).join(" ");
}

const VETTING_COLUMNS = "user_id, dbs_check_date, dbs_renewal_due, right_to_work_verified, safeguarding_training_date, start_date";
const INPUT = `mt-1 ${ui.input}`;

const STATE_STYLE: Record<DueState, string> = {
  none: "bg-cream text-ink/65",
  ok: "bg-green-50 text-green-800",
  soon: "bg-amber-50 text-amber-900",
  overdue: "bg-red-50 text-red-800",
};

function fmt(d: string | null): string {
  return d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "not recorded";
}

/** Warnings for one member of staff: what is missing, due soon or overdue. */
function warningsFor(v: Vetting | undefined, now: number): { text: string; state: DueState }[] {
  const out: { text: string; state: DueState }[] = [];
  if (!v) return [{ text: "No compliance record", state: "overdue" }];
  const dbs = dueState(v.dbs_renewal_due, now);
  if (!v.dbs_check_date) out.push({ text: "DBS check not recorded", state: "overdue" });
  else if (dbs === "overdue") out.push({ text: "DBS renewal overdue", state: "overdue" });
  else if (dbs === "soon") out.push({ text: "DBS renewal due soon", state: "soon" });
  const due = trainingDue(v.safeguarding_training_date);
  const tr = dueState(due, now);
  if (!v.safeguarding_training_date) out.push({ text: "Safeguarding training not recorded", state: "overdue" });
  else if (tr === "overdue") out.push({ text: "Safeguarding training overdue", state: "overdue" });
  else if (tr === "soon") out.push({ text: "Safeguarding training due soon", state: "soon" });
  if (!v.right_to_work_verified) out.push({ text: "Right to work not verified", state: "overdue" });
  return out;
}

function ComplianceForm({ person, record, onSaved }: { person: StaffRow; record: Vetting | undefined; onSaved: () => void }) {
  const [form, setForm] = useState({
    dbs_check_date: record?.dbs_check_date || "",
    dbs_renewal_due: record?.dbs_renewal_due || "",
    safeguarding_training_date: record?.safeguarding_training_date || "",
    start_date: record?.start_date || "",
    right_to_work_verified: record?.right_to_work_verified || false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const trainingNext = trainingDue(form.safeguarding_training_date || null);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        user_id: person.user_id,
        dbs_check_date: form.dbs_check_date || null,
        dbs_renewal_due: form.dbs_renewal_due || null,
        safeguarding_training_date: form.safeguarding_training_date || null,
        start_date: form.start_date || null,
      };
      // Only stamp who/when when the flag actually changes, so an unrelated
      // edit never re-attributes an earlier right-to-work check.
      if (form.right_to_work_verified !== (record?.right_to_work_verified || false)) {
        payload.right_to_work_verified = form.right_to_work_verified;
        payload.right_to_work_verified_by = form.right_to_work_verified ? user?.id ?? null : null;
        payload.right_to_work_verified_date = form.right_to_work_verified ? ukToday() : null;
      }
      const { error } = await supabase.from("staff_vetting_records").upsert(payload, { onConflict: "user_id" });
      if (error) setMsg({ kind: "err", text: `Couldn't save the compliance dates: ${errText(error)}` });
      else {
        setMsg({ kind: "ok", text: "Compliance dates saved." });
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  };

  const tState = dueState(trainingNext, now);

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">Internal only. Families, students and teachers never see these records. The full checklist (references, qualification checks) is on the Single Central Record under Compliance.</p>
      <FormSection title="Vetting and training" description="DBS dates, the annual safeguarding refresher, start date and right to work.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="c-dbs">
              DBS check date
            </label>
            <input id="c-dbs" type="date" className={INPUT} value={form.dbs_check_date} onChange={(e) => set("dbs_check_date", e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="c-dbs-renew">
              DBS renewal due
            </label>
            <input id="c-dbs-renew" type="date" className={INPUT} value={form.dbs_renewal_due} onChange={(e) => set("dbs_renewal_due", e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="c-train">
              Safeguarding training date
            </label>
            <input id="c-train" type="date" className={INPUT} value={form.safeguarding_training_date} onChange={(e) => set("safeguarding_training_date", e.target.value)} />
            {trainingNext && <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[tState]}`}>Annual refresher due {fmt(trainingNext)}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="c-start">
              Start date
            </label>
            <input id="c-start" type="date" className={INPUT} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.right_to_work_verified} onChange={(e) => set("right_to_work_verified", e.target.checked)} />
          Right to work verified
        </label>
      </FormSection>

      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
          {msg.text}
        </p>
      )}
      <button type="button" onClick={save} disabled={busy} className={btn("primary")}>
        {busy ? "Saving…" : "Save compliance dates"}
      </button>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-teal-700" : "bg-ink/25"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Edit a member of staff: name, email on file, phone, title, roles, active, and the Designated Safeguarding Lead switch. */
function DetailsForm({ person, canEditRoles, canSetDsl, isSelf, onSaved }: { person: StaffRow; canEditRoles: boolean; canSetDsl: boolean; isSelf: boolean; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ full_name: person.full_name === "Unnamed" ? "" : person.full_name, email: person.email || "", phone: person.phone || "", title: person.title || "", active: person.active });
  const [roles, setRoles] = useState<LearnRole[]>(person.roles);
  const [busy, setBusy] = useState(false);
  const [dslBusy, setDslBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dslMsg, setDslMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleRole = (r: LearnRole) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  const rolesChanged = EDITABLE_ROLES.some((r) => roles.includes(r) !== person.roles.includes(r));

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!form.full_name.trim()) return setMsg({ kind: "err", text: "Please enter a name." });
    setBusy(true);
    setMsg(null);
    try {
      const upd = await supabase.rpc("admin_update_staff", {
        p_user: person.user_id,
        p_full_name: form.full_name,
        p_email: form.email,
        p_phone: form.phone,
        p_title: form.title,
        p_active: form.active,
      });
      if (upd.error) return setMsg({ kind: "err", text: `Couldn't save details: ${errText(upd.error)}` });
      if (canEditRoles && rolesChanged) {
        const r = await supabase.rpc("admin_set_staff_roles", { p_user: person.user_id, p_roles: roles.filter((x) => EDITABLE_ROLES.includes(x)) });
        if (r.error) return setMsg({ kind: "err", text: `Details saved, but the roles couldn't be changed: ${errText(r.error)}` });
      }
      setMsg({ kind: "ok", text: "Saved." });
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  const setDsl = async (on: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!on && !(await askConfirm(`Remove ${person.full_name} as a Designated Safeguarding Lead? The school must always have at least one.`))) return;
    setDslBusy(true);
    setDslMsg(null);
    const { error } = await supabase.rpc("set_safeguarding_lead", { p_user: person.user_id, p_on: on });
    setDslBusy(false);
    if (error) return setDslMsg({ kind: "err", text: errText(error) });
    setDslMsg({ kind: "ok", text: on ? `${person.full_name} is now a Designated Safeguarding Lead.` : `${person.full_name} is no longer a Designated Safeguarding Lead.` });
    await onSaved();
  };

  return (
    <div className="space-y-5">
      <FormSection title="Name and contact" description="How their name appears to families, and how the school reaches them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="sd-name">Full name</label>
            <input id="sd-name" className={INPUT} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="sd-title">Title (Mr, Mrs, Ustadh…)</label>
            <input id="sd-title" className={INPUT} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={20} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="sd-email">Email on file</label>
            <input id="sd-email" type="email" className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} />
            <p className="mt-1 text-xs text-ink/65">Changes the email held on their record. Their sign-in email only changes through an account reset.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="sd-phone">Phone</label>
            <PhoneInput id="sd-phone" value={form.phone} onChange={(v) => set("phone", v)} inputClassName={ui.input} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Roles and status" description="What they can see and do in the portal. Save details keeps this section and the one above.">
        <fieldset>
          <legend className="sr-only">Roles</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
            {person.roles.includes("head_teacher") && <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900">Headteacher</span>}
            {EDITABLE_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="checkbox" checked={roles.includes(r)} disabled={!canEditRoles} onChange={() => toggleRole(r)} />
                {learnRoleLabel(r)}
              </label>
            ))}
          </div>
          {!canEditRoles && <p className="mt-1 text-xs text-ink/65">Only the Headteacher can change roles.</p>}
          {canEditRoles && <p className="mt-1 text-xs text-ink/65">Removing a role removes every class it was granted for.</p>}
        </fieldset>

        <div className="flex items-center gap-3">
          <Toggle id="sd-active" checked={form.active} onChange={(v) => set("active", v)} label="Active" disabled={isSelf} />
          <label htmlFor="sd-active" className="text-sm text-ink">
            {form.active ? "Active" : "Inactive"}
            <span className="block text-xs text-ink/65">Inactive staff are not offered in message lists or parent evenings. {isSelf ? "You can't make your own account inactive." : ""}</span>
          </label>
        </div>

        {msg && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
            {msg.text}
          </p>
        )}
        <button type="button" onClick={save} disabled={busy} className={btn("primary")}>
          {busy ? "Saving…" : "Save details"}
        </button>
      </FormSection>

      <FormSection title="Safeguarding and SEND" description="These switches save as soon as you change them.">
        <div className="rounded-xl border border-gold-light bg-cream/40 p-4">
          <div className="flex items-center gap-3">
            <Toggle id="sd-dsl" checked={person.is_dsl} onChange={(v) => void setDsl(v)} label="Designated Safeguarding Lead" disabled={!canSetDsl || dslBusy} />
            <label htmlFor="sd-dsl" className="text-sm font-semibold text-ink">
              Designated Safeguarding Lead
            </label>
          </div>
          <p className="mt-2 text-xs text-ink/65">
            A Designated Safeguarding Lead receives reported concerns, can read the safeguarding log and sees flagged messages. There can be more than one: switch this on for a deputy too. The school must always have at least one.
            {!canSetDsl ? " Only the Headteacher can change this." : ""}
          </p>
          {dslMsg && (
            <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${dslMsg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
              {dslMsg.text}
            </p>
          )}
        </div>

        {/* The Staff page is Headteacher/admin only, and set_senco re-checks. */}
        <SencoToggle userId={person.user_id} name={person.full_name} canSet />
      </FormSection>
    </div>
  );
}

/** Admin staff page: every member of staff with expiry warnings; open one to edit their public profile and internal compliance dates. */
export function StaffAdmin({ initialUserId }: { initialUserId?: string }) {
  const { session, roles: myRoles } = useLearnSession();
  const myId = session && session !== "loading" ? session.user.id : null;
  const isHead = myRoles.some((r) => r.role === "head_teacher");
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [records, setRecords] = useState<Record<string, Vetting>>({});
  const [selected, setSelected] = useState<string | null>(initialUserId || null);
  const [tab, setTab] = useState<"details" | "profile" | "compliance">("details");
  // Each query reports its own failure, with the real message, so one bad query never blanks the page.
  const [problems, setProblems] = useState<string[]>([]);
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  // Wide screens show the editor beside the list; on phones it opens right
  // under the person tapped, instead of below the whole list.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const found: string[] = [];

    // 1. The staff list: the admin_staff_directory() RPC (0085). If it isn't
    //    available, fall back to two plain queries (roles, then profiles) with no embed.
    let rows: StaffRow[] | null = null;
    const dir = await supabase.rpc("admin_staff_directory");
    if (!dir.error) {
      rows = ((dir.data as DirectoryRow[] | null) || []).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        title: r.display_title,
        roles: (r.roles ?? []).filter((x): x is LearnRole => (STAFF_ROLE_LIST as string[]).includes(x)),
        active: r.active,
        is_dsl: r.is_dsl,
      }));
    } else {
      found.push(`Staff directory: ${errText(dir.error)}`);
      const rolesRes = await supabase.from("user_roles").select("user_id, role").in("role", STAFF_ROLE_LIST);
      if (rolesRes.error) {
        found.push(`Staff roles: ${errText(rolesRes.error)}`);
      } else {
        const roleRows = (rolesRes.data as unknown as { user_id: string; role: string }[]) || [];
        const ids = Array.from(new Set(roleRows.map((r) => r.user_id)));
        const profRes = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [], error: null };
        if (profRes.error) found.push(`Staff names: ${errText(profRes.error)}`);
        const profById = new Map(((profRes.data as { id: string; full_name: string | null; email: string | null }[] | null) || []).map((p) => [p.id, p]));
        const byUser = new Map<string, StaffRow>();
        for (const r of roleRows) {
          const pr = profById.get(r.user_id);
          const existing = byUser.get(r.user_id);
          if (existing) {
            if (!existing.roles.includes(r.role as LearnRole)) existing.roles.push(r.role as LearnRole);
          } else {
            byUser.set(r.user_id, { user_id: r.user_id, full_name: pr?.full_name || "Unnamed", email: pr?.email ?? null, phone: null, title: null, roles: [r.role as LearnRole], active: true, is_dsl: false });
          }
        }
        rows = Array.from(byUser.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
      }
    }
    setStaff(rows || []);

    // 2. Compliance records (staff_vetting_records), independent of the list.
    const vettingRes = await supabase.from("staff_vetting_records").select(VETTING_COLUMNS);
    if (vettingRes.error) found.push(`Compliance records: ${errText(vettingRes.error)}`);
    const map: Record<string, Vetting> = {};
    for (const v of (vettingRes.data as Vetting[] | null) || []) map[v.user_id] = v;
    setRecords(map);
    setProblems(found);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const warnings = useMemo(() => {
    const m: Record<string, { text: string; state: DueState }[]> = {};
    for (const s of staff || []) m[s.user_id] = warningsFor(records[s.user_id], now);
    return m;
  }, [staff, records, now]);

  const person = (staff || []).find((s) => s.user_id === selected) || null;
  const flagged = (staff || []).filter((s) => warnings[s.user_id]?.length).length;
  const q = query.trim().toLowerCase();
  const shownStaff = (staff || []).filter((s) => !q || `${s.full_name} ${s.email || ""} ${s.roles.map((r) => learnRoleLabel(r)).join(" ")}`.toLowerCase().includes(q));

  const details = person ? (
    <div>
      <h2 className="text-lg font-semibold text-ink">{person.full_name}</h2>
      <p className="text-sm text-ink/65">{[person.roles.map((r) => learnRoleLabel(r)).join(", "), person.email].filter(Boolean).join(" · ")}</p>
      {(warnings[person.user_id] || []).length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Compliance warnings">
          {warnings[person.user_id].map((w) => (
            <li key={w.text} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[w.state]}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}
      <Tabs
        variant="switch"
        fill
        items={[
          { key: "details", label: "Edit details" },
          { key: "profile", label: "Public profile" },
          { key: "compliance", label: "Compliance" },
        ]}
        value={tab}
        onChange={setTab}
        label="Staff sections"
        className="mt-4"
      />
      <div className="mt-5">
        {tab === "details" ? (
          <DetailsForm key={person.user_id} person={person} canEditRoles={isHead} canSetDsl={isHead} isSelf={person.user_id === myId} onSaved={load} />
        ) : tab === "profile" ? (
          <StaffProfileForm key={person.user_id} userId={person.user_id} fullName={person.full_name} />
        ) : (
          <ComplianceForm key={person.user_id} person={person} record={records[person.user_id]} onSaved={load} />
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section aria-label="Staff list" className="rounded-2xl border border-gold-light bg-white">
        <div className="border-b border-gold-light px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Staff</h2>
          {staff && <p className="text-xs text-ink/65">{flagged === 0 ? "All compliance dates are up to date." : `${flagged} with compliance items to check.`}</p>}
          {staff && (
            <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">
              <span className="font-semibold">Designated Safeguarding Lead: </span>
              {staff.filter((x) => x.is_dsl).map((x) => x.full_name).join(", ") || "none assigned"}
            </p>
          )}
        </div>
        {problems.length > 0 && (
          <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-semibold">Some information couldn&apos;t be loaded:</p>
            <ul className="mt-1 list-disc pl-4">
              {problems.map((p) => (
                <li key={p} className="break-words">{p}</li>
              ))}
            </ul>
            <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline">
              Try again
            </button>
          </div>
        )}
        {staff && staff.length > 8 && (
          <div className="border-b border-gold-light/60 px-4 py-2">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff" aria-label="Search staff" className={INPUT.replace("mt-1 ", "")} />
          </div>
        )}
        {staff === null ? (
          <div role="status" className="m-4 h-24 rounded-xl bg-cream motion-safe:animate-pulse" aria-label="Loading staff" />
        ) : staff.length === 0 ? (
          problems.length > 0 ? (
            <p className="p-4 text-sm text-red-800">Couldn&apos;t load staff.</p>
          ) : (
            <p className="p-4 text-sm text-ink/70">No staff yet. Add teachers and office staff in People, then their profiles appear here.</p>
          )
        ) : (
          <ul className="divide-y divide-gold-light/50">
            {q && shownStaff.length === 0 && <li className="px-4 py-3 text-sm text-ink/65">Nobody matches &quot;{query}&quot;.</li>}
            {shownStaff.map((s) => {
              const w = warnings[s.user_id] || [];
              const worst: DueState = w.some((x) => x.state === "overdue") ? "overdue" : w.length ? "soon" : "ok";
              return (
                <li key={s.user_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(!wide && selected === s.user_id ? null : s.user_id)}
                    aria-current={selected === s.user_id ? "true" : undefined}
                    aria-expanded={wide ? undefined : selected === s.user_id}
                    className={`block w-full px-4 py-3 text-left hover:bg-cream ${selected === s.user_id ? "bg-cream" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{s.full_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[worst]}`}>{worst === "ok" ? "Up to date" : `${w.length} to check`}</span>
                    </span>
                    <span className="block text-xs text-ink/65">
                      {s.roles.map((r) => learnRoleLabel(r)).join(", ")}
                      {s.is_dsl ? " · Safeguarding Lead" : ""}
                      {!s.active ? " · Inactive" : ""}
                    </span>
                  </button>
                  {!wide && selected === s.user_id && <div className="border-t border-gold-light/60 bg-white p-4">{details}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {wide && (
        <section aria-label="Staff details" className="rounded-2xl border border-gold-light bg-white p-6">
          {details || <p className="text-sm text-ink/65">Choose a member of staff to edit their details, public profile and compliance dates.</p>}
        </section>
      )}
    </div>
  );
}
