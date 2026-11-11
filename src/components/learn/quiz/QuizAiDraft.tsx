"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { aiAssist, aiErrorMessage, useAiStatus } from "@/lib/learn/aiAssist";
import { fetchClass } from "@/lib/learn/classes";
import { QTYPES, fromAi, type DraftQuestion, type QType } from "@/lib/learn/quiz";

type Lesson = { lesson_no: number; title: string; unit: string | null };

function yearKey(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/reception/i.test(name)) return "reception";
  const m = /(\d{1,2})/.exec(name);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 11 ? `y${n}` : null;
}

const AI_TYPES = QTYPES.filter((t) => t.type !== "label");

/**
 * "Generate with AI": drafts a well-structured quiz from a unit (or some of its lessons) of the
 * class's subject and year, through the ai-assist Edge Function. Nothing is saved or shown to
 * pupils: the questions are added to the builder marked "Drafted by AI", and the teacher checks
 * and edits each one before the quiz can be set. Only lesson content goes to the AI.
 */
export function QuizAiDraft({ classId, existing, open, setOpen, onDrafted }: { classId: string; existing: string[]; open: boolean; setOpen: (v: boolean) => void; onDrafted: (qs: DraftQuestion[]) => void }) {
  const status = useAiStatus();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [unit, setUnit] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [count, setCount] = useState(8);
  const [types, setTypes] = useState<QType[]>(["single", "multiple", "true_false", "short", "matching", "ordering", "long"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open || lessons !== null) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const cls = await fetchClass(classId);
      const yk = yearKey(cls?.yearGroup);
      if (!cls?.subject || !yk) return setLessons([]);
      const { data } = await supabase.from("curriculum_lessons").select("lesson_no, title, unit").eq("year", yk).ilike("subject", cls.subject).order("lesson_no");
      setLessons((data as Lesson[] | null) || []);
    })();
  }, [open, lessons, classId]);

  const units = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons || []) {
      const u = l.unit || "Lessons";
      m.set(u, [...(m.get(u) || []), l]);
    }
    return [...m.entries()];
  }, [lessons]);
  const unitLessons = units.find(([u]) => u === unit)?.[1] || [];

  if (status && !(status.configured && status.can.quiz_questions)) return null;

  const run = async () => {
    if (!unit) return setError("Choose a unit.");
    if (!types.length) return setError("Choose at least one type of question.");
    setBusy(true);
    setError(null);
    const r = await aiAssist("quiz_questions", { class_id: classId, unit, lesson_nos: picked, count, types, avoid: existing.filter(Boolean).slice(0, 40) });
    setBusy(false);
    if (!r.ok) return setError(aiErrorMessage(r));
    const qs = ((r.questions as Record<string, unknown>[]) || []).map(fromAi).filter((q): q is DraftQuestion => !!q);
    if (!qs.length) return setError("The AI couldn't write questions from that unit. Try another unit or fewer types.");
    onDrafted(qs);
    setDone(`${qs.length} questions added from ${unit}. Check each one: tick it when it is right.`);
    setOpen(false);
  };

  return (
    <section className="rounded-xl border border-gold-light bg-white p-4" data-guide="quiz-ai">
      <p className="t-eyebrow mb-1">Generate with AI</p>
      <p className="text-sm text-ink/70">A draft quiz from a unit&apos;s lessons: objectives, key words, mixed difficulty, answers and explanations. You check every question before pupils see it.</p>
      <button type="button" className={`${ui.btnSecondary} mt-3 w-full`} onClick={() => (setOpen(true), setDone(null))} disabled={status === null}>
        <Icon name="sparkles" size="sm" />
        Draft questions from a unit
      </button>
      {done && (
        <p role="status" className="mt-2 text-xs text-forest-800">
          {done}
        </p>
      )}

      {open && (
        <Dialog
          title="Draft a quiz from a unit"
          description="Drafted by AI from the Lesson library. Check before setting."
          size="lg"
          onClose={() => !busy && setOpen(false)}
          footer={
            <>
              <button type="button" className={ui.btnGhost} onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={ui.btnPrimary} onClick={run} disabled={busy || !unit}>
                <Icon name="sparkles" size="sm" />
                {busy ? "Drafting… (up to a minute)" : `Draft ${count} questions`}
              </button>
            </>
          }
        >
          <div className="space-y-4 pb-1">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Unit</p>
              {lessons === null ? (
                <div className="h-20 motion-safe:animate-pulse rounded-lg bg-cream" />
              ) : units.length === 0 ? (
                <p className="text-sm text-ink/70">There are no lessons for this class&apos;s subject and year in the Lesson library yet, so there is nothing to draft from.</p>
              ) : (
                <ul role="radiogroup" aria-label="Unit" className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {units.map(([u, ls]) => (
                    <li key={u}>
                      <button type="button" role="radio" aria-checked={unit === u} onClick={() => (setUnit(u), setPicked([]))} className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${unit === u ? "border-forest-700 bg-forest-50 ring-1 ring-inset ring-forest-700" : "border-gold-light bg-white hover:bg-cream"}`}>
                        <span className="font-medium text-ink">{u}</span>
                        <span className="shrink-0 text-xs text-ink/60">{ls.length} lessons</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {unitLessons.length > 1 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Lessons (all, unless you choose some)</p>
                <div className="flex flex-wrap gap-1.5">
                  {unitLessons.map((l) => {
                    const on = picked.includes(l.lesson_no);
                    return (
                      <button key={l.lesson_no} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== l.lesson_no) : [...p, l.lesson_no]))} className={on ? ui.chipOn : ui.chip} title={l.title}>
                        {l.title.length > 38 ? `${l.title.slice(0, 36)}…` : l.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink" id="ai-count">
                  How many
                </p>
                <div role="radiogroup" aria-labelledby="ai-count" className="inline-flex rounded-xl bg-cream p-1">
                  {[5, 8, 10, 15].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={`min-h-11 rounded-lg px-3 text-sm font-medium sm:min-h-8 ${count === n ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Types of question</p>
                <div className="flex flex-wrap gap-1.5">
                  {AI_TYPES.map((t) => {
                    const on = types.includes(t.type);
                    return (
                      <button key={t.type} type="button" aria-pressed={on} onClick={() => setTypes((x) => (on ? x.filter((y) => y !== t.type) : [...x, t.type]))} className={on ? ui.chipOn : ui.chip}>
                        <Icon name={t.icon} size="sm" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
