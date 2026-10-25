// Test data for the trial period: fills the portal with realistic but
// clearly fake families, pupils and staff, and removes all of it again.
//
//   node scripts/test-data.mjs generate   (TEST_FAMILIES, TEST_STAFF, TEST_PASSWORD)
//   node scripts/test-data.mjs remove
//
// Run via .github/workflows/test-data.yml (Actions → "Test data").
//
// What "generate" makes:
//   * Staff: teachers with staff profiles, each teaching several classes.
//   * Families: parents with 1–3 children, spread across year groups; every
//     child also gets a pupil login (username test.firstname.lastname).
//   * Classes ("Test: Year 7 Maths"…), a published timetable in its own
//     "TEST DATA" academic year, lessons from 3 weeks ago to 2 weeks ahead,
//     registers for past lessons, homework with hand-ins, grades, merits and
//     demerits, house membership and class announcements.
//
// How it stays separate from real data:
//   * Every child and class has is_test = true; the academic year is
//     labelled "TEST DATA (trial period)".
//   * Parent and staff emails use the reserved .test domain, which has no
//     mailboxes; the shared email senders skip .test addresses, and absence
//     and no-show alerts skip test classes, so nothing is ever emailed.
//   * Test accounts are scoped by the same RLS as real ones: a test parent
//     sees only their test children, a test teacher only their test classes.
//   * "remove" deletes exactly what "generate" made (children, classes, the
//     test year, test accounts, and any year groups/subjects it had to add).
//
// Running "generate" again first removes the previous test data.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const mode = process.argv[2] || "generate";

const YEAR_LABEL = "TEST DATA (trial period)";
const PARENT_DOMAIN = "family.tga.test";
const STAFF_DOMAIN = "staff.tga.test";
const STUDENT_DOMAIN = "students.tarbiyyah.internal"; // as _shared/studentAccount.ts
const STUDENT_PREFIX = "test.";
const YEAR_GROUPS = ["Year 3", "Year 5", "Year 7", "Year 8", "Year 10"];
const SUBJECTS = ["Maths", "English", "Qur'an", "Islamic Studies"];

// Runs SQL through the Supabase Management API (needs SUPABASE_ACCESS_TOKEN,
// which the workflow has). Used only to clear rows that still point at a test
// account before it is deleted.
async function sql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = new URL(url).hostname.split(".")[0];
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is needed to clear references to test accounts.");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

/**
 * Whatever a test account did in the portal (messages, clock-ins, feedback,
 * audit entries…) can point at its profile with no ON DELETE rule, which
 * makes deleting the account fail. Clear those references first: a nullable
 * column is set to null, otherwise the row (test activity) is deleted.
 */
const clearNotes = [];

/** For a failed delete: which tables still point at this account, and why. */
async function stillReferencing(id) {
  try {
    const fks = await sql(`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)`);
    const hits = [];
    for (const fk of fks) {
      const r = await sql(`select count(*)::int as n from ${fk.tbl} where ${fk.col} = '${id}'`);
      if (r[0]?.n) hits.push(`${fk.tbl}.${fk.col}=${r[0].n}`);
    }
    return hits.join(", ") || "no rows";
  } catch (e) {
    return `diagnosis failed: ${e.message.slice(0, 200)}`;
  }
}

async function clearReferences(ids) {
  if (!ids.length) return;
  const fks = await sql(`
    select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.confdeltype in ('a', 'r')
      and c.conrelid::regclass::text not like 'auth.%'
      and c.conrelid::regclass::text <> 'public.profiles'`);
  const list = ids.map((i) => `'${i}'`).join(",");
  clearNotes.push(`${fks.length} references checked`);
  for (const fk of fks) {
    const q = fk.notnull ? `delete from ${fk.tbl} where ${fk.col} in (${list})` : `update ${fk.tbl} set ${fk.col} = null where ${fk.col} in (${list})`;
    try {
      try {
        await sql(q);
      } catch (e) {
        // A column that can't be null by a table rule (e.g. a conversation
        // needs both people): remove the test activity row instead.
        if (fk.notnull) throw e;
        await sql(`delete from ${fk.tbl} where ${fk.col} in (${list})`);
      }
    } catch (e) {
      clearNotes.push(`${fk.tbl}.${fk.col}: ${e.message.slice(0, 120)}`);
    }
  }
}

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ── Seeded random, so a run is reproducible for the same seed ──────────
let seed = Number(process.env.TEST_SEED) || Date.now() % 100000;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const BOYS = ["Yusuf", "Ibrahim", "Bilal", "Hamza", "Omar", "Zaid", "Musa", "Idris", "Sulaiman", "Talha", "Yahya", "Dawud", "Isa", "Harun", "Ilyas", "Khalid", "Anas", "Hasan", "Husain", "Ismail"];
const GIRLS = ["Aisha", "Maryam", "Khadija", "Fatima", "Hafsa", "Zainab", "Ruqayyah", "Safiya", "Sumayyah", "Layla", "Nusaybah", "Asma", "Hajar", "Amina", "Yasmin", "Sara", "Huda", "Iman", "Noor", "Salma"];
const SURNAMES = ["Hassan", "Rahman", "Ali", "Khan", "Ahmed", "Mahmood", "Hussain", "Siddiqui", "Osman", "Farah", "Bakr", "Haddad", "Qureshi", "Karim", "Mirza", "Saleh", "Begum", "Patel", "Abdullah", "Idris", "Bello", "Osei", "Yusuf", "Malik"];
const TITLES = [
  ["Ms", GIRLS],
  ["Mr", BOYS],
  ["Ustadh", BOYS],
  ["Ustadha", GIRLS],
  ["Dr", [...BOYS, ...GIRLS]],
];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const ascii = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Finding test accounts ───────────────────────────────────────────────
async function testUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      const e = (u.email || "").toLowerCase();
      if (e.endsWith(`@${PARENT_DOMAIN}`) || e.endsWith(`@${STAFF_DOMAIN}`) || (e.startsWith(STUDENT_PREFIX) && e.endsWith(`@${STUDENT_DOMAIN}`))) out.push(u);
    }
    if (data.users.length < 1000) return out;
  }
}

// ── remove ──────────────────────────────────────────────────────────────
async function remove() {
  const users = await testUsers();
  const ids = users.map((u) => u.id);
  // Children first (cascades enrolments, registers, hand-ins, grades, merits,
  // houses, pupil logins), then classes (cascades slots, lessons, homework,
  // announcements), then the test year (cascades its timetable).
  must(await sb.from("children").delete().eq("is_test", true).not("name", "like", "Demo %"), "remove test children");
  must(await sb.from("classes").delete().like("name", "Test:%"), "remove test classes");
  must(await sb.from("academic_years").delete().eq("label", YEAR_LABEL), "remove test year");
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    must(await sb.from("user_roles").delete().in("user_id", chunk), "remove test roles");
  }
  await clearReferences(ids);
  await clearReferences(ids); // a second pass catches rows that pointed at rows the first pass removed
  for (const u of users) {
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error && !/not found/i.test(error.message)) {
      throw new Error(`remove account ${u.email}: ${error.message}. Still referenced by: ${await stillReferencing(u.id)}. Cleanup notes: ${clearNotes.slice(0, 6).join(" | ")}`);
    }
  }
  // Year groups and subjects this script had to add (it reuses real ones when they exist).
  const yg = await sb.from("year_groups").delete().eq("is_test", true).in("name", YEAR_GROUPS);
  if (yg.error) console.log(`(kept test year groups still in use: ${yg.error.message})`);
  const subj = await sb.from("subjects").delete().eq("is_test", true).in("name", SUBJECTS);
  if (subj.error) console.log(`(kept test subjects still in use: ${subj.error.message})`);
  must(await sb.from("assessment_types").delete().eq("name", "Test quiz"), "remove test assessment type");
  console.log(`Removed test data: ${users.length} test accounts and everything linked to them.`);
}

// ── generate ────────────────────────────────────────────────────────────
async function account(email, password, role, fullName) {
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`create ${email}: ${created.error.message}`);
  const id = created.data.user.id;
  must(await sb.from("profiles").upsert({ id, role, full_name: fullName, email, must_change_password: false }, { onConflict: "id" }), `profile ${email}`);
  return id;
}

async function findOrMake(table, name, extra) {
  const found = must(await sb.from(table).select("id, name").eq("name", name).maybeSingle(), `${table} ${name}`);
  if (found) return found;
  return must(await sb.from(table).insert({ name, is_test: true, ...extra }).select("id, name").single(), `add ${table} ${name}`);
}

async function generate() {
  const families = Math.max(1, Math.min(150, Number(process.env.TEST_FAMILIES) || 24));
  const staffCount = Math.max(1, Math.min(30, Number(process.env.TEST_STAFF) || 6));
  const password = process.env.TEST_PASSWORD;
  if (!password || password.length < 12) throw new Error("TEST_PASSWORD must be at least 12 characters.");

  await remove();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Reference data: reuse the school's own year groups and subjects when they exist.
  const year = must(
    await sb.from("academic_years").insert({ label: YEAR_LABEL, starts_on: iso(addDays(today, -60)), ends_on: iso(addDays(today, 300)), is_test: true }).select().single(),
    "test year",
  );
  const yearGroups = [];
  for (const [i, name] of YEAR_GROUPS.entries()) yearGroups.push(await findOrMake("year_groups", name, { sort_order: 900 + i }));
  const subjects = {};
  for (const name of SUBJECTS) subjects[name] = await findOrMake("subjects", name, { is_core: true });

  // Staff.
  const usedNames = new Set();
  const uniqueName = (firsts) => {
    for (;;) {
      const n = `${pick(firsts)} ${pick(SURNAMES)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
  };
  const staff = [];
  for (let i = 0; i < staffCount; i++) {
    const [title, firsts] = TITLES[i % TITLES.length];
    const name = uniqueName(firsts);
    const email = `${ascii(name.split(" ")[0])}.${ascii(name.split(" ")[1])}@${STAFF_DOMAIN}`;
    const id = await account(email, password, "teacher", name);
    staff.push({ id, name, title, email, subjects: [] });
  }

  // Classes: every test year group gets one class per subject.
  const classes = [];
  let t = 0;
  for (const yg of yearGroups) {
    for (const s of SUBJECTS) {
      const teacher = staff[t++ % staff.length];
      teacher.subjects.push(s);
      const row = must(
        await sb
          .from("classes")
          .insert({ name: `Test: ${yg.name} ${s}`, year_group: yg.name, subject: s, academic_year_id: year.id, year_group_id: yg.id, subject_id: subjects[s].id, is_test: true })
          .select()
          .single(),
        `class ${yg.name} ${s}`,
      );
      classes.push({ row, yg, subject: s, teacher });
    }
  }
  for (const st of staff) {
    const subjectsTaught = [...new Set(st.subjects)];
    must(
      await sb.from("staff_profiles").upsert(
        { user_id: st.id, display_title: st.title, subjects_taught: subjectsTaught, years_experience: between(2, 18), bio: `Test staff member. Teaches ${subjectsTaught.join(", ")}.`, languages: ["English", "Arabic"] },
        { onConflict: "user_id" },
      ),
      `staff profile ${st.email}`,
    );
  }
  must(await sb.from("user_roles").insert(classes.map((c) => ({ user_id: c.teacher.id, role: "teacher", scope_type: "class", scope_id: c.row.id }))), "teacher roles");

  // Families, children and pupil logins.
  const children = [];
  const usedUsernames = new Set();
  // Two different pupils called "Huda Bello" in one register looks like a
  // duplicate record, so every test pupil gets a full name of their own.
  const pupilNames = new Set();
  for (let f = 0; f < families; f++) {
    const surname = SURNAMES[f % SURNAMES.length];
    const parentFirst = pick(rand() < 0.5 ? GIRLS : BOYS);
    const parentEmail = `${ascii(parentFirst)}.${ascii(surname)}.${f + 1}@${PARENT_DOMAIN}`;
    const parentId = await account(parentEmail, password, "parent", `${parentFirst} ${surname}`);
    must(await sb.from("user_roles").insert({ user_id: parentId, role: "parent", scope_type: "none", scope_id: null }), "parent role");
    const kids = rand() < 0.45 ? 1 : rand() < 0.8 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const yg = pick(yearGroups);
      let first = pick(rand() < 0.5 ? BOYS : GIRLS);
      for (let tries = 0; pupilNames.has(`${first} ${surname}`) && tries < 40; tries++) first = pick(rand() < 0.5 ? BOYS : GIRLS);
      if (pupilNames.has(`${first} ${surname}`)) continue;
      pupilNames.add(`${first} ${surname}`);
      const yearNo = Number(yg.name.replace(/\D/g, "")) || 5;
      const dob = new Date(Date.UTC(today.getUTCFullYear() - yearNo - 5 - (today.getUTCMonth() < 8 ? 1 : 0), between(0, 11), between(1, 28)));
      const child = must(
        await sb.from("children").insert({ parent_user_id: parentId, name: `${first} ${surname}`, dob: iso(dob), year_group_id: yg.id, is_test: true }).select().single(),
        "child",
      );
      let username = `${STUDENT_PREFIX}${ascii(first)}.${ascii(surname)}`;
      for (let n = 2; usedUsernames.has(username); n++) username = `${STUDENT_PREFIX}${ascii(first)}.${ascii(surname)}${n}`;
      usedUsernames.add(username);
      const pupilId = await account(`${username}@${STUDENT_DOMAIN}`, password, "student", `${first} ${surname}`);
      must(await sb.from("user_roles").insert({ user_id: pupilId, role: "student", scope_type: "none", scope_id: null }), "pupil role");
      must(await sb.from("student_accounts").insert({ child_id: child.id, profile_id: pupilId, invited_at: new Date().toISOString() }), "pupil account");
      must(await sb.from("student_logins").insert({ child_id: child.id, profile_id: pupilId, username, must_change_password: false }), "pupil login");
      children.push({ row: child, yg, username, parentEmail });
    }
  }

  // Enrol every child in their year group's classes.
  const enrol = [];
  for (const c of classes) for (const ch of children) if (ch.yg.id === c.yg.id) enrol.push({ class_id: c.row.id, child_id: ch.row.id });
  for (let i = 0; i < enrol.length; i += 500) must(await sb.from("enrolments").insert(enrol.slice(i, i + 500)), "enrolments");

  // Houses: share test children across the school's houses, if it has any.
  const houses = must(await sb.from("houses").select("id").eq("active", true).order("sort_order"), "houses");
  if (houses.length) {
    must(await sb.from("house_members").insert(children.map((ch, i) => ({ child_id: ch.row.id, house_id: houses[i % houses.length].id }))), "house members");
  }

  // Published timetable: each class twice a week; lessons 3 weeks back, 2 ahead.
  const run = must(
    await sb.from("timetable_runs").insert({ academic_year_id: year.id, status: "published", label: "Test timetable", generated_by: "manual", published_at: new Date().toISOString() }).select().single(),
    "test timetable",
  );
  const PERIODS = [
    ["09:10", "10:00"],
    ["10:10", "11:00"],
    ["11:10", "12:00"],
    ["13:00", "13:50"],
    ["14:00", "14:50"],
  ];
  const lessonsByClass = new Map();
  for (const [ci, c] of classes.entries()) {
    const period = PERIODS[ci % PERIODS.length];
    // Afternoon lessons are Monday-Thursday only (Friday afternoon is Jumu'ah).
    const nDays = period[0] >= "12:00" ? 4 : 5;
    const days = [1 + (ci % nDays), 1 + ((ci + 2) % nDays)];
    const slots = must(
      await sb
        .from("timetable_slots")
        .insert(days.map((weekday) => ({ run_id: run.id, class_id: c.row.id, subject_id: subjects[c.subject].id, teacher_user_id: c.teacher.id, weekday, start_time: period[0], end_time: period[1] })))
        .select(),
      "slots",
    );
    const lessons = [];
    for (let d = -21; d <= 14; d++) {
      const date = addDays(today, d);
      const slot = slots.find((s) => s.weekday === date.getUTCDay());
      if (!slot) continue;
      lessons.push({ timetable_slot_id: slot.id, date: iso(date), objectives: `${c.subject}: lesson ${d + 22}`, bbb_status: d < 0 ? "ended" : "not_started", recording_enabled: false });
    }
    lessonsByClass.set(c.row.id, must(await sb.from("lesson_instances").insert(lessons).select("id, date"), "lessons"));
  }

  // Registers for past lessons: mostly present, some late, a few absent.
  const register = [];
  for (const c of classes) {
    const kids = children.filter((ch) => ch.yg.id === c.yg.id);
    for (const li of lessonsByClass.get(c.row.id)) {
      if (li.date >= iso(today)) continue;
      for (const ch of kids) {
        const r = rand();
        register.push({ lesson_instance_id: li.id, child_id: ch.row.id, status: r < 0.88 ? "present" : r < 0.94 ? "late" : r < 0.98 ? "absent" : "excused", marked_by: c.teacher.id });
      }
    }
  }
  for (let i = 0; i < register.length; i += 500) must(await sb.from("attendance_records").insert(register.slice(i, i + 500)), "registers");

  // Homework: two past (most handed in), one due soon.
  const subs = [];
  for (const c of classes) {
    const hw = must(
      await sb
        .from("homework")
        .insert([
          { class_id: c.row.id, teacher_id: c.teacher.id, title: `${c.subject} practice sheet 1`, instructions: "Complete every question and show your working.", due_at: addDays(today, -9).toISOString() },
          { class_id: c.row.id, teacher_id: c.teacher.id, title: `${c.subject} reading and notes`, instructions: "Read the pages from the lesson and write five key points.", due_at: addDays(today, -2).toISOString() },
          { class_id: c.row.id, teacher_id: c.teacher.id, title: `${c.subject} practice sheet 2`, instructions: "Questions 1–10.", due_at: addDays(today, between(2, 6)).toISOString() },
        ])
        .select("id, due_at"),
      "homework",
    );
    for (const ch of children.filter((x) => x.yg.id === c.yg.id)) {
      for (const h of hw.slice(0, 2)) {
        if (rand() < 0.78) subs.push({ homework_id: h.id, child_id: ch.row.id, kind: "text", response_text: "Done. My answers are in my exercise book.", submitted_at: addDays(new Date(h.due_at), -between(0, 3)).toISOString() });
      }
    }
  }
  for (let i = 0; i < subs.length; i += 500) must(await sb.from("homework_submissions").insert(subs.slice(i, i + 500)), "hand-ins");

  // Grades: one test per class per child.
  let type = must(await sb.from("assessment_types").select("id").eq("name", "Test quiz").maybeSingle(), "assessment type");
  if (!type) type = must(await sb.from("assessment_types").insert({ name: "Test quiz" }).select().single(), "add assessment type");
  const grades = [];
  for (const c of classes) {
    for (const ch of children.filter((x) => x.yg.id === c.yg.id)) {
      grades.push({ class_id: c.row.id, child_id: ch.row.id, assessment_type_id: type.id, title: `${c.subject} half-term check`, date: iso(addDays(today, -between(5, 15))), raw_score: between(9, 20), max_score: 20, entered_by: c.teacher.id });
    }
  }
  for (let i = 0; i < grades.length; i += 500) must(await sb.from("assessments").insert(grades.slice(i, i + 500)), "grades");

  // Behaviour: merits for everyone, the odd demerit.
  const MERITS = [
    ["Excellent work", 2],
    ["Helpfulness", 1],
    ["Good manners", 1],
    ["Great recitation", 2],
    ["Punctuality", 1],
    ["Leadership", 2],
  ];
  const DEMERITS = [
    ["Lateness", -1],
    ["Missing homework", -1],
    ["Disruption", -1],
  ];
  const behaviour = [];
  for (const ch of children) {
    const myClasses = classes.filter((c) => c.yg.id === ch.yg.id);
    for (let n = between(2, 6); n > 0; n--) {
      const c = pick(myClasses);
      const [category, points] = pick(MERITS);
      behaviour.push({ child_id: ch.row.id, class_id: c.row.id, kind: "merit", points, category, recorded_by: c.teacher.id, occurred_on: iso(addDays(today, -between(0, 20))) });
    }
    if (rand() < 0.3) {
      const c = pick(myClasses);
      const [category, points] = pick(DEMERITS);
      behaviour.push({ child_id: ch.row.id, class_id: c.row.id, kind: "demerit", points, category, recorded_by: c.teacher.id, occurred_on: iso(addDays(today, -between(0, 20))) });
    }
  }
  for (let i = 0; i < behaviour.length; i += 500) must(await sb.from("behaviour_records").insert(behaviour.slice(i, i + 500)), "behaviour");

  // A class announcement each.
  must(
    await sb.from("announcements").insert(
      classes.map((c) => ({ scope: "class", class_id: c.row.id, author_id: c.teacher.id, title: `Welcome to ${c.subject}`, body: "This is test data for the trial period. Lessons, homework and grades here are made up." })),
    ),
    "announcements",
  );

  const sample = children[0];
  console.log(`Test data ready: ${staff.length} staff, ${families} families, ${children.length} pupils, ${classes.length} classes, ${register.length} register marks, ${subs.length} hand-ins.`);
  console.log(`Sign in as teacher ${staff[0].email} (Staff), parent ${sample.parentEmail} (Parent) or pupil ${sample.username} (Pupil). All test accounts use the password given to the workflow.`);
}

try {
  if (mode === "remove") await remove();
  else if (mode === "generate") await generate();
  else throw new Error(`Unknown mode "${mode}": use generate or remove.`);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
