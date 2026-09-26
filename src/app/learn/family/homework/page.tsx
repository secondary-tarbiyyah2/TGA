"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { getSupabaseClient } from "@/lib/supabase/client";

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
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-h2 font-semibold text-ink">Homework</h1>
      </div>
      {children && children.length > 1 && (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-4 rounded-md border border-gold-light/60 px-3 py-2 text-sm">
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="mt-6">{selected ? <HomeworkForChild childId={selected} canSubmit={false} /> : <p className="text-sm text-ink/60">Loading…</p>}</div>
    </div>
  );
}

export default function FamilyHomeworkPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
          <FamilyHomeworkContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
