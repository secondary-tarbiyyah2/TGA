"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { ActionsMenu } from "@/components/learn/kit";
import { QTYPES, changeType, questionProblem, type DraftQuestion, type QType } from "@/lib/learn/quiz";

const smallBtn = `${ui.btnGhost} ${ui.sm}`;
const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * The question types as visual cards (owner, 11 Nov 2026, items 6 and 15: "quiz questions
 * are a dropdown"; never a plain dropdown). `compact` shows them as a row of segmented buttons
 * for changing a question's type in place.
 */
export function QuestionTypePicker({ value, onPick, compact = false, label = "Question type" }: { value?: QType; onPick: (t: QType) => void; compact?: boolean; label?: string }) {
  if (compact) {
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-cream p-1">
        {QTYPES.map((t) => {
          const on = t.type === value;
          return (
            <button
              key={t.type}
              type="button"
              role="radio"
              aria-checked={on}
              title={t.hint}
              onClick={() => onPick(t.type)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors sm:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700 ${on ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70 hover:text-ink"}`}
            >
              <Icon name={t.icon} size="sm" />
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={label}>
      {QTYPES.map((t) => (
        <li key={t.type}>
          <button
            type="button"
            onClick={() => onPick(t.type)}
            className="flex h-full min-h-[4.5rem] w-full items-start gap-2.5 rounded-xl border border-gold-light bg-white p-3 text-left transition-colors hover:border-forest-700/50 hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700"
          >
            <Icon name={t.icon} className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{t.label}</span>
              <span className="block text-xs text-ink/65">{t.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink/70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/60">{hint}</span>}
    </label>
  );
}

/** A list of text rows (options, accepted answers, items to order) with add, remove and move. */
function ListRows({
  items,
  onChange,
  placeholder,
  addLabel,
  min = 1,
  max = 8,
  lead,
  movable = false,
  name,
}: {
  items: string[];
  onChange: (next: string[], removedIndex?: number) => void;
  placeholder: (i: number) => string;
  addLabel: string;
  min?: number;
  max?: number;
  lead?: (i: number) => ReactNode;
  movable?: boolean;
  name: string;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {items.map((v, i) => (
          <li key={i} className="flex items-center gap-2">
            {lead?.(i)}
            <input type="text" value={v} maxLength={300} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} placeholder={placeholder(i)} aria-label={`${name} ${i + 1}`} className={`${ui.input} flex-1`} />
            {movable && (
              <>
                <button type="button" className={ui.btnIcon} aria-label={`Move ${name.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="chevronUp" size="sm" />
                </button>
                <button type="button" className={ui.btnIcon} aria-label={`Move ${name.toLowerCase()} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevronDown" size="sm" />
                </button>
              </>
            )}
            <button type="button" className={ui.btnIcon} aria-label={`Remove ${name.toLowerCase()} ${i + 1}`} disabled={items.length <= min} onClick={() => onChange(items.filter((_, k) => k !== i), i)}>
              <Icon name="x" size="sm" />
            </button>
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button type="button" className={smallBtn} onClick={() => onChange([...items, ""])}>
          <Icon name="plus" size="sm" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** The image for a "label a diagram" question: press it to drop a numbered pin, then name the pin. */
function DiagramPins({ q, set, imageUrl, onImage }: { q: DraftQuestion; set: (p: Partial<DraftQuestion>) => void; imageUrl: string | null; onImage: (f: File) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (q.pins.length >= 12) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    set({ pins: [...q.pins, { x, y, label: "" }] });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} onClick={() => picker.current?.click()}>
          <Icon name="image" size="sm" />
          {imageUrl ? "Change diagram" : "Add the diagram"}
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImage(f);
            e.target.value = "";
          }}
        />
        {imageUrl && <span className="text-xs text-ink/65">Press the diagram where each label goes. Pupils choose the name for each numbered pin.</span>}
      </div>
      {imageUrl && (
        <div className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-gold-light" onClick={place} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed or local preview URL */}
          <img src={imageUrl} alt="The diagram to label" className="block max-h-80 max-w-full" draggable={false} />
          {q.pins.map((p, i) => (
            <span key={i} className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white ring-2 ring-white" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
              {i + 1}
            </span>
          ))}
        </div>
      )}
      {q.pins.length > 0 && (
        <ol className="grid gap-2 sm:grid-cols-2">
          {q.pins.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white">{i + 1}</span>
              <input type="text" value={p.label} maxLength={80} onChange={(e) => set({ pins: q.pins.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} placeholder="Name of this part" aria-label={`Label ${i + 1}`} className={`${ui.input} flex-1`} />
              <button type="button" className={ui.btnIcon} aria-label={`Remove pin ${i + 1}`} onClick={() => set({ pins: q.pins.filter((_, k) => k !== i) })}>
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * One question in the builder: its type (segmented buttons), the question, the answer fields
 * suited to the type, marks, difficulty and an explanation pupils see afterwards.
 */
export function QuestionEditor({
  q,
  index,
  count,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
  imageUrl,
  onImage,
  showProblems,
}: {
  q: DraftQuestion;
  index: number;
  count: number;
  onChange: (q: DraftQuestion) => void;
  onRemove: () => void;
  onMove: (d: number) => void;
  onDuplicate: () => void;
  imageUrl: string | null;
  onImage: (f: File) => void;
  showProblems: boolean;
}) {
  const set = (p: Partial<DraftQuestion>) => onChange({ ...q, ...p });
  const [typeOpen, setTypeOpen] = useState(false);
  const problem = questionProblem(q);
  const meta = QTYPES.find((t) => t.type === q.qtype)!;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // A new blank question scrolls itself into view inside the builder (never the page behind).
    if (!q.prompt && !q.ai) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when first shown
  }, []);

  return (
    <section ref={ref} id={`q-${q.id}`} aria-label={`Question ${index + 1}`} className={`scroll-mt-4 rounded-xl border bg-white ${showProblems && problem ? "border-red-300" : q.ai && !q.checked ? "border-amber-300" : "border-gold-light"}`}>
      <header className="flex flex-wrap items-center gap-1 border-b border-gold-light/70 px-4 py-2.5">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cream px-2 text-xs font-semibold tabular-nums text-ink">{index + 1}</span>
        <button type="button" onClick={() => setTypeOpen((o) => !o)} aria-expanded={typeOpen} className={`${smallBtn} !text-ink`}>
          <Icon name={meta.icon} size="sm" />
          {meta.label}
          <Icon name="chevronDown" size="sm" />
        </button>
        {!meta.auto && <span className="text-xs text-ink/60">You mark this one</span>}
        {q.ai && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-900">
            <Icon name="sparkles" size="sm" />
            Drafted by AI
          </span>
        )}
        <span className="ml-auto" />
        <button type="button" className={`${ui.btnIcon} !hidden sm:!inline-flex`} aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <Icon name="chevronUp" size="sm" />
        </button>
        <button type="button" className={`${ui.btnIcon} !hidden sm:!inline-flex`} aria-label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          <Icon name="chevronDown" size="sm" />
        </button>
        <ActionsMenu
          label={`More for question ${index + 1}`}
          items={[
            ...(index > 0 ? [{ label: "Move up", icon: "chevronUp" as const, onSelect: () => onMove(-1) }] : []),
            ...(index < count - 1 ? [{ label: "Move down", icon: "chevronDown" as const, onSelect: () => onMove(1) }] : []),
            { label: "Duplicate", icon: "copy", onSelect: onDuplicate },
            { label: "Delete question", icon: "trash", danger: true, onSelect: onRemove },
          ]}
        />
      </header>

      <div className="space-y-4 p-4">
        {typeOpen && (
          <QuestionTypePicker
            compact
            value={q.qtype}
            label={`Type of question ${index + 1}`}
            onPick={(t) => {
              if (t !== q.qtype) onChange(changeType(q, t));
              setTypeOpen(false);
            }}
          />
        )}

        <Field label="Question">
          <textarea value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} rows={2} maxLength={2000} placeholder={q.qtype === "true_false" ? "A statement, e.g. Water boils at 100°C at sea level." : "Write the question"} className={`${ui.input} leading-relaxed`} />
        </Field>

        {(q.qtype === "single" || q.qtype === "multiple") && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink/70">{q.qtype === "single" ? "Options: choose the right one" : "Options: tick every right one"}</legend>
            <ListRows
              name="Option"
              items={q.options}
              min={2}
              onChange={(next, removed) => {
                let correct = q.correct;
                if (removed !== undefined) correct = correct.filter((c) => c !== removed).map((c) => (c > removed ? c - 1 : c));
                if (q.qtype === "single" && correct.length === 0) correct = [0];
                set({ options: next, correct });
              }}
              placeholder={(i) => `Option ${letter(i)}`}
              addLabel="Add an option"
              lead={(i) => {
                const on = q.correct.includes(i);
                return (
                  <button
                    type="button"
                    role={q.qtype === "single" ? "radio" : "checkbox"}
                    aria-checked={on}
                    aria-label={`Option ${letter(i)} is right`}
                    onClick={() => set({ correct: q.qtype === "single" ? [i] : on ? q.correct.filter((c) => c !== i) : [...q.correct, i] })}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold sm:h-9 sm:w-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700 ${on ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light bg-white text-ink/70 hover:border-ink/30"}`}
                  >
                    {on ? <Icon name="check" size="sm" /> : letter(i)}
                  </button>
                );
              }}
            />
          </fieldset>
        )}

        {q.qtype === "true_false" && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink/70">The right answer</p>
            <div role="radiogroup" aria-label="The right answer" className="inline-flex rounded-xl bg-cream p-1">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={q.tf === v} onClick={() => set({ tf: v })} className={`min-h-11 rounded-lg px-4 text-sm font-medium sm:min-h-9 ${q.tf === v ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70 hover:text-ink"}`}>
                  {v ? "True" : "False"}
                </button>
              ))}
            </div>
          </div>
        )}

        {q.qtype === "short" && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink/70">Answers to accept (capitals and spaces don&apos;t matter; anything else comes to you to mark)</legend>
            <ListRows name="Accepted answer" items={q.accept} onChange={(next) => set({ accept: next })} placeholder={(i) => (i === 0 ? "The answer" : "Another way of writing it")} addLabel="Accept another answer" max={10} />
          </fieldset>
        )}

        {q.qtype === "long" && (
          <Field label="Model answer or mark scheme (for you; pupils see it afterwards if you show answers)">
            <textarea value={q.model} onChange={(e) => set({ model: e.target.value })} rows={3} maxLength={2000} className={`${ui.input} leading-relaxed`} placeholder="The points a full answer makes" />
          </Field>
        )}

        {q.qtype === "numeric" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="The right number">
              <input type="text" inputMode="decimal" value={q.numeric} onChange={(e) => set({ numeric: e.target.value })} className={ui.input} placeholder="e.g. 3.14" />
            </Field>
            <Field label="Accept within" hint="0 for the exact number.">
              <input type="text" inputMode="decimal" value={q.tolerance} onChange={(e) => set({ tolerance: e.target.value })} className={ui.input} placeholder="e.g. 0.01" />
            </Field>
          </div>
        )}

        {q.qtype === "matching" && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink/70">Pairs (pupils see the right-hand side shuffled)</legend>
            <ol className="space-y-2">
              {q.pairs.map((p, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <input type="text" value={p.left} maxLength={200} onChange={(e) => set({ pairs: q.pairs.map((x, k) => (k === i ? { ...x, left: e.target.value } : x)) })} placeholder="Item" aria-label={`Pair ${i + 1}: item`} className={ui.input} />
                  <Icon name="arrowLeftRight" className="h-4 w-4 text-ink/50" />
                  <input type="text" value={p.right} maxLength={200} onChange={(e) => set({ pairs: q.pairs.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)) })} placeholder="Its match" aria-label={`Pair ${i + 1}: match`} className={ui.input} />
                  <button type="button" className={ui.btnIcon} aria-label={`Remove pair ${i + 1}`} disabled={q.pairs.length <= 2} onClick={() => set({ pairs: q.pairs.filter((_, k) => k !== i) })}>
                    <Icon name="x" size="sm" />
                  </button>
                </li>
              ))}
            </ol>
            {q.pairs.length < 8 && (
              <button type="button" className={`${smallBtn} mt-2`} onClick={() => set({ pairs: [...q.pairs, { left: "", right: "" }] })}>
                <Icon name="plus" size="sm" />
                Add a pair
              </button>
            )}
          </fieldset>
        )}

        {q.qtype === "ordering" && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink/70">Items in the right order (pupils see them shuffled)</legend>
            <ListRows name="Item" items={q.options} min={2} movable onChange={(next) => set({ options: next })} placeholder={(i) => `Step ${i + 1}`} addLabel="Add an item" lead={(i) => <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink/60">{i + 1}.</span>} />
          </fieldset>
        )}

        {q.qtype === "label" && <DiagramPins q={q} set={set} imageUrl={imageUrl} onImage={onImage} />}

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Marks">
            <input type="number" min={0} max={100} step={0.5} value={Number.isFinite(q.marks) ? q.marks : ""} onChange={(e) => set({ marks: e.target.value === "" ? 0 : Number(e.target.value) })} className={`${ui.input} tabular-nums`} />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-ink/70">Difficulty</p>
            <div role="radiogroup" aria-label={`Difficulty of question ${index + 1}`} className="inline-flex flex-wrap rounded-xl bg-cream p-1">
              {(["", "easy", "medium", "hard"] as const).map((d) => (
                <button key={d || "none"} type="button" role="radio" aria-checked={q.difficulty === d} onClick={() => set({ difficulty: d })} className={`min-h-11 rounded-lg px-3 text-[0.8125rem] font-medium sm:min-h-8 ${q.difficulty === d ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70 hover:text-ink"}`}>
                  {d ? d[0].toUpperCase() + d.slice(1) : "Not set"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Explanation (pupils see it after they finish, if you show answers)">
          <textarea value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} rows={2} maxLength={2000} className={`${ui.input} leading-relaxed`} placeholder="Why the answer is right" />
        </Field>

        {q.ai && (
          <label className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${q.checked ? "bg-forest-50 text-forest-900" : "bg-amber-50 text-amber-900"}`}>
            <input type="checkbox" checked={q.checked} onChange={(e) => set({ checked: e.target.checked })} className="mt-0.5 h-4 w-4" />
            <span>I have checked this question, its answer and explanation are right.</span>
          </label>
        )}
        {showProblems && problem && (
          <p role="alert" className={ui.error}>
            {problem}
          </p>
        )}
      </div>
    </section>
  );
}
