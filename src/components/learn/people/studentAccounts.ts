import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";

/** A username and temporary password, shown ONCE on screen to whoever created or reset it. Never stored client-side. */
export type IssuedCredentials = {
  key: string;
  childName: string;
  username: string;
  password: string;
  parentEmail?: string;
  emailSent: boolean;
  emailError?: string;
  kind: "new" | "reset";
};

export type CredentialsOutcome = { ok: true; creds: IssuedCredentials } | { ok: false; text: string };

const ERRORS: Record<string, string> = {
  login_exists: "This pupil already has a username login. Use Reset password if they have forgotten it.",
  already_has_email_login: "This pupil already signs in with an email address.",
  no_username_login: "This pupil has no username login yet.",
  child_not_found: "That pupil could not be found.",
  forbidden: "Your account isn't allowed to do this.",
};

/** student-account Edge Function: create a username login for a child, or reset its password. Emails the parent. */
export async function studentAccountAction(action: "create" | "reset", childId: string, childName: string): Promise<CredentialsOutcome> {
  const r = await callEdgeFunction("student-account", { action, childId });
  if (!r.ok) return { ok: false, text: (r.error && ERRORS[r.error]) || edgeErrorMessage(r) };
  return {
    ok: true,
    creds: {
      key: `${childId}-${Date.now()}`,
      childName,
      username: String(r.username || ""),
      password: String(r.password || ""),
      parentEmail: typeof r.parentEmail === "string" ? r.parentEmail : undefined,
      emailSent: r.emailSent === true,
      emailError: typeof r.emailError === "string" ? r.emailError : undefined,
      kind: action === "create" ? "new" : "reset",
    },
  };
}
