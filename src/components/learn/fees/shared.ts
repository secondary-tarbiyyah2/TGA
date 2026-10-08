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

export type PaymentMethod = "cash" | "bank_transfer" | "card";
export type ChargeStatus = "paid" | "overdue" | "outstanding" | "void";

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", bank_transfer: "Bank transfer", card: "Card" };
export const STATUS_LABEL: Record<ChargeStatus, string> = { paid: "Paid", overdue: "Overdue", outstanding: "Outstanding", void: "Void" };
export const STATUS_STYLE: Record<ChargeStatus, string> = {
  paid: "bg-green-50 text-green-800 border-green-200",
  overdue: "bg-red-50 text-red-800 border-red-200",
  outstanding: "bg-amber-50 text-amber-900 border-amber-200",
  void: "bg-cream text-ink/65 border-gold-light",
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function chargeStatus(charge: FeeCharge, paid: number): ChargeStatus {
  if (charge.voided_at) return "void";
  if (round2(charge.amount - paid) <= 0) return "paid";
  return charge.due_date < todayIso() ? "overdue" : "outstanding";
}

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}
