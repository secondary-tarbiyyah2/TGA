/**
 * Fallback content, used whenever Sanity isn't configured yet (see src/lib/sanity/env.ts).
 * Shapes mirror the Sanity schemas 1:1 so swapping in real CMS data is a no-op for pages.
 * Figures/copy marked isPlaceholder or "Draft / concept" are not confirmed — see task brief.
 */

export type FeeBand = {
  _id: string;
  yearGroupRange: string;
  order: number;
  annualFee: number;
  termlyFee: number;
  monthlyFee: number;
  notes?: string;
};

// Launch-cohort pricing: the first cohort starts January 2027, so this covers a
// shortened Jan–Jul 2027 period (two terms, not three) rather than a full school
// year. Figures as supplied by the school — not recalculated or inferred here.
export const feeBands: FeeBand[] = [
  { _id: "fb1", yearGroupRange: "Reception – Year 2", order: 1, annualFee: 1596, termlyFee: 798, monthlyFee: 342.14 },
  { _id: "fb2", yearGroupRange: "Year 3 – Year 6", order: 2, annualFee: 2130, termlyFee: 1597.5, monthlyFee: 456.43 },
  { _id: "fb3", yearGroupRange: "Year 7 – Year 9", order: 3, annualFee: 2796, termlyFee: 2097.5, monthlyFee: 599.29 },
  { _id: "fb4", yearGroupRange: "Year 10 – Year 11", order: 4, annualFee: 3000, termlyFee: 2250, monthlyFee: 642.86, notes: "GCSE exam entry fees are billed separately by the exam centre." },
];

// Fields left empty/undefined here are deliberately NOT invented — every page
// reading them must hide the corresponding section rather than show a blank
// or fabricated value. Only figures the school has actually confirmed are
// filled in (and only as a build-time fallback for when Sanity is
// unreachable — the live values always come from Sanity once configured).
export type SiteSettings = {
  launchDate?: string;
  ctaPrimaryLabel?: string;
  ctaPrimaryHref?: string;
  applicationFee?: number;
  registrationFee?: number;
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
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
  applicationFee: 247,
  registrationFee: 150,
  admissionsEmail: "globalacademy@tarbiyyah.co.uk",
  complaintsLastYear: 0,
};

export type FaqEntry = { _id: string; question: string; answer: string; category: string; order?: number };

export const faqEntries: FaqEntry[] = [
  { _id: "f1", category: "Admissions", order: 1, question: "How do I apply for a place?", answer: "Start by registering your interest, then complete the multi-step application form on the Admissions page. We'll confirm receipt, arrange an entry assessment where relevant, and follow up with next steps." },
  { _id: "f2", category: "Admissions", order: 2, question: "Is there an entry assessment?", answer: "Yes — a short, age-appropriate assessment helps us understand where your child is and how best to support them from day one. Details are shared once your application is received." },
  { _id: "f3", category: "Fees", order: 1, question: "What does the application fee cover?", answer: "The £247 application fee is non-refundable and covers processing and assessment of your application. It is separate from the one-time £150 registration fee, which is charged once a place is offered and accepted." },
  { _id: "f4", category: "Fees", order: 2, question: "Can I pay fees monthly?", answer: "Yes. Annual, termly and monthly payment plans are available for every year group band — see the Fees page for the full table." },
  { _id: "f5", category: "Curriculum", order: 1, question: "Is this the full British curriculum?", answer: "Yes, taught live by qualified UK teachers, alongside a dedicated Islamic Studies programme, through to GCSE at Year 10–11." },
  { _id: "f6", category: "Technology", order: 1, question: "What equipment does my child need?", answer: "A reliable internet connection and a laptop or tablet with a camera and microphone. Full technical requirements are confirmed ahead of the January 2027 launch." },
  { _id: "f7", category: "Islamic Studies", order: 1, question: "How is Qur'an memorisation (hifz) taught?", answer: "Hifz sits alongside academic subjects as a first-class part of the timetable, with progress tracked just as academic subjects are." },
  { _id: "f8", category: "SEND", order: 1, question: "Do you support children with additional needs?", answer: "We aim to support a range of additional needs within our online setting. Please tell us about your child's needs during the application so we can discuss what's possible together." },
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
    _id: "d1", order: 1, visible: true, icon: "clock",
    status: "Draft / concept — not yet confirmed",
    title: "Two live-lesson time bands",
    summary: "A UK/Europe/West-Africa band and a Gulf/South-Asia band, so live lessons land at a sensible hour wherever home is.",
    detail: "Rather than a single UK-hours timetable, families choose the live-lesson band that suits their timezone — reflecting a genuinely global intake rather than a UK-only one.",
  },
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
    _id: "d4", order: 4, visible: true, icon: "map-pin",
    status: "Draft / concept — not yet confirmed",
    title: "Real-world touchpoints",
    summary: "Meetups, exam-sitting venues and events so an online school still means real friendships and real places.",
  },
  {
    _id: "d5", order: 5, visible: true, icon: "users",
    status: "Confirmed commitment",
    title: "Meet the Teachers",
    summary: "Every teacher is public on our website — photo, qualifications and a short intro video, before you ever apply.",
  },
  {
    _id: "d6", order: 6, visible: true, icon: "note",
    status: "Draft / concept — not yet confirmed",
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
    status: "Draft / concept — not yet confirmed",
    title: "Transparent bursary seats",
    summary: "A tracked number of bursary/scholarship seats each year, published openly rather than handled quietly on request.",
  },
];

export type PolicyLink = {
  _id: string;
  number: string;
  title: string;
  category: "required" | "published";
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

export const policyLinks: PolicyLink[] = [
  { _id: "p01", number: "01", order: 1, category: "required", title: "Child Protection and Safeguarding Policy", fileUrl: "/policies/01-child-protection-and-safeguarding.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p06", number: "06", order: 2, category: "required", title: "Anti-Bullying and Cyberbullying Policy", fileUrl: "/policies/06-anti-bullying-and-cyberbullying.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p07", number: "07", order: 3, category: "required", title: "Behaviour and Online Conduct Policy", fileUrl: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p12", number: "12", order: 4, category: "required", title: "Curriculum Policy", fileUrl: "/policies/12-curriculum.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p16", number: "16", order: 5, category: "required", title: "SEND and Inclusion Policy", fileUrl: "/policies/16-send-and-inclusion.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p17", number: "17", order: 6, category: "required", title: "Relationships, Sex and Health Education (RSHE) Policy", fileUrl: "/policies/17-rshe.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p19", number: "19", order: 7, category: "required", title: "Careers Education and Guidance Policy", fileUrl: "/policies/19-careers.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p25", number: "25", order: 8, category: "required", title: "Admissions Policy", fileUrl: "/policies/25-admissions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p26", number: "26", order: 9, category: "required", title: "Fees Policy", fileUrl: "/policies/26-fees.pdf", summary: "Terms should be read before enrolling.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p27", number: "27", order: 10, category: "required", title: "Concerns and Complaints Policy", fileUrl: "/policies/27-concerns-and-complaints.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p29", number: "29", order: 11, category: "required", title: "Data Protection Policy", fileUrl: "/policies/29-data-protection.pdf", summary: "See also our short Privacy Notice.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p30", number: "30", order: 12, category: "required", title: "Equality, Diversity and Accessibility Policy", fileUrl: "/policies/30-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p10", number: "10", order: 13, category: "published", title: "Health, Safety and Wellbeing Policy", fileUrl: "/policies/10-health-safety-and-wellbeing.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p09", number: "09", order: 14, category: "published", title: "Supporting Pupils with Medical Conditions Policy", fileUrl: "/policies/09-supporting-pupils-with-medical-conditions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
];
