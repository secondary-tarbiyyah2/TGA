"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { StaffProfileForm } from "@/components/learn/staff/StaffProfileForm";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

function ProfileContent() {
  const { session } = useLearnSession();
  const userId = session && session !== "loading" ? session.user.id : null;
  const [name, setName] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setName((data as { full_name?: string } | null)?.full_name || ""));
  }, [userId]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="My profile" subtitle="This is what families and students of your classes see under Meet your teachers. Safeguarding and HR records are never shown." />
      <div className="rounded-2xl border border-gold-light bg-white p-6">{userId ? <StaffProfileForm userId={userId} fullName={name || "Teacher"} /> : <div className="h-40 animate-pulse rounded-lg bg-cream" />}</div>
    </div>
  );
}

export default function TeachProfilePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <ProfileContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
