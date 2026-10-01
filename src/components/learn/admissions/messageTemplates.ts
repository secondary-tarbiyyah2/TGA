import { formatMoney, type ApplicationRow } from "@/components/admissions/applicationShared";

export type TemplateId = "assessment_invite" | "offer" | "decline_waitlist" | "request_documents" | "custom";

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  assessment_invite: "Invite to assessment",
  offer: "Offer of a place",
  decline_waitlist: "Decline / waitlist",
  request_documents: "Request documents",
  custom: "Custom message",
};

export const SELECTABLE_TEMPLATES: TemplateId[] = ["assessment_invite", "offer", "decline_waitlist", "request_documents"];

export type TemplateContext = {
  adminFee: number | null;
  deposit: number | null;
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "[date and time]";
  return new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

function fmtDate(d: string | null): string {
  if (!d) return "[deadline]";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const SIGN_OFF = "Jazakum Allahu khairan,\nAdmissions Team\nTarbiyyah Global Academy";

/** Editable starting text. Anything in [square brackets] is a gap for staff to fill in. */
export function buildTemplate(id: TemplateId, app: ApplicationRow, ctx: TemplateContext): { subject: string; body: string } {
  const child = app.child_first_name;
  const hello = `Assalamu alaikum ${app.parent_name.split(/\s+/)[0] || app.parent_name},`;
  const ref = app.reference ? ` (${app.reference})` : "";

  if (id === "assessment_invite") {
    return {
      subject: `Assessment for ${child} at Tarbiyyah Global Academy`,
      body: `${hello}

Thank you for applying to Tarbiyyah Global Academy for ${child}${ref}. We would like to invite ${child} to our entry assessment. There is no charge for the assessment.

Date and time: ${fmtDateTime(app.assessment_at)}
Format: [online, using the link below / in person at ...]. It is a GL assessment and takes about [60-90 minutes].
What to bring: [a quiet space, a computer or tablet with a camera, pencil and paper, and a drink].
Join link: [paste join link]

${child} does not need to prepare; the assessment helps us place your child well. After the assessment we will arrange a short conversation with you and ${child}.

Please reply to confirm that this time works.

${SIGN_OFF}`,
    };
  }

  if (id === "offer") {
    return {
      subject: `Offer of a place for ${child} at Tarbiyyah Global Academy`,
      body: `${hello}

We are delighted to offer ${child} a place in ${app.year_group_applying} at Tarbiyyah Global Academy${ref}. Masha'Allah, we enjoyed getting to know ${child} and your family.

To accept the place, please pay both of the following by ${fmtDate(app.offer_deadline)}:
- Admin (registration) fee: ${ctx.adminFee !== null ? formatMoney(ctx.adminFee) : "[amount]"}
- Deposit: ${ctx.deposit !== null ? formatMoney(ctx.deposit) : "[amount]"}

Payment details: [bank details or payment link].

Your child's place is held only once both payments have been received. If we have not heard from you by the deadline, we may offer the place to another family. Please also send us ID documents for ${child} and a parent or guardian (for example a passport or birth certificate).

If you have any questions, just reply to this email.

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
