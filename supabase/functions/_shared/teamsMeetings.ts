// Teams meetings for lessons, and Teams attendance suggestions.
//
// MEETINGS (syncTeamsMeetings): for every upcoming lesson of the PUBLISHED
// timetable that has no join link of its own (no class meeting_url and no
// virtual session meeting_url), create a calendar event with
// isOnlineMeeting=true / onlineMeetingProvider "teamsForBusiness" via
//   POST /users/{organiser}/events          (application permission Calendars.ReadWrite)
// and store the event id and onlineMeeting.joinUrl in lesson_teams_meetings.
// lesson-join hands that URL to pupils. When the lesson's time or title
// changes the event is PATCHed; when the teacher changes (cover) it is
// re-created under the new organiser; when the lesson disappears or its run is
// superseded the event is cancelled. Idempotent: one row per lesson, a
// fingerprint of what was last sent, and a Graph transactionId per (lesson,
// generation) so a retried create cannot make two events.
//
// Organiser: the lesson's teacher if their portal email is a mailbox in the
// school's Microsoft 365 tenant (checked with User.Read.All when granted,
// otherwise by trying), else the shared MS_MEETING_ORGANISER mailbox.
// Meeting creation is ON only when MS_MEETING_ORGANISER is set (and
// MS_TEAMS_MEETINGS is not "0"), so nothing changes until the owner finishes
// the Microsoft 365 set-up.
//
// Data minimisation: the meeting subject is "<Subject> — <Class>" (e.g.
// "Maths — Year 7A"); no pupil names are ever sent to Graph. Attendees are
// off by default; the teacher is invited when the event lives in the shared
// mailbox, and parents only if MS_TEAMS_INVITE_FAMILIES=1. Lobby settings are
// left at the tenant default (people in the school's organisation bypass it).
//
// ATTENDANCE (syncTeamsAttendance, only when MS_TEAMS_ATTENDANCE=1): after a
// lesson ends, read the meeting's attendance report
//   GET /users/{organiserId}/onlineMeetings?$filter=JoinWebUrl eq '...'   (OnlineMeetings.Read.All)
//   GET /users/{organiserId}/onlineMeetings/{id}/attendanceReports        (OnlineMeetingArtifact.Read.All)
//   GET .../attendanceReports/{reportId}/attendanceRecords
// (both need a Teams application access policy granted to the organiser) and
// store per-pupil join/leave/minutes matched by email. The register shows
// these as a hint; nothing is ever marked automatically.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { GraphError, graphConfigured, graphFetch, graphFetchAll, graphRaw } from "./graph.ts";

const SCHOOL_TIMEZONE = Deno.env.get("SCHOOL_TIMEZONE") || "Europe/London";
const LEARN_SITE_URL = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";
/** Graph writes per run, so one call stays well inside the Edge Function time limit; the rest wait for the next run. */
const MAX_WRITES_PER_RUN = 120;

const env = (k: string) => (Deno.env.get(k) || "").trim();

export function meetingOrganiserFallback(): string {
  return env("MS_MEETING_ORGANISER");
}

export function teamsMeetingsEnabled(): boolean {
  return graphConfigured() && Boolean(meetingOrganiserFallback()) && env("MS_TEAMS_MEETINGS") !== "0";
}

export function teamsAttendanceEnabled(): boolean {
  return graphConfigured() && ["1", "true", "on", "yes"].includes(env("MS_TEAMS_ATTENDANCE").toLowerCase());
}

function syncDays(): number {
  const n = Number(env("MS_TEAMS_SYNC_DAYS"));
  return Number.isFinite(n) && n >= 1 && n <= 60 ? Math.floor(n) : 14;
}

// ── time helpers ────────────────────────────────────────────────────────────

function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** A wall-clock date + time in the school's timezone, as a UTC instant (handles BST/GMT). */
export function schoolTimeToUtc(date: string, time: string, tz = SCHOOL_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

function schoolDate(at: Date, tz = SCHOOL_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const graphDateTime = (d: Date) => ({ dateTime: d.toISOString().slice(0, 19), timeZone: "UTC" });

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

const realEmail = (e: string | null | undefined): e is string => Boolean(e && /@/.test(e) && !/\.(internal|test)$/i.test(e.trim()));

/** The organiser's Entra object id, which Teams embeds in the join URL's context ("Oid"). */
export function organiserIdFromJoinUrl(joinUrl: string): string | null {
  let s = joinUrl;
  for (let i = 0; i < 3; i++) {
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  return s.match(/"Oid"\s*:\s*"([0-9a-f-]{36})"/i)?.[1] || null;
}

// ── organiser resolution ────────────────────────────────────────────────────

type Organiser = { upn: string; id: string | null; isTeacher: boolean };

class OrganiserResolver {
  private cache = new Map<string, { upn: string; id: string | null } | null>();
  private userReadAllowed: boolean | null = null;
  /** Teacher mailboxes that failed this run (not in tenant, outside RBAC scope, no Teams licence). */
  unusable = new Set<string>();

  private tenantDomains(): string[] {
    const listed = env("MS_TENANT_DOMAINS")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const fromMailboxes = [meetingOrganiserFallback(), env("MS_SENDER_EMAIL")].filter(Boolean).map((e) => e.split("@")[1]?.toLowerCase());
    return Array.from(new Set([...listed, ...fromMailboxes].filter(Boolean) as string[]));
  }

  /** The teacher as a tenant mailbox, or null if they are not (or we can't tell and their domain isn't the school's). */
  async teacherMailbox(email: string | null | undefined): Promise<{ upn: string; id: string | null } | null> {
    if (!realEmail(email)) return null;
    const key = email.trim().toLowerCase();
    if (this.unusable.has(key)) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;
    let result: { upn: string; id: string | null } | null = null;
    if (this.userReadAllowed !== false) {
      try {
        const u = await graphFetch<{ id: string; userPrincipalName?: string; accountEnabled?: boolean }>(
          `/users/${encodeURIComponent(key)}?$select=id,userPrincipalName,accountEnabled`,
          { permission: "User.Read.All" },
        );
        this.userReadAllowed = true;
        result = u && u.accountEnabled !== false ? { upn: u.userPrincipalName || key, id: u.id } : null;
        this.cache.set(key, result);
        return result;
      } catch (e) {
        if (e instanceof GraphError && e.status === 403) this.userReadAllowed = false;
        else throw e;
      }
    }
    // No User.Read.All: assume a school-domain address is a tenant mailbox and let the create call prove it.
    const domain = key.split("@")[1];
    result = this.tenantDomains().includes(domain) ? { upn: key, id: null } : null;
    this.cache.set(key, result);
    return result;
  }
}

// ── Graph event operations ──────────────────────────────────────────────────

type EventPayload = {
  subject: string;
  start: Date;
  end: Date;
  attendees: string[];
};

function eventBody(p: EventPayload) {
  return {
    subject: p.subject,
    body: {
      contentType: "HTML",
      content: `<p>Live lesson at Tarbiyyah Global Academy.</p><p>Pupils join from the school portal: <a href="${LEARN_SITE_URL}">${LEARN_SITE_URL}</a></p>`,
    },
    start: graphDateTime(p.start),
    end: graphDateTime(p.end),
    attendees: p.attendees.map((address) => ({ emailAddress: { address }, type: "required" })),
  };
}

type CreatedEvent = { eventId: string; joinUrl: string; organiser: Organiser };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown): string => String((e as Error)?.message || e || "unknown error").slice(0, 500);
/** Failures that will hit every lesson (sign-in, throttled out, missing permission on the tenant). */
const isTenantWide = (e: unknown): boolean => e instanceof GraphError && (e.code === "token_failed" || e.code === "not_configured" || e.status === 429);

/** POST /users/{upn}/events as a Teams meeting. Throws GraphError (or Error "no_teams") on failure. */
async function createEventIn(upn: string, p: EventPayload, transactionId: string): Promise<{ eventId: string; joinUrl: string }> {
  const created = await graphFetch<{ id: string; onlineMeeting?: { joinUrl?: string } | null }>(`/users/${encodeURIComponent(upn)}/events`, {
    method: "POST",
    permission: "Calendars.ReadWrite",
    body: {
      ...eventBody(p),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: false,
      responseRequested: false,
      isReminderOn: true,
      reminderMinutesBeforeStart: 10,
      showAs: "busy",
      transactionId,
    },
  });
  if (!created?.id) throw new GraphError(`Mailbox ${upn} was not found (it may not be in the school's Microsoft 365, or has no Exchange mailbox).`, 404, "mailbox_not_found");
  let joinUrl = created.onlineMeeting?.joinUrl || "";
  if (!joinUrl) {
    await sleep(1500);
    const again = await graphFetch<{ onlineMeeting?: { joinUrl?: string } | null }>(
      `/users/${encodeURIComponent(upn)}/events/${encodeURIComponent(created.id)}?$select=onlineMeeting`,
      { permission: "Calendars.ReadWrite" },
    );
    joinUrl = again?.onlineMeeting?.joinUrl || "";
  }
  if (!joinUrl) {
    // Usually: this mailbox has no Teams licence, or Teams meetings are not allowed on its calendar.
    await graphRaw(`/users/${encodeURIComponent(upn)}/events/${encodeURIComponent(created.id)}`, { method: "DELETE", permission: "Calendars.ReadWrite" }).catch(() => null);
    throw new GraphError(`No Teams link was created in ${upn}'s calendar. Check that account has a Microsoft Teams licence (Office 365 A1 for Education is free).`, 0, "no_teams");
  }
  return { eventId: created.id, joinUrl };
}

/** Is this create failure a reason to try the next organiser (rather than a tenant-wide problem)? */
function mailboxSpecific(e: unknown): boolean {
  if (!(e instanceof GraphError)) return false;
  if (e.code === "no_teams" || e.code === "mailbox_not_found") return true;
  if (e.status === 404) return true;
  if (/MailboxNotEnabledForRESTAPI|ErrorItemNotFound|ResourceNotFound|ErrorInvalidUser|MailboxNotFound/i.test(e.code + " " + e.message)) return true;
  // 403 for ONE mailbox while others work = outside an Exchange RBAC scope / application access policy.
  return e.status === 403;
}

async function cancelEvent(upn: string, eventId: string, invited: boolean): Promise<void> {
  const base = `/users/${encodeURIComponent(upn)}/events/${encodeURIComponent(eventId)}`;
  if (invited) {
    const res = await graphRaw(`${base}/cancel`, { method: "POST", permission: "Calendars.ReadWrite", body: { comment: "This lesson has been cancelled or moved. Use the school portal for the current lesson link." } }).catch(
      (e) => {
        // 400 = already cancelled / no longer a meeting: fall back to delete.
        if (e instanceof GraphError && e.status === 400) return null;
        throw e;
      },
    );
    if (res) {
      await res.body?.cancel();
      return;
    }
  }
  const res = await graphRaw(base, { method: "DELETE", permission: "Calendars.ReadWrite" });
  await res.body?.cancel(); // 204, or 404 = already gone
}

// ── sync ────────────────────────────────────────────────────────────────────

type LessonRow = {
  id: string;
  date: string;
  teacher_user_id: string | null;
  timetable_slots: {
    class_id: string;
    teacher_user_id: string | null;
    start_time: string;
    end_time: string;
    timetable_runs: { status: string } | null;
    classes: { name: string | null; meeting_url: string | null; is_test?: boolean | null } | null;
    subjects: { name: string | null } | null;
    virtual_sessions: { meeting_url: string | null } | null;
  } | null;
};

type MeetingRow = {
  id: string;
  lesson_instance_id: string | null;
  status: "active" | "cancelled" | "failed";
  teacher_user_id: string | null;
  organiser: string | null;
  organiser_id: string | null;
  event_id: string | null;
  join_url: string | null;
  starts_at: string | null;
  fingerprint: string | null;
  generation: number;
  invited: boolean;
};

export type SyncSummary = {
  enabled: boolean;
  reason?: string;
  lessons: number;
  created: number;
  updated: number;
  recreated: number;
  cancelled: number;
  failed: number;
  skipped_has_link: number;
  deferred: number;
  errors: string[];
  dry_run?: boolean;
};

async function loadLessons(sb: SupabaseClient, from: string, to: string): Promise<LessonRow[]> {
  const out: LessonRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("lesson_instances")
      .select(
        "id, date, teacher_user_id, timetable_slots!inner(class_id, teacher_user_id, start_time, end_time, timetable_runs!inner(status), classes(name, meeting_url, is_test), subjects(name), virtual_sessions(meeting_url))",
      )
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`lesson query failed: ${error.message}`);
    out.push(...((data as unknown as LessonRow[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function syncTeamsMeetings(sb: SupabaseClient, opts: { dryRun?: boolean; days?: number } = {}): Promise<SyncSummary> {
  const summary: SyncSummary = { enabled: teamsMeetingsEnabled(), lessons: 0, created: 0, updated: 0, recreated: 0, cancelled: 0, failed: 0, skipped_has_link: 0, deferred: 0, errors: [] };
  if (opts.dryRun) summary.dry_run = true;
  if (!summary.enabled) {
    summary.reason = !graphConfigured()
      ? "Microsoft 365 is not configured (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET)."
      : !meetingOrganiserFallback()
        ? "Teams meetings are off: set MS_MEETING_ORGANISER to switch them on."
        : "Teams meetings are switched off (MS_TEAMS_MEETINGS=0).";
    return summary;
  }

  const now = new Date();
  const from = schoolDate(now);
  const to = schoolDate(new Date(now.getTime() + (opts.days ?? syncDays()) * 86400000));
  const lessons = await loadLessons(sb, from, to);

  // Lessons that should have a Teams meeting.
  type Desired = { lesson: LessonRow; start: Date; end: Date; subject: string; teacherId: string | null; classId: string };
  const desired = new Map<string, Desired>();
  for (const l of lessons) {
    const s = l.timetable_slots;
    if (!s || s.timetable_runs?.status !== "published" || s.classes?.is_test) continue;
    if (s.classes?.meeting_url || s.virtual_sessions?.meeting_url) {
      summary.skipped_has_link++;
      continue;
    }
    const start = schoolTimeToUtc(l.date, s.start_time);
    const end = schoolTimeToUtc(l.date, s.end_time);
    if (end <= now) continue;
    const subject = `${s.subjects?.name || "Lesson"}${s.classes?.name ? ` — ${s.classes.name}` : ""}`.slice(0, 200);
    desired.set(l.id, { lesson: l, start, end, subject, teacherId: l.teacher_user_id || s.teacher_user_id, classId: s.class_id });
  }
  summary.lessons = desired.size;

  // Existing rows: everything for these lessons, plus any live/failed future rows (to cancel what's no longer wanted).
  const rows = new Map<string, MeetingRow>();
  const ids = Array.from(desired.keys());
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from("lesson_teams_meetings").select("*").in("lesson_instance_id", ids.slice(i, i + 150));
    if (error) throw new Error(`lesson_teams_meetings query failed: ${error.message}`);
    for (const r of (data as MeetingRow[]) || []) rows.set(r.id, r);
  }
  {
    const { data, error } = await sb
      .from("lesson_teams_meetings")
      .select("*")
      .in("status", ["active", "failed"])
      .or(`lesson_instance_id.is.null,starts_at.gt.${now.toISOString()}`);
    if (error) throw new Error(`lesson_teams_meetings query failed: ${error.message}`);
    for (const r of (data as MeetingRow[]) || []) rows.set(r.id, r);
  }
  const byLesson = new Map<string, MeetingRow>();
  for (const r of rows.values()) if (r.lesson_instance_id) byLesson.set(r.lesson_instance_id, r);

  // Teacher emails, and (only if switched on) parents' emails per class.
  const teacherIds = Array.from(new Set(Array.from(desired.values()).map((d) => d.teacherId).filter(Boolean) as string[]));
  const teacherEmail = new Map<string, string>();
  if (teacherIds.length) {
    const { data } = await sb.from("profiles").select("id, email").in("id", teacherIds);
    for (const p of (data as { id: string; email: string | null }[]) || []) if (p.email) teacherEmail.set(p.id, p.email.trim().toLowerCase());
  }
  const inviteTeacher = env("MS_TEAMS_INVITE_TEACHER") !== "0";
  const inviteFamilies = env("MS_TEAMS_INVITE_FAMILIES") === "1";
  const familyEmails = new Map<string, string[]>();
  if (inviteFamilies) {
    const classIds = Array.from(new Set(Array.from(desired.values()).map((d) => d.classId)));
    if (classIds.length) {
      const { data } = await sb.from("enrolments").select("class_id, children(parent_user_id, is_test)").in("class_id", classIds);
      const parentIds = new Set<string>();
      const parentsByClass = new Map<string, Set<string>>();
      for (const e of (data as unknown as { class_id: string; children: { parent_user_id: string; is_test?: boolean } | null }[]) || []) {
        if (!e.children?.parent_user_id || e.children.is_test) continue;
        parentIds.add(e.children.parent_user_id);
        parentsByClass.set(e.class_id, (parentsByClass.get(e.class_id) || new Set()).add(e.children.parent_user_id));
      }
      const { data: profs } = parentIds.size ? await sb.from("profiles").select("id, email").in("id", Array.from(parentIds)) : { data: [] };
      const emailOf = new Map(((profs as { id: string; email: string | null }[]) || []).map((p) => [p.id, (p.email || "").trim().toLowerCase()]));
      for (const [cid, pids] of parentsByClass) familyEmails.set(cid, Array.from(pids).map((pid) => emailOf.get(pid) || "").filter(realEmail));
    }
  }

  const resolver = new OrganiserResolver();
  const fallback = meetingOrganiserFallback().toLowerCase();
  let writes = 0;
  const budget = () => writes < MAX_WRITES_PER_RUN;
  const note = (msg: string) => {
    if (summary.errors.length < 20) summary.errors.push(msg.slice(0, 400));
  };
  const save = async (id: string | null, patch: Record<string, unknown>) => {
    if (opts.dryRun) return;
    const row = { ...patch, updated_at: new Date().toISOString() };
    const { error } = id ? await sb.from("lesson_teams_meetings").update(row).eq("id", id) : await sb.from("lesson_teams_meetings").insert(row);
    if (error) note(`database write failed: ${error.message}`);
  };

  // 1) Cancel meetings whose lesson is gone, superseded, or now has its own link. Never touch past meetings.
  for (const r of rows.values()) {
    if (r.status === "cancelled") continue;
    if (r.lesson_instance_id && desired.has(r.lesson_instance_id)) continue;
    if (r.starts_at && new Date(r.starts_at) <= now) {
      // Already happened: leave the calendar alone; just retire an orphaned row.
      if (!r.lesson_instance_id) await save(r.id, { status: "cancelled" });
      continue;
    }
    if (!budget()) {
      summary.deferred++;
      continue;
    }
    if (r.status === "active" && r.organiser && r.event_id) {
      try {
        writes++;
        if (!opts.dryRun) await cancelEvent(r.organiser, r.event_id, r.invited);
      } catch (e) {
        summary.failed++;
        note(`cancel failed: ${errText(e)}`);
        await save(r.id, { last_error: errText(e) });
        continue;
      }
    }
    summary.cancelled++;
    await save(r.id, { status: "cancelled", last_error: null });
  }

  // 2) Create / update / re-create for each wanted lesson.
  let stopReason: string | null = null;
  for (const [lessonId, d] of desired) {
    if (stopReason) break;
    const row = byLesson.get(lessonId);
    const tEmail = d.teacherId ? teacherEmail.get(d.teacherId) || null : null;
    const started = d.start <= now;
    const live = Boolean(row && row.status === "active" && row.event_id && row.join_url && row.organiser);
    if (live && started) continue; // never move or rebuild a lesson that is under way

    const attendeesFor = (organiserUpn: string): string[] => {
      const list: string[] = [];
      if (inviteTeacher && realEmail(tEmail) && tEmail !== organiserUpn.toLowerCase()) list.push(tEmail);
      if (inviteFamilies) list.push(...(familyEmails.get(d.classId) || []));
      return Array.from(new Set(list)).sort().slice(0, 300);
    };
    const fingerprintFor = (attendees: string[]) => sha(JSON.stringify([d.subject, d.start.toISOString(), d.end.toISOString(), attendees]));

    // Who should organise: the teacher's own mailbox if possible, else the shared one.
    const candidates: Organiser[] = [];
    const teacherChanged = live && (row!.teacher_user_id || null) !== (d.teacherId || null);
    if (!live || teacherChanged) {
      try {
        const t = await resolver.teacherMailbox(tEmail);
        if (t) candidates.push({ ...t, isTeacher: true });
      } catch (e) {
        note(`teacher lookup failed: ${errText(e)}`);
      }
      if (!candidates.some((c) => c.upn.toLowerCase() === fallback)) candidates.push({ upn: fallback, id: null, isTeacher: false });
    }
    // Cover by someone whose meeting would live in the same mailbox: keep the link, just update the event.
    const recreate = !live || (teacherChanged && candidates[0].upn.toLowerCase() !== (row!.organiser || "").toLowerCase());

    if (!recreate) {
      const attendees = attendeesFor(row!.organiser!);
      const fingerprint = await fingerprintFor(attendees);
      if (fingerprint === row!.fingerprint && !teacherChanged) continue;
      if (!budget()) {
        summary.deferred++;
        continue;
      }
      try {
        writes++;
        if (!opts.dryRun) {
          const res = await graphRaw(`/users/${encodeURIComponent(row!.organiser!)}/events/${encodeURIComponent(row!.event_id!)}`, {
            method: "PATCH",
            permission: "Calendars.ReadWrite",
            body: eventBody({ subject: d.subject, start: d.start, end: d.end, attendees }),
          });
          await res.body?.cancel();
          if (res.status === 404) {
            // Deleted in Outlook: mark failed so the next run re-creates it.
            summary.failed++;
            await save(row!.id, { status: "failed", last_error: "The calendar event was deleted in Outlook; it will be re-created on the next sync." });
            continue;
          }
        }
        summary.updated++;
        await save(row!.id, {
          teacher_user_id: d.teacherId,
          subject: d.subject,
          starts_at: d.start.toISOString(),
          ends_at: d.end.toISOString(),
          fingerprint,
          invited: row!.invited || attendees.length > 0,
          last_error: null,
        });
      } catch (e) {
        summary.failed++;
        note(errText(e));
        await save(row!.id, { last_error: errText(e) });
        if (isTenantWide(e)) stopReason = errText(e);
      }
      continue;
    }

    if (!budget()) {
      summary.deferred++;
      continue;
    }
    const generation = (row?.generation || 0) + 1;
    if (live) {
      // New teacher in a different mailbox: cancel the old event first.
      try {
        writes++;
        if (!opts.dryRun) await cancelEvent(row!.organiser!, row!.event_id!, row!.invited);
      } catch (e) {
        summary.failed++;
        note(`cancel before re-create failed: ${errText(e)}`);
        await save(row!.id, { last_error: errText(e) });
        if (isTenantWide(e)) stopReason = errText(e);
        continue;
      }
    }

    let made: CreatedEvent | null = null;
    let lastErr: unknown = null;
    let lastWasFallback = false;
    for (const org of candidates) {
      const attendees = attendeesFor(org.upn);
      lastWasFallback = !org.isTeacher;
      try {
        writes++;
        made = opts.dryRun
          ? { eventId: "(dry run)", joinUrl: "https://teams.microsoft.com/l/meetup-join/dry-run", organiser: org }
          : { ...(await createEventIn(org.upn, { subject: d.subject, start: d.start, end: d.end, attendees }, `tga-lesson-${lessonId}-${generation}-${await sha(org.upn)}`)), organiser: org };
        await save(row?.id || null, {
          lesson_instance_id: lessonId,
          status: "active",
          teacher_user_id: d.teacherId,
          organiser: org.upn,
          organiser_id: org.id || organiserIdFromJoinUrl(made.joinUrl),
          event_id: made.eventId,
          join_url: made.joinUrl,
          online_meeting_id: null,
          subject: d.subject,
          starts_at: d.start.toISOString(),
          ends_at: d.end.toISOString(),
          fingerprint: await fingerprintFor(attendees),
          generation,
          invited: attendees.length > 0,
          last_error: null,
          attendance_status: teamsAttendanceEnabled() ? "pending" : "off",
          attendance_attempts: 0,
          attendance_fetched_at: null,
          unmatched_attendees: null,
        });
        break;
      } catch (e) {
        made = null;
        lastErr = e;
        if (org.isTeacher && tEmail) resolver.unusable.add(tEmail);
        if (!mailboxSpecific(e)) break; // e.g. sign-in failure: no point trying another mailbox
      }
    }
    if (made) {
      if (live) summary.recreated++;
      else summary.created++;
      continue;
    }
    summary.failed++;
    note(errText(lastErr));
    await save(row?.id || null, {
      lesson_instance_id: lessonId,
      status: "failed",
      teacher_user_id: d.teacherId,
      subject: d.subject,
      starts_at: d.start.toISOString(),
      ends_at: d.end.toISOString(),
      generation,
      last_error: errText(lastErr),
      ...(row ? {} : { attendance_status: "off" }),
    });
    // If even the shared organiser mailbox is refused, every lesson will fail the same way: stop and report.
    if (isTenantWide(lastErr) || (lastWasFallback && lastErr instanceof GraphError && lastErr.status === 403)) stopReason = errText(lastErr);
  }
  if (stopReason) summary.reason = `Stopped early: ${stopReason}`;

  return summary;
}

// ── attendance ──────────────────────────────────────────────────────────────

type AttendanceRecord = {
  emailAddress?: string | null;
  role?: string | null;
  totalAttendanceInSeconds?: number | null;
  identity?: { id?: string | null } | null;
  attendanceIntervals?: { joinDateTime?: string | null; leaveDateTime?: string | null; durationInSeconds?: number | null }[] | null;
};

export type AttendanceSummary = { enabled: boolean; reason?: string; meetings: number; done: number; waiting: number; no_report: number; failed: number; pupils: number; errors: string[] };

/** Fetch Teams attendance for lessons that ended 15+ minutes ago (up to 7 days back). */
export async function syncTeamsAttendance(sb: SupabaseClient, opts: { lessonInstanceId?: string } = {}): Promise<AttendanceSummary> {
  const summary: AttendanceSummary = { enabled: teamsAttendanceEnabled(), meetings: 0, done: 0, waiting: 0, no_report: 0, failed: 0, pupils: 0, errors: [] };
  if (!summary.enabled) {
    summary.reason = "Teams attendance is off (set MS_TEAMS_ATTENDANCE=1 once the access policy is in place).";
    return summary;
  }
  const now = Date.now();
  let q = sb
    .from("lesson_teams_meetings")
    .select("id, lesson_instance_id, organiser, organiser_id, join_url, online_meeting_id, starts_at, ends_at, attendance_attempts")
    .eq("status", "active")
    .not("join_url", "is", null)
    .not("lesson_instance_id", "is", null)
    .lte("ends_at", new Date(now - 15 * 60000).toISOString())
    .gte("ends_at", new Date(now - 7 * 86400000).toISOString())
    .in("attendance_status", ["pending", "error", "off"])
    .lt("attendance_attempts", 8)
    .order("ends_at", { ascending: false })
    .limit(40);
  if (opts.lessonInstanceId) q = q.eq("lesson_instance_id", opts.lessonInstanceId);
  const { data, error } = await q;
  if (error) throw new Error(`lesson_teams_meetings query failed: ${error.message}`);
  const meetings = (data as {
    id: string;
    lesson_instance_id: string;
    organiser: string | null;
    organiser_id: string | null;
    join_url: string;
    online_meeting_id: string | null;
    starts_at: string;
    ends_at: string;
    attendance_attempts: number;
  }[]) || [];
  summary.meetings = meetings.length;

  for (const m of meetings) {
    const attempts = (m.attendance_attempts || 0) + 1;
    try {
      const oid = m.organiser_id || organiserIdFromJoinUrl(m.join_url);
      if (!oid) throw new Error("Could not work out the organiser's Microsoft 365 id for this meeting.");
      let meetingId = m.online_meeting_id;
      if (!meetingId) {
        const found = await graphFetch<{ value?: { id: string }[] }>(
          `/users/${encodeURIComponent(oid)}/onlineMeetings?$filter=${encodeURIComponent(`JoinWebUrl eq '${m.join_url}'`)}`,
          { permission: "OnlineMeetings.Read.All" },
        );
        meetingId = found?.value?.[0]?.id || null;
        if (!meetingId) throw new Error("Teams could not find the online meeting for this join link.");
        await sb.from("lesson_teams_meetings").update({ online_meeting_id: meetingId, organiser_id: oid }).eq("id", m.id);
      }
      const base = `/users/${encodeURIComponent(oid)}/onlineMeetings/${encodeURIComponent(meetingId)}/attendanceReports`;
      const reports = await graphFetchAll<{ id: string; meetingStartDateTime?: string; meetingEndDateTime?: string }>(base, { permission: "OnlineMeetingArtifact.Read.All" }, 3);
      // Only sessions overlapping this lesson (± 2 hours), in case the link was reused.
      const lo = new Date(m.starts_at).getTime() - 2 * 3600000;
      const hi = new Date(m.ends_at).getTime() + 2 * 3600000;
      const relevant = reports.filter((r) => {
        const s = r.meetingStartDateTime ? Date.parse(r.meetingStartDateTime) : NaN;
        return Number.isNaN(s) || (s >= lo && s <= hi);
      });
      if (relevant.length === 0) {
        const hoursSinceEnd = (now - new Date(m.ends_at).getTime()) / 3600000;
        if (hoursSinceEnd > 24) {
          summary.no_report++;
          await sb.from("lesson_teams_meetings").update({ attendance_status: "no_report", attendance_attempts: attempts, attendance_fetched_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", m.id);
        } else {
          summary.waiting++;
          await sb.from("lesson_teams_meetings").update({ attendance_status: "pending", attendance_attempts: attempts, updated_at: new Date().toISOString() }).eq("id", m.id);
        }
        continue;
      }
      const records: AttendanceRecord[] = [];
      for (const r of relevant) {
        records.push(...(await graphFetchAll<AttendanceRecord>(`${base}/${encodeURIComponent(r.id)}/attendanceRecords`, { permission: "OnlineMeetingArtifact.Read.All" }, 10)));
      }
      const { matched, unmatched } = await matchAttendance(sb, m.lesson_instance_id, records);
      if (matched.length) {
        const { error: upErr } = await sb.from("lesson_teams_attendance").upsert(matched, { onConflict: "lesson_instance_id,child_id" });
        if (upErr) throw new Error(`saving attendance failed: ${upErr.message}`);
      }
      summary.pupils += matched.length;
      summary.done++;
      await sb
        .from("lesson_teams_meetings")
        .update({ attendance_status: "done", attendance_attempts: attempts, attendance_fetched_at: new Date().toISOString(), unmatched_attendees: unmatched, updated_at: new Date().toISOString() })
        .eq("id", m.id);
    } catch (e) {
      summary.failed++;
      const msg = String((e as Error).message || e).slice(0, 500);
      if (summary.errors.length < 10) summary.errors.push(msg);
      await sb.from("lesson_teams_meetings").update({ attendance_status: "error", attendance_attempts: attempts, last_error: msg, updated_at: new Date().toISOString() }).eq("id", m.id);
      // Missing permission / access policy affects every meeting: stop and report.
      if (e instanceof GraphError && (e.status === 403 || e.code === "token_failed")) break;
    }
  }
  return summary;
}

/** Match Teams attendees to enrolled pupils by email: pupil's Microsoft email, pupil's portal sign-in, then parent's email. */
async function matchAttendance(sb: SupabaseClient, lessonInstanceId: string, records: AttendanceRecord[]) {
  const { data: li } = await sb.from("lesson_instances").select("timetable_slots(class_id)").eq("id", lessonInstanceId).maybeSingle();
  const classId = (li as unknown as { timetable_slots: { class_id: string } | null } | null)?.timetable_slots?.class_id;
  const byEmail = new Map<string, { childIds: string[]; how: "pupil_account" | "microsoft_email" | "parent_account" }>();
  if (classId) {
    const { data: enr } = await sb.from("enrolments").select("child_id, children(id, parent_user_id, microsoft_email)").eq("class_id", classId);
    const kids = ((enr as unknown as { child_id: string; children: { id: string; parent_user_id: string; microsoft_email: string | null } | null }[]) || []).filter((e) => e.children);
    const childIds = kids.map((k) => k.child_id);
    const { data: accts } = childIds.length ? await sb.from("student_accounts").select("child_id, profile_id").in("child_id", childIds) : { data: [] };
    const profileIds = new Set<string>();
    for (const a of (accts as { child_id: string; profile_id: string | null }[]) || []) if (a.profile_id) profileIds.add(a.profile_id);
    for (const k of kids) profileIds.add(k.children!.parent_user_id);
    const { data: profs } = profileIds.size ? await sb.from("profiles").select("id, email").in("id", Array.from(profileIds)) : { data: [] };
    const emailOf = new Map(((profs as { id: string; email: string | null }[]) || []).map((p) => [p.id, (p.email || "").trim().toLowerCase()]));
    const put = (email: string | null | undefined, childId: string, how: "pupil_account" | "microsoft_email" | "parent_account") => {
      if (!realEmail(email)) return;
      const key = email.trim().toLowerCase();
      const cur = byEmail.get(key);
      const rank = { microsoft_email: 0, pupil_account: 1, parent_account: 2 } as const;
      if (!cur || rank[how] < rank[cur.how]) byEmail.set(key, { childIds: [childId], how });
      else if (cur.how === how && !cur.childIds.includes(childId)) cur.childIds.push(childId);
    };
    for (const k of kids) put(k.children!.microsoft_email, k.child_id, "microsoft_email");
    for (const a of (accts as { child_id: string; profile_id: string | null }[]) || []) if (a.profile_id) put(emailOf.get(a.profile_id), a.child_id, "pupil_account");
    for (const k of kids) put(emailOf.get(k.children!.parent_user_id), k.child_id, "parent_account");
  }

  type Agg = { first: number | null; last: number | null; seconds: number; how: "pupil_account" | "microsoft_email" | "parent_account" };
  const agg = new Map<string, Agg>();
  let unmatched = 0;
  for (const r of records) {
    if (/organi[sz]er/i.test(r.role || "")) continue;
    const hit = r.emailAddress ? byEmail.get(r.emailAddress.trim().toLowerCase()) : undefined;
    if (!hit) {
      unmatched++;
      continue;
    }
    const intervals = r.attendanceIntervals || [];
    const joins = intervals.map((i) => (i.joinDateTime ? Date.parse(i.joinDateTime) : NaN)).filter((n) => !Number.isNaN(n));
    const leaves = intervals.map((i) => (i.leaveDateTime ? Date.parse(i.leaveDateTime) : NaN)).filter((n) => !Number.isNaN(n));
    const seconds = Number(r.totalAttendanceInSeconds) || intervals.reduce((t, i) => t + (Number(i.durationInSeconds) || 0), 0);
    for (const childId of hit.childIds) {
      const a = agg.get(childId) || { first: null, last: null, seconds: 0, how: hit.how };
      if (joins.length) a.first = Math.min(a.first ?? Infinity, ...joins);
      if (leaves.length) a.last = Math.max(a.last ?? -Infinity, ...leaves);
      a.seconds += seconds;
      agg.set(childId, a);
    }
  }
  const fetchedAt = new Date().toISOString();
  const matched = Array.from(agg.entries()).map(([childId, a]) => ({
    lesson_instance_id: lessonInstanceId,
    child_id: childId,
    first_join_at: a.first !== null ? new Date(a.first).toISOString() : null,
    last_leave_at: a.last !== null ? new Date(a.last).toISOString() : null,
    total_seconds: Math.max(0, Math.round(a.seconds)),
    matched_by: a.how,
    fetched_at: fetchedAt,
  }));
  return { matched, unmatched };
}

/** Run a promise after the response has been sent (Supabase Edge Runtime), or just let it run. Never throws. */
export function runInBackground(p: Promise<unknown>): void {
  const safe = p.catch((e) => console.error("background task failed:", e));
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
}
