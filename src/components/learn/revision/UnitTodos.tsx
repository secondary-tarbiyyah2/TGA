"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStudentChildId } from "@/lib/learn/classes";

type Todo = { id: string; body: string };

/**
 * The unit's to-do list on the pupil's revision page (Tafweed T2, migration
 * 0184). RLS returns items only once a teacher has shown the list, so an
 * empty result simply hides this. Ticks are the pupil's own and are saved
 * through revision_tick_todo().
 */
export function UnitTodos({ unitId }: { unitId: string }) {
  const supabase = getSupabaseClient();
  const childId = useStudentChildId();
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    let alive = true;
    (async () => {
      const { data, error: err } = await supabase.from("revision_todos").select("id, body").eq("unit_id", unitId).order("sort_order");
      if (!alive || err) return;
      const list = (data as Todo[]) || [];
      setTodos(list);
      if (!list.length) return;
      const { data: ticks } = await supabase.from("revision_todo_ticks").select("todo_id").eq("child_id", childId).in("todo_id", list.map((t) => t.id));
      if (alive) setDone(new Set(((ticks as { todo_id: string }[]) || []).map((t) => t.todo_id)));
    })();
    return () => {
      alive = false;
    };
  }, [supabase, unitId, childId]);

  if (!todos || !todos.length) return null;

  async function toggle(id: string, on: boolean) {
    if (!supabase) return;
    setError(null);
    setDone((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    const { error: err } = await supabase.rpc("revision_tick_todo", { p_todo: id, p_done: on });
    if (err) {
      setError("Couldn't save that tick. Try again.");
      setDone((s) => {
        const n = new Set(s);
        if (on) n.delete(id);
        else n.add(id);
        return n;
      });
    }
  }

  const count = todos.filter((t) => done.has(t.id)).length;
  return (
    <section aria-labelledby={`todos-${unitId}`} className="rounded-2xl border border-gold-light bg-white p-4">
      <h3 id={`todos-${unitId}`} className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-ink">
        Your to-do list
        <span className="text-sm font-normal text-ink/65">
          {count} of {todos.length} done
        </span>
      </h3>
      <ul className="mt-2 space-y-1.5">
        {todos.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 text-sm text-ink hover:bg-cream">
              <input type="checkbox" checked={done.has(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700" />
              <span className={done.has(t.id) ? "text-ink/60 line-through" : ""}>{t.body}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
