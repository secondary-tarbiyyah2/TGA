// Called by pg_cron every 15 minutes (scheduled by migration 0160; the URL and
// service-role key it needs are written to Vault by deploy-supabase.yml).
// Idempotent: each booking's reminder_24h_sent_at / reminder_1h_sent_at columns mean a booking is never reminded twice even
// if this runs slightly early/late relative to the exact 24h/1h mark.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isServiceCaller } from "../_shared/auth.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";
}

async function sendWindowReminders(hoursBefore: number, column: "reminder_24h_sent_at" | "reminder_1h_sent_at") {
  const now = Date.now();
  // A 30-minute window around the exact hoursBefore mark, wide enough that
  // a 15-minute cron tick can never skip a booking between two runs.
  const windowStart = new Date(now + (hoursBefore * 60 - 15) * 60 * 1000).toISOString();
  const windowEnd = new Date(now + (hoursBefore * 60 + 15) * 60 * 1000).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*, staff_members(teams_meeting_url)")
    .eq("status", "confirmed")
    .is(column, null)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (error || !bookings) return 0;

  let sent = 0;
  for (const booking of bookings) {
    const ok = await sendEmail({
      to: booking.contact_email,
      toName: booking.contact_name,
      subject: hoursBefore === 24 ? "Reminder: your admissions call is tomorrow" : "Reminder: your admissions call starts soon",
      html: emailShell(`
        <p>This is a reminder that your admissions call is at <strong>${whenText(booking.starts_at)}</strong>.</p>
        <p><a href="${booking.teams_join_url}">Join on Microsoft Teams</a></p>
      `),
    });
    if (ok.ok) {
      await supabase.from("bookings").update({ [column]: new Date().toISOString() }).eq("id", booking.id);
      sent++;
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  // Only pg_cron (service-role key, migration 0160) may run this.
  if (!(await isServiceCaller(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const sent24h = await sendWindowReminders(24, "reminder_24h_sent_at");
  const sent1h = await sendWindowReminders(1, "reminder_1h_sent_at");
  return jsonResponse({ ok: true, sent24h, sent1h });
});
