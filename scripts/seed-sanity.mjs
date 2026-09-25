// One-time seed: pushes the real content already bundled as build-time
// fallback (src/content/seed.ts) into the actual Sanity dataset, so the
// Studio opens with real documents instead of empty ones. Safe to re-run —
// every write is createOrReplace against a deterministic _id, so running
// this twice just overwrites with the same data rather than duplicating.
//
// Requires SANITY_API_TOKEN (an Editor-permission token) and
// NEXT_PUBLIC_SANITY_PROJECT_ID in the environment. Run via:
//   node scripts/seed-sanity.mjs
import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({ projectId, dataset, token, apiVersion: "2025-01-01", useCdn: false });

const feeBands = [
  { _id: "feeBand-fb1", _type: "feeBand", yearGroupRange: "Reception – Year 2", order: 1, annualFee: 1596, termlyFee: 798, monthlyFee: 342.14 },
  { _id: "feeBand-fb2", _type: "feeBand", yearGroupRange: "Year 3 – Year 6", order: 2, annualFee: 2130, termlyFee: 1597.5, monthlyFee: 456.43 },
  { _id: "feeBand-fb3", _type: "feeBand", yearGroupRange: "Year 7 – Year 9", order: 3, annualFee: 2796, termlyFee: 2097.5, monthlyFee: 599.29 },
  { _id: "feeBand-fb4", _type: "feeBand", yearGroupRange: "Year 10 – Year 11", order: 4, annualFee: 3000, termlyFee: 2250, monthlyFee: 642.86, notes: "GCSE exam entry fees are billed separately by the exam centre." },
];

const siteSettings = {
  _id: "siteSettings",
  _type: "siteSettings",
  applicationFee: 247,
  registrationFee: 150,
  bookingWidgetUrl: "",
  openEveningRecordingUrl: "",
  portalUrl: "",
  admissionsEmail: "globalacademy@tarbiyyah.co.uk",
  complaintsLastYear: 0,
};

const faqEntries = [
  { _id: "faqEntry-f1", _type: "faqEntry", category: "Admissions", order: 1, question: "How do I apply for a place?", answer: "Start by registering your interest, then complete the multi-step application form on the Admissions page. We'll confirm receipt, arrange an entry assessment where relevant, and follow up with next steps." },
  { _id: "faqEntry-f2", _type: "faqEntry", category: "Admissions", order: 2, question: "Is there an entry assessment?", answer: "Yes — a short, age-appropriate assessment helps us understand where your child is and how best to support them from day one. Details are shared once your application is received." },
  { _id: "faqEntry-f3", _type: "faqEntry", category: "Fees", order: 1, question: "What does the application fee cover?", answer: "The £247 application fee is non-refundable and covers processing and assessment of your application. It is separate from the one-time £150 registration fee, which is charged once a place is offered and accepted." },
  { _id: "faqEntry-f4", _type: "faqEntry", category: "Fees", order: 2, question: "Can I pay fees monthly?", answer: "Yes. Annual, termly and monthly payment plans are available for every year group band — see the Fees page for the full table." },
  { _id: "faqEntry-f5", _type: "faqEntry", category: "Curriculum", order: 1, question: "Is this the full British curriculum?", answer: "Yes, taught live by qualified UK teachers, alongside a dedicated Islamic Studies programme, through to GCSE at Year 10–11." },
  { _id: "faqEntry-f6", _type: "faqEntry", category: "Technology", order: 1, question: "What equipment does my child need?", answer: "A reliable internet connection and a laptop or tablet with a camera and microphone. Full technical requirements are confirmed ahead of the January 2027 launch." },
  { _id: "faqEntry-f7", _type: "faqEntry", category: "Islamic Studies", order: 1, question: "How is Qur'an memorisation (hifz) taught?", answer: "Hifz sits alongside academic subjects as a first-class part of the timetable, with progress tracked just as academic subjects are." },
  { _id: "faqEntry-f8", _type: "faqEntry", category: "SEND", order: 1, question: "Do you support children with additional needs?", answer: "We aim to support a range of additional needs within our online setting. Please tell us about your child's needs during the application so we can discuss what's possible together." },
];

const termDates = [
  { _id: "termDate-t1", _type: "termDate", label: "Applications open", kind: "Admissions deadline", date: "2026-09-01", notes: "Placeholder date — to be confirmed." },
  { _id: "termDate-t2", _type: "termDate", label: "Spring Term begins (launch)", kind: "Term date", date: "2027-01-06", notes: "Placeholder date — to be confirmed." },
];

const testimonials = [
  { _id: "testimonial-ts1", _type: "testimonial", role: "Parent", isPlaceholder: true, order: 1, quote: "Placeholder quote — real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { _id: "testimonial-ts2", _type: "testimonial", role: "Student", isPlaceholder: true, order: 2, quote: "Placeholder quote — real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
];

const staffMembers = [
  { _id: "staffMember-sm1", _type: "staffMember", isPlaceholder: true, order: 1, name: "Hardeep Sandhar", roleTitle: "Headteacher", qualifications: "Full bio to follow." },
  { _id: "staffMember-sm2", _type: "staffMember", isPlaceholder: true, order: 2, name: "Teacher name TBC", roleTitle: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
];

const differentiators = [
  { _id: "differentiator-d1", _type: "differentiator", order: 1, visible: true, icon: "clock", status: "Draft / concept — not yet confirmed", title: "Two live-lesson time bands", summary: "A UK/Europe/West-Africa band and a Gulf/South-Asia band, so live lessons land at a sensible hour wherever home is.", detail: "Rather than a single UK-hours timetable, families choose the live-lesson band that suits their timezone — reflecting a genuinely global intake rather than a UK-only one." },
  { _id: "differentiator-d2", _type: "differentiator", order: 2, visible: true, icon: "quran", status: "Draft / concept — not yet confirmed", title: "Hifz as a first-class subject", summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects — not an after-school extra.", detail: "Hifz sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club." },
  { _id: "differentiator-d3", _type: "differentiator", order: 3, visible: true, icon: "family", status: "Draft / concept — not yet confirmed", title: "Big Sibling mentorship", summary: "Peer mentors from Tarbiyyah Primary and Secondary support Academy pupils, connecting the whole Tarbiyyah family." },
  { _id: "differentiator-d4", _type: "differentiator", order: 4, visible: true, icon: "map-pin", status: "Draft / concept — not yet confirmed", title: "Real-world touchpoints", summary: "Meetups, exam-sitting venues and events so an online school still means real friendships and real places." },
  { _id: "differentiator-d5", _type: "differentiator", order: 5, visible: true, icon: "users", status: "Confirmed commitment", title: "Meet the Teachers", summary: "Every teacher is public on our website — photo, qualifications and a short intro video, before you ever apply." },
  { _id: "differentiator-d6", _type: "differentiator", order: 6, visible: true, icon: "note", status: "Draft / concept — not yet confirmed", title: "Weekly Tarbiyah Note", summary: "A personal weekly update on your child's character and akhlaq from their form tutor — separate from academic reports." },
  { _id: "differentiator-d7", _type: "differentiator", order: 7, visible: true, icon: "portfolio", status: "Draft / concept — not yet confirmed", title: "Student portfolio", summary: "Recitation recordings, projects and artwork collected across the year into one growing portfolio." },
  { _id: "differentiator-d8", _type: "differentiator", order: 8, visible: true, icon: "calendar", status: "Draft / concept — not yet confirmed", title: "Bookable teacher office hours", summary: "1:1 time with your child's teacher, booked directly — no waiting for parents' evening." },
  { _id: "differentiator-d9", _type: "differentiator", order: 9, visible: true, icon: "heart", status: "Draft / concept — not yet confirmed", title: "Transparent bursary seats", summary: "A tracked number of bursary/scholarship seats each year, published openly rather than handled quietly on request." },
];

const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";
const policyLinks = [
  { _id: "policyLink-p01", number: "01", order: 1, category: "required", title: "Child Protection and Safeguarding Policy", fileUrl: "/policies/01-child-protection-and-safeguarding.pdf" },
  { _id: "policyLink-p06", number: "06", order: 2, category: "required", title: "Anti-Bullying and Cyberbullying Policy", fileUrl: "/policies/06-anti-bullying-and-cyberbullying.pdf" },
  { _id: "policyLink-p07", number: "07", order: 3, category: "required", title: "Behaviour and Online Conduct Policy", fileUrl: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions." },
  { _id: "policyLink-p12", number: "12", order: 4, category: "required", title: "Curriculum Policy", fileUrl: "/policies/12-curriculum.pdf" },
  { _id: "policyLink-p16", number: "16", order: 5, category: "required", title: "SEND and Inclusion Policy", fileUrl: "/policies/16-send-and-inclusion.pdf" },
  { _id: "policyLink-p17", number: "17", order: 6, category: "required", title: "Relationships, Sex and Health Education (RSHE) Policy", fileUrl: "/policies/17-rshe.pdf" },
  { _id: "policyLink-p19", number: "19", order: 7, category: "required", title: "Careers Education and Guidance Policy", fileUrl: "/policies/19-careers.pdf" },
  { _id: "policyLink-p25", number: "25", order: 8, category: "required", title: "Admissions Policy", fileUrl: "/policies/25-admissions.pdf" },
  { _id: "policyLink-p26", number: "26", order: 9, category: "required", title: "Fees Policy", fileUrl: "/policies/26-fees.pdf", summary: "Terms should be read before enrolling." },
  { _id: "policyLink-p27", number: "27", order: 10, category: "required", title: "Concerns and Complaints Policy", fileUrl: "/policies/27-concerns-and-complaints.pdf" },
  { _id: "policyLink-p29", number: "29", order: 11, category: "required", title: "Data Protection Policy", fileUrl: "/policies/29-data-protection.pdf", summary: "See also our short Privacy Notice." },
  { _id: "policyLink-p30", number: "30", order: 12, category: "required", title: "Equality, Diversity and Accessibility Policy", fileUrl: "/policies/30-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan." },
  { _id: "policyLink-p10", number: "10", order: 13, category: "published", title: "Health, Safety and Wellbeing Policy", fileUrl: "/policies/10-health-safety-and-wellbeing.pdf" },
  { _id: "policyLink-p09", number: "09", order: 14, category: "published", title: "Supporting Pupils with Medical Conditions Policy", fileUrl: "/policies/09-supporting-pupils-with-medical-conditions.pdf" },
].map((p) => ({ ...p, _type: "policyLink", lastReviewed: ISSUED, nextReview: NEXT_REVIEW }));

const allDocs = [siteSettings, ...feeBands, ...faqEntries, ...termDates, ...testimonials, ...staffMembers, ...differentiators, ...policyLinks];

const tx = client.transaction();
for (const doc of allDocs) tx.createOrReplace(doc);
const result = await tx.commit();
console.log(`Seeded ${allDocs.length} documents into ${projectId}/${dataset}.`);
console.log(`Transaction id: ${result.transactionId}`);
