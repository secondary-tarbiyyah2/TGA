"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchChildClasses, useFamilyChildren, useStudentChildId, type ClassSummary } from "@/lib/learn/classes";
import { Tabs } from "@/components/learn/Tabs";
import { PageHeader } from "@/components/learn/PageHeader";
import { ui } from "@/components/learn/ui";

type StatusRow = { homework_id: string; class_id: string; due_at: string; status: "missing" | "late" | "on_time" | "not_yet_due"; submitted_at: string | null };
type Hw = { id: string; title: string; archived_at: string | null };
type Item = StatusRow & { title: string; className: string };

type TabKey = "assigned" | "missing" | "done";
const TABS: { key: TabKey; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "missing", label: "Missing" },
  { key: "done", label: "Done" },
];

/** "Fri 30 Oct, 16:00", leaving out the time when it is midnight or 23:59 (a whole-day deadline). */
const fmt = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return time === "00:00" || time === "23:59" ? day : `${day}, ${time}`;
};

/** Which tab a status belongs to: late or on-time hand-ins are both "Done". */
export function tabFor(status: StatusRow["status"]): TabKey {
  return status === "not_yet_due" ? "assigned" : status === "missing" ? "missing" : "done";
}

function useTodo(childId: string | null) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let alive = true;
    (async () => {
      const [cls, st] = await Promise.all([
        fetchChildClasses(childId),
        supabase.from("homework_status").select("homework_id, class_id, due_at, status, submitted_at").eq("child_id", childId).limit(500),
      ]);
      const rows = (st.data as unknown as StatusRow[]) || [];
      const ids = [...new Set(rows.map((r) => r.homework_id))];
      const { data: hw } = ids.length ? await supabase.from("homework").select("id, title, archived_at").in("id", ids) : { data: [] };
      const byId = new Map(((hw as unknown as Hw[]) || []).map((h) => [h.id, h]));
      const names = new Map(cls.map((c) => [c.id, c.name]));
      if (!alive) return;
      setClasses(cls);
      setItems(
        rows
          .filter((r) => byId.has(r.homework_id) && !byId.get(r.homework_id)?.archived_at)
          .map((r) => ({ ...r, title: byId.get(r.homework_id)?.title || "Homework", className: names.get(r.class_id) || "Class" })),
      );
    })();
    return () => {
      alive = false;
    };
  }, [childId]);
  return { items, classes };
}

function TodoBody({ childId, hwHref, heading, subtitle, childPicker }: { childId: string; hwHref: string | ((homeworkId: string) => string); heading: string; subtitle: string; childPicker?: React.ReactNode }) {
  const { items, classes } = useTodo(childId);
  const [tab, setTab] = useState<TabKey>("assigned");
  const [classId, setClassId] = useState("");

  const inClass = (items || []).filter((i) => !classId || i.class_id === classId);
  const counts: Record<TabKey, number> = { assigned: 0, missing: 0, done: 0 };
  for (const i of inClass) counts[tabFor(i.status)]++;

  const list = useMemo(() => {
    const l = inClass.filter((i) => tabFor(i.status) === tab);
    // Assigned: soonest due first. Missing and Done: most recent first.
    return l.sort((a, b) => (tab === "assigned" ? a.due_at.localeCompare(b.due_at) : b.due_at.localeCompare(a.due_at)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inClass derives from items/classId
  }, [items, classId, tab]);

  const empty: Record<TabKey, string> = {
    assigned: "Nothing assigned right now.",
    missing: "Nothing is missing. Well done.",
    done: "No finished homework yet.",
  };

  return (
    <>
      <PageHeader
        title={heading}
        subtitle={subtitle}
        actions={
          classes.length > 1 ? (
            <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class" className={`${ui.select} max-w-full sm:w-64`}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {childPicker}
      <div className="rounded-2xl border border-gold-light bg-white">
      <Tabs items={TABS.map((t) => ({ ...t, count: counts[t.key], countAlert: t.key === "missing" }))} value={tab} onChange={setTab} label="Homework status" className="px-3" />
      {items === null ? (
        <div className="m-5 h-24 animate-pulse rounded-lg bg-cream" />
      ) : list.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink/65">{empty[tab]}</p>
      ) : (
        <ul role="tabpanel" className="divide-y divide-gold-light/60 p-2">
          {list.map((i) => (
            <li key={i.homework_id}>
              <Link href={typeof hwHref === "function" ? hwHref(i.homework_id) : hwHref} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-3 hover:bg-cream">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{i.title}</span>
                  <span className="block truncate text-xs text-ink/65">{i.className}</span>
                </span>
                <span className={`text-xs ${tab === "missing" ? "font-medium text-red-700" : "text-ink/65"}`}>{tab === "done" && i.submitted_at ? `Handed in ${fmt(i.submitted_at)}` : tab === "missing" ? `Was due ${fmt(i.due_at)}` : `Due ${fmt(i.due_at)}`}</span>
                {i.status === "late" && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">Handed in late</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </>
  );
}

/** Student "To do": their own homework in three tabs. Opening one goes to the Homework page to hand it in. */
export function StudentTodo() {
  const childId = useStudentChildId();
  if (childId === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (!childId) return <p className="text-sm text-ink/65">No pupil account is linked to this login yet.</p>;
  return <TodoBody childId={childId} hwHref={(hw) => `/student/homework?hw=${hw}`} heading="To do" subtitle="Your homework: what is set, what is missing and what you have handed in. Tap one to open it." />;
}

/** Parent "To do": the same list for one chosen child (read only). */
export function FamilyTodo({ initialChild }: { initialChild?: string }) {
  const kids = useFamilyChildren();
  const [selected, setSelected] = useState(initialChild || "");
  // A stale ?child= (not one of this parent's children) falls back to the first child.
  const childId = (kids?.some((k) => k.id === selected) ? selected : "") || kids?.[0]?.id || "";
  if (kids === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (kids.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">
        No children are linked to this account yet. Add your child from the{" "}
        <Link href="/family/dashboard" className="text-teal-700 underline">
          dashboard
        </Link>
        .
      </p>
    );
  const first = kids.find((k) => k.id === childId)?.name.split(" ")[0];
  const picker =
    kids.length > 1 ? (
      <div role="group" aria-label="Child" className="mb-4 flex flex-wrap gap-2">
        {kids.map((k) => (
          <button key={k.id} type="button" aria-pressed={childId === k.id} onClick={() => setSelected(k.id)} className={`${childId === k.id ? ui.chipOn : ui.chip} min-h-10`}>
            {k.name}
          </button>
        ))}
      </div>
    ) : null;
  // Each row opens that exact piece of homework, expanded, on the Homework page.
  return (
    <TodoBody
      key={childId}
      childId={childId}
      hwHref={(hw) => `/family/homework?child=${childId}&hw=${hw}`}
      heading="To do"
      subtitle={`Homework set for ${first || "your child"}: what is due, what is missing and what has been handed in. Tap one to open it.`}
      childPicker={picker}
    />
  );
}
