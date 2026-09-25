// Lets a parent view, reschedule or cancel a booking using the token from
// their confirmation email — no login required. The token is never stored
// raw (see _shared/manageToken.ts), so this function re-hashes whatever
// it's given and looks up by hash.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { buildIcs } from "../_shared/ics.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashToken } from "../_shared/manageToken.ts";

const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function findBooking(token: string) {
  const tokenHash = await hashToken(token);
  const { data, error } = await supabase
    .from("bookings")
    .select("*, staff_members(display_name, teams_meeting_url, profiles(email, full_name))")
    .eq("manage_token_hash", tokenHash)
    .single();
  if (error || !data) return null;
  return data;
}

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const token = String(body.token || "");
  const action = String(body.action || "view"); // 'view' | 'reschedule' | 'cancel'
  if (!token) return jsonResponse({ ok: false, error: "missing_token" }, 400);

  const booking = await findBooking(token);
  if (!booking) return jsonResponse({ ok: false, error: "not_found" }, 404);

  if (action === "view") {
    return jsonResponse({
      ok: true,
      booking: {
        id: booking.id,
        status: booking.status,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        teamsJoinUrl: booking.teams_join_url,
        staffName: booking.staff_members?.display_name,
      },
    });
  }

  if (booking.status === "cancelled") {
    return jsonResponse({ ok: false, error: "already_cancelled" }, 400);
  }

  const staffEmail = booking.staff_members?.profiles?.email;
  const staffName = booking.staff_members?.profiles?.full_name;

  if (action === "cancel") {
    const { error: updateErr } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    if (updateErr) return jsonResponse({ ok: false, error: "update_failed" }, 500);

    const cancelIcs = buildIcs({
      uid: `booking-${booking.id}@globalacademy.tarbiyyah.co.uk`,
      title: "Cancelled: Admissions call — Tarbiyyah Global Academy",
      description: "This call has been cancelled.",
      location: booking.teams_join_url || "",
      startsAt: new Date(booking.starts_at),
      endsAt: new Date(booking.ends_at),
      organizerEmail: ADMISSIONS_EMAIL,
      attendeeEmail: booking.contact_email,
      method: "CANCEL",
      sequence: 1,
    });

    await sendEmail({
      to: booking.contact_email,
      toName: booking.contact_name,
      subject: "Your admissions call has been cancelled",
      html: emailShell(`<p>Your call for ${whenText(booking.starts_at)} has been cancelled. Book a new time any time from our website.</p>`),
      icsContent: cancelIcs,
      icsFilename: "cancelled.ics",
    });
    if (staffEmail) {
      await sendEmail({
        to: staffEmail,
        toName: staffName,
        subject: `Cancelled: admissions call with ${booking.contact_name}`,
        html: emailShell(`<p>${booking.contact_name}'s call for ${whenText(booking.starts_at)} has been cancelled.</p>`),
        icsContent: cancelIcs,
        icsFilename: "cancelled.ics",
      });
    }

    return jsonResponse({ ok: true });
  }

  if (action === "reschedule") {
    const newStart = String(body.newSlotStart || "");
    const newEnd = String(body.newSlotEnd || "");
    if (!newStart || !newEnd) return jsonResponse({ ok: false, error: "missing_slot" }, 400);

    const { error: updateErr } = await supabase
      .from("bookings")
      .update({ starts_at: newStart, ends_at: newEnd, reminder_24h_sent_at: null, reminder_1h_sent_at: null })
      .eq("id", booking.id);

    if (updateErr) {
      if (updateErr.code === "23P01") return jsonResponse({ ok: false, error: "slot_taken" }, 409);
      return jsonResponse({ ok: false, error: "update_failed" }, 500);
    }

    const updateIcs = buildIcs({
      uid: `booking-${booking.id}@globalacademy.tarbiyyah.co.uk`,
      title: "Updated: Admissions call — Tarbiyyah Global Academy",
      description: `Join on Microsoft Teams: ${booking.teams_join_url}`,
      location: booking.teams_join_url || "",
      startsAt: new Date(newStart),
      endsAt: new Date(newEnd),
      organizerEmail: ADMISSIONS_EMAIL,
      attendeeEmail: booking.contact_email,
      sequence: 1,
    });

    await sendEmail({
      to: booking.contact_email,
      toName: booking.contact_name,
      subject: "Your admissions call has been rescheduled",
      html: emailShell(`<p>Your call is now booked for <strong>${whenText(newStart)}</strong>.</p><p><a href="${booking.teams_join_url}">Join on Microsoft Teams</a></p>`),
      icsContent: updateIcs,
      icsFilename: "updated.ics",
    });
    if (staffEmail) {
      await sendEmail({
        to: staffEmail,
        toName: staffName,
        subject: `Rescheduled: admissions call with ${booking.contact_name}`,
        html: emailShell(`<p>${booking.contact_name}'s call moved to ${whenText(newStart)}.</p>`),
        icsContent: updateIcs,
        icsFilename: "updated.ics",
      });
    }

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
