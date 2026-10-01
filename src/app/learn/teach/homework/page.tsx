"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMyClasses } from "@/lib/learn/useMyClasses";
import { HomeworkCard, type Homework } from "@/components/learn/homework/HomeworkCards";

function TeachHomeworkContent() {
  const supabase = getSupabaseClient();
  const [classId, setClassId] = useState("");
  const classes = useMyClasses((firstId) => setClassId((current) => current || firstId)) || [];
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: hwRows } = await supabase
      .from("homework")
      .select("id, class_id, title, instructions, due_at, classes(name)")
      .eq("teacher_id", user.id)
      .order("due_at", { ascending: false })
      .limit(60);
    setHomework((hwRows as unknown as Homework[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const create = async () => {
    if (!supabase || !classId || !title.trim() || !dueAt) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("homework").insert({
        class_id: classId,
        teacher_id: user.id,
        title: title.trim(),
        instructions: instructions.trim() || null,
        due_at: new Date(dueAt).toISOString(),
      });
      if (!error) {
        setTitle("");
        setInstructions("");
        setDueAt("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-h2 font-semibold text-ink">Homework</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Set new homework</h2>
        <div className="mt-3 space-y-3">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Objectives / instructions / resource links"
            rows={3}
            className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm sm:w-64"
          />
          <button
            type="button"
            disabled={!classId || !title.trim() || !dueAt || busy}
            onClick={create}
            className="rounded-lg bg-gold-700 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-gold-900 font-medium transition-colors"
          >
            Set homework
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Set homework</h2>
        <div className="mt-3 space-y-3">
          {homework === null ? (
            <div className="h-24 animate-pulse rounded-lg bg-cream" />
          ) : homework.length === 0 ? (
            <p className="text-sm text-ink/60">No homework set yet.</p>
          ) : (
            homework.map((hw) => <HomeworkCard key={hw.id} hw={hw} />)
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
