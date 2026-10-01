"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { threadTitle, type OversightMessage, type OversightThread } from "./types";

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Read-only conversation. Opening it calls oversight_open_thread(), which
 * writes the audit-log row server-side. There is no compose box. */
export function ThreadViewer({ thread }: { thread: OversightThread }) {
  const [messages, setMessages] = useState<OversightMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the newly selected thread loads
    setMessages(null);
    setError(null);
    supabase.rpc("oversight_open_thread", { p_thread_id: thread.thread_id }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError(err.message);
      else setMessages((data as OversightMessage[]) || []);
    });
    return () => {
      cancelled = true;
    };
  }, [thread.thread_id]);

  let lastDay = "";
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{threadTitle(thread)}</p>
          <p className="truncate text-xs text-ink/55">
            {thread.role_a} ↔ {thread.role_b}
            {thread.child_name ? ` · about ${thread.child_name}` : ""}
          </p>
        </div>
        <Link
          href="/report-concern"
          className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Raise concern
        </Link>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-700">Could not open this conversation: {error}</p>}
        {!error && messages === null && <p className="text-sm text-ink/55">Opening…</p>}
        {messages?.length === 0 && <p className="text-sm text-ink/55">No messages in this conversation.</p>}
        {messages?.map((m) => {
          const day = new Date(m.created_at).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const isA = m.sender_name !== null && m.sender_name === thread.name_a;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center text-xs font-medium text-ink/50">{dayLabel(m.created_at)}</p>
              )}
              <div className={`flex ${isA ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.flagged ? "border border-red-300 bg-red-50" : isA ? "bg-ink/5" : "bg-teal-50"
                  }`}
                >
                  <p className="mb-0.5 text-xs font-semibold text-ink/70">
                    {m.sender_name || "Unknown"} · {time(m.created_at)}
                  </p>
                  {m.recalled_at ? (
                    <>
                      <p className="italic text-ink/50">Recalled by sender</p>
                      <p className="mt-1 whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-ink">
                        <span className="block text-[11px] font-semibold uppercase text-amber-800">Original text</span>
                        {m.original_body}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-ink">{m.body}</p>
                      {m.edited_at && m.original_body && (
                        <p className="mt-1 whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-ink/80">
                          <span className="block text-[11px] font-semibold uppercase text-amber-800">
                            Edited · original text
                          </span>
                          {m.original_body}
                        </p>
                      )}
                    </>
                  )}
                  {m.flagged && (
                    <p className="mt-1 text-[11px] font-medium text-red-700">
                      Flagged{m.flagged_keywords?.length ? `: ${m.flagged_keywords.join(", ")}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
