"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { HomeworkCard } from "@/components/learn/homework/HomeworkCards";
import { HomeworkEditor } from "@/components/learn/homework/HomeworkEditor";
import { LateMissingView } from "@/components/learn/homework/LateMissingView";
import { Switch } from "@/components/learn/homework/Switch";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";
import { getSupabaseClient } from "@/lib/supabase/client";

type ClassOpt = { id: string; name: string };

const inputCls = "w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm";

function AdminHomeworkContent() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState(""); // "" = all classes
  const [search, setSearch] = useState("");
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    let hwQuery = supabase.from("homework").select(HOMEWORK_COLUMNS);
    if (!showDeleted) hwQuery = hwQuery.is("archived_at", null);
    const [{ data: cls }, { data: hw }] = await Promise.all([supabase.from("classes").select("id, name").order("name"), hwQuery.order("due_at", { ascending: false })]);
    setClasses((cls as ClassOpt[]) || []);
    setHomework((hw as unknown as Homework[]) || []);
  }, [supabase, showDeleted]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const visibleClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (classes || []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id === classId);
  }, [classes, search, classId]);

  const shown = (homework || []).filter((h) => !classId || h.class_id === classId);
  const className = (classes || []).find((c) => c.id === classId)?.name;

  const startEdit = (h: Homework) => {
    setNote(null);
    setEditing(h);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Homework" }]}
        title="Homework"
        subtitle="Set, edit and mark homework for any class. Students and families see it exactly as they would from a teacher."
      />

      <div className="mb-6">
        <LateMissingView scope="admin" />
      </div>

      <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Filter by class</h2>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes…" aria-label="Search classes" className={`${inputCls} mt-3 sm:w-72`} />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose class">
          <button
            type="button"
            aria-pressed={classId === ""}
            onClick={() => setClassId("")}
            className={`rounded-full border px-3 py-1 text-sm ${classId === "" ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
          >
            All classes
          </button>
          {classes === null ? (
            <span className="text-sm text-ink/60">Loading…</span>
          ) : (
            visibleClasses.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={classId === c.id}
                onClick={() => setClassId(c.id)}
                className={`rounded-full border px-3 py-1 text-sm ${classId === c.id ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
              >
                {c.name}
              </button>
            ))
          )}
          {classes !== null && visibleClasses.length === 0 && <span className="text-sm text-ink/60">No classes match.</span>}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">{editing ? `Edit “${editing.title}”` : "Set new homework"}</h2>
        {note && (
          <p role="status" className="mt-2 text-sm text-amber-800">
            {note}
          </p>
        )}
        <div className="mt-3">
          {classes === null ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : (
            <HomeworkEditor
              key={editing?.id ?? "new"}
              classes={classes}
              initialClassId={classId || undefined}
              editing={editing}
              onCancel={editing ? () => setEditing(null) : undefined}
              onSaved={(n) => {
                setNote(n ?? null);
                setEditing(null);
                load();
              }}
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">{classId ? `Homework for ${className}` : "All homework"}</h2>
          <div className="w-56">
            <Switch label="Show deleted" checked={showDeleted} onChange={setShowDeleted} />
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {homework === null ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-ink/60">No homework set yet.</p>
          ) : (
            shown.map((hw) => <HomeworkCard key={hw.id} hw={hw} onEdit={startEdit} onChanged={load} />)
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminHomeworkContent />
      </LearnGate>
    </section>
  );
}
