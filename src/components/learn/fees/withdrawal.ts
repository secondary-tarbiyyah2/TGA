// Shared bits for withdrawal notices (Fees Policy §7, Attendance Policy §10).

import { localDateKey } from "@/lib/learn/calendar";

export type Destination =
  | "another_faith_school"
  | "state_school"
  | "independent_school"
  | "boarding_school"
  | "home_education"
  | "moving_abroad"
  | "other";

export const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: "another_faith_school", label: "Another faith school" },
  { value: "state_school", label: "A state (government-funded) school" },
  { value: "independent_school", label: "Another independent or online school" },
  { value: "boarding_school", label: "A boarding school" },
  { value: "home_education", label: "Home education" },
  { value: "moving_abroad", label: "Moving abroad" },
  { value: "other", label: "Something else" },
];

export const NEEDS_SCHOOL: Destination[] = ["another_faith_school", "state_school", "independent_school", "boarding_school"];

export type NoticeStatus = "submitted" | "acknowledged" | "completed" | "cancelled";

export const NOTICE_STATUS_LABEL: Record<NoticeStatus, string> = {
  submitted: "Sent, waiting for the office",
  acknowledged: "Received by the office",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type WithdrawalNotice = {
  id: string;
  child_id: string;
  last_day: string;
  reason: string;
  destination: Destination;
  new_school_name: string | null;
  new_school_address: string | null;
  new_school_country: string | null;
  home_education_reason: string | null;
  forwarding_address: string | null;
  second_parent_name: string | null;
  second_parent_email: string | null;
  signed_name: string;
  status: NoticeStatus;
  received_on: string | null;
  eligible_to_leave_on: string | null;
  fees_outstanding: number | null;
  last_invoice_on: string | null;
  office_notes: string | null;
  created_at: string;
};

export const NOTICE_COLUMNS =
  "id, child_id, last_day, reason, destination, new_school_name, new_school_address, new_school_country, home_education_reason, forwarding_address, second_parent_name, second_parent_email, signed_name, status, received_on, eligible_to_leave_on, fees_outstanding, last_invoice_on, office_notes, created_at";

/** One half term's notice: about six weeks from the day notice is given. */
export const NOTICE_DAYS = 42;

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export function destinationLabel(d: Destination): string {
  return DESTINATIONS.find((x) => x.value === d)?.label || d;
}
