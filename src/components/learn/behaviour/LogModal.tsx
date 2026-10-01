"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  DEMERIT_CATEGORIES,
  INCIDENT_CATEGORIES,
  MERIT_CATEGORIES,
  addDaysIso,
  todayIso,
  type BehaviourKind,
  type StudentOption,
} from "./data";

const keyOf = (s: StudentOption) => `${s.childId}:${s.classId || ""}`;

/** Next school-ish day: tomorrow, skipping Saturday/Sunday. */
function nextWeekday(): string {
  let d = addDaysIso(todayIso(), 1);
  for (let i = 0; i < 3; i++) {
    const day = new Date(`${d}T12:00:00`).getDay();
    if (day !== 0 && day !== 6) break;
    d = addDaysIso(d, 1);
  }
  return d;
}

export function LogModal({
  students,
  initialKind = "merit",
  allowIncident = false,
  initialChildId,
  onClose,
  onSaved,
}: {
  students: StudentOption[];
  initialKind?: BehaviourKind;
  allowIncident?: boolean;
  initialChildId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<BehaviourKind>(initialKind);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>(() => {
    const first = initialChildId ? students.find((s) => s.childId === initialChildId) : undefined;
    return first ? [keyOf(first)] : [];
  });
  const [category, setCategory] = useState("");
  const [points, setPoints] = useState<number>(0);
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [detention, setDetention] = useState(false);
  const [detDate, setDetDate] = useState(nextWeekday());
  const [detMinutes, setDetMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? students.filter((s) => s.name.toLowerCase().includes(q) || (s.className || "").toLowerCase().includes(q)) : students;
    return list.slice(0, 40);
  }, [students, search]);

  const chooseKind = (k: BehaviourKind) => {
    setKind(k);
    setCategory("");
    setPoints(0);
    setDetention(false);
  };

  const chooseCategory = (label: string, pts: number) => {
    setCategory(label);
    setPoints(pts);
  };

  const toggle = (s: StudentOption) => {
    const k = keyOf(s);
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const chosen = students.filter((s) => picked.includes(keyOf(s)));
    if (chosen.length === 0) return setError("Choose at least one student.");
    if (!category.trim()) return setError("Choose a category.");
    if (kind !== "incident" && points === 0) return setError("Set the points.");
    if (kind === "incident" && !note.trim()) return setError("Describe what happened.");
    setBusy(true);
    setError(null);
    const rows = chosen.map((s) => ({
      child_id: s.childId,
      class_id: s.classId,
      kind,
      points: kind === "merit" ? Math.abs(points) : kind === "demerit" ? -Math.abs(points) : 0,
      category: category.trim(),
      note: note.trim() || null,
      occurred_on: occurredOn,
    }));
    const { data, error: err } = await supabase.from("behaviour_records").insert(rows).select("id, child_id");
    if (err) {
      setBusy(false);
      return setError("Couldn't save. You can only log for students you teach.");
    }
    if (kind === "demerit" && detention) {
      const saved = (data as { id: string; child_id: string }[] | null) || [];
      const dets = saved.map((r) => ({
        child_id: r.child_id,
        behaviour_record_id: r.id,
        scheduled_for: detDate,
        duration_minutes: detMinutes,
        notes: category.trim(),
      }));
      const { error: dErr } = await supabase.from("detentions").insert(dets);
      if (dErr) {
        setBusy(false);
        onSaved();
        return setError("The record was saved but the detention could not be created.");
      }
    }
    setBusy(false);
    onSaved();
  };

  const cats = kind === "merit" ? MERIT_CATEGORIES : kind === "demerit" ? DEMERIT_CATEGORIES : [];
  const kinds: { id: BehaviourKind; label: string }[] = [
    { id: "merit", label: "Merit" },
    { id: "demerit", label: "Demerit" },
    ...(allowIncident ? [{ id: "incident" as BehaviourKind, label: "Incident" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Log behaviour">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Log {kind === "incident" ? "an incident" : "a merit or demerit"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/55 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="flex gap-2" role="group" aria-label="Type">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => chooseKind(k.id)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  kind === k.id
                    ? k.id === "merit"
                      ? "border-green-700 bg-green-700 text-white"
                      : k.id === "demerit"
                        ? "border-red-700 bg-red-700 text-white"
                        : "border-amber-600 bg-amber-600 text-white"
                    : "border-gold-light bg-white text-ink/70 hover:bg-cream"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="text-sm">
            <p className="mb-1 font-medium text-ink">
              Students{picked.length > 0 ? ` (${picked.length} selected)` : ""}
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or class…"
              aria-label="Search students"
              className="w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
            />
            <ul className="mt-2 max-h-44 divide-y divide-gold-light/40 overflow-y-auto rounded-lg border border-gold-light/60">
              {matches.length === 0 && <li className="px-3 py-3 text-ink/55">No students match.</li>}
              {matches.map((s) => {
                const on = picked.includes(keyOf(s));
                return (
                  <li key={keyOf(s)}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(s)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${on ? "bg-teal-50" : "hover:bg-cream"}`}>
                      <span className="min-w-0 truncate text-ink">{s.name}</span>
                      <span className="shrink-0 text-xs text-ink/50">{on ? "Selected" : s.className || ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {kind === "incident" ? (
            <label className="block text-sm">
              <span className="font-medium text-ink">Type of incident</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm">
                <option value="">Choose…</option>
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink/50">If a child may be at risk, use Raise a concern instead.</span>
            </label>
          ) : (
            <div className="text-sm">
              <p className="mb-1 font-medium text-ink">Quick pick</p>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const on = category === c.label;
                  return (
                    <button
                      key={c.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => chooseCategory(c.label, c.points)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                        on ? (kind === "merit" ? "border-green-700 bg-green-700 text-white" : "border-red-700 bg-red-700 text-white") : "border-gold-light bg-white text-ink/75 hover:bg-cream"
                      }`}
                    >
                      {c.label} ({c.points > 0 ? `+${c.points}` : c.points})
                    </button>
                  );
                })}
              </div>
              <label className="mt-3 block">
                <span className="font-medium text-ink">Points</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={Math.abs(points) || ""}
                  onChange={(e) => setPoints(Math.max(0, Math.min(10, Number(e.target.value) || 0)) * (kind === "demerit" ? -1 : 1))}
                  className="ml-2 w-20 rounded-lg border border-gold-light px-3 py-1.5 text-sm"
                />
              </label>
            </div>
          )}

          <label className="block text-sm">
            <span className="font-medium text-ink">Note {kind === "incident" ? "" : "(optional)"}</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-ink">Date</span>
            <input type="date" value={occurredOn} max={todayIso()} onChange={(e) => setOccurredOn(e.target.value || todayIso())} className="mt-1 block rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>

          {kind === "demerit" && (
            <div className="rounded-lg border border-gold-light/60 bg-cream/40 p-3 text-sm">
              <label className="flex items-center gap-2 font-medium text-ink">
                <input type="checkbox" checked={detention} onChange={(e) => setDetention(e.target.checked)} />
                Issue a detention
              </label>
              {detention && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <label>
                    <span className="block text-xs text-ink/60">Date</span>
                    <input type="date" value={detDate} min={todayIso()} onChange={(e) => setDetDate(e.target.value || nextWeekday())} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm" />
                  </label>
                  <label>
                    <span className="block text-xs text-ink/60">Minutes</span>
                    <input type="number" min={5} max={120} step={5} value={detMinutes} onChange={(e) => setDetMinutes(Math.max(5, Number(e.target.value) || 30))} className="w-24 rounded-lg border border-gold-light px-3 py-1.5 text-sm" />
                  </label>
                </div>
              )}
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gold-light px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
