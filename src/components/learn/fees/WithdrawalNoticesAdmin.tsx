"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { formatDate } from "@/components/learn/fees/shared";
import { Notice, StatusChip, ui } from "@/components/learn/ui";
import { NOTICE_COLUMNS, NOTICE_DAYS, NOTICE_STATUS_LABEL, addDays, destinationLabel, type WithdrawalNotice } from "@/components/learn/fees/withdrawal";

type Row = WithdrawalNotice & { children?: { name: string } | null };
type Edit = { eligible: string; fees: string; invoice: string; notes: string };

/** Office view of withdrawal notices (the "office use only" box of the
 * removal form). Shows open notices; finished ones on request. Renders
 * nothing when there are none, so it can sit on busy pages. */
export function WithdrawalNoticesAdmin({ compact = false }: { compact?: boolean }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>({ eligible: "", fees: "", invoice: "", notes: "" });
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    (async () => {
      const { data, error } = await supabase.from("withdrawal_notices").select(`${NOTICE_COLUMNS}, children(name)`).order("created_at", { ascending: false });
      if (live) setRows(error ? [] : ((data as unknown as Row[]) || []));
    })();
    return () => {
      live = false;
    };
  }, [supabase, tick]);

  if (!rows) return null;
  const open = rows.filter((r) => r.status === "submitted" || r.status === "acknowledged");
  if (rows.length === 0 || (compact && open.length === 0)) return null;
  const list = showAll ? rows : open;

  const startEdit = (r: Row) => {
    setEditing(r.id);
    setEdit({
      eligible: r.eligible_to_leave_on || addDays(r.created_at.slice(0, 10), NOTICE_DAYS),
      fees: r.fees_outstanding != null ? String(r.fees_outstanding) : "",
      invoice: r.last_invoice_on || "",
      notes: r.office_notes || "",
    });
  };

  const save = async (r: Row, status?: "acknowledged" | "completed") => {
    if (!supabase) return;
    const fees = edit.fees.trim() === "" ? null : Number(edit.fees.replace(/[£,\s]/g, ""));
    if (fees !== null && Number.isNaN(fees)) return setMsg({ tone: "bad", text: "Fees outstanding must be a number." });
    const { error } = await supabase
      .from("withdrawal_notices")
      .update({
        received_on: r.received_on || localDateKey(new Date()),
        eligible_to_leave_on: edit.eligible || null,
        fees_outstanding: fees,
        last_invoice_on: edit.invoice || null,
        office_notes: edit.notes.trim() || null,
        ...(status ? { status } : r.status === "submitted" ? { status: "acknowledged" } : {}),
        handled_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("id", r.id);
    setMsg(error ? { tone: "bad", text: "Not saved. Please try again." } : { tone: "good", text: status === "completed" ? "Marked as completed. Remember to end the pupil's enrolments in Pupil records." : "Saved." });
    if (!error) setEditing(null);
    load();
  };

  return (
    <section aria-labelledby="withdrawals-heading" className={`${ui.card} mb-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="withdrawals-heading" className="font-serif text-lg font-semibold text-ink">
          Withdrawal notices {open.length > 0 && <span className="text-sm font-normal text-ink/65">· {open.length} open</span>}
        </h2>
        {!compact && rows.length > open.length && (
          <button type="button" className={ui.btnLink} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Open only" : "Show finished too"}
          </button>
        )}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-ink/65">No open notices.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gold-light/60">
          {list.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {r.children?.name || "Pupil"} <span className="font-normal text-ink/65">· last day {formatDate(r.last_day)}</span>
                  </p>
                  <p className="text-ink/70">
                    {destinationLabel(r.destination)}
                    {r.new_school_name && ` · ${r.new_school_name}`}
                    {r.new_school_country && `, ${r.new_school_country}`}
                  </p>
                  {!compact && (
                    <>
                      {r.new_school_address && <p className="text-xs text-ink/65">New school address: {r.new_school_address}</p>}
                      {r.home_education_reason && <p className="text-xs text-ink/65">Home education: {r.home_education_reason}</p>}
                      <p className="text-xs text-ink/65">Reason: {r.reason}</p>
                      {r.forwarding_address && <p className="text-xs text-ink/65">Forwarding address: {r.forwarding_address}</p>}
                      {r.second_parent_name && (
                        <p className="text-xs text-ink/65">
                          Second parent: {r.second_parent_name}
                          {r.second_parent_email && ` (${r.second_parent_email})`}
                        </p>
                      )}
                      <p className="text-xs text-ink/65">
                        Signed {r.signed_name}, {formatDate(r.created_at)}
                        {r.received_on && ` · received ${formatDate(r.received_on)}`}
                        {r.eligible_to_leave_on && ` · notice ends ${formatDate(r.eligible_to_leave_on)}`}
                        {r.fees_outstanding != null && ` · £${Number(r.fees_outstanding).toFixed(2)} outstanding`}
                        {r.last_invoice_on && ` · last invoice ${formatDate(r.last_invoice_on)}`}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip tone={r.status === "submitted" ? "warn" : r.status === "completed" ? "good" : r.status === "cancelled" ? "neutral" : "info"}>{NOTICE_STATUS_LABEL[r.status]}</StatusChip>
                  {compact ? (
                    <a href="/admin/fees" className={ui.btnLink}>
                      Open
                    </a>
                  ) : (
                    (r.status === "submitted" || r.status === "acknowledged") &&
                    editing !== r.id && (
                      <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} onClick={() => startEdit(r)}>
                        {r.status === "submitted" ? "Acknowledge" : "Update"}
                      </button>
                    )
                  )}
                </div>
              </div>
              {editing === r.id && (
                <div className="mt-3 grid gap-3 rounded-lg bg-cream p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className={ui.label}>
                    Notice period ends
                    <input type="date" className={`${ui.input} mt-1`} value={edit.eligible} onChange={(e) => setEdit({ ...edit, eligible: e.target.value })} />
                  </label>
                  <label className={ui.label}>
                    Fees still outstanding (£)
                    <input type="text" inputMode="decimal" className={`${ui.input} mt-1`} value={edit.fees} onChange={(e) => setEdit({ ...edit, fees: e.target.value })} />
                  </label>
                  <label className={ui.label}>
                    Last invoice sent on
                    <input type="date" className={`${ui.input} mt-1`} value={edit.invoice} onChange={(e) => setEdit({ ...edit, invoice: e.target.value })} />
                  </label>
                  <label className={ui.label}>
                    Note to the family <span className="font-normal text-ink/65">(they see this)</span>
                    <input className={`${ui.input} mt-1`} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                  </label>
                  <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
                    <button type="button" className={ui.btnPrimary} onClick={() => save(r)}>
                      {r.status === "submitted" ? "Acknowledge and save" : "Save"}
                    </button>
                    <button type="button" className={ui.btnSecondary} onClick={() => save(r, "completed")}>
                      Pupil has left
                    </button>
                    <button type="button" className={ui.btnLink} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
