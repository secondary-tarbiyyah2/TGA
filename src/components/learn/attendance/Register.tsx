"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type Status = "present" | "late" | "absent" | "excused";
export const STATUSES: { value: Status; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "bg-green-600 text-white" },
  { value: "late", label: "Late", on: "bg-amber-500 text-white" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white" },
  { value: "excused", label: "Excused", on: "bg-slate-500 text-white" },
];

/** One-click register: everyone shows as Present until you change them;
 * every tap saves straight away. "Mark everyone else present" saves the
 * untouched rows in one go. */
export function Register({ lessonId, classId, onProgress }: { lessonId: string; classId: string; onProgress?: (taken: number, total: number) => void }) {
  const [children, setChildren] = useState<{ id: string; name: string }[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const marksRef = useRef<Record<string, Status>>({});
  const totalRef = useRef(0);
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const [{ data: enr }, { data: att }] = await Promise.all([
        supabase.from("enrolments").select("children(id, name)").eq("class_id", classId),
        supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", lessonId),
      ]);
      totalRef.current = ((enr as unknown as { children: unknown }[]) || []).filter((r) => r.children).length;
      setChildren(
        (((enr as unknown as { children: { id: string; name: string } | null }[]) || []).map((r) => r.children).filter(Boolean) as { id: string; name: string }[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      const m: Record<string, Status> = {};
      for (const a of (att as { child_id: string; status: Status }[]) || []) m[a.child_id] = a.status;
      setMarks(m);
      marksRef.current = m;
      const list = ((enr as unknown as { children: { id: string } | null }[]) || []).filter((r) => r.children);
      onProgress?.(list.filter((r) => r.children && m[r.children.id]).length, list.length);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, classId]);

  const save = useCallback(
    async (entries: { childId: string; status: Status }[]) => {
      const supabase = getSupabaseClient();
      if (!supabase || entries.length === 0) return;
      // Optimistic: show the choice immediately, then confirm or flag.
      setMarks((m) => ({ ...m, ...Object.fromEntries(entries.map((e) => [e.childId, e.status])) }));
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, "saving" as const])) }));
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("attendance_records").upsert(
        entries.map((e) => ({ lesson_instance_id: lessonId, child_id: e.childId, status: e.status, marked_by: userId, marked_at: new Date().toISOString() })),
        { onConflict: "lesson_instance_id,child_id" },
      );
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, error ? ("error" as const) : ("saved" as const)])) }));
      if (!error) {
        const next = { ...marksRef.current, ...Object.fromEntries(entries.map((e) => [e.childId, e.status])) };
        marksRef.current = next;
        onProgress?.(Object.keys(next).length, totalRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonId],
  );

  if (children === null) return <p className="px-5 py-4 text-sm text-ink/55">Loading register…</p>;
  if (children.length === 0) return <p className="px-5 py-4 text-sm text-ink/55">No students enrolled in this class yet.</p>;
  const unmarked = children.filter((c) => !marks[c.id]);
  const taken = children.length - unmarked.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light/70 px-5 py-3">
        <p className="text-sm text-ink/70">
          <span className="font-semibold text-ink">
            {taken}/{children.length}
          </span>{" "}
          marked
        </p>
        {unmarked.length > 0 && (
          <button
            type="button"
            onClick={() => save(unmarked.map((c) => ({ childId: c.id, status: "present" })))}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Mark {taken === 0 ? "everyone" : "everyone else"} present
          </button>
        )}
      </div>
      <ul className="divide-y divide-gold-light/70">
        {children.map((c) => {
          const current = marks[c.id];
          const shown = current || "present";
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
              <span className="w-14 text-right text-xs text-ink/45" aria-live="polite">
                {saving[c.id] === "saving" ? "Saving…" : saving[c.id] === "error" ? <span className="text-red-700">Not saved</span> : saving[c.id] === "saved" ? "Saved" : current ? "" : "Not yet"}
              </span>
              <div role="radiogroup" aria-label={`Attendance for ${c.name}`} className="flex overflow-hidden rounded-lg border border-gold-light">
                {STATUSES.map((st) => {
                  const on = shown === st.value;
                  return (
                    <button
                      key={st.value}
                      type="button"
                      role="radio"
                      aria-checked={on && !!current}
                      onClick={() => save([{ childId: c.id, status: st.value }])}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${on ? (current ? st.on : "bg-green-50 text-green-800") : "bg-white text-ink/60 hover:bg-cream"}`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

