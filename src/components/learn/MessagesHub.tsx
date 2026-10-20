"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageThread } from "@/components/learn/MessageThread";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";

type Person = { user_id: string; full_name: string; roles: string[]; detail: string | null };
type ThreadRow = {
  id: string;
  kind: string;
  child_id: string | null;
  parent_id: string | null;
  teacher_id: string | null;
  staff_a_id: string | null;
  staff_b_id: string | null;
  created_at: string;
  children?: { name: string } | null;
};
type Last = { thread_id: string; body: string; created_at: string; sender_id: string };

const STAFF_ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"];

function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

function roleText(roles: string[]): string {
  const staff = roles.filter((r) => STAFF_ROLES.includes(r));
  return (staff.length ? staff : roles).map((r) => learnRoleLabel(r as LearnRole) || r).join(" · ");
}

function ago(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * One inbox for everyone who may message (staff and parents): your
 * conversations on the left with the latest message, a "New message"
 * picker that lists everyone you're allowed to write to, and the open
 * thread on the right. Students have no 1:1 messaging at all (that is
 * enforced in the database, not just here).
 */
export function MessagesHub({ canAddPeople = false }: { canAddPeople?: boolean }) {
  const [me, setMe] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [lasts, setLasts] = useState<Record<string, Last>>({});
  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [directoryFailed, setDirectoryFailed] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMe(user.id);

    // The directory is a SECURITY DEFINER RPC (0085) that applies the
    // safeguarding rules server-side: staff see staff and the families of their
    // classes, parents see their children's teachers and the office. There is
    // deliberately no client-side fallback onto user_roles/profiles: RLS hides
    // other people there, which is what produced the empty list before.
    const dir = await supabase.rpc("message_directory");
    if (dir.error) {
      setPeople([]);
      setDirectoryFailed(true);
      setError(`Couldn't load the list of people to message: ${dir.error.message}`);
    } else {
      setDirectoryFailed(false);
      setError(null);
      setPeople((dir.data as Person[]) || []);
    }

    const { data: rows } = await supabase
      .from("message_threads")
      .select("id, kind, child_id, parent_id, teacher_id, staff_a_id, staff_b_id, created_at, children(name)")
      .order("created_at", { ascending: false });
    // Headteachers can read every thread for safeguarding; this inbox only
    // shows the ones you're actually part of.
    const mine = ((rows as unknown as ThreadRow[]) || []).filter(
      (t) => t.parent_id === user.id || t.teacher_id === user.id || t.staff_a_id === user.id || t.staff_b_id === user.id,
    );
    setThreads(mine);

    if (mine.length > 0) {
      const { data: msgs } = await supabase
        .from("message_thread_messages")
        .select("thread_id, body, created_at, sender_id")
        .in(
          "thread_id",
          mine.map((t) => t.id),
        )
        .order("created_at", { ascending: false })
        .limit(400);
      const map: Record<string, Last> = {};
      for (const m of (msgs as Last[]) || []) if (!map[m.thread_id]) map[m.thread_id] = m;
      setLasts(map);
    }
  }, []);

  const loadUnread = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.rpc("thread_unread_counts");
    setUnread(Object.fromEntries(((data as { thread_id: string; unread: number }[]) || []).map((r) => [r.thread_id, r.unread])));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
    loadUnread();
    const id = window.setInterval(() => {
      load();
      loadUnread();
    }, 30000);
    return () => window.clearInterval(id);
  }, [load, loadUnread]);

  const byId = useMemo(() => new Map((people || []).map((p) => [p.user_id, p])), [people]);

  const otherOf = (t: ThreadRow): string | null => {
    if (!me) return null;
    if (t.kind === "parent_teacher") return t.parent_id === me ? t.teacher_id : t.parent_id;
    return t.staff_a_id === me ? t.staff_b_id : t.staff_a_id;
  };

  const sorted = useMemo(() => {
    return [...(threads || [])].sort((a, b) => (lasts[b.id]?.created_at || b.created_at).localeCompare(lasts[a.id]?.created_at || a.created_at));
  }, [threads, lasts]);

  const start = async (other: Person) => {
    const supabase = getSupabaseClient();
    if (!supabase || !me) return;
    setError(null);
    const existing = (threads || []).find((t) => (t.kind === "direct" || t.kind === "staff") && (t.staff_a_id === other.user_id || t.staff_b_id === other.user_id));
    if (existing) {
      setActive(existing.id);
      setPicking(false);
      return;
    }
    const { data, error: err } = await supabase.from("message_threads").insert({ kind: "direct", staff_a_id: me, staff_b_id: other.user_id }).select("id").single();
    if (err || !data) {
      setError("Couldn't start that conversation. Please try again in a moment.");
      return;
    }
    await load();
    setActive((data as { id: string }).id);
    setPicking(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = (people || []).filter((p) => !q || p.full_name.toLowerCase().includes(q) || (p.detail || "").toLowerCase().includes(q));
  const staffList = filtered.filter((p) => p.roles.some((r) => STAFF_ROLES.includes(r)));
  const parentList = filtered.filter((p) => !p.roles.some((r) => STAFF_ROLES.includes(r)));

  const activeThread = (threads || []).find((t) => t.id === active) || null;
  const activeOther = activeThread ? byId.get(otherOf(activeThread) || "") : undefined;

  const loading = people === null || threads === null;
  const nobodyToMessage = people !== null && people.length === 0 && !directoryFailed;

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Message the teachers, office and families you work with. Staff review messages for safeguarding as part of normal practice."
        actions={
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={loading || nobodyToMessage || directoryFailed}
            className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50"
          >
            + New message
          </button>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}

      {loading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-white" />
      ) : nobodyToMessage && (threads || []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white p-10 text-center">
          <p className="text-base font-semibold text-ink">No one else is set up yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
            As soon as other teachers, admins or parents have accounts, they&apos;ll appear here and you can message them in one click.
          </p>
          {canAddPeople && (
            <Link href="/admin/people" className="mt-4 inline-block rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
              Add people
            </Link>
          )}
        </div>
      ) : (
        <div className="grid overflow-hidden rounded-2xl border border-gold-light bg-white md:grid-cols-[320px_minmax(0,1fr)]">
          <div className={`border-gold-light md:border-r ${active ? "hidden md:block" : ""}`}>
            <ul className="max-h-[70vh] divide-y divide-gold-light/70 overflow-y-auto">
              {sorted.length === 0 && (
                <li className="px-5 py-10 text-center">
                  <p className="text-sm font-semibold text-ink">No conversations yet</p>
                  <p className="mt-1 text-sm text-ink/60">Press “New message” to say hello.</p>
                </li>
              )}
              {sorted.map((t) => {
                const other = byId.get(otherOf(t) || "");
                const last = lasts[t.id];
                const name = other?.full_name || "Conversation";
                const unreadN = active === t.id ? 0 : unread[t.id] || 0;
                const context = t.kind === "parent_teacher" && t.children?.name ? `About ${t.children.name}` : other ? [roleText(other.roles), other.detail].filter(Boolean).join(" · ") : "";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActive(t.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream ${active === t.id ? "bg-teal-50" : ""}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900">{initials(name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm text-ink ${unreadN ? "font-bold" : "font-semibold"}`}>{name}</span>
                          {last && <span className="shrink-0 text-xs text-ink/65">{ago(last.created_at)}</span>}
                        </span>
                        <span className="block truncate text-xs text-ink/65">{context}</span>
                        <span className="flex items-center gap-2">
                          <span className={`block min-w-0 flex-1 truncate text-sm ${unreadN ? "font-semibold text-ink" : "text-ink/65"}`}>{last ? `${last.sender_id === me ? "You: " : ""}${last.body}` : "No messages yet"}</span>
                          {unreadN > 0 && (
                            <span aria-label={`${unreadN} unread`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[11px] font-semibold text-white">
                              {unreadN > 99 ? "99+" : unreadN}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={`min-w-0 ${active ? "" : "hidden md:block"}`}>
            {activeThread ? (
              <div>
                <div className="flex items-center gap-3 border-b border-gold-light px-4 py-3">
                  <button type="button" onClick={() => setActive(null)} aria-label="Back to conversations" className="rounded-lg px-2 py-1 text-ink/60 hover:bg-cream md:hidden">
                    ‹
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900">{initials(activeOther?.full_name || "?")}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{activeOther?.full_name || "Conversation"}</p>
                    <p className="truncate text-xs text-ink/65">
                      {activeOther ? roleText(activeOther.roles) : ""}
                      {activeOther?.detail ? ` · ${activeOther.detail}` : ""}
                    </p>
                  </div>
                </div>
                <MessageThread key={activeThread.id} threadId={activeThread.id} onSent={load} onRead={loadUnread} />
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 py-16 text-center">
                <p className="text-base font-semibold text-ink">Pick a conversation</p>
                <p className="mt-1 text-sm text-ink/60">or start a new one with the button above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {picking && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="New message">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
              <h2 className="text-lg font-semibold text-ink">New message</h2>
              <button
                type="button"
                onClick={() => {
                  setPicking(false);
                  setQuery("");
                }}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-xl leading-none text-ink/55 hover:bg-cream"
              >
                ×
              </button>
            </div>
            <div className="border-b border-gold-light px-5 py-3">
              <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or child…" className="w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto px-2 py-2">
              {[
                { label: "Staff", list: staffList },
                { label: "Parents", list: parentList },
              ].map(
                (g) =>
                  g.list.length > 0 && (
                    <div key={g.label} className="mb-2">
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/65">{g.label}</p>
                      {g.list.map((p) => (
                        <button key={p.user_id} type="button" onClick={() => start(p)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-cream">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900">{initials(p.full_name)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{p.full_name}</span>
                            <span className="block truncate text-xs text-ink/65">
                              {roleText(p.roles)}
                              {p.detail ? ` · ${p.detail}` : ""}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ),
              )}
              {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink/55">No one matches “{query}”.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
