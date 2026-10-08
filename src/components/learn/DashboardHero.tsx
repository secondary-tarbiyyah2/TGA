"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";

export type HeroChip = { label: string; value: string | number; tone?: "pink" | "yellow" | "white" };

const TONES: Record<NonNullable<HeroChip["tone"]>, string> = {
  pink: "bg-[#F4426F]",
  yellow: "bg-[#FFC107] text-ink",
  white: "bg-white/90 text-teal-900",
};

/**
 * The big welcome banner at the top of every dashboard: greeting, date and a
 * couple of headline numbers, on the brand teal with a quiet eight-point-star
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
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2A8C84] to-[#1F6F6B] px-6 py-7 text-white shadow-[0_8px_24px_-12px_rgba(31,111,107,0.55)] sm:px-8">
      <svg aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 h-[130%] w-[46%] text-white/[0.09]" viewBox="0 0 240 240" preserveAspectRatio="xMaxYMid slice">
        <defs>
          <pattern id="hero-star" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M30 4l5.5 13.2L48.8 11.2 42.8 24.5 56 30l-13.2 5.5 6 13.3-13.3-6L30 56l-5.5-13.2-13.3 6 6-13.3L4 30l13.2-5.5-6-13.3 13.3 6z" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="240" height="240" fill="url(#hero-star)" />
      </svg>
      <div className="relative">
        <p className="text-sm text-white/75">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}
        {chips.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {chips.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${TONES[c.tone || "white"]}`}>
                  {String(c.value).slice(0, 3)}
                </span>
                <span className="text-sm font-medium leading-tight text-white/90">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
