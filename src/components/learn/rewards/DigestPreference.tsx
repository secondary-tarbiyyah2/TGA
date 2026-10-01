"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

// Family area switch for the Friday weekly email digest. Stored in
// parent_preferences.digest_opt_out (0073); a parent can only read and write
// their own row. No row means "send it".

export function DigestPreference() {
  const [optOut, setOptOut] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("parent_preferences").select("digest_opt_out").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setOptOut(Boolean((data as { digest_opt_out?: boolean } | null)?.digest_opt_out));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (wantEmail: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { error: err } = await supabase.from("parent_preferences").upsert({ user_id: user.id, digest_opt_out: !wantEmail }, { onConflict: "user_id" });
    if (err) setError(true);
    else setOptOut(!wantEmail);
    setBusy(false);
  };

  if (optOut === null) return null;

  return (
    <section id="digest" aria-labelledby="digest-heading" className="print:hidden rounded-2xl border border-gold-light/50 bg-white p-5">
      <h2 id="digest-heading" className="text-sm font-semibold text-ink">
        Weekly email
      </h2>
      <label className="mt-2 flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" className="mt-1" checked={!optOut} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Email me a summary of my children&apos;s week every Friday afternoon
          <span className="block text-xs text-ink/55">Attendance, homework, merits, teacher comments and next week&apos;s lessons, in one email per family.</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs text-amber-900">
          Couldn&apos;t save that change. Please try again.
        </p>
      )}
    </section>
  );
}
