/**
 * Fallback content, used whenever Sanity isn't configured yet (see src/lib/sanity/env.ts).
 * Shapes mirror the Sanity schemas 1:1 so swapping in real CMS data is a no-op for pages.
 * Figures/copy marked isPlaceholder or "Draft / concept" are not confirmed — see task brief.
 */

import { withDerivedFees, FEE_DEFAULTS, FEE_POLICY_DEFAULTS, type FeeSchedule } from "@/lib/fees";

/** Only `annualFee` is a stored/edited number. `termlyFee`, `monthlyFee` and
 * `schedule` are DERIVED (src/lib/fees.ts) from the annual fee plus the
 * site-wide terms / instalments settings; any stored termly/monthly value on
 * an old row is ignored. They stay on the type for back-compat with older
 * consumers (LMS fee dialog, book-a-call "from" price). */
export type FeeBand = {
  _id: string;
  yearGroupRange: string;
  order: number;
  annualFee: number;
  /** Derived: regular per-term amount. Never stored independently. */
  termlyFee: number;
  /** Derived: regular per-month amount. Never stored independently. */
  monthlyFee: number;
  /** Derived full schedule (all instalments, sums exactly to annualFee). */
  schedule?: FeeSchedule;
  notes?: string;
};

// Annual fees are the owner's published figures. Termly / monthly amounts are
// derived from them (see src/lib/fees.ts) using the site-wide number of terms
// and monthly instalments (defaults: 2 terms, 7 instalments - Fees Policy, Jan-Jul 2027, editable in
// /learn/admin/content -> Fees) so the instalments always add up exactly.
const seedFeeBandsAnnual: { _id: string; yearGroupRange: string; order: number; annualFee: number; notes?: string }[] = [
  { _id: "fb1", yearGroupRange: "Reception – Year 2", order: 1, annualFee: 1596 },
  { _id: "fb2", yearGroupRange: "Year 3 – Year 6", order: 2, annualFee: 2130 },
  { _id: "fb3", yearGroupRange: "Year 7 – Year 9", order: 3, annualFee: 2796 },
  { _id: "fb4", yearGroupRange: "Year 10 – Year 11", order: 4, annualFee: 3000, notes: "GCSE exam entry fees are billed separately by the exam centre." },
];
export const feeBands: FeeBand[] = seedFeeBandsAnnual.map((b) => withDerivedFees(b, FEE_DEFAULTS));

// Fields left empty/undefined here are deliberately NOT invented — every page
// reading them must hide the corresponding section rather than show a blank
// or fabricated value. Only figures the school has actually confirmed are
// filled in (and only as a build-time fallback for when Sanity is
// unreachable — the live values always come from Sanity once configured).
export type Discount = {
  label: string;
  type: "percent" | "fixedAmount";
  percent?: number;
  fixedAmount?: number;
  note?: string;
  appliesAutomatically?: boolean;
  eligibilityDescription?: string;
};

export type SiteSettings = {
  launchDate?: string;
  ctaPrimaryLabel?: string;
  ctaPrimaryHref?: string;
  applicationFee?: number;
  registrationFee?: number;
  /** Optional default deposit amount (admissions_deposit_amount). */
  depositAmount?: number;
  /** Number of terms the annual fee is split across (default 2). */
  feeTerms?: number;
  /** Number of monthly instalments the annual fee is split across (default 7). */
  feeInstalments?: number;
  /** % off the annual total when paid in full by the due date (default 2). */
  annualDiscountPercent?: number;
  /** Editable payment dates copy shown on the Fees page. */
  paymentScheduleText?: string;
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  // General-purpose discount catalogue for the fee estimator, beyond the
  // legacy sibling-discount fields above. Empty until the school confirms
  // a real discount to add — see ground rule 2, never invent an entry here.
  discounts?: Discount[];
  bookingWidgetUrl?: string;
  openEveningRecordingUrl?: string;
  portalUrl?: string;
  admissionsEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  openingHours?: string;
  safeguardingLeadName?: string;
  safeguardingLeadContact?: string;
  complaintsLastYear?: number;
  registrationBody?: string;
  registrationNumber?: string;
  regulatoryStatusNote?: string;
  headteacherWelcomeQuote?: string;
  headteacherName?: string;
};

export const siteSettings: SiteSettings = {
  ctaPrimaryLabel: "Apply Now",
  ctaPrimaryHref: "/admissions",
  applicationFee: FEE_POLICY_DEFAULTS.applicationFee,
  registrationFee: FEE_POLICY_DEFAULTS.registrationFee,
  feeTerms: FEE_DEFAULTS.terms,
  feeInstalments: FEE_DEFAULTS.instalments,
  annualDiscountPercent: FEE_POLICY_DEFAULTS.annualDiscountPercent,
  paymentScheduleText: FEE_POLICY_DEFAULTS.paymentScheduleText,
  admissionsEmail: "globalacademy@tarbiyyah.co.uk",
  complaintsLastYear: 0,
  discounts: [],
};

// Editable-page-section content: every field here is optional and mirrors
// what's already hardcoded on the corresponding page. A page reads
// `content.someField || "the existing default copy"` — so leaving Studio
// blank changes nothing, and an admin can override any field without a
// code change or redeploy waiting on anything but the next scheduled/
// webhook-triggered rebuild.
export type HomepageContent = {
  heroKicker?: string;
  heroHeading?: string;
  heroBody?: string;
  pillars?: { title: string; body: string }[];
  howItWorksHeading?: string;
  howItWorksSteps?: { title: string; body: string }[];
  stagesHeading?: string;
  stagesBody?: string;
  feeTeaserHeading?: string;
  feeTeaserBody?: string;
  safeHeading?: string;
  safeBody?: string;
};

export const homepageContent: HomepageContent = {};

export type AboutContent = {
  heroHeading?: string;
  heroBody?: string;
  missionBody?: string;
  safeguardingBody?: string;
  recipeIntro?: string;
  recipeItems?: { letter: string; word: string; body: string }[];
  familyHeading?: string;
  familyBody?: string;
};

export const aboutContent: AboutContent = {};

export type CurriculumContent = {
  heroHeading?: string;
  heroBody?: string;
};

export const curriculumContent: CurriculumContent = {};

export type FaqEntry = { _id: string; question: string; answer: string; category: string; order?: number };

export const faqEntries: FaqEntry[] = [
  { _id: "f1", category: "Admissions", order: 1, question: "How do I apply for a place?", answer: "Start by registering your interest, then complete the multi-step application form on the Admissions page. We'll confirm receipt, arrange an entry assessment where relevant, and follow up with next steps." },
  { _id: "f2", category: "Admissions", order: 2, question: "Is there an entry assessment?", answer: "Yes — a short, age-appropriate assessment helps us understand where your child is and how best to support them from day one. Details are shared once your application is received." },
  { _id: "f3", category: "Fees", order: 1, question: "What does the application fee cover?", answer: "The {{applicationFee}} application fee is non-refundable and covers the baseline assessment and administrative review. It is separate from the one-time {{registrationFee}} registration fee, which is payable on acceptance of a place and no later than 19 December 2026." },
  { _id: "f4", category: "Fees", order: 2, question: "Can I pay fees monthly?", answer: "Yes. Fees are for the shortened January–July 2027 period. You can pay annually (with a {{annualDiscount}} discount if paid in full by 19 December 2026), termly ({{terms}} payments) or monthly ({{instalments}} payments) for every year group band. The instalments always add up exactly to the annual fee — see the Fees page for the full table and payment dates." },
  { _id: "f5", category: "Curriculum", order: 1, question: "Is this the full British curriculum?", answer: "Yes, taught live by qualified UK teachers, alongside a dedicated Islamic Studies programme, through to GCSE at Year 10–11." },
  { _id: "f6", category: "Technology", order: 1, question: "What equipment does my child need?", answer: "A reliable internet connection and a laptop or tablet with a camera and microphone. Full technical requirements are confirmed ahead of the January 2027 launch." },
  { _id: "f7", category: "Islamic Studies", order: 1, question: "How is Qur'an memorisation (hifz) taught?", answer: "Hifz sits alongside academic subjects as a first-class part of the timetable, with progress tracked just as academic subjects are." },
  { _id: "f8", category: "SEND", order: 1, question: "Do you support children with additional needs?", answer: "We aim to support a range of additional needs within our online setting. Please tell us about your child's needs during the application so we can discuss what's possible together." },

  { _id: "f9", category: "Admissions", order: 3, question: "What year groups do you accept?", answer: "We accept children from Reception through to Year 11 — Early Years and Key Stage 1 through to GCSE (Key Stage 4)." },
  { _id: "f10", category: "Admissions", order: 4, question: "When does Tarbiyyah Global Academy launch, and can I apply now?", answer: "Live lessons launch in January 2027. Applications are open now — you can register your interest or start the full application at any time before then." },
  { _id: "f11", category: "Admissions", order: 5, question: "What's the difference between registering interest and applying?", answer: "Registering interest is a short, no-obligation form so we can keep you updated as places open. Applying is the full multi-step application, including your child's year group, and starts the formal admissions process." },
  { _id: "f12", category: "Admissions", order: 6, question: "What happens after I submit my application?", answer: "We confirm receipt, arrange an entry assessment where relevant, and follow up with next steps. Places are offered subject to assessment and availability, and confirmed once the one-time registration fee is paid." },
  { _id: "f13", category: "Admissions", order: 7, question: "Can my family apply from outside the UK?", answer: "Yes. Tarbiyyah Global Academy is an online school for families anywhere in the world, bringing the same ethos and standard of care as our established UK schools to wherever home is." },

  { _id: "f14", category: "Fees", order: 3, question: "What does the published fee include, and what's billed separately?", answer: "The published fee covers tuition for the relevant year group band. GCSE exam entry fees (Year 10–11) are billed separately by the exam centre and are not included in tuition fees." },
  { _id: "f15", category: "Fees", order: 4, question: "Are fees inclusive of VAT?", answer: "Yes — every figure on our Fees page is inclusive of 20% VAT, so there's nothing extra added on top of the published price." },
  { _id: "f16", category: "Fees", order: 5, question: "What happens if I need to withdraw, or a payment is missed?", answer: "Our Fees Policy, published on the Policies page, sets out payment terms, refunds and what happens if a payment is missed — please read it before enrolling." },
  { _id: "f17", category: "Fees", order: 6, question: "How do I actually pay fees?", answer: "Fees can be paid by bank transfer or card. Full payment instructions are shared once a place is offered." },

  { _id: "f18", category: "Curriculum", order: 2, question: "What year groups and key stages do you cover?", answer: "Reception and Key Stage 1 (Reception–Year 2), Key Stage 2 (Year 3–6), Key Stage 3 (Year 7–9), and Key Stage 4/GCSE (Year 10–11) — see our Curriculum page for the full subject list and a sample week at each stage." },
  { _id: "f19", category: "Curriculum", order: 3, question: "Do you teach GCSEs?", answer: "Yes. Year 10–11 follow live, GCSE-specification lessons across core and options subjects. GCSE exam entry fees are billed separately by the exam centre." },
  { _id: "f20", category: "Curriculum", order: 4, question: "What does a typical school week look like?", answer: "A live-timetabled mix of academic subjects, Islamic Studies, Qur'an and Arabic, with independent work and PE/wellbeing time built in — see the sample week on each key stage's curriculum page." },

  { _id: "f21", category: "Technology", order: 2, question: "Can we choose our timetable?", answer: "Yes. Choose a Standard Monday–Friday timetable, mirroring a traditional school week, or an Intensive Monday–Thursday timetable with independent Friday set aside for catch-up, Qur'an practice or family time." },
  { _id: "f22", category: "Technology", order: 3, question: "Will my child be in front of a screen all day?", answer: "No. Lessons are structured with regular breaks, offline and hands-on activities, and independent work that doesn't require a device, so learning stays healthy and sustainable." },
  { _id: "f23", category: "Technology", order: 4, question: "Will there be a separate parent/student portal to log into?", answer: "Lessons, homework, attendance and reports will live in our own Learning Platform, built directly into this website — no separate system to set up. This is being finalised ahead of the January 2027 launch." },

  { _id: "f24", category: "Islamic Studies", order: 2, question: "Is Qur'an memorisation (hifz) part of the curriculum at every stage?", answer: "Yes — Qur'an & Hifz appears as a subject on the timetable at every key stage, from Reception through to GCSE, alongside academic subjects." },
  { _id: "f25", category: "Islamic Studies", order: 3, question: "Is Arabic taught, and is it compulsory?", answer: "Yes, Arabic is taught as a timetabled subject at every key stage, from Reception through to Year 11." },
  { _id: "f26", category: "Islamic Studies", order: 4, question: "How does Islamic Studies fit alongside the British curriculum?", answer: "Islamic Studies, Qur'an and Arabic are taught on the timetable at every key stage, alongside the full British curriculum through to GCSE — not as an after-school extra." },

  { _id: "f27", category: "SEND", order: 2, question: "Do you have a SEND policy?", answer: "Yes — our SEND and Inclusion Policy is published in full on the Policies page, alongside our Equality, Diversity and Accessibility Policy." },
  { _id: "f28", category: "SEND", order: 3, question: "Can I discuss my child's needs before applying?", answer: "Yes — contact us any time before or during your application to talk through what support might look like for your child." },
  { _id: "f29", category: "SEND", order: 4, question: "What should I include in my application about my child's needs?", answer: "Please tell us about your child's needs in the application's notes section (or get in touch beforehand) so we can discuss what's possible together ahead of any entry assessment." },
];

export const faqCategories = ["Admissions", "Fees", "Curriculum", "Technology", "Islamic Studies", "SEND"] as const;

export type TermDate = { _id: string; label: string; kind: string; date: string; endDate?: string; notes?: string; confirmed?: boolean };

// No confirmed term dates / admissions calendar exist yet for the Jan 2027
// launch. confirmed: false means the Term Dates page hides these entirely
// rather than showing unconfirmed dates as if real — see ground rule 3/4.
export const termDates: TermDate[] = [
  { _id: "t1", label: "Applications open", kind: "Admissions deadline", date: "2026-09-01", confirmed: false },
  { _id: "t2", label: "Spring Term begins (launch)", kind: "Term date", date: "2027-01-06", confirmed: false },
];

export type Testimonial = { _id: string; quote: string; attribution: string; role: "Parent" | "Student"; isPlaceholder: boolean; order?: number };

export const testimonials: Testimonial[] = [
  { _id: "ts1", role: "Parent", isPlaceholder: true, order: 1, quote: "Placeholder quote — real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { _id: "ts2", role: "Student", isPlaceholder: true, order: 2, quote: "Placeholder quote — real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
];

export type StaffMember = { _id: string; name: string; roleTitle: string; qualifications?: string; introVideoUrl?: string; isPlaceholder: boolean; order?: number };

export const staffMembers: StaffMember[] = [
  { _id: "sm1", isPlaceholder: true, order: 1, name: "Hardeep Sandhar", roleTitle: "Headteacher", qualifications: "Full bio to follow." },
  { _id: "sm2", isPlaceholder: true, order: 2, name: "Teacher name TBC", roleTitle: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
];

export type Differentiator = {
  _id: string;
  title: string;
  summary: string;
  detail?: string;
  icon?: string;
  status: "Confirmed commitment" | "Draft / concept — not yet confirmed";
  visible: boolean;
  order?: number;
};

export const differentiators: Differentiator[] = [
  {
    _id: "d2", order: 2, visible: true, icon: "quran",
    status: "Draft / concept — not yet confirmed",
    title: "Hifz as a first-class subject",
    summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects — not an after-school extra.",
    detail: "Hifz sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club.",
  },
  {
    _id: "d3", order: 3, visible: true, icon: "family",
    status: "Draft / concept — not yet confirmed",
    title: "Big Sibling mentorship",
    summary: "Peer mentors from Tarbiyyah Primary and Secondary support Academy pupils, connecting the whole Tarbiyyah family.",
  },
  {
    _id: "d5", order: 5, visible: true, icon: "users",
    status: "Confirmed commitment",
    title: "Meet the Teachers",
    summary: "Every teacher is public on our website — qualifications and a short intro video, before you ever apply.",
  },
  {
    _id: "d6", order: 6, visible: true, icon: "note",
    status: "Confirmed commitment",
    title: "Weekly Tarbiyah Note",
    summary: "A personal weekly update on your child's character and akhlaq from their form tutor — separate from academic reports.",
  },
  {
    _id: "d7", order: 7, visible: true, icon: "portfolio",
    status: "Draft / concept — not yet confirmed",
    title: "Student portfolio",
    summary: "Recitation recordings, projects and artwork collected across the year into one growing portfolio.",
  },
  {
    _id: "d8", order: 8, visible: true, icon: "calendar",
    status: "Draft / concept — not yet confirmed",
    title: "Bookable teacher office hours",
    summary: "1:1 time with your child's teacher, booked directly — no waiting for parents' evening.",
  },
  {
    _id: "d9", order: 9, visible: true, icon: "heart",
    status: "Confirmed commitment",
    title: "Transparent bursary seats",
    // The real count is set by an admin (public.site_settings.bursary_seats,
    // migration 0020) and substituted into this summary on the homepage —
    // see BursarySeatsSummary. This fallback text is only ever shown if
    // that live value can't be reached, so it names no number.
    summary: "A tracked number of bursary/scholarship seats each year, published openly rather than handled quietly on request.",
  },
];

export type ParentQuestionCategory = "safety" | "admissions-fees" | "complaints" | "data" | "curriculum";

export type PolicyLink = {
  _id: string;
  number: string;
  title: string;
  category: "required" | "published";
  parentQuestionCategory?: ParentQuestionCategory;
  fileUrl: string;
  summary?: string;
  lastReviewed?: string;
  nextReview?: string;
  order?: number;
};

// Every policy here was issued September 2026 for the 2026–27 academic year,
// with a next review due August 2027 — the standard cycle stated on each
// document itself (see e.g. the Concerns and Complaints Policy).
const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";

// parentQuestionCategory groups the Policies page by what a parent is
// actually trying to find out, rather than by DfE required/published
// category (that split is kept too — see `category` — just shown as a badge
// now instead of as the section headings). This grouping is an editorial/UX
// call, not a new fact: every document keeps its existing DfE category,
// number and file — only how they're grouped on the page changes.
export const policyLinks: PolicyLink[] = [
  { _id: "p01", number: "01", order: 1, category: "required", parentQuestionCategory: "safety", title: "Child Protection and Safeguarding Policy", fileUrl: "/policies/01-child-protection-and-safeguarding.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p06", number: "06", order: 2, category: "required", parentQuestionCategory: "safety", title: "Anti-Bullying and Cyberbullying Policy", fileUrl: "/policies/06-anti-bullying-and-cyberbullying.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p07", number: "07", order: 3, category: "required", parentQuestionCategory: "safety", title: "Behaviour and Online Conduct Policy", fileUrl: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p12", number: "12", order: 4, category: "required", parentQuestionCategory: "curriculum", title: "Curriculum Policy", fileUrl: "/policies/12-curriculum.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p16", number: "16", order: 5, category: "required", parentQuestionCategory: "curriculum", title: "SEND and Inclusion Policy", fileUrl: "/policies/16-send-and-inclusion.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p17", number: "17", order: 6, category: "required", parentQuestionCategory: "curriculum", title: "Relationships, Sex and Health Education (RSHE) Policy", fileUrl: "/policies/17-rshe.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p19", number: "19", order: 7, category: "required", parentQuestionCategory: "curriculum", title: "Careers Education and Guidance Policy", fileUrl: "/policies/19-careers.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p25", number: "25", order: 8, category: "required", parentQuestionCategory: "admissions-fees", title: "Admissions Policy", fileUrl: "/policies/25-admissions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p26", number: "26", order: 9, category: "required", parentQuestionCategory: "admissions-fees", title: "Fees Policy", fileUrl: "/policies/26-fees.pdf", summary: "Terms should be read before enrolling.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p27", number: "27", order: 10, category: "required", parentQuestionCategory: "complaints", title: "Concerns and Complaints Policy", fileUrl: "/policies/27-concerns-and-complaints.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p29", number: "29", order: 11, category: "required", parentQuestionCategory: "data", title: "Data Protection Policy", fileUrl: "/policies/29-data-protection.pdf", summary: "See also our short Privacy Notice.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p30", number: "30", order: 12, category: "required", parentQuestionCategory: "curriculum", title: "Equality, Diversity and Accessibility Policy", fileUrl: "/policies/30-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p10", number: "10", order: 13, category: "published", parentQuestionCategory: "safety", title: "Health, Safety and Wellbeing Policy", fileUrl: "/policies/10-health-safety-and-wellbeing.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p09", number: "09", order: 14, category: "published", parentQuestionCategory: "safety", title: "Supporting Pupils with Medical Conditions Policy", fileUrl: "/policies/09-supporting-pupils-with-medical-conditions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
];

export type CurriculumDocument = {
  _id: string;
  keyStage: string;
  subject: string;
  title: string;
  term?: "autumn" | "spring" | "summer";
  fileUrl: string;
  order?: number;
};

// No real curriculum overview/scheme-of-work documents have been produced
// yet — deliberately empty rather than invented, so the section on each
// /curriculum/[stage] page stays hidden until an admin uploads a real one.
export const curriculumDocuments: CurriculumDocument[] = [];
