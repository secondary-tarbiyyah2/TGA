// Called by pg_cron every 15 minutes (see SETUP.md for the one-time Vault +
// cron.schedule setup). Idempotent: each booking's reminder_24h_sent_at /
// reminder_1h_sent_at columns mean a booking is never reminded twice even
// if this runs slightly early/late relative to the exact 24h/1h mark.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { bookingWhenText } from "../_shared/bookingTime.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
        <p>This is a reminder that your admissions call is on <strong>${bookingWhenText(booking.starts_at, booking.contact_timezone)}</strong>.</p>
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

Deno.serve(async () => {
  const sent24h = await sendWindowReminders(24, "reminder_24h_sent_at");
  const sent1h = await sendWindowReminders(1, "reminder_1h_sent_at");
  return jsonResponse({ ok: true, sent24h, sent1h });
});
