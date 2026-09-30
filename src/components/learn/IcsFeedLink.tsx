"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { generateIcsToken, hashIcsToken, icsFeedUrl } from "@/lib/learn/timetable";

type TokenRow = { id: string; created_at: string };

/**
 * Lets the signed-in user create/revoke their own calendar-feed token and
 * copy its .ics URL. The raw token is shown ONCE, right after creation —
 * only its SHA-256 hash is ever stored (see ics_tokens' migration comment
 * and supabase/functions/timetable-ics), so it can never be redisplayed
 * later; creating a new one is how you "see it again" (and invalidates
 * nothing else — a user can hold several live tokens at once, each
 * independently revocable).
 */
export function IcsFeedLink() {
  const supabase = getSupabaseClient();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("ics_tokens").select("id, created_at").is("revoked_at", null).order("created_at", { ascending: false });
    setTokens((data as TokenRow[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const createToken = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const token = generateIcsToken();
      const hash = await hashIcsToken(token);
      const { error } = await supabase.from("ics_tokens").insert({ user_id: user.id, token_hash: hash });
      if (!error) {
        setFreshUrl(icsFeedUrl(token));
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!supabase) return;
    await supabase.from("ics_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    setFreshUrl(null);
    await load();
  };

  if (!supabase) return null;

  return (
    <div className="print:hidden mt-6 rounded-xl border border-gold-light/40 bg-cream/30 p-4">
      <h2 className="text-sm font-semibold text-ink">Subscribe from your calendar app</h2>
      <p className="mt-1 text-xs text-ink/60">
        Get a link you can add to Google Calendar, Apple Calendar or Outlook — it updates automatically and needs
        no sign-in, so keep it private and revoke it if it&apos;s ever shared by mistake.
      </p>

      {freshUrl && (
        <div className="mt-3 rounded-lg border border-gold-500 bg-white p-3 text-xs">
          <p className="font-medium text-ink">Your feed link (shown once — copy it now):</p>
          <code className="mt-1 block break-all text-ink/80">{freshUrl}</code>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={createToken}
          disabled={busy}
          className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-50 text-white hover:bg-gold-900 transition-colors"
        >
          {busy ? "Creating…" : "Create a new calendar link"}
        </button>
      </div>

      {tokens && tokens.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink/60">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span>Created {new Date(t.created_at).toLocaleString()}</span>
              <button type="button" onClick={() => revoke(t.id)} className="text-red-700 underline">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
