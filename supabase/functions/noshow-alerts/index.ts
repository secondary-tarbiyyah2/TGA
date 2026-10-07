// Scheduled "no-show" alerts (see .github/workflows/noshow-alerts.yml).
//
// Ten minutes into a lesson, any enrolled child who has NOT pressed "Join
// lesson" (no lesson_joins row), has not been marked present/late/excused
// by the teacher, and has no recorded reason for being away gets one email
// to their parent. If the same child reaches 3 such no-shows in 14 days, a
// safeguarding concern is opened (safeguarding_concerns, status 'open') and
// the safeguarding lead(s) are emailed one digest per run.
//
// "No recorded reason" means ALL of: no absence_notices row for the lesson,
// no absence_reasons row for the day with a real reason (not 'unknown'), and
// no absence_notes (a parent's note) covering the day.
//
// Idempotent: noshow_alerts has UNIQUE (lesson_instance_id, child_id). A row
// is inserted FIRST (the claim), and the email only goes out for the run that
// inserted it, so overlapping or repeated runs never alert twice. Scanned
// lessons are those that started 10+ minutes ago and have not ended, so a
// late-running cron still catches them.
//
// Auth: deployed with --no-verify-jwt (the scheduler is not a signed-in
// user), so the function itself requires the service-role key as the Bearer
// token. POST ?dry_run=1 reports what would be sent without sending or writing.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const LEARN_SITE_URL = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";
const SCHOOL_TIMEZONE = Deno.env.get("SCHOOL_TIMEZONE") || "Europe/London";
const GRACE_MINUTES = 10;
const FLAG_THRESHOLD = 3;
const FLAG_WINDOW_DAYS = 14;
const FLAG_SUMMARY_PREFIX = "Automated: repeated lesson no-shows";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hhmm = (t: string): string => t.slice(0, 5);
const minutesOf = (t: string): number => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** Today's date and minutes-since-midnight in the school's timezone. */
function schoolNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

type SlotRow = {
  class_id: string;
  start_time: string;
  end_time: string;
  classes: { name: string } | null;
  subjects: { name: string } | null;
};
type LessonRow = { id: string; date: string; timetable_slots: SlotRow | null };
type EnrolRow = { child_id: string; children: { id: string; name: string; parent_user_id: string } | null };

/** A service-role caller: the exact key, or any key the auth admin API accepts (new-style secret keys differ from the env value). */
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  if (!(await isServiceCaller((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  const now = schoolNow();
  const { data: lessonData, error: lessonErr } = await supabase
    .from("lesson_instances")
    .select("id, date, timetable_slots!inner(class_id, start_time, end_time, classes(name), subjects(name))")
    .eq("date", now.date);
  if (lessonErr) return jsonResponse({ ok: false, error: "query_failed", detail: lessonErr.message }, 500);

  const due = ((lessonData as unknown as LessonRow[]) || []).filter((l) => {
    const s = l.timetable_slots;
    if (!s) return false;
    return now.minutes >= minutesOf(s.start_time) + GRACE_MINUTES && now.minutes < minutesOf(s.end_time);
  });

  const summary = { lessons: due.length, alerted: 0, emailed: 0, flagged: 0, would_alert: 0 };
  const flaggedThisRun: { childId: string; childName: string; count: number; latest: string }[] = [];

  for (const lesson of due) {
    const slot = lesson.timetable_slots!;
    const lessonLabel = `${slot.subjects?.name || "Lesson"}${slot.classes?.name ? ` (${slot.classes.name})` : ""}`;

    const [enrolRes, joinRes, attRes, noticeRes, reasonRes, noteRes, doneRes] = await Promise.all([
      supabase.from("enrolments").select("child_id, children(id, name, parent_user_id)").eq("class_id", slot.class_id),
      supabase.from("lesson_joins").select("child_id").eq("lesson_instance_id", lesson.id).eq("role", "child"),
      supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", lesson.id),
      supabase.from("absence_notices").select("child_id").eq("lesson_instance_id", lesson.id),
      supabase.from("absence_reasons").select("child_id, reason_code").eq("absence_date", lesson.date),
      supabase.from("absence_notes").select("child_id").lte("from_date", lesson.date).gte("to_date", lesson.date),
      supabase.from("noshow_alerts").select("child_id").eq("lesson_instance_id", lesson.id),
    ]);

    const joined = new Set(((joinRes.data as { child_id: string | null }[] | null) || []).map((r) => r.child_id));
    const marked = new Set(
      ((attRes.data as { child_id: string; status: string }[] | null) || []).filter((r) => ["present", "late", "excused"].includes(r.status)).map((r) => r.child_id),
    );
    const explained = new Set<string>([
      ...((noticeRes.data as { child_id: string }[] | null) || []).map((r) => r.child_id),
      ...((reasonRes.data as { child_id: string; reason_code: string }[] | null) || []).filter((r) => r.reason_code !== "unknown").map((r) => r.child_id),
      ...((noteRes.data as { child_id: string }[] | null) || []).map((r) => r.child_id),
    ]);
    const alreadyAlerted = new Set(((doneRes.data as { child_id: string }[] | null) || []).map((r) => r.child_id));

    const missing = ((enrolRes.data as unknown as EnrolRow[]) || [])
      .filter((e) => e.children && !joined.has(e.child_id) && !marked.has(e.child_id) && !explained.has(e.child_id) && !alreadyAlerted.has(e.child_id))
      .map((e) => e.children!);
    if (missing.length === 0) continue;

    if (dryRun) {
      summary.would_alert += missing.length;
      continue;
    }

    const parentIds = Array.from(new Set(missing.map((c) => c.parent_user_id)));
    const { data: parentRows } = await supabase.from("profiles").select("id, email, full_name").in("id", parentIds);
    const parents = new Map(((parentRows as { id: string; email: string | null; full_name: string | null }[] | null) || []).map((p) => [p.id, p]));

    for (const child of missing) {
      // Claim first: only the run that inserts the row sends the email.
      const { data: claimed, error: claimErr } = await supabase
        .from("noshow_alerts")
        .insert({ lesson_instance_id: lesson.id, child_id: child.id })
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) continue; // 23505 = someone already alerted this lesson/child
      summary.alerted++;

      const parent = parents.get(child.parent_user_id);
      let detail = "no parent email on file";
      let emailed = false;
      if (parent?.email) {
        const html = emailShell(`
          <h2 style="margin:0 0 12px;font-size:18px;">${esc(child.name)} has not joined their lesson</h2>
          <p style="margin:0 0 12px;">Assalamu alaikum${parent.full_name ? ` ${esc(parent.full_name)}` : ""},</p>
          <p style="margin:0 0 12px;">${esc(child.name)} has not joined <strong>${esc(lessonLabel)}</strong>, which started at ${hhmm(slot.start_time)} today. We have not had a message to say they would be away.</p>
          <p style="margin:0 0 12px;">If they are able to, they can still join now from their dashboard.</p>
          <p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/family/dashboard" style="color:#B08E45;">Open the family dashboard &rarr;</a></p>
          <p style="margin:0;font-size:13px;color:#555;">If ${esc(child.name)} is unwell or away, please let us know through Absences in the family area, or reply to this email, so we can record the reason.</p>
        `);
        const result = await sendEmail({ to: parent.email, toName: parent.full_name || undefined, subject: `${child.name} has not joined ${slot.subjects?.name || "their lesson"}`, html });
        emailed = result.ok;
        detail = result.detail;
      }
      if (emailed) summary.emailed++;
      await supabase.from("noshow_alerts").update({ parent_emailed: emailed, detail }).eq("id", (claimed as { id: number }).id);

      // 3 no-shows in 14 days: open a safeguarding concern (once per window).
      const since = new Date(Date.now() - FLAG_WINDOW_DAYS * 86_400_000).toISOString();
      const { count } = await supabase.from("noshow_alerts").select("id", { count: "exact", head: true }).eq("child_id", child.id).gte("alerted_at", since);
      if ((count || 0) >= FLAG_THRESHOLD) {
        const { data: existing } = await supabase
          .from("safeguarding_concerns")
          .select("id")
          .eq("child_id", child.id)
          .like("summary", `${FLAG_SUMMARY_PREFIX}%`)
          .gte("created_at", since)
          .limit(1);
        if (!existing || existing.length === 0) {
          const latest = `${lessonLabel} on ${lesson.date} at ${hhmm(slot.start_time)}`;
          const { error: concernErr } = await supabase.from("safeguarding_concerns").insert({
            child_id: child.id,
            severity: "standard",
            status: "open",
            summary: `${FLAG_SUMMARY_PREFIX}. ${count} lessons in the last ${FLAG_WINDOW_DAYS} days where the child did not join and no reason was recorded. Latest: ${latest}. Raised automatically by the no-show check; please review attendance and contact the family.`,
          });
          if (!concernErr) {
            summary.flagged++;
            flaggedThisRun.push({ childId: child.id, childName: child.name, count: count || FLAG_THRESHOLD, latest });
          }
        }
      }
    }
  }

  // One digest per run to every safeguarding lead.
  if (flaggedThisRun.length > 0) {
    const { data: leads } = await supabase.from("user_permissions").select("user_id, profiles(email, full_name)").eq("permission", "safeguarding_lead");
    const recipients = ((leads as unknown as { profiles: { email: string | null; full_name: string | null } | null }[] | null) || [])
      .map((l) => l.profiles)
      .filter((p): p is { email: string; full_name: string | null } => Boolean(p?.email));
    const items = flaggedThisRun.map((f) => `<li style="margin:0 0 6px;"><strong>${esc(f.childName)}</strong>: ${f.count} no-shows in ${FLAG_WINDOW_DAYS} days (latest: ${esc(f.latest)})</li>`).join("");
    const html = emailShell(`
      <h2 style="margin:0 0 12px;font-size:18px;">Repeated lesson no-shows</h2>
      <p style="margin:0 0 12px;">These children have missed ${FLAG_THRESHOLD} or more lessons in ${FLAG_WINDOW_DAYS} days without joining and without a recorded reason. A concern has been opened for each in Compliance.</p>
      <ul style="margin:0 0 20px;padding-left:20px;">${items}</ul>
      <p style="margin:0;"><a href="${LEARN_SITE_URL}/admin/compliance" style="color:#B08E45;">Review in Compliance &rarr;</a></p>
    `);
    for (const r of recipients) {
      await sendEmail({ to: r.email, toName: r.full_name || undefined, subject: "Repeated lesson no-shows need review", html });
    }
  }

  return jsonResponse({ ok: true, dry_run: dryRun, ...summary });
});
