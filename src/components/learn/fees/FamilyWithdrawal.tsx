"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren } from "@/lib/learn/classes";
import { ukToday } from "@/lib/learn/ukTime";
import { formatDate } from "@/components/learn/fees/shared";
import { Notice, StatusChip, ui } from "@/components/learn/ui";
import { DESTINATIONS, NEEDS_SCHOOL, NOTICE_COLUMNS, NOTICE_DAYS, NOTICE_STATUS_LABEL, addDays, destinationLabel, type Destination, type WithdrawalNotice } from "@/components/learn/fees/withdrawal";

import { Select } from "@/components/ui/Dropdown";
type Form = {
  childId: string;
  lastDay: string;
  destination: Destination | "";
  schoolName: string;
  schoolAddress: string;
  schoolCountry: string;
  homeEdReason: string;
  reason: string;
  forwarding: string;
  parent2Name: string;
  parent2Email: string;
  signed: string;
  agreed: boolean;
};

const empty = (childId: string, lastDay: string): Form => ({
  childId,
  lastDay,
  destination: "",
  schoolName: "",
  schoolAddress: "",
  schoolCountry: "",
  homeEdReason: "",
  reason: "",
  forwarding: "",
  parent2Name: "",
  parent2Email: "",
  signed: "",
  agreed: false,
});

/** "Leaving the Academy": the parent's withdrawal notice (Fees Policy §7).
 * Shown at the foot of the family Fees page. */
export function FamilyWithdrawal() {
  const supabase = getSupabaseClient();
  const kids = useFamilyChildren();
  const today = ukToday();
  const noticeEnds = addDays(today, NOTICE_DAYS);
  const [notices, setNotices] = useState<WithdrawalNotice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(() => empty("", noticeEnds));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  // Cancelling a notice asks once, in place, before it happens.
  const [confirming, setConfirming] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    (async () => {
      const { data, error } = await supabase.from("withdrawal_notices").select(NOTICE_COLUMNS).order("created_at", { ascending: false });
      if (live) setNotices(error ? [] : (data as unknown as WithdrawalNotice[]) || []);
    })();
    return () => {
      live = false;
    };
  }, [supabase, tick]);

  if (!kids || kids.length === 0) return null;
  const childId = f.childId || kids[0].id;
  const nameOf = (id: string) => kids.find((k) => k.id === id)?.name || "Your child";
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const needsSchool = f.destination !== "" && NEEDS_SCHOOL.includes(f.destination);
  const short = f.lastDay !== "" && f.lastDay < noticeEnds;
  const openNotice = (notices || []).find((n) => n.child_id === childId && (n.status === "submitted" || n.status === "acknowledged"));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !f.destination) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("withdrawal_notices").insert({
      child_id: childId,
      last_day: f.lastDay,
      destination: f.destination,
      reason: f.reason.trim(),
      new_school_name: f.schoolName.trim() || null,
      new_school_address: f.schoolAddress.trim() || null,
      new_school_country: f.schoolCountry.trim() || null,
      home_education_reason: f.destination === "home_education" ? f.homeEdReason.trim() : null,
      forwarding_address: f.forwarding.trim() || null,
      second_parent_name: f.parent2Name.trim() || null,
      second_parent_email: f.parent2Email.trim() || null,
      signed_name: f.signed.trim(),
      notice_acknowledged: f.agreed,
    });
    setBusy(false);
    if (error) {
      setMsg({ tone: "bad", text: "Your notice was not sent. Please check the form and try again, or email the office." });
      return;
    }
    setMsg({ tone: "good", text: `Notice sent for ${nameOf(childId)}. The office will confirm the leaving date and any fees still due.` });
    setOpen(false);
    setF(empty(childId, noticeEnds));
    load();
  };

  const cancel = async (n: WithdrawalNotice) => {
    if (!supabase) return;
    setConfirming(null);
    const { error } = await supabase.rpc("cancel_my_withdrawal_notice", { p_id: n.id });
    setMsg(error ? { tone: "bad", text: "We couldn't cancel that notice just now. Please try again, or contact the office." } : { tone: "good", text: `Notice for ${nameOf(n.child_id)} cancelled.` });
    load();
  };

  const field = "mt-1";
  return (
    <section aria-labelledby="leaving-heading" className={`${ui.card} mt-8`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="leaving-heading" className="font-serif text-lg font-semibold text-ink">
            Leaving the Academy
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">
            One half term&apos;s written notice is needed to withdraw a pupil, and fees are payable for the notice period. Notice given today runs to{" "}
            <span className="font-medium text-ink">{formatDate(noticeEnds)}</span>.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            className={ui.btnSecondary}
            onClick={() => {
              setOpen(true);
              setMsg(null);
            }}
          >
            Give notice
          </button>
        )}
      </div>

      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      {notices && notices.length > 0 && (
        <ul className="mt-4 divide-y divide-gold-light/60 rounded-lg bg-cream px-3 text-sm">
          {notices.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 text-ink/80">
                <span className="font-medium text-ink">{nameOf(n.child_id)}</span> · last day {formatDate(n.last_day)} · {destinationLabel(n.destination)}
                {n.eligible_to_leave_on && <span className="block text-xs text-ink/65">Office: notice period ends {formatDate(n.eligible_to_leave_on)}</span>}
                {n.fees_outstanding != null && Number(n.fees_outstanding) > 0 && <span className="block text-xs text-ink/65">Fees still due: £{Number(n.fees_outstanding).toFixed(2)}</span>}
                {n.office_notes && <span className="block text-xs text-ink/65">{n.office_notes}</span>}
              </span>
              <span className="flex items-center gap-3">
                <StatusChip tone={n.status === "cancelled" ? "neutral" : n.status === "completed" ? "good" : "info"}>{NOTICE_STATUS_LABEL[n.status]}</StatusChip>
                {n.status === "submitted" &&
                  (confirming === n.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink/75">Cancel this notice?</span>
                      <button type="button" className={`${ui.btnPrimary} ${ui.sm}`} onClick={() => cancel(n)}>
                        Yes, cancel it
                      </button>
                      <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} onClick={() => setConfirming(null)}>
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button type="button" className={ui.btnLink} onClick={() => setConfirming(n.id)}>
                      Cancel notice
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4">
          {kids.length > 1 && (
            <label className={ui.label}>
              Child
              <Select allowEmpty className={`${ui.input} ${field}`} value={childId} onChange={(e) => set({ childId: e.target.value })}>
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {openNotice ? (
            <Notice tone="info">You have already given notice for {nameOf(childId)}. Cancel it above, or contact the office to change it.</Notice>
          ) : (
            <>
              <label className={ui.label}>
                Last day at the Academy
                <input type="date" required min={today} className={`${ui.input} ${field} max-w-xs`} value={f.lastDay} onChange={(e) => set({ lastDay: e.target.value })} />
              </label>
              {short && <Notice tone="warn">This is before the notice period ends ({formatDate(noticeEnds)}), so fees are still payable up to that date.</Notice>}

              <fieldset>
                <legend className={ui.label}>Where will {nameOf(childId)} continue their education?</legend>
                <p className={ui.hint}>We have to know this before a pupil leaves the register.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {DESTINATIONS.map((d) => (
                    <label key={d.value} className="flex items-center gap-2 rounded-lg border border-gold-light px-3 py-2 text-sm text-ink">
                      <input type="radio" name="destination" required value={d.value} checked={f.destination === d.value} onChange={() => set({ destination: d.value })} />
                      {d.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {(needsSchool || f.destination === "moving_abroad") && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={ui.label}>
                    New school name{needsSchool ? "" : " (if known)"}
                    <input required={needsSchool} className={`${ui.input} ${field}`} value={f.schoolName} onChange={(e) => set({ schoolName: e.target.value })} />
                  </label>
                  <label className={ui.label}>
                    Address and postcode
                    <input className={`${ui.input} ${field}`} value={f.schoolAddress} onChange={(e) => set({ schoolAddress: e.target.value })} />
                  </label>
                  <label className={ui.label}>
                    Country
                    <input className={`${ui.input} ${field}`} value={f.schoolCountry} onChange={(e) => set({ schoolCountry: e.target.value })} />
                  </label>
                </div>
              )}
              {f.destination === "home_education" && (
                <label className={ui.label}>
                  Why are you choosing home education?
                  <textarea required rows={3} className={`${ui.input} ${field}`} value={f.homeEdReason} onChange={(e) => set({ homeEdReason: e.target.value })} />
                </label>
              )}

              <label className={ui.label}>
                Reason for leaving
                <textarea required rows={3} className={`${ui.input} ${field}`} value={f.reason} onChange={(e) => set({ reason: e.target.value })} />
              </label>
              <label className={ui.label}>
                Forwarding address <span className="font-normal text-ink/65">(if you are moving)</span>
                <input className={`${ui.input} ${field}`} value={f.forwarding} onChange={(e) => set({ forwarding: e.target.value })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={ui.label}>
                  Second parent or carer <span className="font-normal text-ink/65">(optional)</span>
                  <input className={`${ui.input} ${field}`} value={f.parent2Name} onChange={(e) => set({ parent2Name: e.target.value })} />
                </label>
                <label className={ui.label}>
                  Their email <span className="font-normal text-ink/65">(optional)</span>
                  <input type="email" className={`${ui.input} ${field}`} value={f.parent2Email} onChange={(e) => set({ parent2Email: e.target.value })} />
                </label>
              </div>

              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" required className="mt-1" checked={f.agreed} onChange={(e) => set({ agreed: e.target.checked })} />
                <span>I understand that one half term&apos;s notice is needed and that fees are payable for the notice period, as set out in the Fees Policy.</span>
              </label>
              <label className={ui.label}>
                Type your full name to sign
                <input required className={`${ui.input} ${field} max-w-sm`} value={f.signed} onChange={(e) => set({ signed: e.target.value })} />
              </label>

              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className={ui.btnPrimary}>
                  {busy ? "Sending…" : "Send notice"}
                </button>
                <button type="button" className={ui.btnSecondary} onClick={() => setOpen(false)}>
                  Not now
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
