import { ukToday } from "@/lib/learn/ukTime";

export type FeeCharge = {
  id: string;
  parent_user_id: string;
  child_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  voided_at: string | null;
  created_at: string;
};

export type FeePayment = {
  id: string;
  charge_id: string;
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  reference: string | null;
  created_at: string;
};

/** 'bank_transfer' stays only so payments recorded before 11 Nov 2026 still show (migration 0214). */
export type PaymentMethod = "online" | "card" | "cash" | "bank_transfer";
export type ChargeStatus = "paid" | "overdue" | "outstanding" | "void";

export const METHOD_LABEL: Record<PaymentMethod, string> = { online: "Online payment", card: "Card", cash: "Cash", bank_transfer: "Bank transfer" };
/** Methods offered when staff record a new payment. Fees are paid online (owner, 11 Nov 2026); bank transfer is no longer offered. */
export const RECORDABLE_METHODS: PaymentMethod[] = ["online", "card", "cash"];
export const STATUS_LABEL: Record<ChargeStatus, string> = { paid: "Paid", overdue: "Overdue", outstanding: "Outstanding", void: "Void" };
export const STATUS_STYLE: Record<ChargeStatus, string> = {
  paid: "bg-green-50 text-green-800 border-green-200",
  overdue: "bg-red-50 text-red-800 border-red-200",
  outstanding: "bg-amber-50 text-amber-900 border-amber-200",
  void: "bg-cream text-ink/65 border-gold-light",
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** "£1,596.00", "1596", " 50 " -> pounds as a number (NaN when it isn't one). */
export function parsePounds(text: string): number {
  const cleaned = text.replace(/[£,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}
// UK date (the school's calendar), not UTC: between midnight and 1am BST the
// UTC date is still yesterday, which made due-today charges flip early/late.
export const todayIso = (): string => ukToday();

export function chargeStatus(charge: FeeCharge, paid: number): ChargeStatus {
  if (charge.voided_at) return "void";
  if (round2(charge.amount - paid) <= 0) return "paid";
  return charge.due_date < todayIso() ? "overdue" : "outstanding";
}

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One CSV cell. A leading = + @ (or - before a non-digit) is defused so a spreadsheet never runs a name as a formula. */
export function csvEscape(v: string | number): string {
  let s = String(v);
  if (/^[=+@\t\r]/.test(s) || /^-(?![\d.])/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
