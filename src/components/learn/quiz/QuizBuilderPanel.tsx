"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_QUIZ_CONFIG } from "@/lib/quiz/defaultConfig";
import type { LineIcon, QuizConfig, QuizQuestion, QuizRule, RuleCondition, RuleOperator, ResultSectionKey } from "@/lib/quiz/schema";
import { btn, ui } from "@/components/learn/ui";

type VersionRow = { id: string; status: string; label: string; content: QuizConfig; published_at: string | null; created_at: string };

const ICONS: LineIcon[] = ["book", "pages", "sprout", "letters", "speech", "bookmark", "target", "scales", "graduation-cap", "clock", "home", "compass", "user-check", "users", "user-away", "none"];
const OPERATORS: RuleOperator[] = ["equals", "not_equals", "in", "not_in"];
const OPERATOR_LABELS: Record<RuleOperator, string> = {
  equals: "is",
  not_equals: "is not",
  in: "is one of",
  not_in: "is none of",
};
const RESULT_SECTION_LABELS: Record<ResultSectionKey, string> = {
  sample_week: "Sample week timetable",
  starting_points: "Arabic / Qur'an starting points",
  fees: "Fee estimate",
  timezone_flag: "Timezone workability flag",
  hifz_role_note: "Next-step texts and flags from rules",
  ctas: "Calls to action (email plan / book a call)",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuizBuilderPanel({ onPreview }: { onPreview: (config: QuizConfig) => void }) {
  const supabase = getSupabaseClient();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Edits are saved after a short pause in typing, not on every keystroke, so
  // writes can't arrive out of order and leave older text in the draft.
  const pendingRef = useRef<QuizConfig | null>(null);
  const timerRef = useRef<number | null>(null);
  const draftIdRef = useRef<string | null>(null);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  const [tab, setTab] = useState<"questions" | "rules" | "sections">("questions");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("quiz_config_versions")
      .select("id, status, label, content, published_at, created_at")
      .order("created_at", { ascending: false });
    const rows = (data as VersionRow[]) || [];
    setVersions(rows);

    const existingDraft = rows.find((r) => r.status === "draft");
    if (existingDraft) {
      setDraftId(existingDraft.id);
      setConfig(existingDraft.content);
    } else {
      const published = rows.find((r) => r.status === "published");
      const base = published ? published.content : DEFAULT_QUIZ_CONFIG;
      const { data: inserted } = await supabase
        .from("quiz_config_versions")
        .insert({ status: "draft", label: `Draft ${new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" })}`, content: base })
        .select("id")
        .single();
      if (inserted) {
        setDraftId(inserted.id as string);
        setConfig(clone(base));
      } else {
        setConfig(clone(base));
        setNotice({ ok: false, text: "Couldn't create a draft to edit, so changes here won't be saved. Refresh to try again." });
      }
    }
    setStatus("ready");
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  /** Writes any pending edit now. Resolves false if the save failed. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    const id = draftIdRef.current;
    if (!next || !supabase || !id) return true;
    pendingRef.current = null;
    setSaveState("saving");
    const { error } = await supabase.from("quiz_config_versions").update({ content: next }).eq("id", id);
    if (error) {
      // Keep it pending so the next edit or Publish retries it.
      pendingRef.current = pendingRef.current ?? next;
      setSaveState("error");
      return false;
    }
    setSaveState(pendingRef.current ? "pending" : "saved");
    return true;
  }, [supabase]);

  // Save anything still pending when the builder closes (tab switch, preview).
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  function saveDraft(next: QuizConfig) {
    setConfig(next);
    if (!draftIdRef.current) return;
    pendingRef.current = next;
    setSaveState("pending");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), 700);
  }

  async function publish() {
    if (!supabase || !draftId) return;
    if (!window.confirm("Publish this draft? Families taking the quiz will see these questions and rules straight away.")) return;
    setPublishing(true);
    setNotice(null);
    try {
      if (!(await flush())) return setNotice({ ok: false, text: "Your latest edits couldn't be saved, so nothing was published. Try again." });
      // Only one version may be live (unique index), so archive the current one first and put it back if publishing fails.
      const currentlyPublished = versions.find((v) => v.status === "published");
      if (currentlyPublished) {
        const { error } = await supabase.from("quiz_config_versions").update({ status: "archived" }).eq("id", currentlyPublished.id);
        if (error) return setNotice({ ok: false, text: `Couldn't publish: ${error.message}` });
      }
      const { error } = await supabase
        .from("quiz_config_versions")
        .update({ status: "published", published_at: new Date().toISOString(), label: `Published ${new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" })}` })
        .eq("id", draftId);
      if (error) {
        if (currentlyPublished) await supabase.from("quiz_config_versions").update({ status: "published" }).eq("id", currentlyPublished.id);
        return setNotice({ ok: false, text: `Couldn't publish, so the previous version is still live: ${error.message}` });
      }
      setNotice({ ok: true, text: "Published. A fresh draft has been started for your next changes." });
      await load();
    } finally {
      setPublishing(false);
    }
  }

  function revertTo(version: VersionRow) {
    if (!draftId) return;
    if (!window.confirm(`Replace the current draft with "${version.label}"? Unpublished changes in the draft will be lost.`)) return;
    saveDraft(clone(version.content));
    setNotice({ ok: true, text: `Loaded "${version.label}" into the draft.` });
  }

  if (!supabase) return <p className="text-sm text-ink/65">The /learn area isn&apos;t connected yet.</p>;
  if (status === "loading") return <p className="text-sm text-ink/65">Loading…</p>;

  const published = versions.find((v) => v.status === "published");
  const history = versions.filter((v) => v.id !== draftId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-light/50 bg-white p-4">
        <div className="text-sm text-ink/70">
          {published ? (
            <>Live version published {published.published_at ? new Date(published.published_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }) : ""}</>
          ) : (
            <>Nothing published yet, the public quiz is showing the bundled fallback copy.</>
          )}
          {(saveState === "saving" || saveState === "pending") && <span className="ml-2 text-xs text-ink/65">Saving…</span>}
          {saveState === "saved" && <span className="ml-2 text-xs text-green-800">Draft saved</span>}
          {saveState === "error" && <span role="alert" className="ml-2 text-xs text-red-700">Couldn&apos;t save your last change. It will retry with your next edit.</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void flush();
              onPreview(config);
            }}
            className={btn("secondary")}>
            Preview as a parent
          </button>
          <button type="button" onClick={publish} disabled={publishing || !draftId} className={btn("primary")}>
            {publishing ? "Publishing…" : "Publish draft"}
          </button>
        </div>
      </div>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`-mt-3 rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {notice.text}
        </p>
      )}

      {history.length > 0 && (
        <details className="rounded-2xl border border-gold-light/50 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Version history / revert ({history.length})</summary>
          <ul className="mt-3 space-y-1 text-xs text-ink/65">
            {history.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 border-b border-gold-light/20 py-1">
                <span>{v.label} · {v.status} · {new Date(v.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</span>
                <button type="button" onClick={() => revertTo(v)} className={`${btn("secondary", "sm")} shrink-0`}>
                  Load into draft
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Tabs
        variant="switch"
        items={[
          { key: "questions", label: `Questions (${config.questions.length})` },
          { key: "rules", label: `Rules (${config.rules.length})` },
          { key: "sections", label: "Result sections" },
        ]}
        value={tab}
        onChange={setTab}
        label="Quiz builder sections"
        idBase="quiz-builder"
      />

      <div {...tabPanelProps("quiz-builder", tab)}>
        {tab === "questions" && <QuestionsEditor config={config} onChange={saveDraft} />}
        {tab === "rules" && <RulesEditor config={config} onChange={saveDraft} />}
        {tab === "sections" && <SectionsEditor config={config} onChange={saveDraft} />}
      </div>
    </div>
  );
}

// ── Questions ────────────────────────────────────────────────────────────
function QuestionsEditor({ config, onChange }: { config: QuizConfig; onChange: (next: QuizConfig) => void }) {
  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    const questions = [...config.questions];
    questions[index] = { ...questions[index], ...patch };
    onChange({ ...config, questions });
  }

  function move(index: number, dir: -1 | 1) {
    const questions = [...config.questions];
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    [questions[index], questions[target]] = [questions[target], questions[index]];
    // Renumber `order` within each step to match the new sequence.
    onChange({ ...config, questions: questions.map((q, i) => ({ ...q, order: i })) });
  }

  function addOption(qIndex: number) {
    const questions = [...config.questions];
    questions[qIndex] = { ...questions[qIndex], options: [...questions[qIndex].options, { value: newId("opt"), label: "New option" }] };
    onChange({ ...config, questions });
  }

  function updateOption(qIndex: number, oIndex: number, patch: Partial<QuizQuestion["options"][number]>) {
    const questions = [...config.questions];
    const options = [...questions[qIndex].options];
    options[oIndex] = { ...options[oIndex], ...patch };
    questions[qIndex] = { ...questions[qIndex], options };
    onChange({ ...config, questions });
  }

  function removeOption(qIndex: number, oIndex: number) {
    const q = config.questions[qIndex];
    const opt = q.options[oIndex];
    // Rules and "show when" conditions that point at this answer stop matching once it's gone.
    const conds = [...config.rules.flatMap((r) => r.conditions), ...config.questions.flatMap((x) => x.showWhen || [])];
    const used = conds.some((c) => c.questionKey === q.key && (Array.isArray(c.value) ? c.value.includes(opt.value) : c.value === opt.value));
    if (!window.confirm(`Remove the answer "${opt.label}"?${used ? " Some rules or conditions use it and will stop matching." : ""}`)) return;
    const questions = [...config.questions];
    questions[qIndex] = { ...questions[qIndex], options: questions[qIndex].options.filter((_, i) => i !== oIndex) };
    onChange({ ...config, questions });
  }

  return (
    <div className="space-y-4">
      {config.questions.map((q, i) => (
        <div key={q.key} className="rounded-2xl border border-gold-light/50 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink/65">Step {q.step}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => move(i, -1)} className={btn("secondary", "sm")} aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} className={btn("secondary", "sm")} aria-label="Move down">↓</button>
              <label className="flex items-center gap-1 text-xs text-ink/65">
                <input type="checkbox" checked={q.active} onChange={(e) => updateQuestion(i, { active: e.target.checked })} />
                Visible
              </label>
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-ink/65">Title</label>
          <input value={q.title} onChange={(e) => updateQuestion(i, { title: e.target.value })} className={`${ui.input} mt-1`} />

          <label className="mt-2 block text-xs font-medium text-ink/65">Subtitle (optional)</label>
          <input value={q.subtitle ?? ""} onChange={(e) => updateQuestion(i, { subtitle: e.target.value })} className={`${ui.input} mt-1`} />

          <label className="mt-2 block text-xs font-medium text-ink/65">Show only when (simple rule)</label>
          <ShowWhenEditor
            questions={config.questions}
            value={q.showWhen ?? []}
            onChange={(showWhen) => updateQuestion(i, { showWhen })}
          />

          {q.type === "single_select" && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-ink/65">Options</p>
              {q.options.map((opt, oi) => (
                <div key={oi} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                  <input value={opt.label} onChange={(e) => updateOption(i, oi, { label: e.target.value })} placeholder="Label" className={`${ui.input} !w-auto`} />
                  <input value={opt.detail ?? ""} onChange={(e) => updateOption(i, oi, { detail: e.target.value })} placeholder="Detail line (optional)" className={`${ui.input} !w-auto`} />
                  <select value={opt.icon ?? "none"} onChange={(e) => updateOption(i, oi, { icon: e.target.value as LineIcon })} className={`${ui.select} !w-auto`}>
                    {ICONS.map((icon) => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeOption(i, oi)} className="text-xs text-red-700 hover:underline">Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(i)} className="text-xs text-gold-700 underline">Add option</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * One "if [question] [is/is not/...] [answer]" line, shared by the
 * show-only-when editor and the rules editor. Picks a question by its
 * real title (never the internal key), and for a single_select question
 * picks the answer from its actual option labels instead of typing a raw
 * value by hand, the free-text value box was the main "too technical"
 * pain point, since it silently failed if you didn't type the exact
 * internal value.
 */
function ConditionRow({
  condition,
  questions,
  onChange,
  onRemove,
  leadWord,
}: {
  condition: RuleCondition;
  questions: QuizQuestion[];
  onChange: (patch: Partial<RuleCondition>) => void;
  onRemove: () => void;
  leadWord: string;
}) {
  const question = questions.find((q) => q.key === condition.questionKey);
  const isMulti = condition.operator === "in" || condition.operator === "not_in";
  const selectedValues = Array.isArray(condition.value) ? condition.value : condition.value ? [condition.value] : [];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink/65">{leadWord}</span>
      <select
        value={condition.questionKey}
        onChange={(e) => onChange({ questionKey: e.target.value, value: "" })}
        className={`${ui.select} !w-auto`}
      >
        {questions.map((q) => (
          <option key={q.key} value={q.key}>{q.title}</option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as RuleOperator })}
        className={`${ui.select} !w-auto`}
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
        ))}
      </select>
      {question && question.options.length > 0 ? (
        isMulti ? (
          <select
            multiple
            value={selectedValues}
            onChange={(e) => onChange({ value: Array.from(e.target.selectedOptions, (o) => o.value) })}
            className={`${ui.select} min-w-[10rem] !w-auto`}
          >
            {question.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <select
            value={Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className={`${ui.select} !w-auto`}
          >
            <option value="">Choose an answer…</option>
            {question.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      ) : (
        <input
          value={Array.isArray(condition.value) ? condition.value.join(",") : condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={isMulti ? "comma-separated answers" : "answer"}
          className={`${ui.input} !w-40`}
        />
      )}
      <button type="button" onClick={onRemove} className="text-red-700 hover:underline">Remove</button>
    </div>
  );
}

function ShowWhenEditor({ questions, value, onChange }: { questions: QuizQuestion[]; value: RuleCondition[]; onChange: (v: RuleCondition[]) => void }) {
  function add() {
    const first = questions[0];
    onChange([...value, { questionKey: first?.key ?? "", operator: "equals", value: "" }]);
  }
  function update(i: number, patch: Partial<RuleCondition>) {
    const next = [...value];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-1 space-y-2">
      {value.map((c, i) => (
        <ConditionRow key={i} condition={c} questions={questions} onChange={(patch) => update(i, patch)} onRemove={() => remove(i)} leadWord="and" />
      ))}
      <button type="button" onClick={add} className="text-xs text-gold-700 underline">Add condition (always shown if none)</button>
    </div>
  );
}

// ── Rules ────────────────────────────────────────────────────────────────
function RulesEditor({ config, onChange }: { config: QuizConfig; onChange: (next: QuizConfig) => void }) {
  function addRule() {
    const first = config.questions[0];
    const rule: QuizRule = {
      id: newId("rule"),
      name: "New rule",
      active: true,
      match: "all",
      order: config.rules.length,
      conditions: first ? [{ questionKey: first.key, operator: "equals", value: "" }] : [],
      action: { type: "show_text", text: "" },
    };
    onChange({ ...config, rules: [...config.rules, rule] });
  }

  function updateRule(id: string, patch: Partial<QuizRule>) {
    onChange({ ...config, rules: config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function removeRule(id: string) {
    const rule = config.rules.find((r) => r.id === id);
    if (!window.confirm(`Delete the rule "${rule?.name || "Untitled"}"?`)) return;
    onChange({ ...config, rules: config.rules.filter((r) => r.id !== id) });
  }

  function updateCondition(ruleId: string, index: number, patch: Partial<RuleCondition>) {
    const rule = config.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    const conditions = [...rule.conditions];
    conditions[index] = { ...conditions[index], ...patch };
    updateRule(ruleId, { conditions });
  }

  function addCondition(ruleId: string) {
    const rule = config.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    const first = config.questions[0];
    updateRule(ruleId, { conditions: [...rule.conditions, { questionKey: first?.key ?? "", operator: "equals", value: "" }] });
  }

  function removeCondition(ruleId: string, index: number) {
    const rule = config.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    updateRule(ruleId, { conditions: rule.conditions.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/65">
        Example: &quot;If Arabic level is None and Hifdh focus is Central, show this message and this flag.&quot; Pick a
        question and an answer for each line below, choose whether every line needs to match or just one of them, then
        say what should happen when they do.
      </p>
      {config.rules.map((rule) => (
        <div key={rule.id} className="rounded-2xl border border-gold-light/50 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input value={rule.name} onChange={(e) => updateRule(rule.id, { name: e.target.value })} className={`${ui.input} !w-auto`} />
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={rule.active} onChange={(e) => updateRule(rule.id, { active: e.target.checked })} /> Active
              </label>
              <select value={rule.match} onChange={(e) => updateRule(rule.id, { match: e.target.value as "all" | "any" })} className={`${ui.select} !w-auto`}>
                <option value="all">All of these must be true</option>
                <option value="any">Any one of these can be true</option>
              </select>
              <button type="button" onClick={() => removeRule(rule.id)} className="text-red-700 hover:underline">Delete rule</button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {rule.conditions.map((c, i) => (
              <ConditionRow
                key={i}
                condition={c}
                questions={config.questions}
                onChange={(patch) => updateCondition(rule.id, i, patch)}
                onRemove={() => removeCondition(rule.id, i)}
                leadWord="If"
              />
            ))}
            <button type="button" onClick={() => addCondition(rule.id)} className="text-xs text-gold-700 underline">Add condition</button>
          </div>

          <div className="mt-3 rounded-xl bg-cream p-3">
            <p className="text-xs font-medium text-ink/65">Then</p>
            <select
              value={rule.action.type}
              onChange={(e) => {
                const type = e.target.value as QuizRule["action"]["type"];
                const action: QuizRule["action"] =
                  type === "show_text" ? { type, text: "" } : type === "show_flag" ? { type, text: "", tone: "info" } : { type, subject: "arabic", startingPoint: "" };
                updateRule(rule.id, { action });
              }}
              className={`${ui.select} mt-1 !w-auto`}
            >
              <option value="show_text">Show a message</option>
              <option value="show_flag">Show a highlighted flag</option>
              <option value="recommend_start">Recommend a starting point</option>
            </select>

            {rule.action.type === "show_text" && (
              <textarea
                value={rule.action.text}
                onChange={(e) => updateRule(rule.id, { action: { type: "show_text", text: e.target.value } })}
                rows={2}
                className={`${ui.textarea} mt-2`}
              />
            )}
            {rule.action.type === "show_flag" && (
              <div className="mt-2 space-y-2">
                <select
                  value={rule.action.tone}
                  onChange={(e) => updateRule(rule.id, { action: { type: "show_flag", text: rule.action.type === "show_flag" ? rule.action.text : "", tone: e.target.value as "info" | "warning" } })}
                  className={`${ui.select} !w-auto`}
                >
                  <option value="info">Info tone</option>
                  <option value="warning">Warning tone</option>
                </select>
                <textarea
                  value={rule.action.text}
                  onChange={(e) => updateRule(rule.id, { action: { type: "show_flag", tone: rule.action.type === "show_flag" ? rule.action.tone : "info", text: e.target.value } })}
                  rows={2}
                  className={ui.textarea}
                />
              </div>
            )}
            {rule.action.type === "recommend_start" && (
              <div className="mt-2 space-y-2">
                <select
                  value={rule.action.subject}
                  onChange={(e) => updateRule(rule.id, { action: { type: "recommend_start", subject: e.target.value as "arabic" | "quran", startingPoint: rule.action.type === "recommend_start" ? rule.action.startingPoint : "" } })}
                  className={`${ui.select} !w-auto`}
                >
                  <option value="arabic">Arabic</option>
                  <option value="quran">Qur&apos;an</option>
                </select>
                <input
                  value={rule.action.startingPoint}
                  onChange={(e) => updateRule(rule.id, { action: { type: "recommend_start", subject: rule.action.type === "recommend_start" ? rule.action.subject : "arabic", startingPoint: e.target.value } })}
                  placeholder="Starting point description"
                  className={ui.input}
                />
              </div>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={addRule} className={btn("secondary")}>
        Add rule
      </button>
    </div>
  );
}

// ── Result sections ──────────────────────────────────────────────────────
function SectionsEditor({ config, onChange }: { config: QuizConfig; onChange: (next: QuizConfig) => void }) {
  const sections = [...config.resultSections].sort((a, b) => a.order - b.order);

  function move(index: number, dir: -1 | 1) {
    const next = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((s, i) => (s.order = i));
    onChange({ ...config, resultSections: next });
  }

  function toggle(key: ResultSectionKey) {
    onChange({ ...config, resultSections: sections.map((s) => (s.key === key ? { ...s, active: !s.active } : s)) });
  }

  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div key={s.key} className="flex items-center justify-between rounded-xl border border-gold-light/50 bg-white p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={s.active} onChange={() => toggle(s.key)} />
            {RESULT_SECTION_LABELS[s.key]}
          </label>
          <div className="flex gap-1">
            <button type="button" onClick={() => move(i, -1)} className={btn("secondary", "sm")}>↑</button>
            <button type="button" onClick={() => move(i, 1)} className={btn("secondary", "sm")}>↓</button>
          </div>
        </div>
      ))}
    </div>
  );
}
