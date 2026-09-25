"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Announcement = { id: string; scope: "class" | "school"; class_id: string | null; title: string; body: string; created_at: string };

/**
 * Reads school-wide + (when classIds is given) class-scoped announcements.
 * RLS (0013) already scopes what comes back per role — this component just
 * renders it. `canPost`/`postClassId` optionally render a small compose
 * form for a teacher posting to their own class, or Head Teacher/Admin
 * posting school-wide.
 */
export function AnnouncementsFeed({
  classIds = [],
  canPost = false,
  postClassId,
  postScope = "class",
  limit = 10,
}: {
  classIds?: string[];
  canPost?: boolean;
  postClassId?: string;
  postScope?: "class" | "school";
  limit?: number;
}) {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const filter = classIds.length > 0 ? `scope.eq.school,class_id.in.(${classIds.join(",")})` : "scope.eq.school";
    const { data } = await supabase
      .from("announcements")
      .select("id, scope, class_id, title, body, created_at")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(limit);
    setItems((data as Announcement[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, classIds.join(",")]);

  const post = async () => {
    if (!supabase || !title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("announcements").insert({
        scope: postScope,
        class_id: postScope === "class" ? postClassId : null,
        title: title.trim(),
        body: body.trim(),
        author_id: user.id,
      });
      if (!error) {
        setTitle("");
        setBody("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Announcements</h2>
      {canPost && (
        <div className="mt-3 space-y-2 border-b border-gold-light/30 pb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={2}
            className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!title.trim() || !body.trim() || busy}
            onClick={post}
            className="rounded-full bg-gold-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Post {postScope === "school" ? "school-wide" : "to class"}
          </button>
        </div>
      )}
      {items === null ? (
        <p className="mt-3 text-sm text-ink/60">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">No announcements yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-gold-light/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{a.title}</span>
                <span className="text-xs text-ink/50">{new Date(a.created_at).toLocaleDateString("en-GB")}</span>
              </div>
              <p className="mt-1 text-sm text-ink/70">{a.body}</p>
              {a.scope === "school" && <span className="mt-1 inline-block text-xs text-gold-700">School-wide</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
