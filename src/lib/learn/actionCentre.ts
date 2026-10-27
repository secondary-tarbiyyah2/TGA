// Action centre: one list of what needs doing for each role, most urgent first.
// Everything is COMPUTED at read time from existing tables (homework_status / homework_attention,
// absence_followups, Qur'an marks and sessions), so an item disappears by itself as soon as the underlying
// thing is done: nobody ticks anything twice. Reads are RLS-scoped, so each role only sees its own people.

import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { MARK_COLUMNS, nextSession, pupilStats, revisionRows, todayISO, type QuranMark, type Session } from "@/lib/learn/quranClassroom";

export type Urgency = "now" | "soon" | "info";
export type ActionArea = "Homework" | "Qur'an" | "Absence" | "Signatures" | "Child details";
export type ActionItem = { id: string; area: ActionArea; urgency: Urgency; title: string; detail: string; href: string; cta: string; who?: string; people?: { id: string; name: string }[] };
export type Role = "teach" | "admin" | "student" | "family";

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
      href: `${base}/homework`,
      cta: "Open late and missing",
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

  if (role === "teach") items.push(...(await loadQuranTeacherItems()));
  return items;
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
    const hw = await supabase.from("homework_status").select("homework_id, due_at, child_id, status, homework:homework_id(title)").eq("child_id", c.id).gte("due_at", new Date(Date.now() - 30 * DAY).toISOString());
    for (const r of ((hw.data as unknown as Status[]) || []).filter((x) => x.homework)) {
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
