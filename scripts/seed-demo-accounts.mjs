// Creates three demo /learn accounts (teacher, parent, student) with a
// small, clearly fake world to explore the portal in: two classes, a
// published timetable, past + upcoming lessons, homework (one handed in,
// one due, one overdue), grades and class announcements.
//
// Everything is unmistakably demo data: names start "Demo", rows with an
// is_test column have it set, and the academic year is "DEMO (portal
// walkthrough)". The accounts are scoped by the same RLS as real ones:
// the demo teacher only teaches the demo classes and the demo parent only
// has the demo child, so none of them can see real pupils or families.
//
// Idempotent: re-running wipes the previous demo world and rebuilds it,
// and resets the three passwords to the ones passed in.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      DEMO_TEACHER_PASSWORD, DEMO_PARENT_PASSWORD, DEMO_STUDENT_PASSWORD
// Run via .github/workflows/seed-demo-accounts.yml.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const YEAR_LABEL = "DEMO (portal walkthrough)";
const ACCOUNTS = {
  teacher: { email: "demo-teacher@tarbiyyah.co.uk", name: "Demo Teacher", profileRole: "teacher", password: process.env.DEMO_TEACHER_PASSWORD },
  parent: { email: "demo-parent@tarbiyyah.co.uk", name: "Demo Parent", profileRole: "parent", password: process.env.DEMO_PARENT_PASSWORD },
  student: { email: "demo-student@tarbiyyah.co.uk", name: "Demo Student", profileRole: "student", password: process.env.DEMO_STUDENT_PASSWORD },
};
for (const [k, a] of Object.entries(ACCOUNTS)) {
  if (!a.password || a.password.length < 12) {
    console.error(`DEMO_${k.toUpperCase()}_PASSWORD missing or shorter than 12 characters`);
    process.exit(1);
  }
}

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
}

async function ensureAccount(a) {
  const existing = await findUser(a.email);
  let id;
  if (existing) {
    id = existing.id;
    must(await sb.auth.admin.updateUserById(id, { password: a.password, email_confirm: true }), `reset password ${a.email}`);
  } else {
    const created = must(await sb.auth.admin.createUser({ email: a.email, password: a.password, email_confirm: true }), `create ${a.email}`);
    id = created.user.id;
  }
  must(
    await sb.from("profiles").upsert({ id, role: a.profileRole, full_name: a.name, email: a.email, must_change_password: false }, { onConflict: "id" }),
    `profile ${a.email}`,
  );
  return id;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

// ── Accounts ──────────────────────────────────────────────────────────
const teacherId = await ensureAccount(ACCOUNTS.teacher);
const parentId = await ensureAccount(ACCOUNTS.parent);
const studentId = await ensureAccount(ACCOUNTS.student);

// ── Wipe the previous demo world ──────────────────────────────────────
must(await sb.from("children").delete().eq("parent_user_id", parentId), "wipe demo children"); // cascades enrolments, submissions, grades
must(await sb.from("classes").delete().like("name", "Demo:%"), "wipe demo classes"); // cascades homework, announcements, slots, lessons
must(await sb.from("academic_years").delete().eq("label", YEAR_LABEL), "wipe demo year"); // cascades runs
must(await sb.from("user_roles").delete().in("user_id", [teacherId, parentId, studentId]), "wipe demo roles");
must(await sb.from("year_groups").delete().eq("name", "Demo Year 5"), "wipe demo year group");
must(await sb.from("subjects").delete().in("name", ["Demo Qur'an", "Demo Arabic"]), "wipe demo subjects");

// ── Reference data ────────────────────────────────────────────────────
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const year = must(
  await sb
    .from("academic_years")
    .insert({ label: YEAR_LABEL, starts_on: iso(addDays(today, -60)), ends_on: iso(addDays(today, 300)), is_test: true })
    .select()
    .single(),
  "year",
);
const yg = must(await sb.from("year_groups").insert({ name: "Demo Year 5", sort_order: 999, is_test: true }).select().single(), "year group");
const quran = must(await sb.from("subjects").insert({ name: "Demo Qur'an", is_core: true, is_test: true }).select().single(), "subject quran");
const arabic = must(await sb.from("subjects").insert({ name: "Demo Arabic", is_core: true, is_test: true }).select().single(), "subject arabic");

const classDefs = [
  { name: "Demo: Year 5 Qur'an & Hifz", subject: quran, days: [1, 3] },
  { name: "Demo: Year 5 Arabic", subject: arabic, days: [2, 4] },
];
const classes = [];
for (const c of classDefs) {
  const row = must(
    await sb
      .from("classes")
      .insert({ name: c.name, year_group: "Demo Year 5", subject: c.subject.name, academic_year_id: year.id, year_group_id: yg.id, subject_id: c.subject.id, is_test: true })
      .select()
      .single(),
    `class ${c.name}`,
  );
  classes.push({ ...c, row });
}

// ── People and roles ──────────────────────────────────────────────────
const roles = [
  ...classes.map((c) => ({ user_id: teacherId, role: "teacher", scope_type: "class", scope_id: c.row.id })),
  { user_id: parentId, role: "parent", scope_type: "none", scope_id: null },
  { user_id: studentId, role: "student", scope_type: "none", scope_id: null },
];
must(await sb.from("user_roles").insert(roles), "roles");

const child = must(
  await sb.from("children").insert({ parent_user_id: parentId, name: "Demo Student", dob: "2016-03-14", year_group_id: yg.id, is_test: true }).select().single(),
  "child",
);
must(await sb.from("student_accounts").insert({ child_id: child.id, profile_id: studentId, invited_at: new Date().toISOString() }), "student account");
must(await sb.from("enrolments").insert(classes.map((c) => ({ class_id: c.row.id, child_id: child.id }))), "enrolments");

// ── Published timetable + lessons (3 weeks back, 2 weeks ahead) ───────
const run = must(
  await sb
    .from("timetable_runs")
    .insert({ academic_year_id: year.id, status: "published", label: "Demo timetable", generated_by: "manual", published_at: new Date().toISOString() })
    .select()
    .single(),
  "run",
);
const OBJECTIVES = {
  "Demo Qur'an": ["Surah Al-Mulk ayat 1–10: memorise and revise", "Tajweed: rules of noon sakinah", "Revision test: Juz 29 so far", "Surah Al-Mulk ayat 11–20"],
  "Demo Arabic": ["Past tense verbs (al-fi'l al-madi)", "Vocabulary: family and home", "Reading comprehension: a short story", "Asking questions: ma, man, ayna"],
};
for (const c of classes) {
  const slots = must(
    await sb
      .from("timetable_slots")
      .insert(c.days.map((weekday) => ({ run_id: run.id, class_id: c.row.id, subject_id: c.subject.id, teacher_user_id: teacherId, weekday, start_time: "16:00", end_time: "16:45" })))
      .select(),
    "slots",
  );
  const lessons = [];
  for (let d = -21; d <= 14; d++) {
    const date = addDays(today, d);
    const slot = slots.find((s) => s.weekday === date.getUTCDay());
    if (!slot) continue;
    const obj = OBJECTIVES[c.subject.name];
    lessons.push({
      timetable_slot_id: slot.id,
      date: iso(date),
      objectives: obj[Math.abs(d) % obj.length],
      bbb_status: d < 0 ? "ended" : "not_started",
      recording_enabled: false,
    });
  }
  must(await sb.from("lesson_instances").insert(lessons), "lessons");
}

// ── Homework: handed in, overdue, due soon ────────────────────────────
const [q, a] = classes.map((c) => c.row.id);
const hwRows = must(
  await sb
    .from("homework")
    .insert([
      { class_id: q, teacher_id: teacherId, title: "Revise Surah Al-Mulk 1–10", instructions: "Recite to a parent twice and note any mistakes.", due_at: addDays(today, -5).toISOString() },
      { class_id: q, teacher_id: teacherId, title: "Tajweed worksheet: noon sakinah", instructions: "Complete all ten questions.", due_at: addDays(today, 2).toISOString() },
      { class_id: a, teacher_id: teacherId, title: "Write five past-tense sentences", instructions: "Use the verbs from Tuesday's lesson.", due_at: addDays(today, -2).toISOString() },
      { class_id: a, teacher_id: teacherId, title: "Learn 10 family words", instructions: "Quiz next lesson.", due_at: addDays(today, 5).toISOString() },
    ])
    .select(),
  "homework",
);
must(
  await sb.from("homework_submissions").insert({
    homework_id: hwRows[0].id,
    child_id: child.id,
    kind: "text",
    response_text: "Recited twice to my mum. Mistake on ayah 7 fixed.",
    submitted_at: addDays(today, -6).toISOString(),
  }),
  "submission",
);

// ── Grades ────────────────────────────────────────────────────────────
let type = must(await sb.from("assessment_types").select("id").eq("name", "Demo quiz").maybeSingle(), "type lookup");
if (!type) type = must(await sb.from("assessment_types").insert({ name: "Demo quiz" }).select().single(), "type");
must(
  await sb.from("assessments").insert([
    { class_id: q, child_id: child.id, assessment_type_id: type.id, title: "Juz 30 recitation check", date: iso(addDays(today, -14)), raw_score: 18, max_score: 20, grade_label: "Secure", entered_by: teacherId },
    { class_id: a, child_id: child.id, assessment_type_id: type.id, title: "Vocabulary quiz 1", date: iso(addDays(today, -9)), raw_score: 7, max_score: 10, entered_by: teacherId },
  ]),
  "grades",
);

// ── Announcements ─────────────────────────────────────────────────────
must(
  await sb.from("announcements").insert([
    { scope: "class", class_id: q, author_id: teacherId, title: "Hifz target this half-term", body: "We're aiming to finish Surah Al-Mulk by the half-term break. Please listen to your child recite for 10 minutes a day." },
    { scope: "class", class_id: a, author_id: teacherId, title: "Vocabulary quiz next week", body: "Short quiz on family words next Thursday. Flashcards are in the lesson resources." },
  ]),
  "announcements",
);

console.log("Demo world ready:");
console.log(`  classes: ${classes.map((c) => c.name).join(", ")}`);
console.log(`  accounts: ${Object.values(ACCOUNTS).map((x) => x.email).join(", ")}`);
