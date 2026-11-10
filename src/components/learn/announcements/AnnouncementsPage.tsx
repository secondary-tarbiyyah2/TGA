"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ComposeModal } from "./ComposeModal";
import { ANNOUNCEMENT_COLUMNS, formatDate, isExpired, isNew, type AnnouncementRow } from "./types";

import { askConfirm } from "@/components/learn/kit";
export type AnnouncementsMode = "admin" | "teach" | "family" | "student";

const STAFF_VIEWER: ClassViewer = { kind: "staff" };
const TEACHER_VIEWER: ClassViewer = { kind: "teacher" };

const CRUMBS: Record<AnnouncementsMode, { label: string; href: string }> = {
  admin: { label: "Today", href: "/admin/dashboard" },
  teach: { label: "Today", href: "/teach/dashboard" },
  family: { label: "Today", href: "/family/dashboard" },
  student: { label: "Today", href: "/student/dashboard" },
};

export function AnnouncementsPage({ mode }: { mode: AnnouncementsMode }) {
  const supabase = getSupabaseClient();
  const canManage = mode === "admin" || mode === "teach";
  const isHead = mode === "admin";
  const classes = useViewerClasses(mode === "admin" ? STAFF_VIEWER : mode === "teach" ? TEACHER_VIEWER : null);

  const [items, setItems] = useState<AnnouncementRow[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"current" | "recalled" | "expired" | "all">("current");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (err) setError(err.message);
    setItems((data as unknown as AnnouncementRow[]) || []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [supabase, load]);

  // Staff see live notices by default, with recalled and expired ones a click
  // away, rather than everything they have ever posted in one long list.
  const counts = useMemo(() => {
    const all = items || [];
    return {
      current: all.filter((a) => !a.recalled_at && !isExpired(a)).length,
      recalled: all.filter((a) => !!a.recalled_at).length,
      expired: all.filter((a) => !a.recalled_at && isExpired(a)).length,
      all: all.length,
    };
  }, [items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || [])
      .filter((a) => {
        if (!canManage) return !a.recalled_at && !isExpired(a);
        if (view === "current") return !a.recalled_at && !isExpired(a);
        if (view === "recalled") return !!a.recalled_at;
        if (view === "expired") return !a.recalled_at && isExpired(a);
        return true;
      })
      .filter((a) => !q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || (a.classes?.name ?? "").toLowerCase().includes(q));
  }, [items, query, canManage, view]);

  const canEdit = (a: AnnouncementRow): boolean => isHead || (mode === "teach" && a.author_id === userId);

  const setRecalled = async (a: AnnouncementRow, recalled: boolean) => {
    if (!supabase) return;
    if (recalled && !(await askConfirm(`Recall "${a.title}"? It disappears for everyone it was posted to. You can restore it later.`))) return;
    setBusyId(a.id);
    setError(null);
    const { error: err } = await supabase
      .from("announcements")
      .update({ recalled_at: recalled ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (err) setError(err.message);
    await load();
    setBusyId(null);
  };

  const remove = async (a: AnnouncementRow) => {
    if (!supabase) return;
    if (!(await askConfirm(`Delete "${a.title}"? This can't be undone.`))) return;
    setBusyId(a.id);
    setError(null);
    const { error: err } = await supabase.from("announcements").delete().eq("id", a.id);
    if (err) setError(err.message);
    await load();
    setBusyId(null);
  };

  const subtitle = canManage ? "Post notices to the families and pupils in your classes, or to the whole school." : "Notices from the school and your classes.";
  const canCompose = canManage && (isHead || (classes !== null && classes.length > 0));

  return (
    <>
      <PageHeader
        crumbs={[{ label: CRUMBS[mode].label, href: CRUMBS[mode].href }, { label: "Announcements" }]}
        title="Announcements"
        subtitle={subtitle}
        actions={
          canManage ? (
            <button
              type="button"
              disabled={!canCompose}
              onClick={() => setComposing(true)}
              className="rounded-lg bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50"
            >
              + Post notice
            </button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notices"
          aria-label="Search notices"
          className="w-full rounded-lg border border-gold-light bg-white px-3 py-2.5 text-sm sm:max-w-sm"
        />
        {canManage && items && (
          <div role="group" aria-label="Which notices" className="flex flex-wrap gap-1.5">
            {(
              [
                ["current", "Live"],
                ["recalled", "Recalled"],
                ["expired", "Expired"],
                ["all", "All"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${view === k ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
              >
                {label} ({counts[k]})
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {items === null ? (
        <p className="text-sm text-ink/65">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white px-6 py-12 text-center">
          <p className="font-medium text-ink">{query ? "No notices match your search." : canManage && view !== "all" && counts.all > 0 ? "Nothing in this view." : "No announcements yet."}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink/65">
            {query
              ? "Try a different word, or clear the search."
              : canManage
                ? "Post a notice and it will appear here for the people it is addressed to."
                : "When the school or your class posts a notice, you will see it here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const recalled = a.recalled_at !== null;
            const expired = isExpired(a);
            const fresh = !canManage && isNew(a);
            const busy = busyId === a.id;
            const audience = a.scope === "school" ? "Whole school" : a.classes?.name ?? "Class";
            return (
              <li key={a.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${recalled || expired ? "border-gold-light/50 opacity-75" : "border-gold-light"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {fresh && <span aria-label="New" title="New" className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-700" />}
                      <h2 className="text-base font-semibold text-ink">{a.title}</h2>
                      {a.pinned && <span className="rounded-full bg-gold-light/60 px-2 py-0.5 text-xs font-medium text-ink/70">Pinned</span>}
                      {recalled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Recalled</span>}
                      {expired && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink/65">Expired</span>}
                    </div>
                    <p className="mt-1 text-xs text-ink/65">
                      {a.profiles?.full_name || "School staff"} · {formatDate(a.created_at)}
                      {a.edited_at ? " · edited" : ""}
                      {a.expires_at && !expired ? ` · expires ${formatDate(a.expires_at)}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-700/10 px-2.5 py-1 text-xs font-medium text-teal-700">{audience}</span>
                </div>
                {(() => {
                  // Long notices are folded to a few lines and open in place.
                  const long = a.body.length > 420 || a.body.split("\n").length > 6;
                  const open = expanded.has(a.id);
                  return (
                    <>
                      <p className={`mt-3 whitespace-pre-line break-words text-sm text-ink/80 ${long && !open ? "line-clamp-5" : ""}`}>{a.body}</p>
                      {long && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((prev) => {
                              const n = new Set(prev);
                              if (n.has(a.id)) n.delete(a.id);
                              else n.add(a.id);
                              return n;
                            })
                          }
                          className="mt-1 text-sm font-medium text-teal-700 hover:underline"
                        >
                          {open ? "Show less" : "Read more"}
                        </button>
                      )}
                    </>
                  );
                })()}
                {canManage && canEdit(a) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gold-light/40 pt-3">
                    <button type="button" disabled={busy} onClick={() => setEditing(a)} className="inline-flex items-center gap-1.5 rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/75 hover:bg-cream disabled:opacity-50">
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                    <button type="button" disabled={busy} onClick={() => setRecalled(a, !recalled)} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/75 hover:bg-cream disabled:opacity-50">
                      {recalled ? "Restore" : "Recall"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => remove(a)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(composing || editing) && (
        <ComposeModal
          existing={editing}
          classes={(classes || []).map((c) => ({ id: c.id, name: c.name }))}
          canPostSchool={isHead}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
          onSaved={() => {
            setComposing(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
