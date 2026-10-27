import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import type { IssuedCredentials } from "@/components/learn/people/studentAccounts";

export type AccountsResult = {
  ok: boolean;
  /** Plain-English summary lines (what was created, what already existed, what failed). */
  notes: string[];
  parentProfileId?: string;
  childId?: string;
  studentProfileId?: string;
  /** Present only when a username and temporary password were just generated. Show once. */
  credentials?: IssuedCredentials;
  /** Present only when the parent's setup email could not be sent. */
  setupLink?: string;
  setupCode?: string;
  parentEmail?: string;
  emailSent: boolean;
  emailError?: string;
};

const ERRORS: Record<string, string> = {
  not_accepted: "The application has to be in Accepted before accounts are created.",
  application_not_found: "That application could not be found.",
  forbidden: "Your account isn't allowed to create accounts.",
};

/**
 * admissions-create-accounts: creates the parent account (setup link emailed), the
 * pupil record, optional class enrolments and an optional username login, then
 * emails the parent. Idempotent. Never throws.
 */
export async function createAccountsFor(
  app: { id: string; child_first_name: string; child_last_name: string },
  opts: { resend?: boolean; classIds?: string[]; createStudentLogin?: boolean; yearGroupId?: string | null } = {},
): Promise<AccountsResult> {
  const body: Record<string, unknown> = { applicationId: app.id };
  if (opts.resend) body.resend = true;
  if (opts.classIds) body.classIds = opts.classIds;
  if (typeof opts.createStudentLogin === "boolean") body.createStudentLogin = opts.createStudentLogin;
  if (opts.yearGroupId) body.yearGroupId = opts.yearGroupId;
  const r = await callEdgeFunction("admissions-create-accounts", body);
  if (!r.ok) {
    const msg = (r.error && ERRORS[r.error]) || edgeErrorMessage(r);
    return { ok: false, notes: [msg], emailSent: false };
  }
  const parent = (r.parent || {}) as { profileId?: string; email?: string; setupLink?: string; setupCode?: string };
  const student = (r.student || null) as { profileId?: string; username?: string; password?: string } | null;
  const childName = `${app.child_first_name} ${app.child_last_name}`.trim();
  const emailSent = r.emailSent === true;
  const emailError = typeof r.emailError === "string" ? r.emailError : undefined;
  return {
    ok: true,
    notes: Array.isArray(r.notes) ? (r.notes as unknown[]).map(String) : [],
    parentProfileId: parent.profileId,
    childId: typeof r.childId === "string" ? r.childId : undefined,
    studentProfileId: student?.profileId,
    credentials:
      student?.username && student.password
        ? { key: `${app.id}-${Date.now()}`, childName, username: student.username, password: student.password, parentEmail: parent.email, emailSent, emailError, kind: "new" }
        : undefined,
    setupLink: parent.setupLink,
    setupCode: parent.setupCode,
    parentEmail: parent.email,
    emailSent,
    emailError,
  };
}
