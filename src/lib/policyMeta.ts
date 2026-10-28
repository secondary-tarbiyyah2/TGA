/**
 * Client-safe part of the policy text model (no Node imports): the header
 * fields, the row shape and the markdown front-matter parser. Server-side
 * loading lives in src/lib/policies.ts.
 */

export type PolicyMeta = {
  subtitle?: string;
  policyName?: string;
  appliesTo?: string;
  owner?: string;
  approvedBy?: string;
  agreedWith?: string;
  dateOfIssue?: string;
  nextReview?: string;
  basis?: string;
  readAlongside?: string;
  availability?: string;
};

export type PolicyText = {
  slug: string;
  number: string;
  title: string;
  meta: PolicyMeta;
  body: string;
};

/** Header rows in the order they appear on the PDF and the web page. */
export const POLICY_META_FIELDS: { key: keyof PolicyMeta; label: string }[] = [
  { key: "policyName", label: "Policy name" },
  { key: "appliesTo", label: "Applies to" },
  { key: "owner", label: "Policy owner" },
  { key: "approvedBy", label: "Approved by" },
  { key: "agreedWith", label: "Agreed with" },
  { key: "dateOfIssue", label: "Date of issue" },
  { key: "nextReview", label: "Next review due by" },
  { key: "basis", label: "Basis" },
  { key: "readAlongside", label: "Read alongside" },
  { key: "availability", label: "Availability" },
];

export function parsePolicyMarkdown(text: string): { number: string; title: string; meta: PolicyMeta; body: string } | null {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    fields[key] = value;
  }
  const { number, title, ...meta } = fields;
  return { number: number || "", title: title || "", meta: meta as PolicyMeta, body: text.slice(m[0].length).trim() };
}

