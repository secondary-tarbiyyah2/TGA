"use client";

import { useCallback, useEffect, useState } from "react";
import { SidePanel, useConfirm } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { Switch, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { GROUP_TYPE_LABEL, initials, type InboxRow } from "@/components/learn/messages/messagesShared";

type Member = { user_id: string; full_name: string; member_role: "staff" | "parent" | "pupil"; is_admin: boolean; added_at: string };
type Candidate = { user_id: string; full_name: string; member_kind: string; detail: string | null };

const ROLE_LABEL: Record<string, string> = { staff: "Staff", parent: "Parents", pupil: "Pupils" };

/**
 * A group's details beside the conversation: who is in it (staff see
 * everyone; families and pupils see the staff and themselves, 0204), and for
 * the group's admins: rename, replies on or off, add or remove people, make
 * another member of staff an admin. Anyone can leave.
 */
export function GroupInfo({ thread, me, onClose, onChanged, onLeft }: { thread: InboxRow; me: string; onClose: () => void; onChanged: () => void; onLeft: () => void }) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [title, setTitle] = useState(thread.title);
  const [canReply, setCanReply] = useState(thread.members_can_reply);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admin = thread.is_admin;

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.rpc("thread_members", { p_thread_id: thread.thread_id });
    setMembers((data as Member[] | null) || []);
  }, [thread.thread_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, after?: () => void) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc(fn, args);
    setBusy(false);
    if (err) {
      setError(err.message || "That didn't work. Please try again.");
      return false;
    }
    after?.();
    await load();
    onChanged();
    return true;
  };

  const openAdd = async () => {
    setAdding(true);
    if (candidates) return;
    const supabase = getSupabaseClient();
    const { data } = (await supabase?.rpc("message_group_candidates")) || { data: [] };
    setCandidates((data as Candidate[] | null) || []);
  };

  const inGroup = new Set((members || []).map((m) => m.user_id));
  const f = find.trim().toLowerCase();
  const pool = (candidates || []).filter((c) => !inGroup.has(c.user_id) && (!f || c.full_name.toLowerCase().includes(f) || (c.detail || "").toLowerCase().includes(f)));
  const groups = (["staff", "parent", "pupil"] as const).map((r) => ({ role: r, list: (members || []).filter((m) => m.member_role === r) })).filter((g) => g.list.length);
  const hidden = thread.my_role !== "staff" ? Math.max(0, thread.member_count - (members?.length || 0)) : 0;

  return (
    <SidePanel title={thread.title} eyebrow={GROUP_TYPE_LABEL[thread.group_type || "ad_hoc"]} onClose={onClose} label="Group details">
      <div className="space-y-6">
        <p className="text-sm text-ink-500">
          {thread.member_count} {thread.member_count === 1 ? "member" : "members"}.{" "}
          {thread.members_can_reply ? "Families and pupils can reply; their replies reach the staff only." : "Only staff write in this group."}
        </p>

        {admin && (
          <section className="space-y-3">
            <h3 className="t-section">Settings</h3>
            <div>
              <label htmlFor="gi-title" className={ui.label}>
                Group name
              </label>
              <div className="mt-1 flex gap-2">
                <input id="gi-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={ui.input} />
                <button type="button" disabled={busy || !title.trim() || title.trim() === thread.title} onClick={() => run("message_group_update", { p_thread_id: thread.thread_id, p_title: title.trim(), p_members_can_reply: canReply })} className={ui.btnSecondary}>
                  Save
                </button>
              </div>
            </div>
            <Switch
              checked={canReply}
              onChange={(v) => {
                setCanReply(v);
                void run("message_group_update", { p_thread_id: thread.thread_id, p_title: (title.trim() || thread.title).slice(0, 80), p_members_can_reply: v });
              }}
              label="Families and pupils can reply"
              hint="Off: a noticeboard where only staff write."
            />
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="t-section">Members</h3>
            {admin && !adding && (
              <button type="button" onClick={openAdd} className={`${ui.btnSecondary} ${ui.sm}`}>
                <Icon name="userRoundPlus" size="sm" /> Add people
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-4 rounded-lg border border-gold-light p-3">
              <label htmlFor="gi-find" className={ui.label}>
                Add people
              </label>
              <input id="gi-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search by name" className={`${ui.input} mt-1`} />
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {candidates === null ? (
                  <li className="py-3 text-sm text-ink-500">Loading</li>
                ) : pool.length === 0 ? (
                  <li className="py-3 text-sm text-ink-500">No one else to add.</li>
                ) : (
                  pool.map((c) => (
                    <li key={c.user_id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-[var(--portal-hover)]">
                        <input
                          type="checkbox"
                          checked={picked.has(c.user_id)}
                          onChange={() =>
                            setPicked((s) => {
                              const n = new Set(s);
                              if (n.has(c.user_id)) n.delete(c.user_id);
                              else n.add(c.user_id);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{c.full_name}</span>
                          <span className="block truncate text-xs text-ink-500">{c.detail || c.member_kind}</span>
                        </span>
                      </label>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => { setAdding(false); setPicked(new Set()); }} className={ui.btnGhost}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || picked.size === 0}
                  onClick={() => run("message_group_add_members", { p_thread_id: thread.thread_id, p_member_ids: [...picked] }, () => { setAdding(false); setPicked(new Set()); })}
                  className={ui.btnPrimary}
                >
                  Add {picked.size || ""}
                </button>
              </div>
            </div>
          )}

          {members === null ? (
            <p className="text-sm text-ink-500">Loading</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.role}>
                  <p className="t-eyebrow mb-1">{ROLE_LABEL[g.role]} ({g.list.length})</p>
                  <ul className="divide-y divide-gold-light rounded-lg border border-gold-light">
                    {g.list.map((m) => (
                      <li key={m.user_id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold text-forest-900">{initials(m.full_name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {m.full_name}
                            {m.user_id === me && <span className="text-ink-500"> (you)</span>}
                          </span>
                          {m.is_admin && <span className="block text-xs text-ink-500">Group admin</span>}
                        </span>
                        {admin && m.user_id !== me && (
                          <span className="flex shrink-0 gap-1">
                            {m.member_role === "staff" && (
                              <button type="button" disabled={busy} onClick={() => run("message_group_set_admin", { p_thread_id: thread.thread_id, p_user_id: m.user_id, p_admin: !m.is_admin })} className={`${ui.btnLink} text-xs`}>
                                {m.is_admin ? "Remove admin" : "Make admin"}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (await confirm({ title: `Remove ${m.full_name}?`, description: "They will no longer see this group or its new messages.", confirmLabel: "Remove", danger: true }))
                                  void run("message_group_remove_member", { p_thread_id: thread.thread_id, p_user_id: m.user_id });
                              }}
                              aria-label={`Remove ${m.full_name}`}
                              className={`${ui.btnLinkDanger} text-xs`}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {hidden > 0 && <p className="text-xs text-ink-500">And {hidden} other {hidden === 1 ? "family member" : "families and pupils"}. Families never see each other in a group.</p>}
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}

        <section className="border-t border-gold-light pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirm({ title: "Leave this group?", description: "You will stop seeing its messages. A group admin can add you again.", confirmLabel: "Leave group", danger: true }))
                if (await run("message_group_remove_member", { p_thread_id: thread.thread_id, p_user_id: me })) onLeft();
            }}
            className={ui.btnLinkDanger}
          >
            <Icon name="logOut" size="sm" /> Leave group
          </button>
        </section>
      </div>
    </SidePanel>
  );
}
