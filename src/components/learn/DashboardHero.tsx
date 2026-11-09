"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { StatStrip, StatTile } from "@/components/learn/kit";

export type HeroChip = { label: string; value: string | number; tone?: "pink" | "yellow" | "white"; href?: string; hint?: string };

// "pink" marks a number that needs attention; the others are neutral.
// (Names kept so existing callers don't change.)
function formatChipValue(v: string | number): string {
  return typeof v === "number" && v > 999 ? "999+" : String(v);
}

/**
 * The top of every dashboard (redesign, docs/portal-redesign.md): a quiet
 * context line ("MONDAY · TEACHER WORKSPACE"), the greeting, one line on what
 * the page is for, then the figures in a single strip. No banner: the page's
 * content leads, not decoration. Fetches the user's first name itself.
 */
/** "Ustadh Bilal Ahmed" → "Bilal": titles and honorifics are not first names. */
export function firstNameOf(fullName: string): string | null {
  const TITLES = /^(ustadh|ustadha|ustaadh|ustaadha|shaykh|sheikh|shaykha|mr|mrs|ms|miss|dr|br|sr|brother|sister|imam|hafiz|hafidh|hafiza|maulana|mufti|qari|qariah|sayyid|sayyida)\.?$/i;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && TITLES.test(parts[0])) parts.shift();
  return parts[0] || null;
}

const AREA_WORKSPACE: Record<string, string> = { admin: "School office", teach: "Teacher workspace", family: "Family", student: "Student" };

export function DashboardHero({ subtitle, chips = [], area }: { subtitle?: string; chips?: HeroChip[]; area?: "admin" | "teach" | "family" | "student" }) {
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
      .then(({ data }) => setFirstName(firstNameOf((data as { full_name?: string } | null)?.full_name || "")));
  }, [session]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return (
    <section aria-labelledby="dash-greeting" className="pt-1">
      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-ink/55">
        {weekday} {date}
        {area ? <> · {AREA_WORKSPACE[area]}</> : null}
      </p>
      <h1 id="dash-greeting" className="mt-1 text-[1.625rem] font-semibold leading-tight tracking-tight text-ink">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-ink/70">{subtitle}</p>}
      {chips.length > 0 && (
        <StatStrip className="mt-5">
          {chips.map((c) => (
            <StatTile key={c.label} value={formatChipValue(c.value)} label={c.label} hint={c.hint} href={c.href} tone={c.tone === "pink" && typeof c.value === "number" && c.value > 0 ? "warn" : "neutral"} />
          ))}
        </StatStrip>
      )}
    </section>
  );
}
