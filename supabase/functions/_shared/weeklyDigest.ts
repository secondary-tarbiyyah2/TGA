// Builds the Friday parent digest: ONE email per family (parent) with a
// section per child covering the week so far -- attendance, homework,
// merits, teacher comments -- plus next week's lessons from the published
// timetable. Shared by the `weekly-digest` Edge Function (cron + admin
// preview). Runs with the service-role client; callers authorise first.
//
// Tone: positive and factual. Demerits and incident notes are NEVER read
// here (merits only), and a missed lesson/homework is stated plainly
// without scolding.
import { emailShell } from "./resend.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const TZ = "Europe/London";
const GOLD = "#B08E45";
const MUTED = "#6b6b6b";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ── UK date helpers (YYYY-MM-DD strings, no time zones to trip over) ─────
export function ukNow(d: Date = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** The instant UK local midnight starts on `date` (handles BST/GMT). */
export function ukMidnight(date: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const offsetHours = ukNow(guess).hour; // UK clock reading at 00:00 UTC: 0 (GMT) or 1 (BST)
  return new Date(guess.getTime() - offsetHours * 3600_000);
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const hhmm = (t: string) => String(t || "").slice(0, 5);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const firstName = (name: string) => String(name || "").trim().split(/\s+/)[0] || "your child";

// ── data ────────────────────────────────────────────────────────────────
export type FamilyChild = { id: string; name: string; yearGroup: string | null };
export type Family = { parentId: string; parentName: string; parentEmail: string; children: FamilyChild[] };

/** Week the digest covers: Monday..Sunday of the UK week containing `onDate`. */
export function weekFor(onDate: string): { weekStart: string; weekEnd: string; nextStart: string; nextEnd: string } {
  const weekStart = mondayOf(onDate);
  return { weekStart, weekEnd: addDays(weekStart, 6), nextStart: addDays(weekStart, 7), nextEnd: addDays(weekStart, 13) };
}

/** Parents with at least one child (optionally one parent only), with their email. */
export async function loadFamilies(
  service: Service,
  opts: { parentId?: string; includeTest?: boolean },
): Promise<{ families: Family[]; optedOut: Set<string> }> {
  let q = service.from("children").select("id, name, parent_user_id, is_test, year_groups(name)").order("name");
  if (opts.parentId) q = q.eq("parent_user_id", opts.parentId);
  if (!opts.includeTest) q = q.eq("is_test", false);
  const { data: kids, error } = await q;
  if (error) throw new Error(`children: ${error.message}`);

  const byParent = new Map<string, FamilyChild[]>();
  for (const k of (kids || []) as Row[]) {
    const yg = Array.isArray(k.year_groups) ? k.year_groups[0]?.name : k.year_groups?.name;
    const list = byParent.get(k.parent_user_id) || [];
    list.push({ id: k.id, name: k.name, yearGroup: yg || null });
    byParent.set(k.parent_user_id, list);
  }
  const parentIds = [...byParent.keys()];
  const families: Family[] = [];
  const optedOut = new Set<string>();

  for (let i = 0; i < parentIds.length; i += 50) {
    const slice = parentIds.slice(i, i + 50);
    const [{ data: profiles, error: pErr }, { data: prefs }] = await Promise.all([
      service.from("profiles").select("id, full_name, email").in("id", slice),
      service.from("parent_preferences").select("user_id").eq("digest_opt_out", true).in("user_id", slice),
    ]);
    if (pErr) throw new Error(`profiles: ${pErr.message}`);
    for (const p of (prefs || []) as Row[]) optedOut.add(p.user_id);
    for (const p of (profiles || []) as Row[]) {
      if (!p.email) continue;
      families.push({ parentId: p.id, parentName: p.full_name || "", parentEmail: p.email, children: byParent.get(p.id) || [] });
    }
  }
  return { families, optedOut };
}

type ChildWeek = {
  child: FamilyChild;
  classNames: string[];
  attended: number;
  late: number;
  absent: number;
  total: number;
  hwHandedIn: Row[];
  hwToDo: Row[];
  hwNext: Row[];
  merits: Row[];
  meritPoints: number;
  comments: { source: string; text: string }[];
  star: { reason: string; className: string } | null;
  nextDays: { date: string; lessons: string[]; closure: string | null }[];
};

/** All the week's data for a batch of children (kept small to bound URL length). */
async function loadChildWeeks(service: Service, children: FamilyChild[], week: ReturnType<typeof weekFor>): Promise<Map<string, ChildWeek>> {
  const childIds = children.map((c) => c.id);
  const out = new Map<string, ChildWeek>();
  for (const c of children) {
    out.set(c.id, {
      child: c,
      classNames: [],
      attended: 0,
      late: 0,
      absent: 0,
      total: 0,
      hwHandedIn: [],
      hwToDo: [],
      hwNext: [],
      merits: [],
      meritPoints: 0,
      comments: [],
      star: null,
      nextDays: [],
    });
  }
  if (childIds.length === 0) return out;

  const weekStartAt = ukMidnight(week.weekStart);
  const weekEndAt = ukMidnight(addDays(week.weekEnd, 1));
  const nextEndAt = ukMidnight(addDays(week.nextEnd, 1));
  const lookbackAt = ukMidnight(addDays(week.weekStart, -14));

  const { data: enrols } = await service.from("enrolments").select("child_id, class_id, classes(name)").in("child_id", childIds);
  const classIdsByChild = new Map<string, string[]>();
  const classNameById = new Map<string, string>();
  for (const e of (enrols || []) as Row[]) {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
    classNameById.set(e.class_id, cls?.name || "Class");
    classIdsByChild.set(e.child_id, [...(classIdsByChild.get(e.child_id) || []), e.class_id]);
    out.get(e.child_id)?.classNames.push(cls?.name || "Class");
  }
  const classIds = [...new Set([...classIdsByChild.values()].flat())];

  // Attendance (this week).
  const { data: att } = await service
    .from("attendance_records")
    .select("child_id, status, lesson_instances!inner(date)")
    .in("child_id", childIds)
    .gte("lesson_instances.date", week.weekStart)
    .lte("lesson_instances.date", week.weekEnd);
  for (const a of (att || []) as Row[]) {
    const w = out.get(a.child_id);
    if (!w) continue;
    w.total++;
    if (a.status === "present") w.attended++;
    else if (a.status === "late") {
      w.attended++;
      w.late++;
    } else if (a.status === "absent") w.absent++;
  }

  // Homework: due from two weeks back to the end of next week, with this
  // child's submission (if any).
  if (classIds.length > 0) {
    const { data: hws } = await service
      .from("homework")
      .select("id, class_id, title, due_at")
      .in("class_id", classIds)
      .gte("due_at", lookbackAt.toISOString())
      .lt("due_at", nextEndAt.toISOString())
      .order("due_at", { ascending: true });
    const hwIds = ((hws || []) as Row[]).map((h) => h.id);
    const subs = new Map<string, Row>();
    for (let i = 0; i < hwIds.length; i += 60) {
      const { data: s } = await service
        .from("homework_submissions")
        .select("homework_id, child_id, submitted_at")
        .in("homework_id", hwIds.slice(i, i + 60))
        .in("child_id", childIds);
      for (const r of (s || []) as Row[]) if (r.submitted_at) subs.set(`${r.homework_id}:${r.child_id}`, r);
    }
    for (const c of children) {
      const w = out.get(c.id)!;
      const mine = new Set(classIdsByChild.get(c.id) || []);
      for (const h of (hws || []) as Row[]) {
        if (!mine.has(h.class_id)) continue;
        const due = new Date(h.due_at).getTime();
        const item = { title: h.title, className: classNameById.get(h.class_id) || "", due: ukDay(h.due_at), late: false };
        const sub = subs.get(`${h.id}:${c.id}`);
        if (due >= weekEndAt.getTime()) {
          w.hwNext.push(item);
        } else if (sub) {
          // Only list hand-ins for work that fell due this week.
          if (due >= weekStartAt.getTime()) {
            item.late = new Date(sub.submitted_at).getTime() > due;
            w.hwHandedIn.push(item);
          }
        } else {
          // Not handed in: overdue (up to two weeks back) or still to come this week.
          w.hwToDo.push(item);
        }
      }
    }
  }

  // Merits (positive only) and the notes teachers wrote with them.
  const { data: merits } = await service
    .from("behaviour_records")
    .select("child_id, points, category, note, occurred_on")
    .in("child_id", childIds)
    .eq("kind", "merit")
    .gt("points", 0)
    .is("voided_at", null)
    .gte("occurred_on", week.weekStart)
    .lte("occurred_on", week.weekEnd)
    .order("occurred_on", { ascending: true });
  for (const m of (merits || []) as Row[]) {
    const w = out.get(m.child_id);
    if (!w) continue;
    w.merits.push(m);
    w.meritPoints += Number(m.points) || 0;
    if (m.note && String(m.note).trim()) w.comments.push({ source: `Merit: ${m.category}`, text: String(m.note).trim() });
  }

  // Released homework feedback from this week.
  const { data: marks } = await service
    .from("homework_marks")
    .select("feedback, grade, released_at, homework_submissions!inner(child_id, homework(title))")
    .eq("released", true)
    .gte("released_at", weekStartAt.toISOString())
    .lt("released_at", weekEndAt.toISOString())
    .in("homework_submissions.child_id", childIds);
  for (const m of (marks || []) as Row[]) {
    const sub = Array.isArray(m.homework_submissions) ? m.homework_submissions[0] : m.homework_submissions;
    const w = sub ? out.get(sub.child_id) : undefined;
    if (!w) continue;
    const hw = Array.isArray(sub.homework) ? sub.homework[0] : sub.homework;
    const text = [m.grade ? `Grade ${String(m.grade).trim()}` : "", m.feedback ? String(m.feedback).trim() : ""].filter(Boolean).join(". ");
    if (text) w.comments.push({ source: `Homework: ${hw?.title || "feedback"}`, text });
  }

  // Star of the week (approved), a small celebratory line.
  const { data: stars } = await service
    .from("star_of_the_week")
    .select("child_id, reason, classes(name)")
    .eq("week_start", week.weekStart)
    .eq("status", "approved")
    .in("child_id", childIds);
  for (const s of (stars || []) as Row[]) {
    const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
    const w = out.get(s.child_id);
    if (w) w.star = { reason: s.reason, className: cls?.name || "" };
  }

  // Next week's lessons from the published timetable (minus closures).
  if (classIds.length > 0) {
    const [{ data: slots }, { data: closures }] = await Promise.all([
      service
        .from("timetable_slots")
        .select("class_id, weekday, start_time, end_time, subjects(name), timetable_runs!inner(status)")
        .in("class_id", classIds)
        .eq("timetable_runs.status", "published"),
      service.from("school_closures").select("name, starts_on, ends_on").lte("starts_on", week.nextEnd).gte("ends_on", week.nextStart),
    ]);
    for (const c of children) {
      const w = out.get(c.id)!;
      const mine = new Set(classIdsByChild.get(c.id) || []);
      for (let i = 0; i < 7; i++) {
        const date = addDays(week.nextStart, i);
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const closure = ((closures || []) as Row[]).find((cl) => cl.starts_on <= date && cl.ends_on >= date);
        const lessons = ((slots || []) as Row[])
          .filter((s) => mine.has(s.class_id) && s.weekday === weekday)
          .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
          .map((s) => {
            const subj = Array.isArray(s.subjects) ? s.subjects[0] : s.subjects;
            return `${hhmm(s.start_time)}–${hhmm(s.end_time)} ${subj?.name || classNameById.get(s.class_id) || "Lesson"}`;
          });
        if (closure) {
          if (weekday >= 1 && weekday <= 5) w.nextDays.push({ date, lessons: [], closure: closure.name });
        } else if (lessons.length > 0) {
          w.nextDays.push({ date, lessons, closure: null });
        }
      }
    }
  }

  return out;
}

// ── rendering ───────────────────────────────────────────────────────────
const H3 = `margin:18px 0 6px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${GOLD};`;
const P = "margin:0 0 6px;font-size:14px;line-height:1.5;";
const UL = "margin:0 0 6px;padding-left:20px;font-size:14px;line-height:1.5;";

function renderChild(w: ChildWeek): string {
  const name = esc(w.child.name);
  const fn = esc(firstName(w.child.name));
  let h = `<div style="margin:0 0 28px;padding:0 0 4px;">
    <h2 style="margin:0 0 4px;font-size:20px;">${name}${w.child.yearGroup ? ` <span style="font-size:13px;font-weight:normal;color:${MUTED};">${esc(w.child.yearGroup)}</span>` : ""}</h2>`;

  if (w.star) {
    h += `<p style="margin:8px 0;padding:10px 12px;background:#FDF6E3;border-left:3px solid ${GOLD};font-size:14px;line-height:1.5;">&#9733; <strong>${fn} was Star of the Week${w.star.className ? ` in ${esc(w.star.className)}` : ""}!</strong><br>${esc(w.star.reason)}</p>`;
  }

  // Attendance
  h += `<h3 style="${H3}">Attendance</h3>`;
  if (w.total === 0) {
    h += `<p style="${P}">No lessons were registered this week.</p>`;
  } else {
    h += `<p style="${P}">${fn} attended <strong>${w.attended} of ${w.total}</strong> lessons${w.late > 0 ? ` (${w.late} arrived late)` : ""}.`;
    if (w.absent > 0) h += ` ${w.absent} ${w.absent === 1 ? "lesson was" : "lessons were"} missed &ndash; if you haven&rsquo;t already, please let the school know the reason.`;
    h += `</p>`;
  }

  // Homework
  h += `<h3 style="${H3}">Homework</h3>`;
  if (w.hwHandedIn.length === 0 && w.hwToDo.length === 0 && w.hwNext.length === 0) {
    h += `<p style="${P}">No homework was due this week.</p>`;
  } else {
    if (w.hwHandedIn.length > 0) {
      h += `<p style="${P}"><strong>Handed in</strong></p><ul style="${UL}">${w.hwHandedIn
        .map((i) => `<li>${esc(i.title)}${i.className ? ` <span style="color:${MUTED};">(${esc(i.className)})</span>` : ""}${i.late ? ` <span style="color:${MUTED};">&ndash; handed in after the deadline</span>` : ""}</li>`)
        .join("")}</ul>`;
    }
    if (w.hwToDo.length > 0) {
      h += `<p style="${P}"><strong>Still to hand in</strong></p><ul style="${UL}">${w.hwToDo
        .map((i) => `<li>${esc(i.title)}${i.className ? ` <span style="color:${MUTED};">(${esc(i.className)})</span>` : ""} <span style="color:${MUTED};">&ndash; due ${esc(i.due)}</span></li>`)
        .join("")}</ul>`;
    }
    if (w.hwHandedIn.length > 0 && w.hwToDo.length === 0) h += `<p style="${P}">Everything due so far has been handed in. Well done!</p>`;
    if (w.hwNext.length > 0) {
      h += `<p style="${P}"><strong>Due next week</strong></p><ul style="${UL}">${w.hwNext
        .map((i) => `<li>${esc(i.title)}${i.className ? ` <span style="color:${MUTED};">(${esc(i.className)})</span>` : ""} <span style="color:${MUTED};">&ndash; ${esc(i.due)}</span></li>`)
        .join("")}</ul>`;
    }
  }

  // Merits
  h += `<h3 style="${H3}">Merits</h3>`;
  if (w.merits.length === 0) {
    h += `<p style="${P}">No merits recorded this week.</p>`;
  } else {
    h += `<p style="${P}">${fn} earned <strong>${w.meritPoints} merit ${w.meritPoints === 1 ? "point" : "points"}</strong> this week.</p><ul style="${UL}">${w.merits
      .slice(0, 6)
      .map((m) => `<li>${esc(m.category)} <span style="color:${MUTED};">(+${esc(m.points)}, ${esc(shortDate(m.occurred_on))})</span></li>`)
      .join("")}</ul>`;
  }

  // Teacher comments
  if (w.comments.length > 0) {
    h += `<h3 style="${H3}">Teacher comments</h3>`;
    h += w.comments
      .slice(0, 6)
      .map((c) => `<p style="${P}"><span style="color:${MUTED};font-size:12px;">${esc(c.source)}</span><br><em>&ldquo;${esc(clip(c.text, 300))}&rdquo;</em></p>`)
      .join("");
  }

  // Next week
  h += `<h3 style="${H3}">Next week&rsquo;s lessons</h3>`;
  if (w.nextDays.length === 0) {
    h += `<p style="${P}">No lessons are on the timetable for next week.</p>`;
  } else {
    h += `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;width:100%;">${w.nextDays
      .map(
        (d) =>
          `<tr><td style="padding:3px 12px 3px 0;vertical-align:top;white-space:nowrap;color:${MUTED};">${esc(dayLabel(d.date))}</td><td style="padding:3px 0;">${
            d.closure ? `<em>No lessons &ndash; ${esc(d.closure)}</em>` : d.lessons.map((l) => esc(l)).join("<br>")
          }</td></tr>`,
      )
      .join("")}</table>`;
  }
  return h + `</div>`;
}

export type DigestResult = { subject: string; html: string; childCount: number } | null;

function renderFamilyDigest(family: Family, weeks: Map<string, ChildWeek>, week: ReturnType<typeof weekFor>, opts: { testBanner?: string }): DigestResult {
  const ordered = family.children.map((c) => weeks.get(c.id)).filter((w): w is ChildWeek => Boolean(w));
  if (ordered.length === 0 || ordered.every((w) => w.classNames.length === 0)) return null;

  const names = ordered.map((w) => firstName(w.child.name));
  const joined = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const greeting = family.parentName.trim() ? `Assalamu alaykum ${esc(family.parentName.trim())},` : "Assalamu alaykum,";

  const body = `
    ${opts.testBanner ? `<p style="margin:0 0 16px;padding:8px 12px;background:#FFF3CD;border:1px solid #E5C76B;font-size:13px;">${esc(opts.testBanner)}</p>` : ""}
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">Week of ${esc(shortDate(week.weekStart))} &ndash; ${esc(shortDate(week.weekEnd))}</p>
    <h1 style="margin:0 0 12px;font-size:22px;">${esc(joined)}&rsquo;s week</h1>
    <p style="${P}">${greeting}</p>
    <p style="${P}margin-bottom:20px;">Here is a summary of the week and what is coming up.</p>
    ${ordered.map(renderChild).join(`<hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;">`)}
    <p style="margin:8px 0 18px;"><a href="${LEARN_SITE_URL}/family/dashboard" style="color:${GOLD};">Open the family dashboard &rarr;</a></p>
    <p style="margin:0;font-size:12px;color:#777;line-height:1.5;">You receive this every Friday because you are a parent at Tarbiyyah Global Academy.
      You can switch it off any time under &ldquo;Weekly email&rdquo; on your <a href="${LEARN_SITE_URL}/family/dashboard" style="color:#777;">family dashboard</a>.</p>`;

  const subject = `${opts.testBanner ? "[TEST] " : ""}${joined}'s week at Tarbiyyah (${shortDate(week.weekStart)})`.replace(/[\r\n]+/g, " ");
  return { subject, html: emailShell(body), childCount: ordered.length };
}

/**
 * Builds the digest for a small group of families (callers chunk to ~10 so the
 * per-child queries stay short). Families whose children are not enrolled in
 * any class map to null.
 */
export async function buildDigests(
  service: Service,
  families: Family[],
  week: ReturnType<typeof weekFor>,
  opts: { testBanner?: string } = {},
): Promise<Map<string, DigestResult>> {
  const weeks = await loadChildWeeks(service, families.flatMap((f) => f.children), week);
  const out = new Map<string, DigestResult>();
  for (const f of families) out.set(f.parentId, renderFamilyDigest(f, weeks, week, opts));
  return out;
}
