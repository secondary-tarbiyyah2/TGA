"use client";

import { useMemo, useState } from "react";
import { shortTime, threadTitle, type Category, type OversightThread } from "./types";
import { Tabs } from "@/components/learn/Tabs";

type Tab = "all" | Category | "flagged";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "staff_staff", label: "Staff↔Staff" },
  { id: "staff_parent", label: "Staff↔Parent" },
  { id: "group", label: "Class/group" },
  { id: "flagged", label: "Flagged" },
];

export function ThreadList({
  threads,
  activeId,
  onSelect,
}: {
  threads: OversightThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return threads.filter((t) => {
      if (tab === "flagged" ? t.flagged_count === 0 : tab !== "all" && t.category !== tab) return false;
      if (!needle) return true;
      return (
        (t.name_a || "").toLowerCase().includes(needle) ||
        (t.name_b || "").toLowerCase().includes(needle) ||
        (t.child_name || "").toLowerCase().includes(needle)
      );
    });
  }, [threads, tab, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs variant="switch" items={TABS.map((t) => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} label="Conversation type" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by participant name"
        aria-label="Search conversations"
        className="mt-3 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
      />
      <ul className="mt-3 min-h-0 flex-1 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10 bg-white">
        {shown.length === 0 && <li className="p-4 text-sm text-ink/55">No conversations match.</li>}
        {shown.map((t) => (
          <li key={t.thread_id}>
            <button
              onClick={() => onSelect(t.thread_id)}
              className={`block w-full px-3 py-2.5 text-left hover:bg-teal-50 ${activeId === t.thread_id ? "bg-teal-50" : ""}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">{threadTitle(t)}</span>
                <span className="shrink-0 text-xs text-ink/65">{shortTime(t.last_at)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-xs text-ink/60">
                  {t.child_name ? `Re: ${t.child_name} · ` : ""}
                  {t.last_preview || "No messages yet"}
                </span>
                {t.flagged_count > 0 && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                    Flagged
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
