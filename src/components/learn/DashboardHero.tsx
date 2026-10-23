"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";

export type HeroChip = { label: string; value: string | number; tone?: "pink" | "yellow" | "white" };

// "pink" marks a number that needs attention; the others are neutral.
// (Names kept so existing callers don't change.)
function formatChipValue(v: string | number): string {
  return typeof v === "number" && v > 999 ? "999+" : String(v);
}

/**
 * The big welcome banner at the top of every dashboard: greeting, date and a
 * couple of headline numbers, on logo-gold-on-ink with a quiet eight-point-star
 * pattern. Fetches the signed-in user's first name itself, so any dashboard
 * can drop it in.
 */
export function DashboardHero({ subtitle, chips = [] }: { subtitle?: string; chips?: HeroChip[] }) {
  const { session } = useLearnSession();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session || session === "loading") return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setFirstName(((data as { full_name?: string } | null)?.full_name || "").split(" ")[0] || null));
  }, [session]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="relative overflow-hidden rounded-2xl portal-hero px-6 py-7 text-white sm:px-8">
      <svg aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 h-[130%] w-[46%] text-gold-500/[0.16]" viewBox="0 0 240 240" preserveAspectRatio="xMaxYMid slice">
        <defs>
          <pattern id="hero-star" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M30 4l5.5 13.2L48.8 11.2 42.8 24.5 56 30l-13.2 5.5 6 13.3-13.3-6L30 56l-5.5-13.2-13.3 6 6-13.3L4 30l13.2-5.5-6-13.3 13.3 6z" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="240" height="240" fill="url(#hero-star)" />
      </svg>
      <div className="relative">
        <p className="text-sm font-medium tracking-wide text-gold-300">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
        {chips.length > 0 && (
          <dl className="mt-5 flex flex-wrap gap-3">
            {chips.map((c) => (
              <div key={c.label} className="flex min-w-[9rem] flex-col-reverse rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-inset ring-gold-500/40">
                <dt className="text-xs font-medium text-white/85">{c.label}</dt>
                <dd className="flex items-center gap-2 text-2xl font-semibold tabular-nums leading-tight">
                  {formatChipValue(c.value)}
                  {c.tone === "pink" && typeof c.value === "number" && c.value > 0 && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold-300" />}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
