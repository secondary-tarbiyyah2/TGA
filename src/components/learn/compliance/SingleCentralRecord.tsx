"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { formatDateKey, ukToday } from "@/lib/learn/ukTime";
import { btn, ui } from "@/components/learn/ui";

type StaffRow = { user_id: string; full_name: string; role: string };
type Vetting = {
  user_id: string;
  dbs_check_date: string | null;
  dbs_certificate_reference: string | null;
  dbs_renewal_due: string | null;
  references_received: boolean;
  right_to_work_verified: boolean;
  right_to_work_document_type: string | null;
  qualification_check_done: boolean;
  right_to_work_verified_by?: string | null;
  right_to_work_verified_date?: string | null;
  references_received_date?: string | null;
  qualification_check_date?: string | null;
};

const day = (k: string | null | undefined) => (k ? formatDateKey(k, { day: "numeric", month: "short", year: "numeric" }) : "–");

const EMPTY_FORM = {
  dbs_check_date: "", dbs_certificate_reference: "", dbs_renewal_due: "",
  references_received: false, right_to_work_verified: false, right_to_work_document_type: "", qualification_check_done: false,
};

/**
 * The Single Central Record, Headteacher/Admin only (0015), not broadly
 * staff-visible, standard SCR practice. Right-to-work is deliberately
 * verified/date/type/verifier only, never a document number, see the
 * migration header for the data-minimization reasoning.
 */
export function SingleCentralRecord() {
  const supabase = getSupabaseClient();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [records, setRecords] = useState<Record<string, Vetting>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Date.now() is impure and can't be called during render, captured once
  // via effect, same pattern as IncidentBreachLog.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capturing the current time once on mount, not a render-cycle sync
    setNow(Date.now());
  }, []);

  const load = async () => {
    if (!supabase) return;
    const { data: roles } = await supabase.from("user_roles").select("user_id, role, profiles(full_name)").in("role", ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco"]);
    const byUser = new Map<string, StaffRow>();
    for (const r of (roles as unknown as { user_id: string; role: string; profiles: { full_name: string } | null }[]) || []) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user_id: r.user_id, full_name: r.profiles?.full_name || r.user_id, role: r.role });
    }
    setStaff(Array.from(byUser.values()));
    const { data: vetting } = await supabase.from("staff_vetting_records").select("*");
    const map: Record<string, Vetting> = {};
    for (const v of (vetting as Vetting[]) || []) map[v.user_id] = v;
    setRecords(map);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const startEdit = (userId: string) => {
    const existing = records[userId];
    setForm(existing ? {
      dbs_check_date: existing.dbs_check_date || "", dbs_certificate_reference: existing.dbs_certificate_reference || "",
      dbs_renewal_due: existing.dbs_renewal_due || "", references_received: existing.references_received,
      right_to_work_verified: existing.right_to_work_verified, right_to_work_document_type: existing.right_to_work_document_type || "",
      qualification_check_done: existing.qualification_check_done,
    } : EMPTY_FORM);
    setError(null);
    setEditing(userId);
  };

  const save = async (userId: string) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    // Keep the original check dates and verifier when a box was already
    // ticked: every save used to re-stamp them with today's date and the
    // current editor, so the record no longer showed when a check was done.
    const prev = records[userId];
    const today = ukToday();
    const keep = (wasDone: boolean | undefined, nowDone: boolean, date: string | null | undefined) => (nowDone ? (wasDone && date ? date : today) : null);
    const { error: err } = await supabase.from("staff_vetting_records").upsert(
      {
        user_id: userId,
        ...form,
        dbs_check_date: form.dbs_check_date || null,
        dbs_renewal_due: form.dbs_renewal_due || null,
        right_to_work_verified_by: form.right_to_work_verified ? (prev?.right_to_work_verified && prev.right_to_work_verified_by ? prev.right_to_work_verified_by : user?.id) : null,
        right_to_work_verified_date: keep(prev?.right_to_work_verified, form.right_to_work_verified, prev?.right_to_work_verified_date),
        references_received_date: keep(prev?.references_received, form.references_received, prev?.references_received_date),
        qualification_check_date: keep(prev?.qualification_check_done, form.qualification_check_done, prev?.qualification_check_date),
      },
      { onConflict: "user_id" }
    );
    setBusy(false);
    if (err) return setError("Couldn't save this record. Only the Headteacher or an Admin can.");
    setEditing(null);
    await load();
  };

  const isExpiring = (due: string | null) => now !== null && !!due && new Date(due).getTime() - now < 60 * 24 * 60 * 60 * 1000;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Single Central Record</h2>
      <p className="mt-1 text-xs text-ink/65">Recruitment/vetting checks for every staff member. DBS renewals due within 60 days are highlighted.</p>
      <div className="mt-3 space-y-2">
        {staff === null && <p className="text-sm text-ink/65">Loading…</p>}
        {(staff || []).map((s) => {
          const v = records[s.user_id];
          return (
            <div key={s.user_id} className={`rounded-lg border p-3 text-sm ${v && isExpiring(v.dbs_renewal_due) ? "border-red-300 bg-red-50" : "border-gold-light/40"}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.full_name} <span className="font-normal text-ink/65">({learnRoleLabel(s.role as LearnRole) || s.role})</span></p>
                <button type="button" onClick={() => startEdit(s.user_id)} className={btn("secondary", "sm")}>
                  {v ? "Edit" : "Add record"}
                </button>
              </div>
              {v ? (
                <p className="mt-1 text-xs text-ink/65">
                  DBS: {day(v.dbs_check_date)} (ref {v.dbs_certificate_reference || "–"}), renewal due {day(v.dbs_renewal_due)}
                  {isExpiring(v.dbs_renewal_due) && <span className="ml-1 font-semibold text-red-700">(due soon or overdue)</span>}
                  {" · "}References: {v.references_received ? `received${v.references_received_date ? ` ${day(v.references_received_date)}` : ""}` : "not received"} · Right to work: {v.right_to_work_verified ? `verified${v.right_to_work_verified_date ? ` ${day(v.right_to_work_verified_date)}` : ""} (${v.right_to_work_document_type || "type not set"})` : "not verified"}
                  {" · "}Qualifications: {v.qualification_check_done ? `checked${v.qualification_check_date ? ` ${day(v.qualification_check_date)}` : ""}` : "not checked"}
                </p>
              ) : (
                <p className="mt-1 text-xs text-red-700">No vetting record on file.</p>
              )}

              {editing === s.user_id && (
                <div className="mt-2 grid gap-2 border-t border-gold-light/30 pt-2 sm:grid-cols-2">
                  <label className="text-xs text-ink/70">DBS check date
                    <input type="date" value={form.dbs_check_date} onChange={(e) => setForm({ ...form, dbs_check_date: e.target.value })} className={`${ui.input} mt-1`} />
                  </label>
                  <label className="text-xs text-ink/70">DBS certificate reference
                    <input value={form.dbs_certificate_reference} onChange={(e) => setForm({ ...form, dbs_certificate_reference: e.target.value })} className={`${ui.input} mt-1`} />
                  </label>
                  <label className="text-xs text-ink/70">DBS renewal due
                    <input type="date" value={form.dbs_renewal_due} onChange={(e) => setForm({ ...form, dbs_renewal_due: e.target.value })} className={`${ui.input} mt-1`} />
                  </label>
                  <label className="text-xs text-ink/70">Right-to-work document type
                    <input value={form.right_to_work_document_type} onChange={(e) => setForm({ ...form, right_to_work_document_type: e.target.value })} placeholder="e.g. UK passport" className={`${ui.input} mt-1`} />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink/70">
                    <input type="checkbox" checked={form.references_received} onChange={(e) => setForm({ ...form, references_received: e.target.checked })} /> References received
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink/70">
                    <input type="checkbox" checked={form.right_to_work_verified} onChange={(e) => setForm({ ...form, right_to_work_verified: e.target.checked })} /> Right to work verified
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink/70">
                    <input type="checkbox" checked={form.qualification_check_done} onChange={(e) => setForm({ ...form, qualification_check_done: e.target.checked })} /> Qualifications checked
                  </label>
                  {error && <p role="alert" className="text-xs text-red-700 sm:col-span-2">{error}</p>}
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="button" onClick={() => save(s.user_id)} disabled={busy} className={btn("primary")}>Save</button>
                    <button type="button" onClick={() => setEditing(null)} className={btn("secondary")}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {staff?.length === 0 && <p className="text-sm text-ink/65">No staff members found.</p>}
      </div>
    </div>
  );
}
