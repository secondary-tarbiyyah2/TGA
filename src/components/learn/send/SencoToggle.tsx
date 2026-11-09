"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SwitchKnob } from "@/components/learn/ui";

/** On a member of staff's record: name them as a SENCo (Headteacher or admin only; set_senco re-checks). */
export function SencoToggle({ userId, name, canSet }: { userId: string; name: string; canSet: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("user_permissions")
      .select("id")
      .eq("user_id", userId)
      .eq("permission", "senco")
      .then(({ data, error }) => setOn(error ? null : (data || []).length > 0));
  }, [userId]);

  const change = async (next: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_senco", { p_user: userId, p_on: next });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setOn(next);
    setMsg({ ok: true, text: next ? `${name} is now a SENCo.` : `${name} is no longer a SENCo.` });
  };

  if (on === null) return null;
  return (
    <div className="rounded-xl border border-gold-light bg-cream/40 p-4">
      <button type="button" role="switch" aria-checked={on} disabled={!canSet || busy} onClick={() => void change(!on)} className="flex items-center gap-3 disabled:opacity-60">
        <SwitchKnob checked={on} />
        <span className="text-sm font-semibold text-ink">SENCo</span>
      </button>
      <p className="mt-2 text-xs text-ink/65">
        A SENCo keeps the SEND register: writes and reviews support plans, sees every plan and the family&apos;s comments, and gets review reminders in the Action centre. Switch this on for a teacher who is also the SENCo; for someone employed only as the SENCo, tick the SENCo role above instead.
        {!canSet ? " Only the Headteacher or an admin can change this." : ""}
      </p>
      {msg && (
        <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
