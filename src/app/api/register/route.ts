import { NextResponse } from "next/server";
import { sendMail, forwardToCrm } from "@/lib/mailer";

const ADMISSIONS_EMAIL = process.env.ADMISSIONS_EMAIL || "globalacademy@tarbiyyah.co.uk";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/[\r\n]+/g, " ") : "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Honeypot: silently accept so bots don't retry, but send nothing.
  if (clean(body.company)) return NextResponse.json({ ok: true });

  const parentName = clean(body.parent_name);
  const email = clean(body.email);
  const phone = clean(body.phone);
  const yeargroup = clean(body.yeargroup);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const consent = clean(body.consent);
  const timezone = clean(body.timezone);

  const errors: string[] = [];
  if (!parentName) errors.push("parent_name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if ((phone.match(/\d/g)?.length ?? 0) < 7) errors.push("phone");
  if (!yeargroup) errors.push("yeargroup");
  if (!consent) errors.push("consent");

  if (errors.length) {
    return NextResponse.json({ ok: false, error: "validation", fields: errors }, { status: 400 });
  }

  const text = [
    `A new register-interest enquiry was submitted on Tarbiyyah Global Academy.`,
    "",
    `Parent/guardian: ${parentName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Year group: ${yeargroup}`,
    `Time zone: ${timezone || "(not detected)"}`,
    "",
    `Message: ${message || "(none)"}`,
  ].join("\n");

  const result = await sendMail({
    to: ADMISSIONS_EMAIL,
    subject: `Register interest — ${parentName} (${yeargroup})`,
    text,
    replyEmail: email,
    replyName: parentName,
  });

  await forwardToCrm({ type: "register_interest", parentName, email, phone, yeargroup, message, timezone, submittedAt: new Date().toISOString() });

  if (!result.ok) return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
