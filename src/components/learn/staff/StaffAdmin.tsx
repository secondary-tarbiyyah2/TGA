"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { dueState, trainingDue, type DueState, type Vetting } from "@/lib/learn/staffProfiles";
import { StaffProfileForm } from "@/components/learn/staff/StaffProfileForm";

type StaffRow = { user_id: string; full_name: string; email: string | null; roles: LearnRole[] };
type RoleQuery = { user_id: string; role: LearnRole; profiles: { full_name: string; email: string | null } | null };

const VETTING_COLUMNS = "user_id, dbs_check_date, dbs_renewal_due, right_to_work_verified, safeguarding_training_date, start_date";
const INPUT = "mt-1 w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm text-ink";

const STATE_STYLE: Record<DueState, string> = {
  none: "bg-cream text-ink/60",
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
        payload.right_to_work_verified_date = form.right_to_work_verified ? new Date().toISOString().slice(0, 10) : null;
      }
      const { error } = await supabase.from("staff_vetting_records").upsert(payload, { onConflict: "user_id" });
      if (error) setMsg({ kind: "err", text: "Couldn't save. Only a Headteacher or Admin can edit compliance records." });
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
      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
          {msg.text}
        </p>
      )}
      <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
        {busy ? "Saving…" : "Save compliance dates"}
      </button>
    </div>
  );
}

/** Admin staff page: every member of staff with expiry warnings; open one to edit their public profile and internal compliance dates. */
export function StaffAdmin({ initialUserId }: { initialUserId?: string }) {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [records, setRecords] = useState<Record<string, Vetting>>({});
  const [selected, setSelected] = useState<string | null>(initialUserId || null);
  const [tab, setTab] = useState<"profile" | "compliance">("profile");
  const [error, setError] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [rolesRes, vettingRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("role", ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"]),
      supabase.from("staff_vetting_records").select(VETTING_COLUMNS),
    ]);
    if (rolesRes.error) {
      setError(true);
      return setStaff([]);
    }
    const roleRows = (rolesRes.data as unknown as { user_id: string; role: string }[]) || [];
    const ids = Array.from(new Set(roleRows.map((r) => r.user_id)));
    const profRes = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [], error: null };
    const profById = new Map(((profRes.data as { id: string; full_name: string | null; email: string | null }[]) || []).map((p) => [p.id, p]));
    const byUser = new Map<string, StaffRow>();
    for (const r0 of roleRows) {
      const pr = profById.get(r0.user_id);
      const r: RoleQuery = { user_id: r0.user_id, role: r0.role as LearnRole, profiles: pr ? { full_name: pr.full_name || "", email: pr.email } : null };
      const existing = byUser.get(r.user_id);
      if (existing) {
        if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
      } else {
        byUser.set(r.user_id, { user_id: r.user_id, full_name: r.profiles?.full_name || "Unnamed", email: r.profiles?.email ?? null, roles: [r.role] });
      }
    }
    setStaff(Array.from(byUser.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    const map: Record<string, Vetting> = {};
    for (const v of (vettingRes.data as Vetting[]) || []) map[v.user_id] = v;
    setRecords(map);
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

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section aria-label="Staff list" className="rounded-2xl border border-gold-light bg-white">
        <div className="border-b border-gold-light px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Staff</h2>
          {staff && <p className="text-xs text-ink/55">{flagged === 0 ? "All compliance dates are up to date." : `${flagged} with compliance items to check.`}</p>}
        </div>
        {staff === null ? (
          <p className="p-4 text-sm text-ink/60">Loading…</p>
        ) : error ? (
          <p className="p-4 text-sm text-amber-900">Couldn&apos;t load staff.</p>
        ) : (
          <ul className="divide-y divide-gold-light/50">
            {staff.map((s) => {
              const w = warnings[s.user_id] || [];
              const worst: DueState = w.some((x) => x.state === "overdue") ? "overdue" : w.length ? "soon" : "ok";
              return (
                <li key={s.user_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.user_id)}
                    aria-current={selected === s.user_id ? "true" : undefined}
                    className={`block w-full px-4 py-3 text-left hover:bg-cream ${selected === s.user_id ? "bg-cream" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{s.full_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[worst]}`}>{worst === "ok" ? "Up to date" : `${w.length} to check`}</span>
                    </span>
                    <span className="block text-xs text-ink/55">{s.roles.map((r) => learnRoleLabel(r)).join(", ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Staff details" className="rounded-2xl border border-gold-light bg-white p-6">
        {!person ? (
          <p className="text-sm text-ink/60">Choose a member of staff to edit their profile and compliance dates.</p>
        ) : (
          <div>
            <h2 className="font-serif text-h3 font-semibold text-ink">{person.full_name}</h2>
            <p className="text-sm text-ink/60">{[person.roles.map((r) => learnRoleLabel(r)).join(", "), person.email].filter(Boolean).join(" · ")}</p>
            {(warnings[person.user_id] || []).length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Compliance warnings">
                {warnings[person.user_id].map((w) => (
                  <li key={w.text} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[w.state]}`}>
                    {w.text}
                  </li>
                ))}
              </ul>
            )}
            <div role="tablist" aria-label="Staff sections" className="mt-4 flex gap-1 rounded-xl bg-cream/70 p-1">
              {(["profile", "compliance"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
                >
                  {t === "profile" ? "Public profile" : "Compliance (internal)"}
                </button>
              ))}
            </div>
            <div className="mt-5">
              {tab === "profile" ? (
                <StaffProfileForm key={person.user_id} userId={person.user_id} fullName={person.full_name} />
              ) : (
                <ComplianceForm key={person.user_id} person={person} record={records[person.user_id]} onSaved={load} />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
