// Portal demo only: one made-up school, built the same way every time (a seeded
// random generator), with dates around today so registers, homework and the
// calendar look current. Every name is invented; nobody here is a real person.
// House rules: no trips, no music, no photos of faces.

import type { Row, Tables } from "@/lib/demo/postgrest";
import english from "../../../content/syllabus/ks1-3/english.json";
import mathematics from "../../../content/syllabus/ks1-3/mathematics.json";
import science from "../../../content/syllabus/ks1-3/science.json";
import quran from "../../../content/syllabus/ks1-3/quran.json";
import islamic from "../../../content/syllabus/ks1-3/islamic-studies.json";
import arabic from "../../../content/syllabus/ks1-3/arabic.json";
import history from "../../../content/syllabus/ks1-3/history.json";
import geography from "../../../content/syllabus/ks1-3/geography.json";

// ── ids and helpers ───────────────────────────────────────────────────────
const TABLE_CODES: Record<string, number> = {};
let codeNext = 16;
export function uid(kind: string, n: number): string {
  const code = (TABLE_CODES[kind] ??= codeNext++);
  return `${code.toString(16).padStart(3, "0")}de000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const USERS = {
  head: uid("user", 1),
  office: uid("user", 2),
  t1: uid("user", 11), // English: the demo teacher
  t2: uid("user", 12), // Mathematics
  t3: uid("user", 13), // Science
  t4: uid("user", 14), // Qur'an and Islamic Studies
  t5: uid("user", 15), // Arabic, History and Geography
  t6: uid("user", 16), // SENCo, also teaches Islamic Studies
};

export type DemoRole = "head_teacher" | "teacher" | "admin" | "parent" | "student";
export const ROLE_LABEL: Record<DemoRole, string> = { head_teacher: "Head teacher", teacher: "Teacher", admin: "Office", parent: "Parent", student: "Pupil" };
export const ROLE_ORDER: DemoRole[] = ["head_teacher", "teacher", "admin", "parent", "student"];

export type Seeded = { tables: Tables; who: Record<DemoRole, { userId: string; name: string; email: string; childIds: string[] }> };

export function buildSeed(now: Date = new Date()): Seeded {
  const rand = rng(20261111);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const t: Tables = {};
  const add = (table: string, row: Row) => {
    (t[table] ||= []).push(row);
    return row;
  };
  const counters: Record<string, number> = {};
  const next = (kind: string) => uid(kind, (counters[kind] = (counters[kind] || 0) + 1));

  const DAY = 86400000;
  const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
  const iso = (d: Date) => d.toISOString();
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const weekday = (d: Date) => ((d.getDay() + 6) % 7) + 1; // Mon 1 .. Sun 7
  const schoolDays = (from: number, to: number) => {
    const out: Date[] = [];
    for (let i = from; i <= to; i++) {
      const d = addDays(today, i);
      if (weekday(d) <= 5) out.push(d);
    }
    return out;
  };
  const created = iso(addDays(today, -60));

  // ── the school year ─────────────────────────────────────────────────────
  const ay = add("academic_years", { id: uid("ay", 1), label: "2026 to 2027", starts_on: "2026-09-01", ends_on: "2027-07-21", is_test: false, created_at: created });
  const termRows = [
    { name: "Autumn term", starts_on: "2026-09-02", ends_on: "2026-12-18", half_term_starts_on: "2026-10-26", half_term_ends_on: "2026-10-30" },
    { name: "Spring term", starts_on: "2027-01-04", ends_on: "2027-03-26", half_term_starts_on: "2027-02-15", half_term_ends_on: "2027-02-19" },
    { name: "Summer term", starts_on: "2027-04-12", ends_on: "2027-07-21", half_term_starts_on: "2027-05-31", half_term_ends_on: "2027-06-04" },
  ].map((x, i) => add("terms", { id: uid("term", i + 1), academic_year_id: ay.id, sanity_document_id: null, synced_at: null, created_at: created, source: "manual", ...x }));
  const term = termRows[0];
  for (const [i, x] of [
    { label: "Autumn term starts", kind: "term_start", date: "2026-09-02", end_date: null },
    { label: "Autumn half term", kind: "half_term", date: "2026-10-26", end_date: "2026-10-30" },
    { label: "Autumn term ends", kind: "term_end", date: "2026-12-18", end_date: null },
    { label: "Spring term starts", kind: "term_start", date: "2027-01-04", end_date: null },
    { label: "Spring half term", kind: "half_term", date: "2027-02-15", end_date: "2027-02-19" },
    { label: "Eid al-Fitr (school closed, dates to be confirmed)", kind: "closure", date: "2027-03-10", end_date: "2027-03-11" },
  ].entries())
    add("site_term_dates", { id: uid("std", i + 1), notes: null, confirmed: true, created_at: created, ...x });

  const yearGroups = [7, 8, 9].map((n, i) => add("year_groups", { id: uid("yg", n), name: `Year ${n}`, sort_order: n, is_test: false, created_at: created, capacity: 24 + i * 2 }));
  const subjectsList: [string, string, boolean][] = [
    ["English", "EN", true],
    ["Mathematics", "MA", true],
    ["Science", "SC", true],
    ["Qur'an", "QU", true],
    ["Islamic Studies", "IS", true],
    ["Arabic", "AR", false],
    ["History", "HI", false],
    ["Geography", "GE", false],
  ];
  const subjects = subjectsList.map(([name, code, core], i) => add("subjects", { id: uid("subject", i + 1), name, code, is_core: core, is_test: false, created_at: created }));
  const subj = (name: string) => subjects.find((s) => s.name === name)!;

  // ── staff ───────────────────────────────────────────────────────────────
  const staff: { id: string; name: string; email: string; role: string; title: string; subjects: string[] }[] = [
    { id: USERS.head, name: "Amina Rahman", email: "head@demo-school.example", role: "head_teacher", title: "Headteacher", subjects: [] },
    { id: USERS.office, name: "Sarah Begum", email: "office@demo-school.example", role: "admin", title: "School office manager", subjects: [] },
    { id: USERS.t1, name: "Yusuf Ali", email: "y.ali@demo-school.example", role: "teacher", title: "Teacher of English", subjects: ["English"] },
    { id: USERS.t2, name: "Maryam Siddiqui", email: "m.siddiqui@demo-school.example", role: "teacher", title: "Teacher of Mathematics", subjects: ["Mathematics"] },
    { id: USERS.t3, name: "Ibrahim Patel", email: "i.patel@demo-school.example", role: "teacher", title: "Teacher of Science", subjects: ["Science"] },
    { id: USERS.t4, name: "Hafsa Qureshi", email: "h.qureshi@demo-school.example", role: "teacher", title: "Teacher of Qur'an and Islamic Studies", subjects: ["Qur'an", "Islamic Studies"] },
    { id: USERS.t5, name: "Bilal Hussain", email: "b.hussain@demo-school.example", role: "teacher", title: "Teacher of Arabic and Humanities", subjects: ["Arabic", "History", "Geography"] },
    { id: USERS.t6, name: "Ruqayyah Ahmed", email: "r.ahmed@demo-school.example", role: "teacher", title: "SENCo and teacher of Islamic Studies", subjects: ["Islamic Studies"] },
  ];
  for (const s of staff) {
    add("profiles", { id: s.id, role: s.role === "head_teacher" ? "admin" : s.role === "admin" ? "admin" : "teacher", full_name: s.name, email: s.email, timezone: "Europe/London", created_at: created, must_change_password: false });
    add("user_roles", { id: next("ur"), user_id: s.id, role: s.role, scope_type: "none", scope_id: null, granted_by: USERS.head, granted_at: created });
    add("staff_profiles", { id: next("sp"), user_id: s.id, display_title: s.title, bio: `${s.name.split(" ")[0]} has taught in UK schools for several years and joined the academy at its founding.`, qualifications: "QTS, PGCE", subjects_taught: s.subjects, years_experience: 6 + (s.name.length % 9), languages: ["English", "Arabic"], photo_path: null, contact_visible: true, updated_at: created, phone: null, active: true });
    add("staff_members", { id: next("sm"), profile_id: s.id, display_name: s.name, role_title: s.title, bookable: s.role !== "teacher", teams_meeting_url: null, created_at: created, active: true });
    add("staff_vetting_records", { id: next("vet"), user_id: s.id, dbs_check_date: "2026-07-01", dbs_certificate_reference: `00${1000 + s.name.length * 37}`, dbs_renewal_due: "2029-07-01", references_received: true, references_received_date: "2026-06-20", right_to_work_verified: true, right_to_work_verified_date: "2026-06-18", right_to_work_document_type: "Passport", right_to_work_verified_by: USERS.office, qualification_check_done: true, qualification_check_date: "2026-06-18", notes: null, updated_at: created, safeguarding_training_date: "2026-08-28", start_date: "2026-09-01" });
    add("portal_prefs", { user_id: s.id, pinned_pages: [], nav_open: [], updated_at: created, tours_seen: ["admin:v1", "teach:v1", "family:v1", "student:v1", "tip:lesson-editor:v1", "tip:planner:v1"], guide_progress: {} });
    add("user_pins", { user_id: s.id, pin_hash: "demo", failed_attempts: 0, locked_until: null, updated_at: created, needs_reset: false });
  }
  add("user_permissions", { id: next("perm"), user_id: USERS.head, permission: "safeguarding_lead", granted_by: USERS.head, granted_at: created });
  add("user_permissions", { id: next("perm"), user_id: USERS.head, permission: "timetabler", granted_by: USERS.head, granted_at: created });
  add("user_permissions", { id: next("perm"), user_id: USERS.head, permission: "can_export_data", granted_by: USERS.head, granted_at: created });
  add("user_permissions", { id: next("perm"), user_id: USERS.head, permission: "assessment_lead", granted_by: USERS.head, granted_at: created });
  add("user_permissions", { id: next("perm"), user_id: USERS.t6, permission: "senco", granted_by: USERS.head, granted_at: created });
  add("user_permissions", { id: next("perm"), user_id: USERS.office, permission: "timetabler", granted_by: USERS.head, granted_at: created });
  add("user_roles", { id: next("ur"), user_id: USERS.t6, role: "senco", scope_type: "none", scope_id: null, granted_by: USERS.head, granted_at: created });

  // ── families and pupils ─────────────────────────────────────────────────
  const surnames = ["Malik", "Khan", "Hussain", "Ahmed", "Patel", "Rahman", "Begum", "Chowdhury", "Iqbal", "Mahmood", "Akhtar", "Sheikh", "Yusuf", "Mirza", "Haider", "Nawaz", "Saleem", "Farooq", "Aziz", "Karim", "Hassan", "Omar", "Anwar", "Bashir", "Qadir", "Latif", "Raza", "Shah"];
  const boys = ["Zayd", "Adam", "Ismail", "Musa", "Harun", "Idris", "Ayaan", "Hamza", "Ilyas", "Yahya", "Nuh", "Sulayman", "Zakariya", "Dawud", "Ibrahim", "Uthman", "Imran", "Rayyan", "Bilal", "Khalid"];
  const girls = ["Aisha", "Maryam", "Safiya", "Hafsa", "Zainab", "Ruqayyah", "Sumayyah", "Khadijah", "Asiya", "Layla", "Inaya", "Noor", "Huda", "Amira", "Yasmin", "Sara", "Hana", "Iman", "Fatimah", "Ameena"];
  const mothers = ["Khadijah", "Nadia", "Rubina", "Farah", "Shazia", "Salma", "Ayesha", "Samira", "Rehana", "Nasreen", "Fozia", "Tahira", "Bushra", "Lubna"];
  const fathers = ["Imran", "Tariq", "Asif", "Kamran", "Nadeem", "Faisal", "Javed", "Rashid", "Shahid", "Zubair", "Adnan", "Waqas", "Junaid", "Usman"];
  // Family sizes: 40 pupils over 28 families (a few with two or three at the school).
  const sizes = [2, 3, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 2, 1];
  type Pupil = { id: string; name: string; first: string; year: number; yg: Row; parentId: string; familyIdx: number; gender: "M" | "F" };
  const pupils: Pupil[] = [];
  const parents: { id: string; name: string; email: string; family: Row; children: string[] }[] = [];
  let pupilN = 0;
  const yearCount: Record<number, number> = { 7: 0, 8: 0, 9: 0 };
  sizes.forEach((size, fi) => {
    const surname = surnames[fi];
    const mum = fi === 0 ? "Khadijah" : mothers[fi % mothers.length];
    const parentId = uid("user", 100 + fi);
    const parentName = fi % 3 === 2 ? `${fathers[fi % fathers.length]} ${surname}` : `${mum} ${surname}`;
    const email = `${parentName.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
    const fam = add("families", { id: uid("family", fi + 1), family_name: `${surname} family`, created_at: created });
    add("family_members", { family_id: fam.id, profile_id: parentId });
    add("profiles", { id: parentId, role: "parent", full_name: parentName, email, timezone: fi % 7 === 3 ? "Asia/Dubai" : "Europe/London", created_at: created, must_change_password: false });
    add("user_roles", { id: next("ur"), user_id: parentId, role: "parent", scope_type: "family", scope_id: fam.id, granted_by: USERS.office, granted_at: created });
    add("portal_prefs", { user_id: parentId, pinned_pages: [], nav_open: [], updated_at: created, tours_seen: ["family:v1"], guide_progress: {} });
    const kids: string[] = [];
    for (let k = 0; k < size; k++) {
      // Spread siblings over year groups; the first family is the demo family (Year 8 and Year 7).
      let year = fi === 0 ? [8, 7][k] : [7, 8, 9][(fi + k * 2) % 3];
      if (yearCount[year] >= 14) year = [7, 8, 9].find((y) => yearCount[y] < 14) || year;
      yearCount[year]++;
      const girl = fi === 0 ? k === 0 : (fi + k) % 2 === 0;
      const first = fi === 0 ? ["Aisha", "Zayd"][k] : girl ? girls[(fi * 3 + k) % girls.length] : boys[(fi * 3 + k) % boys.length];
      const id = uid("child", ++pupilN);
      const yg = yearGroups.find((y) => y.name === `Year ${year}`)!;
      const birthYear = 2026 - year - 5;
      pupils.push({ id, name: `${first} ${surname}`, first, year, yg, parentId, familyIdx: fi, gender: girl ? "F" : "M" });
      add("children", { id, parent_user_id: parentId, name: `${first} ${surname}`, dob: `${birthYear}-${String(1 + ((pupilN * 5) % 12)).padStart(2, "0")}-${String(1 + ((pupilN * 7) % 27)).padStart(2, "0")}`, year_group_id: yg.id, is_test: false, created_at: created, hide_from_leaderboard: false, microsoft_email: `${first.toLowerCase()}.${surname.toLowerCase()}@pupils.demo-school.example`, working_above_year_group: pupilN === 9, pupil_number: `TGA${String(1000 + pupilN)}` });
      add("pupil_details", { id: next("pd"), child_id: id, gender: girl ? "Female" : "Male", address_line1: `${10 + pupilN} Example Road`, address_line2: null, town: pick(["Birmingham", "Leicester", "Bradford", "London", "Manchester", "Luton"]), postcode: "AB1 2CD", home_language: pick(["English", "English", "Urdu", "Bengali", "Arabic", "Somali"]), ethnicity: null, previous_school: "Home educated", siblings_at_school: size > 1 ? "Yes" : "No", gp_name: "Example Medical Centre", gp_phone: "01632 960000", medical_conditions: pupilN % 11 === 4 ? "Mild asthma (inhaler kept at home)" : null, allergies: pupilN % 13 === 6 ? "Peanuts" : null, medication: null, dietary_needs: null, sen_notes: null, health_confirmed: true, photo_consent: false, trip_consent: false, completed_at: created, completed_by: parentId, created_at: created, updated_at: created, updated_by: parentId });
      add("pupil_emergency_contacts", { id: next("pec"), child_id: id, name: parentName, relationship: fi % 3 === 2 ? "Father" : "Mother", phone: "+44 7700 900" + String(100 + fi).slice(-3), alt_phone: null, email, is_authorised_collector: true, parental_responsibility: true, priority: 1, created_at: created, updated_at: created });
      add("pupil_emergency_contacts", { id: next("pec"), child_id: id, name: `${pick(["Amir", "Saima", "Hina", "Rizwan"])} ${surname}`, relationship: pick(["Aunt", "Uncle", "Grandparent"]), phone: "+44 7700 900" + String(500 + fi).slice(-3), alt_phone: null, email: null, is_authorised_collector: true, parental_responsibility: false, priority: 2, created_at: created, updated_at: created });
      add("consent_register", { id: next("cons"), child_id: id, category: "recording", given: pupilN % 5 !== 0, wording_id: null, wording_snapshot: "Lessons may be recorded for pupils who miss them.", given_by: parentId, given_at: created });
      add("recording_consents", { id: next("rc"), child_id: id, given: pupilN % 5 !== 0, given_by: parentId, given_at: created });
      kids.push(id);
    }
    parents.push({ id: parentId, name: parentName, email, family: fam, children: kids });
  });

  // Pupil logins: every pupil has one; the demo pupil is Aisha Malik.
  for (const p of pupils) {
    const profileId = uid("user", 1000 + pupils.indexOf(p));
    add("profiles", { id: profileId, role: "student", full_name: p.name, email: `${p.first.toLowerCase()}.${p.name.split(" ")[1].toLowerCase()}@pupils.demo-school.example`, timezone: "Europe/London", created_at: created, must_change_password: false });
    add("user_roles", { id: next("ur"), user_id: profileId, role: "student", scope_type: "none", scope_id: null, granted_by: USERS.office, granted_at: created });
    add("student_accounts", { id: next("sa"), child_id: p.id, profile_id: profileId, invited_at: created, created_at: created });
    add("student_logins", { id: next("sl"), child_id: p.id, profile_id: profileId, username: `${p.first.toLowerCase()}.${p.name.split(" ")[1].toLowerCase()}`, must_change_password: false, password_generated_at: created, reset_by: null, created_at: created });
    add("portal_prefs", { user_id: profileId, pinned_pages: [], nav_open: [], updated_at: created, tours_seen: ["student:v1"], guide_progress: {} });
  }
  const pupilProfile = (childId: string) => t.student_accounts.find((s) => s.child_id === childId)!.profile_id as string;

  // Houses.
  const houses = [
    ["Al-Fajr", "#1f6f5c", "Begin with intention"],
    ["An-Nur", "#b7892e", "Light the way for others"],
    ["As-Sabr", "#3a5a8c", "Patience brings reward"],
    ["Al-Ihsan", "#8c3a4d", "Do everything with excellence"],
  ].map(([name, colour, motto], i) => add("houses", { id: uid("house", i + 1), name, colour, motto, sort_order: i + 1, active: true, created_at: created }));
  pupils.forEach((p, i) => add("house_members", { id: next("hm"), child_id: p.id, house_id: houses[i % 4].id, assigned_by: USERS.head, assigned_at: created }));
  add("house_point_settings", { id: uid("hps", 1), singleton: true, max_per_award: 5, daily_cap_per_pupil: 10, updated_by: USERS.head, updated_at: created });

  // ── classes ─────────────────────────────────────────────────────────────
  const teacherFor: Record<string, string> = { English: USERS.t1, Mathematics: USERS.t2, Science: USERS.t3, "Qur'an": USERS.t4, "Islamic Studies": USERS.t4, Arabic: USERS.t5, History: USERS.t5, Geography: USERS.t5 };
  const classes: { row: Row; year: number; subject: string; teacher: string; pupils: Pupil[] }[] = [];
  let classN = 0;
  for (const year of [7, 8, 9]) {
    const yg = yearGroups.find((y) => y.name === `Year ${year}`)!;
    const inYear = pupils.filter((p) => p.year === year);
    for (const s of subjectsList.map((x) => x[0])) {
      const teacher = s === "Islamic Studies" && year === 9 ? USERS.t6 : teacherFor[s];
      const row = add("classes", { id: uid("class", ++classN), name: `${year} ${s}`, year_group: `y${year}`, subject: s, created_at: created, academic_year_id: ay.id, year_group_id: yg.id, subject_id: subj(s).id, weekly_lessons: s === "English" || s === "Mathematics" ? 4 : s === "Science" || s === "Qur'an" ? 3 : 2, lesson_length_minutes: 50, is_test: false, meeting_url: "https://teams.microsoft.com/l/meetup-join/demo" });
      classes.push({ row, year, subject: s, teacher, pupils: inYear });
      for (const p of inYear) add("enrolments", { id: next("enr"), class_id: row.id, child_id: p.id, created_at: created });
      add("user_roles", { id: next("ur"), user_id: teacher, role: "teacher", scope_type: "class", scope_id: row.id, granted_by: USERS.head, granted_at: created });
      add("class_subject_teachers", { id: next("cst"), class_id: row.id, subject_id: subj(s).id, teacher_id: teacher, valid_from: "2026-09-01", valid_to: null, lessons_per_week: row.weekly_lessons, notes: null, created_by: USERS.head, created_at: created, updated_at: created });
      add("class_settings", { id: next("cset"), class_id: row.id, description: `${s} for Year ${year}.`, section: null, room: null, meeting_link: "https://teams.microsoft.com/l/meetup-join/demo", students_can_comment: true, show_deleted_to_staff: false, auto_draft_missing: false, auto_draft_percent: null, show_overall_grade: true, grade_calculation: "weighted", updated_by: teacher, updated_at: created });
      if (s === "Qur'an") add("quran_class_settings", { id: next("qcs"), class_id: row.id, marking_level: "standard", updated_by: USERS.t4, updated_at: created });
    }
  }
  const cls = (year: number, s: string) => classes.find((c) => c.year === year && c.subject === s)!;

  // ── timetable ───────────────────────────────────────────────────────────
  const periods = [
    ["Form time", "break", "09:00", "09:10", [1, 2, 3, 4, 5], 5],
    ["Lesson 1", "lesson", "09:10", "10:00", [1, 2, 3, 4, 5], 10],
    ["Break", "break", "10:00", "10:10", [1, 2, 3, 4, 5], 15],
    ["Lesson 2", "lesson", "10:10", "11:00", [1, 2, 3, 4, 5], 20],
    ["Break", "break", "11:00", "11:10", [1, 2, 3, 4, 5], 25],
    ["Lesson 3", "lesson", "11:10", "12:00", [1, 2, 3, 4, 5], 30],
    ["Lunch & Dhuhr", "lunch", "12:00", "13:00", [1, 2, 3, 4], 35],
    ["Lesson 4", "lesson", "13:00", "13:50", [1, 2, 3, 4], 40],
    ["Break (Asr)", "break", "13:50", "14:00", [1, 2, 3, 4], 45],
    ["Lesson 5", "lesson", "14:00", "14:50", [1, 2, 3, 4], 50],
    ["End of day", "break", "14:50", "15:00", [1, 2, 3, 4], 55],
    ["Qur'an club", "enrichment", "15:15", "16:00", [1, 2, 3, 4], 60],
  ] as const;
  periods.forEach(([name, kind, s, e, wd, sort], i) => add("timetable_periods", { id: uid("period", i + 1), name, kind, start_time: `${s}:00`, end_time: `${e}:00`, weekdays: [...wd], band: s < "15:00" ? "A" : "B", applies_to: ["all"], activity: kind === "enrichment" ? "Qur'an revision circle" : null, sort, active: true, created_at: created, supervisor_user_id: kind === "enrichment" ? USERS.t4 : null }));
  const run = add("timetable_runs", { id: uid("run", 1), academic_year_id: ay.id, term_id: term.id, status: "published", label: "Autumn timetable", generated_by: "solver", source_run_id: null, created_by: USERS.head, published_by: USERS.head, published_at: iso(addDays(today, -50)), solver_stats: { placed: 0, unplaced: 0 }, created_at: iso(addDays(today, -52)) });
  add("timetable_runs", { id: uid("run", 2), academic_year_id: ay.id, term_id: termRows[1].id, status: "draft", label: "Spring draft", generated_by: "solver", source_run_id: run.id, created_by: USERS.head, published_by: null, published_at: null, solver_stats: { placed: 0, unplaced: 2 }, created_at: iso(addDays(today, -3)) });
  const lessonTimes: [number, string, string][] = [];
  for (const wd of [1, 2, 3, 4, 5]) for (const [s, e] of [["09:10", "10:00"], ["10:10", "11:00"], ["11:10", "12:00"], ["13:00", "13:50"], ["14:00", "14:50"]]) if (wd < 5 || s < "12:00") lessonTimes.push([wd, s, e]);
  // Greedy placement: no class or teacher twice at the same time.
  const busyTeacher = new Set<string>();
  const busyYear = new Set<string>();
  const slots: Row[] = [];
  let slotN = 0;
  for (const c of [...classes].sort((a, b) => Number(b.row.weekly_lessons) - Number(a.row.weekly_lessons))) {
    let placed = 0;
    for (let k = 0; k < lessonTimes.length * 2 && placed < Number(c.row.weekly_lessons); k++) {
      const [wd, s, e] = lessonTimes[(k * 7 + c.year * 3 + classes.indexOf(c)) % lessonTimes.length];
      const kt = `${c.teacher}|${wd}|${s}`;
      const ky = `${c.year}|${wd}|${s}`;
      if (busyTeacher.has(kt) || busyYear.has(ky)) continue;
      if (slots.some((x) => x.class_id === c.row.id && x.weekday === wd)) continue;
      busyTeacher.add(kt);
      busyYear.add(ky);
      slots.push(add("timetable_slots", { id: uid("slot", ++slotN), run_id: run.id, class_id: c.row.id, subject_id: subj(c.subject).id, teacher_user_id: c.teacher, virtual_session_id: null, weekday: wd, start_time: `${s}:00`, end_time: `${e}:00`, created_at: run.created_at, locked: false }));
      placed++;
    }
  }
  // The demo teacher always has lessons today (if today is a school day) so "Your day" is full.
  const todayWd = weekday(today);
  if (todayWd <= 5) {
    for (const [i, year] of [7, 8, 9].entries()) {
      const s = ["09:10", "11:10", "13:00"][i];
      const e = ["10:00", "12:00", "13:50"][i];
      if (todayWd === 5 && s >= "12:00") continue;
      const c = cls(year, "English");
      if (!slots.some((x) => x.class_id === c.row.id && x.weekday === todayWd)) {
        const clash = slots.find((x) => x.weekday === todayWd && x.start_time === `${s}:00` && (x.teacher_user_id === USERS.t1 || classes.find((cc) => cc.row.id === x.class_id)?.year === year));
        if (clash) {
          clash.weekday = todayWd === 1 ? 2 : 1;
        }
        slots.push(add("timetable_slots", { id: uid("slot", ++slotN), run_id: run.id, class_id: c.row.id, subject_id: subj("English").id, teacher_user_id: USERS.t1, virtual_session_id: null, weekday: todayWd, start_time: `${s}:00`, end_time: `${e}:00`, created_at: run.created_at, locked: false }));
      }
    }
  }
  add("protected_times", { id: uid("pt", 1), name: "Jumu'ah", academic_year_id: ay.id, weekday: 5, start_time: "12:15:00", end_time: "13:30:00", created_at: created });
  for (const s of staff.filter((x) => x.role === "teacher")) for (const wd of [1, 2, 3, 4, 5]) add("teacher_availability", { id: next("ta"), teacher_user_id: s.id, academic_year_id: ay.id, weekday: wd, start_time: "09:00:00", end_time: wd === 5 ? "12:00:00" : "15:00:00", contracted: true, created_at: created });

  // Lesson instances: the last four school weeks, today and the next week.
  const days = schoolDays(-28, 7);
  const instances: Row[] = [];
  for (const d of days) {
    for (const sl of slots.filter((x) => x.weekday === weekday(d))) {
      const past = d < today;
      instances.push(add("lesson_instances", { id: next("li"), timetable_slot_id: sl.id, date: dateKey(d), objectives: null, resources: null, bbb_meeting_id: null, bbb_status: past ? "ended" : "scheduled", recording_enabled: false, recording_paused: false, created_at: iso(addDays(d, -7)), teacher_user_id: sl.teacher_user_id }));
    }
  }
  const slotOf = (li: Row) => slots.find((s) => s.id === li.timetable_slot_id)!;
  const classOfSlot = (sl: Row) => classes.find((c) => c.row.id === sl.class_id)!;

  // Registers: every past lesson is marked; today's morning lessons too.
  const statusFor = (p: Pupil, d: Date, li: Row) => {
    const r = rand();
    const pi = pupils.indexOf(p);
    if (pi === 7 && weekday(d) === 1) return "absent"; // a pattern the office follows up
    if (pi === 12 && r < 0.18) return "late";
    if (r < 0.025) return "excused";
    if (r < 0.035) return "absent";
    if (r < 0.06) return "late";
    if (r < 0.068) return "technical";
    void li;
    return "present";
  };
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (const li of instances) {
    const d = new Date(`${li.date}T00:00:00`);
    const sl = slotOf(li);
    const isToday = li.date === dateKey(today);
    if (d > today) continue;
    if (isToday && String(sl.end_time).slice(0, 5) > nowHm) continue;
    // Leave one of the demo teacher's lessons today unmarked, so "Take the register" shows.
    if (isToday && sl.teacher_user_id === USERS.t1) continue;
    for (const p of classOfSlot(sl).pupils) add("attendance_records", { id: next("att"), lesson_instance_id: li.id, child_id: p.id, status: statusFor(p, d, li), marked_by: sl.teacher_user_id, marked_at: iso(at(d, Number(String(sl.start_time).slice(0, 2)), 15)), note: null });
  }
  // Reasons for some absences, follow-ups for others.
  const absences = t.attendance_records.filter((a) => a.status === "absent" || a.status === "excused");
  absences.slice(0, 12).forEach((a, i) => {
    const li = instances.find((x) => x.id === a.lesson_instance_id)!;
    if (i % 2 === 0) add("absence_reasons", { id: next("ar"), child_id: a.child_id, absence_date: li.date, reason_code: a.status === "excused" ? "illness" : "unexplained", note: a.status === "excused" ? "Unwell, parent emailed" : null, recorded_by: USERS.office, recorded_at: iso(new Date(`${li.date}T12:00:00`)) });
  });
  const absentPupil = pupils[7];
  add("absence_followups", { id: next("afu"), child_id: absentPupil.id, absence_date: dateKey(schoolDays(-7, -1).find((d) => weekday(d) === 1) || addDays(today, -7)), status: "open", assigned_to: USERS.office, contact_method: "phone", next_action_due: dateKey(addDays(today, 1)), created_by: USERS.office, created_at: iso(addDays(today, -6)), updated_at: iso(addDays(today, -2)), closed_at: null, escalated_at: null, escalated_by: null, escalation_note: null, escalation_notified_at: null, authorised: null, decided_by: null, decided_at: null });
  add("absence_followup_events", { id: next("afe"), followup_id: t.absence_followups[0].id, kind: "contact", method: "phone", outcome: "no_answer", note: "Rang the main number, no answer. Email sent.", created_by: USERS.office, created_at: iso(addDays(today, -5)) });
  const demoParent = parents[0];
  add("absence_notes", { id: next("an"), child_id: demoParent.children[1], parent_user_id: demoParent.id, from_date: dateKey(addDays(today, 3)), to_date: dateKey(addDays(today, 3)), reason: "Dental appointment in the morning; Zayd will join from Lesson 3.", status: "pending", decided_by: null, decided_at: null, decision_note: null, created_at: iso(addDays(today, -1)), source: "portal", inbound_email_id: null });
  add("absence_notes", { id: next("an"), child_id: pupils[5].id, parent_user_id: pupils[5].parentId, from_date: dateKey(addDays(today, -9)), to_date: dateKey(addDays(today, -8)), reason: "High temperature, resting at home.", status: "approved", decided_by: USERS.office, decided_at: iso(addDays(today, -9)), decision_note: "Get well soon.", created_at: iso(addDays(today, -9)), source: "email", inbound_email_id: null });
  add("absence_notes", { id: next("an"), child_id: pupils[20].id, parent_user_id: pupils[20].parentId, from_date: dateKey(addDays(today, 1)), to_date: dateKey(addDays(today, 2)), reason: "Family wedding abroad.", status: "pending", decided_by: null, decided_at: null, decision_note: null, created_at: iso(addDays(today, -2)), source: "portal", inbound_email_id: null });

  // Staff absence and cover.
  const tAbs = add("teacher_absences", { id: next("tab"), teacher_user_id: USERS.t3, starts_on: dateKey(addDays(today, 1)), ends_on: dateKey(addDays(today, 1)), reason: "Training course", created_by: USERS.head, created_at: iso(addDays(today, -2)), start_time: null, end_time: null, category: "training" });
  const coverSlot = slots.find((s) => s.teacher_user_id === USERS.t3 && s.weekday === weekday(addDays(today, 1)));
  if (coverSlot) add("cover_assignments", { id: next("cov"), slot_id: coverSlot.id, cover_date: dateKey(addDays(today, 1)), original_teacher_user_id: USERS.t3, covering_teacher_user_id: USERS.t1, reason: "Training course", created_by: USERS.head, created_at: iso(addDays(today, -1)), families_notified_at: iso(addDays(today, -1)), absence_id: tAbs.id, teacher_notified_at: iso(addDays(today, -1)) });

  // Staff clock-in.
  for (const s of staff) {
    for (const d of schoolDays(-6, -1)) add("staff_shifts", { id: next("shift"), user_id: s.id, clocked_in_at: iso(at(d, 8, 40 + (s.name.length % 15))), clocked_out_at: iso(at(d, 15, 20)), note: null, clocked_out_by: null, auto_closed: false, created_at: iso(at(d, 8, 40)), last_seen_at: iso(at(d, 15, 20)) });
  }
  add("lms_settings", { id: uid("lms", 1), recording_retention_days: 30, absence_alert_delay_minutes: 15, unexplained_absence_threshold: 3, unexplained_absence_period_days: 30, updated_by: USERS.head, updated_at: created, require_clock_in: false, clock_in_roles: [], auto_clock_out_hours: 10, heartbeat_grace_minutes: 30 });

  // ── curriculum ──────────────────────────────────────────────────────────
  const syllabi = [english, mathematics, science, quran, islamic, arabic, history, geography] as unknown as { slug: string; subject: string; yearMap: Record<string, { unit: string; focus?: string[]; skills?: string[]; keyTerms?: string[]; assess?: string; prereq?: string; leadsTo?: string; weeks?: unknown[]; halfTerm?: string }[]> }[];
  const halfOf = (title: string) => {
    const m = title.match(/^\s*(autumn|spring|summer)\s*([12])\b/i);
    return m ? `${m[1].toLowerCase()}${m[2]}` : null;
  };
  let unitN = 0;
  let lessonN = 0;
  for (const s of syllabi) {
    for (const y of ["y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9"]) {
      (s.yearMap[y] || []).forEach((u, pos) => {
        const unit = add("curriculum_units", { id: uid("unit", ++unitN), subject_slug: s.slug, subject: s.subject, kind: "syllabus", year: y, half_term: u.halfTerm || halfOf(u.unit), term: null, position: pos, ref: null, paper: null, title: u.unit, focus: u.focus || [], skills: u.skills || [], key_terms: u.keyTerms || [], assess: u.assess || null, prereq: u.prereq || null, leads_to: u.leadsTo || null, weeks: u.weeks || [], resources: null, founding_year: null, extra: null, key_order: null, updated_by: null, updated_by_name: "Curriculum team", updated_at: created, created_at: created });
        // Lessons for the autumn units of the subjects taught most.
        const ht = unit.half_term as string | null;
        if (!ht || !["autumn1", "autumn2", "spring1"].includes(ht) || !["y7", "y8", "y9"].includes(y)) return;
        const name = String(u.unit).replace(/^(autumn|spring|summer)\s*\d\s*:\s*/i, "");
        const focus = (u.focus || []).slice(0, ht === "spring1" ? 3 : 6);
        focus.forEach((f, i) => {
          const no = ++lessonN;
          add("curriculum_lessons", { id: uid("lesson", no), subject_slug: s.slug, subject: s.subject, year: y, board: null, unit: name, lesson_no: no, title: f.replace(/^Assessment:\s*/i, "Assessment: "), duration: 50, objectives: [`Explain ${f.split(/[:(]/)[0].trim().toLowerCase()}`, "Use the key vocabulary accurately", "Apply the idea to a new example"], deck_path: null, pdf_path: null, version: 1, edited_by: null, edited_at: null, created_at: created, plan_pdf_path: null, plan_docx_path: null, content: null, content_updated_at: null, content_updated_by: null, content_updated_by_name: null, custom_deck: false, rebuild_requested: false, built_hash: null, plan_hash: null, pupil_pdf_path: null });
          const status = ht === "autumn1" ? "approved" : ht === "autumn2" ? (i < 3 ? "approved" : i < 5 ? "in_review" : "submitted") : i === 0 ? "submitted" : null;
          if (status) add("curriculum_signoffs", { id: next("cso"), subject_slug: s.slug, scope: "lesson", ref: `${y}/${no}`, status, note: null, checked_by: USERS.head, checked_name: "Amina Rahman", checked_at: created, submitted_by: teacherFor[s.subject] || USERS.t1, submitted_name: "Subject teacher", submitted_at: created, approved_by: status === "approved" ? USERS.head : null, approved_name: status === "approved" ? "Amina Rahman" : null, approved_at: status === "approved" ? created : null, approved_version: status === "approved" ? 1 : null, changed_since_approval: false });
        });
      });
    }
  }
  add("curriculum_lesson_feedback", { id: next("clf"), lesson_id: t.curriculum_lessons[2].id, part: "slide-3", part_label: "Slide 3", body: "This slide needs a simple diagram to show the idea.", status: "open", response: null, author_id: USERS.t1, author_name: "Yusuf Ali", created_at: iso(addDays(today, -2)), handled_by: null, handled_by_name: null, handled_at: null });
  add("curriculum_sync_runs", { id: next("csr"), started_at: iso(addDays(today, -1)), finished_at: iso(addDays(today, -1)), ok: true, trigger: "schedule", sent_units: 0, sent_lessons: 0, received_units: unitN, received_lessons: lessonN, commit_sha: "demo", problems: [], message: "Up to date" });
  for (const [i, s] of subjects.entries()) {
    add("mark_schemes", { id: uid("ms", i + 1), subject_id: s.id, scale_name: "Working at (KS3)", is_active: true, created_at: created });
  }
  t.mark_schemes.forEach((ms, i) => [["Greater depth", 85], ["Secure", 65], ["Developing", 45], ["Emerging", 0]].forEach(([l, m], j) => add("grade_boundaries", { id: uid("gb", i * 10 + j + 1), mark_scheme_id: ms.id, label: l, min_percent: m, created_at: created })));
  const aTypes = ["Class test", "End of unit assessment", "Homework assessment", "Piece of work"].map((n, i) => add("assessment_types", { id: uid("atype", i + 1), name: n, created_at: created }));
  [
    "{name} makes a positive contribution in class discussions.",
    "{name} reads fluently and with growing expression.",
    "{name} sets out working clearly and checks answers carefully.",
    "{name} has made strong progress in tajweed this term.",
    "{name} is polite and helpful to classmates.",
    "{name} should read for twenty minutes each evening.",
    "{name} asks thoughtful questions in lessons.",
    "{name} hands homework in on time and takes pride in it.",
  ].forEach((text, i) => add("comment_bank", { id: next("cb"), subject_id: null, text, created_by: USERS.head, created_at: created }));
  for (const c of classes) aTypes.slice(0, 3).forEach((a, i) => add("class_grade_categories", { id: next("cgc"), class_id: c.row.id, name: a.name, weight: [40, 40, 20][i], assessment_type_id: a.id, position: i, created_at: created }));

  // Assessments: two per class with marks for each pupil.
  for (const c of classes) {
    const ms = t.mark_schemes.find((m) => m.subject_id === c.row.subject_id)!;
    ["Autumn 1 assessment", "Mid-unit check"].forEach((title, k) => {
      for (const p of c.pupils) {
        const max = k === 0 ? 40 : 20;
        const pct = Math.max(25, Math.min(98, Math.round(55 + (rand() - 0.4) * 50 + (p.first.length % 5) * 3)));
        const label = pct >= 85 ? "Greater depth" : pct >= 65 ? "Secure" : pct >= 45 ? "Developing" : "Emerging";
        add("assessments", { id: next("asmt"), class_id: c.row.id, child_id: p.id, assessment_type_id: aTypes[k === 0 ? 1 : 0].id, mark_scheme_id: ms.id, title, date: dateKey(addDays(today, k === 0 ? -24 : -6)), raw_score: Math.round((pct / 100) * max), max_score: max, percent: pct, grade_label: label, moderation_notes: null, entered_by: c.teacher, created_at: iso(addDays(today, k === 0 ? -23 : -5)), updated_at: iso(addDays(today, k === 0 ? -23 : -5)), status: "marked" });
      }
    });
  }

  // ── classwork, homework and marking ─────────────────────────────────────
  const hwTitles: Record<string, string[]> = {
    English: ["Short story opening: 150 words", "Analytical paragraph on The Monkey's Paw", "Vocabulary log: ten new words", "Persuasive letter draft"],
    Mathematics: ["Fractions practice set", "Ratio word problems", "Algebra: simplifying expressions", "Times tables check"],
    Science: ["Cells diagram and labels", "Particles worksheet", "Write up the practical", "Forces revision questions"],
    "Qur'an": ["Revise this week's ayat", "Tajweed rules: noon saakinah", "Listen and repeat: Surah Al-Mulk 1 to 5"],
    "Islamic Studies": ["Seerah timeline", "Reflection: the importance of honesty", "Five pillars summary"],
    Arabic: ["Vocabulary: the family", "Write five sentences with adjectives", "Reading comprehension"],
    History: ["Source analysis: the Norman Conquest", "Timeline of the Abbasid caliphate"],
    Geography: ["Map skills worksheet", "Rivers: case study notes"],
  };
  let hwN = 0;
  for (const c of classes) {
    const topics = ["Unit introduction", "Core knowledge", "Practice and review"].map((name, i) => add("class_topics", { id: next("topic"), class_id: c.row.id, name: `${c.subject}: ${name}`, position: i + 1, created_by: c.teacher, created_at: created }));
    (hwTitles[c.subject] || []).forEach((title, i) => {
      const dueOffset = [-12, -5, 2, 6][i] ?? 3;
      const hw = add("homework", { id: uid("homework", ++hwN), class_id: c.row.id, lesson_instance_id: null, teacher_id: c.teacher, title, instructions: `Complete the task in full sentences. ${i === 0 ? "Use the success criteria from the lesson." : "Ask in the class comments if anything is unclear."}`, resources: null, due_at: iso(at(addDays(today, dueOffset), 18)), created_at: iso(addDays(today, dueOffset - 7)), updated_at: iso(addDays(today, dueOffset - 7)), max_points: i % 2 === 0 ? 10 : 20, allowed_submission_types: ["text", "file"], allowed_file_types: ["document", "image", "pdf"], late_policy: i === 1 ? "block" : "accept", attachments: [], edited_at: null, edited_by: null, archived_at: null, archived_by: null, topic_id: topics[Math.min(i, 2)].id, assigned_child_ids: null, kind: "assignment" });
      if (dueOffset < 0 || i === 2) {
        c.pupils.forEach((p, j) => {
          if ((j + i) % 6 === 5) return; // missing
          const late = dueOffset < 0 && (j + i) % 7 === 3;
          const sub = add("homework_submissions", { id: next("sub"), homework_id: hw.id, child_id: p.id, kind: "text", response_text: `${p.first}'s answer: I think the main idea is shown through the writer's choices, for example the opening sentence builds tension.`, file_path: null, submitted_at: iso(at(addDays(today, dueOffset + (late ? 1 : -1)), 17, j)), created_at: iso(addDays(today, dueOffset - 1)), updated_at: iso(addDays(today, dueOffset - 1)), link_url: null, files: [] });
          if (dueOffset < 0 && (dueOffset < -7 || j % 5 !== 0)) {
            const mark = Math.max(3, Math.round(Number(hw.max_points) * (0.5 + rand() * 0.5)));
            add("homework_feedback", { id: next("hfb"), submission_id: sub.id, status: j % 9 === 4 ? "resubmission_requested" : "feedback_given", feedback_text: pick(["Well done: clear points with good evidence.", "Good effort. Next time explain your evidence in more detail.", "Excellent vocabulary. Check your full stops.", "Please look again at question 3 and resubmit."]), audio_path: null, audio_seconds: null, resubmit_count: 0, given_by: c.teacher, given_at: iso(addDays(today, dueOffset + 2)), requested_at: null, resubmitted_at: null, updated_at: iso(addDays(today, dueOffset + 2)), mark, marked_files: [] });
            add("homework_marks", { id: next("hmk"), submission_id: sub.id, grade: String(mark), feedback: null, released: true, marked_by: c.teacher, marked_at: iso(addDays(today, dueOffset + 2)), released_by: c.teacher, released_at: iso(addDays(today, dueOffset + 2)) });
          }
        });
      }
    });
    add("class_materials", { id: next("mat"), class_id: c.row.id, topic_id: topics[0].id, kind: "material", title: `${c.subject} knowledge organiser`, body: "The key words and ideas for this unit on one page. Keep it beside you when you revise.", resources: [], allow_comments: true, created_by: c.teacher, created_at: iso(addDays(today, -20)), updated_at: iso(addDays(today, -20)) });
    add("class_materials", { id: next("mat"), class_id: c.row.id, topic_id: topics[1].id, kind: "question", title: "Quick check: what did we learn today?", body: "Reply in the comments with one thing you learnt and one question you still have.", resources: [], allow_comments: true, created_by: c.teacher, created_at: iso(addDays(today, -3)), updated_at: iso(addDays(today, -3)) });
  }
  // No quizzes: the Quizzes switch is off (owner, 11 Nov 2026).

  // Class stream posts.
  for (const c of classes.filter((x) => ["English", "Mathematics", "Qur'an"].includes(x.subject))) {
    add("announcements", { id: next("ann"), scope: "class", class_id: c.row.id, title: "This week", body: `Assalamu alaikum. This week in ${c.subject} we continue the unit. Please bring your exercise book to every lesson.`, author_id: c.teacher, created_at: iso(addDays(today, -2)), edited_at: null, recalled_at: null, pinned: false, expires_at: null, body_format: "plain", attachments: [], allow_comments: true, publish_at: null, audience_child_ids: null, kind: "post", lesson_date: null });
  }
  [
    ["Welcome back after half term", "We hope everyone had a restful break. Lessons continue as normal on the timetable. Please check that your child can join on time."],
    ["Parents' evening booking is open", "You can now book a ten-minute call with each of your child's teachers. Open Parents' evening in the portal to choose times."],
    ["Winter timetable: Asr break", "From this week the Asr break before Lesson 5 is extended, as shown on the timetable."],
  ].forEach(([title, body], i) => add("announcements", { id: next("ann"), scope: "school", class_id: null, title, body, author_id: USERS.head, created_at: iso(addDays(today, -1 - i * 4)), edited_at: null, recalled_at: null, pinned: i === 0, expires_at: null, body_format: "plain", attachments: [], allow_comments: false, publish_at: null, audience_child_ids: null, kind: "announcement", lesson_date: null }));
  const aPost = t.announcements[0];
  add("class_post_comments", { id: next("cpc"), class_id: aPost.class_id, announcement_id: aPost.id, material_id: null, author_id: pupilProfile(cls(7, "English").pupils[0].id), body: "Thank you, Ustadh.", created_at: iso(addDays(today, -1)), deleted_at: null, deleted_by: null });

  // ── behaviour, house points and stars ───────────────────────────────────
  const merits = ["Excellent effort", "Helping others", "Great answer in class", "Homework beyond expectations", "Leadership", "Kindness"];
  const concerns = ["Late to lesson", "Camera off without reason", "Homework not handed in", "Talking over others"];
  for (let i = 0; i < 90; i++) {
    const p = pupils[i % pupils.length];
    const c = classes.find((x) => x.year === p.year && x.subject === subjectsList[i % 8][0])!;
    const merit = i % 5 !== 3;
    add("behaviour_records", { id: next("beh"), child_id: p.id, class_id: c.row.id, kind: merit ? "merit" : "concern", points: merit ? 1 + (i % 3 === 0 ? 1 : 0) : -1, category: merit ? merits[i % merits.length] : concerns[i % concerns.length], note: merit ? null : "Spoke with the pupil after the lesson.", recorded_by: c.teacher, occurred_on: dateKey(addDays(today, -(i % 25))), created_at: iso(addDays(today, -(i % 25))), voided_at: null });
  }
  add("behaviour_badges", { id: next("bb"), child_id: pupils[0].id, badge: "merit_25", awarded_on: dateKey(addDays(today, -4)), awarded_by: USERS.head, created_at: iso(addDays(today, -4)) });
  houses.forEach((h, i) => {
    for (let k = 0; k < 6; k++) add("house_point_awards", { id: next("hpa"), house_id: h.id, points: 2 + ((i + k) % 4), reason: pick(["Quiz winners", "Best attendance this week", "Charity collection", "Qur'an recitation", "Helping in the class stream"]), awarded_by: pick([USERS.head, USERS.t1, USERS.t4]), awarded_on: dateKey(addDays(today, -k * 3)), created_at: iso(addDays(today, -k * 3)), voided_at: null, voided_by: null });
  });
  const weekStart = dateKey(addDays(today, -(weekday(today) - 1)));
  const lastWeek = dateKey(addDays(today, -(weekday(today) - 1) - 7));
  [
    [cls(7, "English"), 0, "approved", lastWeek],
    [cls(8, "Mathematics"), 2, "approved", lastWeek],
    [cls(9, "Qur'an"), 1, "pending", weekStart],
    [cls(8, "English"), 3, "pending", weekStart],
  ].forEach(([c, idx, status, ws]) => {
    const cc = c as (typeof classes)[number];
    const p = cc.pupils[idx as number];
    add("star_of_the_week", { id: next("star"), class_id: cc.row.id, child_id: p.id, week_start: ws, reason: "Consistent hard work and kindness to classmates", nominated_by: cc.teacher, status, decided_by: status === "approved" ? USERS.head : null, decided_at: status === "approved" ? iso(addDays(today, -3)) : null, certificate_path: null, certificate_at: null, certificate_emailed_at: null, created_at: iso(addDays(today, -4)), updated_at: iso(addDays(today, -3)), reasons: ["Effort", "Kindness"], message: null, decision_note: null, announced_at: status === "approved" ? iso(addDays(today, -3)) : null });
  });
  add("detentions", { id: next("det"), child_id: pupils[14].id, behaviour_record_id: t.behaviour_records.find((b) => b.kind === "concern")!.id, scheduled_for: dateKey(addDays(today, 1)), duration_minutes: 15, status: "scheduled", notes: "Online catch-up session for missed homework.", created_by: USERS.t2, created_at: iso(addDays(today, -1)) });
  pupils.slice(0, 18).forEach((p, i) => {
    const c = classes.find((x) => x.year === p.year && x.subject === "Islamic Studies")!;
    add("weekly_tarbiyah_notes", { id: next("wtn"), child_id: p.id, class_id: c.row.id, week_of: lastWeek, note: pick([`${p.first} showed real patience when helping a classmate.`, `${p.first} reflected thoughtfully on honesty in our discussion.`, `${p.first} has been punctual and prepared all week.`]), recorded_by: c.teacher, recorded_at: iso(addDays(today, -3 - (i % 3))) });
  });

  // ── Qur'an ──────────────────────────────────────────────────────────────
  const levels = ["Qaidah", "Juz Amma", "Juz Tabarak", "Hifz track 1", "Hifz track 2"].map((name, i) => add("quran_levels", { id: uid("ql", i + 1), track: i < 3 ? "reading" : "hifz", name, sort: i + 1, meets: i < 3 ? 3 : 4 }));
  const surahs: [number, string][] = [[67, "Al-Mulk"], [78, "An-Naba"], [79, "An-Nazi'at"], [80, "Abasa"], [87, "Al-A'la"], [93, "Ad-Duha"], [36, "Ya-Sin"], [18, "Al-Kahf"]];
  pupils.forEach((p, i) => {
    const c = classes.find((x) => x.year === p.year && x.subject === "Qur'an")!;
    add("quran_child_levels", { child_id: p.id, track: i % 4 === 0 ? "hifz" : "reading", level_id: levels[i % 4 === 0 ? 3 : (i % 3)].id, updated_by: USERS.t4, updated_at: created });
    add("quran_targets", { id: next("qt"), child_id: p.id, class_id: c.row.id, title: `Memorise Surah ${surahs[i % surahs.length][1]}`, target_kind: "surah", target_amount: 1, start_date: dateKey(addDays(today, -20)), due_date: dateKey(addDays(today, 25)), note: null, set_by: USERS.t4, created_at: iso(addDays(today, -20)), updated_at: iso(addDays(today, -20)) });
    for (let k = 0; k < 5; k++) {
      const [no] = surahs[(i + k) % surahs.length];
      const d = addDays(today, -k * 4 - (i % 3));
      add("quran_progress", { id: next("qp"), child_id: p.id, class_id: c.row.id, milestone_type: "quran_memorisation", surah_from: no, surah_to: no, juz: no >= 78 ? 30 : no >= 67 ? 29 : null, topic: null, standard: pick(["excellent", "good", "good", "needs_work"]), note: k === 0 ? "Good fluency; work on the madd." : null, recorded_by: USERS.t4, recorded_at: iso(at(d, 10)), score: 6 + ((i + k) % 5), pages: 1, session_date: dateKey(d), setting: k % 2 ? "revision" : "class", ayah_from: 1, ayah_to: 5 + (k % 6), focus: null, homework_id: null, session_id: null, mistakes: { tajweed: k % 3, memory: (i + k) % 2 }, marking_level: "standard", worked_out_score: 6 + ((i + k) % 5), could_not_recite: false, adjust_reason: null, recitation_kind: k % 2 ? "revision" : "memorisation", date_reason: null });
    }
  });
  add("quran_marking_standard", { id: uid("qms", 1), singleton: true, standard: { excellent: 9, good: 7, needs_work: 0 }, updated_by: USERS.t4, updated_at: created });
  add("quran_homework", { id: next("qh"), level_id: levels[1].id, kind: "memorise", surah: 78, ayah_from: 1, ayah_to: 10, note: "Recite to a parent twice before the next lesson.", due_date: dateKey(addDays(today, 3)), set_by: USERS.t4, created_at: iso(addDays(today, -2)) });

  // ── SEND ────────────────────────────────────────────────────────────────
  [pupils[3], pupils[11], pupils[24], pupils[1]].forEach((p, i) => {
    const plan = add("send_support_plans", { id: next("send"), child_id: p.id, status: i === 3 ? "draft" : "active", support_level: i === 0 ? "ehcp" : "sen_support", primary_need: ["communication_interaction", "cognition_learning", "semh", "cognition_learning"][i], needs_summary: "Benefits from instructions given one step at a time and written down as well as spoken.", needs_source: "Parent and previous school", strengths: "Creative, keen to help, strong verbal reasoning.", pupil_views: "I like it when the teacher checks I understand before we start.", adjustments: ["chunked", "processing_time", "check_in", "pre_teach"], adjustments_other: null, access_extra_time_pct: i === 1 ? 25 : null, access_reader: false, access_scribe: false, access_rest_breaks: i === 2, access_word_processor: i === 1, access_separate_room: false, access_other: null, senco_id: USERS.t6, key_adult_id: USERS.t4, next_review_due: dateKey(addDays(today, 20 + i * 10)), last_reviewed_on: dateKey(addDays(today, -40)), created_by: USERS.t6, created_at: created, updated_by: USERS.t6, updated_at: iso(addDays(today, -10)) });
    add("send_plan_targets", { id: next("spt"), plan_id: plan.id, child_id: p.id, target: "Begin written tasks within two minutes, using the task card.", success_criteria: "Starts independently in four out of five lessons.", support: "Task card on screen; teacher checks in after one minute.", by_when: dateKey(addDays(today, 30)), status: "working_towards", review_note: null, sort: 1, created_at: created, updated_at: created });
    add("send_plan_reviews", { id: next("spr"), plan_id: plan.id, child_id: p.id, held_on: dateKey(addDays(today, -40)), attendees: "SENCo, parent, pupil", parent_attended: true, pupil_views: "Lessons feel easier with the task card.", notes: "Good start to the year.", outcomes: "Keep the adjustments; review next half term.", next_review_due: plan.next_review_due, shared_with_family: true, created_by: USERS.t6, created_at: iso(addDays(today, -40)), updated_at: iso(addDays(today, -40)) });
  });

  // ── safeguarding (fictional, nothing graphic) ───────────────────────────
  const sgCats = ["Attendance pattern", "Wellbeing", "Online safety", "Family circumstances", "Other"].map((label, i) => add("safeguarding_categories", { id: uid("sgc", i + 1), label, active: true, created_at: created }));
  [
    [pupils[7], 0, "medium", "open", "Repeated Monday absences without explanation. Office is contacting the family."],
    [pupils[18], 1, "low", "monitoring", "Pupil seemed quieter than usual in two lessons; teacher checked in and pupil said they were tired."],
    [pupils[26], 2, "low", "closed", "Pupil shared a link in a lesson chat by mistake. Reminded of the online safety rules; parent informed."],
  ].forEach(([p, ci, sev, status, summary], i) => {
    const pp = p as Pupil;
    const c = add("safeguarding_concerns", { id: next("sg"), child_id: pp.id, subject_description: null, reported_by: [USERS.office, USERS.t1, USERS.t5][i], reported_by_role: "staff", category_id: sgCats[ci as number].id, severity: sev, status, summary, actions_taken: "Logged and discussed with the Designated Safeguarding Lead.", outcome: status === "closed" ? "No further action." : null, referral_details: null, created_at: iso(addDays(today, -10 + i * 3)), updated_at: iso(addDays(today, -3 + i)), closed_at: status === "closed" ? iso(addDays(today, -2)) : null });
    add("safeguarding_chronology", { id: next("sgch"), concern_id: c.id, entry: "Concern recorded.", entered_by: c.reported_by, entered_at: c.created_at });
    add("safeguarding_chronology", { id: next("sgch"), concern_id: c.id, entry: "DSL reviewed and agreed next steps.", entered_by: USERS.head, entered_at: iso(addDays(today, -8 + i * 3)) });
  });
  add("safeguarding_reviews", { id: next("sgr"), child_id: pupils[7].id, concern_ids: [t.safeguarding_concerns[0].id], rule: "repeat_absence", reason: "Three unexplained absences in 30 days", trigger_key: "abs-1", opened_at: iso(addDays(today, -4)), due_at: iso(addDays(today, 3)), status: "open", checklist: {}, reviewed_by: null, reviewed_at: null, decision: null, outcome: null, notes: null, notified_at: iso(addDays(today, -4)), overdue_notified_at: null, updated_at: iso(addDays(today, -4)) });
  ["camera never on", "want to leave", "unsafe at home"].forEach((phrase, i) => add("safeguarding_keywords", { id: uid("sgk", i + 1), phrase, created_by: USERS.head, created_at: created }));

  // ── messages ────────────────────────────────────────────────────────────
  const thread = (row: Row, members: [string, string][], msgs: [string, string, number][]) => {
    const th = add("message_threads", { id: next("thread"), kind: "parent_teacher", child_id: null, parent_id: null, teacher_id: null, staff_a_id: null, staff_b_id: null, created_at: iso(addDays(today, -10)), title: null, group_type: null, class_id: null, year_group_id: null, created_by: members[0][0], members_can_reply: true, ...row });
    for (const [user, role] of members) add("message_thread_members", { id: next("tm"), thread_id: th.id, user_id: user, member_role: role, is_admin: role === "staff", added_by: members[0][0], added_at: th.created_at });
    msgs.forEach(([sender, body, daysAgo], k) => {
      const m = add("message_thread_messages", { id: next("msg"), thread_id: th.id, sender_id: sender, body, flagged: false, flagged_keywords: [], created_at: iso(new Date(now.getTime() - daysAgo * DAY - (msgs.length - k) * 600000)), flagged_notified_at: null, edited_at: null, recalled_at: null, original_body: null, reply_to_id: null });
      add("message_reads", { message_id: m.id, reader_id: sender, read_at: m.created_at });
    });
    return th;
  };
  const aisha = pupils[0];
  const zayd = pupils[1];
  thread({ kind: "parent_teacher", child_id: aisha.id, parent_id: demoParent.id, teacher_id: USERS.t1 }, [[USERS.t1, "staff"], [demoParent.id, "parent"]], [
    [demoParent.id, "Assalamu alaikum Ustadh, Aisha found the Monkey's Paw homework hard. Could you suggest how she can plan her paragraph?", 2],
    [USERS.t1, "Wa alaikum assalam. Of course. She can use the PETZAL frame from the lesson; I have added it to Classwork under Core knowledge.", 1.9],
    [demoParent.id, "JazakAllahu khairan, that helps a lot.", 1.8],
  ]);
  thread({ kind: "parent_teacher", child_id: zayd.id, parent_id: demoParent.id, teacher_id: USERS.t2 }, [[USERS.t2, "staff"], [demoParent.id, "parent"]], [
    [USERS.t2, "Zayd did very well in today's fractions check. Please praise him at home!", 0.3],
  ]);
  thread({ kind: "parent_teacher", child_id: pupils[5].id, parent_id: pupils[5].parentId, teacher_id: USERS.t1 }, [[USERS.t1, "staff"], [pupils[5].parentId, "parent"]], [
    [pupils[5].parentId, "Salaam, my son was unwell yesterday. Is there anything he should catch up on?", 1],
    [USERS.t1, "Wa alaikum assalam, I hope he feels better. The lesson slides are in Classwork; the homework deadline is extended to Friday.", 0.9],
  ]);
  thread({ kind: "staff", staff_a_id: USERS.t1, staff_b_id: USERS.head }, [[USERS.t1, "staff"], [USERS.head, "staff"]], [
    [USERS.head, "Could you cover Year 9 Science tomorrow, Lesson 2? Ibrahim is on a course.", 1],
    [USERS.t1, "Yes, no problem. I'll pick up the slides from the Lesson library.", 0.95],
  ]);
  thread({ kind: "group", title: "Year 8 English", group_type: "class", class_id: cls(8, "English").row.id, members_can_reply: false }, [[USERS.t1, "staff"], ...cls(8, "English").pupils.slice(0, 6).map((p) => [p.parentId, "parent"] as [string, string])], [
    [USERS.t1, "Reminder: the persuasive letter draft is due on Friday. Pupils can type it straight into Classwork.", 3],
  ]);
  thread({ kind: "group", title: "Staff room", group_type: "staff", members_can_reply: true }, staff.map((s) => [s.id, "staff"] as [string, string]), [
    [USERS.head, "Assalamu alaikum all. Reports are due to me by the end of next week, please.", 2],
    [USERS.t4, "Noted, JazakAllahu khairan.", 1.9],
    [USERS.office, "Parents' evening slots are now open for booking.", 0.5],
  ]);
  thread({ kind: "pupil_teacher", child_id: aisha.id, teacher_id: USERS.t1 }, [[USERS.t1, "staff"], [pupilProfile(aisha.id), "student"]], [
    [pupilProfile(aisha.id), "Sir, can I hand in my paragraph tomorrow morning?", 1],
    [USERS.t1, "Yes, that's fine this once. Well done for asking.", 0.9],
  ]);
  for (const u of [...staff.map((s) => s.id), ...parents.map((p) => p.id)]) add("message_prefs", { user_id: u, read_receipts_enabled: true, updated_at: created, email_mode: "digest" });
  add("messaging_settings", { id: true, message_retention_days: 730, created_at: created });

  // ── calendar, parents' evening ──────────────────────────────────────────
  [
    ["Parents' evening (online)", "parents_evening", 9, null, "16:00", "19:00", "all"],
    ["Year 9 options information evening", "event", 16, null, "18:00", "19:00", "parents"],
    ["INSET day (no lessons)", "closure", 23, null, null, null, "all"],
    ["End of term assessments", "assessment", 30, 34, null, null, "students"],
    ["Qur'an recitation assembly", "event", 4, null, "14:00", "14:50", "all"],
    ["Staff meeting", "staff", 2, null, "15:15", "16:00", "staff"],
  ].forEach(([title, category, from, to, s, e, audience], i) => add("calendar_events", { id: next("cal"), title, category, starts_on: dateKey(addDays(today, from as number)), ends_on: to ? dateKey(addDays(today, to as number)) : null, start_time: s ? `${s}:00` : null, end_time: e ? `${e}:00` : null, audience, class_id: null, location: "Online", link_url: null, notes: null, created_by: USERS.head, created_at: iso(addDays(today, -14 + i)), updated_at: iso(addDays(today, -14 + i)) }));
  const pe = add("parent_evenings", { id: next("pe"), title: "Autumn parents' evening", starts_at: iso(at(addDays(today, 9), 16)), ends_at: iso(at(addDays(today, 9), 19)), slot_minutes: 10, location: "Online (Teams)", join_url: null, notes: "Ten-minute calls with each teacher.", status: "open", created_by: USERS.head, created_at: iso(addDays(today, -7)), updated_at: iso(addDays(today, -7)) });
  for (const s of staff.filter((x) => x.role === "teacher")) add("parent_evening_teachers", { id: next("pet"), evening_id: pe.id, teacher_id: s.id, join_url: "https://teams.microsoft.com/l/meetup-join/demo", created_at: pe.created_at });
  pupils.slice(2, 12).forEach((p, i) => add("parent_evening_bookings", { id: next("peb"), evening_id: pe.id, teacher_id: USERS.t1, child_id: p.id, parent_user_id: p.parentId, slot_start: iso(at(addDays(today, 9), 16, i * 10)), slot_end: iso(at(addDays(today, 9), 16, i * 10 + 10)), status: "booked", booked_at: iso(addDays(today, -3)), cancelled_at: null, cancelled_by: null }));

  // ── reports ─────────────────────────────────────────────────────────────
  pupils.forEach((p, i) => {
    const status = i < 6 ? "released" : i < 14 ? "approved" : i < 24 ? "pending_approval" : i < 32 ? "draft" : null;
    if (!status) return;
    const comments = Object.fromEntries(subjectsList.slice(0, 5).map(([s]) => [subj(s).id, `${p.first} has worked steadily in ${s} this half term and should keep practising at home.`]));
    const rep = add("term_reports", { id: next("rep"), child_id: p.id, term_id: term.id, status, overall_comment: `${p.first} has settled well and is a positive member of the class.`, subject_comments: comments, narrative: null, written_by: USERS.t1, approved_by: ["released", "approved"].includes(status) ? USERS.head : null, approved_at: ["released", "approved"].includes(status) ? iso(addDays(today, -2)) : null, released_at: status === "released" ? iso(addDays(today, -1)) : null, created_at: iso(addDays(today, -12)), updated_at: iso(addDays(today, -2)), submitted_by: status !== "draft" ? USERS.t1 : null, submitted_at: status !== "draft" ? iso(addDays(today, -5)) : null, returned_by: null, returned_at: null, returned_reason: null, version: 1 });
    if (status === "released") add("term_report_versions", { id: next("repv"), report_id: rep.id, version: 1, child_id: p.id, term_id: term.id, overall_comment: rep.overall_comment, subject_comments: rep.subject_comments, narrative: null, written_by: USERS.t1, approved_by: USERS.head, released_at: rep.released_at });
  });

  // ── fees and payments ───────────────────────────────────────────────────
  add("fee_bands", { id: uid("fb", 1), year_group_range: "Years 7 to 9", order_index: 1, annual_fee: 3600, termly_fee: 1200, monthly_fee: 360, notes: "Sibling discount 10%", created_at: created });
  add("fee_bands", { id: uid("fb", 2), year_group_range: "Years 10 to 11", order_index: 2, annual_fee: 3900, termly_fee: 1300, monthly_fee: 390, notes: null, created_at: created });
  let invN = 0;
  let payN = 0;
  parents.forEach((par, fi) => {
    const acct = add("fee_accounts", { id: next("facct"), reference: `TGA-F-${1001 + fi}`, parent_user_id: par.id, admissions_family_id: null, billing_name: par.name, billing_email: par.email, stripe_customer_id: null, dd_payment_method_id: null, dd_mandate_status: null, dd_mandate_updated_at: null, created_at: created, updated_at: created });
    const plan = fi % 3 === 0 ? "monthly" : fi % 3 === 1 ? "termly" : "annual";
    const count = plan === "monthly" ? 10 : plan === "termly" ? 3 : 1;
    const perChild = plan === "monthly" ? 36000 : plan === "termly" ? 120000 : 360000;
    for (let n = 1; n <= Math.min(count, 4); n++) {
      const due = plan === "monthly" ? addDays(today, -60 + (n - 1) * 30) : plan === "termly" ? addDays(today, -70 + (n - 1) * 100) : addDays(today, -70);
      const amount = perChild * par.children.length * (par.children.length > 1 ? 0.9 : 1);
      const isPast = due < today;
      const paidState = !isPast ? "unpaid" : fi % 9 === 5 && n === Math.min(count, 4) - 1 ? "overdue" : fi % 11 === 7 && n === 2 ? "part_paid" : "paid";
      const paid = paidState === "paid" ? amount : paidState === "part_paid" ? Math.round(amount / 2) : 0;
      const charge = add("fee_charges", { id: next("charge"), parent_user_id: par.id, child_id: null, description: `${plan === "monthly" ? `Monthly fees, instalment ${n} of ${count}` : plan === "termly" ? `${["Autumn", "Spring", "Summer"][n - 1]} term fees` : "Annual fees 2026 to 2027"}`, amount: amount / 100, due_date: dateKey(due), voided_at: null, created_by: USERS.office, created_at: iso(addDays(due, -14)), fee_account_id: acct.id, application_id: null, invoice_number: `TGA-INV-27-${String(++invN).padStart(5, "0")}`, amount_pence: amount, kind: "tuition", plan, instalment_no: n, instalment_count: count, status: paidState === "paid" ? "paid" : paidState === "part_paid" ? "part_paid" : isPast ? "overdue" : "due", paid_pence: paid, processing_since: null, last_failed_at: null, failure_reason: null, waived_reason: null, waived_by: null, waived_at: null, updated_at: iso(due) });
      if (paid > 0) add("fee_payments", { id: next("fpay"), charge_id: charge.id, amount: paid / 100, method: pick(["card", "card", "pay_by_bank"]), paid_on: dateKey(addDays(today, -1 - ((fi * 7 + n * 3) % 26))), reference: `TGA-P-${10001 + payN++}`, recorded_by: USERS.office, created_at: iso(addDays(due, -1)), amount_pence: paid, payment_method_type: "card", stripe_payment_intent_id: null, stripe_charge_id: null, stripe_checkout_session_id: null, stripe_fee_pence: Math.round(paid * 0.015), net_pence: paid - Math.round(paid * 0.015), refunded_pence: 0, disputed: false, livemode: false, recorded_reason: null });
    }
  });
  add("payment_alerts", { id: next("palert"), kind: "overdue", urgency: "medium", title: "Two families have overdue instalments", detail: "Reminders were sent automatically 3 days after the due date.", fee_account_id: null, charge_id: null, stripe_object_id: null, livemode: false, created_at: iso(addDays(today, -2)), resolved_at: null, resolved_by: null, resolution_note: null });
  add("payment_reconciliation_runs", { id: next("prr"), ran_at: iso(addDays(today, -1)), ok: true, livemode: false, summary: { checked: 64, mismatches: 0 } });

  // ── admissions ──────────────────────────────────────────────────────────
  const stages = ["new", "new", "reviewing", "reviewing", "assessment", "assessment", "interview", "offered", "accepted", "waitlisted", "declined", "withdrawn"];
  const applicants = [["Yasin", "Ali"], ["Amal", "Hassan"], ["Hud", "Mansur"], ["Ruqayya", "Sadiq"], ["Owais", "Rauf"], ["Maysa", "Khalil"], ["Talha", "Javed"], ["Inaya", "Hamid"], ["Mikail", "Shafiq"], ["Areeba", "Noman"], ["Sami", "Wahid"], ["Lina", "Arif"]];
  stages.forEach((status, i) => {
    const [first, last] = applicants[i];
    const yr = [7, 8, 9][i % 3];
    const app = add("admissions_applications", { id: next("app"), reference: `TGA-A-${2400 + i}`, status, parent_name: `${pick(mothers)} ${last}`, parent_email: `${last.toLowerCase()}.family@example.com`, parent_phone: "+44 7700 900321", relationship: "Mother", address: `${20 + i} Sample Street, Leicester`, child_first_name: first, child_last_name: last, child_dob: `${2026 - yr - 5}-0${1 + (i % 9)}-1${i % 9}`, child_gender: i % 2 ? "Female" : "Male", year_group_applying: `Year ${yr}`, preferred_start: "January 2027", current_school: pick(["Home educated", "Local secondary school", "Online school"]), current_school_year: `Year ${yr - 1}`, previous_islamic_education: "Weekend madrasah, reading Qur'an with tajweed", send_or_medical_notes: i === 4 ? "Mild dyslexia, assessed in Year 5" : null, how_heard: pick(["Friend or family", "Instagram", "Open evening", "Search engine"]), sibling_at_tarbiyyah: i === 2, sibling_details: i === 2 ? "Brother in Year 9" : null, consent_contact: true, consent_data: true, declaration_name: `${pick(mothers)} ${last}`, notes: null, assigned_to: USERS.office, created_at: iso(addDays(today, -30 + i * 2)), updated_at: iso(addDays(today, -10 + i)), assessment_at: ["assessment", "interview", "offered"].includes(status) ? iso(at(addDays(today, i - 4), 10)) : null, interview_at: status === "interview" ? iso(at(addDays(today, 2), 16)) : null, report_received: true, deposit_received: status === "accepted", id_documents_received: i > 4, decision_note: status === "declined" ? "Year group full for January; offered waiting list." : null, offer_made_at: ["offered", "accepted"].includes(status) ? iso(addDays(today, -5)) : null, offer_deadline: status === "offered" ? dateKey(addDays(today, 9)) : null, admin_fee_amount: 50, admin_fee_received: i > 1, admin_fee_received_at: i > 1 ? iso(addDays(today, -25 + i)) : null, deposit_amount: 300, deposit_received_at: status === "accepted" ? iso(addDays(today, -3)) : null, parent_profile_id: null, child_id: null, student_profile_id: null, accounts_created_at: status === "accepted" ? iso(addDays(today, -2)) : null, payment_plan_intent: pick(["monthly", "termly", "annual"]), children_applying: 1, sibling_applicants: null, family_id: null, sibling_index: 0, guardian_is_other: false, guardian_name: null, guardian_relationship: null, guardian_email: null, guardian_phone: null, guardian_address: null, address_line1: `${20 + i} Sample Street`, address_line2: null, address_town: "Leicester", address_postcode: "LE1 1AA", address_country: "United Kingdom", british_national: true });
    add("admissions_stage_details", { application_id: app.id, assessment_platform: "Portal", assessment_link: null, assessment_duration_text: "About 90 minutes", assessment_invigilator: "Sarah Begum", assessment_started_at: null, assessment_finished_at: null, assessment_id_verified: i > 3, assessment_camera_on: true, assessment_irregularities: null, assessment_raw_score: i > 3 ? 54 + i : null, assessment_standard_score: i > 3 ? 98 + i : null, assessment_recommendation: i > 3 ? "Ready for the year group applied for" : null, assessment_results_path: null, assessment_emailed_at: null, interview_interviewer: i > 4 ? "Amina Rahman" : null, interview_link: null, interview_notes: i > 5 ? "Warm, curious and keen to start. Family understands the online day." : null, interview_outcome: i > 5 ? "positive" : null, interview_emailed_at: null, offer_start_date: "2027-01-04", offer_emailed_at: null, chosen_plan: null, application_fee_amount: 50, application_fee_received: i > 1, application_fee_received_at: null, annual_fee_override: null, first_payment_override: null, payment_token_hash: null, payment_token_created_at: null, created_at: app.created_at, updated_at: app.updated_at, account_class_ids: null, account_student_login: null });
    if (i < 6) add("admissions_messages", { id: next("amsg"), application_id: app.id, template: "received", subject: "We have received your application", body: "Thank you for applying to Tarbiyyah Global Academy. We will be in touch within five working days.", sent_by: USERS.office, sent_at: app.created_at, email_sent: true, email_error: null });
  });
  add("admissions_payment_proofs", { id: next("app-proof"), application_id: t.admissions_applications[7].id, submission_id: null, kind: "deposit", covers: "deposit", plan: "termly", amount_claimed: 300, family_note: "Paid by bank on Monday.", file_path: "proofs/demo.pdf", file_name: "receipt.pdf", content_type: "application/pdf", size_bytes: 48213, uploaded_at: iso(addDays(today, -3)), status: "pending", amount_verified: null, verified_by: null, verified_at: null, note: null });
  [
    ["received", "We have received your application", "Thank you for applying. We will contact you within five working days."],
    ["assessment", "Your child's entry assessment", "Please find the date and time of the entry assessment below."],
    ["offer", "An offer of a place", "We are delighted to offer your child a place at the academy."],
  ].forEach(([key, subject, body]) => add("admissions_email_templates", { key, subject, body, auto_send: key === "received", updated_at: created, updated_by: USERS.office }));
  add("open_evening_sessions", { id: next("oes"), title: "Online open evening", description: "Meet the Headteacher and teachers, and see a sample lesson.", starts_at: iso(at(addDays(today, 12), 18, 30)), ends_at: iso(at(addDays(today, 12), 19, 30)), capacity: 80, join_url: "https://teams.microsoft.com/l/meetup-join/demo", published: true, cancelled_at: null, created_by: USERS.office, created_at: iso(addDays(today, -10)), updated_at: iso(addDays(today, -10)) });
  for (let i = 0; i < 14; i++) add("open_evening_bookings", { id: next("oeb"), session_id: t.open_evening_sessions[0].id, parent_name: `${pick(mothers)} ${pick(surnames)}`, email: `family${i}@example.com`, phone: null, attendees: 1 + (i % 2), year_groups: [`Year ${7 + (i % 3)}`], questions: i % 4 === 0 ? "How long is the school day?" : null, status: "confirmed", ip_hash: null, created_at: iso(addDays(today, -i)), cancelled_at: null, confirmation_sent_at: iso(addDays(today, -i)), reminder_sent_at: null, manage_token_hash: null, notified_starts_at: null });
  for (let i = 0; i < 6; i++) add("bookings", { id: next("booking"), meeting_type: i % 2 ? "admissions_call" : "consultation", staff_id: t.staff_members[1].id, starts_at: iso(at(addDays(today, i - 2), 11 + i)), ends_at: iso(at(addDays(today, i - 2), 11 + i, 20)), status: i === 0 ? "completed" : "confirmed", contact_name: `${pick(fathers)} ${pick(surnames)}`, contact_email: `enquiry${i}@example.com`, contact_phone: null, parent_profile_id: null, student_id: null, notes: "Interested in Year 8 for January.", teams_join_url: null, manage_token_hash: null, created_at: iso(addDays(today, -7)), reminder_24h_sent_at: null, reminder_1h_sent_at: null, contact_timezone: "Europe/London" });
  add("meeting_types", { key: "admissions_call", duration_min: 20, buffer_min: 10, min_notice_hours: 24, max_days_ahead: 30, public: true });
  add("meeting_types", { key: "consultation", duration_min: 30, buffer_min: 10, min_notice_hours: 24, max_days_ahead: 30, public: true });

  // ── recruitment ─────────────────────────────────────────────────────────
  const vacancy = add("job_vacancies", { id: next("vac"), slug: "teacher-of-science", title: "Teacher of Science (KS3 and GCSE)", department: "Science", summary: "Teach Science live online to small classes.", description: "We are looking for a qualified teacher of Science to join our growing online school.", responsibilities: ["Plan and teach live lessons", "Mark work in the portal"], requirements: ["QTS or equivalent", "Enhanced DBS"], desirable: ["Experience of online teaching"], contract_type: "Part time", hours_text: "0.6 FTE", salary_text: "MPS/UPS pro rata", location_text: "Remote (UK)", start_text: "January 2027", closing_date: dateKey(addDays(today, 18)), status: "open", sort_order: 1, created_by: USERS.head, created_at: iso(addDays(today, -12)), updated_at: iso(addDays(today, -12)) });
  add("job_vacancies", { id: next("vac"), slug: "teaching-assistant", title: "Online Teaching Assistant", department: "Learning support", summary: "Support pupils in live lessons.", description: "Support pupils with SEND in live online lessons.", responsibilities: [], requirements: [], desirable: [], contract_type: "Part time", hours_text: "15 hours a week", salary_text: "Grade 3", location_text: "Remote (UK)", start_text: "January 2027", closing_date: dateKey(addDays(today, -2)), status: "closed", sort_order: 2, created_by: USERS.head, created_at: iso(addDays(today, -40)), updated_at: iso(addDays(today, -2)) });
  ["new", "reviewing", "shortlisted", "interview", "offered", "unsuccessful"].forEach((status, i) => {
    const [first, last] = [["Hamid", "Rashid"], ["Nusaybah", "Karim"], ["Daniel", "Hughes"], ["Sumaya", "Ismail"], ["Adeel", "Butt"], ["Grace", "Owen"]][i];
    const ja = add("job_applications", { id: next("ja"), reference: `TGA-J-${310 + i}`, vacancy_id: vacancy.id, vacancy_title: vacancy.title, status, status_changed_at: iso(addDays(today, -i)), title: null, first_name: first, last_name: last, preferred_name: null, email: `${first.toLowerCase()}@example.com`, phone: "+44 7700 900777", country: "United Kingdom", town: pick(["Leeds", "Cardiff", "Glasgow", "Bristol"]), right_to_work: "yes", teacher_status: "QTS", highest_qualification: "PGCE", qualifications: "BSc Biology, PGCE Secondary Science", islamic_qualifications: i % 2 ? "Ijazah in Hafs" : null, subjects: ["Science"], year_groups: ["Year 7", "Year 8", "Year 9"], languages: ["English"], years_experience: 3 + i, online_experience: i % 2 === 0, employment: [], employment_gaps: null, hours_preference: "Part time", available_days: ["Mon", "Tue", "Wed"], earliest_start: "January 2027", notice_period: "Half a term", has_equipment: true, statement: "I am passionate about making Science accessible and enjoyable.", why_tga: "I want to teach in a school that nurtures character and faith.", referees: [], dbs_status: "Enhanced, on the update service", how_heard: "TES", declaration_name: `${first} ${last}`, declaration_true: true, consent_data: true, cv_path: null, cv_filename: null, documents: [], ai_score: null, ai_recommendation: null, ai_screening: null, ai_screened_at: null, rating: i < 4 ? 3 + (i % 2) : null, interview_at: status === "interview" ? iso(at(addDays(today, 3), 15)) : null, ip_hash: null, created_at: iso(addDays(today, -10 + i)), updated_at: iso(addDays(today, -i)) });
    add("job_application_events", { id: next("jae"), application_id: ja.id, kind: "status", body: null, from_status: "new", to_status: status, created_by: USERS.head, created_at: ja.updated_at });
  });

  // ── policies and documents ──────────────────────────────────────────────
  [
    ["01", "Safeguarding and Child Protection Policy", "Safeguarding"],
    ["02", "Online Safety Policy", "Safeguarding"],
    ["06", "Behaviour Policy", "Pupils"],
    ["11", "Risk Assessment Policy", "Health and safety"],
    ["17", "Special Educational Needs and Disability Policy", "Pupils"],
    ["24", "Admissions Policy", "Admissions"],
    ["25", "Fees and Payments Policy", "Admissions"],
    ["26", "Complaints Policy", "Governance"],
  ].forEach(([number, title, category], i) => {
    const pl = add("policy_links", { id: next("pol"), number, title, category, parent_question_category: null, file_url: null, summary: `How the academy approaches ${title.replace(/ Policy$/, "").toLowerCase()}.`, last_reviewed: "2026-09-01", next_review: "2027-09-01", order_index: i + 1, created_at: created, deleted_at: null, deleted_by: null, updated_at: created, slug: title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, ""), file_path: null, file_name: null, file_kind: null, file_updated_at: null, extracted_text: null, visibility: "public", featured: i < 3, body_md: `## Purpose\n\nThis is a sample policy for the portal demo.\n\n## Who it applies to\n\nAll staff, pupils and families.\n\n## Review\n\nReviewed every year by the Headteacher.`, meta: null, body_updated_at: created });
    if (i < 3) {
      const doc = add("signable_documents", { id: next("sdoc"), sanity_document_id: null, title, target_roles: ["teacher", "admin", "head_teacher"], requires_signature: true, current_asset_id: "v1", synced_at: created, source: "policy", file_url: null, body: pl.body_md, policy_link_id: pl.id, file_path: null, file_name: null, original_path: null, original_name: null, auto_audience: true });
      for (const s of staff.slice(0, 5 + i)) add("document_signatures", { id: next("dsig"), document_id: doc.id, asset_id_signed: "v1", signer_id: s.id, typed_full_name: s.name, affirmed: true, signed_at: iso(addDays(today, -20 + i)), document_title_signed: title, content_hash: "demo", receipt_emailed_at: null, receipt_email_detail: null, method: "typed", recorded_by: null, recorded_by_name: null, recorded_at: null, evidence_path: null, record_note: null, signed_pdf_path: null, signed_pdf_at: null, signature_image_path: null, signature_image_sha256: null });
    }
  });
  const home = add("signable_documents", { id: next("sdoc"), sanity_document_id: null, title: "Home-school agreement", target_roles: ["parent"], requires_signature: true, current_asset_id: "v1", synced_at: created, source: "upload", file_url: null, body: "We agree to support the academy's expectations for attendance, behaviour and online safety.", policy_link_id: null, file_path: null, file_name: null, original_path: null, original_name: null, auto_audience: true });
  parents.slice(3).forEach((p) => add("document_signatures", { id: next("dsig"), document_id: home.id, asset_id_signed: "v1", signer_id: p.id, typed_full_name: p.name, affirmed: true, signed_at: iso(addDays(today, -15)), document_title_signed: "Home-school agreement", content_hash: "demo", receipt_emailed_at: null, receipt_email_detail: null, method: "typed", recorded_by: null, recorded_by_name: null, recorded_at: null, evidence_path: null, record_note: null, signed_pdf_path: null, signed_pdf_at: null, signature_image_path: null, signature_image_sha256: null }));

  // ── settings and the rest ───────────────────────────────────────────────
  for (const [key, enabled] of [["revision_packs", false], ["subject_lesson_editing", true], ["ai_helpers", true], ["house_points", true], ["guide_journeys", true], ["lesson_feedback", true], ["quizzes", false]] as const) add("school_features", { id: next("sf"), key, enabled, updated_by: null, updated_at: created });
  add("site_settings", { id: true, bursary_seats: 4, updated_at: created, launch_date: "2027-01-11", cta_primary_label: "Apply now", cta_primary_href: "/apply", application_fee: 50, registration_fee: 0, sibling_discount_percent: 10, sibling_discount_note: "From the second child", discounts: [], booking_widget_url: null, open_evening_recording_url: null, portal_url: null, admissions_email: "admissions@demo-school.example", contact_phone: "01632 960123", contact_address: null, opening_hours: "Monday to Friday, 8.30am to 4pm", safeguarding_lead_name: "Amina Rahman", safeguarding_lead_contact: "safeguarding@demo-school.example", complaints_last_year: 0, registration_body: null, registration_number: null, regulatory_status_note: null, headteacher_welcome_quote: null, headteacher_name: "Amina Rahman", accepting_applications: true, admissions_deposit_amount: 300, fee_terms: null, fee_instalments: null, annual_discount_percent: 5, payment_schedule_text: null, payment_instructions: null, assessment_join_url: null, interview_join_url: null, assessment_duration_text: "About 90 minutes", policies_intro: null, policies_accessible_formats_note: null, sample_lesson_video_url: null, sample_lesson_note: null, online_payment_url: null, payments_direct_debit_enabled: false });
  // Website pages (edited in the portal): sample wording, clearly a demo.
  add("homepage_content", { id: true, hero_kicker: "Online Islamic school", hero_heading: "Wherever home is", hero_body: "Live lessons with qualified teachers, taught with tarbiyyah. (Demo wording.)", pillars: [], how_it_works_heading: "How it works", how_it_works_steps: [], stages_heading: "Year 7 to Year 9", stages_body: "Sample text for the demo.", fee_teaser_heading: "Fees", fee_teaser_body: "See the fees page.", safe_heading: "Safe online", safe_body: "Sample text for the demo.", updated_at: created });
  add("about_content", { id: true, hero_heading: "About the academy", hero_body: "Sample text for the demo.", mission_body: "Sample mission text.", safeguarding_body: "Sample safeguarding text.", recipe_intro: "The Tarbiyyah Compass", recipe_items: [], family_heading: "A school family", family_body: "Sample text.", updated_at: created });
  add("curriculum_content", { id: true, hero_heading: "Our curriculum", hero_body: "Sample text for the demo.", updated_at: created });
  add("recruitment_settings", { id: true, notify_email: "jobs@demo-school.example", attach_cv: true, auto_acknowledge: true, auto_screen: false, screening_criteria: "QTS, online teaching experience", updated_at: created });
  ["How long is the school day?", "Which devices do pupils need?", "How are lessons recorded?"].forEach((q, i) => add("faq_entries", { id: next("faq"), question: q, answer: "Sample answer for the demo.", category: "General", order_index: i + 1, created_at: created }));
  add("digest_settings", { id: uid("ds", 1), include_attendance: true, include_homework: true, include_merits: true, include_comments: true, include_star: true, include_next_week: true, intro: "Here is your child's week at the academy.", updated_by: USERS.head, updated_at: created });
  [
    ["attendance", "Registers and attendance records", 72],
    ["behaviour", "Merits, concerns and detentions", 36],
    ["messages", "Messages between families and staff", 24],
    ["recordings", "Lesson recordings", 1],
  ].forEach(([category, label, months], i) => add("retention_rules", { id: uid("rr", i + 1), category, label, description: `How long ${String(label).toLowerCase()} are kept.`, retention_months: months, action: "delete", allowed_actions: ["delete", "anonymise"], basis_note: "School records retention guidance", enabled: true, last_run_at: iso(addDays(today, -1)), last_run_count: 0, updated_by: USERS.head, updated_at: created }));
  add("feedback_tickets", { id: next("fbt"), number: 41, submitted_by: USERS.t1, submitter_roles: ["teacher"], kind: "idea", title: "Bigger initials in the register on phones", details: "It would help to see initials bigger on phones.", page_path: "/teach/register", activity: [], environment: {}, attachments: [], status: "new", priority: "normal", response: null, responded_by: null, responded_at: null, resolved_at: null, created_at: iso(addDays(today, -2)), updated_at: iso(addDays(today, -2)) });
  add("feedback_tickets", { id: next("fbt"), number: 40, submitted_by: demoParent.id, submitter_roles: ["parent"], kind: "problem", title: "Couldn't find last week's homework", details: "Found it under Classwork in the end.", page_path: "/family/homework", activity: [], environment: {}, attachments: [], status: "done", priority: "low", response: "Thanks for letting us know; we've made Homework easier to find.", responded_by: USERS.head, responded_at: iso(addDays(today, -5)), resolved_at: iso(addDays(today, -5)), created_at: iso(addDays(today, -6)), updated_at: iso(addDays(today, -5)) });
  add("withdrawal_notices", { id: next("wd"), child_id: pupils[39]?.id || pupils[pupils.length - 1].id, parent_user_id: (pupils[39] || pupils[pupils.length - 1]).parentId, last_day: dateKey(addDays(today, 40)), reason: "Moving abroad for work", destination: "school_abroad", new_school_name: "International school (to be confirmed)", new_school_address: null, new_school_country: "Qatar", home_education_reason: null, forwarding_address: null, second_parent_name: null, second_parent_email: null, signed_name: "Parent", notice_acknowledged: true, status: "received", received_on: dateKey(addDays(today, -3)), eligible_to_leave_on: dateKey(addDays(today, 40)), fees_outstanding: false, last_invoice_on: null, office_notes: null, handled_by: null, created_at: iso(addDays(today, -3)), updated_at: iso(addDays(today, -3)) });
  add("data_rights_requests", { id: next("drr"), request_type: "access", requester_name: "A parent", requester_email: "parent@example.com", subject_profile_id: null, subject_description: "Copy of their child's attendance records", status: "in_progress", received_at: iso(addDays(today, -6)), statutory_deadline: dateKey(addDays(today, 24)), extended_deadline: null, extension_reason: null, completed_at: null, actioned_by: USERS.head, notes: null, created_at: iso(addDays(today, -6)), updated_at: iso(addDays(today, -6)) });
  for (let i = 0; i < 12; i++) add("audit_log", { id: next("audit"), actor_id: pick([USERS.head, USERS.office, USERS.t1]), actor_email: null, action: pick(["update", "insert"]), target_table: pick(["children", "attendance_records", "fee_charges", "school_features"]), target_id: null, changes: {}, created_at: iso(new Date(now.getTime() - i * 3600000 * 5)) });
  add("virtual_sessions", { id: uid("vs", 1), name: "Main Teams room", meeting_url: "https://teams.microsoft.com/l/meetup-join/demo", capacity: 30, is_test: false, created_at: created });

  const parentWho = parents[0];
  return {
    tables: t,
    who: {
      head_teacher: { userId: USERS.head, name: "Amina Rahman", email: "head@demo-school.example", childIds: [] },
      teacher: { userId: USERS.t1, name: "Yusuf Ali", email: "y.ali@demo-school.example", childIds: [] },
      admin: { userId: USERS.office, name: "Sarah Begum", email: "office@demo-school.example", childIds: [] },
      parent: { userId: parentWho.id, name: parentWho.name, email: parentWho.email, childIds: parentWho.children },
      student: { userId: pupilProfile(aisha.id), name: aisha.name, email: `aisha.malik@pupils.demo-school.example`, childIds: [aisha.id] },
    },
  };
}
