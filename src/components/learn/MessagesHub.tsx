"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageThread } from "@/components/learn/MessageThread";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { AiSpark } from "@/components/learn/AiBits";
import { TRIAGE_CATEGORY_LABEL, aiAssist, aiErrorMessage, useAiStatus } from "@/lib/learn/aiAssist";
import { Icon } from "@/components/learn/Icon";
import { ActionsMenu, type MenuAction } from "@/components/learn/kit";
import { EmptyState, LoadingState, Notice, ui } from "@/components/learn/ui";
import { FamilyContextStrip, familyOpeners, useFamilyContext } from "@/components/learn/messages/FamilyContext";
import { NewConversation } from "@/components/learn/messages/NewConversation";
import { GroupInfo } from "@/components/learn/messages/GroupInfo";
import { STAFF_ROLE_IDS, ago, initials, type InboxRow, type Person } from "@/components/learn/messages/messagesShared";

type TriageRow = { thread_id: string; message_id: string; category: string; urgency: string };
type Hit = { message_id: string; thread_id: string; sender_id: string; sender_name: string; body: string; created_at: string };
type Filter = "all" | "unread" | "groups" | "urgent";

/**
 * Messages: every conversation you are in (people and groups) on the left,
 * the open one on the right (one column on phones). Search finds people,
 * groups and words in messages. New message opens one dialog for a person or,
 * for staff, a group. Unread counts, mute, group details, read receipts,
 * replies and files live in the conversation itself. Pupils see the groups
 * staff put them in (0204); they never have 1:1 conversations.
 * Updates by polling every 30 seconds (and every 8 in an open conversation).
 */
export function MessagesHub({ canAddPeople = false, subtitle, readOnly = false }: { canAddPeople?: boolean; /** Overrides the staff-worded subtitle (e.g. for parents). */ subtitle?: string; /** Pupils: no New message. */ readOnly?: boolean }) {
  const { roles } = useLearnSession();
  const isStaff = roles.some((r) => STAFF_ROLE_IDS.includes(r.role));
  const [me, setMe] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[] | null>(readOnly ? [] : null);
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [focusMsg, setFocusMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ai = useAiStatus();
  const aiOn = !readOnly && !!ai?.configured && ai.can.message_triage;
  const [triageBy, setTriageBy] = useState<Record<string, TriageRow>>({});
  const [sorting, setSorting] = useState(false);
  const [sortNote, setSortNote] = useState<string | null>(null);
  // "Message family" (pupil record, pupils list, class insights, absences): ?family=<pupil id>
  // opens the conversation with that pupil's parent, starting one if there isn't one yet.
  const [familyFor, setFamilyFor] = useState<string | null>(null);
  const [aboutChild, setAboutChild] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ?compose=1 (Today's "Send a message") opens New message; ?thread= (emails and phone notifications) opens a conversation.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address once after hydration
    if (sp.get("compose") === "1" && !readOnly) setPicking(true);
    const t = sp.get("thread");
    if (t) setActive(t);
    const fam = sp.get("family");
    if (fam && !readOnly) setFamilyFor(fam);
  }, [readOnly]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMe(user.id);

    // Tell senders their messages have reached this portal ("delivered", 0205).
    void supabase.rpc("mark_messages_delivered");

    const { data, error: err } = await supabase.rpc("my_message_threads");
    if (err) {
      setError("Couldn't load your conversations. Please try again in a moment.");
      setRows((r) => r || []);
    } else {
      setError(null);
      setRows((data as InboxRow[]) || []);
    }
    const { data: mu } = await supabase.from("message_thread_mutes").select("thread_id");
    setMuted(new Set(((mu as { thread_id: string }[] | null) || []).map((m) => m.thread_id)));

    if (!readOnly) {
      // The directory applies the safeguarding rules server-side (0085).
      const dir = await supabase.rpc("message_directory");
      setPeople(dir.error ? [] : (dir.data as Person[]) || []);
    }

    const ids = ((data as InboxRow[]) || []).map((r) => r.thread_id);
    if (aiOn && ids.length) {
      const { data: tri } = await supabase.from("ai_message_triage").select("thread_id, message_id, category, urgency, created_at").in("thread_id", ids).order("created_at", { ascending: false }).limit(400);
      const tmap: Record<string, TriageRow> = {};
      for (const r of (tri as TriageRow[] | null) || []) if (!tmap[r.thread_id]) tmap[r.thread_id] = r;
      setTriageBy(tmap);
    }
  }, [readOnly, aiOn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  // Search words in messages (0204 search_messages), after a short pause.
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the search is cleared
      setHits(null);
      return;
    }
    const t = window.setTimeout(async () => {
      const supabase = getSupabaseClient();
      const { data } = (await supabase?.rpc("search_messages", { p_query: q })) || { data: [] };
      setHits((data as Hit[] | null) || []);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const byPerson = useMemo(() => new Map((people || []).map((p) => [p.user_id, p])), [people]);
  const isParentId = (uid: string | null | undefined) => {
    const p = uid ? byPerson.get(uid) : undefined;
    return !!p && p.roles.includes("parent") && !p.roles.some((r) => STAFF_ROLE_IDS.includes(r));
  };

  const all = rows || [];
  const unreadTotal = all.filter((r) => r.unread > 0 && r.thread_id !== active).length;
  const urgentCount = all.filter((r) => triageBy[r.thread_id]?.urgency === "urgent").length;
  const ql = q.toLowerCase();
  const listed = all.filter((r) => {
    if (filter === "unread" && !(r.unread > 0)) return false;
    if (filter === "groups" && r.kind !== "group") return false;
    if (filter === "urgent" && triageBy[r.thread_id]?.urgency !== "urgent") return false;
    if (ql && !(`${r.title} ${r.subtitle || ""}`.toLowerCase().includes(ql) || (byPerson.get(r.other_user_id || "")?.detail || "").toLowerCase().includes(ql))) return false;
    return true;
  });
  const titleOf = (tid: string) => all.find((r) => r.thread_id === tid)?.title || "Conversation";

  /** Conversations whose newest message is from a parent and hasn't been sorted yet. */
  const unsorted = all.filter((r) => !!r.last_sender_id && r.last_sender_id !== me && isParentId(r.last_sender_id) && !triageBy[r.thread_id]);
  const sortInbox = async () => {
    const ids = unsorted.slice(0, 10).map((t) => t.thread_id);
    if (!ids.length) return;
    setSorting(true);
    setSortNote(null);
    const r = await aiAssist("triage_batch", { thread_ids: ids });
    setSorting(false);
    if (!r.ok) return setSortNote(aiErrorMessage(r));
    await load();
    const left = unsorted.length - ids.length;
    setSortNote(r.stopped === "ai_daily_limit" ? "Stopped: the school's AI limit for today has been reached." : `Sorted ${ids.length} conversation${ids.length === 1 ? "" : "s"}.${left > 0 ? ` ${left} more to go.` : ""}`);
  };

  const startWith = async (other: Person) => {
    const supabase = getSupabaseClient();
    if (!supabase || !me) return;
    setError(null);
    const existing = all.find((t) => t.kind !== "group" && t.other_user_id === other.user_id && t.kind !== "parent_teacher");
    if (existing) {
      setActive(existing.thread_id);
      setPicking(false);
      return;
    }
    const { data, error: err } = await supabase.from("message_threads").insert({ kind: "direct", staff_a_id: me, staff_b_id: other.user_id }).select("id").single();
    if (err || !data) return setError("Couldn't start that conversation. Please try again in a moment.");
    await load();
    setActive((data as { id: string }).id);
    setPicking(false);
  };

  /** Open (or start) the 1:1 conversation with a pupil's parent. The directory (0085) and the insert policy decide who may message whom. */
  const openFamily = useCallback(
    async (childId: string) => {
      const supabase = getSupabaseClient();
      if (!supabase || !me || rows === null || people === null) return;
      setFamilyFor(null);
      // Leave the address tidy, so a refresh doesn't open it again.
      const url = new URL(window.location.href);
      url.searchParams.delete("family");
      window.history.replaceState(null, "", url.toString());
      const { data: child } = await supabase.from("children").select("id, name, parent_user_id").eq("id", childId).maybeSingle();
      const c = child as { id: string; name: string; parent_user_id: string | null } | null;
      if (!c) return setNotice("That pupil's family isn't one you can message from your account. Use New message to find who you can write to.");
      if (!c.parent_user_id) return setNotice(`${c.name}'s family doesn't have a portal account yet, so they can't be messaged here. Their contacts are on the pupil's record.`);
      const parent = people.find((p) => p.user_id === c.parent_user_id);
      if (!parent) return setNotice(`You can't message ${c.name}'s family from your account. The office can.`);
      setAboutChild(c.id);
      setNotice(null);
      const mine = rows.filter((t) => t.kind !== "group" && t.other_user_id === parent.user_id);
      const existing = mine.find((t) => t.kind === "direct") || mine.find((t) => t.kind === "parent_teacher");
      if (existing) {
        setActive(existing.thread_id);
        return;
      }
      const { data, error: err } = await supabase.from("message_threads").insert({ kind: "direct", staff_a_id: me, staff_b_id: parent.user_id }).select("id").single();
      if (err || !data) return setError("Couldn't start that conversation. Please try again in a moment.");
      await load();
      setActive((data as { id: string }).id);
    },
    [me, rows, people, load],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once the inbox and directory have loaded
    if (familyFor && me && rows !== null && people !== null) void openFamily(familyFor);
  }, [familyFor, me, rows, people, openFamily]);

  const toggleMute = async (tid: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !me) return;
    if (muted.has(tid)) await supabase.from("message_thread_mutes").delete().eq("thread_id", tid).eq("user_id", me);
    else await supabase.from("message_thread_mutes").insert({ thread_id: tid });
    await load();
  };

  const open = (tid: string, msg: string | null = null) => {
    setFocusMsg(msg);
    setActive(tid);
    setInfo(false);
  };

  const activeRow = all.find((r) => r.thread_id === active) || null;
  const activeOther = activeRow?.other_user_id ? byPerson.get(activeRow.other_user_id) : undefined;
  const otherIsParent = !!activeRow && activeRow.kind !== "group" && isParentId(activeRow.other_user_id);
  const familyKids = useFamilyContext(otherIsParent ? activeRow?.other_user_id : null, isStaff && otherIsParent);
  const loading = rows === null || people === null;
  const nobodyToMessage = !readOnly && people !== null && people.length === 0 && !isStaff;

  const headMenu: MenuAction[] = activeRow
    ? [
        ...(activeRow.kind === "group" ? [{ label: "Group details", icon: "users" as const, onSelect: () => setInfo(true) }] : []),
        { label: muted.has(activeRow.thread_id) ? "Unmute" : "Mute", icon: muted.has(activeRow.thread_id) ? ("bell" as const) : ("bellOff" as const), hint: muted.has(activeRow.thread_id) ? "Emails and phone notifications on again" : "No emails or phone notifications", onSelect: () => toggleMute(activeRow.thread_id) },
      ]
    : [];

  const filters: { key: Filter; label: string; n?: number }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", n: unreadTotal },
    ...(all.some((r) => r.kind === "group") ? [{ key: "groups" as Filter, label: "Groups" }] : []),
    ...(aiOn || urgentCount ? [{ key: "urgent" as Filter, label: "Urgent", n: urgentCount }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={subtitle ?? (readOnly ? "Messages from your teachers and the school. Staff review messages for safeguarding." : "One to one or in groups, with the families, teachers and office you work with. Staff review messages for safeguarding.")}
        action={
          readOnly ? undefined : (
            <button type="button" data-guide="messages-new" onClick={() => setPicking(true)} disabled={loading || nobodyToMessage} className={ui.btnPrimary}>
              <Icon name="messageSquarePlus" size="sm" />
              New message
            </button>
          )
        }
      />

      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      {notice && (
        <div className="mb-4">
          <Notice tone="warn">
            {notice}{" "}
            <button type="button" onClick={() => setNotice(null)} className={`${ui.btnLink} ml-1`}>
              Dismiss
            </button>
          </Notice>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading your conversations" />
      ) : all.length === 0 && nobodyToMessage ? (
        <EmptyState title="No one is set up yet" action={canAddPeople ? <Link href="/admin/people" className={ui.btnPrimary}>Add people</Link> : undefined}>
          As soon as teachers, the office or families have accounts, they appear here and you can message them.
        </EmptyState>
      ) : (
        <div className="@container min-w-0">
        {/* One fixed-height workspace: on a wide enough page the list and the open conversation sit side by side
            (sized by the space the page has, not the screen, so the menu being open never squeezes it into one
            column); the reply box is always at the foot of the conversation. */}
        <div className="grid h-[max(30rem,calc(100dvh_-_13rem))] min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-gold-light bg-[var(--portal-surface)] @2xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
          <div className={`flex min-h-0 min-w-0 flex-col border-gold-light @2xl:border-r ${active ? "hidden @2xl:flex" : ""}`}>
            <div className="space-y-2 border-b border-gold-light p-3">
              <label htmlFor="msg-search" className="sr-only">
                Search conversations and messages
              </label>
              <div className="relative">
                <Icon name="search" size="sm" className="h-4 w-4 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                <input id="msg-search" data-guide="messages-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, groups and messages" className={`${ui.input} pl-9`} />
              </div>
              <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
                {filters.map((f) => (
                  <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`${filter === f.key ? ui.chipOn : ui.chip} min-h-9 sm:min-h-7`}>
                    {f.label}
                    {f.n ? <span className="tabular-nums text-ink-500">{f.n}</span> : null}
                  </button>
                ))}
                {aiOn && (
                  <button type="button" disabled={sorting || unsorted.length === 0} onClick={sortInbox} title="Ask AI to sort the newest parent messages (up to 10 at a time)" className={`${ui.chip} min-h-9 sm:min-h-7`}>
                    <AiSpark className="h-3.5 w-3.5 text-teal-700" />
                    {sorting ? "Sorting" : unsorted.length ? `Sort (${Math.min(unsorted.length, 10)})` : "Sorted"}
                  </button>
                )}
              </div>
              {sortNote && <p className="text-xs text-ink-500">{sortNote}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul data-guide="messages-list" aria-label="Conversations" className="divide-y divide-gold-light">
                {listed.length === 0 && !(q && hits && hits.length) && (
                  <li className="px-5 py-10 text-center text-sm text-ink-500">
                    {all.length === 0 ? (readOnly ? "No messages yet. When a teacher writes to your class, it appears here." : "No conversations yet. Press New message to start one.") : q ? "No conversations match." : "Nothing here."}
                  </li>
                )}
                {listed.map((r) => {
                  const unread = active === r.thread_id ? 0 : r.unread;
                  const group = r.kind === "group";
                  const other = r.other_user_id ? byPerson.get(r.other_user_id) : undefined;
                  const context = group ? `${r.subtitle || "Group"} · ${r.member_count} members` : r.subtitle || (other ? [other.detail].filter(Boolean).join("") : "");
                  const preview = r.last_preview ? `${r.last_sender_id === me ? "You: " : group && r.last_sender_name ? `${r.last_sender_name.split(" ")[0]}: ` : ""}${r.last_preview}` : "No messages yet";
                  const tri = triageBy[r.thread_id];
                  return (
                    <li key={r.thread_id}>
                      <button
                        type="button"
                        onClick={() => open(r.thread_id)}
                        aria-current={active === r.thread_id ? "true" : undefined}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--portal-hover)] ${active === r.thread_id ? "bg-forest-50 shadow-[inset_3px_0_0_var(--color-forest-700)]" : ""}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${group ? "bg-[var(--portal-sunken)] text-ink-700" : "bg-forest-100 text-forest-900"}`}>
                          {group ? <Icon name="users" size="sm" /> : initials(r.title)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm text-ink ${unread ? "font-semibold" : "font-medium"}`}>{r.title}</span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                              {muted.has(r.thread_id) && <Icon name="bellOff" size="sm" className="h-3.5 w-3.5" />}
                              {ago(r.last_at || r.created_at)}
                            </span>
                          </span>
                          {context && <span className="block truncate text-xs text-ink-500">{context}</span>}
                          {tri && (
                            <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                              <span className={tri.category === "safeguarding concern" ? "font-medium text-red-800" : "text-forest-700"}>{TRIAGE_CATEGORY_LABEL[tri.category] || tri.category}</span>
                              {tri.urgency === "urgent" && <span className="font-semibold text-red-700">· Urgent</span>}
                            </span>
                          )}
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className={`block min-w-0 flex-1 truncate text-[13px] ${unread ? "font-medium text-ink" : "text-ink-500"}`}>{preview}</span>
                            {unread > 0 && (
                              <span aria-label={`${unread} unread`} className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${muted.has(r.thread_id) ? "bg-[var(--portal-sunken)] text-ink-700" : "bg-forest-700 text-white"}`}>
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {hits && (
                <section aria-label="Messages found" className="border-t border-gold-light">
                  <p className="t-eyebrow px-3 pb-1 pt-3">In messages</p>
                  {hits.length === 0 ? (
                    <p className="px-3 pb-4 text-sm text-ink-500">No messages contain &ldquo;{q}&rdquo;.</p>
                  ) : (
                    <ul className="divide-y divide-gold-light">
                      {hits.map((h) => (
                        <li key={h.message_id}>
                          <button type="button" onClick={() => open(h.thread_id, h.message_id)} className="block w-full px-3 py-2.5 text-left hover:bg-[var(--portal-hover)]">
                            <span className="flex justify-between gap-2 text-xs text-ink-500">
                              <span className="truncate font-medium text-ink">{titleOf(h.thread_id)}</span>
                              <span className="shrink-0">{ago(h.created_at)}</span>
                            </span>
                            <span className="line-clamp-2 text-[13px] text-ink-700">
                              {h.sender_id === me ? "You" : h.sender_name}: <Highlight text={h.body} q={q} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>

          <div className={`min-h-0 min-w-0 ${active ? "flex flex-col" : "hidden @2xl:flex @2xl:flex-col"}`}>
            {activeRow && me ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-3 border-b border-gold-light px-3 py-2.5 sm:px-4">
                  <button type="button" onClick={() => setActive(null)} aria-label="Back to conversations" className={`${ui.btnIcon} @2xl:hidden`}>
                    <Icon name="arrowLeft" />
                  </button>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${activeRow.kind === "group" ? "bg-[var(--portal-sunken)] text-ink-700" : "bg-forest-100 text-forest-900"}`}>
                    {activeRow.kind === "group" ? <Icon name="users" size="sm" /> : initials(activeRow.title)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{activeRow.title}</p>
                    {activeRow.kind === "group" ? (
                      <button type="button" onClick={() => setInfo(true)} className="block max-w-full truncate text-left text-xs text-ink-500 underline-offset-2 hover:text-forest-700 hover:underline">
                        {activeRow.subtitle ? `${activeRow.subtitle} · ` : ""}
                        {activeRow.member_count} members{activeRow.members_can_reply ? "" : " · staff write"}
                      </button>
                    ) : (
                      <p className="truncate text-xs text-ink-500">
                        {otherIsParent && isStaff
                          ? [activeRow.subtitle, activeOther?.detail ? `Parent of ${activeOther.detail}` : "Parent"].filter(Boolean).join(" · ")
                          : [activeRow.subtitle, activeOther?.detail].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {muted.has(activeRow.thread_id) && <Icon name="bellOff" size="sm" className="h-4 w-4 text-ink-500" />}
                  <ActionsMenu items={headMenu} label="Conversation options" />
                </div>
                {familyKids && familyKids.length > 0 && <FamilyContextStrip kids={familyKids} />}
                <div className="min-h-0 flex-1">
                <MessageThread
                  key={activeRow.thread_id}
                  thread={activeRow}
                  me={me}
                  isStaff={isStaff}
                  focusMessageId={focusMsg}
                  onSent={load}
                  onRead={load}
                  aiTriage={aiOn && activeRow.kind !== "group" && isParentId(activeRow.other_user_id)}
                  onTriaged={load}
                  emptyTitle={activeRow.kind === "group" ? `A new group: ${activeRow.title}` : `Start your conversation with ${activeRow.title}`}
                  starters={isStaff && otherIsParent && familyKids ? familyOpeners(activeRow.title, familyKids, aboutChild) : undefined}
                />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
                <Icon name="messageSquare" className="h-6 w-6 text-ink-500" />
                <p className="mt-2 text-sm font-medium text-ink">{active ? "This conversation is not available" : "Pick a conversation"}</p>
                <p className="mt-1 text-sm text-ink-500">{readOnly ? "Messages from your teachers appear on the left." : "or press New message to start one."}</p>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {picking && people && (
        <NewConversation
          people={people}
          isStaff={isStaff}
          onClose={() => setPicking(false)}
          onPickPerson={startWith}
          onCreated={async (id) => {
            setPicking(false);
            await load();
            open(id);
          }}
        />
      )}
      {info && activeRow && activeRow.kind === "group" && me && (
        <GroupInfo
          thread={activeRow}
          me={me}
          onClose={() => setInfo(false)}
          onChanged={load}
          onLeft={async () => {
            setInfo(false);
            setActive(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
