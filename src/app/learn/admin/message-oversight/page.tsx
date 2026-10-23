"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ThreadList } from "@/components/learn/oversight/ThreadList";
import { ThreadViewer } from "@/components/learn/oversight/ThreadViewer";
import type { OversightThread } from "@/components/learn/oversight/types";

function Oversight() {
  const [threads, setThreads] = useState<OversightThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc("oversight_list_threads").then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setThreads((data as OversightThread[]) || []);
    });
  }, []);

  const active = threads?.find((t) => t.thread_id === activeId) || null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Message oversight" }]}
        title="Message oversight"
      />
      <div role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        Read-only oversight. Opening a conversation is recorded in the audit log.
      </div>
      {error && <p className="text-sm text-red-700">Could not load conversations: {error}</p>}
      {!error && threads === null && <p className="text-ink/65">Loading…</p>}
      {threads && (
        <div className="grid gap-4 md:h-[70vh] md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="min-h-0 max-h-[60vh] md:max-h-none">
            <ThreadList threads={threads} activeId={activeId} onSelect={setActiveId} />
          </div>
          <div className="min-h-[20rem] md:min-h-0">
            {active ? (
              <ThreadViewer key={active.thread_id} thread={active} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-ink/20 p-6 text-sm text-ink/65">
                Select a conversation to read it.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function MessageOversightPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <Oversight />
      </LearnGate>
    </section>
  );
}
