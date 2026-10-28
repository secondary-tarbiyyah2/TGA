"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren, useStudentChildId } from "@/lib/learn/classes";
import { EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { ParentSetup } from "@/components/learn/ParentSetup";
import { loadPupilItems, loadStaffItems, sortItems, type ActionItem, type Role, type Urgency } from "@/lib/learn/actionCentre";
import { fetchAbsences, fetchNotes } from "@/components/learn/absences/data";
import { completeness, DETAILS_SELECT, type PupilDetails } from "@/components/learn/pupil/data";
import { shiftDateKey, ukToday } from "@/lib/learn/ukTime";

/**
 * The parent-only things the homework and Qur'an lists don't cover, so the
 * Action centre agrees with the dashboard: documents waiting for a signature,
 * child details still incomplete, and recent absences with no reason given.
 * Each piece fails quietly on its own (no item is better than a wrong one).
 */
async function loadFamilyExtras(): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const out: ActionItem[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const [sigs, kids, det, cons, notes, plans, agreed] = await Promise.all([
    supabase.from("my_outstanding_signatures").select("document_id", { count: "exact", head: true }),
    supabase.from("children").select("id, name, dob").order("name"),
    supabase.from("pupil_details").select(DETAILS_SELECT),
    supabase.from("pupil_emergency_contacts").select("child_id"),
    fetchNotes(),
    supabase.from("send_support_plans").select("id, child_id, updated_at").eq("status", "active"),
    supabase.from("send_plan_family_responses").select("plan_id, plan_updated_at").eq("agreed", true),
  ]);
  if (!sigs.error && (sigs.count || 0) > 0) {
    const n = sigs.count || 0;
    out.push({ id: "fam-sign", area: "Signatures", urgency: "now", title: `${plural(n, "document")} to read and sign`, detail: "School policies and agreements that need your signature.", href: "/documents", cta: "Review and sign" });
  }
  if (!kids.error) {
    const list = (kids.data as unknown as { id: string; name: string; dob: string | null }[]) || [];
    const detailsBy = new Map(((det.data as unknown as PupilDetails[]) || []).map((d) => [d.child_id, d]));
    const countBy = new Map<string, number>();
    for (const c of (cons.data as unknown as { child_id: string }[]) || []) countBy.set(c.child_id, (countBy.get(c.child_id) || 0) + 1);
    const incomplete = list.filter((k) => completeness(detailsBy.get(k.id) || null, countBy.get(k.id) || 0, k.dob).percent < 100);
    if (incomplete.length) {
      out.push({ id: "fam-details", area: "Child details", urgency: "now", title: `Complete ${incomplete.map((k) => k.name.split(" ")[0]).join(" and ")}'s details`, detail: "Address, GP, health, emergency contacts and consents are required for every pupil.", href: "/family/child-details", cta: "Complete details" });
    }
  }
  // An active support plan the family hasn't agreed to since it last changed (0169).
  if (!plans.error && !kids.error) {
    const names = new Map(((kids.data as unknown as { id: string; name: string }[]) || []).map((k) => [k.id, k.name.split(" ")[0]]));
    const ok = ((agreed.data as { plan_id: string; plan_updated_at: string | null }[]) || []);
    const toRead = ((plans.data as { id: string; child_id: string; updated_at: string }[]) || []).filter(
      (p) => !ok.some((a) => a.plan_id === p.id && a.plan_updated_at && new Date(a.plan_updated_at).getTime() >= new Date(p.updated_at).getTime() - 1000),
    );
    if (toRead.length) {
      const who = toRead.map((p) => names.get(p.child_id) || "your child").join(" and ");
      out.push({ id: "fam-send", area: "SEND", urgency: "soon", title: `Read ${who}'s support plan`, detail: "It has been shared or updated. Tell us if you agree, or add a comment.", href: "/family/support", cta: "Read the plan" });
    }
  }
  if (!notes.error) {
    const today = ukToday();
    const abs = await fetchAbsences(shiftDateKey(today, -30), today, notes.notes);
    if (!abs.error) {
      const days = new Set(
        abs.absences
          .filter((a) => a.kind === "unexplained" && !notes.notes.some((n) => n.child_id === a.childId && a.date >= n.from_date && a.date <= n.to_date))
          .map((a) => `${a.childId}|${a.date}`),
      );
      if (days.size) out.push({ id: "fam-abs", area: "Absence", urgency: "soon", title: `${plural(days.size, "absence")} we haven't heard about`, detail: "Tell us why your child was away. It takes a few seconds.", href: "/family/absences", cta: "Tell us why" });
    }
  }
  return out;
}

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
        const [list, extras] = await Promise.all([
          staff ? loadStaffItems(role as "teach" | "admin") : loadPupilItems(pupils || [], role as "student" | "family"),
          role === "family" ? loadFamilyExtras().catch(() => [] as ActionItem[]) : Promise.resolve([] as ActionItem[]),
        ]);
        if (alive) {
          setItems(sortItems([...list, ...extras]));
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
