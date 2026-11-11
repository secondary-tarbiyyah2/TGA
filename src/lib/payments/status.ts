import type { StatusKind } from "@/components/learn/ui";

/** A charge's status as stored in fee_charges.status (migration 0217). */
export type ChargeState = "due" | "overdue" | "processing" | "paid" | "part_paid" | "failed" | "refunded" | "waived" | "void";

export const CHARGE_STATES: ChargeState[] = ["due", "overdue", "processing", "paid", "part_paid", "failed", "refunded", "waived", "void"];

/** The word and the dot for each status (DESIGN.md status language). */
export const CHARGE_STATUS: Record<ChargeState, { label: string; kind: StatusKind }> = {
  due: { label: "Due", kind: "pending" },
  overdue: { label: "Overdue", kind: "overdue" },
  processing: { label: "Processing", kind: "in_progress" },
  paid: { label: "Paid", kind: "completed" },
  part_paid: { label: "Part paid", kind: "attention" },
  failed: { label: "Payment failed", kind: "attention" },
  refunded: { label: "Refunded", kind: "unavailable" },
  waived: { label: "Waived", kind: "approved" },
  void: { label: "Cancelled", kind: "unavailable" },
};

/** Charges a family can pay now. */
export const PAYABLE_STATES: ChargeState[] = ["due", "overdue", "part_paid", "failed"];

/** The status to show today: a "due" charge past its date reads as overdue even before the nightly update. */
export function effectiveState(status: string, dueDate: string, today: string): ChargeState {
  const s = (CHARGE_STATES as string[]).includes(status) ? (status as ChargeState) : "due";
  return s === "due" && dueDate < today ? "overdue" : s;
}

export const METHOD_TYPE_LABEL: Record<string, string> = {
  pay_by_bank: "Pay by Bank",
  card: "Card",
  bacs_debit: "Direct Debit",
  link: "Link",
  other: "Online",
};

export const KIND_LABEL: Record<string, string> = {
  application_fee: "Application fee",
  first_payment: "First payment",
  instalment: "Instalment",
  adjustment: "Adjustment",
  other: "Other",
};

export const PLAN_LABEL: Record<string, string> = { annual: "Paid in full", termly: "Two payments", monthly: "Monthly" };
