import { getSupabaseClient } from "@/lib/supabase/client";

/** Audience model used by the Documents UI. A document is signed by everyone
 * holding any role in signable_documents.target_roles; the UI groups those
 * roles into the three audiences a school thinks in. */
export type Audience = "staff" | "parents" | "students";

export const STAFF_ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"] as const;

export const AUDIENCE_LABEL: Record<Audience, string> = { staff: "Staff", parents: "Parents", students: "Students" };

export function audienceToRoles(a: Audience[]): string[] {
  const out: string[] = [];
  if (a.includes("staff")) out.push(...STAFF_ROLES);
  if (a.includes("parents")) out.push("parent");
  if (a.includes("students")) out.push("student");
  return out;
}

export function rolesToAudience(roles: string[]): Audience[] {
  const out: Audience[] = [];
  if (roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) out.push("staff");
  if (roles.includes("parent")) out.push("parents");
  if (roles.includes("student")) out.push("students");
  return out;
}

export function audienceText(roles: string[]): string {
  const a = rolesToAudience(roles);
  return a.length ? a.map((x) => AUDIENCE_LABEL[x]).join(", ") : "Nobody";
}

/** Asks the document-sign-request Edge Function to email people. Never throws. */
export async function requestSignatures(
  documentId: string,
  opts: { userIds?: string[]; kind?: "request" | "reminder"; force?: boolean } = {},
): Promise<{ ok: boolean; sent: number; failed: number; skipped: number; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, sent: 0, failed: 0, skipped: 0, message: "Not connected." };
  try {
    const { data, error } = await supabase.functions.invoke("document-sign-request", {
      body: { document_id: documentId, user_ids: opts.userIds, kind: opts.kind ?? "reminder", force: opts.force },
    });
    if (error || !data?.ok) return { ok: false, sent: 0, failed: 0, skipped: 0, message: "Couldn't send. Only a Headteacher or Admin can, and the email service must be set up." };
    const { sent = 0, failed = 0, skipped = 0 } = data as { sent: number; failed: number; skipped: number };
    const parts = [`${sent} email${sent === 1 ? "" : "s"} sent`];
    if (skipped) parts.push(`${skipped} skipped (emailed in the last 6 hours)`);
    if (failed) parts.push(`${failed} could not be emailed (they can still sign in the portal)`);
    return { ok: true, sent, failed, skipped, message: parts.join(", ") + "." };
  } catch {
    return { ok: false, sent: 0, failed: 0, skipped: 0, message: "Couldn't send the reminder just now." };
  }
}
