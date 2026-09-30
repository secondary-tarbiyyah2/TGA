"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { MessageThread } from "@/components/learn/MessageThread";
import { getSupabaseClient } from "@/lib/supabase/client";

type Child = { id: string; name: string };
type Teacher = { user_id: string; name: string; class_name: string };
type Thread = { id: string; teacher_id: string; child_id: string };

function FamilyMessagesContent() {
  const supabase = getSupabaseClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: kids } = await supabase.from("children").select("id, name");
    setChildren((kids as Child[]) || []);
    const childIds = (kids || []).map((c) => c.id);
    if (childIds.length === 0) return;

    const { data: enrolments } = await supabase.from("enrolments").select("class_id, child_id").in("child_id", childIds);
    const classIds = [...new Set((enrolments || []).map((e) => e.class_id))];
    if (classIds.length > 0) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, scope_id, profiles(full_name), classes(name)")
        .in("scope_id", classIds)
        .eq("scope_type", "class")
        .in("role", ["teacher", "teaching_assistant_cover"]);
      setTeachers(
        ((roleRows as unknown as { user_id: string; profiles: { full_name: string } | null; classes: { name: string } | null }[]) || []).map((r) => ({
          user_id: r.user_id,
          name: r.profiles?.full_name || "Teacher",
          class_name: r.classes?.name || "",
        }))
      );
    }

    const { data: threadRows } = await supabase.from("message_threads").select("id, teacher_id, child_id").eq("kind", "parent_teacher").eq("parent_id", user.id);
    setThreads((threadRows as Thread[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const openOrCreate = async (teacherId: string, childId: string) => {
    if (!supabase) return;
    const existing = threads.find((t) => t.teacher_id === teacherId && t.child_id === childId);
    if (existing) {
      setActive(existing.id);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("message_threads")
      .insert({ kind: "parent_teacher", child_id: childId, parent_id: user.id, teacher_id: teacherId })
      .select("id")
      .single();
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
      <p className="mt-1 text-sm text-ink/60">Message your child&apos;s teachers directly. Staff review messages for safeguarding as part of normal practice.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {children.map((child) =>
            teachers.map((t) => (
              <button
                key={`${child.id}-${t.user_id}`}
                type="button"
                onClick={() => openOrCreate(t.user_id, child.id)}
                className="block w-full rounded-lg border border-gold-light/40 p-2 text-left text-sm hover:bg-cream"
              >
                {t.name} <span className="text-ink/50">({child.name}, {t.class_name})</span>
              </button>
            ))
          )}
          {teachers.length === 0 && <p className="text-sm text-ink/60">No teachers found yet.</p>}
        </div>
        <div>{active ? <MessageThread threadId={active} /> : <p className="text-sm text-ink/60">Select a teacher to start or continue a conversation.</p>}</div>
      </div>
    </div>
  );
}

export default function FamilyMessagesPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <FamilyMessagesContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
