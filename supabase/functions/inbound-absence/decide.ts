// The confidence gate: combines the deterministic parse with the optional
// model extraction and decides whether the absence can be recorded
// automatically or must be checked by staff.
//
// Rules:
//   * Children must be resolved by the rules to the sender's own children.
//     The model can never add a child: its names are matched against the
//     family's real children, and anything that doesn't match, or that
//     disagrees with the rules, sends the email to review.
//   * Dates must be valid school days within -14..+60 days of today, and the
//     model (if used) must agree with the rules.
//   * A reason category must be set. The model may supply one the rules
//     missed; if both give a different specific category, review.
//   * Any flag from the rules (ambiguous child, unknown name, "next Friday",
//     US-style date, correction, ...) means review.

import { addDays, diffDays, isSchoolDay, isValidKey, nextSchoolDay, ukNow } from "./dates.ts";
import { REASON_CATEGORIES, nameKey, type ChildRef, type DateRange, type ParseResult, type ReasonCategory } from "./parse.ts";

export type ModelResult = {
  childNames: string[];
  allChildren: boolean;
  ranges: DateRange[];
  category: ReasonCategory | null;
  gist: string;
  needsHuman: boolean;
  confidence: "high" | "medium" | "low";
};

export type Decision = {
  status: "recorded" | "needs_review";
  childIds: string[];
  ranges: DateRange[];
  category: ReasonCategory | null;
  gist: string;
  /** Why it needs review (empty when recorded). */
  reasons: string[];
  usedModel: boolean;
};

/** Window an absence may fall in, relative to the UK date the email arrived. */
export const WINDOW_PAST_DAYS = 14;
export const WINDOW_FUTURE_DAYS = 60;

function canon(ranges: DateRange[]): string {
  const merged: DateRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
    const last = merged[merged.length - 1];
    if (last && (r.from <= addDays(last.to, 1) || (!isSchoolDay(addDays(last.to, 1)) && r.from <= nextSchoolDay(last.to)))) {
      if (r.to > last.to) last.to = r.to;
    } else merged.push({ ...r });
  }
  return merged.map((r) => `${r.from}..${r.to}`).join(",");
}

/** Maps a model-supplied name to exactly one of the family's children, or null. */
export function childForName(name: string, children: ChildRef[]): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const full = children.filter((c) => c.name.trim().toLowerCase() === n);
  if (full.length === 1) return full[0].id;
  const first = children.filter((c) => c.name.trim().toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0] && n.split(/\s+/).length === 1);
  if (first.length === 1) return first[0].id;
  const key = children.filter((c) => nameKey(c.name.split(/\s+/)[0]) === nameKey(n.split(/\s+/)[0]));
  if (key.length === 1 && n.split(/\s+/).length <= 2) return key[0].id;
  return null;
}

export function sanitiseGist(s: string): string {
  let g = (s || "").replace(/[—–]/g, ",").replace(/\s*,\s*,/g, ",").replace(/\s+/g, " ").trim();
  if (g.length > 200) g = `${g.slice(0, 197).replace(/\s+\S*$/, "")}...`;
  return g;
}

export function decide(det: ParseResult, model: ModelResult | null, children: ChildRef[], receivedAt: Date): Decision {
  const reasons = [...det.flags];
  const { today } = ukNow(receivedAt);
  let category = det.category;
  let gist = det.gist;
  const ownIds = new Set(children.map((c) => c.id));

  if (model) {
    // Children: validate every name against the family's real children.
    const modelIds = new Set<string>();
    if (model.allChildren) children.forEach((c) => modelIds.add(c.id));
    for (const name of model.childNames) {
      const id = childForName(name, children);
      if (id) modelIds.add(id);
      else reasons.push("model_unknown_child");
    }
    if (modelIds.size && det.childIds.length && canonIds(modelIds) !== canonIds(new Set(det.childIds))) reasons.push("model_disagrees_children");

    // Dates: must be real dates in the window, and agree with the rules.
    const valid = model.ranges.every((r) => isValidKey(r.from) && isValidKey(r.to) && r.from <= r.to);
    if (!valid) reasons.push("model_invalid_dates");
    else if (model.ranges.some((r) => diffDays(today, r.from) < -WINDOW_PAST_DAYS || diffDays(today, r.to) > WINDOW_FUTURE_DAYS)) reasons.push("date_out_of_window");
    else if (model.ranges.length && det.ranges.length && canon(model.ranges) !== canon(det.ranges)) reasons.push("model_disagrees_dates");

    // Reason: the model may fill a gap; a real disagreement goes to review.
    const mc = model.category && (REASON_CATEGORIES as readonly string[]).includes(model.category) ? model.category : null;
    if (mc && !det.category) {
      category = mc;
      const i = reasons.indexOf("no_reason");
      if (i >= 0) reasons.splice(i, 1);
    } else if (mc && det.category && mc !== det.category) {
      if (det.category === "Other") category = mc;
      else if (mc !== "Other") reasons.push("model_disagrees_reason");
    }
    if (model.gist && model.gist.trim()) gist = model.gist;
    if (model.needsHuman || model.confidence === "low") reasons.push("model_unsure");
  }

  const childIds = det.childIds.filter((id) => ownIds.has(id));
  if (!childIds.length && !reasons.some((r) => r.startsWith("children_"))) reasons.push("children_unknown");
  if (!det.ranges.length && !reasons.includes("no_dates") && !reasons.includes("non_school_day")) reasons.push("no_dates");
  for (const r of det.ranges) {
    if (diffDays(today, r.from) < -WINDOW_PAST_DAYS || diffDays(today, r.to) > WINDOW_FUTURE_DAYS) reasons.push("date_out_of_window");
  }
  if (!category && !reasons.includes("no_reason")) reasons.push("no_reason");

  const unique = [...new Set(reasons)];
  return {
    status: unique.length === 0 ? "recorded" : "needs_review",
    childIds,
    ranges: det.ranges,
    category,
    gist: sanitiseGist(gist || category || ""),
    reasons: unique,
    usedModel: !!model,
  };
}

function canonIds(s: Set<string>): string {
  return [...s].sort().join(",");
}

/** Plain-English wording of each review reason, for staff. Kept in step with the portal's copy. */
export const REASON_TEXT: Record<string, string> = {
  children_ambiguous: "Not clear which child",
  children_unknown: "No child named",
  children_conflict: "Says all children but names only some",
  unknown_name: "Names someone who isn't one of this family's children",
  next_weekday_ambiguous: '"Next [day]" could mean this week or next',
  us_date_order: "Date looks like US order (month/day)",
  invalid_date: "Contains a date that doesn't exist",
  weekday_date_mismatch: "Weekday and date don't match",
  date_out_of_window: "Date is more than 2 weeks ago or 2 months ahead",
  too_long: "Very long absence",
  non_school_day: "Only mentions a weekend day",
  past_absence_no_date_at_weekend: "Past absence with no date, sent at the weekend",
  open_ended: "No end date given",
  vague_duration: 'Vague length ("a few days")',
  return_before_start: "Return date is before the absence starts",
  no_dates: "No dates found",
  no_reason: "No reason found",
  correction_or_cancellation: "Looks like a correction or cancellation",
  model_unknown_child: "AI reader named a child not in this family",
  model_disagrees_children: "AI reader and rules disagree on the child",
  model_disagrees_dates: "AI reader and rules disagree on the dates",
  model_disagrees_reason: "AI reader and rules disagree on the reason",
  model_invalid_dates: "AI reader gave invalid dates",
  model_unsure: "AI reader was unsure",
  unknown_sender: "Sender's address isn't registered",
  sender_not_verified: "Sender couldn't be verified (possible spoofing)",
  auto_reply: "Automatic reply or bulk mail",
  duplicate: "Already recorded",
};
