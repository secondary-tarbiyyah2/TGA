"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren, useStudentChildId } from "@/lib/learn/classes";
import { loadPupilItems, loadStaffItems, sortItems, type ActionItem, type Role } from "@/lib/learn/actionCentre";
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
    const ok = (agreed.data as { plan_id: string; plan_updated_at: string | null }[]) || [];
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

async function loadAll(role: Role, pupils: { id: string; name: string }[]): Promise<ActionItem[]> {
  const staff = role === "teach" || role === "admin";
  const [list, extras] = await Promise.all([
    staff ? loadStaffItems(role) : loadPupilItems(pupils, role),
    role === "family" ? loadFamilyExtras().catch(() => [] as ActionItem[]) : Promise.resolve([] as ActionItem[]),
  ]);
  return sortItems([...list, ...extras]);
}

// One load shared by everything on the page (the dashboard's widget and its
// header count), kept for two minutes so moving around the portal stays quick.
// The Action centre page itself always loads fresh.
const TTL = 2 * 60 * 1000;
const shared = new Map<string, { at: number; p: Promise<ActionItem[]> }>();

/**
 * Everything that needs this user, most urgent first, from the same loaders
 * the Action centre page uses, so the dashboard and the page always agree.
 * `null` while loading; `failed` when a loader threw (the list is then empty).
 */
export function useActionItems(role: Role, { fresh = false }: { fresh?: boolean } = {}): { items: ActionItem[] | null; failed: boolean; reload: () => void } {
  const family = useFamilyChildren();
  const studentChild = useStudentChildId();
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  const staff = role === "teach" || role === "admin";
  const pupils = role === "family" ? family : role === "student" ? (studentChild === undefined ? null : studentChild ? [{ id: studentChild, name: "You" }] : []) : [];
  const key = staff ? role : pupils ? `${role}:${pupils.map((c) => c.id).join(",") || "none"}` : "wait";

  useEffect(() => {
    if (key === "wait" || !getSupabaseClient()) return;
    let alive = true;
    const hit = shared.get(key);
    const p = !fresh && tick === 0 && hit && Date.now() - hit.at < TTL ? hit.p : loadAll(role, pupils || []);
    if (p !== hit?.p) shared.set(key, { at: Date.now(), p });
    p.then(
      (list) => {
        if (!alive) return;
        setItems(list);
        setFailed(false);
      },
      () => {
        shared.delete(key);
        if (!alive) return;
        setItems([]);
        setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already captures role and the pupil list
  }, [key, tick, fresh]);

  return { items, failed, reload: () => setTick((t) => t + 1) };
}
