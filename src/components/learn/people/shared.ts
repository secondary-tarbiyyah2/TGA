import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import type { LearnRole } from "@/lib/learn/session";
import { ui } from "@/components/learn/ui";

export type YearGroup = { id: string; name: string };
export type ClassOption = { id: string; name: string; yearGroupId: string | null };
export type ParentOption = { id: string; name: string; email: string | null };

export type Person = {
  key: string;
  profileId: string | null; // null = child record with no login yet
  childId: string | null;
  name: string;
  email: string | null;
  roles: LearnRole[];
  classScope: string | null; // class id when the role is scoped to one class
  classNames: string[];
  /** Pupil's username when they sign in without an email (the synthetic address is never exposed). */
  username: string | null;
  yearGroup: string | null;
  parentName: string | null;
  childNames: string[];
};

export type InviteResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  profileId?: string;
  isNewUser?: boolean;
  setupLink?: string;
  /** 6-digit code that goes with the setup link (for finishing on another device). */
  setupCode?: string;
  emailSent?: boolean;
};

/** learn-invite contract is unchanged: { email, fullName, role, scopeType?, scopeId? }. */
export async function invite(body: Record<string, unknown>): Promise<InviteResult> {
  return (await callEdgeFunction("learn-invite", body)) as InviteResult;
}

export function friendlyError(result: InviteResult): string {
  if (result.error === "head_teacher_required") return "Only a Headteacher can add or re-invite a Headteacher or Admin.";
  if (result.error === "missing_or_invalid_fields") return "Please check the name and email address.";
  if (result.error === "forbidden") return "Only a Headteacher or Admin account can add people. Sign in with one of those accounts, or ask the Headteacher to add them.";
  const base = edgeErrorMessage(result);
  const code = result.error && !base.includes(result.error) ? ` (${result.error}${result.detail ? `: ${result.detail}` : ""})` : "";
  return `${base}${code}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** User-facing word is "Headteacher"; role id stays head_teacher. */
export const CHIP_STYLES: Record<LearnRole, string> = {
  head_teacher: "bg-gold-100 text-gold-900",
  admin: "bg-gold-100 text-gold-900",
  admissions: "bg-gold-100 text-gold-900",
  teacher: "bg-teal-100 text-teal-900",
  teaching_assistant_cover: "bg-teal-100 text-teal-900",
  parent: "bg-cream text-ink/75",
  student: "bg-cream text-ink/75",
};

export const ROLE_PRIORITY: LearnRole[] = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"];

/** The portal's one input style (see ui.tsx). */
export const INPUT_CLASS = ui.input;

/** The portal's primary button (see ui.tsx). */
export const GOLD_BUTTON = ui.btnPrimary;
