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
import { buildIcs } from "../_shared/ics.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";

const SITE_URL = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function isServiceCaller(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

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
  if (!(await isServiceCaller((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  const moved = await sendDateChangeNotices(dryRun);

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
      subject: `Reminder: ${s.title} is tomorrow | Tarbiyyah Global Academy`,
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
  return jsonResponse({ ok: true, dryRun, sent, skipped, failed, moved });
});

// "Your session has a new date": for every confirmed booking whose session
// has moved since the family was last told (notified_starts_at), email the
// new date, an updated calendar invite and a fresh self-service cancel link,
// then record the new time so the notice is sent once per change.
type MovedRow = {
  id: string;
  parent_name: string;
  email: string;
  notified_starts_at: string | null;
  open_evening_sessions: (SessionRow & { id: string; ends_at: string }) | (SessionRow & { id: string; ends_at: string })[] | null;
};

async function sendDateChangeNotices(dryRun: boolean): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase
    .from("open_evening_bookings")
    .select("id, parent_name, email, notified_starts_at, open_evening_sessions!inner(id, title, starts_at, ends_at, join_url, cancelled_at)")
    .eq("status", "confirmed")
    .not("notified_starts_at", "is", null)
    .gt("open_evening_sessions.starts_at", new Date().toISOString());
  if (error) {
    console.error("open-evening-reminders: moved-session query failed", error.message);
    return { sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const b of (data || []) as unknown as MovedRow[]) {
    const s = Array.isArray(b.open_evening_sessions) ? b.open_evening_sessions[0] : b.open_evening_sessions;
    if (!s || s.cancelled_at || !b.notified_starts_at) continue;
    if (new Date(b.notified_starts_at).getTime() === new Date(s.starts_at).getTime()) continue;
    if (dryRun) { sent++; continue; }
    const token = generateToken();
    const manageUrl = `${SITE_URL}/open-evening/manage/?token=${token}`;
    const ics = buildIcs({
      uid: `open-evening-${b.id}@globalacademy.tarbiyyah.co.uk`,
      title: `${s.title} | Tarbiyyah Global Academy`,
      description: s.join_url ? `Join online: ${s.join_url}` : `Details: ${SITE_URL}/open-evening`,
      location: s.join_url || "Online",
      startsAt: new Date(s.starts_at),
      endsAt: new Date(s.ends_at),
      organizerEmail: ADMISSIONS_EMAIL,
      attendeeEmail: b.email,
      sequence: Math.floor(Date.now() / 1000),
    });
    const result = await sendEmail({
      to: b.email,
      toName: b.parent_name,
      subject: `New date: ${s.title} | Tarbiyyah Global Academy`,
      html: emailShell(`
        <h1 style="font-size:20px;margin:0 0 16px;">Your session has a new date</h1>
        <p>Assalamu alaikum ${esc(b.parent_name.split(" ")[0])},</p>
        <p>We have had to change the date of <strong>${esc(s.title)}</strong>. It was on ${esc(ukWhen(b.notified_starts_at))}; it is now on <strong>${esc(ukWhen(s.starts_at))}</strong>. Your place is kept for the new date, and the calendar invite attached replaces the old one.</p>
        ${s.join_url ? `<p><a href="${esc(s.join_url)}" style="color:#5E4B1E;">Join online</a> at the new time. No download is needed.</p>` : `<p>The joining link will be emailed to you before the session.</p>`}
        <p>If the new date no longer suits you, <a href="${manageUrl}" style="color:#5E4B1E;">cancel your place here</a>, and you are welcome to <a href="${SITE_URL}/open-evening/" style="color:#5E4B1E;">book a different session</a> instead. We are sorry for any inconvenience.</p>
      `),
      icsContent: ics,
      icsFilename: "open-evening.ics",
    });
    if (result.ok) {
      await supabase
        .from("open_evening_bookings")
        .update({ notified_starts_at: s.starts_at, manage_token_hash: await hashToken(token), reminder_sent_at: null })
        .eq("id", b.id);
      sent++;
    } else {
      failed++;
      console.error(`open-evening-reminders (new date) ${b.id}: ${result.detail}`);
    }
  }
  return { sent, failed };
}
