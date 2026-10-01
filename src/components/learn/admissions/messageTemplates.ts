import { formatMoney, type ApplicationRow } from "@/components/admissions/applicationShared";
import { gbp, type FeeSummary } from "@/components/learn/admissions/paymentCalc";
import { fmtDay, fmtLondon, type AdmissionsSettings, type StageDetails } from "@/components/learn/admissions/stageTypes";

/** The edge function swaps this token for the family's personal upload link when it sends. */
export const PAYMENT_LINK_TOKEN = "{{PAYMENT_LINK}}";

export type TemplateId =
  | "assessment_invite"
  | "assessment_details"
  | "interview_invite"
  | "offer"
  | "decline_waitlist"
  | "request_documents"
  | "payment_rejected"
  | "custom";

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  assessment_invite: "Invite to assessment",
  assessment_details: "Assessment details",
  interview_invite: "Interview invitation",
  offer: "Offer of a place",
  decline_waitlist: "Decline / waitlist",
  request_documents: "Request documents",
  payment_rejected: "Payment proof not accepted",
  custom: "Custom message",
};

export const SELECTABLE_TEMPLATES: TemplateId[] = ["assessment_details", "interview_invite", "offer", "decline_waitlist", "request_documents"];

export type TemplateContext = {
  adminFee: number | null;
  deposit: number | null;
  /** Optional richer context (assessment / interview / offer emails). Without it, gaps are left in [brackets]. */
  details?: StageDetails | null;
  settings?: AdmissionsSettings | null;
  fees?: FeeSummary | null;
  /** payment_rejected only */
  rejectReason?: string;
  rejectItem?: string;
};

function fmtDate(d: string | null): string {
  return d ? fmtDay(d) : "[deadline]";
}

const SIGN_OFF = "Jazakum Allahu khairan,\nAdmissions Team\nTarbiyyah Global Academy";

/** Editable starting text. Anything in [square brackets] is a gap for staff to fill in. */
export function buildTemplate(id: TemplateId, app: ApplicationRow, ctx: TemplateContext): { subject: string; body: string } {
  const child = app.child_first_name;
  const childFull = `${app.child_first_name} ${app.child_last_name}`.trim();
  const hello = `Assalamu alaikum ${app.parent_name.split(/\s+/)[0] || app.parent_name},`;
  const ref = app.reference ? ` (${app.reference})` : "";
  const d = ctx.details || null;
  const st = ctx.settings || null;

  if (id === "assessment_invite" || id === "assessment_details") {
    const link = d?.assessment_link || st?.assessment_join_url || "";
    const duration = d?.assessment_duration_text || st?.assessment_duration_text || "about 60 to 90 minutes";
    const platform = d?.assessment_platform ? ` The test is delivered through ${d.assessment_platform}.` : "";
    return {
      subject: `${child}'s remote assessment at Tarbiyyah Global Academy${app.assessment_at ? ` - ${fmtLondon(app.assessment_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`,
      body: `${hello}

Thank you for applying to Tarbiyyah Global Academy for ${child}${ref}. This email has everything you need for ${child}'s entry assessment.

DATE AND TIME
${app.assessment_at ? fmtLondon(app.assessment_at) : "[date and time, UK time]"}
Please join 10 minutes early. The time above is UK time.

WHAT THE ASSESSMENT IS
A remote, supervised, standardised online assessment of ${child}'s current attainment. It helps us place your child well and plan the right support.${platform} Your application fee covers the baseline assessment and the administration review. ${child} does not need to prepare in advance.

HOW LONG
${duration[0].toUpperCase() + duration.slice(1)}, including the ID check at the start.

JOIN LINK
${link || "[paste join link]"}

WHAT YOU NEED
- A laptop, desktop or tablet (not a phone) with a working camera and microphone, fully charged or plugged in.
- A stable internet connection. Please close other programs and apps before we start.
- A quiet, well-lit room where ${child} will not be disturbed, with the door closed. Another adult should be nearby but must not help.
- Pencil and blank paper if needed. We will tell you if anything else is allowed.

CAMERA AND SCREEN
- ${child}'s camera must stay on for the whole assessment, positioned so we can see ${child}'s face, hands and the desk or workspace.
- We will ask you to share ${child}'s screen so the invigilator can see the test.
- At the start the invigilator will ask you to slowly turn the camera around the room so we can check the space.

ID CHECK AT THE START
A parent or guardian should be present for the first few minutes. Please have photo ID for yourself and ID for ${child} (for example a passport or birth certificate) ready to show to the camera.

RULES
- No help of any kind from anyone in the room, and no talking about the questions.
- No other devices (phones, tablets, smart watches), books, notes, calculators or websites unless we say so.
- The camera must show ${child} and the screen/room throughout. If the connection drops, rejoin straight away using the same link.
- The invigilator may pause or stop the assessment if the rules are not followed.

WHAT HAPPENS AFTER
We mark the assessment and review it with your application. We will then contact you to arrange a short conversation with you and ${child}, and let you know the outcome of your application.

Please reply to confirm that this time works, or to ask for another slot.

${SIGN_OFF}`,
    };
  }

  if (id === "interview_invite") {
    const link = d?.interview_link || st?.interview_join_url || "";
    return {
      subject: `Conversation with ${child} and your family - Tarbiyyah Global Academy`,
      body: `${hello}

Thank you for ${child}'s assessment${ref}. We would now like to invite you and ${child} to a short conversation with us so we can get to know your family and answer your questions.

Date and time: ${app.interview_at ? fmtLondon(app.interview_at) : "[date and time, UK time]"}
With: ${d?.interview_interviewer || "[interviewer]"}
Length: about 20 to 30 minutes
Join link: ${link || "[paste join link]"}

Please both attend, in a quiet place with a working camera and microphone. There is nothing to prepare. We would like to hear about ${child}'s interests and strengths, what you are looking for in a school, and anything you would like us to know. You are very welcome to bring your own questions.

Please reply to confirm that this time works.

${SIGN_OFF}`,
    };
  }

  if (id === "offer") {
    const fees = ctx.fees || null;
    const start = d?.offer_start_date ? fmtDay(d.offer_start_date) : app.preferred_start || "[start date]";
    const instructions = (st?.payment_instructions || "").trim() || "[bank details]";
    const lines: string[] = [];
    if (fees) {
      lines.push(
        fees.applicationFeeReceived
          ? `- Application / assessment fee: received, thank you`
          : `- Application / assessment fee: ${gbp(fees.applicationFee)}`,
      );
      lines.push(`- Registration fee: ${gbp(fees.registrationFee)}`);
      lines.push(`- First payment, depending on the plan you choose:`);
      if (fees.plans.length === 0) lines.push(`    [first payment amounts]`);
      for (const p of fees.plans) lines.push(`    * ${p.label}: ${gbp(p.firstPayment)} (${p.detail})`);
    } else {
      lines.push(`- Application / assessment fee: [amount]`, `- Registration fee: ${ctx.adminFee !== null ? formatMoney(ctx.adminFee) : "[amount]"}`, `- First payment: [amount for your chosen plan]`);
    }
    const totals: string[] = [];
    if (fees && fees.plans.length) {
      const base = (fees.applicationFeeReceived ? 0 : fees.applicationFee) + fees.registrationFee;
      for (const p of fees.plans) totals.push(`- ${p.label}: ${gbp(Math.round((base + p.firstPayment) * 100) / 100)}`);
    }
    return {
      subject: `Offer of a place for ${child} at Tarbiyyah Global Academy`,
      body: `${hello}

We are delighted to offer ${childFull} a place in ${app.year_group_applying} at Tarbiyyah Global Academy, starting ${start}${ref}. Masha'Allah, we enjoyed getting to know ${child} and your family.

TO ACCEPT THE PLACE, PLEASE PAY BY ${fmtDate(app.offer_deadline).toUpperCase()}
${lines.join("\n")}
${totals.length ? `\nAMOUNT DUE NOW (application fee if not yet received + registration fee + first payment), by plan:\n${totals.join("\n")}\nPlease choose ONE plan. The remaining instalments follow the Fees Policy payment schedule.\n` : ""}
HOW TO PAY
${instructions}
Please use ${childFull} (the child's full name) as the payment reference.

UPLOAD YOUR PROOF OF PAYMENT
After paying, please upload a screenshot or receipt (JPG, PNG or PDF, up to 10 MB each) using your personal secure link, and tell us which plan you chose:
${PAYMENT_LINK_TOKEN}
Please do not share this link. Your place is confirmed once our team has checked the payment, and we will email you when it is.

Your child's place is held only once the payments above have been received and verified. If we have not heard from you by the deadline, we may offer the place to another family. Please also send us ID documents for ${child} and a parent or guardian (for example a passport or birth certificate) if you have not already.

If you have any questions, just reply to this email.

${SIGN_OFF}`,
    };
  }

  if (id === "payment_rejected") {
    return {
      subject: `Proof of payment for ${child} - action needed`,
      body: `${hello}

Thank you for uploading proof of payment for ${child}${ref}. Unfortunately we could not accept ${ctx.rejectItem ? `the file "${ctx.rejectItem}"` : "it"} for the following reason:

${ctx.rejectReason || "[reason]"}

Please upload a new screenshot or receipt using your personal secure link:
${PAYMENT_LINK_TOKEN}

If you think this is a mistake, or you would like to talk it through, just reply to this email.

${SIGN_OFF}`,
    };
  }

  if (id === "decline_waitlist") {
    return {
      subject: `Your application for ${child} at Tarbiyyah Global Academy`,
      body: `${hello}

Thank you for applying to Tarbiyyah Global Academy for ${child}${ref}, and for the time you and ${child} gave us.

[Choose one and delete the other]

Waitlist: We do not have a place available in ${app.year_group_applying} at the moment, but we would like to keep ${child} on our waiting list. We will contact you as soon as a place opens. Please let us know if you no longer wish to be on the list.

Decline: After careful consideration we are unable to offer ${child} a place at this time. This is not a reflection of ${child}'s ability or character, and we wish your family every success.

${SIGN_OFF}`,
    };
  }

  if (id === "request_documents") {
    return {
      subject: `Documents needed for ${child}'s application`,
      body: `${hello}

To continue with ${child}'s application${ref}, please send us the following by [date]:
${app.report_received ? "" : `- ${child}'s most recent school report (PDF)\n`}${app.id_documents_received ? "" : `- ID documents: a passport or birth certificate for ${child}, and photo ID for a parent or guardian\n`}- [anything else]

You can reply to this email with the documents attached.

${SIGN_OFF}`,
    };
  }

  return { subject: "", body: `${hello}\n\n\n\n${SIGN_OFF}` };
}
