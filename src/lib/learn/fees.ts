import type { FeeBand } from "@/content/seed";

// Sanity's feeBand.yearGroupRange is free text ("Reception – Year 2"), and
// Supabase's year_groups.name is also free text ("Year 4") · there's no
// shared foreign key between the two CMSs (deliberately: fee bands are
// published content, year groups are academic-structure data; see 0008's
// own comments on keeping Sanity-owned content out of hand-entered tables).
// This is a best-effort text match for the LMS fee views only; if it can't
// confidently match a child's year group to a band, the caller must hide
// the fee line rather than guess (hide-when-empty, same pattern as every
// other optional field in this codebase).
function yearNumber(name: string): number | "reception" | null {
  const lower = name.toLowerCase();
  if (/reception|nursery/.test(lower)) return "reception";
  const m = lower.match(/year\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export function matchFeeBand(childYearGroupName: string | undefined | null, feeBands: FeeBand[]): FeeBand | null {
  if (!childYearGroupName) return null;
  const target = yearNumber(childYearGroupName);
  if (target === null) return null;

  for (const band of feeBands) {
    const parts = band.yearGroupRange.split(/[–—-]/).map((p) => yearNumber(p.trim()));
    if (parts.length === 0) continue;
    const nums = parts.filter((p): p is number => typeof p === "number");
    const hasReception = parts.includes("reception");

    if (target === "reception") {
      if (hasReception) return band;
      continue;
    }
    if (nums.length === 1 && target === nums[0]) return band;
    if (nums.length >= 2 && target >= Math.min(...nums) && target <= Math.max(...nums)) return band;
  }
  return null;
}
