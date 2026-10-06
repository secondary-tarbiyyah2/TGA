// Student sign-in with a username and no email address (migration 0082).
//
// Supabase Auth needs an email, so every username maps to a synthetic one,
// <username>@students.tarbiyyah.internal, created by the student-account /
// admissions-create-accounts Edge Functions. The sign-in page turns whatever the
// person typed into the address to authenticate with. The domain cannot receive
// mail, so a password reset by email can never reach (or hijack) a student
// account; staff or the parent reset it instead. See
// supabase/functions/_shared/studentAccount.ts for the full trade-offs.

export const STUDENT_EMAIL_DOMAIN = "students.tarbiyyah.internal";

/** True when the text is a username rather than an email address. */
export function looksLikeUsername(input: string): boolean {
  const t = input.trim();
  return t !== "" && !t.includes("@");
}

/** What to hand to Supabase Auth: an email stays as typed (lowercased), a username becomes its synthetic address. */
export function loginEmailFor(input: string): string {
  const t = input.trim().toLowerCase();
  if (!looksLikeUsername(t)) return t;
  return `${t.replace(/\s+/g, "")}@${STUDENT_EMAIL_DOMAIN}`;
}

/** True for the synthetic, mail-less address of a username login. */
export function isSyntheticStudentEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

/** The synthetic address is an implementation detail: never show it. Returns null for it. */
export function displayEmail(email: string | null | undefined): string | null {
  return !email || isSyntheticStudentEmail(email) ? null : email;
}

/** The username part of a synthetic address, or null for a real email. */
export function usernameFromEmail(email: string | null | undefined): string | null {
  return email && isSyntheticStudentEmail(email) ? email.slice(0, email.lastIndexOf("@")) : null;
}
