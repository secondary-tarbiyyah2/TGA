export type SignatureMethod = "portal" | "paper" | "in_person" | "verbal";

export const METHOD_LABEL: Record<SignatureMethod, string> = {
  portal: "Signed online",
  paper: "Signed on paper",
  in_person: "Signed in person at school",
  verbal: "Verbal/phone confirmation (witnessed)",
};

export const HAND_METHODS: SignatureMethod[] = ["paper", "in_person", "verbal"];

/** "Signed on paper · recorded by X" (or "Signed online"). */
export function methodBadge(method: string | null | undefined, recordedByName?: string | null): string {
  const m = (method || "portal") as SignatureMethod;
  const label = METHOD_LABEL[m] || METHOD_LABEL.portal;
  if (m === "portal") return label;
  return recordedByName ? `${label} · recorded by ${recordedByName}` : label;
}
