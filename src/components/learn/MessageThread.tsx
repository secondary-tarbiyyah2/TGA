"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Message = { id: string; sender_id: string; body: string; created_at: string; flagged: boolean };

/** A single open thread's messages + compose box. Moderation model: sends
 * immediately (see 0013_messaging.sql's header for why), keyword-flagged
 * messages are just shown as normal to the two participants — flagging
 * only changes who ELSE (the Safeguarding Lead) can see it, never blocks
 * sending. */
export function MessageThread({ threadId, onSent }: { threadId: string; onSent?: () => void }) {
  const supabase = getSupabaseClient();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("message_thread_messages")
      .select("id, sender_id, body, created_at, flagged")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, threadId]);

  // Pick up replies without a refresh.
  useEffect(() => {
    if (!supabase) return;
    const id = window.setInterval(() => load(), 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = async () => {
    if (!supabase || !body.trim() || !userId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("message_thread_messages").insert({ thread_id: threadId, sender_id: userId, body: body.trim() });
      if (!error) {
        setBody("");
        await load();
        onSent?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[58vh] min-h-[340px] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-ink/60">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.sender_id === userId ? "ml-auto bg-gold-700 text-white" : "bg-cream text-ink"}`}>
              <p>{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.sender_id === userId ? "text-white/70" : "text-ink/50"}`}>{new Date(m.created_at).toLocaleString("en-GB")}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-gold-light/30 p-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm"
        />
        <button type="button" disabled={!body.trim() || busy} onClick={send} className="rounded-lg bg-gold-700 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-gold-900 font-medium transition-colors">
          Send
        </button>
      </div>
    </div>
  );
}
