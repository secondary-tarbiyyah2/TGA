"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { downloadCsv, toCsv } from "@/lib/learn/gcse";

type Status = "open" | "in_progress" | "resolved";

type Intervention = {
  id: string;
  child_id: string;
  subject_id: string;
  class_id: string | null;
  status: Status;
  reason: string;
  note: string | null;
  owner_id: string | null;
  owner_name: string | null;
  next_step: string | null;
  next_step_due: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  children: { name: string } | null;
  subjects: { name: string } | null;
  classes: { name: string } | null;
};

type Option = { child_id: string; subject_id: string; class_id: string | null; pupil: string; subject: string; cls: string };
type Staff = { id: string; name: string };

const SELECT_COLS = "id, child_id, subject_id, class_id, status, reason, note, owner_id, owner_name, next_step, next_step_due, created_at, updated_at, resolved_at, children(name), subjects(name), classes(name)";
const FIELD = "rounded-lg border border-gold-light/60 bg-white px-3 py-1.5 text-sm";
const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const STATUS_CLASS: Record<Status, string> = { open: "bg-amber-100 text-amber-900", in_progress: "bg-teal-100 text-teal-900", resolved: "bg-green-100 text-green-800" };
const REASONS = ["Below predicted grade", "Grade has dropped", "Missing homework / coursework", "Low attendance", "Needs exam technique support", "Confidence / wellbeing concern", "Other"];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Intervention flags for GCSE pupils: why, who owns it, the next step and when
 * it is due, with running notes. Staff-only (migration 0090); families never
 * see these. Head/admin see everything, teachers see their own classes.
 */
export function GcseInterventions() {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<Intervention[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [filter, setFilter] = useState<"active" | "mine" | "overdue" | "resolved" | "all">("active");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  // new flag
  const [pick, setPick] = useState("");
  const [pupilSearch, setPupilSearch] = useState("");
  const [reasonChoice, setReasonChoice] = useState(REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [owner, setOwner] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("gcse_interventions").select(SELECT_COLS).order("created_at", { ascending: false }).limit(1000);
    if (error) {
      setTableMissing(true);
      setItems([]);
      return;
    }
    setItems((data as unknown as Intervention[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await load();
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      let myName = u.user?.email || "Me";
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
        myName = (p as { full_name?: string } | null)?.full_name || myName;
        if (!cancelled) {
          setMe({ id: uid, name: myName });
          setOwner((cur) => cur || uid);
        }
      }
      const { data: g } = await supabase.from("gcse_grades").select("child_id, subject_id, class_id, children(name), subjects(name), classes(name)").limit(3000);
      if (!cancelled) {
        const list = ((g as unknown as { child_id: string; subject_id: string; class_id: string | null; children: { name: string } | null; subjects: { name: string } | null; classes: { name: string } | null }[] | null) || []).map((r) => ({
          child_id: r.child_id,
          subject_id: r.subject_id,
          class_id: r.class_id,
          pupil: r.children?.name || "Pupil",
          subject: r.subjects?.name || "Subject",
          cls: r.classes?.name || "",
        }));
        setOptions(list.sort((a, b) => a.pupil.localeCompare(b.pupil) || a.subject.localeCompare(b.subject)));
      }
      // Head/admin can pick any member of staff as owner; everyone else owns their own flags.
      const dir = await supabase.rpc("admin_staff_directory");
      if (!cancelled && !dir.error) {
        setStaff(((dir.data as { user_id: string; full_name: string }[] | null) || []).map((s) => ({ id: s.user_id, name: s.full_name })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, load]);

  const staffOptions = useMemo(() => {
    const list = staff.slice();
    if (me && !list.some((s) => s.id === me.id)) list.unshift({ id: me.id, name: me.name });
    return list;
  }, [staff, me]);
  const nameOf = (id: string) => staffOptions.find((s) => s.id === id)?.name || null;

  const pupilMatches = useMemo(() => {
    const q = pupilSearch.trim().toLowerCase();
    return options.filter((o) => !q || o.pupil.toLowerCase().includes(q) || o.subject.toLowerCase().includes(q)).slice(0, 60);
  }, [options, pupilSearch]);

  const shown = useMemo(() => {
    const t = today();
    return (items || []).filter((i) => {
      if (filter === "active") return i.status !== "resolved";
      if (filter === "mine") return i.status !== "resolved" && !!me && i.owner_id === me.id;
      if (filter === "overdue") return i.status !== "resolved" && !!i.next_step_due && i.next_step_due < t;
      if (filter === "resolved") return i.status === "resolved";
      return true;
    });
  }, [items, filter, me]);

  const counts = useMemo(() => {
    const t = today();
    const list = items || [];
    return {
      active: list.filter((i) => i.status !== "resolved").length,
      overdue: list.filter((i) => i.status !== "resolved" && !!i.next_step_due && i.next_step_due < t).length,
    };
  }, [items]);

  async function create() {
    if (!supabase) return;
    const opt = options.find((o) => `${o.child_id}|${o.subject_id}` === pick);
    if (!opt) return setMsg({ ok: false, text: "Choose a pupil and subject." });
    const reason = (reasonChoice === "Other" ? reasonOther : reasonChoice).trim();
    if (!reason) return setMsg({ ok: false, text: "Say why this pupil is flagged." });
    if (!nextStep.trim()) return setMsg({ ok: false, text: "Add a next step so the flag leads to an action." });
    setSaving(true);
    setMsg(null);
    const ownerId = owner || me?.id || null;
    const { error } = await supabase.from("gcse_interventions").insert({
      child_id: opt.child_id,
      subject_id: opt.subject_id,
      class_id: opt.class_id,
      reason: reason.slice(0, 300),
      note: note.trim() || null,
      owner_id: ownerId,
      owner_name: ownerId ? nameOf(ownerId) : null,
      next_step: nextStep.trim().slice(0, 300),
      next_step_due: due || null,
    });
    setSaving(false);
    if (error) return setMsg({ ok: false, text: "Couldn't save the flag. Migration 0090 may not be applied yet, or you don't teach this pupil's class." });
    setMsg({ ok: true, text: `Flag raised for ${opt.pupil} (${opt.subject}).` });
    setPick("");
    setNextStep("");
    setDue("");
    setNote("");
    setReasonOther("");
    setShowForm(false);
    await load();
  }

  async function patch(i: Intervention, changes: Partial<Pick<Intervention, "status" | "note" | "next_step" | "next_step_due" | "owner_id" | "owner_name">>) {
    if (!supabase) return;
    setItems((cur) => (cur || []).map((x) => (x.id === i.id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("gcse_interventions").update(changes).eq("id", i.id);
    if (error) {
      setMsg({ ok: false, text: "Couldn't save that change." });
      await load();
    }
  }

  const exportCsv = () =>
    downloadCsv(
      "gcse-interventions.csv",
      toCsv(
        ["Pupil", "Subject", "Class", "Status", "Reason", "Owner", "Next step", "Due", "Notes", "Raised"],
        shown.map((i) => [i.children?.name, i.subjects?.name, i.classes?.name, STATUS_LABEL[i.status], i.reason, i.owner_name, i.next_step, i.next_step_due, i.note, i.created_at.slice(0, 10)])
      )
    );

  if (items === null) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6" aria-labelledby="gcse-int-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="gcse-int-h" className="font-serif text-h3 font-semibold text-ink">
          Interventions
          <span className="ml-2 text-base font-normal text-ink/60">
            {counts.active} active{counts.overdue > 0 ? `, ${counts.overdue} overdue` : ""}
          </span>
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Export CSV
          </button>
          <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} disabled={tableMissing} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            Flag a pupil
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink/60">Staff-only. Each flag has an owner and a next step; families never see these notes.</p>
      {tableMissing && <p role="alert" className="mt-2 text-xs text-amber-800">The interventions table isn&apos;t there yet (migration 0090), so nothing can be saved until it is applied.</p>}

      {showForm && (
        <div className="mt-4 grid gap-3 rounded-xl border border-gold-light/50 bg-cream/40 p-4 text-xs font-medium text-ink/70 sm:grid-cols-2">
          <label className="sm:col-span-2">
            Pupil and subject
            <input value={pupilSearch} onChange={(e) => setPupilSearch(e.target.value)} placeholder="Type to search" aria-label="Search pupils" className={`${FIELD} mb-1 mt-1 block w-full`} />
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${FIELD} block w-full`}>
              <option value="">Choose…</option>
              {pupilMatches.map((o) => (
                <option key={`${o.child_id}|${o.subject_id}`} value={`${o.child_id}|${o.subject_id}`}>
                  {o.pupil} · {o.subject}
                  {o.cls ? ` (${o.cls})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Why
            <select value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)} className={`${FIELD} mt-1 block w-full`}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {reasonChoice === "Other" ? (
            <label>
              Describe it
              <input value={reasonOther} maxLength={300} onChange={(e) => setReasonOther(e.target.value)} className={`${FIELD} mt-1 block w-full`} />
            </label>
          ) : (
            <span aria-hidden="true" className="hidden sm:block" />
          )}
          <label>
            Owner
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${FIELD} mt-1 block w-full`}>
              {staffOptions.length === 0 && <option value="">Me</option>}
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === me?.id ? `${s.name} (me)` : s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Next step due (optional)
            <input type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} className={`${FIELD} mt-1 block w-full`} />
          </label>
          <label className="sm:col-span-2">
            Next step
            <input value={nextStep} maxLength={300} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Weekly 30-minute catch-up on algebra; call home" className={`${FIELD} mt-1 block w-full`} />
          </label>
          <label className="sm:col-span-2">
            Notes (optional)
            <textarea value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} className={`${FIELD} mt-1 block w-full`} />
          </label>
          <div className="sm:col-span-2">
            <button type="button" disabled={saving} onClick={create} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
              {saving ? "Saving…" : "Save flag"}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>
          {msg.text}
        </p>
      )}

      <div role="group" aria-label="Show" className="mt-4 flex flex-wrap gap-1.5">
        {([
          ["active", "Active"],
          ["mine", "Mine"],
          ["overdue", "Overdue"],
          ["resolved", "Resolved"],
          ["all", "All"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === id ? "border-teal-600 bg-teal-50 text-teal-900" : "border-gold-light bg-white text-ink/75 hover:bg-cream"}`}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">{items.length === 0 ? "No interventions yet. Use “Flag a pupil” when someone needs extra support." : "Nothing in this view."}</p>
      ) : (
        <ul className="mt-4 divide-y divide-gold-light/40">
          {shown.map((i) => {
            const overdue = i.status !== "resolved" && !!i.next_step_due && i.next_step_due < today();
            return (
              <li key={i.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-ink">{i.children?.name || "Pupil"}</span>
                    <span className="ml-2 text-xs text-ink/60">
                      {i.subjects?.name || "Subject"}
                      {i.classes?.name ? ` · ${i.classes.name}` : ""}
                    </span>
                    <p className="text-xs text-ink/75">{i.reason}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink/60">
                    <span className="sr-only">Status</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_CLASS[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                    <select value={i.status} onChange={(e) => void patch(i, { status: e.target.value as Status })} aria-label={`Status for ${i.children?.name || "pupil"}`} className="rounded-md border border-gold-light/60 bg-white px-1.5 py-1 text-xs">
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                  <dt className="text-ink/65">Owner</dt>
                  <dd className="text-ink/80">{i.owner_name || "Nobody yet"}</dd>
                  <dt className="text-ink/65">Next step</dt>
                  <dd className="text-ink/80">
                    {i.next_step || "None set"}
                    {i.next_step_due && <span className={`ml-2 rounded px-1.5 py-0.5 ${overdue ? "bg-red-100 text-red-800" : "bg-cream text-ink/70"}`}>{overdue ? "Overdue, was due " : "Due "}{fmtDate(i.next_step_due)}</span>}
                  </dd>
                </dl>
                <label className="mt-2 block text-xs text-ink/60">
                  Notes
                  <textarea
                    defaultValue={i.note || ""}
                    maxLength={2000}
                    rows={2}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (i.note || "")) void patch(i, { note: v || null });
                    }}
                    placeholder="Add an update. Saved when you click away."
                    className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-2 py-1.5 text-xs"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
