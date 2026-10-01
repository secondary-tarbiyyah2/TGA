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
  application_fee: 100,
  registration_fee: 150,
  // Termly/monthly fees are derived from annual_fee in the app (src/lib/fees.ts).
  fee_terms: 2,
  fee_instalments: 7,
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
  { id: deterministicId("fb1"), year_group_range: "Reception – Year 2", order_index: 1, annual_fee: 1596 },
  { id: deterministicId("fb2"), year_group_range: "Year 3 – Year 6", order_index: 2, annual_fee: 2130 },
  { id: deterministicId("fb3"), year_group_range: "Year 7 – Year 9", order_index: 3, annual_fee: 2796 },
  { id: deterministicId("fb4"), year_group_range: "Year 10 – Year 11", order_index: 4, annual_fee: 3000, notes: "GCSE exam entry fees are billed separately by the exam centre." },
]);

// ── faq_entries ──────────────────────────────────────────────────────────
await upsertAll("faq_entries", [
  { id: deterministicId("f1"), category: "Admissions", order_index: 1, question: "How do I apply for a place?", answer: "Start by registering your interest, then complete the multi-step application form on the Admissions page. We'll confirm receipt, arrange an entry assessment where relevant, and follow up with next steps." },
  { id: deterministicId("f2"), category: "Admissions", order_index: 2, question: "Is there an entry assessment?", answer: "Yes — a short, age-appropriate assessment helps us understand where your child is and how best to support them from day one. Details are shared once your application is received." },
  { id: deterministicId("f3"), category: "Fees", order_index: 1, question: "What does the application fee cover?", answer: "The {{applicationFee}} application fee is non-refundable and covers the baseline assessment and administrative review. It is separate from the one-time {{registrationFee}} registration fee, which is payable on acceptance of a place and no later than 19 December 2026." },
  { id: deterministicId("f4"), category: "Fees", order_index: 2, question: "Can I pay fees monthly?", answer: "Yes. Fees are for the shortened January–July 2027 period. You can pay annually (with a {{annualDiscount}} discount if paid in full by 19 December 2026), termly ({{terms}} payments) or monthly ({{instalments}} payments) for every year group band. The instalments always add up exactly to the annual fee — see the Fees page for the full table and payment dates." },
  { id: deterministicId("f5"), category: "Curriculum", order_index: 1, question: "Is this the full British curriculum?", answer: "Yes, taught live by qualified UK teachers, alongside a dedicated Islamic Studies programme, through to GCSE at Year 10–11." },
  { id: deterministicId("f6"), category: "Technology", order_index: 1, question: "What equipment does my child need?", answer: "A reliable internet connection and a laptop or tablet with a camera and microphone. Full technical requirements are confirmed ahead of the January 2027 launch." },
  { id: deterministicId("f7"), category: "Islamic Studies", order_index: 1, question: "How is Qur'an memorisation (hifz) taught?", answer: "Hifz sits alongside academic subjects as a first-class part of the timetable, with progress tracked just as academic subjects are." },
  { id: deterministicId("f8"), category: "SEND", order_index: 1, question: "Do you support children with additional needs?", answer: "We aim to support a range of additional needs within our online setting. Please tell us about your child's needs during the application so we can discuss what's possible together." },
  { id: deterministicId("f9"), category: "Admissions", order_index: 3, question: "What year groups do you accept?", answer: "We accept children from Reception through to Year 11 — Early Years and Key Stage 1 through to GCSE (Key Stage 4)." },
  { id: deterministicId("f10"), category: "Admissions", order_index: 4, question: "When does Tarbiyyah Global Academy launch, and can I apply now?", answer: "Live lessons launch in January 2027. Applications are open now — you can register your interest or start the full application at any time before then." },
  { id: deterministicId("f11"), category: "Admissions", order_index: 5, question: "What's the difference between registering interest and applying?", answer: "Registering interest is a short, no-obligation form so we can keep you updated as places open. Applying is the full multi-step application, including your child's year group, and starts the formal admissions process." },
  { id: deterministicId("f12"), category: "Admissions", order_index: 6, question: "What happens after I submit my application?", answer: "We confirm receipt, arrange an entry assessment where relevant, and follow up with next steps. Places are offered subject to assessment and availability, and confirmed once the one-time registration fee is paid." },
  { id: deterministicId("f13"), category: "Admissions", order_index: 7, question: "Can my family apply from outside the UK?", answer: "Yes. Tarbiyyah Global Academy is an online school for families anywhere in the world, bringing the same ethos and standard of care as our established UK schools to wherever home is." },
  { id: deterministicId("f14"), category: "Fees", order_index: 3, question: "What does the published fee include, and what's billed separately?", answer: "The published fee covers tuition for the relevant year group band. GCSE exam entry fees (Year 10–11) are billed separately by the exam centre and are not included in tuition fees." },
  { id: deterministicId("f15"), category: "Fees", order_index: 4, question: "Are fees inclusive of VAT?", answer: "Yes — every figure on our Fees page is inclusive of 20% VAT, so there's nothing extra added on top of the published price." },
  { id: deterministicId("f16"), category: "Fees", order_index: 5, question: "What happens if I need to withdraw, or a payment is missed?", answer: "Our Fees Policy, published on the Policies page, sets out payment terms, refunds and what happens if a payment is missed — please read it before enrolling." },
  { id: deterministicId("f17"), category: "Fees", order_index: 6, question: "How do I actually pay fees?", answer: "Fees can be paid by bank transfer or card. Full payment instructions are shared once a place is offered." },
  { id: deterministicId("f18"), category: "Curriculum", order_index: 2, question: "What year groups and key stages do you cover?", answer: "Reception and Key Stage 1 (Reception–Year 2), Key Stage 2 (Year 3–6), Key Stage 3 (Year 7–9), and Key Stage 4/GCSE (Year 10–11) — see our Curriculum page for the full subject list and a sample week at each stage." },
  { id: deterministicId("f19"), category: "Curriculum", order_index: 3, question: "Do you teach GCSEs?", answer: "Yes. Year 10–11 follow live, GCSE-specification lessons across core and options subjects. GCSE exam entry fees are billed separately by the exam centre." },
  { id: deterministicId("f20"), category: "Curriculum", order_index: 4, question: "What does a typical school week look like?", answer: "A live-timetabled mix of academic subjects, Islamic Studies, Qur'an and Arabic, with independent work and PE/wellbeing time built in — see the sample week on each key stage's curriculum page." },
  { id: deterministicId("f21"), category: "Technology", order_index: 2, question: "Can we choose our timetable?", answer: "Yes. Choose a Standard Monday–Friday timetable, mirroring a traditional school week, or an Intensive Monday–Thursday timetable with independent Friday set aside for catch-up, Qur'an practice or family time." },
  { id: deterministicId("f22"), category: "Technology", order_index: 3, question: "Will my child be in front of a screen all day?", answer: "No. Lessons are structured with regular breaks, offline and hands-on activities, and independent work that doesn't require a device, so learning stays healthy and sustainable." },
  { id: deterministicId("f23"), category: "Technology", order_index: 4, question: "Will there be a separate parent/student portal to log into?", answer: "Lessons, homework, attendance and reports will live in our own Learning Platform, built directly into this website — no separate system to set up. This is being finalised ahead of the January 2027 launch." },
  { id: deterministicId("f24"), category: "Islamic Studies", order_index: 2, question: "Is Qur'an memorisation (hifz) part of the curriculum at every stage?", answer: "Yes — Qur'an & Hifz appears as a subject on the timetable at every key stage, from Reception through to GCSE, alongside academic subjects." },
  { id: deterministicId("f25"), category: "Islamic Studies", order_index: 3, question: "Is Arabic taught, and is it compulsory?", answer: "Yes, Arabic is taught as a timetabled subject at every key stage, from Reception through to Year 11." },
  { id: deterministicId("f26"), category: "Islamic Studies", order_index: 4, question: "How does Islamic Studies fit alongside the British curriculum?", answer: "Islamic Studies, Qur'an and Arabic are taught on the timetable at every key stage, alongside the full British curriculum through to GCSE — not as an after-school extra." },
  { id: deterministicId("f27"), category: "SEND", order_index: 2, question: "Do you have a SEND policy?", answer: "Yes — our SEND and Inclusion Policy is published in full on the Policies page, alongside our Equality, Diversity and Accessibility Policy." },
  { id: deterministicId("f28"), category: "SEND", order_index: 3, question: "Can I discuss my child's needs before applying?", answer: "Yes — contact us any time before or during your application to talk through what support might look like for your child." },
  { id: deterministicId("f29"), category: "SEND", order_index: 4, question: "What should I include in my application about my child's needs?", answer: "Please tell us about your child's needs in the application's notes section (or get in touch beforehand) so we can discuss what's possible together ahead of any entry assessment." },
]);

// ── site_term_dates ──────────────────────────────────────────────────────
await upsertAll("site_term_dates", [
  { id: deterministicId("t1"), label: "Applications open", kind: "Admissions deadline", date: "2026-09-01", confirmed: false },
  { id: deterministicId("t2"), label: "Spring Term begins (launch)", kind: "Term date", date: "2027-01-06", confirmed: false },
]);

// ── testimonials ─────────────────────────────────────────────────────────
await upsertAll("testimonials", [
  { id: deterministicId("ts1"), role: "Parent", is_placeholder: true, order_index: 1, quote: "Placeholder quote — real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { id: deterministicId("ts2"), role: "Student", is_placeholder: true, order_index: 2, quote: "Placeholder quote — real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
]);

// ── team_profiles ────────────────────────────────────────────────────────
await upsertAll("team_profiles", [
  { id: deterministicId("sm1"), is_placeholder: true, order_index: 1, name: "Hardeep Sandhar", role_title: "Headteacher", qualifications: "Full bio to follow." },
  { id: deterministicId("sm2"), is_placeholder: true, order_index: 2, name: "Teacher name TBC", role_title: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
]);

// ── differentiators ──────────────────────────────────────────────────────
await upsertAll("differentiators", [
  { id: deterministicId("d2"), order_index: 2, visible: true, icon: "quran", status: "Draft / concept — not yet confirmed", title: "Hifz as a first-class subject", summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects — not an after-school extra.", detail: "Hifz sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club." },
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
  { id: deterministicId("p06"), number: "06", order_index: 2, category: "required", parent_question_category: "safety", title: "Anti-Bullying and Cyberbullying Policy", file_url: "/policies/06-anti-bullying-and-cyberbullying.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p07"), number: "07", order_index: 3, category: "required", parent_question_category: "safety", title: "Behaviour and Online Conduct Policy", file_url: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p12"), number: "12", order_index: 4, category: "required", parent_question_category: "curriculum", title: "Curriculum Policy", file_url: "/policies/12-curriculum.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p16"), number: "16", order_index: 5, category: "required", parent_question_category: "curriculum", title: "SEND and Inclusion Policy", file_url: "/policies/16-send-and-inclusion.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p17"), number: "17", order_index: 6, category: "required", parent_question_category: "curriculum", title: "Relationships, Sex and Health Education (RSHE) Policy", file_url: "/policies/17-rshe.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p19"), number: "19", order_index: 7, category: "required", parent_question_category: "curriculum", title: "Careers Education and Guidance Policy", file_url: "/policies/19-careers.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p25"), number: "25", order_index: 8, category: "required", parent_question_category: "admissions-fees", title: "Admissions Policy", file_url: "/policies/25-admissions.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p26"), number: "26", order_index: 9, category: "required", parent_question_category: "admissions-fees", title: "Fees Policy", file_url: "/policies/26-fees.pdf", summary: "Terms should be read before enrolling.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p27"), number: "27", order_index: 10, category: "required", parent_question_category: "complaints", title: "Concerns and Complaints Policy", file_url: "/policies/27-concerns-and-complaints.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p29"), number: "29", order_index: 11, category: "required", parent_question_category: "data", title: "Data Protection Policy", file_url: "/policies/29-data-protection.pdf", summary: "See also our short Privacy Notice.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p30"), number: "30", order_index: 12, category: "required", parent_question_category: "curriculum", title: "Equality, Diversity and Accessibility Policy", file_url: "/policies/30-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan.", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p10"), number: "10", order_index: 13, category: "published", parent_question_category: "safety", title: "Health, Safety and Wellbeing Policy", file_url: "/policies/10-health-safety-and-wellbeing.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
  { id: deterministicId("p09"), number: "09", order_index: 14, category: "published", parent_question_category: "safety", title: "Supporting Pupils with Medical Conditions Policy", file_url: "/policies/09-supporting-pupils-with-medical-conditions.pdf", last_reviewed: ISSUED, next_review: NEXT_REVIEW },
]);

// curriculum_documents: seed.ts's array is deliberately empty (no real
// scheme-of-work documents produced yet) -- nothing to seed.

console.log("Done.");
