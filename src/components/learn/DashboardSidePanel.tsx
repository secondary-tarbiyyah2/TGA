"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classColour, readRecentPages, type RecentPage } from "@/lib/learn/classes";
import { UpcomingLessons } from "@/components/learn/UpcomingLessons";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <h2 className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────
type TimelineItem = { key: string; title: string; dueAt: string; classId: string; className: string; href: string; overdue: boolean; who?: string };

function bucketOf(dueAt: string): string {
  const due = new Date(dueAt);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
  if (due.getTime() < Date.now()) return "Overdue";
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return "This week";
  return "Later";
}
const BUCKET_ORDER = ["Overdue", "Today", "Tomorrow", "This week", "Later"];

/** Moodle's Timeline block: what's due, grouped by when. */
function Timeline({ items }: { items: TimelineItem[] | null }) {
  if (items === null) return <p className="text-sm text-ink/55">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-ink/55">Nothing due in the next two weeks.</p>;
  const groups = BUCKET_ORDER.map((b) => ({ b, list: items.filter((i) => bucketOf(i.dueAt) === b) })).filter((g) => g.list.length > 0);
  return (
    <div className="space-y-4">
      {groups.map(({ b, list }) => (
        <div key={b}>
          <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wider ${b === "Overdue" ? "text-red-700" : "text-ink/45"}`}>{b}</p>
          <ul className="space-y-1">
            {list.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-cream">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: classColour(i.classId) }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{i.title}</span>
                    <span className="block truncate text-xs text-ink/55">
                      {i.className}
                      {i.who ? ` · ${i.who}` : ""} ·{" "}
                      {new Date(i.dueAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type Viewer =
  | { kind: "teacher"; classIds: string[] }
  | { kind: "student"; childId: string; classIds: string[] }
  | { kind: "parent"; children: { id: string; name: string }[] };

function useTimeline(viewer: Viewer): TimelineItem[] | null {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const key =
    viewer.kind === "teacher" ? `t:${viewer.classIds.join(",")}` : viewer.kind === "student" ? `s:${viewer.childId}` : `p:${viewer.children.map((c) => c.id).join(",")}`;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString();
    (async () => {
      let out: TimelineItem[] = [];
      if (viewer.kind === "teacher") {
        if (viewer.classIds.length === 0) return setItems([]);
        const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
        const { data } = await supabase
          .from("homework")
          .select("id, title, due_at, class_id, classes(name)")
          .in("class_id", viewer.classIds)
          .gte("due_at", since)
          .lte("due_at", horizon)
          .order("due_at");
        out = ((data as unknown as { id: string; title: string; due_at: string; class_id: string; classes?: { name: string } | null }[]) || []).map((h) => ({
          key: h.id,
          title: h.title,
          dueAt: h.due_at,
          classId: h.class_id,
          className: h.classes?.name || "",
          href: `/teach/class?id=${h.class_id}&tab=homework`,
          overdue: new Date(h.due_at).getTime() < Date.now(),
        }));
      } else {
        const kids = viewer.kind === "student" ? [{ id: viewer.childId, name: "" }] : viewer.children;
        if (kids.length === 0) return setItems([]);
        const { data } = await supabase
          .from("homework_status")
          .select("homework_id, child_id, class_id, due_at, status, homework:homework_id(title, classes(name))")
          .in(
            "child_id",
            kids.map((k) => k.id),
          )
          .in("status", ["not_yet_due", "missing"])
          .lte("due_at", horizon)
          .order("due_at");
        const rows =
          (data as unknown as { homework_id: string; child_id: string; class_id: string; due_at: string; status: string; homework?: { title: string; classes?: { name: string } | null } | null }[]) || [];
        out = rows.map((r) => {
          const kid = kids.find((k) => k.id === r.child_id);
          const base = viewer.kind === "student" ? `/student/class?id=${r.class_id}` : `/family/class?id=${r.class_id}&child=${r.child_id}`;
          return {
            key: `${r.homework_id}-${r.child_id}`,
            title: r.homework?.title || "Homework",
            dueAt: r.due_at,
            classId: r.class_id,
            className: r.homework?.classes?.name || "",
            href: `${base}&tab=homework`,
            overdue: r.status === "missing",
            who: viewer.kind === "parent" && viewer.children.length > 1 ? kid?.name : undefined,
          };
        });
      }
      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the viewer's identity
  }, [key]);

  return items;
}

// ── Recently accessed ─────────────────────────────────────────────────
function Recent({ prefix }: { prefix: string }) {
  const [pages, setPages] = useState<RecentPage[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage, only available after mount
    setPages(readRecentPages(prefix));
  }, [prefix]);
  if (pages === null) return null;
  if (pages.length === 0) return <p className="text-sm text-ink/55">Classes you open will show up here.</p>;
  return (
    <ul className="space-y-1">
      {pages.slice(0, 5).map((p) => (
        <li key={p.href}>
          <Link href={p.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-cream">
            <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-md" style={{ backgroundColor: p.colourId ? classColour(p.colourId) : "#6b7178" }} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
              {p.subtitle && <span className="block truncate text-xs text-ink/55">{p.subtitle}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const PANEL_KEY = "tga:side-panel-hidden";

/**
 * Moodle's right-hand block drawer, for the teach/student/family
 * dashboards: Timeline, upcoming lessons, recently accessed. It can be
 * hidden (remembered per browser), like Moodle's drawer toggle.
 */
export function DashboardWithPanel({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const timeline = useTimeline(viewer);
  const area = viewer.kind === "teacher" ? "/teach" : viewer.kind === "student" ? "/student" : "/family";
  const lessonClassIds = viewer.kind === "parent" ? [] : viewer.classIds;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage, only available after mount
      setHidden(localStorage.getItem(PANEL_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem(PANEL_KEY, h ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !h;
    });
  };

  return (
    <div className={`grid gap-6 ${hidden ? "" : "xl:grid-cols-[minmax(0,1fr)_340px]"}`}>
      <div className="min-w-0">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={toggle} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink/60 hover:bg-white hover:text-ink">
            {hidden ? "Show side panel" : "Hide side panel"}
          </button>
        </div>
        {children}
      </div>
      {!hidden && (
        <aside aria-label="Side panel" className="space-y-4 xl:pt-11">
          <Block title="Timeline">
            <Timeline items={timeline} />
          </Block>
          {viewer.kind !== "parent" && (
            <Block title="Upcoming lessons">
              <UpcomingLessons
                classIds={lessonClassIds}
                basePath={`${area}/lessons/view`}
                emptyLabel="No lessons in the next two weeks."
              />
            </Block>
          )}
          <Block title="Recently accessed">
            <Recent prefix={area} />
          </Block>
        </aside>
      )}
    </div>
  );
}
