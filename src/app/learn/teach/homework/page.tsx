"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMyClasses } from "@/lib/learn/useMyClasses";
import { HomeworkCard } from "@/components/learn/homework/HomeworkCards";
import { HomeworkEditor } from "@/components/learn/homework/HomeworkEditor";
import { LateMissingView } from "@/components/learn/homework/LateMissingView";
import { Switch } from "@/components/learn/homework/Switch";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";

function TeachHomeworkContent() {
  const supabase = getSupabaseClient();
  const classes = useMyClasses();
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const classIds = useMemo(() => (classes || []).map((c) => c.id), [classes]);

  const load = useCallback(async () => {
    if (!supabase || classes === null) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Homework this teacher set, plus homework any colleague set for a class they teach.
    const scope = classIds.length > 0 ? `teacher_id.eq.${user.id},class_id.in.(${classIds.join(",")})` : `teacher_id.eq.${user.id}`;
    let q = supabase.from("homework").select(HOMEWORK_COLUMNS).or(scope);
    if (!showDeleted) q = q.is("archived_at", null);
    const { data } = await q.order("due_at", { ascending: false }).limit(80);
    setHomework((data as unknown as Homework[]) || []);
  }, [supabase, classes, classIds, showDeleted]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const startEdit = (hw: Homework) => {
    setNote(null);
    setEditing(hw);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Homework</h1>
      </div>

      <LateMissingView scope="teach" />

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">{editing ? `Edit “${editing.title}”` : "Set new homework"}</h2>
        {note && (
          <p role="status" className="mt-2 text-sm text-amber-800">
            {note}
          </p>
        )}
        <div className="mt-3">
          <HomeworkEditor
            key={editing?.id ?? "new"}
            classes={classes || []}
            editing={editing}
            onCancel={editing ? () => setEditing(null) : undefined}
            onSaved={(n) => {
              setNote(n ?? null);
              setEditing(null);
              load();
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">Your homework</h2>
          <div className="w-56">
            <Switch label="Show deleted" checked={showDeleted} onChange={setShowDeleted} />
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {homework === null ? (
            <div className="h-24 animate-pulse rounded-lg bg-cream" />
          ) : homework.length === 0 ? (
            <p className="text-sm text-ink/60">No homework set yet.</p>
          ) : (
            homework.map((hw) => <HomeworkCard key={hw.id} hw={hw} onEdit={startEdit} onChanged={load} />)
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeachHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachHomeworkContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
