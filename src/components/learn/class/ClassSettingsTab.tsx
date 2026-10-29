"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeHttpUrl } from "@/lib/learn/markup";
import { fetchClassSettings, type ClassSettings, type GradeCalculation, type GradeCategory } from "@/lib/learn/classSettings";
import { Switch } from "@/components/learn/class/AnnouncementComposer";

type AssessmentType = { id: string; name: string };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <h2 className="border-b border-gold-light px-5 py-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

const input = "w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm";

/**
 * Class settings (teacher of the class, head, admin): details, what pupils
 * may do in the stream, and how grades are handled. Switches save the moment
 * they are flipped; the text details have their own Save button.
 */
export function ClassSettingsTab({ classId, className, subject, canRename }: { classId: string; className: string; subject: string | null; canRename: boolean }) {
  const [s, setS] = useState<ClassSettings | null>(null);
  const [cats, setCats] = useState<GradeCategory[]>([]);
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [name, setName] = useState(className);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [newCat, setNewCat] = useState({ name: "", weight: "" });

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [settings, c, t] = await Promise.all([
      fetchClassSettings(classId),
      supabase.from("class_grade_categories").select("id, name, weight, assessment_type_id").eq("class_id", classId).order("position").order("name"),
      supabase.from("assessment_types").select("id, name").order("name"),
    ]);
    setS(settings);
    setCats(
      ((c.data as unknown as { id: string; name: string; weight: number | string; assessment_type_id: string | null }[]) || []).map((r) => ({ id: r.id, name: r.name, weight: Number(r.weight), assessmentTypeId: r.assessment_type_id })),
    );
    setTypes((t.data as unknown as AssessmentType[]) || []);
  }, [classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const persist = async (next: ClassSettings, okText = "Saved."): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const link = next.meetingLink.trim() ? safeHttpUrl(next.meetingLink) : "";
    if (link === null || (link && !link.startsWith("https://"))) {
      setMsg({ tone: "err", text: "The meeting link must be a full https:// address." });
      return false;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("class_settings").upsert(
      {
        class_id: classId,
        description: next.description.trim() || null,
        section: next.section.trim() || null,
        room: next.room.trim() || null,
        meeting_link: link || null,
        students_can_comment: next.studentsCanComment,
        show_deleted_to_staff: next.showDeletedToStaff,
        auto_draft_missing: next.autoDraftMissing,
        auto_draft_percent: Math.min(100, Math.max(0, Math.round(next.autoDraftPercent) || 0)),
        show_overall_grade: next.showOverallGrade,
        grade_calculation: next.gradeCalculation,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "class_id" },
    );
    if (error) {
      setMsg({ tone: "err", text: "Could not save. Check you teach this class." });
      return false;
    }
    setMsg({ tone: "ok", text: okText });
    return true;
  };

  const toggle = async (patch: Partial<ClassSettings>) => {
    if (!s) return;
    const prev = s;
    const next = { ...s, ...patch };
    setS(next);
    if (!(await persist(next))) setS(prev);
  };

  const saveDetails = async () => {
    const supabase = getSupabaseClient();
    if (!s || !supabase) return;
    const ok = await persist(s, "Details saved.");
    if (!ok) return;
    // Keep the recurring meeting link the lesson "Join" falls back on in step.
    const { error } = await supabase.rpc("set_class_meeting_url", { p_class_id: classId, p_url: s.meetingLink.trim() ? safeHttpUrl(s.meetingLink) : null });
    if (error) setMsg({ tone: "err", text: "Details saved, but the join link for lessons could not be updated." });
    if (canRename && name.trim() && name.trim() !== className) {
      const { error: e2 } = await supabase.from("classes").update({ name: name.trim() }).eq("id", classId);
      if (e2) setMsg({ tone: "err", text: "Details saved, but the class name could not be changed." });
    }
  };

  const addCat = async () => {
    const supabase = getSupabaseClient();
    const w = Number(newCat.weight);
    if (!supabase || !newCat.name.trim() || !Number.isFinite(w) || w < 0 || w > 100) return setMsg({ tone: "err", text: "Give the category a name and a weight between 0 and 100." });
    const { error } = await supabase.from("class_grade_categories").insert({ class_id: classId, name: newCat.name.trim(), weight: w, position: cats.length + 1 });
    if (error) return setMsg({ tone: "err", text: error.code === "23505" ? "There is already a category with that name." : "Could not add the category." });
    setNewCat({ name: "", weight: "" });
    setMsg({ tone: "ok", text: "Category added." });
    load();
  };

  const updateCat = async (c: GradeCategory, patch: { weight?: number; assessment_type_id?: string | null }) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from("class_grade_categories").update(patch).eq("id", c.id);
    if (error) setMsg({ tone: "err", text: "Could not update the category." });
    else setMsg({ tone: "ok", text: "Saved." });
    load();
  };

  const removeCat = async (c: GradeCategory) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm(`Delete the grade category "${c.name}"?`)) return;
    const { error } = await supabase.from("class_grade_categories").delete().eq("id", c.id);
    if (error) setMsg({ tone: "err", text: "Could not delete the category." });
    load();
  };

  if (!s) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  const total = cats.reduce((a, c) => a + c.weight, 0);
  const set = (patch: Partial<ClassSettings>) => setS({ ...s, ...patch });

  return (
    <div className="space-y-5">
      {msg && (
        <p role={msg.tone === "err" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.tone === "err" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
          {msg.text}
        </p>
      )}

      <Group title="Class details">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Class name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename} className={`${input} mt-1 disabled:bg-cream/60`} />
            {!canRename && <span className="mt-1 block text-xs font-normal text-ink/65">The office changes the class name in Academic setup.</span>}
          </label>
          <label className="block text-sm font-medium text-ink">
            Subject
            <input type="text" value={subject || ""} disabled className={`${input} mt-1 bg-cream/60`} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Section
            <input type="text" value={s.section} onChange={(e) => set({ section: e.target.value })} maxLength={60} placeholder="e.g. Group A" className={`${input} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Room
            <input type="text" value={s.room} onChange={(e) => set({ room: e.target.value })} maxLength={120} placeholder="e.g. Online, or Room 2" className={`${input} mt-1`} />
          </label>
        </div>
        <label className="block text-sm font-medium text-ink">
          Description
          <textarea value={s.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} rows={3} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Virtual lesson link
          <input type="url" value={s.meetingLink} onChange={(e) => set({ meetingLink: e.target.value })} placeholder="https://… (Teams, Meet or Zoom)" className={`${input} mt-1`} />
          <span className="mt-1 block text-xs font-normal text-ink/65">This is where &ldquo;Join lesson&rdquo; takes pupils and families.</span>
        </label>
        <button type="button" onClick={saveDetails} className="rounded-lg bg-gold-700 px-5 py-2 text-sm font-medium text-white hover:bg-gold-900">
          Save details
        </button>
      </Group>

      <Group title="Stream">
        <Switch checked={s.studentsCanComment} onChange={(v) => toggle({ studentsCanComment: v })} label="Pupils can comment" hint="Off by default. When on, pupils can reply on posts that allow comments. Parents never comment here (they use Messages)." />
        <Switch checked={s.showDeletedToStaff} onChange={(v) => toggle({ showDeletedToStaff: v })} label="Show deleted items to staff" hint="Removed announcements and comments stay visible to teachers, greyed out, for safeguarding records." />
      </Group>

      <Group title="Grades">
        <Switch checked={s.autoDraftMissing} onChange={(v) => toggle({ autoDraftMissing: v })} label="Auto draft grade for missing work" hint="Missing homework gets a draft mark of the percentage below, for the teacher to confirm." />
        {s.autoDraftMissing && (
          <label className="flex items-center gap-2 text-sm text-ink">
            Draft grade for missing work
            <input
              type="text" inputMode="decimal"
              min={0}
              max={100}
              value={s.autoDraftPercent}
              onChange={(e) => set({ autoDraftPercent: Number(e.target.value) })}
              onBlur={() => toggle({})}
              className="w-20 rounded-lg border border-gold-light/70 px-2 py-1.5 text-sm"
            />
            %
          </label>
        )}
        <Switch checked={s.showOverallGrade} onChange={(v) => toggle({ showOverallGrade: v })} label="Show overall grade to pupils" hint="Pupils and parents see one overall percentage on the Grades tab." />
        <label className="block text-sm font-medium text-ink">
          Overall grade calculation
          <select value={s.gradeCalculation} onChange={(e) => toggle({ gradeCalculation: e.target.value as GradeCalculation })} className="ml-3 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm font-normal">
            <option value="average">Average of all results</option>
            <option value="weighted">Weighted by category</option>
          </select>
        </label>

        <div>
          <h3 className="text-sm font-semibold text-ink">Grade categories</h3>
          <p className="mt-1 text-xs text-ink/65">Used when the calculation is &ldquo;Weighted by category&rdquo;. Link a category to an assessment type so results count towards it.</p>
          {cats.length === 0 && <p className="mt-2 text-sm text-ink/65">No categories yet.</p>}
          <ul className="mt-2 divide-y divide-gold-light/60">
            {cats.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-[8rem] flex-1 text-sm font-medium text-ink">{c.name}</span>
                <select aria-label={`Assessment type for ${c.name}`} value={c.assessmentTypeId ?? ""} onChange={(e) => updateCat(c, { assessment_type_id: e.target.value || null })} className="rounded-lg border border-gold-light/70 px-2 py-1 text-sm">
                  <option value="">Not linked</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-sm text-ink/70">
                  <input
                    type="text" inputMode="decimal"
                    min={0}
                    max={100}
                    defaultValue={c.weight}
                    aria-label={`Weight for ${c.name}`}
                    onBlur={(e) => {
                      const w = Number(e.target.value);
                      if (Number.isFinite(w) && w >= 0 && w <= 100 && w !== c.weight) updateCat(c, { weight: w });
                    }}
                    className="w-20 rounded-lg border border-gold-light/70 px-2 py-1 text-sm"
                  />
                  %
                </label>
                <button type="button" onClick={() => removeCat(c)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {cats.length > 0 && <p className={`mt-2 text-xs ${Math.round(total) === 100 ? "text-green-800" : "text-amber-800"}`}>Weights add up to {Math.round(total * 10) / 10}%{Math.round(total) === 100 ? "." : " (they do not have to reach 100; they are scaled)."}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <input type="text" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Category, e.g. Tests" aria-label="Category name" maxLength={60} className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm" />
            <input type="text" inputMode="decimal" min={0} max={100} value={newCat.weight} onChange={(e) => setNewCat({ ...newCat, weight: e.target.value })} placeholder="Weight %" aria-label="Category weight" className="w-28 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm" />
            <button type="button" onClick={addCat} className="rounded-lg border border-gold-light px-4 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
              Add category
            </button>
          </div>
        </div>
      </Group>
    </div>
  );
}
