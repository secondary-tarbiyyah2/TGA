"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { MessageThread } from "@/components/learn/MessageThread";
import { getSupabaseClient } from "@/lib/supabase/client";

type Parent = { parent_user_id: string; name: string; child_id: string; child_name: string };
type Staff = { id: string; name: string };
type Thread = { id: string; kind: string; parent_id: string | null; child_id: string | null; staff_a_id: string | null; staff_b_id: string | null };

function TeachMessagesContent() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: roleRows } = await supabase.from("user_roles").select("scope_id").eq("user_id", user.id).eq("scope_type", "class");
    const classIds = (roleRows || []).map((r) => r.scope_id).filter(Boolean) as string[];

    if (classIds.length > 0) {
      const { data: enrolments } = await supabase.from("enrolments").select("child_id, children(id, name, parent_user_id, profiles:parent_user_id(full_name))").in("class_id", classIds);
      setParents(
        ((enrolments as unknown as { children: { id: string; name: string; parent_user_id: string; profiles: { full_name: string } | null } | null }[]) || [])
          .map((e) => e.children)
          .filter(Boolean)
          .map((c) => ({ parent_user_id: c!.parent_user_id, name: c!.profiles?.full_name || "Parent", child_id: c!.id, child_name: c!.name }))
      );
    }

    const { data: staffRows } = await supabase.from("user_roles").select("user_id, profiles(full_name)").in("role", ["head_teacher", "admin", "teacher", "teaching_assistant_cover"]);
    const seen = new Set<string>();
    const staffList: Staff[] = [];
    for (const r of (staffRows as unknown as { user_id: string; profiles: { full_name: string } | null }[]) || []) {
      if (r.user_id === user.id || seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      staffList.push({ id: r.user_id, name: r.profiles?.full_name || "Staff" });
    }
    setStaff(staffList);

    const { data: threadRows } = await supabase
      .from("message_threads")
      .select("id, kind, parent_id, child_id, staff_a_id, staff_b_id")
      .or(`teacher_id.eq.${user.id},staff_a_id.eq.${user.id},staff_b_id.eq.${user.id}`);
    setThreads((threadRows as Thread[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const openParentThread = async (parent: Parent) => {
    if (!supabase || !userId) return;
    const existing = threads.find((t) => t.kind === "parent_teacher" && t.parent_id === parent.parent_user_id && t.child_id === parent.child_id);
    if (existing) return setActive(existing.id);
    const { data, error } = await supabase
      .from("message_threads")
      .insert({ kind: "parent_teacher", child_id: parent.child_id, parent_id: parent.parent_user_id, teacher_id: userId })
      .select("id")
      .single();
    if (!error && data) {
      await load();
      setActive(data.id);
    }
  };

  const openStaffThread = async (other: Staff) => {
    if (!supabase || !userId) return;
    const existing = threads.find((t) => t.kind === "staff" && (t.staff_a_id === other.id || t.staff_b_id === other.id));
    if (existing) return setActive(existing.id);
    const { data, error } = await supabase.from("message_threads").insert({ kind: "staff", staff_a_id: userId, staff_b_id: other.id }).select("id").single();
    if (!error && data) {
      await load();
      setActive(data.id);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-h2 font-semibold text-ink">Messages</h1>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase text-ink/50">Parents</h2>
            <div className="mt-2 space-y-2">
              {parents.map((p) => (
                <button key={`${p.parent_user_id}-${p.child_id}`} type="button" onClick={() => openParentThread(p)} className="block w-full rounded-lg border border-gold-light/40 p-2 text-left text-sm hover:bg-cream">
                  {p.name} <span className="text-ink/50">({p.child_name})</span>
                </button>
              ))}
              {parents.length === 0 && <p className="text-sm text-ink/60">No parents found yet.</p>}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase text-ink/50">Staff</h2>
            <div className="mt-2 space-y-2">
              {staff.map((s) => (
                <button key={s.id} type="button" onClick={() => openStaffThread(s)} className="block w-full rounded-lg border border-gold-light/40 p-2 text-left text-sm hover:bg-cream">
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>{active ? <MessageThread threadId={active} /> : <p className="text-sm text-ink/60">Select a person to start or continue a conversation.</p>}</div>
      </div>
    </div>
  );
}

export default function TeachMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachMessagesContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
