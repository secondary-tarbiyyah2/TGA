"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { LearnRole } from "@/lib/learn/session";
import { ROLE_PRIORITY, type ClassOption, type ParentOption, type Person, type YearGroup } from "./shared";

type RoleRow = { user_id: string; role: LearnRole; scope_type: string; scope_id: string | null };
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type ChildRow = { id: string; name: string; parent_user_id: string; year_group_id: string | null };
type AccountRow = { child_id: string; profile_id: string | null };
type ClassRow = { id: string; name: string; year_group_id: string | null };

export type PeopleData = {
  loading: boolean;
  error: string | null;
  people: Person[];
  yearGroups: YearGroup[];
  classes: ClassOption[];
  parents: ParentOption[];
  reload: () => void;
};

export function usePeople(): PeopleData {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [rolesRes, profilesRes, childrenRes, accountsRes, ygRes, classRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role, scope_type, scope_id"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("children").select("id, name, parent_user_id, year_group_id").order("name"),
        supabase.from("student_accounts").select("child_id, profile_id"),
        supabase.from("year_groups").select("id, name").order("sort_order"),
        supabase.from("classes").select("id, name, year_group_id").order("name"),
      ]);
      if (cancelled) return;
      if (rolesRes.error || profilesRes.error) {
        setError("Couldn't load people. Refresh the page and try again.");
        setLoading(false);
        return;
      }
      const roleRows = (rolesRes.data as RoleRow[] | null) || [];
      const profiles = (profilesRes.data as ProfileRow[] | null) || [];
      const children = (childrenRes.data as ChildRow[] | null) || [];
      const accounts = (accountsRes.data as AccountRow[] | null) || [];
      const ygs = (ygRes.data as YearGroup[] | null) || [];
      const classRows = (classRes.data as ClassRow[] | null) || [];

      const ygName = new Map(ygs.map((y) => [y.id, y.name]));
      const className = new Map(classRows.map((c) => [c.id, c.name]));
      const profileById = new Map(profiles.map((p) => [p.id, p]));
      const childByProfile = new Map<string, ChildRow>();
      const loginChildIds = new Set<string>();
      const childById = new Map(children.map((c) => [c.id, c]));
      for (const a of accounts) {
        if (!a.profile_id) continue;
        loginChildIds.add(a.child_id);
        const child = childById.get(a.child_id);
        if (child) childByProfile.set(a.profile_id, child);
      }

      const rolesByUser = new Map<string, RoleRow[]>();
      for (const r of roleRows) rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) || []), r]);

      const out: Person[] = [];
      for (const [userId, rows] of rolesByUser) {
        const profile = profileById.get(userId);
        if (!profile) continue;
        const roles = ROLE_PRIORITY.filter((r) => rows.some((x) => x.role === r));
        const classScopes = rows.filter((x) => x.scope_type === "class" && x.scope_id).map((x) => x.scope_id as string);
        const child = childByProfile.get(userId);
        out.push({
          key: `p-${userId}`,
          profileId: userId,
          childId: child?.id || null,
          name: profile.full_name || profile.email || "Unnamed",
          email: profile.email,
          roles,
          classScope: classScopes[0] || null,
          classNames: classScopes.map((id) => className.get(id) || "").filter(Boolean),
          yearGroup: child?.year_group_id ? ygName.get(child.year_group_id) || null : null,
          parentName: child ? profileById.get(child.parent_user_id)?.full_name || null : null,
          childNames: children.filter((c) => c.parent_user_id === userId).map((c) => c.name),
        });
      }
      for (const c of children) {
        if (loginChildIds.has(c.id)) continue;
        out.push({
          key: `c-${c.id}`,
          profileId: null,
          childId: c.id,
          name: c.name,
          email: null,
          roles: ["student"],
          classScope: null,
          classNames: [],
          yearGroup: c.year_group_id ? ygName.get(c.year_group_id) || null : null,
          parentName: profileById.get(c.parent_user_id)?.full_name || null,
          childNames: [],
        });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));

      setPeople(out);
      setYearGroups(ygs);
      setClasses(classRows.map((c) => ({ id: c.id, name: c.name, yearGroupId: c.year_group_id })));
      setParents(
        out
          .filter((p) => p.profileId && p.roles.includes("parent"))
          .map((p) => ({ id: p.profileId as string, name: p.name, email: p.email }))
      );
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, tick]);

  return { loading, error, people, yearGroups, classes, parents, reload };
}
