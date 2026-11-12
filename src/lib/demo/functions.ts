"use client";

// Portal demo only: the Edge Functions the portal calls. Nothing is emailed,
// charged or sent anywhere; each answers as the real one would after success.

import type { Tables } from "@/lib/demo/postgrest";
import { whoAmI } from "@/lib/demo/store";

type Body = Record<string, unknown>;

const AI_DRAFT = "Assalamu alaikum. This is a sample draft written for the demo: it reads the pupil's record and suggests a short, kind comment for the teacher to check and change before it is used.";

export async function edgeFunction(name: string, body: Body, url: URL, t: Tables): Promise<unknown> {
  const me = whoAmI();
  const staff = me && (me.role === "head_teacher" || me.role === "teacher" || me.role === "admin");
  void url;
  switch (name) {
    case "ai-assist": {
      const task = String(body.task || "");
      if (task === "status") return { ok: true, switched_off: false, configured: true, daily_limit: 200, can: { report_comment: staff, tarbiyah_note: staff, message_triage: true, revision_questions: staff, quiz_questions: staff } };
      if (task === "quiz_questions") return { ok: false, error: "quizzes_switched_off", detail: "The Headteacher has switched Quizzes off." };
      if (task === "check") return { ok: true, model: "demo", detail: "The AI connection works (demo)." };
      if (task === "message_triage") return { ok: true, category: "general", urgency: "normal", handler: "teacher", summary: "A general question from a parent." };
      return { ok: true, text: AI_DRAFT, draft: AI_DRAFT, comment: AI_DRAFT, note: AI_DRAFT, questions: [] };
    }
    case "teams-sync":
      return { ok: true, configured: false, status: "not_configured", meetings: [], detail: "Teams is not connected in the demo." };
    case "curriculum-sync":
      return { ok: true, message: "Up to date", sent_units: 0, received_units: 0 };
    case "timetable-ics":
      return { ok: true, url: null };
    case "lesson-join":
    case "booking-join":
      return { ok: true, joinUrl: "https://teams.microsoft.com/l/meetup-join/demo", url: "https://teams.microsoft.com/l/meetup-join/demo" };
    case "weekly-digest":
      return { ok: true, html: "<p>Assalamu alaikum. Here is a sample of the weekly email families receive: attendance, homework, merits and next week's dates.</p>", subject: "Your child's week", sent: 0, preview: true };
    case "payments-admin":
      return { ok: true, configured: false, livemode: false, mode: "test", account: null, balance: null, payouts: [], connected: false };
    case "inbound-absence":
      return { ok: true, emails: [], items: [] };
    case "entry-assessment":
      return { ok: true, assessments: [], items: [] };
    case "star-certificate":
    case "document-signed-pdf":
    case "document-signed-copy":
      return { ok: true, url: null, emailed: true };
    case "payments-checkout":
    case "payments-checkout-public":
      return { ok: false, error: "demo", detail: "Payments are not taken in the demo. Nothing has been charged." };
    default:
      // Sending emails, inviting accounts, notifying families: all "done", nothing sent.
      return { ok: true, sent: true, demo: true, count: (t.profiles || []).length ? 1 : 0 };
  }
}
