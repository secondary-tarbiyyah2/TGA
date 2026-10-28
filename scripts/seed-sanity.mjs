// One-time seed: pushes the real content already bundled as build-time
// fallback (src/content/seed.ts) into the actual Sanity dataset, so the
// Studio opens with real documents instead of empty ones. Safe to re-run, 
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
  { _id: "feeBand-fb1", _type: "feeBand", yearGroupRange: "Reception – Year 2", order: 1, annualFee: 1596 },
  { _id: "feeBand-fb2", _type: "feeBand", yearGroupRange: "Year 3 – Year 6", order: 2, annualFee: 2130 },
  { _id: "feeBand-fb3", _type: "feeBand", yearGroupRange: "Year 7 – Year 9", order: 3, annualFee: 2796 },
  { _id: "feeBand-fb4", _type: "feeBand", yearGroupRange: "Year 10 – Year 11", order: 4, annualFee: 3000, notes: "GCSE exam entry fees are billed separately by the exam centre." },
];

const siteSettings = {
  _id: "siteSettings",
  _type: "siteSettings",
  applicationFee: 150,
  bookingWidgetUrl: "",
  openEveningRecordingUrl: "",
  portalUrl: "",
  admissionsEmail: "globalacademy@tarbiyyah.co.uk",
  complaintsLastYear: 0,
  discounts: [],
};

const faqEntries = [
  { _id: "faqEntry-f1", _type: "faqEntry", category: "Admissions", order: 1, question: "How do I apply for a place?", answer: "Start by registering your interest, then complete the multi-step application form on the Admissions page. We'll confirm receipt, arrange an entry assessment where relevant, and follow up with next steps." },
  { _id: "faqEntry-f2", _type: "faqEntry", category: "Admissions", order: 2, question: "Is there an entry assessment?", answer: "Yes, a short, age-appropriate assessment helps us understand where your child is and how best to support them from day one. Details are shared once your application is received." },
  { _id: "faqEntry-f3", _type: "faqEntry", category: "Fees", order: 1, question: "What does the application fee cover?", answer: "The {{applicationFee}} application fee is non-refundable and covers the baseline assessment and administrative review. There is no registration fee." },
  { _id: "faqEntry-f4", _type: "faqEntry", category: "Fees", order: 2, question: "Can I pay fees monthly?", answer: "Yes. Fees are for the shortened January–July 2027 period. You can pay annually (with a {{annualDiscount}} discount if paid in full by 19 December 2026), termly ({{terms}} payments) or monthly ({{instalments}} payments) for every year group band. The instalments always add up exactly to the annual fee, see the Fees page for the full table and payment dates." },
  { _id: "faqEntry-f5", _type: "faqEntry", category: "Curriculum", order: 1, question: "Is this the full British curriculum?", answer: "Yes, taught live by qualified UK teachers, alongside a dedicated Islamic Studies programme, through to GCSE at Year 10–11." },
  { _id: "faqEntry-f6", _type: "faqEntry", category: "Technology", order: 1, question: "What equipment does my child need?", answer: "A reliable internet connection and a laptop or tablet with a camera and microphone. Full technical requirements are confirmed ahead of the January 2027 launch." },
  { _id: "faqEntry-f7", _type: "faqEntry", category: "Islamic Studies", order: 1, question: "How is Qur'an memorisation (hifz) taught?", answer: "Hifz sits alongside academic subjects as a first-class part of the timetable, with progress tracked just as academic subjects are." },
  { _id: "faqEntry-f8", _type: "faqEntry", category: "SEND", order: 1, question: "Do you support children with additional needs?", answer: "We aim to support a range of additional needs within our online setting. Please tell us about your child's needs during the application so we can discuss what's possible together." },

  { _id: "faqEntry-f9", _type: "faqEntry", category: "Admissions", order: 3, question: "What year groups do you accept?", answer: "We accept children from Reception through to Year 11, Early Years and Key Stage 1 through to GCSE (Key Stage 4)." },
  { _id: "faqEntry-f10", _type: "faqEntry", category: "Admissions", order: 4, question: "When does Tarbiyyah Global Academy launch, and can I apply now?", answer: "Live lessons launch in January 2027. Applications are open now, you can register your interest or start the full application at any time before then." },
  { _id: "faqEntry-f11", _type: "faqEntry", category: "Admissions", order: 5, question: "What's the difference between registering interest and applying?", answer: "Registering interest is a short, no-obligation form so we can keep you updated as places open. Applying is the full multi-step application, including your child's year group, and starts the formal admissions process." },
  { _id: "faqEntry-f12", _type: "faqEntry", category: "Admissions", order: 6, question: "What happens after I submit my application?", answer: "We confirm receipt, arrange an entry assessment where relevant, and follow up with next steps. Places are offered subject to assessment and availability, and confirmed once you accept within five working days and pay your first fee payment." },
  { _id: "faqEntry-f13", _type: "faqEntry", category: "Admissions", order: 7, question: "Can my family apply from outside the UK?", answer: "Yes. Tarbiyyah Global Academy is an online school for families anywhere in the world, bringing the same ethos and standard of care as our established UK schools to wherever home is." },

  { _id: "faqEntry-f14", _type: "faqEntry", category: "Fees", order: 3, question: "What does the published fee include, and what's billed separately?", answer: "The published fee covers tuition for the relevant year group band. GCSE exam entry fees (Year 10–11) are billed separately by the exam centre and are not included in tuition fees." },
  { _id: "faqEntry-f15", _type: "faqEntry", category: "Fees", order: 4, question: "Are fees inclusive of VAT?", answer: "Yes, every figure on our Fees page is inclusive of 20% VAT, so there's nothing extra added on top of the published price." },
  { _id: "faqEntry-f16", _type: "faqEntry", category: "Fees", order: 5, question: "What happens if I need to withdraw, or a payment is missed?", answer: "Our Fees Policy, published on the Policies page, sets out payment terms, refunds and what happens if a payment is missed, please read it before enrolling." },
  { _id: "faqEntry-f17", _type: "faqEntry", category: "Fees", order: 6, question: "How do I actually pay fees?", answer: "Fees can be paid by bank transfer or card. Full payment instructions are shared once a place is offered." },

  { _id: "faqEntry-f18", _type: "faqEntry", category: "Curriculum", order: 2, question: "What year groups and key stages do you cover?", answer: "Reception and Key Stage 1 (Reception–Year 2), Key Stage 2 (Year 3–6), Key Stage 3 (Year 7–9), and Key Stage 4/GCSE (Year 10–11) · see our Curriculum page for the full subject list and a sample week at each stage." },
  { _id: "faqEntry-f19", _type: "faqEntry", category: "Curriculum", order: 3, question: "Do you teach GCSEs?", answer: "Yes. Year 10–11 follow live, GCSE-specification lessons across core and options subjects. GCSE exam entry fees are billed separately by the exam centre." },
  { _id: "faqEntry-f20", _type: "faqEntry", category: "Curriculum", order: 4, question: "What does a typical school week look like?", answer: "A live-timetabled mix of academic subjects, Islamic Studies, Qur'an and Arabic, with independent work and PE/wellbeing time built in, see the sample week on each key stage's curriculum page." },

  { _id: "faqEntry-f21", _type: "faqEntry", category: "Technology", order: 2, question: "Can we choose our timetable?", answer: "Yes. Choose a Standard Monday–Friday timetable, mirroring a traditional school week, or an Intensive Monday–Thursday timetable with independent Friday set aside for catch-up, Qur'an practice or family time." },
  { _id: "faqEntry-f22", _type: "faqEntry", category: "Technology", order: 3, question: "Will my child be in front of a screen all day?", answer: "No. Lessons are structured with regular breaks, offline and hands-on activities, and independent work that doesn't require a device, so learning stays healthy and sustainable." },
  { _id: "faqEntry-f23", _type: "faqEntry", category: "Technology", order: 4, question: "Will there be a separate parent/student portal to log into?", answer: "Lessons, homework, attendance and reports will live in our own Learning Platform, built directly into this website, no separate system to set up. This is being finalised ahead of the January 2027 launch." },

  { _id: "faqEntry-f24", _type: "faqEntry", category: "Islamic Studies", order: 2, question: "Is Qur'an memorisation (hifz) part of the curriculum at every stage?", answer: "Yes, Qur'an & Hifz appears as a subject on the timetable at every key stage, from Reception through to GCSE, alongside academic subjects." },
  { _id: "faqEntry-f25", _type: "faqEntry", category: "Islamic Studies", order: 3, question: "Is Arabic taught, and is it compulsory?", answer: "Yes, Arabic is taught as a timetabled subject at every key stage, from Reception through to Year 11." },
  { _id: "faqEntry-f26", _type: "faqEntry", category: "Islamic Studies", order: 4, question: "How does Islamic Studies fit alongside the British curriculum?", answer: "Islamic Studies, Qur'an and Arabic are taught on the timetable at every key stage, alongside the full British curriculum through to GCSE, not as an after-school extra." },

  { _id: "faqEntry-f27", _type: "faqEntry", category: "SEND", order: 2, question: "Do you have a SEND policy?", answer: "Yes, our SEND and Inclusion Policy is published in full on the Policies page, alongside our Equality, Diversity and Accessibility Policy." },
  { _id: "faqEntry-f28", _type: "faqEntry", category: "SEND", order: 3, question: "Can I discuss my child's needs before applying?", answer: "Yes, contact us any time before or during your application to talk through what support might look like for your child." },
  { _id: "faqEntry-f29", _type: "faqEntry", category: "SEND", order: 4, question: "What should I include in my application about my child's needs?", answer: "Please tell us about your child's needs in the application's notes section (or get in touch beforehand) so we can discuss what's possible together ahead of any entry assessment." },
];

const termDates = [
  { _id: "termDate-t1", _type: "termDate", label: "Applications open", kind: "Admissions deadline", date: "2026-09-01", confirmed: false },
  { _id: "termDate-t2", _type: "termDate", label: "Spring Term begins (launch)", kind: "Term date", date: "2027-01-06", confirmed: false },
];

const testimonials = [
  { _id: "testimonial-ts1", _type: "testimonial", role: "Parent", isPlaceholder: true, order: 1, quote: "Placeholder quote, real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { _id: "testimonial-ts2", _type: "testimonial", role: "Student", isPlaceholder: true, order: 2, quote: "Placeholder quote, real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
];

const staffMembers = [
  { _id: "staffMember-sm1", _type: "staffMember", isPlaceholder: true, order: 1, name: "Ustadh Abu Zayn Haneef Sandhar", roleTitle: "Headteacher", qualifications: "Full bio to follow." },
  { _id: "staffMember-sm2", _type: "staffMember", isPlaceholder: true, order: 2, name: "Teacher name TBC", roleTitle: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
];

const differentiators = [
  { _id: "differentiator-d1", _type: "differentiator", order: 1, visible: true, icon: "clock", status: "Draft / concept, not yet confirmed", title: "Two live-lesson time bands", summary: "A UK/Europe/West-Africa band and a Gulf/South-Asia band, so live lessons land at a sensible hour wherever home is.", detail: "Rather than a single UK-hours timetable, families choose the live-lesson band that suits their timezone, reflecting a genuinely global intake rather than a UK-only one." },
  { _id: "differentiator-d2", _type: "differentiator", order: 2, visible: true, icon: "quran", status: "Draft / concept, not yet confirmed", title: "Hifz as a first-class subject", summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects, not an after-school extra.", detail: "Hifz sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club." },
  { _id: "differentiator-d3", _type: "differentiator", order: 3, visible: true, icon: "family", status: "Draft / concept, not yet confirmed", title: "Big Sibling mentorship", summary: "Peer mentors from Tarbiyyah Primary and Secondary support Academy pupils, connecting the whole Tarbiyyah family." },
  { _id: "differentiator-d4", _type: "differentiator", order: 4, visible: true, icon: "map-pin", status: "Draft / concept, not yet confirmed", title: "Real-world touchpoints", summary: "Meetups, exam-sitting venues and events so an online school still means real friendships and real places." },
  { _id: "differentiator-d5", _type: "differentiator", order: 5, visible: true, icon: "users", status: "Confirmed commitment", title: "Meet the Teachers", summary: "Every teacher is public on our website, photo, qualifications and a short intro video, before you ever apply." },
  { _id: "differentiator-d6", _type: "differentiator", order: 6, visible: true, icon: "note", status: "Draft / concept, not yet confirmed", title: "Weekly Tarbiyah Note", summary: "A personal weekly update on your child's character and akhlaq from their form tutor, separate from academic reports." },
  { _id: "differentiator-d7", _type: "differentiator", order: 7, visible: true, icon: "portfolio", status: "Draft / concept, not yet confirmed", title: "Student portfolio", summary: "Recitation recordings, projects and artwork collected across the year into one growing portfolio." },
  { _id: "differentiator-d8", _type: "differentiator", order: 8, visible: true, icon: "calendar", status: "Draft / concept, not yet confirmed", title: "Bookable teacher office hours", summary: "1:1 time with your child's teacher, booked directly, no waiting for parents' evening." },
  { _id: "differentiator-d9", _type: "differentiator", order: 9, visible: true, icon: "heart", status: "Draft / concept, not yet confirmed", title: "Transparent bursary seats", summary: "A tracked number of bursary/scholarship seats each year, published openly rather than handled quietly on request." },
];

const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";
const policyLinks = [
  { _id: "policyLink-p01", number: "01", order: 1, category: "required", parentQuestionCategory: "safety", title: "Child Protection and Safeguarding Policy", fileUrl: "/policies/01-child-protection-and-safeguarding.pdf" },
  { _id: "policyLink-p06", number: "06", order: 2, category: "required", parentQuestionCategory: "safety", title: "Anti-Bullying and Cyberbullying Policy", fileUrl: "/policies/06-anti-bullying-and-cyberbullying.pdf" },
  { _id: "policyLink-p07", number: "07", order: 3, category: "required", parentQuestionCategory: "safety", title: "Behaviour and Online Conduct Policy", fileUrl: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions." },
  { _id: "policyLink-p12", number: "12", order: 4, category: "required", parentQuestionCategory: "curriculum", title: "Curriculum Policy", fileUrl: "/policies/12-curriculum.pdf" },
  { _id: "policyLink-p16", number: "16", order: 5, category: "required", parentQuestionCategory: "curriculum", title: "SEND and Inclusion Policy", fileUrl: "/policies/16-send-and-inclusion.pdf" },
  { _id: "policyLink-p17", number: "17", order: 6, category: "required", parentQuestionCategory: "curriculum", title: "Relationships, Sex and Health Education (RSHE) Policy", fileUrl: "/policies/17-rshe.pdf" },
  { _id: "policyLink-p19", number: "19", order: 7, category: "required", parentQuestionCategory: "curriculum", title: "Careers Education and Guidance Policy", fileUrl: "/policies/19-careers.pdf" },
  { _id: "policyLink-p25", number: "25", order: 8, category: "required", parentQuestionCategory: "admissions-fees", title: "Admissions Policy", fileUrl: "/policies/25-admissions.pdf" },
  { _id: "policyLink-p26", number: "26", order: 9, category: "required", parentQuestionCategory: "admissions-fees", title: "Fees Policy", fileUrl: "/policies/26-fees.pdf", summary: "Terms should be read before enrolling." },
  { _id: "policyLink-p27", number: "27", order: 10, category: "required", parentQuestionCategory: "complaints", title: "Concerns and Complaints Policy", fileUrl: "/policies/27-concerns-and-complaints.pdf" },
  { _id: "policyLink-p29", number: "29", order: 11, category: "required", parentQuestionCategory: "data", title: "Data Protection Policy", fileUrl: "/policies/29-data-protection.pdf", summary: "See also our short Privacy Notice." },
  { _id: "policyLink-p30", number: "30", order: 12, category: "required", parentQuestionCategory: "curriculum", title: "Equality, Diversity and Accessibility Policy", fileUrl: "/policies/30-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan." },
  { _id: "policyLink-p10", number: "10", order: 13, category: "published", parentQuestionCategory: "safety", title: "Health, Safety and Wellbeing Policy", fileUrl: "/policies/10-health-safety-and-wellbeing.pdf" },
  { _id: "policyLink-p09", number: "09", order: 14, category: "published", parentQuestionCategory: "safety", title: "Supporting Pupils with Medical Conditions Policy", fileUrl: "/policies/09-supporting-pupils-with-medical-conditions.pdf" },
].map((p) => ({ ...p, _type: "policyLink", lastReviewed: ISSUED, nextReview: NEXT_REVIEW }));

// Editable-page-section singletons, created empty so they appear in Studio
// ready to edit; every field left blank falls back to the page's existing
// bundled copy (see src/content/seed.ts), never a blank section.
const homepageContent = { _id: "homepageContent", _type: "homepageContent" };
const aboutContent = { _id: "aboutContent", _type: "aboutContent" };
const curriculumContent = { _id: "curriculumContent", _type: "curriculumContent" };

const allDocs = [
  siteSettings, ...feeBands, ...faqEntries, ...termDates, ...testimonials, ...staffMembers, ...differentiators, ...policyLinks,
  homepageContent, aboutContent, curriculumContent,
];

const tx = client.transaction();
for (const doc of allDocs) tx.createOrReplace(doc);
const result = await tx.commit();
console.log(`Seeded ${allDocs.length} documents into ${projectId}/${dataset}.`);
console.log(`Transaction id: ${result.transactionId}`);
