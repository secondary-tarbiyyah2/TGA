// Token-protected .ics calendar feed for a signed-in user's own PUBLISHED
// timetable. Deployed WITHOUT JWT verification (--no-verify-jwt, same as
// learn-login/book-admissions-call) because calendar apps poll this URL
// with no Supabase session at all — security comes entirely from the
// token being unguessable and revocable (see ics_tokens' migration
// comment), never from "logged in as this user".
//
// GET /timetable-ics?token=<raw token>
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toIcsDateForNextOccurrence(weekday: number, time: string): Date {
  // weekday: 1=Mon..5=Fri. Finds the next occurrence of that weekday/time
  // from today (UTC), which is enough for a first useful .ics — a real
  // recurring event is expressed below via RRULE, this just anchors DTSTART.
  const [h, m] = time.split(":").map(Number);
  const now = new Date();
  const jsWeekday = now.getUTCDay(); // 0=Sun..6=Sat
  const targetJsWeekday = weekday % 7; // our 1..5 already matches JS Mon..Fri (1..5)
  let delta = targetJsWeekday - jsWeekday;
  if (delta < 0) delta += 7;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta, h, m));
  return d;
}

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Mirrors audiencesOf()/periodApplies() in src/lib/learn/timetable.ts.
function audiencesOf(yearGroupName: string): string[] {
  const name = yearGroupName.trim().toLowerCase();
  const out = ["all", name];
  const m = name.match(/(\d+)/);
  if (name.startsWith("reception")) out.push("primary");
  else if (m) {
    const n = Number(m[1]);
    if (n <= 6) out.push("primary");
    else if (n <= 9) out.push("ks3");
    else if (n <= 11) out.push("gcse");
  }
  return out;
}

const RRULE_DAY = ["", "MO", "TU", "WE", "TH", "FR"]; // index by our weekday 1..5

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400, headers: corsHeaders });
  }

  const tokenHash = await hashToken(token);
  const { data: tokenRow } = await serviceClient
    .from("ics_tokens")
    .select("user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || tokenRow.revoked_at) {
    return new Response("Invalid or revoked token", { status: 404, headers: corsHeaders });
  }

  const userId = tokenRow.user_id;

  // Which classes does this user's timetable cover? Teacher: their own
  // slots. Parent: their children's classes. Student: their own classes.
  // service role bypasses RLS, so this re-implements the same scoping the
  // RLS policies express, deliberately narrow (never "give me everything").
  const [{ data: teacherSlots }, { data: childRows }, { data: studentRow }] = await Promise.all([
    serviceClient.from("timetable_slots").select("class_id, run_id").eq("teacher_user_id", userId),
    serviceClient.from("children").select("id").eq("parent_user_id", userId),
    serviceClient.from("student_accounts").select("child_id").eq("profile_id", userId).maybeSingle(),
  ]);

  const childIds = [...(childRows || []).map((c) => c.id), ...(studentRow ? [studentRow.child_id] : [])];

  let classIds: string[] = (teacherSlots || []).map((s) => s.class_id);
  if (childIds.length > 0) {
    const { data: enrolments } = await serviceClient.from("enrolments").select("class_id").in("child_id", childIds);
    classIds = classIds.concat((enrolments || []).map((e) => e.class_id));
  }
  classIds = Array.from(new Set(classIds));

  let slots: { id: string; weekday: number; start_time: string; end_time: string; classes: { name: string } | null; subjects: { name: string } | null }[] = [];
  if (classIds.length > 0) {
    // Only the currently published run's slots, matching every dashboard's
    // own read scope.
    const { data: publishedRun } = await serviceClient
      .from("timetable_runs")
      .select("id")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (publishedRun) {
      const teacherOwn = (teacherSlots || []).filter((s) => s.run_id === publishedRun.id).map((s) => s.class_id);
      const relevantClassIds = teacherOwn.length > 0 ? Array.from(new Set([...teacherOwn, ...classIds])) : classIds;
      const { data } = await serviceClient
        .from("timetable_slots")
        .select("id, weekday, start_time, end_time, classes(name), subjects(name)")
        .eq("run_id", publishedRun.id)
        .in("class_id", relevantClassIds);
      slots = (data as typeof slots) || [];
    }
  }

  // Non-lesson blocks of the school day (break, lunch, prayer, supervised
  // enrichment) for the year groups this calendar covers. They have no teacher.
  type PeriodRow = { id: string; name: string; kind: string; start_time: string; end_time: string; weekdays: number[] | null; applies_to: string[] | null; activity: string | null; supervisor_user_id?: string | null };
  let blocks: PeriodRow[] = [];
  const supervisorNames = new Map<string, string>();
  if (slots.length > 0 && classIds.length > 0) {
    // supervisor_user_id needs migration 0069; fall back to the older columns until it is applied.
    const [withSupervisor, { data: classRows }] = await Promise.all([
      serviceClient.from("timetable_periods").select("id, name, kind, start_time, end_time, weekdays, applies_to, activity, supervisor_user_id").eq("active", true).neq("kind", "lesson"),
      serviceClient.from("classes").select("year_group").in("id", classIds),
    ]);
    const periodRows = withSupervisor.error
      ? (await serviceClient.from("timetable_periods").select("id, name, kind, start_time, end_time, weekdays, applies_to, activity").eq("active", true).neq("kind", "lesson")).data
      : withSupervisor.data;
    const tokens = new Set<string>();
    for (const c of (classRows as { year_group: string | null }[] | null) || []) {
      if (c.year_group) for (const t of audiencesOf(c.year_group)) tokens.add(t);
    }
    blocks = ((periodRows as PeriodRow[] | null) || []).filter((p) => {
      const applies = p.applies_to && p.applies_to.length > 0 ? p.applies_to : ["all"];
      return p.supervisor_user_id === userId || applies.includes("all") || applies.some((a) => tokens.has(a.trim().toLowerCase()));
    });
  }

  // Supervisor names for enrichment blocks (name only, nothing else from the profile).
  const supervisorIds = Array.from(new Set(blocks.map((p) => p.supervisor_user_id).filter((id): id is string => Boolean(id))));
  if (supervisorIds.length > 0) {
    const { data: supervisors } = await serviceClient.from("profiles").select("id, full_name").in("id", supervisorIds);
    for (const sv of (supervisors as { id: string; full_name: string | null }[] | null) || []) {
      if (sv.full_name) supervisorNames.set(sv.id, sv.full_name);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tarbiyyah Global Academy//Learn Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tarbiyyah Global Academy — Timetable",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  ];

  for (const s of slots) {
    if (s.weekday < 1 || s.weekday > 5) continue; // solver never places Sat/Sun, defensive guard only
    const start = toIcsDateForNextOccurrence(s.weekday, s.start_time);
    const end = toIcsDateForNextOccurrence(s.weekday, s.end_time);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@learn.tarbiyyah.co.uk`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[s.weekday]}`,
      `SUMMARY:${escapeIcsText(s.subjects?.name || "Lesson")}${s.classes ? ` (${escapeIcsText(s.classes.name)})` : ""}`,
      "END:VEVENT"
    );
  }

  for (const p of blocks) {
    for (const wd of p.weekdays && p.weekdays.length > 0 ? p.weekdays : [1, 2, 3, 4, 5]) {
      if (wd < 1 || wd > 5) continue;
      const start = toIcsDateForNextOccurrence(wd, p.start_time);
      const end = toIcsDateForNextOccurrence(wd, p.end_time);
      const label = p.kind === "enrichment" && p.activity ? `${p.name}: ${p.activity}` : p.name;
      const supervisor = p.kind === "enrichment" && p.supervisor_user_id ? supervisorNames.get(p.supervisor_user_id) : undefined;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${p.id}-${wd}@learn.tarbiyyah.co.uk`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[wd]}`,
        `SUMMARY:${escapeIcsText(label)}`,
        ...(supervisor ? [`DESCRIPTION:${escapeIcsText(`Supervised by ${supervisor}`)}`] : []),
        `CATEGORIES:${p.kind === "enrichment" ? "ENRICHMENT" : "BREAK"}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="timetable.ics"',
    },
  });
});
