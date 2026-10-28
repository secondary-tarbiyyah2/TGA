"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSelectedChild } from "@/lib/learn/selectedChild";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState, ui } from "@/components/learn/ui";

type Child = { id: string; name: string };

function FamilyHomeworkContent() {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();
  const [children, setChildren] = useState<Child[] | null>(null);
  // ?child= wins, else the child chosen anywhere in the family area, else the first.
  const [selected, setSelected] = useSelectedChild(children ? children.map((c) => c.id) : null);
  const openId = searchParams.get("hw") || undefined;

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("children")
      .select("id, name")
      .order("name")
      .then(({ data }) => setChildren((data as Child[]) || []));
  }, [supabase]);

  const name = children?.find((c) => c.id === selected)?.name?.split(" ")[0];
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "To do", href: selected ? `/family/todo?child=${selected}` : "/family/todo" }, { label: "Homework" }]}
        title="Homework"
        subtitle={`See what's been set${name ? ` for ${name}` : ""}, hand in work and read feedback. Tap a piece of homework to open it.`}
      />
      {children && children.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Child">
          {children.map((c) => (
            <button key={c.id} type="button" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)} className={`${selected === c.id ? ui.chipOn : ui.chip} min-h-10`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {children !== null && children.length === 0 ? (
        <EmptyState title="No children on your account yet." />
      ) : selected ? (
        <HomeworkForChild key={selected} childId={selected} canSubmit canResubmit groupByStatus openId={openId} />
      ) : (
        <p className="text-sm text-ink/65">Loading…</p>
      )}
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
