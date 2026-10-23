"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren, useStudentChildId } from "@/lib/learn/classes";
import { EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { ParentSetup } from "@/components/learn/ParentSetup";
import { loadPupilItems, loadStaffItems, sortItems, type ActionItem, type Role, type Urgency } from "@/lib/learn/actionCentre";

const GROUPS: { key: Urgency; title: string; hint: string }[] = [
  { key: "now", title: "Do now", hint: "Overdue or needs a decision today" },
  { key: "soon", title: "This week", hint: "Coming up or worth doing soon" },
  { key: "info", title: "Good to know", hint: "No action needed" },
];

/**
 * One list of what needs doing, for every role. Items come from the data itself, so they clear on their own
 * once the thing is done. Each has one button that goes straight to the right page.
 */
export function ActionCentre({ role }: { role: Role }) {
  const family = useFamilyChildren();
  const studentChild = useStudentChildId();
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const staff = role === "teach" || role === "admin";
  const pupils = role === "family" ? family : role === "student" ? (studentChild === undefined ? null : studentChild ? [{ id: studentChild, name: "You" }] : []) : [];
  const key = staff ? role : pupils ? pupils.map((c) => c.id).join(",") || "none" : "wait";

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || key === "wait") return;
    let alive = true;
    (async () => {
      try {
        const list = staff ? await loadStaffItems(role as "teach" | "admin") : await loadPupilItems(pupils || [], role as "student" | "family");
        if (alive) {
          setItems(sortItems(list));
          setFailed(false);
        }
      } catch {
        if (alive) {
          setItems([]);
          setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already captures role and the pupil list
  }, [key]);

  if (items === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-5">
      {role === "family" && <ParentSetup hasChild={(family?.length || 0) > 0} />}
      {failed && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Some items couldn&apos;t load. Refresh to try again.</p>}
      {items.length === 0 ? (
        <EmptyState title="All clear.">Nothing needs doing right now. New items appear here by themselves, and clear once the work is done.</EmptyState>
      ) : (
        GROUPS.map((g) => {
          const list = items.filter((i) => i.urgency === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} aria-labelledby={`ac-${g.key}`}>
              <h2 id={`ac-${g.key}`} className="text-base font-semibold text-ink">
                {g.title} <span className="font-normal text-ink/65">· {list.length}</span>
              </h2>
              <p className={ui.hint}>{g.hint}</p>
              <ul className="mt-2 space-y-2">
                {list.map((i) => (
                  <li key={i.id} className={`${ui.card} flex flex-wrap items-center justify-between gap-3`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        <StatusChip tone={g.key === "now" ? "bad" : g.key === "soon" ? "warn" : "neutral"}>{i.area}</StatusChip>
                        {i.title}
                      </p>
                      <p className="mt-1 text-sm text-ink/75">{i.detail}</p>
                      {(i.people?.length || i.who) && (
                        <p className="mt-0.5 text-xs text-ink/65">
                          {role === "teach" && i.people
                            ? i.people.map((p, n) => (
                                <span key={p.id}>
                                  {n > 0 && ", "}
                                  <Link href={`/teach/pupils?pupil=${p.id}`} className="font-medium text-teal-700 hover:underline">
                                    {p.name}
                                  </Link>
                                </span>
                              ))
                            : i.people?.map((p) => p.name).join(", ")}
                          {i.who ? ` ${i.who}` : ""}
                        </p>
                      )}
                    </div>
                    <Link href={i.href} className={`${g.key === "now" ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
                      {i.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {staff && (
        <details className={ui.card}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">How missing homework is followed up</summary>
          <ol className="mt-2 space-y-1.5 text-sm text-ink/80">
            <li><b>Due date:</b> anything not handed in is marked missing by itself. No one has to mark it.</li>
            <li><b>1 day:</b> the pupil and parent see it in their own Action centre, and the pupil can hand it in late.</li>
            <li><b>2 days:</b> tell the parent.</li>
            <li><b>3 days:</b> chase the pupil and agree a day.</li>
            <li><b>5 days:</b> escalate to the head teacher.</li>
            <li><b>3 missed in 14 days:</b> a pattern. Speak to the parent and agree support.</li>
          </ol>
          <p className="mt-2 text-xs text-ink/65">The portal shows each stage and who is at it. It does not send emails or messages for you.</p>
        </details>
      )}
    </div>
  );
}
