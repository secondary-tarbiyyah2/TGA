"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SwitchKnob } from "@/components/learn/ui";
import { FEATURES, featureMapFrom, featureStore, type FeatureKey, type FeatureMap } from "@/lib/learn/features";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700";

/**
 * Settings, School features (owner, 11 Nov 2026): the Headteacher switches
 * optional parts of the portal on or off for the whole school. Each switch
 * saves straight away (migration 0210, public.school_features). Switching
 * something off hides it; nothing is deleted.
 */
export function SchoolFeatures({ canChange }: { canChange: boolean }) {
  const [values, setValues] = useState<FeatureMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<FeatureKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("school_features")
      .select("key, enabled")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        else setValues(featureMapFrom(data as { key: string; enabled: boolean }[]));
      });
    return () => {
      alive = false;
    };
  }, []);

  const change = async (key: FeatureKey, enabled: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase || !values || !canChange) return;
    setBusy(key);
    setMsg(null);
    const { data, error } = await supabase.from("school_features").update({ enabled }).eq("key", key).select("key");
    setBusy(null);
    const label = FEATURES.find((f) => f.key === key)?.label || "The switch";
    if (error || !data?.length) return setMsg({ ok: false, text: "Couldn't save. Only the Headteacher or Admin can change school features." });
    setValues({ ...values, [key]: enabled });
    featureStore().set(key, enabled);
    setMsg({ ok: true, text: `${label} is now ${enabled ? "on" : "off"}. Everyone else sees the change the next time they open the portal.` });
  };

  return (
    <div data-guide="school-features" className="rounded-2xl border border-gold-light bg-white">
      <div className="border-t border-gold-light">
        {failed ? (
          <p className="px-5 py-5 text-sm text-ink/70">Couldn&apos;t load the school features. Refresh the page to try again.</p>
        ) : !values ? (
          <div className="m-5 h-24 rounded-lg bg-cream motion-safe:animate-pulse" />
        ) : (
          <ul className="divide-y divide-gold-light">
            {FEATURES.map((f) => {
              const on = values[f.key];
              const id = `feature-${f.key}`;
              return (
                <li key={f.key} className="flex items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p id={id} className="text-sm font-semibold text-ink">
                      {f.label}
                    </p>
                    <p className="mt-0.5 text-sm text-ink/70">{f.explain}</p>
                    <p className="t-meta mt-1 text-xs">
                      <span className="font-medium text-ink-700">{on ? "On" : "Off"}:</span> {on ? f.on : f.off}
                      {on !== f.default && <span> (usually {f.default ? "on" : "off"})</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={id}
                    disabled={!canChange || busy !== null}
                    onClick={() => change(f.key, !on)}
                    className={`mt-0.5 flex min-h-11 min-w-11 shrink-0 items-start justify-center rounded-lg p-1 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`}
                  >
                    <SwitchKnob checked={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!canChange && values && <p className="border-t border-gold-light px-5 py-3 text-sm text-ink/70">Only the Headteacher or Admin can change these.</p>}
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`border-t border-gold-light px-5 py-3 text-sm ${msg.ok ? "text-ink/75" : "text-red-700"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
