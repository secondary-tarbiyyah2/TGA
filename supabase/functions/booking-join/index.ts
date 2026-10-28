// Staff-side counterpart to manage-booking's guest join link: creates/
// fetches the BBB meeting for an admissions/parent-meeting booking and
// returns a MODERATOR join URL for the staff member running it. Deployed
// WITH JWT verification, only an authenticated staff account can reach
// this at all (unlike the family side, which is a prospective parent with
// no account yet, see manage-booking's guest join instead).
//
// Same meetingId convention as manage-booking (`booking-${booking.id}`),
// so whichever side calls first (staff opening early, or a family member
// already waiting) creates the meeting and the other just joins it.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { bbbConfigured, ensureMeeting, buildJoinUrl, derivePasswords } from "../_shared/bbb.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const userId = userData.user.id;

  let body: { booking_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const bookingId = body.booking_id;
  if (!bookingId) return jsonResponse({ ok: false, error: "missing_booking_id" }, 400);

  const { data: booking, error: bookingErr } = await serviceClient
    .from("bookings")
    .select("id, status, staff_id, teams_join_url, staff_members(display_name, teams_meeting_url)")
    .eq("id", bookingId)
    .single();
  if (bookingErr || !booking) return jsonResponse({ ok: false, error: "booking_not_found" }, 404);
  if (booking.status === "cancelled") return jsonResponse({ ok: false, error: "booking_cancelled" }, 400);

  const [{ data: profile }, { data: ownStaffRow }, { data: staffRoles }] = await Promise.all([
    serviceClient.from("profiles").select("full_name").eq("id", userId).single(),
    serviceClient.from("staff_members").select("id").eq("id", booking.staff_id).eq("profile_id", userId).maybeSingle(),
    serviceClient.from("user_roles").select("role").eq("user_id", userId).eq("scope_type", "none"),
  ]);

  // Same moderator scope as who may manage this booking at all (see
  // admin/admissions page's "All staff" view): the booking's own staff
  // member, or head_teacher/admin/admissions covering for them.
  const isOwnBooking = Boolean(ownStaffRow);
  const isAdmissionsStaff = (staffRoles || []).some((r) => ["head_teacher", "admin", "admissions"].includes(r.role));
  if (!isOwnBooking && !isAdmissionsStaff) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  // No video server configured yet: fall back to the Teams link the family
  // was given (the booking's own, else the staff member's standing one,
  // else the admissions default), so "Start call" still gets staff into
  // the call instead of failing.
  if (!bbbConfigured()) {
    const teamsUrl =
      booking.teams_join_url || booking.staff_members?.teams_meeting_url || Deno.env.get("ADMISSIONS_TEAMS_URL") || null;
    if (!teamsUrl) {
      return jsonResponse({ ok: false, error: "bbb_not_configured", detail: "BBB_SERVER_URL/BBB_SECRET are not set yet, see SETUP.md." }, 503);
    }
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      action: "BOOKING_CALL_JOIN",
      target_table: "bookings",
      target_id: bookingId,
      changes: { role: "moderator", provider: "teams" },
    });
    return jsonResponse({ ok: true, joinUrl: teamsUrl, provider: "teams" });
  }

  const meetingId = `booking-${booking.id}`;
  const { moderatorPassword, attendeePassword } = await derivePasswords(meetingId);
  const meetingName = "Admissions call | Tarbiyyah Global Academy";

  const ensured = await ensureMeeting({ meetingId, meetingName, moderatorPassword, attendeePassword, recordingEnabled: false });
  if (!ensured.ok) return jsonResponse({ ok: false, error: "bbb_create_failed", detail: ensured.detail }, 502);

  const joinUrl = await buildJoinUrl({
    meetingId,
    fullName: profile?.full_name || "Staff",
    password: moderatorPassword,
    userId,
  });

  await serviceClient.from("audit_log").insert({
    actor_id: userId,
    action: "BOOKING_CALL_JOIN",
    target_table: "bookings",
    target_id: bookingId,
    changes: { role: "moderator" },
  });

  return jsonResponse({ ok: true, joinUrl });
});
