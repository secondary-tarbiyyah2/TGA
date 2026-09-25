import type { FeeBand } from "@/content/seed";
import { keyStages } from "@/content/curriculum";

export type BandKey = "reception-y2" | "y3-6" | "y7-9" | "y10-11";

// feeBands and curriculum keyStages are both ordered Reception→Y11 (checked
// against both source files, same assumption src/components/FeeEstimator.tsx
// and the original EligibilityQuiz already relied on).
export const BAND_INDEX: Record<BandKey, number> = { "reception-y2": 0, "y3-6": 1, "y7-9": 2, "y10-11": 3 };

export function bandForYearGroup(year: string): BandKey {
  if (["Reception", "Year 1", "Year 2"].includes(year)) return "reception-y2";
  if (["Year 3", "Year 4", "Year 5", "Year 6"].includes(year)) return "y3-6";
  if (["Year 7", "Year 8", "Year 9"].includes(year)) return "y7-9";
  return "y10-11";
}

export function feeBandForYearGroup(year: string, feeBands: FeeBand[]): FeeBand | null {
  const band = bandForYearGroup(year);
  return feeBands[BAND_INDEX[band]] ?? null;
}

export function keyStageForYearGroup(year: string) {
  const band = bandForYearGroup(year);
  return keyStages[BAND_INDEX[band]] ?? null;
}
