"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { HomeworkCard, type Homework } from "@/components/learn/homework/HomeworkCards";
import { getSupabaseClient } from "@/lib/supabase/client";

type ClassOpt = { id: string; name: string };

// datetime-local wants local "YYYY-MM-DDTHH:mm", not a UTC ISO string.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls = "w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm";

function AdminHomeworkContent() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState(""); // "" = all classes (filter) / none chosen (form)
  const [search, setSearch] = useState("");
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: cls }, { data: hw }] = await Promise.all([
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("homework").select("id, class_id, title, instructions, due_at, classes(name)").order("due_at", { ascending: false }),
    ]);
    setClasses((cls as ClassOpt[]) || []);
    setHomework((hw as unknown as Homework[]) || []);
  }, [supabase]);

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

  const reset = () => {
    setEditId(null);
    setTitle("");
    setInstructions("");
    setDueAt("");
    setError(null);
  };

  const startEdit = (h: Homework) => {
    setEditId(h.id);
    setClassId(h.class_id);
    setTitle(h.title);
    setInstructions(h.instructions || "");
    setDueAt(toLocalInput(h.due_at));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!supabase || !classId || !title.trim() || !dueAt) return;
    setBusy(true);
    setError(null);
    try {
      const fields = { title: title.trim(), instructions: instructions.trim() || null, due_at: new Date(dueAt).toISOString() };
      let err;
      if (editId) {
        ({ error: err } = await supabase.from("homework").update({ ...fields, class_id: classId, updated_at: new Date().toISOString() }).eq("id", editId));
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        // teacher_id is the setter - here the Headteacher/admin.
        ({ error: err } = await supabase.from("homework").insert({ ...fields, class_id: classId, teacher_id: user.id }));
      }
      if (err) {
        setError(err.message);
        return;
      }
      reset();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h: Homework) => {
    if (!supabase) return;
    if (!window.confirm(`Delete "${h.title}"? Submissions and marks for it will be deleted too.`)) return;
    const { error: err } = await supabase.from("homework").delete().eq("id", h.id);
    if (err) setError(err.message);
    else {
      if (editId === h.id) reset();
      await load();
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Homework" }]}
        title="Homework"
        subtitle="Set, edit and mark homework for any class. Students and families see it exactly as they would from a teacher."
      />

      <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Class</h2>
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
        <h2 className="font-serif text-h3 font-semibold text-ink">{editId ? "Edit homework" : "Set new homework"}</h2>
        <p className="mt-1 text-sm text-ink/60">{classId ? `For ${className}` : "Choose a class above to set homework."}</p>
        <div className="mt-3 space-y-3">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Objectives / instructions / resource links" rows={3} className={inputCls} />
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Due" className={`${inputCls} sm:w-64`} />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!classId || !title.trim() || !dueAt || busy}
              onClick={save}
              className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50"
            >
              {editId ? "Save changes" : "Set homework"}
            </button>
            {editId && (
              <button type="button" onClick={reset} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">{classId ? `Homework for ${className}` : "All homework"}</h2>
        <div className="mt-3 space-y-3">
          {homework === null ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-ink/60">No homework set yet.</p>
          ) : (
            shown.map((hw) => (
              <HomeworkCard
                key={hw.id}
                hw={hw}
                actions={
                  <>
                    <button type="button" onClick={() => startEdit(hw)} className="text-sm text-gold-700 underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(hw)} className="text-sm text-red-700 underline">
                      Delete
                    </button>
                  </>
                }
              />
            ))
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
