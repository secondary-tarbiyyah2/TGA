"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFamilyChildren, useStudentChildId } from "@/lib/learn/classes";
import { StatusChip, ui } from "@/components/learn/ui";
import { loadPupilItems, loadStaffItems, sortItems, type ActionItem, type Role } from "@/lib/learn/actionCentre";

const KEY = (role: string) => `tga-ac-widget:${role}`;
const TTL = 2 * 60 * 1000;

/**
 * The dashboard's window into the Action centre: the three most urgent things, or nothing at all
 * when all is clear (the pinned sidebar link already carries the count). Cached briefly per tab
 * so the dashboard stays quick.
 */
export function ActionCentreWidget({ role }: { role: Role }) {
  const family = useFamilyChildren();
  const studentChild = useStudentChildId();
  const [items, setItems] = useState<ActionItem[] | null>(null);

  const staff = role === "teach" || role === "admin";
  const pupils = role === "family" ? family : role === "student" ? (studentChild === undefined ? null : studentChild ? [{ id: studentChild, name: "You" }] : []) : [];
  const key = staff ? role : pupils ? pupils.map((c) => c.id).join(",") || "none" : "wait";

  useEffect(() => {
    if (key === "wait") return;
    let alive = true;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(KEY(role)) || "null") as { at: number; items: ActionItem[] } | null;
      if (cached && Date.now() - cached.at < TTL) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the cached list once after mount
        setItems(cached.items);
        return;
      }
    } catch {
      /* load fresh */
    }
    (async () => {
      try {
        const list = sortItems(staff ? await loadStaffItems(role as "teach" | "admin") : await loadPupilItems(pupils || [], role as "student" | "family"));
        if (!alive) return;
        setItems(list);
        try {
          window.sessionStorage.setItem(KEY(role), JSON.stringify({ at: Date.now(), items: list }));
        } catch {
          /* fine uncached */
        }
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the role and pupils
  }, [key]);

  const urgent = (items || []).filter((i) => i.urgency !== "info");
  if (!urgent.length) return null;
  const base = role === "teach" ? "/teach" : role === "admin" ? "/admin" : role === "family" ? "/family" : "/student";

  return (
    <section aria-labelledby="ac-widget" className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ac-widget" className="text-sm font-semibold text-ink">
          Needs you <span className="font-normal text-ink/65">· {urgent.length}</span>
        </h2>
        <Link href={`${base}/actions`} className={`${ui.btnSecondary} ${ui.sm}`}>
          Open Action centre
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {urgent.slice(0, 3).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <StatusChip tone={i.urgency === "now" ? "bad" : "warn"}>{i.area}</StatusChip>
            <Link href={i.href} className="min-w-0 flex-1 truncate font-medium hover:underline">
              {i.title}
            </Link>
          </li>
        ))}
      </ul>
      {urgent.length > 3 && <p className="mt-2 text-xs text-ink/65">and {urgent.length - 3} more in the Action centre.</p>}
    </section>
  );
}
