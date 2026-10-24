import type { Metadata } from "next";
import { AssessmentSitting } from "@/components/learn/assess/AssessmentSitting";

export const metadata: Metadata = {
  title: "Entry assessment",
  robots: { index: false, follow: false },
};

/** The child's entry assessment, opened from the one-time link in the family's email. No sign-in. */
export default function AssessmentPage() {
  return <AssessmentSitting />;
}
