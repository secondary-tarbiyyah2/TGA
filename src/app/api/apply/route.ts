import { NextResponse } from "next/server";
import { sendMail, forwardToCrm } from "@/lib/mailer";

const ADMISSIONS_EMAIL = process.env.ADMISSIONS_EMAIL || "globalacademy@tarbiyyah.co.uk";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/[\r\n]+/g, " ") : "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const parentName = clean(body.parent_name);
  const email = clean(body.email);
  const phone = clean(body.phone);
  const country = clean(body.country);
  const childName = clean(body.child_name);
  const yeargroup = clean(body.yeargroup);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const consent = clean(body.consent);

  const errors: string[] = [];
  if (!parentName) errors.push("parent_name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if ((phone.match(/\d/g)?.length ?? 0) < 7) errors.push("phone");
  if (!country) errors.push("country");
  if (!childName) errors.push("child_name");
  if (!yeargroup) errors.push("yeargroup");
  if (!consent) errors.push("consent");

  if (errors.length) {
    return NextResponse.json({ ok: false, error: "validation", fields: errors }, { status: 400 });
  }

  const text = [
    `A new application was submitted on Tarbiyyah Global Academy.`,
    "",
    "PARENT / GUARDIAN",
    `  Name: ${parentName}`,
    `  Email: ${email}`,
    `  Phone: ${phone}`,
    `  Country: ${country}`,
    "",
    "CHILD",
    `  Name: ${childName}`,
    `  Year group: ${yeargroup}`,
    "",
    `Notes: ${notes || "(none)"}`,
  ].join("\n");

  const result = await sendMail({
    to: ADMISSIONS_EMAIL,
    subject: `New application — ${childName} (${yeargroup})`,
    text,
    replyEmail: email,
    replyName: parentName,
  });

  await forwardToCrm({ type: "application", parentName, email, phone, country, childName, yeargroup, notes, submittedAt: new Date().toISOString() });

  if (!result.ok) return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
