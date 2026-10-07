// Password rules and plain-English error messages shared by every
// password flow (invite setup, change-password, forgot/reset, account).

export const MIN_PASSWORD_LENGTH = 8;

const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890", "qwerty123",
  "qwertyuiop", "iloveyou", "letmein1", "welcome1", "welcome123", "admin123", "abc12345", "11111111",
  "00000000", "bismillah", "bismillah1", "muhammad1", "allahuakbar", "tarbiyyah", "tarbiyyah1", "tarbiyyah123",
]);

export type PasswordCheck = { id: string; label: string; ok: boolean };

/** Live checklist shown under the password box. */
export function passwordChecks(password: string, confirm?: string): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { id: "letter", label: "At least one letter", ok: /[A-Za-z]/.test(password) },
    { id: "number", label: "At least one number", ok: /[0-9]/.test(password) },
    { id: "common", label: "Not a very common password", ok: password.length === 0 ? false : !COMMON.has(password.toLowerCase()) },
  ];
  if (confirm !== undefined) {
    checks.push({ id: "match", label: "Both boxes match", ok: password.length > 0 && password === confirm });
  }
  return checks;
}

/** The first unmet requirement as a sentence, or null when the password is acceptable. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length === 0) return "Enter a new password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    const more = MIN_PASSWORD_LENGTH - password.length;
    return `Your password is too short. It needs at least ${MIN_PASSWORD_LENGTH} characters (add ${more} more).`;
  }
  if (!/[A-Za-z]/.test(password)) return "Your password needs at least one letter, not just numbers or symbols.";
  if (!/[0-9]/.test(password)) return "Your password needs at least one number.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common and easy to guess. Choose something less obvious.";
  if (confirm !== undefined && password !== confirm) return "The two passwords don't match. Type the same password in both boxes.";
  return null;
}

type AuthLike = { message?: string; code?: string; status?: number; name?: string; reasons?: string[] };

export type PasswordErrorContext = "set" | "change" | "reset" | "request";

/** Turns a Supabase auth error (or a thrown network error) into a specific, friendly reason. */
export function friendlyPasswordError(err: unknown, context: PasswordErrorContext = "change"): string {
  const e = (err && typeof err === "object" ? err : {}) as AuthLike;
  const code = (e.code || "").toLowerCase();
  const msg = (e.message || (typeof err === "string" ? err : "")).toLowerCase();
  const status = e.status;
  const linkWord = context === "set" ? "setup link" : "reset link";
  const newLink =
    context === "set" ? "Ask the person who set up your account to send you a new link." : "Request a new link from the \"Forgotten your password?\" page.";

  if (code === "weak_password" || msg.includes("weak") || msg.includes("password should") || msg.includes("password is too")) {
    const reasons = e.reasons || [];
    const parts: string[] = [];
    if (reasons.includes("length")) parts.push(`it is too short (at least ${MIN_PASSWORD_LENGTH} characters)`);
    if (reasons.includes("characters")) parts.push("it needs a mix of lower-case letters, upper-case letters and numbers");
    if (reasons.includes("pwned")) parts.push("it has appeared in a known data breach, so it is not safe to use");
    if (parts.length) return `That password was rejected because ${parts.join(" and ")}. Please choose a different one.`;
    return "That password was rejected as too weak or too easy to guess. Try a longer one that mixes letters and numbers.";
  }
  if (code === "same_password" || msg.includes("different from the old password") || msg.includes("same as the old")) {
    return "Your new password is the same as your current one. Choose a different password.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return context === "request"
      ? "Too many reset emails have been requested. Please wait a few minutes (or check your inbox and spam folder for the one already sent), then try again."
      : "Too many attempts in a short time. Please wait a few minutes and try again.";
  }
  if (code === "otp_expired" || code === "flow_state_expired" || msg.includes("expired")) {
    return `This ${linkWord} has expired. ${newLink}`;
  }
  if (code === "flow_state_not_found" || code === "otp_disabled" || msg.includes("already been used") || msg.includes("has already") || msg.includes("invalid or has expired") || msg.includes("token has expired or is invalid")) {
    return `This ${linkWord} is no longer valid. It may have been used already. ${newLink}`;
  }
  if (code === "session_not_found" || code === "session_expired" || code === "bad_jwt" || code === "no_authorization" || code === "refresh_token_not_found" || msg.includes("session missing") || msg.includes("jwt") || status === 401) {
    return context === "change"
      ? "You have been signed out, so the password could not be changed. Sign in again and retry."
      : `Your ${linkWord} session has ended. ${newLink}`;
  }
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") {
    return "For security you need to sign in again before changing your password. Sign out, sign in, then try again.";
  }
  if (code === "user_not_found") return "We could not find your account. It may have been removed; contact the school office.";
  if (code === "user_banned") return "This account is currently disabled. Contact the school office.";
  if (code === "validation_failed" || code === "email_address_invalid" || msg.includes("invalid email") || msg.includes("unable to validate email")) {
    return "That email address does not look right. Check it for typos and try again.";
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") return "Email sign-in is switched off for now. Contact the school office.";
  if (
    code === "unexpected_failure" ||
    (typeof status === "number" && status >= 500) ||
    msg.includes("database error")
  ) {
    return "Our service had a problem saving your password (it was not changed). Wait a minute and try again; if it keeps happening, contact the school office.";
  }
  if (
    e.name === "AuthRetryableFetchError" ||
    status === 0 ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("fetch")
  ) {
    return "Could not reach the server. Check your internet connection and try again. Your password has not been changed.";
  }
  // Unknown error: still say what the service told us, in plain words.
  const raw = (e.message || "").trim();
  return raw
    ? `The password was not changed. The service said: "${raw.replace(/\.$/, "")}". Please try a different password, or contact the school office if this repeats.`
    : "The password was not changed and the service gave no reason. Check your connection, try again, or contact the school office.";
}
