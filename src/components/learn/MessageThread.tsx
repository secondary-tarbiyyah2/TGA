"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ReadTicks } from "@/components/learn/messages/ReadTicks";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  flagged: boolean;
  edited_at: string | null;
  recalled_at: string | null;
};

/** Mirrors the 15-minute rule enforced by guard_message_edit() (0036). */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** A single open thread's messages + compose box. Moderation model: sends
 * immediately (see 0013_messaging.sql's header for why), keyword-flagged
 * messages are just shown as normal to the two participants — flagging
 * only changes who ELSE (the Safeguarding Lead) can see it, never blocks
 * sending. */
export function MessageThread({ threadId, onSent, onRead }: { threadId: string; onSent?: () => void; onRead?: () => void }) {
  const supabase = getSupabaseClient();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmRecallId, setConfirmRecallId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // message_id -> read_at (null = sent, not read). Empty when the viewer has receipts off.
  const [receipts, setReceipts] = useState<Record<string, string | null>>({});
  const [receiptsOn, setReceiptsOn] = useState(false);
  const markedRef = useRef<string>("");
  const meRef = useRef<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("message_thread_messages")
      .select("id, sender_id, body, created_at, flagged, edited_at, recalled_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    const list = (data as Message[]) || [];
    setMessages(list);

    // Mark incoming messages read when the thread is visible and something new arrived.
    const me = meRef.current || (await supabase.auth.getUser()).data.user?.id || null;
    meRef.current = me;
    if (me && typeof document !== "undefined" && document.visibilityState === "visible") {
      const newest = list.filter((m) => m.sender_id !== me && !m.recalled_at).map((m) => m.created_at).sort().pop() || "";
      if (newest && newest > markedRef.current) {
        markedRef.current = newest;
        const { error } = await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
        if (error) markedRef.current = "";
        else onRead?.();
      }
    }

    if (me && list.some((m) => m.sender_id === me)) {
      const { data: rc } = await supabase.rpc("thread_receipts", { p_thread_id: threadId });
      const rows = (rc as { message_id: string; read_at: string | null }[] | null) || [];
      setReceiptsOn(rows.length > 0);
      setReceipts(Object.fromEntries(rows.map((r) => [r.message_id, r.read_at])));
    }
  };

  // Tab becomes visible again: catch up on reads.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, threadId]);

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

  // Tick so the edit/recall menu disappears when the 15-minute window closes.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

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

  const withinWindow = (m: Message) => now - new Date(m.created_at).getTime() <= EDIT_WINDOW_MS;

  const startEdit = (m: Message) => {
    setMenuId(null);
    setActionError(null);
    setEditId(m.id);
    setEditBody(m.body);
  };

  const saveEdit = async (m: Message) => {
    const next = editBody.trim();
    if (!supabase || !next) return;
    if (next === m.body) {
      setEditId(null);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase.from("message_thread_messages").update({ body: next }).eq("id", m.id);
      if (error) {
        setActionError("Couldn't save that edit. Messages can only be changed within 15 minutes of sending.");
        return;
      }
      setEditId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const recall = async (m: Message) => {
    if (!supabase) return;
    setBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase.from("message_thread_messages").update({ recalled_at: new Date().toISOString() }).eq("id", m.id);
      if (error) {
        setActionError("Couldn't recall that message. Messages can only be recalled within 15 minutes of sending.");
        return;
      }
      setConfirmRecallId(null);
      await load();
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
          messages.map((m, i) => {
            const mine = m.sender_id === userId;
            const recalled = m.recalled_at !== null;
            const showDay = i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at);
            const canChange = mine && !recalled && withinWindow(m);
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="my-2 text-center text-[10px] font-medium uppercase tracking-wide text-ink/40">{dayLabel(m.created_at)}</p>
                )}
                {recalled ? (
                  <div className={`max-w-[80%] rounded-lg border border-dashed border-ink/20 px-3 py-2 text-sm italic text-ink/50 ${mine ? "ml-auto" : ""}`}>
                    Message recalled
                    <p className="mt-1 text-[10px] not-italic text-ink/40">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ) : (
                  <div className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "ml-auto bg-gold-700 text-white" : "bg-cream text-ink"}`}>
                    {editId === m.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={3}
                          maxLength={4000}
                          aria-label="Edit message"
                          className="block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1 text-sm text-ink"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditId(null)} className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
                            Cancel
                          </button>
                          <button type="button" disabled={busy || !editBody.trim()} onClick={() => saveEdit(m)} className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-gold-900 disabled:opacity-50">
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-ink/50"}`}>
                          {new Date(m.created_at).toLocaleString("en-GB")}
                          {m.edited_at && " (edited)"}
                          {mine && receiptsOn && m.id in receipts && <ReadTicks readAt={receipts[m.id]} />}
                        </p>
                      </>
                    )}
                    {canChange && editId !== m.id && (
                      <div className="absolute -left-7 top-1">
                        <button
                          type="button"
                          aria-label="Message options"
                          aria-expanded={menuId === m.id}
                          onClick={() => {
                            setConfirmRecallId(null);
                            setMenuId(menuId === m.id ? null : m.id);
                          }}
                          className="rounded px-1.5 text-base leading-none text-ink/50 hover:bg-cream"
                        >
                          ⋯
                        </button>
                        {menuId === m.id && (
                          <div className="absolute left-0 top-6 z-10 w-28 rounded-md border border-gold-light/60 bg-white py-1 text-xs text-ink shadow">
                            <button type="button" onClick={() => startEdit(m)} className="block w-full px-3 py-1.5 text-left hover:bg-cream">
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuId(null);
                                setConfirmRecallId(m.id);
                              }}
                              className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-cream"
                            >
                              Recall
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {confirmRecallId === m.id && (
                      <div className="mt-2 rounded-md bg-white p-2 text-xs text-ink">
                        <p>Recall this message? The other person will see &ldquo;Message recalled&rdquo;. This can&apos;t be undone.</p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" onClick={() => setConfirmRecallId(null)} className="rounded-md border border-gold-light/60 px-3 py-1 hover:bg-cream">
                            Keep
                          </button>
                          <button type="button" disabled={busy} onClick={() => recall(m)} className="rounded-md bg-red-700 px-3 py-1 font-semibold text-white disabled:opacity-50">
                            Recall
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {actionError && <p role="alert" className="px-3 pb-1 text-xs text-red-700">{actionError}</p>}
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
