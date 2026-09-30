"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { MessageThread } from "@/components/learn/MessageThread";
import { getSupabaseClient } from "@/lib/supabase/client";

type Staff = { id: string; name: string };
type Thread = { id: string; staff_a_id: string | null; staff_b_id: string | null };

function AdminMessagesContent() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
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
    const { data: staffRows } = await supabase.from("user_roles").select("user_id, profiles(full_name)").in("role", ["head_teacher", "admin", "teacher", "teaching_assistant_cover", "admissions"]);
    const seen = new Set<string>();
    const list: Staff[] = [];
    for (const r of (staffRows as unknown as { user_id: string; profiles: { full_name: string } | null }[]) || []) {
      if (r.user_id === user.id || seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      list.push({ id: r.user_id, name: r.profiles?.full_name || "Staff" });
    }
    setStaff(list);
    const { data: threadRows } = await supabase.from("message_threads").select("id, staff_a_id, staff_b_id").eq("kind", "staff").or(`staff_a_id.eq.${user.id},staff_b_id.eq.${user.id}`);
    setThreads((threadRows as Thread[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const open = async (other: Staff) => {
    if (!supabase || !userId) return;
    const existing = threads.find((t) => t.staff_a_id === other.id || t.staff_b_id === other.id);
    if (existing) return setActive(existing.id);
    const { data, error } = await supabase.from("message_threads").insert({ kind: "staff", staff_a_id: userId, staff_b_id: other.id }).select("id").single();
    if (!error && data) {
      await load();
      setActive(data.id);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">Staff messages</h1>
      <div className="mt-4 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {staff.map((s) => (
            <button key={s.id} type="button" onClick={() => open(s)} className="block w-full rounded-lg border border-gold-light/40 p-2 text-left text-sm hover:bg-cream">
              {s.name}
            </button>
          ))}
        </div>
        <div>{active ? <MessageThread threadId={active} /> : <p className="text-sm text-ink/60">Select a colleague to start or continue a conversation.</p>}</div>
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <AdminMessagesContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
