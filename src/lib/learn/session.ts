"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

export const LEARN_ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"] as const;
export type LearnRole = (typeof LEARN_ROLES)[number];

export const STAFF_ROLES: LearnRole[] = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"];

export type RoleGrant = { role: LearnRole; scope_type: "none" | "class" | "family"; scope_id: string | null };

const ROLE_LABELS: Record<LearnRole, string> = {
  head_teacher: "Head Teacher",
  admin: "Admin",
  admissions: "Admissions",
  teacher: "Teacher",
  teaching_assistant_cover: "Teaching Assistant / Cover",
  parent: "Parent",
  student: "Student",
};

export function learnRoleLabel(role: LearnRole): string {
  return ROLE_LABELS[role];
}

export function dashboardPathForRole(role: LearnRole): string {
  if (role === "teacher" || role === "teaching_assistant_cover") return "/learn/teach/dashboard";
  if (role === "parent") return "/learn/family/dashboard";
  if (role === "student") return "/learn/student/dashboard";
  return "/learn/admin/dashboard";
}

/**
 * The client-side view of "who is signed in and what /learn roles do they
 * hold" — used to decide WHAT TO RENDER (role switcher, which dashboard).
 * This is UX only, never the security boundary: every role grant here comes
 * from a `user_roles` row that Postgres RLS already scoped to "rows the
 * caller is allowed to read" (see 0007_learn_roles_permissions.sql), and
 * every actual page of data underneath is independently RLS-scoped again.
 * A bug in this hook could show the wrong dashboard; it can't leak another
 * family's or class's data, because that's enforced a layer below this.
 */
export function useLearnSession() {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [roles, setRoles] = useState<RoleGrant[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- whether Supabase is configured is only known post-mount
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session || session === "loading") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state when the session itself changes/clears, not a render-cycle sync
      setRoles([]);
      setRolesLoaded(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role, scope_type, scope_id")
      .eq("user_id", session.user.id)
      .then(({ data }) => {
        setRoles((data as RoleGrant[]) || []);
        setRolesLoaded(true);
      });
  }, [supabase, session]);

  return { session, roles, rolesLoaded };
}

export function useLearnSignOut() {
  const router = useRouter();
  return async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/learn/login");
  };
}
