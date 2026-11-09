// Action centre: one list of what needs doing for each role, most urgent first.
// Everything is COMPUTED at read time from existing tables (homework_status / homework_attention,
// absence_followups, Qur'an marks and sessions), so an item disappears by itself as soon as the underlying
// thing is done: nobody ticks anything twice. Reads are RLS-scoped, so each role only sees its own people.

import { attachHomework } from "@/lib/learn/homeworkStatus";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { MARK_COLUMNS, nextSession, pupilStats, revisionRows, todayISO, type QuranMark, type Session } from "@/lib/learn/quranClassroom";
import { reviewState, type RegisterRow } from "@/lib/learn/send";
import { fetchAbsences, fetchNotes } from "@/components/learn/absences/data";
import { shiftDateKey, ukNowHm, ukToday } from "@/lib/learn/ukTime";

export type Urgency = "now" | "soon" | "info";
export type ActionArea =
  | "Homework"
  | "Marking"
  | "Qur'an"
  | "Absence"
  | "Registers"
  | "Signatures"
  | "Child details"
  | "SEND"
  | "Pupils"
  | "Safeguarding"
  | "Admissions"
  | "Recruitment"
  | "Revision"
  | "Curriculum";
export type ActionItem = { id: string; area: ActionArea; urgency: Urgency; title: string; detail: string; href: string; cta: string; who?: string; people?: { id: string; name: string }[] };
export type Role = "teach" | "admin" | "student" | "family";

/** The Action centre's categories, in the order they are listed. Each item's
 * `area` puts it in exactly one category. */
export type CategoryKey = "safeguarding" | "attendance" | "classwork" | "curriculum" | "pupils" | "quran" | "admissions" | "recruitment" | "documents";
export type CategoryIcon = "shieldAlert" | "userCheck" | "notebookPen" | "backpack" | "bookMarked" | "userRoundPlus" | "briefcase" | "fileCheck" | "bookOpen";
export const CATEGORIES: { key: CategoryKey; label: string; icon: CategoryIcon; areas: ActionArea[] }[] = [
  { key: "safeguarding", label: "Safeguarding", icon: "shieldAlert", areas: ["Safeguarding"] },
  { key: "attendance", label: "Attendance", icon: "userCheck", areas: ["Registers", "Absence"] },
  { key: "classwork", label: "Classwork", icon: "notebookPen", areas: ["Homework", "Marking", "Revision"] },
  { key: "curriculum", label: "Curriculum", icon: "bookOpen", areas: ["Curriculum"] },
  { key: "pupils", label: "Pupils and SEND", icon: "backpack", areas: ["SEND", "Child details", "Pupils"] },
  { key: "quran", label: "Qur'an", icon: "bookMarked", areas: ["Qur'an"] },
  { key: "admissions", label: "Admissions", icon: "userRoundPlus", areas: ["Admissions"] },
  { key: "recruitment", label: "Recruitment", icon: "briefcase", areas: ["Recruitment"] },
  { key: "documents", label: "Documents", icon: "fileCheck", areas: ["Signatures"] },
];
export const categoryOf = (area: ActionArea): CategoryKey => CATEGORIES.find((c) => c.areas.includes(area))?.key || "classwork";

const DAY = 86_400_000;
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The homework ladder, from how long ago it was due. Reminders for pupils and parents are this list in their own Action centre. */
export function homeworkStage(daysOverdue: number): { label: string; urgency: Urgency; step: string } {
  if (daysOverdue >= 5) return { label: "Escalate", urgency: "now", step: "Tell the head teacher and agree a plan with the parent." };
  if (daysOverdue >= 3) return { label: "Chase now", urgency: "now", step: "Speak to the pupil and ask for it by a set day." };
  if (daysOverdue >= 2) return { label: "Tell the parent", urgency: "soon", step: "Let the parent know, with the title and how to hand it in." };
  return { label: "Reminder", urgency: "soon", step: "The pupil sees it as missing and can hand it in late." };
}

type Attention = { homework_id: string; homework_title: string; class_id: string; class_name: string | null; due_at: string; child_id: string; child_name: string | null; attention: string };

export async function loadStaffItems(role: "teach" | "admin"): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const base = role === "teach" ? "/teach" : "/admin";
  const items: ActionItem[] = [];
  const since = new Date(Date.now() - 21 * DAY).toISOString();

  const { data } = await supabase
    .from("homework_attention")
    .select("homework_id, homework_title, class_id, class_name, due_at, child_id, child_name, attention")
    .gte("due_at", since)
    .limit(1500);
  const rows = (data as unknown as Attention[]) || [];

  // Missing work, grouped by homework.
  const byHw = new Map<string, Attention[]>();
  for (const r of rows.filter((x) => x.attention === "missing")) byHw.set(r.homework_id, [...(byHw.get(r.homework_id) || []), r]);
  for (const [id, list] of byHw) {
    const over = daysAgo(list[0].due_at);
    const st = homeworkStage(over);
    items.push({
      id: `hw-${id}`,
      area: "Homework",
      urgency: st.urgency,
      title: `${plural(list.length, "pupil")} missing "${list[0].homework_title}"`,
      detail: `${list[0].class_name || "Class"} · due ${over <= 0 ? "today" : `${plural(over, "day")} ago`} · ${st.label}: ${st.step}`,
      people: list.slice(0, 4).flatMap((l) => (l.child_name ? [{ id: l.child_id, name: l.child_name }] : [])),
      who: list.length > 4 ? `and ${list.length - 4} more` : undefined,
      href: `${base}/class?id=${list[0].class_id}&tab=classwork`,
      cta: "Open in the class",
    });
  }

  // The same pupil missing three or more pieces in 14 days.
  const recent = rows.filter((x) => x.attention === "missing" && daysAgo(x.due_at) <= 14);
  const byChild = new Map<string, Attention[]>();
  for (const r of recent) byChild.set(r.child_id, [...(byChild.get(r.child_id) || []), r]);
  for (const [id, list] of byChild) {
    if (list.length < 3) continue;
    items.push({
      id: `pat-${id}`,
      area: "Homework",
      urgency: "now",
      title: `${list[0].child_name || "A pupil"} has missed ${list.length} pieces in 14 days`,
      detail: "A pattern, not a one-off. Speak to the parent and agree support.",
      people: list[0].child_name ? [{ id, name: list[0].child_name }] : undefined,
      href: `${base}/homework`,
      cta: "See the pieces",
    });
  }

  const resub = rows.filter((x) => x.attention === "resubmission_requested");
  if (resub.length) items.push({ id: "resub", area: "Homework", urgency: "soon", title: `${plural(resub.length, "resubmission")} waiting`, detail: "You asked for these to be redone and they have not come back yet.", href: `${base}/homework`, cta: "Open homework" });

  // Absence follow-ups that are due.
  const today = todayISO();
  const fu = await supabase.from("absence_followups").select("id, status, absence_date, next_action_due").in("status", ["open", "contacted", "escalated"]).limit(200);
  const due = ((fu.data as unknown as { id: string; status: string; absence_date: string; next_action_due: string | null }[]) || []).filter((f) => f.status === "escalated" || (f.next_action_due ? f.next_action_due <= today : f.absence_date < today));
  if (due.length) {
    const esc = due.filter((d) => d.status === "escalated").length;
    items.push({ id: "abs", area: "Absence", urgency: esc ? "now" : "soon", title: `${plural(due.length, "absence follow-up")} due`, detail: esc ? `${esc} escalated. The rest are waiting for a call or message.` : "Waiting for a call or message to the family.", href: `${base}/absences`, cta: "Open absences" });
  }

  items.push(...(await loadSendItems(base)));
  items.push(...(await loadRevisionItems(base)));
  items.push(...(await loadLessonFeedbackItems(base).catch(() => [] as ActionItem[])));
  if (role === "teach") items.push(...(await loadQuranTeacherItems()));
  if (role === "admin") items.push(...(await loadAdminItems().catch(() => [] as ActionItem[])));
  return items;
}

/**
 * The school-wide checks that used to sit as separate tiles on the admin Home
 * page ("Needs attention"), so everything that needs the office is in one
 * place: registers not taken today, absences with no reason, marking waiting
 * over a week, signatures outstanding, flagged messages and safeguarding
 * reviews (Safeguarding Lead / Headteacher only), new applications, payment
 * proofs and job applications, and new pupils this week. Every query is
 * RLS-scoped and fails quietly on its own: no item is better than a wrong one.
 */
async function loadAdminItems(): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const out: ActionItem[] = [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const [perm, roles] = await Promise.all([
    supabase.from("user_permissions").select("permission").eq("user_id", user.id).eq("permission", "safeguarding_lead"),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const isLead = ((perm.data as unknown[]) || []).length > 0;
  const isHeadTeacher = ((roles.data as { role: string }[]) || []).some((r) => r.role === "head_teacher");
  const today = ukToday();
  const now = ukNowHm();
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  type Counted = { count: number | null; error: unknown };
  const count = (r: Counted) => (r.error ? 0 : r.count || 0);
  const none: Counted = { count: 0, error: null };

  const [lessons, marking, sigs, flagged, reviews, apps, proofs, jobs, enrol] = await Promise.all([
    supabase.from("lesson_instances").select("id, timetable_slots(start_time, class_id, classes(name), timetable_runs(status))").eq("date", today),
    supabase.from("homework_submissions").select("id, homework_marks(marked_at)").not("submitted_at", "is", null).lt("submitted_at", weekAgo).order("submitted_at", { ascending: false }).limit(1000),
    supabase.from("outstanding_signatures").select("user_id", { count: "exact", head: true }),
    isLead ? supabase.from("message_thread_messages").select("id", { count: "exact", head: true }).eq("flagged", true) : Promise.resolve(none),
    isLead || isHeadTeacher ? supabase.from("safeguarding_reviews").select("due_at").neq("status", "completed") : Promise.resolve({ data: [] as { due_at: string }[], error: null }),
    supabase.from("admissions_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("admissions_payment_proofs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("enrolments").select("child_id").gte("created_at", weekAgo).limit(5000),
  ]);

  // Registers: published-timetable lessons that have started with no register yet.
  if (!lessons.error) {
    type L = { id: string; timetable_slots: { start_time: string; class_id: string; classes: { name: string } | null; timetable_runs: { status: string } | null } | null };
    const started = ((lessons.data as unknown as L[]) || []).filter((l) => l.timetable_slots?.timetable_runs?.status === "published" && now >= l.timetable_slots.start_time.slice(0, 5));
    if (started.length) {
      const att = await supabase.from("attendance_records").select("lesson_instance_id").in("lesson_instance_id", started.map((l) => l.id));
      if (!att.error) {
        const taken = new Set(((att.data as { lesson_instance_id: string }[]) || []).map((a) => a.lesson_instance_id));
        const missing = started.filter((l) => !taken.has(l.id));
        if (missing.length) {
          const names = [...new Set(missing.map((l) => l.timetable_slots?.classes?.name || "Class"))];
          out.push({ id: "adm-registers", area: "Registers", urgency: "now", title: `${plural(missing.length, "register")} not taken today`, detail: `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""}. The lesson has started and no register has been taken.`, href: "/admin/attendance", cta: "Take registers" });
        }
      }
    }
  }

  // Absences with no reason in the last 7 days, once per pupil per day (the Absences page's "To follow up").
  const notes = await fetchNotes();
  if (!notes.error) {
    const abs = await fetchAbsences(shiftDateKey(today, -6), today, notes.notes);
    if (!abs.error) {
      const days = new Set(abs.absences.filter((a) => a.kind === "unexplained" && (!a.reasonCode || a.reasonCode === "unknown")).map((a) => `${a.childId}|${a.date}`));
      if (days.size) out.push({ id: "adm-unexplained", area: "Absence", urgency: "soon", title: `${plural(days.size, "absence")} with no reason (last 7 days)`, detail: "Contact the family and record a reason.", href: "/admin/absences", cta: "Follow up" });
    }
  }

  if (!marking.error) {
    type M = { id: string; homework_marks: { marked_at: string | null }[] | { marked_at: string | null } | null };
    const rows = (marking.data as unknown as M[]) || [];
    const n = rows.filter((r) => {
      const m = Array.isArray(r.homework_marks) ? r.homework_marks[0] : r.homework_marks;
      return !m || !m.marked_at;
    }).length;
    if (n) out.push({ id: "adm-marking", area: "Marking", urgency: "soon", title: `${n}${rows.length >= 1000 ? "+" : ""} ${n === 1 ? "piece" : "pieces"} of work waiting over 7 days to be marked`, detail: "Each class's teacher marks it in the class. See which classes are behind.", href: "/admin/homework", cta: "See by class" });
  }

  const sigN = count(sigs);
  if (sigN) out.push({ id: "adm-signatures", area: "Signatures", urgency: "soon", title: `${plural(sigN, "signature")} outstanding`, detail: "Policies and agreements that families or staff still need to sign.", href: "/admin/documents?tab=outstanding", cta: "See who" });

  const flaggedN = count(flagged);
  if (flaggedN) out.push({ id: "adm-flagged", area: "Safeguarding", urgency: "now", title: plural(flaggedN, "flagged message"), detail: "Messages flagged for a safeguarding check.", href: "/admin/compliance", cta: "Review" });

  if (!reviews.error) {
    const due = ((reviews.data as { due_at: string }[] | null) || []).map((r) => new Date(r.due_at).getTime());
    const overdue = due.filter((t) => t < Date.now()).length;
    if (due.length) out.push({ id: "adm-sg-reviews", area: "Safeguarding", urgency: overdue ? "now" : "soon", title: `${plural(due.length, "safeguarding review")} open`, detail: overdue ? `${overdue} overdue.` : "None overdue yet.", href: "/admin/compliance", cta: "Open reviews" });
  }

  const appsN = count(apps);
  if (appsN) out.push({ id: "adm-apps", area: "Admissions", urgency: "soon", title: `${plural(appsN, "new application")} to review`, detail: "Read each one and move it to the next stage.", href: "/admin/admissions", cta: "Open applications" });
  const proofsN = count(proofs);
  if (proofsN) out.push({ id: "adm-proofs", area: "Admissions", urgency: "soon", title: `${plural(proofsN, "payment proof")} to check`, detail: "Uploaded by families. Check the amount and mark it verified.", href: "/admin/admissions", cta: "Check payments" });
  const jobsN = count(jobs);
  if (jobsN) out.push({ id: "adm-jobs", area: "Recruitment", urgency: "soon", title: plural(jobsN, "new job application"), detail: "Read and shortlist, or reply to the applicant.", href: "/admin/recruitment", cta: "Open applications" });

  if (!enrol.error) {
    const n = new Set(((enrol.data as { child_id: string }[]) || []).map((r) => r.child_id)).size;
    if (n) out.push({ id: "adm-new-pupils", area: "Pupils", urgency: "info", title: `${plural(n, "new pupil")} this week`, detail: "Check their details are complete and they are in the right classes.", href: "/admin/pupils", cta: "Open pupils" });
  }
  return out;
}

/**
 * Revision packs waiting for a teacher (Tafweed T33, migration 0184): drafts
 * the portal made when every lesson in a unit was signed off, and questions
 * drafted by AI. They clear once the pack is checked or the questions approved.
 * Fails quietly before 0184 is deployed (the columns don't exist yet).
 */
async function loadRevisionItems(base: string): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const out: ActionItem[] = [];
  const link = (u: { year: string; subject_slug: string; unit: string }) =>
    `${base}/curriculum?year=${encodeURIComponent(u.year)}&subject=${encodeURIComponent(u.subject_slug)}&unit=${encodeURIComponent(u.unit)}&tab=revision`;
  const yearLabel = (y: string) => y.replace(/^y/, "Year ");
  const drafts = await supabase.from("revision_units").select("id, subject, subject_slug, year, unit, auto_created_at").not("auto_created_at", "is", null).is("checked_at", null).order("auto_created_at", { ascending: false }).limit(20);
  for (const u of ((drafts.error ? [] : drafts.data) || []) as { id: string; subject: string; subject_slug: string; year: string; unit: string }[]) {
    out.push({
      id: `rev-draft-${u.id}`,
      area: "Revision",
      urgency: "soon",
      title: `Revision pack ready to check: ${u.subject}, ${u.unit} (${yearLabel(u.year)})`,
      detail: "Every lesson in this unit is signed off, so a draft pack was made. Check the questions and the to-do list, then show it to pupils.",
      href: link(u),
      cta: "Check the pack",
    });
  }
  const pend = await supabase.from("revision_questions").select("unit_id, revision_units(subject, subject_slug, year, unit)").eq("review", "pending").limit(500);
  const byUnit = new Map<string, { n: number; u: { subject: string; subject_slug: string; year: string; unit: string } }>();
  for (const r of ((pend.error ? [] : pend.data) || []) as unknown as { unit_id: string; revision_units: { subject: string; subject_slug: string; year: string; unit: string } | null }[]) {
    if (!r.revision_units) continue;
    const cur = byUnit.get(r.unit_id) || { n: 0, u: r.revision_units };
    cur.n++;
    byUnit.set(r.unit_id, cur);
  }
  for (const [id, { n, u }] of byUnit) {
    out.push({
      id: `rev-pending-${id}`,
      area: "Revision",
      urgency: "soon",
      title: `${plural(n, "drafted question")} to check: ${u.subject}, ${u.unit} (${yearLabel(u.year)})`,
      detail: "Pupils see none of these until you approve them.",
      href: link(u),
      cta: "Check questions",
    });
  }
  return out;
}

/**
 * Lesson feedback (Tafweed T34, migration 0189). The Headteacher and Admin get one item per note
 * waiting for an answer (RLS returns every note only to them); whoever wrote a note sees the
 * answer for 14 days. Fails quietly before 0189 is deployed.
 */
async function loadLessonFeedbackItems(base: string): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const { data, error } = await supabase
    .from("curriculum_lesson_feedback")
    .select("id, part_label, body, status, response, author_id, author_name, created_at, handled_at, handled_by_name, lesson:curriculum_lessons(subject, year, lesson_no, title)")
    .or(`status.in.(open,accepted),handled_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  type Row = { id: string; part_label: string | null; body: string; status: string; response: string | null; author_id: string; author_name: string | null; created_at: string; handled_by_name: string | null; lesson: { subject: string; year: string; lesson_no: number; title: string } | null };
  const label = (l: Row["lesson"]) => (l ? `${l.subject} ${l.year.replace(/^y/, "Y")}, lesson ${l.lesson_no}: ${l.title}` : "a lesson");
  const short = (t: string) => (t.length > 140 ? `${t.slice(0, 137)}...` : t);
  const out: ActionItem[] = [];
  for (const r of data as unknown as Row[]) {
    const mine = r.author_id === user?.id;
    if ((r.status === "open" || r.status === "accepted") && !mine) {
      out.push({
        id: `lfb-${r.id}`,
        area: "Curriculum",
        urgency: r.status === "open" && daysAgo(r.created_at) >= 7 ? "now" : "soon",
        title: `Lesson feedback: ${label(r.lesson)}`,
        detail: `${r.part_label || "The whole lesson"}: "${short(r.body)}" (${r.author_name || "a member of staff"}${r.status === "accepted" ? "; accepted, waiting for the change" : ""})`,
        href: `${base}/curriculum?feedback=${r.id}`,
        cta: "Open the lesson",
      });
    } else if (mine && (r.status === "done" || r.status === "declined")) {
      out.push({
        id: `lfb-answer-${r.id}-${r.status}`,
        area: "Curriculum",
        urgency: "info",
        title: `Your lesson feedback was ${r.status === "done" ? "acted on" : "declined"}: ${label(r.lesson)}`,
        detail: `You wrote: "${short(r.body)}"${r.response ? `. ${r.handled_by_name || "The Headteacher"} replied: ${short(r.response)}` : ""}`,
        href: `${base}/curriculum?feedback=${r.id}`,
        cta: "See the lesson",
      });
    }
  }
  return out;
}

/** SEND reviews due within 14 days or overdue, drafts to finish and family comments. Only the SENCo, Headteacher and admin get rows back. */
async function loadSendItems(base: string): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("send_register");
  if (error || !data) return [];
  const rows = data as RegisterRow[];
  const who = (list: RegisterRow[]) => list.slice(0, 5).map((r) => ({ id: r.child_id, name: r.child_name }));
  const more = (list: RegisterRow[]) => (list.length > 5 ? `and ${list.length - 5} more` : undefined);
  const href = `${base}/send`;
  const out: ActionItem[] = [];
  const active = rows.filter((r) => r.status === "active");
  const overdue = active.filter((r) => reviewState(r.next_review_due).state === "overdue");
  const soon = active.filter((r) => reviewState(r.next_review_due).state === "soon");
  const undated = active.filter((r) => !r.next_review_due);
  const drafts = rows.filter((r) => r.status === "draft");
  const flagged = rows.filter((r) => !r.plan_id && r.flagged);
  const comments = rows.reduce((n, r) => n + (r.unseen_comments || 0), 0);
  if (overdue.length) out.push({ id: "send-overdue", area: "SEND", urgency: "now", title: `${plural(overdue.length, "support plan review")} overdue`, detail: "Book the review with the family and record it on the plan.", people: who(overdue), who: more(overdue), href, cta: "Open SEND register" });
  if (soon.length) out.push({ id: "send-soon", area: "SEND", urgency: "soon", title: `${plural(soon.length, "support plan review")} due in the next 14 days`, detail: "Invite the family and ask the pupil's teachers how the adjustments are working.", people: who(soon), who: more(soon), href, cta: "Open SEND register" });
  if (undated.length) out.push({ id: "send-undated", area: "SEND", urgency: "soon", title: `${plural(undated.length, "support plan")} with no review date`, detail: "Every plan needs a next review date, at least termly.", people: who(undated), who: more(undated), href, cta: "Set review dates" });
  if (drafts.length) out.push({ id: "send-drafts", area: "SEND", urgency: "soon", title: `${plural(drafts.length, "draft support plan")} to finish`, detail: "Started from the application. Add adjustments and targets, then make it active so teachers and the family see it.", people: who(drafts), who: more(drafts), href, cta: "Finish plans" });
  if (comments) out.push({ id: "send-comments", area: "SEND", urgency: "soon", title: `${plural(comments, "new comment")} from families on support plans`, detail: "Read and reply on the plan. The family sees your reply in the Parent Portal.", href, cta: "Read comments" });
  if (flagged.length) out.push({ id: "send-flagged", area: "SEND", urgency: "info", title: `${plural(flagged.length, "pupil")} whose family mentioned a need, with no plan`, detail: "Check whether each needs a support plan or just monitoring.", people: who(flagged), who: more(flagged), href, cta: "Review" });
  return out;
}

async function loadQuranTeacherItems(): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const classes = await myTeachingClasses();
  const ids = classes.map((c) => c.id);
  if (!ids.length) return [];
  const enr = await supabase.from("enrolments").select("children(id, name)").in("class_id", ids);
  const seen = new Map<string, string>();
  for (const r of ((enr.data as unknown as { children: { id: string; name: string } | null }[]) || [])) if (r.children) seen.set(r.children.id, r.children.name);
  const pid = [...seen.keys()];
  if (!pid.length) return [];
  const [lv, se, mk] = await Promise.all([
    supabase.from("quran_child_levels").select("child_id").in("child_id", pid),
    supabase.from("quran_sessions").select("id, child_id, teacher_name, session_date, session_time, done").in("child_id", pid).gte("session_date", new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)),
    supabase.from("quran_progress").select(MARK_COLUMNS).in("child_id", pid).eq("milestone_type", "quran_memorisation"),
  ]);
  const inQuran = new Set(((lv.data as { child_id: string }[]) || []).map((x) => x.child_id));
  const sessions = (se.data as Session[]) || [];
  const marks = (mk.data as QuranMark[]) || [];
  const out: ActionItem[] = [];
  const due: { id: string; name: string }[] = [];
  const unbooked: { id: string; name: string }[] = [];
  for (const id of pid) {
    if (!inQuran.has(id)) continue;
    const name = seen.get(id) || "Pupil";
    if (revisionRows(pupilStats(marks.filter((m) => m.child_id === id))).some((r) => r.status === "due")) due.push({ id, name });
    if (!nextSession(sessions.filter((s) => s.child_id === id))) unbooked.push({ id, name });
  }
  if (due.length) out.push({ id: "q-rev", area: "Qur'an", urgency: "soon", title: `${plural(due.length, "pupil")} with Qur'an revision due`, detail: "Set revision homework or hear it in a one-to-one.", people: due.slice(0, 5), href: "/teach/quran", cta: "Open Qur'an" });
  if (unbooked.length) out.push({ id: "q-book", area: "Qur'an", urgency: "soon", title: `${plural(unbooked.length, "pupil")} with no one-to-one booked`, detail: "Schedule their next recitation session.", people: unbooked.slice(0, 5), href: "/teach/quran", cta: "Schedule sessions" });
  return out;
}

type Status = { homework_id: string; due_at: string; child_id: string; status: string; homework: { title: string; archived_at: string | null } | null };

/** A pupil's own items, or each of a parent's children. */
export async function loadPupilItems(children: { id: string; name: string }[], role: "student" | "family"): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const base = role === "student" ? "/student" : "/family";
  const items: ActionItem[] = [];
  for (const c of children) {
    const who = role === "family" ? `${c.name.split(" ")[0]}: ` : "";
    const hw = await supabase.from("homework_status").select("homework_id, due_at, child_id, status").eq("child_id", c.id).gte("due_at", new Date(Date.now() - 30 * DAY).toISOString());
    const hwRows = (await attachHomework(supabase, hw.data as unknown as { homework_id: string }[], "title")) as unknown as Status[];
    for (const r of hwRows.filter((x) => x.homework)) {
      const title = r.homework?.title || "Homework";
      if (r.status === "missing") {
        const over = daysAgo(r.due_at);
        items.push({ id: `hw-${c.id}-${r.homework_id}`, area: "Homework", urgency: "now", title: `${who}"${title}" has not been handed in`, detail: `It was due ${over <= 0 ? "today" : `${plural(over, "day")} ago`}. You can still hand it in late.`, href: `${base}/todo`, cta: "Hand it in" });
      } else if (r.status === "not_yet_due") {
        const left = Math.ceil((new Date(r.due_at).getTime() - Date.now()) / DAY);
        if (left <= 3) items.push({ id: `hw-${c.id}-${r.homework_id}`, area: "Homework", urgency: "soon", title: `${who}"${title}" is due ${left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`, detail: "Hand it in before the deadline.", href: `${base}/todo`, cta: "Open" });
      }
    }
    items.push(...(await loadQuranPupilItems(c.id, who, base)));
  }
  return items;
}

async function loadQuranPupilItems(childId: string, who: string, base: string): Promise<ActionItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const [cl, hw, se, mk] = await Promise.all([
    supabase.from("quran_child_levels").select("level_id").eq("child_id", childId),
    supabase.from("quran_homework").select("id, level_id, kind, due_date").gte("due_date", todayISO()).limit(40),
    supabase.from("quran_sessions").select("id, child_id, teacher_name, session_date, session_time, done").eq("child_id", childId),
    supabase.from("quran_progress").select(MARK_COLUMNS).eq("child_id", childId).eq("milestone_type", "quran_memorisation"),
  ]);
  const levels = new Set(((cl.data as { level_id: string }[]) || []).map((x) => x.level_id));
  if (!levels.size) return [];
  const marks = (mk.data as QuranMark[]) || [];
  const out: ActionItem[] = [];
  const todo = ((hw.data as { id: string; level_id: string; kind: string; due_date: string }[]) || []).filter((h) => levels.has(h.level_id) && !marks.some((m) => m.homework_id === h.id));
  if (todo.length) out.push({ id: `q-hw-${childId}`, area: "Qur'an", urgency: "soon", title: `${who}${plural(todo.length, "Qur'an homework", "Qur'an homeworks")} to do`, detail: `Next due ${todo.sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date}.`, href: `${base}/quran`, cta: "Open Qur'an" });
  const due = revisionRows(pupilStats(marks)).filter((r) => r.status === "due");
  if (due.length) out.push({ id: `q-rev-${childId}`, area: "Qur'an", urgency: "soon", title: `${who}${plural(due.length, "surah")} to revise`, detail: "Recite them again so they stay secure.", href: `${base}/quran`, cta: "See what to revise" });
  const next = nextSession(((se.data as Session[]) || []));
  if (next) out.push({ id: `q-next-${childId}`, area: "Qur'an", urgency: "info", title: `${who}One-to-one recitation on ${new Date(next.session_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} at ${next.session_time.slice(0, 5)}`, detail: next.teacher_name ? `With ${next.teacher_name}. Come ready to recite.` : "Come ready to recite.", href: `${base}/quran`, cta: "Open" });
  return out;
}

const RANK: Record<Urgency, number> = { now: 0, soon: 1, info: 2 };
export const sortItems = (items: ActionItem[]) => items.slice().sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || a.title.localeCompare(b.title));
