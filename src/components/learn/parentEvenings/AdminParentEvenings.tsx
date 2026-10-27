"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  EVENING_COLUMNS,
  EVENING_STATUS_META,
  SLOT_LENGTHS,
  bookingErrorMessage,
  formatSlot,
  formatTime,
  formatWindow,
  generateSlots,
  windowProblem,
  type EveningStatus,
  type ParentEvening,
} from "@/lib/learn/parentEvenings";
import { ui } from "@/components/learn/ui";
import { isoToUkLocal, ukLocalToIso } from "@/lib/learn/openEvening";
import { useNow } from "@/lib/learn/useNow";

type Teacher = { id: string; name: string; cover: boolean };
type TeacherOption = { user_id: string; full_name: string; role: string };
type EveningRow = ParentEvening & { parent_evening_teachers: { teacher_id: string }[] };
type AdminBooking = { booking_id: string; teacher_id: string; teacher_name: string; child_name: string; parent_name: string; slot_start: string; slot_end: string };

const inputCls = ui.input;

function EveningAdminCard({ ev, teachers, onChanged }: { ev: EveningRow; teachers: Teacher[]; onChanged: () => Promise<void> }) {
  const supabase = getSupabaseClient();
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // Times are typed and shown as UK time whatever the browser's zone (they
  // used to be read in the browser's own zone but displayed in UK time).
  const [editStart, setEditStart] = useState(() => isoToUkLocal(ev.starts_at));
  const [editEnd, setEditEnd] = useState(() => isoToUkLocal(ev.ends_at));

  const chosen = useMemo(() => new Set(ev.parent_evening_teachers.map((t) => t.teacher_id)), [ev.parent_evening_teachers]);
  const total = generateSlots(ev).length * chosen.size;
  const meta = EVENING_STATUS_META[ev.status];

  const loadBookings = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.rpc("parent_evening_admin_bookings", { p_evening_id: ev.id });
    if (err) setError(bookingErrorMessage(err.message));
    setBookings((data as AdminBooking[] | null) || []);
  }, [supabase, ev.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the card is opened
    if (open) loadBookings();
  }, [open, loadBookings]);

  const setStatus = async (status: EveningStatus) => {
    if (!supabase) return;
    if (status === "open" && chosen.size === 0) return setError("Choose at least one teacher (Teachers & bookings) before opening it for booking.");
    if (status === "open" && !window.confirm(`Open "${ev.title}" for booking? Parents will see it in the family area straight away.`)) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("parent_evenings").update({ status }).eq("id", ev.id);
    if (err) setError(bookingErrorMessage(err.message));
    await onChanged();
    setBusy(false);
  };

  const saveWindow = async () => {
    if (!supabase) return;
    const problem = windowProblem(editStart, editEnd, ev.slot_minutes);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("parent_evenings")
      .update({ starts_at: ukLocalToIso(editStart), ends_at: ukLocalToIso(editEnd) })
      .eq("id", ev.id);
    if (err) setError(err.message.includes("evening_has_bookings") ? "This evening already has bookings, so its times can't be changed. Cancel the bookings first." : err.message);
    else setEditing(false);
    await onChanged();
    setBusy(false);
  };

  const toggleTeacher = async (teacherId: string) => {
    if (!supabase) return;
    setError(null);
    const res = chosen.has(teacherId)
      ? await supabase.from("parent_evening_teachers").delete().eq("evening_id", ev.id).eq("teacher_id", teacherId)
      : await supabase.from("parent_evening_teachers").insert({ evening_id: ev.id, teacher_id: teacherId });
    if (res.error) setError(res.error.message);
    await onChanged();
  };

  const remove = async () => {
    if (!supabase) return;
    if (!window.confirm(`Delete "${ev.title}"? All of its bookings will be deleted too (parents are not notified).`)) return;
    const { error: err } = await supabase.from("parent_evenings").delete().eq("id", ev.id);
    if (err) setError(err.message);
    await onChanged();
  };

  const cancelBooking = async (b: AdminBooking) => {
    if (!supabase) return;
    if (!window.confirm(`Cancel ${b.parent_name}'s meeting with ${b.teacher_name} at ${formatTime(b.slot_start)}?`)) return;
    const { error: err } = await supabase.rpc("cancel_parent_evening_booking", { p_booking_id: b.booking_id });
    if (err) setError(bookingErrorMessage(err.message));
    await loadBookings();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-h3 font-semibold text-ink">{ev.title}</h3>
          <p className="mt-1 text-sm text-ink/70">
            {formatWindow(ev.starts_at, ev.ends_at)} · {ev.slot_minutes}-minute meetings
            {ev.location ? ` · ${ev.location}` : ""}
          </p>
          <p className="mt-1 text-xs text-ink/65">
            {chosen.size} teacher{chosen.size === 1 ? "" : "s"} · {total} slots
            {bookings ? ` · ${bookings.length} booked` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["draft", "open", "closed"] as EveningStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || ev.status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-sm ${ev.status === s ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"} disabled:opacity-60`}
          >
            {s === "draft" ? "Draft" : s === "open" ? "Open for booking" : ev.status === "closed" ? "Closed" : "Close bookings"}
          </button>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm text-gold-700 underline">
          {open ? "Hide details" : "Teachers & bookings"}
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="text-sm text-gold-700 underline">
          {editing ? "Cancel editing times" : "Edit times"}
        </button>
        <button type="button" onClick={remove} className="text-sm text-red-700 underline">
          Delete
        </button>
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-gold-light/50 bg-cream/40 p-3">
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor={`pe-es-${ev.id}`}>Starts (UK time)</label>
            <input id={`pe-es-${ev.id}`} type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor={`pe-ee-${ev.id}`}>Ends (UK time)</label>
            <input id={`pe-ee-${ev.id}`} type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className={inputCls} />
          </div>
          <button type="button" disabled={busy} onClick={saveWindow} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900 disabled:opacity-50">
            Save times
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {open && (
        <div className="mt-4 space-y-4 border-t border-gold-light/30 pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Teachers taking part</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 md:grid-cols-3">
              {teachers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm text-ink/80">
                  <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggleTeacher(t.id)} />
                  {t.name}
                  {t.cover && <span className="text-xs text-ink/65">(TA / cover)</span>}
                </label>
              ))}
              {teachers.length === 0 && <p className="text-sm text-ink/65">No active teachers found. Check Staff for teachers who are marked inactive.</p>}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Bookings</p>
            {bookings === null ? (
              <p className="mt-1 text-sm text-ink/65">Loading…</p>
            ) : bookings.length === 0 ? (
              <p className="mt-1 text-sm text-ink/65">No bookings yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gold-light/30 rounded-lg border border-gold-light/40">
                {bookings.map((b) => (
                  <li key={b.booking_id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span>
                      <span className="font-medium text-ink">{formatSlot(b.slot_start, b.slot_end)}</span>
                      <span className="text-ink/70"> · {b.teacher_name} · {b.child_name} ({b.parent_name})</span>
                    </span>
                    <button type="button" onClick={() => cancelBooking(b)} className="text-xs text-red-700 underline">
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Admin: create parent evenings (window, slot length, teachers), open/close them and see every booking. */
export function AdminParentEvenings() {
  const supabase = getSupabaseClient();
  const [evenings, setEvenings] = useState<EveningRow[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadProblems, setLoadProblems] = useState<string[]>([]);
  const [includeCover, setIncludeCover] = useState(false);

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [slotMinutes, setSlotMinutes] = useState<number>(10);
  const [location, setLocation] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [evRes, optRes] = await Promise.all([
      supabase.from("parent_evenings").select(`${EVENING_COLUMNS}, parent_evening_teachers(teacher_id)`).order("starts_at", { ascending: false }),
      supabase.rpc("parent_evening_teacher_options"),
    ]);
    setEvenings((evRes.data as unknown as EveningRow[]) || []);
    const problems: string[] = [];
    if (evRes.error) problems.push(`Parent evenings: ${evRes.error.message}`);
    let list: Teacher[] = [];
    if (!optRes.error) {
      list = ((optRes.data as TeacherOption[] | null) || []).map((o) => ({ id: o.user_id, name: o.full_name, cover: o.role !== "teacher" }));
    } else {
      problems.push(`Teachers: ${optRes.error.message}`);
      // Fallback without any profiles embed: roles first, then names.
      const rolesRes = await supabase.from("user_roles").select("user_id, role").in("role", ["teacher", "teaching_assistant_cover"]);
      const rows = (rolesRes.data as unknown as { user_id: string; role: string }[] | null) || [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const profRes = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [], error: null };
      const names = new Map(((profRes.data as { id: string; full_name: string | null }[] | null) || []).map((p) => [p.id, p.full_name || "Teacher"]));
      list = ids.map((id) => ({ id, name: names.get(id) || "Teacher", cover: !rows.some((r) => r.user_id === id && r.role === "teacher") }));
    }
    setTeachers(list.sort((a, b) => a.name.localeCompare(b.name)));
    setLoadProblems(problems);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    if (!supabase) return;
    setError(null);
    if (!title.trim()) {
      setError("Give the evening a title.");
      return;
    }
    const problem = windowProblem(startsAt, endsAt, slotMinutes);
    if (problem) {
      setError(problem);
      return;
    }
    if (joinUrl.trim() && !/^https:\/\/\S+$/i.test(joinUrl.trim())) {
      setError("The online link must start with https://");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: err } = await supabase
        .from("parent_evenings")
        .insert({
          title: title.trim(),
          starts_at: ukLocalToIso(startsAt),
          ends_at: ukLocalToIso(endsAt),
          slot_minutes: slotMinutes,
          location: location.trim() || null,
          join_url: joinUrl.trim() || null,
          notes: notes.trim() || null,
          status: "draft",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (err || !data) {
        setError(err?.message || "Could not create the evening.");
        return;
      }
      if (picked.size > 0) {
        const { error: tErr } = await supabase
          .from("parent_evening_teachers")
          .insert([...picked].map((teacher_id) => ({ evening_id: (data as { id: string }).id, teacher_id })));
        if (tErr) setError(tErr.message);
      }
      setTitle("");
      setStartsAt("");
      setEndsAt("");
      setLocation("");
      setJoinUrl("");
      setNotes("");
      setPicked(new Set());
      setCreating(false);
      setNotice(`"${title.trim()}" created as a draft. Open it for booking when you are ready.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {!creating && (
          <button type="button" onClick={() => { setCreating(true); setNotice(null); }} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
            + New parent evening
          </button>
        )}
        {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
      </div>
      {creating && (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">New parent evening</h2>
        <p className="mt-1 text-sm text-ink/65">It starts as a draft, hidden from parents. Open it for booking when the teachers are chosen.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Autumn parent evening" maxLength={120} aria-label="Title" className={`${inputCls} sm:col-span-2`} />
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor="pe-start">
              Starts (UK time)
            </label>
            <input id="pe-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor="pe-end">
              Ends (UK time)
            </label>
            <input id="pe-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor="pe-slot">
              Length of each meeting
            </label>
            <select id="pe-slot" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} className={inputCls}>
              {SLOT_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" maxLength={200} aria-label="Location" className={`${inputCls} self-end`} />
          <input type="url" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="Default online link (optional, https://…)" aria-label="Default online link" className={`${inputCls} sm:col-span-2`} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for parents (optional)" rows={2} maxLength={1000} className={`${inputCls} sm:col-span-2`} />
        </div>
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Teachers taking part</p>
            {teachers.some((t) => t.cover) && (
              <label className="flex items-center gap-2 text-xs text-ink/70">
                <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} />
                Include teaching assistants / cover
              </label>
            )}
          </div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2 md:grid-cols-3">
            {teachers.filter((t) => !t.cover || includeCover || picked.has(t.id)).map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-ink/80">
                <input type="checkbox" checked={picked.has(t.id)} onChange={() => togglePicked(t.id)} />
                {t.name}
                {t.cover && <span className="text-xs text-ink/65">(TA / cover)</span>}
              </label>
            ))}
            {teachers.filter((t) => !t.cover).length === 0 && <p className="text-sm text-ink/65 sm:col-span-2 md:col-span-3">No active teachers found. Teachers appear here once they hold the Teacher role and are active under Staff.</p>}
          </div>
          {loadProblems.length > 0 && (
            <p role="alert" className="mt-2 break-words text-xs text-amber-900">
              Couldn&apos;t load everything: {loadProblems.join(" · ")}
            </p>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={create} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Creating…" : "Create as draft"}
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(null); }} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
            Cancel
          </button>
        </div>
      </div>
      )}
      {!creating && loadProblems.length > 0 && (
        <p role="alert" className="break-words text-xs text-amber-900">
          Couldn&apos;t load everything: {loadProblems.join(" · ")}
        </p>
      )}

      {evenings === null ? (
        <p className="text-sm text-ink/65">Loading…</p>
      ) : evenings.length === 0 ? (
        <p className="rounded-2xl border border-gold-light/50 bg-white p-6 text-sm text-ink/65">No parent evenings yet. Use &ldquo;+ New parent evening&rdquo; to set one up.</p>
      ) : (
        (() => {
          // Upcoming first (soonest at the top); past evenings folded away.
          const upcoming = evenings.filter((ev) => new Date(ev.ends_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const past = evenings.filter((ev) => new Date(ev.ends_at).getTime() < now);
          return (
            <>
              {upcoming.length === 0 && <p className="text-sm text-ink/65">No upcoming parent evenings.</p>}
              {upcoming.map((ev) => <EveningAdminCard key={ev.id} ev={ev} teachers={teachers} onChanged={load} />)}
              {past.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-ink/70">Past parent evenings ({past.length})</summary>
                  <div className="mt-3 space-y-4">
                    {past.map((ev) => <EveningAdminCard key={ev.id} ev={ev} teachers={teachers} onChanged={load} />)}
                  </div>
                </details>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
