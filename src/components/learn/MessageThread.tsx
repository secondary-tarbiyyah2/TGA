"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { MessageTriagePanel } from "@/components/learn/messages/MessageTriagePanel";
import { notifyMessage } from "@/lib/learn/push";
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, ATTACH_MAX_FILES, type InboxRow, dayKey, dayLabel, fileSize, timeOf } from "@/components/learn/messages/messagesShared";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  flagged: boolean;
  edited_at: string | null;
  recalled_at: string | null;
  reply_to_id: string | null;
};
type Attachment = { id: string; message_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number };
type Receipt = { message_id: string; audience: number; reader_id: string | null; reader_name: string; read_at: string | null };

/** Mirrors the 15-minute rule enforced by guard_message_edit() (0036). */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * One open conversation: messages with the sender named in groups, replies
 * quoted, files (staff send them, everyone in the conversation opens them),
 * receipts (one tick sent, two grey delivered, two green read; in a group,
 * "Seen by 3 of 5" opens who and when), and edit or delete your own message
 * within 15 minutes. Moderation model: sends immediately (0013), keyword
 * flags only change who else (the safeguarding lead) can see a message.
 * New messages arrive by polling (the portal does not use Supabase realtime).
 */
export function MessageThread({
  thread,
  me,
  isStaff,
  onSent,
  onRead,
  aiTriage = false,
  onTriaged,
  focusMessageId,
  starters,
  emptyTitle,
}: {
  thread: InboxRow;
  me: string;
  isStaff: boolean;
  onSent?: () => void;
  onRead?: () => void;
  /** Staff viewing a parent's thread: show the AI helper above the reply box. */
  aiTriage?: boolean;
  onTriaged?: () => void;
  /** Scroll to and highlight this message (from search). */
  focusMessageId?: string | null;
  /** A new conversation: ready-made first lines that fill the reply box (never sent by themselves). */
  starters?: string[];
  /** A new conversation: the heading of its empty state. */
  emptyTitle?: string;
}) {
  const supabase = getSupabaseClient();
  const threadId = thread.thread_id;
  const isGroup = thread.kind === "group";
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, Attachment[]>>({});
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsOn, setReceiptsOn] = useState(false);
  const [delivered, setDelivered] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(focusMessageId || null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const markedRef = useRef<string>("");
  const firstLoad = useRef(true);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("message_thread_messages")
      .select("id, sender_id, body, created_at, flagged, edited_at, recalled_at, reply_to_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    const list = (data as Message[]) || [];
    setMessages(list);

    if (isGroup) {
      const { data: sn } = await supabase.rpc("thread_sender_names", { p_thread_id: threadId });
      setNames(Object.fromEntries(((sn as { user_id: string; full_name: string }[] | null) || []).map((r) => [r.user_id, r.full_name])));
    }

    const { data: at } = await supabase.from("message_attachments").select("id, message_id, storage_path, file_name, mime_type, size_bytes").eq("thread_id", threadId);
    const byMsg: Record<string, Attachment[]> = {};
    for (const a of (at as Attachment[] | null) || []) (byMsg[a.message_id] ||= []).push(a);
    setFiles(byMsg);

    // Mark incoming messages read when the thread is visible and something new arrived.
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      const newest = list.filter((m) => m.sender_id !== me && !m.recalled_at).map((m) => m.created_at).sort().pop() || "";
      if (newest && newest > markedRef.current) {
        markedRef.current = newest;
        const { error } = await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
        if (error) markedRef.current = "";
        else onRead?.();
      }
    }

    if (list.some((m) => m.sender_id === me)) {
      const { data: rc, error } = await supabase.rpc("message_receipts", { p_thread_id: threadId });
      const rows = (rc as Receipt[] | null) || [];
      setReceiptsOn(!error && rows.length > 0);
      setReceipts(rows);
      const { data: dl } = await supabase.rpc("thread_delivery", { p_thread_id: threadId });
      setDelivered(Object.fromEntries(((dl as { user_id: string; delivered_at: string }[] | null) || []).map((r) => [r.user_id, r.delivered_at])));
    }
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
    const id = window.setInterval(() => load(), 8000);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, threadId]);

  // Keep the newest message in view (or the searched-for one on first load).
  // Follows new messages only while you are at the bottom, so reading further up is never interrupted.
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages) return;
    if (firstLoad.current && focusMessageId) {
      el.querySelector<HTMLElement>(`[data-msg="${focusMessageId}"]`)?.scrollIntoView({ block: "center" });
      stickRef.current = false;
      const t = window.setTimeout(() => setFlash(null), 2500);
      firstLoad.current = false;
      return () => window.clearTimeout(t);
    }
    firstLoad.current = false;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, files, receipts, focusMessageId]);

  const byId = useMemo(() => new Map((messages || []).map((m) => [m.id, m])), [messages]);
  const receiptBy = useMemo(() => {
    const out: Record<string, { audience: number; readers: { id: string; name: string; at: string }[] }> = {};
    for (const r of receipts) {
      const e = (out[r.message_id] ||= { audience: r.audience, readers: [] });
      if (r.reader_id && r.read_at) e.readers.push({ id: r.reader_id, name: r.reader_name, at: r.read_at });
    }
    return out;
  }, [receipts]);

  const nameOf = (uid: string) => (uid === me ? "You" : names[uid] || (isGroup ? "Member" : thread.title));
  const deliveredCount = (m: Message) => Object.values(delivered).filter((d) => d >= m.created_at).length;

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    setActionError(null);
    const next = [...pending];
    for (const f of Array.from(list)) {
      if (f.size > ATTACH_MAX_BYTES) {
        setActionError(`${f.name} is larger than 10 MB.`);
        continue;
      }
      if (next.length >= ATTACH_MAX_FILES) {
        setActionError(`Up to ${ATTACH_MAX_FILES} files a message.`);
        break;
      }
      next.push(f);
    }
    setPending(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    if (!supabase || busy) return;
    const text = body.trim() || (pending.length ? `Shared ${pending.length === 1 ? "a file" : `${pending.length} files`}` : "");
    if (!text) return;
    setBusy(true);
    setActionError(null);
    try {
      const { data, error } = await supabase
        .from("message_thread_messages")
        .insert({ thread_id: threadId, sender_id: me, body: text, ...(replyTo ? { reply_to_id: replyTo.id } : {}) })
        .select("id")
        .single();
      if (error || !data) {
        setActionError("Couldn't send that message. Please try again.");
        return;
      }
      const id = (data as { id: string }).id;
      let failed = 0;
      for (const f of pending) {
        const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
        const path = `${threadId}/${me}/${crypto.randomUUID()}-${safe}`;
        const up = await supabase.storage.from("message-attachments").upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (up.error) {
          failed++;
          continue;
        }
        const { error: rowErr } = await supabase
          .from("message_attachments")
          .insert({ message_id: id, thread_id: threadId, uploader_id: me, storage_path: path, file_name: f.name.slice(0, 200), mime_type: f.type || "application/octet-stream", size_bytes: f.size });
        if (rowErr) failed++;
      }
      if (failed) setActionError(`The message was sent, but ${failed === 1 ? "one file" : `${failed} files`} could not be attached (documents and pictures up to 10 MB).`);
      void notifyMessage(id);
      setBody("");
      setPending([]);
      setReplyTo(null);
      stickRef.current = true;
      await load();
      onSent?.();
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (a: Attachment) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("message-attachments").createSignedUrl(a.storage_path, 300);
    if (error || !data?.signedUrl) {
      setActionError("Couldn't open that file. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const withinWindow = (m: Message) => now - new Date(m.created_at).getTime() <= EDIT_WINDOW_MS;

  const saveEdit = async (m: Message) => {
    const next = editBody.trim();
    if (!supabase || !next) return;
    if (next === m.body) return setEditId(null);
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.from("message_thread_messages").update({ body: next }).eq("id", m.id);
    setBusy(false);
    if (error) return setActionError("Couldn't save that edit. Messages can only be changed within 15 minutes of sending.");
    setEditId(null);
    await load();
  };

  const remove = async (m: Message) => {
    if (!supabase) return;
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.from("message_thread_messages").update({ recalled_at: new Date().toISOString() }).eq("id", m.id);
    setBusy(false);
    if (error) return setActionError("Couldn't delete that message. Messages can only be deleted within 15 minutes of sending.");
    setConfirmDeleteId(null);
    await load();
    onSent?.();
  };

  const startReply = (m: Message) => {
    setReplyTo(m);
    setMenuId(null);
    boxRef.current?.focus();
  };

  const latestIncomingId = aiTriage && messages ? [...messages].reverse().find((m) => m.sender_id !== me && !m.recalled_at)?.id || null : null;
  const canPost = thread.can_post;
  const audienceNote = isGroup && thread.my_role !== "staff" ? (canPost ? "Your reply goes to the staff in this group only." : "Only staff write in this group. New messages appear here.") : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3 sm:px-4" aria-live="polite" aria-relevant="additions">
        {messages === null ? (
          <Loading label="Loading messages" bare />
        ) : messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col justify-center py-8 text-center">
            <p className="t-section">{emptyTitle || "A new conversation"}</p>
            <p className="mt-1 text-sm text-ink-500">{canPost ? (starters?.length ? "Start with one of these and change it as you like, or write your own below. Nothing is sent until you press Send." : "Write the first message in the box below.") : "No messages yet."}</p>
            {canPost && starters && starters.length > 0 && (
              <ul className="mt-4 space-y-2 text-left">
                {starters.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => {
                        setBody(t);
                        boxRef.current?.focus();
                      }}
                      className="w-full rounded-[10px] border border-gold-light bg-[var(--portal-surface)] px-3 py-2.5 text-sm text-ink-700 transition-colors hover:border-forest-500 hover:bg-[var(--portal-hover)]"
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === me;
            const deleted = m.recalled_at !== null;
            const prev = messages[i - 1];
            const showDay = i === 0 || dayKey(prev.created_at) !== dayKey(m.created_at);
            const showName = isGroup && !mine && (showDay || prev.sender_id !== m.sender_id);
            const canChange = mine && !deleted && withinWindow(m);
            const quoted = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
            const rc = receiptBy[m.id];
            const readers = rc?.readers || [];
            const dCount = deliveredCount(m);
            const allRead = rc && readers.length >= rc.audience;
            const tickState = !receiptsOn || !rc ? "sent" : allRead ? "read" : dCount > 0 || readers.length > 0 ? "delivered" : "sent";
            const atts = files[m.id] || [];
            return (
              <div key={m.id} data-msg={m.id}>
                {showDay && <p className="t-eyebrow my-3 text-center">{dayLabel(m.created_at)}</p>}
                <div className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                  {deleted ? (
                    <div className={`max-w-[85%] rounded-[10px] border border-dashed border-gold-light px-3 py-2 text-sm italic text-ink-500 sm:max-w-[70%]`}>
                      Message deleted
                      <span className="ml-2 text-[11px] not-italic">{timeOf(m.created_at)}</span>
                    </div>
                  ) : (
                    <>
                      {mine && (
                        <MsgActions m={m} canReply={canPost} canChange={canChange} open={menuId === m.id} onToggle={() => setMenuId(menuId === m.id ? null : m.id)} onReply={() => startReply(m)} onEdit={() => { setMenuId(null); setEditId(m.id); setEditBody(m.body); }} onDelete={() => { setMenuId(null); setConfirmDeleteId(m.id); }} />
                      )}
                      <div
                        className={`relative max-w-[85%] rounded-[10px] px-3 py-2 text-sm sm:max-w-[70%] ${mine ? "bg-forest-700 text-white" : "border border-gold-light bg-[var(--portal-surface)] text-ink"} ${flash === m.id ? "ring-2 ring-amber-400" : ""}`}
                      >
                        {showName && <p className="mb-0.5 text-xs font-semibold text-forest-700">{nameOf(m.sender_id)}</p>}
                        {quoted && (
                          <button
                            type="button"
                            onClick={() => scrollRef.current?.querySelector<HTMLElement>(`[data-msg="${quoted.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                            className={`mb-1.5 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs ${mine ? "border-white/60 bg-white/10 text-white/85" : "border-forest-500 bg-[var(--portal-sunken)] text-ink-700"}`}
                          >
                            <span className="block font-semibold">{nameOf(quoted.sender_id)}</span>
                            <span className="line-clamp-2">{quoted.recalled_at ? "Message deleted" : quoted.body}</span>
                          </button>
                        )}
                        {editId === m.id ? (
                          <div className="space-y-2">
                            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} maxLength={4000} aria-label="Edit message" className="block w-full rounded-md border border-gold-light bg-white px-2 py-1 text-sm text-ink" />
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditId(null)} className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
                                Cancel
                              </button>
                              <button type="button" disabled={busy || !editBody.trim()} onClick={() => saveEdit(m)} className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-forest-900 disabled:opacity-50">
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        )}
                        {atts.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {atts.map((a) => (
                              <li key={a.id}>
                                <button type="button" onClick={() => openFile(a)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${mine ? "bg-white/10 hover:bg-white/20" : "bg-[var(--portal-sunken)] hover:bg-[var(--portal-hover)]"}`}>
                                  <Icon name={a.mime_type.startsWith("image/") ? "image" : "file"} size="sm" />
                                  <span className="min-w-0 flex-1 truncate font-medium">{a.file_name}</span>
                                  <span className="shrink-0 opacity-80">{fileSize(a.size_bytes)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-white/75" : "text-ink-500"}`}>
                          {timeOf(m.created_at)}
                          {m.edited_at && " · edited"}
                          {mine && receiptsOn && rc && (
                            isGroup ? (
                              <button type="button" onClick={() => setSeenId(seenId === m.id ? null : m.id)} aria-expanded={seenId === m.id} className="ml-1 inline-flex items-center gap-0.5 rounded px-1 underline-offset-2 hover:underline">
                                <Ticks state={tickState} />
                                Seen by {readers.length} of {rc.audience}
                              </button>
                            ) : (
                              <span className="ml-0.5 inline-flex" title={tickState === "read" ? `Read ${readers[0] ? timeOf(readers[0].at) : ""}` : tickState === "delivered" ? "Delivered" : "Sent"} aria-label={tickState === "read" ? "Read" : tickState === "delivered" ? "Delivered" : "Sent"}>
                                <Ticks state={tickState} />
                              </span>
                            )
                          )}
                        </p>
                        {seenId === m.id && rc && (
                          <div className="mt-2 rounded-md bg-white p-2 text-xs text-ink">
                            <p className="font-semibold">Seen by</p>
                            {readers.length === 0 ? <p className="text-ink-500">Nobody yet.</p> : (
                              <ul className="mt-1 space-y-0.5">
                                {readers.map((r) => (
                                  <li key={r.id} className="flex justify-between gap-3"><span>{r.name}</span><span className="text-ink-500">{new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-1.5 text-ink-500">Delivered to {Math.max(dCount, readers.length)} of {rc.audience}. People who turned read receipts off are not listed.</p>
                          </div>
                        )}
                        {confirmDeleteId === m.id && (
                          <div className="mt-2 rounded-md bg-white p-2 text-xs text-ink">
                            <p>Delete this message for everyone? They will see &ldquo;Message deleted&rdquo;. The school keeps a record for safeguarding.</p>
                            <div className="mt-2 flex justify-end gap-2">
                              <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md border border-gold-light px-3 py-1 hover:bg-cream">
                                Keep
                              </button>
                              <button type="button" disabled={busy} onClick={() => remove(m)} className="rounded-md bg-red-700 px-3 py-1 font-semibold text-white disabled:opacity-50">
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {!mine && canPost && (
                        <button type="button" onClick={() => startReply(m)} aria-label={`Reply to ${nameOf(m.sender_id)}`} className="rounded-md p-1.5 text-ink-500 opacity-100 hover:bg-[var(--portal-hover)] hover:text-ink sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">
                          <Icon name="reply" size="sm" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {actionError && (
        <p role="alert" className="px-4 pb-1 text-xs font-medium text-red-700">
          {actionError}
        </p>
      )}
      {aiTriage && canPost && <MessageTriagePanel threadId={threadId} latestIncomingId={latestIncomingId} onUseDraft={setBody} onTriaged={onTriaged} />}
      {canPost ? (
        <div className="border-t border-gold-light p-2 sm:p-3">
          {audienceNote && <p className="mb-1.5 px-1 text-xs text-ink-500">{audienceNote}</p>}
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-forest-500 bg-[var(--portal-sunken)] px-2 py-1.5 text-xs">
              <Icon name="reply" size="sm" className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">Replying to {nameOf(replyTo.sender_id)}</span>
                <span className="block truncate text-ink-500">{replyTo.body}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded p-0.5 text-ink-500 hover:text-ink">
                <Icon name="x" size="sm" />
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {pending.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold-light bg-white py-1 pl-2.5 pr-1 text-xs">
                  <Icon name="paperclip" size="sm" className="h-4 w-4 text-ink-500" />
                  <span className="max-w-[12rem] truncate">{f.name}</span>
                  <span className="text-ink-500">{fileSize(f.size)}</span>
                  <button type="button" onClick={() => setPending(pending.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="rounded-full p-0.5 text-ink-500 hover:bg-cream hover:text-ink">
                    <Icon name="x" size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            {isStaff && (
              <>
                <input ref={fileRef} type="file" multiple accept={ATTACH_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pickFiles(e.target.files)} />
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach files (documents and pictures, up to 10 MB each)" title="Attach files" className={ui.btnIcon}>
                  <Icon name="paperclip" />
                </button>
              </>
            )}
            <textarea
              ref={boxRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape" && replyTo) setReplyTo(null);
              }}
              rows={body.includes("\n") || body.length > 90 ? 4 : 2}
              maxLength={4000}
              aria-label="Type a message"
              placeholder={isGroup ? `Message ${thread.title}` : "Type a message"}
              className={`${ui.input} flex-1 resize-none`}
            />
            <button type="button" disabled={(!body.trim() && pending.length === 0) || busy} onClick={send} className={ui.btnPrimary} aria-label="Send">
              <Icon name="send" size="sm" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="mt-1 hidden px-1 text-[11px] text-ink-500 sm:block">Enter sends. Shift and Enter starts a new line.</p>
        </div>
      ) : (
        <p className="border-t border-gold-light px-4 py-3 text-sm text-ink-500">{audienceNote || "You can read this conversation but not write in it."}</p>
      )}
    </div>
  );
}

function Ticks({ state }: { state: "sent" | "delivered" | "read" }) {
  if (state === "sent") return <Icon name="check" size="sm" strokeWidth={2.25} />;
  return <span className={state === "read" ? "text-green-300" : ""}><Icon name="checkCheck" size="sm" strokeWidth={2.25} /></span>;
}

/** Reply / edit / delete for your own message, beside the bubble. */
function MsgActions({ m, canReply, canChange, open, onToggle, onReply, onEdit, onDelete }: { m: Message; canReply: boolean; canChange: boolean; open: boolean; onToggle: () => void; onReply: () => void; onEdit: () => void; onDelete: () => void }) {
  if (!canReply && !canChange) return null;
  return (
    <div className="relative shrink-0 self-center">
      <button type="button" aria-label="Message options" aria-expanded={open} onClick={onToggle} className="rounded-md p-1.5 text-ink-500 opacity-100 hover:bg-[var(--portal-hover)] hover:text-ink sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100">
        <Icon name="ellipsis" size="sm" />
      </button>
      {open && (
        <div role="menu" className="portal-menu absolute right-0 top-8 z-20 w-36 rounded-lg border border-gold-light bg-white py-1 text-sm text-ink shadow-[var(--portal-shadow-pop)]" data-msg-menu={m.id}>
          {canReply && (
            <button type="button" role="menuitem" onClick={onReply} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream">
              <Icon name="reply" size="sm" /> Reply
            </button>
          )}
          {canChange && (
            <>
              <button type="button" role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream">
                <Icon name="pencil" size="sm" /> Edit
              </button>
              <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-cream">
                <Icon name="trash" size="sm" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
