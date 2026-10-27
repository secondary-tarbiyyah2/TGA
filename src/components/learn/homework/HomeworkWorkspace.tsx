"use client";

import { useMemo, useState } from "react";
import { PageHeader, type Crumb } from "@/components/learn/PageHeader";
import { HomeworkCard } from "@/components/learn/homework/HomeworkCards";
import { HomeworkEditor } from "@/components/learn/homework/HomeworkEditor";
import { LateMissingView } from "@/components/learn/homework/LateMissingView";
import { Switch } from "@/components/learn/homework/Switch";
import type { Homework } from "@/lib/learn/homework";
import { Tabs } from "@/components/learn/Tabs";
import { useNow } from "@/lib/learn/useNow";

type ClassOpt = { id: string; name: string };

/**
 * One layout for setting and marking homework (teachers and the head):
 *   1. pick a class (or all),
 *   2. "Set homework" opens the form in place; "Edit" on a card opens the
 *      form where the card is, so nobody loses their place in a long list,
 *   3. below, what is still to come, then what is past due (that is where
 *      the marking is), with "Late & missing" as its own tab.
 */
export function HomeworkWorkspace({
  scope,
  crumbs,
  subtitle,
  classes,
  homework,
  showDeleted,
  onShowDeleted,
  onReload,
}: {
  scope: "teach" | "admin";
  crumbs?: Crumb[];
  subtitle: string;
  classes: ClassOpt[] | null;
  homework: Homework[] | null;
  showDeleted: boolean;
  onShowDeleted: (v: boolean) => void;
  onReload: () => void;
}) {
  const now = useNow();
  const [tab, setTab] = useState<"set" | "late">("set");
  const [classId, setClassId] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shown = useMemo(() => (homework || []).filter((h) => !classId || h.class_id === classId), [homework, classId]);
  const { upcoming, past } = useMemo(() => {
    const up = shown.filter((h) => new Date(h.due_at).getTime() >= now).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    const pa = shown.filter((h) => new Date(h.due_at).getTime() < now).sort((a, b) => +new Date(b.due_at) - +new Date(a.due_at));
    return { upcoming: up, past: pa };
  }, [shown, now]);

  const formOpen = composing || editing !== null;
  const noun = scope === "admin" ? "classwork" : "homework";
  const closeForm = () => {
    setComposing(false);
    setEditing(null);
  };
  const startEdit = (h: Homework) => {
    setNote(null);
    setComposing(false);
    setEditing(h);
    setTab("set");
  };

  const editorFor = (h: Homework | null) =>
    classes === null ? (
      <p className="text-sm text-ink/65">Loading…</p>
    ) : (
      <HomeworkEditor
        key={h?.id ?? "new"}
        classes={classes}
        initialClassId={classId || undefined}
        editing={h}
        onCancel={closeForm}
        onSaved={(n) => {
          setNote(n ?? null);
          closeForm();
          onReload();
        }}
      />
    );
  const inlineEditor = editing ? (
    <section className="rounded-2xl border border-teal-500/50 bg-white p-6" aria-label={`Edit ${editing.title}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Edit &ldquo;{editing.title}&rdquo;</h2>
        <button type="button" onClick={closeForm} className="text-sm text-ink/65 hover:text-ink">
          Close
        </button>
      </div>
      <div className="mt-4">{editorFor(editing)}</div>
    </section>
  ) : null;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={scope === "admin" ? "All classwork" : "All homework"}
        subtitle={subtitle}
        actions={
          tab === "set" && !formOpen ? (
            <button
              type="button"
              onClick={() => {
                setNote(null);
                setComposing(true);
              }}
              className="rounded-xl bg-gold-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gold-900"
            >
              + Set {noun}
            </button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          variant="switch"
          items={[
            { key: "set", label: "Set and mark" },
            { key: "late", label: "Late and missing" },
          ]}
          value={tab}
          onChange={setTab}
          label="Homework views"
        />
        {tab === "set" && (
          <>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="rounded-xl border border-gold-light bg-white px-3 py-2 text-sm">
              <option value="">All classes</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="ml-auto w-44">
              <Switch label="Show deleted" checked={showDeleted} onChange={onShowDeleted} />
            </div>
          </>
        )}
      </div>

      {tab === "late" ? (
        <LateMissingView scope={scope} />
      ) : (
        <div className="space-y-6">
          {note && (
            <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {note}
            </p>
          )}

          {composing && (
            <section className="rounded-2xl border border-gold-light bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">Set new {noun}</h2>
                <button type="button" onClick={closeForm} className="text-sm text-ink/65 hover:text-ink">
                  Close
                </button>
              </div>
              <div className="mt-4">{editorFor(null)}</div>
            </section>
          )}
          {/* Editing something that the current filter hides: show the form here instead. */}
          {editing && !shown.some((h) => h.id === editing.id) && inlineEditor}

          {homework === null ? (
            <div className="h-24 animate-pulse rounded-2xl bg-white" />
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-gold-light bg-white p-10 text-center">
              <p className="text-base font-semibold text-ink">No {noun} yet{classId ? " for this class" : ""}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink/65">Set a piece of {noun} and pupils and families will see it straight away.</p>
              {!formOpen && (
                <button type="button" onClick={() => setComposing(true)} className="mt-4 rounded-xl bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
                  + Set {noun}
                </button>
              )}
            </div>
          ) : (
            <>
              <Group title="Due soon" hint="Not due yet" items={upcoming} onEdit={startEdit} onChanged={onReload} editingId={editing?.id} editor={inlineEditor} />
              <Group title="Past due" hint="Mark what has been handed in" items={past} onEdit={startEdit} onChanged={onReload} editingId={editing?.id} editor={inlineEditor} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function Group({ title, hint, items, onEdit, onChanged, editingId, editor }: { title: string; hint: string; items: Homework[]; onEdit: (h: Homework) => void; onChanged: () => void; editingId?: string; editor?: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink/65">{items.length}</span>
        <span className="text-sm text-ink/65">{hint}</span>
      </div>
      <div className="space-y-3">
        {items.map((hw) => (hw.id === editingId && editor ? <div key={hw.id}>{editor}</div> : <HomeworkCard key={hw.id} hw={hw} onEdit={onEdit} onChanged={onChanged} />))}
      </div>
    </section>
  );
}
