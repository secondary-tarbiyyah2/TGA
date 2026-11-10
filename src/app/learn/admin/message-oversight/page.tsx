"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { Button, EmptyState, Notice } from "@/components/learn/ui";
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
      // Most recent conversation first.
      else setThreads(((data as OversightThread[]) || []).slice().sort((a, b) => (b.last_at || b.created_at).localeCompare(a.last_at || a.created_at)));
    });
  }, []);

  const active = threads?.find((t) => t.thread_id === activeId) || null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Message oversight" }]}
        title="Message oversight"
        subtitle="A safeguarding view of conversations between staff and families."
      />
      <div className="mb-4">
        <Notice tone="warn">Read only. Opening a conversation is recorded in the audit log.</Notice>
      </div>
      {error && <Notice tone="bad">Could not load conversations. Please refresh the page and try again.</Notice>}
      {!error && threads === null && <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" />}
      {threads && threads.length === 0 && <EmptyState title="No conversations yet" icon="messageSquare">Conversations between staff and families will appear here.</EmptyState>}
      {threads && threads.length > 0 && (
        // On phones the list and the open conversation take turns (with a
        // Back button) instead of the conversation opening far below the list.
        <div className="grid gap-4 md:h-[70vh] md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className={`min-h-0 max-h-[70vh] md:block md:max-h-none ${active ? "hidden" : ""}`}>
            <ThreadList threads={threads} activeId={activeId} onSelect={setActiveId} />
          </div>
          <div className={`min-h-[24rem] md:block md:min-h-0 ${active ? "" : "hidden"}`}>
            {active ? (
              <div className="flex h-full min-h-[24rem] flex-col gap-2 md:min-h-0">
                <Button icon="chevronLeft" size="sm" onClick={() => setActiveId(null)} className="self-start md:hidden">
                  All conversations
                </Button>
                <div className="min-h-0 flex-1">
                  <ThreadViewer key={active.thread_id} thread={active} />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gold-light p-6 text-sm text-ink/65">
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
