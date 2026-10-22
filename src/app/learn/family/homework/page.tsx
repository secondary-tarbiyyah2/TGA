"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";

type Child = { id: string; name: string };

function FamilyHomeworkContent() {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<string>(searchParams.get("child") || "");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("children")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const rows = (data as Child[]) || [];
        setChildren(rows);
        if (!selected && rows[0]) setSelected(rows[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "To do", href: "/family/todo" }, { label: "Homework" }]} title="Homework" subtitle="See what's been set, hand in work and read feedback." />
      {children && children.length > 1 && (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Child" className="rounded-lg border border-gold-light px-3 py-2 text-sm">
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="mt-6">{selected ? <HomeworkForChild childId={selected} canSubmit canResubmit /> : <p className="text-sm text-ink/65">Loading…</p>}</div>
    </div>
  );
}

export default function FamilyHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <FamilyHomeworkContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
