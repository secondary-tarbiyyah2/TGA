"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

import { askConfirm, Loading } from "@/components/learn/kit";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { Icon } from "@/components/learn/Icon";
import { Avatar, Tag, ui } from "@/components/learn/ui";
import { loadClassAttendance, rateOf, type ClassMark } from "@/components/learn/class/ClassAttendanceTab";
type Person = { id: string; name: string };
type Teacher = { user_id: string; full_name: string; role: string };
type Candidate = { id: string; name: string; year_group_id: string | null };
type Places = { capacity: number | null; places_used: number | null; places_remaining: number | null; name: string };

function AddModal({ classId, yearGroupId, yearGroupName, onClose, onDone }: { classId: string; yearGroupId: string | null; yearGroupName: string | null; onClose: () => void; onDone: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [places, setPlaces] = useState<Places | null>(null);
  const [search, setSearch] = useState("");
  const [onlyYear, setOnlyYear] = useState(Boolean(yearGroupId));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.rpc("class_enrolment_candidates", { p_class_id: classId });
      setCandidates((data as unknown as Candidate[]) || []);
      if (yearGroupId) {
        const { data: pl } = await supabase.from("year_group_places").select("name, capacity, places_used, places_remaining").eq("year_group_id", yearGroupId).maybeSingle();
        setPlaces((pl as unknown as Places | null) || null);
      }
    })();
  }, [classId, yearGroupId]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (candidates || []).filter((c) => (!onlyYear || !yearGroupId || c.year_group_id === yearGroupId) && (!q || c.name.toLowerCase().includes(q)));
  }, [candidates, search, onlyYear, yearGroupId]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const overCapacity = places && places.places_remaining !== null && picked.size > places.places_remaining;

  const submit = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || picked.size === 0) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("enrolments").insert([...picked].map((childId) => ({ class_id: classId, child_id: childId })));
    setBusy(false);
    if (err) return setError(`Couldn't add them. ${err.message}`);
    onDone();
  };

  return (
    <div className="portal fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add participants">
      <div className="portal-menu flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.375rem] border border-[var(--portal-line)] bg-white shadow-xl sm:rounded-[1.375rem]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--portal-line-soft)] px-6 py-4">
          <h2 className="text-lg font-bold tracking-[-0.015em] text-ink">Add participants</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`${ui.btnSecondary} portal-btn--icon`}>
            <Icon name="x" />
          </button>
        </div>
        <div className="space-y-2 border-b border-[var(--portal-line-soft)] px-6 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pupils"
            aria-label="Search pupils"
            className={ui.input}
          />
          {yearGroupId && (
            <label className="flex min-h-11 items-center gap-2.5 text-sm text-ink-700">
              <input type="checkbox" className="portal-switch" checked={onlyYear} onChange={(e) => setOnlyYear(e.target.checked)} />
              Only {yearGroupName || "this year group"}
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidates === null ? (
            <Loading label="Loading…" bare />
          ) : shown.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink/65">No matching pupils to add.</p>
          ) : (
            <ul className="divide-y divide-[var(--portal-line-soft)]">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-center gap-3 px-6 py-2.5 hover:bg-[var(--portal-row-hover)] ${picked.has(c.id) ? "bg-[var(--portal-selected)]" : ""}`}>
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                    <Avatar name={c.name} seed={c.id} size={30} />
                    <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {overCapacity && places && (
          <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
            {places.name} has {places.places_remaining} place{places.places_remaining === 1 ? "" : "s"} left of {places.capacity}. Adding {picked.size} may take it over capacity (you can still continue).
          </p>
        )}
        {error && <p className="border-t border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--portal-line-soft)] bg-[var(--portal-row-hover)] px-6 py-3.5">
          <span className="t-meta">{picked.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy || picked.size === 0} className={ui.btnPrimary}>
              {busy ? "Adding…" : `Add ${picked.size || ""}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Participants: teachers (read-only) and enrolled students. Staff and the
 * class's own teacher can add or remove students. */
export function ParticipantsTab({ classId, onChanged }: { classId: string; onChanged?: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [yearGroupId, setYearGroupId] = useState<string | null>(null);
  const [yearGroupName, setYearGroupName] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [marks, setMarks] = useState<ClassMark[] | null>(null);

  // Each pupil's attendance in this class (the last ten weeks), for their card.
  useEffect(() => {
    let alive = true;
    loadClassAttendance(classId).then((r) => {
      if (alive) setMarks(r?.marks || []);
    });
    return () => {
      alive = false;
    };
  }, [classId]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [{ data: enr }, { data: tch }, { data: cls }] = await Promise.all([
      supabase.from("enrolments").select("children(id, name)").eq("class_id", classId),
      supabase.rpc("class_teacher_names", { p_class_id: classId }),
      supabase.from("classes").select("year_group_id, year_groups(name)").eq("id", classId).maybeSingle(),
    ]);
    setPeople(
      (((enr as unknown as { children: Person | null }[]) || []).map((r) => r.children).filter(Boolean) as Person[]).sort((a, b) => a.name.localeCompare(b.name)),
    );
    setTeachers((tch as unknown as Teacher[]) || []);
    const c = cls as unknown as { year_group_id: string | null; year_groups?: { name: string } | null } | null;
    setYearGroupId(c?.year_group_id || null);
    setYearGroupName(c?.year_groups?.name || null);
  }, [classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the class members when the tab opens
    load();
  }, [load]);

  const remove = async (p: Person) => {
    if (!(await askConfirm(`Remove ${p.name} from this class?`))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setMessage(null);
    const { error } = await supabase.from("enrolments").delete().eq("class_id", classId).eq("child_id", p.id);
    if (error) return setMessage(`Couldn't remove ${p.name}. ${error.message}`);
    setPeople((list) => (list || []).filter((x) => x.id !== p.id));
    onChanged?.();
  };

  if (people === null) return <Loading label="Loading…" />;

  const rate = (id: string) => (marks ? rateOf(marks.filter((m) => m.child_id === id)) : null);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gold-light bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-section">Teacher{teachers.length === 1 ? "" : "s"}</h2>
          <p className="t-meta">Teachers are assigned from People.</p>
        </div>
        {teachers.length === 0 ? (
          <p className="t-meta">No teacher assigned yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((t) => (
              <li key={`${t.user_id}-${t.role}`} className="flex items-center gap-3 rounded-xl bg-[var(--portal-soft)] px-3.5 py-3">
                <Avatar name={t.full_name} seed={t.user_id} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{t.full_name}</span>
                  <span className="t-meta block">{t.role === "teacher" ? "Teacher" : "Teaching assistant"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gold-light bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-section">
            Pupils <span className="font-normal text-ink-500">· {people.length}</span>
          </h2>
          <button type="button" onClick={() => setAdding(true)} className={`${ui.btnPrimary} ${ui.sm}`}>
            <Icon name="plus" size="sm" />
            Add participants
          </button>
        </div>
        {message && <p className="mb-3 rounded-xl bg-[var(--tone-bad-bg)] px-4 py-2.5 text-sm text-[var(--tone-bad)]">{message}</p>}
        {people.length === 0 ? (
          <p className="t-meta">No pupils enrolled yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3">
            {people.map((p) => {
              const r = rate(p.id);
              return (
                <li key={p.id} className="relative flex flex-col items-start gap-2 rounded-[0.875rem] border border-[var(--portal-line-soft)] bg-[var(--portal-soft)] p-4 transition-colors hover:border-forest-500">
                  <Avatar name={p.name} seed={p.id} size={40} />
                  <span className="min-w-0 max-w-full truncate text-sm font-semibold text-ink">
                    <PupilLink id={p.id} name={p.name} />
                  </span>
                  {marks && <Tag tone={r === null ? "neutral" : r >= 95 ? "good" : r >= 90 ? "neutral" : "warn"}>{r === null ? "No registers yet" : `${r}% attendance`}</Tag>}
                  <button type="button" onClick={() => remove(p)} aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`} className={`${ui.btnGhost} ${ui.sm} portal-btn--icon absolute right-1.5 top-1.5 !h-8 !min-h-8 !w-8 !min-w-8`}>
                    <Icon name="x" size="sm" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {adding && (
        <AddModal
          classId={classId}
          yearGroupId={yearGroupId}
          yearGroupName={yearGroupName}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
