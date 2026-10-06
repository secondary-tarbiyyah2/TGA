// Emails everyone booked on an open evening a reminder in the 24 hours
// before it starts (see .github/workflows/open-evening-reminders.yml, which
// calls this hourly). Idempotent: reminder_sent_at is stamped per booking, so
// a booking is never reminded twice. Bookings made inside the final 24 hours
// are skipped: their confirmation email is itself recent.
//
// Auth: deployed with --no-verify-jwt (the scheduler is not a signed-in
// user), so the function requires the service-role key as the Bearer token.
// POST ?dry_run=1 reports what would be sent without sending or writing.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const SITE_URL = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ukWhen = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";

type SessionRow = { title: string; starts_at: string; join_url: string | null; cancelled_at: string | null };
type BookingRow = {
  id: string;
  parent_name: string;
  email: string;
  attendees: number;
  created_at: string;
  open_evening_sessions: SessionRow | SessionRow[] | null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("open_evening_bookings")
    .select("id, parent_name, email, attendees, created_at, open_evening_sessions!inner(title, starts_at, join_url, cancelled_at)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gt("open_evening_sessions.starts_at", now.toISOString())
    .lte("open_evening_sessions.starts_at", horizon.toISOString());
  if (error) {
    console.error("open-evening-reminders: query failed", error.message);
    return jsonResponse({ ok: false, error: "query_failed" }, 500);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const b of (data || []) as unknown as BookingRow[]) {
    const s = Array.isArray(b.open_evening_sessions) ? b.open_evening_sessions[0] : b.open_evening_sessions;
    if (!s || s.cancelled_at) { skipped++; continue; }
    if (new Date(b.created_at).getTime() > new Date(s.starts_at).getTime() - 24 * 60 * 60 * 1000) { skipped++; continue; }
    if (dryRun) { sent++; continue; }
    const result = await sendEmail({
      to: b.email,
      toName: b.parent_name,
      subject: `Reminder: ${s.title} is tomorrow — Tarbiyyah Global Academy`,
      html: emailShell(`
        <h1 style="font-size:20px;margin:0 0 16px;">Your open evening is tomorrow</h1>
        <p>Assalamu alaikum ${esc(b.parent_name.split(" ")[0])},</p>
        <p>This is a reminder that <strong>${esc(s.title)}</strong> starts on <strong>${esc(ukWhen(s.starts_at))}</strong>.</p>
        ${s.join_url ? `<p><a href="${esc(s.join_url)}" style="color:#5E4B1E;">Join online</a>. No download is needed.</p>` : `<p>The joining link is on its way in a separate email.</p>`}
        <p>If you can no longer come, please write to <a href="mailto:${esc(ADMISSIONS_EMAIL)}" style="color:#5E4B1E;">${esc(ADMISSIONS_EMAIL)}</a>. More details are at <a href="${esc(SITE_URL)}/open-evening" style="color:#5E4B1E;">our open evening page</a>.</p>
      `),
    });
    if (result.ok) {
      await supabase.from("open_evening_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } else {
      failed++;
      console.error(`open-evening-reminders ${b.id}: ${result.detail}`);
    }
  }
  return jsonResponse({ ok: true, dryRun, sent, skipped, failed });
});
