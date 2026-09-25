"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { useLearnSignOut } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

function StudentHomeworkContent() {
  const signOut = useLearnSignOut();
  const supabase = getSupabaseClient();
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: account } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
      setChildId((account?.child_id as string) || null);
    })();
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-h2 font-semibold text-ink">My homework</h1>
        <button type="button" onClick={signOut} className="rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
          Sign out
        </button>
      </div>
      <div className="mt-6">{childId ? <HomeworkForChild childId={childId} canSubmit /> : <p className="text-sm text-ink/60">Loading…</p>}</div>
    </div>
  );
}

export default function StudentHomeworkPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["student"]}>
        <StudentHomeworkContent />
      </LearnGate>
    </section>
  );
}
