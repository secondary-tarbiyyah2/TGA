// Admissions email templating. PURE TypeScript with no imports and no runtime
// APIs beyond Intl, so the SAME file is used by
//   * the staff portal (imported by src/components/learn/admissions/*), for the
//     composer, the live preview in Email settings and the automatic sends, and
//   * the admissions-correspond Edge Function (Deno), which renders the stored
//     template text when an email is sent automatically.
// Keep it dependency-free.

export type TemplateKey =
  | "received"
  | "assessment_invite"
  | "interview_invite"
  | "offer"
  | "payment_received"
  | "payment_rejected"
  | "waitlist"
  | "decline"
  | "request_documents";

export const TEMPLATE_KEYS: TemplateKey[] = [
  "received",
  "assessment_invite",
  "interview_invite",
  "offer",
  "payment_received",
  "payment_rejected",
  "waitlist",
  "decline",
  "request_documents",
];

/** Keys that older messages in admissions_messages may carry (history display only). */
export const LEGACY_KEYS = ["assessment_details", "decline_waitlist", "custom"] as const;

export const TEMPLATE_LABELS: Record<string, string> = {
  received: "Application received",
  assessment_invite: "Invitation to assessment",
  interview_invite: "Interview invitation",
  offer: "Offer of a place",
  payment_received: "Payment received",
  payment_rejected: "Payment proof not accepted",
  waitlist: "Waiting list",
  decline: "Decline",
  request_documents: "Request documents",
  assessment_details: "Assessment details",
  decline_waitlist: "Decline / waitlist",
  custom: "Custom message",
  accounts: "Account details",
};

/** Never sent automatically, whatever the toggle says (sensitive; always manual with a confirmation). */
export const NEVER_AUTO: TemplateKey[] = ["decline"];

export type TemplateText = { subject: string; body: string };
export type TemplateRow = TemplateText & { key: string; auto_send: boolean };

export type TemplateVars = Record<string, string>;

// ── input shapes (structural, so the portal's own row types fit) ─────────

export type AppInput = {
  reference: string | null;
  parent_name: string;
  child_first_name: string;
  child_last_name: string;
  year_group_applying: string;
  preferred_start: string | null;
  assessment_at: string | null;
  interview_at: string | null;
  offer_deadline: string | null;
  report_received: boolean;
  id_documents_received: boolean;
};

export type SettingsInput = {
  /** 0214: public https address of the hosted online payment page; when set, it replaces payment_instructions in "How to pay". */
  online_payment_url?: string | null;
  payment_instructions: string | null;
  assessment_join_url: string | null;
  interview_join_url: string | null;
  assessment_duration_text: string | null;
  admissions_email?: string | null;
  contact_phone?: string | null;
};

export type StageInput = {
  assessment_platform: string | null;
  assessment_link: string | null;
  assessment_duration_text: string | null;
  interview_interviewer: string | null;
  interview_link: string | null;
  offer_start_date: string | null;
};

export type FeesInput = {
  applicationFee: number;
  applicationFeeReceived: boolean;
  annualFee?: number | null;
  plans: { id: string; label: string; firstPayment: number; detail: string }[];
};

export const DEFAULT_SCHOOL_EMAIL = "globalacademy@tarbiyyah.co.uk";

// ── formatting ───────────────────────────────────────────────────────────

export function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Monday 5 October 2026, 10:00 (UK time)" */
export function fmtLondonLong(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} (UK time)`;
}

/** "Mon 5 Oct, 10:00" */
export function fmtLondonShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/** "yyyy-mm-dd" -> "Monday 5 October 2026" */
export function fmtDayLong(d: string | null): string {
  if (!d) return "";
  const x = new Date(`${d}T12:00:00Z`);
  if (Number.isNaN(x.getTime())) return "";
  return x.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Today in UK time + n days, as "yyyy-mm-dd". */
/** London date `n` working days (Mon to Fri) after today, as YYYY-MM-DD. */
function londonWorkingDaysPlus(n: number, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(g("year"), g("month") - 1, g("day"), 12));
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

function upperFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ── families (several children on one application form) ─────────────────

export type FamilyInput = {
  children: { first_name: string; last_name: string; year_group: string }[];
  /** admissions_families.fee_snapshot: numbers only, an estimate shown to the family on the form. */
  snapshot?: unknown;
};

type FeeLine = { gross: number; siblingDiscount: number; net: number };
type FeeSnapshot = { plan: "annual" | "termly" | "monthly"; perChild: FeeLine[]; total: number };

const money = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1000000 ? x : null);

/** Accepts only the numeric shape the form writes; anything else is ignored (never echoed into an email). */
export function parseFeeSnapshot(raw: unknown): FeeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.perChild) || o.perChild.length < 1 || o.perChild.length > 6) return null;
  const perChild: FeeLine[] = [];
  for (const c of o.perChild as unknown[]) {
    if (!c || typeof c !== "object") return null;
    const r = c as Record<string, unknown>;
    const gross = money(r.gross);
    const siblingDiscount = money(r.siblingDiscount);
    const net = money(r.net);
    if (gross === null || siblingDiscount === null || net === null) return null;
    perChild.push({ gross, siblingDiscount, net });
  }
  const total = money(o.total);
  if (total === null) return null;
  const plan: FeeSnapshot["plan"] = o.plan === "termly" ? "termly" : o.plan === "monthly" ? "monthly" : "annual";
  return { plan, perChild, total };
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The "children and estimated fees" paragraph of the confirmation email.
 * Empty for a single child. Names and year groups come from the application
 * rows; only the amounts come from the form's snapshot.
 */
export function buildFamilyFeesText(family: FamilyInput | null | undefined): string {
  if (!family || family.children.length < 2) return "";
  const snap = parseFeeSnapshot(family.snapshot);
  const usable = snap !== null && snap.perChild.length === family.children.length ? snap : null;
  const lines: string[] = [usable ? "Children on this application and estimated annual tuition:" : "Children on this application:"];
  family.children.forEach((c, i) => {
    const name = `${c.first_name} ${c.last_name}`.trim();
    const base = `- ${name} (${c.year_group})`;
    if (!usable) return lines.push(base);
    const f = usable.perChild[i];
    if (f.gross <= 0) return lines.push(`${base}: fee to be confirmed`);
    lines.push(f.siblingDiscount > 0 ? `${base}: ${gbp(f.gross)} less ${gbp(f.siblingDiscount)} sibling discount = ${gbp(f.net)}` : `${base}: ${gbp(f.gross)}`);
  });
  if (usable) {
    const afterSibling = usable.perChild.reduce((sum, f) => sum + f.net, 0);
    const annualOff = Math.round((afterSibling - usable.total) * 100) / 100;
    if (annualOff > 0.004) lines.push(`Annual payment discount: -${gbp(annualOff)}`);
    const how = usable.plan === "annual" ? "paid in full" : usable.plan === "termly" ? "paid in 2 payments" : "paid monthly";
    lines.push(`Estimated total: ${gbp(usable.total)} (${how}).`);
    lines.push("This is an estimate only. Your offer confirms the exact fees.");
  }
  return lines.join("\n");
}

// ── context ──────────────────────────────────────────────────────────────

/**
 * Every {{token}} value for one application. Values that are genuinely unknown
 * are either given a sensible default here or left as "" (which makes
 * renderTemplate drop the line / block that uses them), so no placeholder text
 * ever reaches a family. `extra` carries event-specific values (payment_covers,
 * reject_reason, ...); empty extras are ignored.
 */
export function buildTemplateContext(
  app: AppInput,
  settings: SettingsInput | null,
  stage: StageInput | null,
  opts: { fees?: FeesInput | null; family?: FamilyInput | null; extra?: Record<string, string | null | undefined>; now?: Date } = {},
): TemplateVars {
  const now = opts.now || new Date();
  const fees = opts.fees || null;
  const child = app.child_first_name.trim();
  const parentFirst = app.parent_name.trim().split(/\s+/)[0] || app.parent_name.trim();

  const durationRaw = (stage?.assessment_duration_text || settings?.assessment_duration_text || "").trim() || "about 60 to 90 minutes";
  const assessmentLink = (stage?.assessment_link || settings?.assessment_join_url || "").trim();
  const interviewLink = (stage?.interview_link || settings?.interview_join_url || "").trim();

  // Fees are paid online (owner, 11 Nov 2026). The {{bank_details}} token keeps
  // its name so stored templates still work: it gives the online payment link
  // once one is set, and the older payment instructions only until then.
  const payOnline = onlinePaymentLink(settings?.online_payment_url, app.reference);
  const bankRaw = (settings?.payment_instructions || "").trim();
  const bank = payOnline
    ? `Pay online, by debit or credit card or straight from your bank app, on our secure payment page:\n${payOnline}`
    : bankRaw && !/^(bank transfer|online payment) details to follow\.?$/i.test(bankRaw)
      ? bankRaw
      : "Please reply to this email and we will send you a secure link to pay online.";

  const deadline = fmtDayLong(app.offer_deadline) || fmtDayLong(londonWorkingDaysPlus(5, now));

  const start = fmtDayLong(stage?.offer_start_date || null) || (app.preferred_start || "").trim() || "the start of the next term";

  const missing: string[] = [];
  if (!app.report_received) missing.push(`- ${child}'s most recent school report (PDF)`);
  if (!app.id_documents_received) missing.push(`- Proof of identity and address for ${child}: a passport or birth certificate, and a recent document showing the home address (for example a utility bill, council tax bill or bank statement), plus photo ID for a parent or guardian`);
  if (missing.length === 0) missing.push("- Any further documents we have asked for");

  const v: TemplateVars = {
    parent_name: app.parent_name.trim(),
    parent_first_name: parentFirst,
    child_first_name: child,
    child_name: `${child} ${app.child_last_name}`.trim(),
    year_group: app.year_group_applying,
    reference: app.reference || "",
    start_date: start,
    assessment_datetime: fmtLondonLong(app.assessment_at) || "to be confirmed (we will email you the date and time shortly)",
    assessment_short: fmtLondonShort(app.assessment_at),
    assessment_link: assessmentLink || "We will send the join link separately before the assessment.",
    assessment_duration: upperFirst(durationRaw),
    assessment_platform: (stage?.assessment_platform || "").trim(),
    interview_datetime: fmtLondonLong(app.interview_at) || "to be confirmed (we will email you the date and time shortly)",
    interview_link: interviewLink || "We will send the join link separately before the conversation.",
    interviewer: (stage?.interview_interviewer || "").trim(),
    interview_duration: "about 20 to 30 minutes",
    deadline,
    bank_details: bank,
    pay_online_link: payOnline,
    payment_link: app.reference ? PAYMENT_LINK_PLACEHOLDER : "",
    school_email: (settings?.admissions_email || "").trim() || DEFAULT_SCHOOL_EMAIL,
    school_phone: (settings?.contact_phone || "").trim(),
    missing_documents: missing.join("\n"),
    family_fees: "",
    application_fee: "",
    // Legacy token: there is no registration fee, so it is always empty and any
    // stored template line that still uses it is dropped when rendered.
    registration_fee: "",
    application_fee_status: "",
    annual_fee: "",
    fee_plans: "",
    amounts_due: "",
    first_payment_monthly: "",
    first_payment_termly: "",
    first_payment_annual: "",
    payment_covers: "your payment",
    payment_amount: "",
    reject_item: "it",
    reject_reason: "",
  };

  if (fees) {
    const baseDue = fees.applicationFeeReceived ? 0 : fees.applicationFee;
    v.application_fee = gbp(fees.applicationFee);
    v.application_fee_status = fees.applicationFeeReceived ? "received, thank you" : gbp(fees.applicationFee);
    v.annual_fee = fees.annualFee != null ? gbp(fees.annualFee) : "";
    v.fee_plans = fees.plans.map((p) => `    * ${p.label}: ${gbp(p.firstPayment)} (${p.detail})`).join("\n");
    v.amounts_due = fees.plans.map((p) => `- ${p.label}: ${gbp(r2(baseDue + p.firstPayment))}`).join("\n");
    for (const p of fees.plans) v[`first_payment_${p.id}`] = gbp(p.firstPayment);
  }

  if (opts.family && opts.family.children.length > 1) {
    const kids = opts.family.children;
    v.child_first_name = joinNames(kids.map((c) => c.first_name.trim()));
    v.child_name = joinNames(kids.map((c) => `${c.first_name} ${c.last_name}`.trim()));
    v.year_group = joinNames(kids.map((c) => c.year_group));
    v.family_fees = buildFamilyFeesText(opts.family);
  }

  for (const [k, val] of Object.entries(opts.extra || {})) {
    if (val !== undefined && val !== null && String(val).trim() !== "") v[k] = String(val);
  }
  return v;
}

/**
 * The family's link to the online payment page, or "" when none is set or it
 * is not https. A Stripe Payment Link (buy.stripe.com) gets the application
 * reference as client_reference_id, so a webhook can match the payment later.
 */
export function onlinePaymentLink(raw: string | null | undefined, reference: string | null): string {
  const v = (raw || "").trim();
  if (!v) return "";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "";
  }
  if (u.protocol !== "https:") return "";
  const ref = (reference || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
  if (u.hostname === "buy.stripe.com" && ref) u.searchParams.set("client_reference_id", ref);
  return u.toString();
}

/** The server swaps this for the family's personal upload link at send time. */
export const PAYMENT_LINK_PLACEHOLDER = "{{PAYMENT_LINK}}";

// ── rendering ────────────────────────────────────────────────────────────

/** Token names allowed in templates (documented in the Email settings screen). */
export const TOKEN_DOCS: { token: string; description: string }[] = [
  { token: "parent_name", description: "Parent or guardian, full name" },
  { token: "parent_first_name", description: "Parent's first name (used in the greeting)" },
  { token: "child_first_name", description: "Child's first name" },
  { token: "child_name", description: "Child's full name" },
  { token: "year_group", description: "Year group applied for" },
  { token: "reference", description: "Application reference (blank if none)" },
  { token: "start_date", description: "Offer start date, else the family's preferred start" },
  { token: "assessment_datetime", description: "Assessment date and time in UK time" },
  { token: "assessment_short", description: "Short form, e.g. Mon 5 Oct, 10:00 (blank if no date)" },
  { token: "assessment_link", description: "Assessment join link (stage link, else the default in settings)" },
  { token: "assessment_duration", description: "Assessment length wording" },
  { token: "assessment_platform", description: "Test platform (blank if none)" },
  { token: "interview_datetime", description: "Interview date and time in UK time" },
  { token: "interview_link", description: "Interview join link" },
  { token: "interviewer", description: "Interviewer (blank if none)" },
  { token: "interview_duration", description: "Interview length wording" },
  { token: "family_fees", description: "Children on a multi-child application with estimated fees and any sibling discount (blank for one child)" },
  { token: "application_fee", description: "Application / assessment fee" },
  { token: "application_fee_status", description: "The fee, or \"received, thank you\"" },
  { token: "annual_fee", description: "Annual fee for the year group (blank if no fee band)" },
  { token: "fee_plans", description: "First payment under each plan (monthly / termly / annual), one per line" },
  { token: "amounts_due", description: "Total due now under each plan, one per line" },
  { token: "first_payment_monthly", description: "First monthly instalment (also _termly, _annual)" },
  { token: "deadline", description: "Offer deadline, or five working days from today if none is set" },
  { token: "bank_details", description: "How to pay: the online payment link once it is set in Admissions settings, otherwise the payment instructions there" },
  { token: "pay_online_link", description: "The online payment link on its own (blank until it is set)" },
  { token: "payment_link", description: "The family's personal proof-of-payment upload link (issued when sent)" },
  { token: "school_email", description: "Admissions email address" },
  { token: "school_phone", description: "School phone (blank if none)" },
  { token: "missing_documents", description: "Bulleted list of documents not yet received" },
  { token: "payment_covers", description: "What a verified payment covers (payment_received)" },
  { token: "payment_amount", description: "Verified amount (payment_received; blank if none)" },
  { token: "reject_reason", description: "Reason a payment proof was not accepted (payment_rejected)" },
  { token: "reject_item", description: "Name of the rejected file (payment_rejected)" },
];

export const SAMPLE_TOKEN_VALUES_NOTE =
  "Use {{token}} for a value. A line containing a token with no value is left out. Wrap lines in {{#token}} ... {{/token}} (each marker on its own line) to show them only when the token has a value.";

export type RenderResult = { subject: string; body: string; unresolved: string[] };

function renderBlocks(text: string, vars: TemplateVars, unresolved: Set<string>): string {
  // A marker alone on its line takes its newline with it.
  const flat = text.replace(/^[ \t]*(\{\{[#/]\w+\}\})[ \t]*\r?\n/gm, "$1");
  return flat.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, k: string, inner: string) => {
    if (!(k in vars)) {
      unresolved.add(k);
      return "";
    }
    return vars[k].trim() === "" ? "" : inner;
  });
}

function renderText(text: string, vars: TemplateVars, unresolved: Set<string>, dropEmptyLines: boolean): string {
  const withBlocks = renderBlocks(text, vars, unresolved);
  const out: string[] = [];
  for (const line of withBlocks.split("\n")) {
    let empty = false;
    const rendered = line.replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
      if (!(k in vars)) {
        unresolved.add(k);
        return m;
      }
      const val = vars[k];
      if (val.trim() === "") empty = true;
      return val;
    });
    if (empty && dropEmptyLines) continue;
    out.push(rendered);
  }
  return out.join("\n");
}

/**
 * Fill a template from a context. Lines whose tokens have no value are dropped;
 * unknown tokens are left as-is and listed in `unresolved` (the composer shows
 * which). {{PAYMENT_LINK}} is deliberately not treated as unresolved: the
 * server replaces it with the family's personal link.
 */
export function renderTemplate(tpl: TemplateText, vars: TemplateVars): RenderResult {
  const unresolved = new Set<string>();
  const subject = renderText(tpl.subject, vars, unresolved, false).replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  const body = renderText(tpl.body, vars, unresolved, true).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject, body, unresolved: [...unresolved] };
}

/** {{tokens}} still present in finished text (excluding the server-side payment link placeholder). */
export function findUnresolvedTokens(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([#/]?\w+)\s*\}\}/g)) {
    if (m[1] === "PAYMENT_LINK") continue;
    found.add(m[1]);
  }
  return [...found];
}

// ── default texts (also seeded into admissions_email_templates by 0065) ──

const SIGN_OFF = `Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}`;

export const DEFAULT_TEMPLATES: Record<TemplateKey, TemplateText & { auto_send: boolean }> = {
  received: {
    auto_send: true,
    subject: "We have received {{child_first_name}}'s application - Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}} ({{year_group}}).
{{#reference}}
Your application reference is {{reference}}. Please quote it if you contact us.
{{/reference}}

{{#family_fees}}
{{family_fees}}
{{/family_fees}}

Our admissions team will review the application and contact you about the next steps, which usually begin with a short remote assessment. If you have any questions in the meantime, just reply to this email.

${SIGN_OFF}`,
  },

  assessment_invite: {
    auto_send: true,
    subject: "{{child_first_name}}'s remote assessment at Tarbiyyah Global Academy{{#assessment_short}} - {{assessment_short}}{{/assessment_short}}",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}. This email has everything you need for {{child_first_name}}'s entry assessment.

DATE AND TIME
{{assessment_datetime}}
Please join 10 minutes early. The time above is UK time.

WHAT THE ASSESSMENT IS
A remote, supervised, standardised online assessment of {{child_first_name}}'s current attainment. It helps us place your child well and plan the right support.{{#assessment_platform}} The test is delivered through {{assessment_platform}}.{{/assessment_platform}} Your application fee covers the baseline assessment and the administration review. {{child_first_name}} does not need to prepare in advance.

HOW LONG
{{assessment_duration}}, including the ID check at the start.

JOIN LINK
{{assessment_link}}

WHAT YOU NEED
- A laptop, desktop or tablet (not a phone) with a working camera and microphone, fully charged or plugged in.
- A stable internet connection. Please close other programs and apps before we start.
- A quiet, well-lit room where {{child_first_name}} will not be disturbed, with the door closed. Another adult should be nearby but must not help.
- Pencil and blank paper if needed. We will tell you if anything else is allowed.

CAMERA AND SCREEN
- {{child_first_name}}'s camera must stay on for the whole assessment, positioned so we can see {{child_first_name}}'s face, hands and the desk or workspace.
- We will ask you to share {{child_first_name}}'s screen so the invigilator can see the test.
- At the start the invigilator will ask you to slowly turn the camera around the room so we can check the space.

ID CHECK AT THE START
A parent or guardian should be present for the first few minutes. Please have photo ID for yourself and ID for {{child_first_name}} (for example a passport or birth certificate) ready to show to the camera.

RULES
- No help of any kind from anyone in the room, and no talking about the questions.
- No other devices (phones, tablets, smart watches), books, notes, calculators or websites unless we say so.
- The camera must show {{child_first_name}} and the screen/room throughout. If the connection drops, rejoin straight away using the same link.
- The invigilator may pause or stop the assessment if the rules are not followed.

WHAT HAPPENS AFTER
We mark the assessment and review it with your application. We will then contact you to arrange a short conversation with you and {{child_first_name}}, and let you know the outcome of your application.

Please reply to confirm that this time works, or to ask for another slot.

${SIGN_OFF}`,
  },

  interview_invite: {
    auto_send: true,
    subject: "Conversation with {{child_first_name}} and your family - Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for {{child_first_name}}'s assessment{{#reference}} ({{reference}}){{/reference}}. We would now like to invite you and {{child_first_name}} to a short conversation with us so we can get to know your family and answer your questions.

Date and time: {{interview_datetime}}
With: {{interviewer}}
Length: {{interview_duration}}
Join link: {{interview_link}}

Please both attend, in a quiet place with a working camera and microphone. There is nothing to prepare. We would like to hear about {{child_first_name}}'s interests and strengths, what you are looking for in a school, and anything you would like us to know. You are very welcome to bring your own questions.

Please reply to confirm that this time works.

${SIGN_OFF}`,
  },

  offer: {
    auto_send: true,
    subject: "Offer of a place for {{child_first_name}} at Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

We are delighted to offer {{child_name}} a place in {{year_group}} at Tarbiyyah Global Academy, starting {{start_date}}{{#reference}} ({{reference}}){{/reference}}. Masha'Allah, we enjoyed getting to know {{child_first_name}} and your family.

TO ACCEPT THE PLACE, PLEASE REPLY AND PAY YOUR FIRST FEE PAYMENT BY {{deadline}}
- Application / assessment fee: {{application_fee_status}}
{{#fee_plans}}
- First payment, depending on the plan you choose:
{{fee_plans}}
{{/fee_plans}}

{{#amounts_due}}
AMOUNT DUE NOW (application fee if not yet received + first payment), by plan:
{{amounts_due}}
Please choose ONE plan. The remaining instalments follow the Fees Policy payment schedule.
{{/amounts_due}}

HOW TO PAY
{{bank_details}}
Please use {{child_name}} (the child's full name) as the payment reference.

{{#payment_link}}
UPLOAD YOUR PROOF OF PAYMENT
After paying, please upload a screenshot or receipt (JPG, PNG or PDF, up to 10 MB each) using your personal secure link, and tell us which plan you chose:
{{payment_link}}
Please do not share this link. Your place is confirmed once our team has checked the payment, and we will email you when it is.
{{/payment_link}}

Your child's place is held only once the payments above have been received and verified. If we have not heard from you by the deadline, we may offer the place to another family. Please also send us ID documents for {{child_first_name}} and a parent or guardian (for example a passport or birth certificate), and proof of {{child_first_name}}'s home address (for example a recent utility bill, council tax bill or bank statement), if you have not already.

If you have any questions, just reply to this email.

${SIGN_OFF}`,
  },

  payment_received: {
    auto_send: true,
    subject: "Payment received for {{child_first_name}} - Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you. We have checked your proof of payment for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}} and it covers: {{payment_covers}}{{#payment_amount}} ({{payment_amount}}){{/payment_amount}}.

We will be in touch about the next steps. If you have any questions, just reply to this email.

${SIGN_OFF}`,
  },

  payment_rejected: {
    auto_send: true,
    subject: "Proof of payment for {{child_first_name}} - action needed",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for uploading proof of payment for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}. Unfortunately we could not accept {{reject_item}} for the following reason:

{{reject_reason}}

{{#payment_link}}
Please upload a new screenshot or receipt using your personal secure link:
{{payment_link}}
{{/payment_link}}

If you think this is a mistake, or you would like to talk it through, just reply to this email.

${SIGN_OFF}`,
  },

  waitlist: {
    auto_send: false,
    subject: "Your application for {{child_first_name}} at Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}, and for the time you and {{child_first_name}} gave us.

We do not have a place available in {{year_group}} at the moment, but we would like to keep {{child_first_name}} on our waiting list. We will contact you as soon as a place opens. Please let us know if you no longer wish to be on the list.

${SIGN_OFF}`,
  },

  decline: {
    auto_send: false,
    subject: "Your application for {{child_first_name}} at Tarbiyyah Global Academy",
    body: `Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}, and for the time you and {{child_first_name}} gave us.

After careful consideration we are unable to offer {{child_first_name}} a place at this time. This is not a reflection of {{child_first_name}}'s ability or character, and we wish your family every success.

${SIGN_OFF}`,
  },

  request_documents: {
    auto_send: false,
    subject: "Documents needed for {{child_first_name}}'s application",
    body: `Assalamu alaikum {{parent_first_name}},

To continue with {{child_first_name}}'s application{{#reference}} ({{reference}}){{/reference}}, please send us the following by {{deadline}}:
{{missing_documents}}

You can reply to this email with the documents attached.

${SIGN_OFF}`,
  },
};

/** A made-up application to preview templates against in the Email settings screen. */
export const SAMPLE_APP: AppInput = {
  reference: "TGA-2026-0042",
  parent_name: "Fatima Rahman",
  child_first_name: "Yusuf",
  child_last_name: "Rahman",
  year_group_applying: "Year 4",
  preferred_start: "January 2027",
  assessment_at: "2026-11-30T10:00:00.000Z",
  interview_at: "2026-12-03T16:30:00.000Z",
  offer_deadline: null,
  report_received: true,
  id_documents_received: false,
};

export const SAMPLE_STAGE: StageInput = {
  assessment_platform: "Testwise",
  assessment_link: "https://teams.microsoft.com/l/meetup-join/sample",
  assessment_duration_text: null,
  interview_interviewer: "Mrs Aisha Khan",
  interview_link: "https://teams.microsoft.com/l/meetup-join/sample-interview",
  offer_start_date: "2027-01-11",
};

export const SAMPLE_FEES: FeesInput = {
  applicationFee: 150,
  applicationFeeReceived: false,
  annualFee: 2130,
  plans: [
    { id: "monthly", label: "Monthly (7 instalments)", firstPayment: 304.29, detail: "first instalment £304.29 of 7, £2,130 in total" },
    { id: "termly", label: "2 payments", firstPayment: 1065, detail: "first payment £1,065 of 2, £2,130 in total" },
    { id: "annual", label: "Annual, paid in full", firstPayment: 2087.4, detail: "£2,087.40 after the £42.60 discount if paid in full by 8 January 2027" },
  ],
};

export const SAMPLE_EXTRA = {
  payment_covers: "First payment",
  payment_amount: "£304.29",
  reject_reason: "The screenshot was cropped and the amount could not be read.",
  reject_item: "the file \"receipt.png\"",
};
