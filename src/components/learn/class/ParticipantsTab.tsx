"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Person = { id: string; name: string };
type Teacher = { user_id: string; full_name: string; role: string };
type Candidate = { id: string; name: string; year_group_id: string | null };
type Places = { capacity: number | null; places_used: number | null; places_remaining: number | null; name: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add participants">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gold-light px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">Add participants</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-lg leading-none text-ink/65 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-2 border-b border-gold-light px-5 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pupils"
            aria-label="Search pupils"
            className="w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          {yearGroupId && (
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={onlyYear} onChange={(e) => setOnlyYear(e.target.checked)} />
              Only {yearGroupName || "this year group"}
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidates === null ? (
            <p className="px-5 py-4 text-sm text-ink/65">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink/65">No matching pupils to add.</p>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-cream">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                    <span className="truncate text-sm font-medium text-ink">{c.name}</span>
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
        <div className="flex items-center justify-between gap-3 border-t border-gold-light px-5 py-3">
          <span className="text-sm text-ink/65">{picked.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy || picked.size === 0} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
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
    if (!window.confirm(`Remove ${p.name} from this class?`)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setMessage(null);
    const { error } = await supabase.from("enrolments").delete().eq("class_id", classId).eq("child_id", p.id);
    if (error) return setMessage(`Couldn't remove ${p.name}. ${error.message}`);
    setPeople((list) => (list || []).filter((x) => x.id !== p.id));
    onChanged?.();
  };

  if (people === null) return <p className="text-sm text-ink/65">Loading…</p>;

  return (
    <div className="space-y-6">
      {teachers.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/65">Teacher{teachers.length === 1 ? "" : "s"}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((t) => (
              <li key={`${t.user_id}-${t.role}`} className="flex items-center gap-3 rounded-lg border border-gold-light/70 bg-cream/40 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-light text-xs font-semibold text-ink" aria-hidden="true">
                  {initials(t.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{t.full_name}</span>
                  <span className="block text-xs text-ink/65">{t.role === "teacher" ? "Teacher" : "Teaching assistant"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink/65">Teachers are assigned from People.</p>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/65">Pupils ({people.length})</h3>
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-900">
            + Add participants
          </button>
        </div>
        {message && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
        {people.length === 0 ? (
          <p className="text-sm text-ink/65">No pupils enrolled yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-gold-light/70 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-900" aria-hidden="true">
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                <button type="button" onClick={() => remove(p)} aria-label={`Remove ${p.name}`} className="rounded-md px-2 py-1 text-base leading-none text-ink/65 hover:bg-red-50 hover:text-red-700">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
