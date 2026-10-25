// One-time seed: pushes the real content already bundled as build-time
// fallback (src/content/seed.ts) into the new Supabase tables added in
// 0025_website_content.sql, so the /learn/admin/content editor opens with
// real rows instead of empty tables. Every value below is copied verbatim
// from src/content/seed.ts -- the site's actual current content (it's been
// running on this fallback data the whole time Sanity Studio was
// unreachable) -- not retyped or invented.
//
// Safe to re-run: every write is an upsert keyed on a deterministic id
// (the same "seed-<original _id>" convention scripts/seed-sanity.mjs
// used), so running this twice overwrites with the same data rather than
// duplicating rows. Once real admin edits exist in these tables, re-running
// this would overwrite them back to the original seed values -- it's meant
// for the initial cutover only.
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run via:
//   node scripts/seed-website-content.mjs
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Deterministic UUIDs derived from the original seed _id strings, so
// re-running this script upserts the same rows rather than duplicating —
// plain randomUUID() would break that on a second run. Not cryptographic,
// just needs to be stable and UUID-shaped: a SHA-256 of the seed string
// gives 64 hex chars, plenty for the 32 a UUID needs.
function deterministicId(seed) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function upsertAll(table, rows) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`Seeded ${rows.length} row(s) into ${table}.`);
}

// ── site_settings (singleton, id already fixed = true) ─────────────────
const { error: settingsErr } = await supabase.from("site_settings").update({
  cta_primary_label: "Apply Now",
  cta_primary_href: "/admissions",
  // Prospectus 2026-27 (v5) / Fees Policy: £50 application, £250 registration,
  // 2 termly or 8 monthly payments (4 Dec 2026, then 28 Dec 2026 to 28 Jun 2027).
  application_fee: 50,
  registration_fee: 250,
  // Termly/monthly fees are derived from annual_fee in the app (src/lib/fees.ts).
  fee_terms: 2,
  fee_instalments: 8,
  annual_discount_percent: 2,
  admissions_email: "globalacademy@tarbiyyah.co.uk",
  complaints_last_year: 0,
  discounts: [],
}).eq("id", true);
if (settingsErr) throw new Error(`site_settings: ${settingsErr.message}`);
console.log("Updated site_settings.");

// homepage_content / about_content / curriculum_content: the seed defaults
// are all-empty ({}) -- every field falls back to hardcoded page copy, so
// there is nothing to seed beyond the row insert() already done in the
// migration.

// ── fee_bands ────────────────────────────────────────────────────────────
await upsertAll("fee_bands", [
  // Founding-cohort tuition, December 2026 to July 2027 (Prospectus v5 p.18).
  { id: deterministicId("fb1"), year_group_range: "Year 1 – Year 2", order_index: 1, annual_fee: 1710 },
  { id: deterministicId("fb2"), year_group_range: "Year 3 – Year 6", order_index: 2, annual_fee: 2282 },
  { id: deterministicId("fb3"), year_group_range: "Year 7 – Year 9", order_index: 3, annual_fee: 2996 },
  { id: deterministicId("fb4"), year_group_range: "Year 10 – Year 11", order_index: 4, annual_fee: 3214, notes: "Exam entry fees are not included: families pay the exam centre directly." },
]);

// ── faq_entries ──────────────────────────────────────────────────────────
// Not seeded here any more: the FAQs are maintained in the database
// (migrations 0113_faq_revamp.sql and 0135_cross_source_alignment.sql, then
// /learn/admin/content). The original 2025 list (Reception, January 2027
// launch, £100/£550 fees) is out of date and must not be pushed back.

// ── site_term_dates ──────────────────────────────────────────────────────
// Not seeded here any more: the confirmed 2026-27 dates come from the
// prospectus via migration 0106_prospectus_open_evenings_calendar.sql.

// ── testimonials ─────────────────────────────────────────────────────────
await upsertAll("testimonials", [
  { id: deterministicId("ts1"), role: "Parent", is_placeholder: true, order_index: 1, quote: "Placeholder quote — real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { id: deterministicId("ts2"), role: "Student", is_placeholder: true, order_index: 2, quote: "Placeholder quote — real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
]);

// ── team_profiles ────────────────────────────────────────────────────────
await upsertAll("team_profiles", [
  { id: deterministicId("sm1"), is_placeholder: true, order_index: 1, name: "Ustadh Abu Zayn Haneef Sandhar", role_title: "Headteacher", qualifications: "Full bio to follow." },
  { id: deterministicId("sm2"), is_placeholder: true, order_index: 2, name: "Teacher name TBC", role_title: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
]);

// ── differentiators ──────────────────────────────────────────────────────
await upsertAll("differentiators", [
  { id: deterministicId("d2"), order_index: 2, visible: true, icon: "quran", status: "Draft / concept — not yet confirmed", title: "Hifdh as a first-class subject", summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects — not an after-school extra.", detail: "Hifdh sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club." },
  { id: deterministicId("d3"), order_index: 3, visible: true, icon: "family", status: "Draft / concept — not yet confirmed", title: "Big Sibling mentorship", summary: "Peer mentors from Tarbiyyah Primary and Secondary support Academy pupils, connecting the whole Tarbiyyah family." },
  { id: deterministicId("d5"), order_index: 5, visible: true, icon: "users", status: "Confirmed commitment", title: "Meet the Teachers", summary: "Every teacher is public on our website — qualifications and a short intro video, before you ever apply." },
  { id: deterministicId("d6"), order_index: 6, visible: true, icon: "note", status: "Confirmed commitment", title: "Weekly Tarbiyah Note", summary: "A personal weekly update on your child's character and akhlaq from their form tutor — separate from academic reports." },
  { id: deterministicId("d7"), order_index: 7, visible: true, icon: "portfolio", status: "Draft / concept — not yet confirmed", title: "Student portfolio", summary: "Recitation recordings, projects and artwork collected across the year into one growing portfolio." },
  { id: deterministicId("d8"), order_index: 8, visible: true, icon: "calendar", status: "Draft / concept — not yet confirmed", title: "Bookable teacher office hours", summary: "1:1 time with your child's teacher, booked directly — no waiting for parents' evening." },
  { id: deterministicId("d9"), order_index: 9, visible: true, icon: "heart", status: "Confirmed commitment", title: "Transparent bursary seats", summary: "A tracked number of bursary/scholarship seats each year, published openly rather than handled quietly on request." },
]);

// ── policy_links ─────────────────────────────────────────────────────────
const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";
await upsertAll("policy_links", [
  { id: deterministicId("p01"), number: "01", order_index: 1, category: "required", parent_question_category: "safety", title: "Child Protection and Safeguarding Policy", file_url: "/policies/01-child-protection-and-safeguarding.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-02-online-safety-and-acceptable-use"), number: "02", order_index: 2, category: "published", parent_question_category: "safety", title: "Online Safety and Acceptable Use Policy", file_url: "/policies/02-online-safety-and-acceptable-use.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-03-live-lesson-protocols"), number: "03", order_index: 3, category: "published", parent_question_category: "safety", title: "Live Lesson Protocols", file_url: "/policies/03-live-lesson-protocols.pdf", summary: "How live online lessons are run safely, calmly and well.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-04-recording-of-live-lessons-and-use-of-images"), number: "04", order_index: 4, category: "published", parent_question_category: "data", title: "Recording of Live Lessons and Use of Images Policy", file_url: "/policies/04-recording-of-live-lessons-and-use-of-images.pdf", summary: "When lessons are recorded, who can see them and how long they are kept.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-05-no-platform-for-extremism-prevent"), number: "05", order_index: 5, category: "published", parent_question_category: "safety", title: "No Platform for Extremism (Prevent) Policy", file_url: "/policies/05-no-platform-for-extremism-prevent.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p06"), number: "06", order_index: 6, category: "required", parent_question_category: "safety", title: "Anti-Bullying and Cyberbullying Policy", file_url: "/policies/06-anti-bullying-and-cyberbullying.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p07"), number: "07", order_index: 7, category: "required", parent_question_category: "safety", title: "Behaviour and Online Conduct Policy", file_url: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-08-attendance-punctuality-and-children-missing-education"), number: "08", order_index: 8, category: "published", parent_question_category: "safety", title: "Attendance, Punctuality and Children Missing Education Policy", file_url: "/policies/08-attendance-punctuality-and-children-missing-education.pdf", summary: "Includes what happens if a child stops attending.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p09"), number: "09", order_index: 9, category: "required", parent_question_category: "safety", title: "Supporting Pupils with Medical Conditions Policy", file_url: "/policies/09-supporting-pupils-with-medical-conditions.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p10"), number: "10", order_index: 10, category: "required", parent_question_category: "safety", title: "Health, Safety and Wellbeing Policy", file_url: "/policies/10-health-safety-and-wellbeing.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p12"), number: "12", order_index: 11, category: "required", parent_question_category: "curriculum", title: "Curriculum Policy", file_url: "/policies/12-curriculum.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-13-assessment"), number: "13", order_index: 12, category: "published", parent_question_category: "curriculum", title: "Assessment Policy", file_url: "/policies/13-assessment.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-14-marking-and-feedback"), number: "14", order_index: 13, category: "published", parent_question_category: "curriculum", title: "Marking and Feedback Policy", file_url: "/policies/14-marking-and-feedback.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-15-homework-and-independent-study"), number: "15", order_index: 14, category: "published", parent_question_category: "curriculum", title: "Homework and Independent Study Policy", file_url: "/policies/15-homework-and-independent-study.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p16"), number: "16", order_index: 15, category: "required", parent_question_category: "curriculum", title: "SEND and Inclusion Policy", file_url: "/policies/16-send-and-inclusion.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p17"), number: "17", order_index: 16, category: "required", parent_question_category: "curriculum", title: "Relationships, Sex and Health Education (RSHE) Policy", file_url: "/policies/17-relationships-sex-and-health-education.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p19"), number: "18", order_index: 17, category: "required", parent_question_category: "curriculum", title: "Careers Education and Guidance Policy", file_url: "/policies/18-careers-education-and-guidance.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-19-examinations-and-private-candidates"), number: "19", order_index: 18, category: "published", parent_question_category: "curriculum", title: "Examinations and Private Candidates Policy", file_url: "/policies/19-examinations-and-private-candidates.pdf", summary: "How International GCSE entries work for an online school.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-20-academic-integrity-and-secure-assessment"), number: "20", order_index: 19, category: "published", parent_question_category: "curriculum", title: "Academic Integrity and Secure Assessment Policy", file_url: "/policies/20-academic-integrity-and-secure-assessment.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-21-flexible-learning"), number: "21", order_index: 20, category: "published", parent_question_category: "curriculum", title: "Flexible Learning Policy", file_url: "/policies/21-flexible-learning.pdf", summary: "Timetable options for families across time zones and circumstances.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-22-enrichment-and-clubs"), number: "22", order_index: 21, category: "published", parent_question_category: "curriculum", title: "Enrichment and Clubs Policy", file_url: "/policies/22-enrichment-and-clubs.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-23-recipe-character-framework"), number: "23", order_index: 22, category: "published", parent_question_category: "curriculum", title: "RECIPE Character Framework", file_url: "/policies/23-recipe-character-framework.pdf", summary: "How our values are taught, lived and recognised every day.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p25"), number: "24", order_index: 23, category: "required", parent_question_category: "admissions-fees", title: "Admissions Policy", file_url: "/policies/24-admissions.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p26"), number: "25", order_index: 24, category: "required", parent_question_category: "admissions-fees", title: "Fees Policy", file_url: "/policies/25-fees.pdf", summary: "Terms should be read before enrolling.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p27"), number: "26", order_index: 25, category: "required", parent_question_category: "complaints", title: "Concerns and Complaints Policy", file_url: "/policies/26-concerns-and-complaints.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("policy-27-parent-communication-charter"), number: "27", order_index: 26, category: "published", parent_question_category: "complaints", title: "Parent Communication Charter", file_url: "/policies/27-parent-communication-charter.pdf", summary: "How and when we keep in touch, and how quickly we reply.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p29"), number: "28", order_index: 27, category: "required", parent_question_category: "data", title: "Data Protection Policy", file_url: "/policies/28-data-protection.pdf", summary: "See also our short Privacy Notice.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p30"), number: "29", order_index: 28, category: "required", parent_question_category: "curriculum", title: "Equality, Diversity and Accessibility Policy", file_url: "/policies/29-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
]);

// curriculum_documents: seed.ts's array is deliberately empty (no real
// scheme-of-work documents produced yet) -- nothing to seed.

console.log("Done.");
