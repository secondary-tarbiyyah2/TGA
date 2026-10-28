/**
 * Fallback content, used whenever Sanity isn't configured yet (see src/lib/sanity/env.ts).
 * Shapes mirror the Sanity schemas 1:1 so swapping in real CMS data is a no-op for pages.
 * Figures/copy marked isPlaceholder or "Draft / concept" are not confirmed, see task brief.
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
  { _id: "fb1", yearGroupRange: "Year 1 – Year 2", order: 1, annualFee: 1596 },
  { _id: "fb2", yearGroupRange: "Year 3 – Year 6", order: 2, annualFee: 2130 },
  { _id: "fb3", yearGroupRange: "Year 7 – Year 9", order: 3, annualFee: 2796 },
  { _id: "fb4", yearGroupRange: "Year 10 – Year 11", order: 4, annualFee: 3000, notes: "International GCSE exam entry fees are billed separately by the exam centre." },
];
export const feeBands: FeeBand[] = seedFeeBandsAnnual.map((b) => withDerivedFees(b, FEE_DEFAULTS));

// Fields left empty/undefined here are deliberately NOT invented, every page
// reading them must hide the corresponding section rather than show a blank
// or fabricated value. Only figures the school has actually confirmed are
// filled in (and only as a build-time fallback for when Sanity is
// unreachable, the live values always come from Sanity once configured).
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
  /** Number of monthly instalments the annual fee is split across (default 8). */
  feeInstalments?: number;
  /** % off the annual total when paid in full by the due date (default 2). */
  annualDiscountPercent?: number;
  /** Editable payment dates copy shown on the Fees page. */
  paymentScheduleText?: string;
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  // General-purpose discount catalogue for the fee estimator, beyond the
  // legacy sibling-discount fields above. Empty until the school confirms
  // a real discount to add, see ground rule 2, never invent an entry here.
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
  /** Editable intro sentence on the Policies page. */
  policiesIntro?: string;
  /** Editable "accessible formats" note at the foot of the Policies page. */
  policiesAccessibleFormatsNote?: string;
  /** Unlisted YouTube (or Teams/Stream) embed URL for the hidden /sample-lesson page. */
  sampleLessonVideoUrl?: string;
  /** Short note shown above the sample lesson (teacher, year group, subject). */
  sampleLessonNote?: string;
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
  contactPhone: "020 3719 8697",
  headteacherName: "Ustadh Abu Zayn Haneef Sandhar",
  complaintsLastYear: 0,
  discounts: [],
};

// Editable-page-section content: every field here is optional and mirrors
// what's already hardcoded on the corresponding page. A page reads
// `content.someField || "the existing default copy"`– so leaving Studio
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
  { _id: "f1", category: "Admissions", order: 1, question: "When do live lessons start, and what is the deadline to apply?", answer: "Live lessons start on Monday 11 January 2027. Applications for a January start close on Friday 18 December 2026, and every new pupil joins an online induction week from 4 to 8 January, so they know their teachers, their timetable and the portal before the first lesson. Applications received after the deadline are welcome and are considered while places remain." },
  { _id: "f2", category: "Admissions", order: 2, question: "Which year groups can apply?", answer: "Year 1 to Year 11 (children aged 5 to 15 on 31 August 2026). We do not run Reception. Year group is set by age in the normal English way; if you are not sure which year your child falls into, the application works it out from their date of birth." },
  { _id: "f3", category: "Admissions", order: 3, question: "How do I apply, step by step?", answer: "1) Register for an open evening or book a call if you want to talk to us first. 2) Complete the online application (about ten minutes) and pay the {{applicationFee}} application fee, by Friday 18 December 2026 for the founding cohort. 3) Your child sits a short online entry assessment and we have a conversation with you. 4) We offer a place in writing. 5) You accept by paying the {{registrationFee}} registration fee and the first fee payment (by Friday 8 January 2027) and signing the parent agreement on the portal. 6) Induction week (4 to 8 January), then live lessons begin on Monday 11 January 2027." },
  { _id: "f4", category: "Admissions", order: 4, question: "What is the entry assessment like?", answer: "It is short, age-appropriate and online: a reading and maths check, a few minutes of Qur'an reading or recitation at whatever level your child is at, and a friendly conversation. It is used to place your child in the right Qur'an and Arabic group and to plan support, not to turn children away. Nothing needs revising for it." },
  { _id: "f5", category: "Admissions", order: 5, question: "Can we see the school before we commit?", answer: "Yes. We are holding two online open evenings, Thursday 26 November at 7:30pm and Sunday 6 December at 4:00pm (UK time) · where you meet the Headteacher and teachers and ask anything. After both open evenings there is a taster morning on Saturday 12 December: Years 1 to 6 at 10:00 and Years 7 to 11 at 11:15, where your child joins a real live lesson. Register from the Open evenings page; the joining link and a calendar invite are emailed to you." },
  { _id: "f6", category: "Admissions", order: 6, question: "Can we apply from outside the UK?", answer: "Yes. Lessons run 09:00 to 15:00 UK time, so the Academy works well for families in the UK, Europe, North and West Africa, Turkey and the Middle East. Check the timings in your own time zone with the two-minute Is TGA right for us? check before you apply." },
  { _id: "f7", category: "Admissions", order: 7, question: "Can my child join part-way through the year?", answer: "Yes, where there is a place in the year group. The same application, assessment and induction steps apply, and fees are adjusted for the part of the year your child attends." },
  { _id: "f8", category: "Admissions", order: 8, question: "What is the difference between registering interest and applying?", answer: "Registering interest is a short form so we can keep you updated and invite you to events; it commits you to nothing. Applying is the full application with the {{applicationFee}} fee, and starts the admissions process." },
  { _id: "f9", category: "School day", order: 1, question: "What are the school hours?", answer: "Monday to Thursday, 09:00 to 15:00 UK time; Fridays, 09:00 to 12:00 so families can prepare for Jumu'ah. The day opens with ten minutes of form time at 09:00 and lessons start at 09:10. Dhuhr is built into the timetable." },
  { _id: "f10", category: "School day", order: 2, question: "How long are lessons, and how big are the classes?", answer: "Lessons are live and taught by a qualified teacher to a class of no more than 15. Lessons are 30 minutes in Years 1–2, 45 minutes in Years 3–6 and 50 minutes in Years 7–11, with a ten-minute movement break between lessons. Each key stage's curriculum page shows a sample week." },
  { _id: "f11", category: "School day", order: 3, question: "Is my child on a screen all day?", answer: "No. Live lessons are broken up with independent tasks, reading, writing by hand, prayer and movement breaks, and Friday afternoons are off-screen. Homework is set to be manageable and is tracked on the portal so nothing is lost." },
  { _id: "f12", category: "School day", order: 4, question: "Does a parent need to be at home during lessons?", answer: "For Years 1 to 3, an adult should be nearby to help with logging in and staying on task; from Year 4 most pupils manage independently once settled, and from Year 7 we expect it. Every lesson is recorded on the register, so you know your child was there." },
  { _id: "f13", category: "School day", order: 5, question: "What does my child do if they are unwell or miss a lesson?", answer: "Tell us through the Parent Portal or by email before 09:00 and we record an authorised absence. Lesson resources and homework stay on the portal, and the teacher will help your child catch up." },
  { _id: "f14", category: "School day", order: 6, question: "Are there term dates and holidays?", answer: "Yes. Term dates are published on the Term Dates page and in the portal calendar: induction week runs 4 to 8 January 2027, live lessons start on Monday 11 January 2027 and the year ends on Friday 9 July 2027, with a Ramadan and Eid break, a spring half term and an Eid al-Adha half term marked." },
  { _id: "f15", category: "Fees", order: 1, question: "How much are the fees?", answer: "For January to July 2027: Years 1–2 £1,596; Years 3–6 £2,130; Years 7–9 £2,796; Years 10–11 £3,000. These are the full amounts for the period, include 20% VAT, and cover all tuition and digital learning materials. There are no hidden extras." },
  { _id: "f16", category: "Fees", order: 2, question: "What are the application and registration fees, and why?", answer: "The application fee is {{applicationFee}}, is not refundable, and pays for the entry assessment and the time we spend with each family. The registration fee is {{registrationFee}} for the first child and half that for each additional sibling, paid once when you accept a place; it secures the place and covers your child's accounts, platform licences and onboarding. The registration fee is refunded only if you cancel within the 14-day cancellation period after accepting." },
  { _id: "f17", category: "Fees", order: 3, question: "How can we pay?", answer: "Three ways, all adding up to the same annual total: in full by 8 January 2027 with a {{annualDiscount}} discount; in two payments (8 January and 28 March); or in seven monthly payments (8 January, then the 28th of each month from January to June). Pay by bank transfer, standing order or card. Your plan is chosen on the portal when you accept." },
  { _id: "f18", category: "Fees", order: 4, question: "Is there a sibling discount?", answer: "Yes: 5% off tuition for a second child and 10% off for a third or further child, applied to the younger sibling's tuition, and it can be combined with the annual-payment discount. The registration fee for each additional sibling is also halved." },
  { _id: "f19", category: "Fees", order: 5, question: "What is not included in the fees?", answer: "International GCSE exam entry fees, which are paid directly to the exam centre; any printed textbooks or stationery you choose to buy; and your own device and internet connection." },
  { _id: "f20", category: "Fees", order: 6, question: "Is there a probationary period?", answer: "Yes. Every new pupil joins on a probationary basis for their first half term, so both the family and the Academy can judge whether online learning at TGA is right for the child. Progress is monitored closely with regular feedback during that time." },
  { _id: "f21", category: "Fees", order: 7, question: "What happens if we withdraw or miss a payment?", answer: "One half term's written notice is required to withdraw a pupil (through the parent portal, or in writing to globalacademy@tarbiyyah.co.uk), and fees remain payable for the notice period. If a payment is missed you are given 14 days' written notice to pay before anything else happens; the Fees Policy on the Policies page sets out the full process, refunds and the 14-day cancellation right." },
  { _id: "f22", category: "Curriculum", order: 1, question: "What does my child study?", answer: "Three strands every week: Qur'an, Arabic and Islamic Studies; the full national curriculum (English, Mathematics, Science, humanities, computing, art, PSHE and PE); and tarbiyyah, character, built around our RECIPE values. The exact subjects for each key stage are on the Curriculum page." },
  { _id: "f23", category: "Curriculum", order: 2, question: "Which GCSEs do you offer, and with which exam boards?", answer: "Every pupil sits Pearson Edexcel International GCSEs. Core: English Language (4EB1); English Literature (4ET1); Mathematics (4MA1); Science, as Double Award (4SD0) or separate Biology, Chemistry and Physics (4BI1, 4CH1, 4PH1); and Islamic Studies (4IS1). Pupils also choose two options from Arabic (Arabic as a first language, 4AA1), Business (4BS1), Computer Science (4CP0) and Geography (4GE1). In English Language, Mathematics, Computer Science, Geography and Arabic we teach the UK GCSE course (AQA or Pearson Edexcel) and add what the International GCSE exam needs. History is not offered at GCSE. Pupils sit their exams as private candidates at an approved centre near home, and we guide you through registering." },
  { _id: "f24", category: "Curriculum", order: 3, question: "Are the teachers qualified?", answer: "Yes. Every subject is taught by a qualified teacher with the relevant subject knowledge, an enhanced DBS check (or the overseas equivalent) and safeguarding training, and Qur'an is taught by experienced Qur'an teachers. Our Safer Recruitment Policy sets out every check we make." },
  { _id: "f25", category: "Curriculum", order: 4, question: "How will I know how my child is doing?", answer: "Live progress on the Parent Portal (attendance, homework, Qur'an marks, merits and teacher messages), a written report each term, two parents' evenings a year, and a weekly Tarbiyah Note from the form tutor. Entry and annual standardised assessments give an objective benchmark." },
  { _id: "f26", category: "Curriculum", order: 5, question: "Will my child be able to move back to a mainstream school?", answer: "Yes. Because we follow the national curriculum year by year and keep full records, pupils can transfer into any UK school at the matching year group, and we provide a transfer report." },
  { _id: "f27", category: "Islamic Studies", order: 1, question: "How is Qur'an taught, and is hifdh compulsory?", answer: "Qur'an is on the timetable every week in small groups set by ability, not by age: Qa'idah and early reading, fluent reading with tajweed, and memorisation. Every pupil memorises at a pace agreed with you; a full hifdh track is available for pupils and families who want it to be central." },
  { _id: "f28", category: "Islamic Studies", order: 2, question: "Will my child learn Arabic properly?", answer: "Yes. Arabic is taught as a language from Year 1, with reading, writing, speaking and grammar, so pupils connect with the Qur'an and classical texts directly. In Years 10 and 11 it can be taken as an option, taught from the Pearson Edexcel GCSE course and sat as the Pearson Edexcel International GCSE in Arabic as a first language (4AA1)." },
  { _id: "f29", category: "Islamic Studies", order: 3, question: "What is taught in Islamic Studies, and from which perspective?", answer: "Aqeedah, fiqh, seerah, hadith and akhlaq, taught from the Qur'an and Sunnah following the understanding of the early generations, in an age-appropriate way, leading to the Edexcel International GCSE in Islamic Studies. We are happy to talk through the syllabus with you." },
  { _id: "f30", category: "Islamic Studies", order: 4, question: "How do you keep lessons appropriate for an Islamic setting?", answer: "Teachers set the tone: cameras and conduct follow our Online Conduct and RECIPE expectations, chat is controlled by the teacher, and one-to-one sessions are only ever scheduled through the Academy calendar, with parents told in advance and the session recorded. Ask us at an open evening about class arrangements for your child's year group." },
  { _id: "f40", category: "Islamic Studies", order: 5, question: "Do you teach relationships and sex education (RSE)?", answer: "No. Every year group has PSHE only: good manners, friendships and family, health and hygiene, and keeping safe online and offline, including age-appropriate body safety and what the law says to protect young people. There is no sex education. From Year 7, puberty and its fiqh (bulugh) are taught to boys and girls separately. Parents can see all PSHE materials on the Parent Portal." },
  { _id: "f31", category: "Technology", order: 1, question: "What equipment do we need?", answer: "A laptop or desktop (Windows or Mac) or an iPad with a webcam, microphone and headset; a reliable internet connection (a wired connection or good Wi-Fi); a quiet place to work; and Microsoft Teams, which is free. For secure assessments the device must run Safe Exam Browser. We check your setup with you during induction." },
  { _id: "f32", category: "Technology", order: 2, question: "Where do lessons happen, and how does my child join?", answer: "Live lessons run on Microsoft Teams. Your child logs into the Student Portal, sees today's timetable and presses Join; the portal takes them straight into the right lesson. Homework, resources and recordings live in the same place." },
  { _id: "f33", category: "Technology", order: 3, question: "Is there a parent login?", answer: "Yes. Every family has a Parent Portal with the timetable, attendance, homework, Qur'an progress, reports, messages to teachers, invoices and anything that needs your signature. Accounts are created when you accept a place." },
  { _id: "f34", category: "Technology", order: 4, question: "How is my family's data protected?", answer: "Personal data is handled under UK GDPR, used only for your child's education and the running of the school, and never sold. Lesson recordings are kept for safeguarding and catch-up and are not shared outside the Academy. The Data Protection and Recording of Live Lessons policies on the Policies page explain what we keep and for how long." },
  { _id: "f35", category: "SEND", order: 1, question: "Do you support children with special educational needs?", answer: "Yes, within what an online school can provide: an individual support plan, adjustments in lessons, extra time and reader or scribe arrangements in assessments, and regular reviews with you. Tell us about your child's needs in the application so we can discuss honestly what we can offer before you commit." },
  { _id: "f36", category: "SEND", order: 2, question: "Can you support a child who is behind in reading, maths or Qur'an?", answer: "Yes. The entry assessment shows us where your child is, and Qur'an and Arabic groups are set by level, not age. Small classes make catch-up practical, and the portal shows you progress week by week." },
  { _id: "f37", category: "SEND", order: 3, question: "Is the website and portal accessible?", answer: "Yes. Use the Display button in the header (on a phone, it is in the menu) for larger text, easier reading and high contrast; the portal has the same options. Policies are available in accessible formats on request, and we welcome feedback on anything that is hard to use." },
  { _id: "f38", category: "Safeguarding", order: 1, question: "How do you keep children safe online?", answer: "Every member of staff is DBS-checked and safeguarding-trained; live lessons are recorded for safeguarding purposes and run on Academy accounts only; one-to-one sessions are scheduled through the Academy calendar, with the parent informed and the session recorded; and a Designated Safeguarding Lead oversees it all. The Safeguarding and Online Safety policies are on the Policies page." },
  { _id: "f39", category: "Safeguarding", order: 2, question: "Who do I contact if I am worried about something?", answer: "Your child's form tutor for everyday matters. For any concern about a child's safety, contact the Designated Safeguarding Lead: email globalacademy@tarbiyyah.co.uk with 'Safeguarding' in the subject line, or use Report a concern in the portal. Concerns and complaints follow the published Concerns and Complaints Policy." },
];

export const faqCategories = ["Admissions", "School day", "Fees", "Curriculum", "Islamic Studies", "Technology", "SEND", "Safeguarding"] as const;

export type TermDate = { _id: string; label: string; kind: string; date: string; endDate?: string; notes?: string; confirmed?: boolean };

// The founding-year calendar from the Prospectus 2026-27 (p.19), the same
// rows migration 0106 put in site_term_dates. This is only the build-time
// fallback; the live list is the site_term_dates table.
export const termDates: TermDate[] = [
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000001", label: "Application deadline for the founding cohort", kind: "Admissions deadline", date: "2026-12-18", notes: "Applications received after 18 December are welcome and are considered while places remain.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000005", label: "Winter break", kind: "Holiday", date: "2026-12-19", endDate: "2027-01-03", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000003", label: "Induction week (the Academy opens)", kind: "Event", date: "2027-01-04", endDate: "2027-01-08", notes: "Set up accounts, test devices and meet teachers.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000002", label: "Registration fee and first fee payment due", kind: "Admissions deadline", date: "2027-01-08", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000006", label: "Spring term A (first live lessons Monday 11 January)", kind: "Term date", date: "2027-01-11", endDate: "2027-02-12", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000007", label: "Ramadan and Eid break", kind: "Holiday", date: "2027-02-15", endDate: "2027-03-12", notes: "Islamic dates depend on the moon sighting and may move by a day or two.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000008", label: "Spring term B", kind: "Term date", date: "2027-03-15", endDate: "2027-03-25", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000009", label: "Spring half term", kind: "Holiday", date: "2027-03-26", endDate: "2027-03-30", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000010", label: "Summer term A", kind: "Term date", date: "2027-03-31", endDate: "2027-05-07", notes: "No lessons on Friday 9 April (INSET) or Monday 3 May.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000011", label: "Eid al-Adha half term", kind: "Holiday", date: "2027-05-10", endDate: "2027-05-21", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000012", label: "Summer term B", kind: "Term date", date: "2027-05-24", endDate: "2027-07-09", notes: "No lessons on Monday 31 May. Awards ceremony (online) in early July.", confirmed: true },
];

export type Testimonial = { _id: string; quote: string; attribution: string; role: "Parent" | "Student"; isPlaceholder: boolean; order?: number };

export const testimonials: Testimonial[] = [
  { _id: "ts1", role: "Parent", isPlaceholder: true, order: 1, quote: "Placeholder quote, real parent testimonials will replace this once launch families are enrolled.", attribution: "Parent, placeholder" },
  { _id: "ts2", role: "Student", isPlaceholder: true, order: 2, quote: "Placeholder quote, real student testimonials will replace this once launch families are enrolled.", attribution: "Student, placeholder" },
];

export type StaffMember = { _id: string; name: string; roleTitle: string; qualifications?: string; introVideoUrl?: string; isPlaceholder: boolean; order?: number };

export const staffMembers: StaffMember[] = [
  { _id: "sm1", isPlaceholder: true, order: 1, name: "Ustadh Abu Zayn Haneef Sandhar", roleTitle: "Headteacher", qualifications: "Full bio to follow." },
  { _id: "sm2", isPlaceholder: true, order: 2, name: "Teacher name TBC", roleTitle: "Subject TBC", qualifications: "Teacher bios and photos are being finalised ahead of launch." },
];

export type Differentiator = {
  _id: string;
  title: string;
  summary: string;
  detail?: string;
  icon?: string;
  status: "Confirmed commitment" | "Draft / concept, not yet confirmed";
  visible: boolean;
  order?: number;
};

export const differentiators: Differentiator[] = [
  {
    _id: "d2", order: 2, visible: true, icon: "quran",
    status: "Draft / concept, not yet confirmed",
    title: "Hifdh as a first-class subject",
    summary: "Qur'an memorisation progress tracked on a dashboard alongside academic subjects, not an after-school extra.",
    detail: "Hifdh sits on the timetable and the progress report with the same weight as English or Maths, not as a footnote club.",
  },
  {
    _id: "d3", order: 3, visible: true, icon: "family",
    status: "Draft / concept, not yet confirmed",
    title: "Big Sibling mentorship",
    summary: "Peer mentors from Tarbiyyah Primary and Secondary support Academy pupils, connecting the whole Tarbiyyah family.",
  },
  {
    _id: "d5", order: 5, visible: true, icon: "users",
    status: "Confirmed commitment",
    title: "Meet the Teachers",
    summary: "Every teacher is public on our website, qualifications and a short intro video, before you ever apply.",
  },
  {
    _id: "d6", order: 6, visible: true, icon: "note",
    status: "Confirmed commitment",
    title: "Weekly Tarbiyah Note",
    summary: "A personal weekly update on your child's character and akhlaq from their form tutor, separate from academic reports.",
  },
  {
    _id: "d7", order: 7, visible: true, icon: "portfolio",
    status: "Draft / concept, not yet confirmed",
    title: "Student portfolio",
    summary: "Recitation recordings, projects and artwork collected across the year into one growing portfolio.",
  },
  {
    _id: "d8", order: 8, visible: true, icon: "calendar",
    status: "Draft / concept, not yet confirmed",
    title: "Bookable teacher office hours",
    summary: "1:1 time with your child's teacher, booked directly, no waiting for parents' evening.",
  },
  {
    _id: "d9", order: 9, visible: true, icon: "heart",
    status: "Confirmed commitment",
    title: "Transparent bursary seats",
    // The real count is set by an admin (public.site_settings.bursary_seats,
    // migration 0020) and substituted into this summary on the homepage, 
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
  /** Shown in the "Key documents" box at the top of the Policies page. */
  featured?: boolean;
};

// Every policy here was issued September 2026 for the 2026–27 academic year,
// with a next review due August 2027, the standard cycle stated on each
// document itself (see e.g. the Concerns and Complaints Policy).
const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";

// parentQuestionCategory groups the Policies page by what a parent is
// actually trying to find out, rather than by DfE required/published
// category (that split is kept too, see `category`– just shown as a badge
// now instead of as the section headings). This grouping is an editorial/UX
// call, not a new fact: every document keeps its existing DfE category,
// number and file, only how they're grouped on the page changes.
export const policyLinks: PolicyLink[] = [
  { _id: "p01", number: "01", order: 1, category: "required", featured: true, parentQuestionCategory: "safety", title: "Child Protection and Safeguarding Policy", fileUrl: "/policies/01-child-protection-and-safeguarding.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-02-online-safety-and-acceptable-use", number: "02", order: 2, category: "published", parentQuestionCategory: "safety", title: "Online Safety and Acceptable Use Policy", fileUrl: "/policies/02-online-safety-and-acceptable-use.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-03-live-lesson-protocols", number: "03", order: 3, category: "published", parentQuestionCategory: "safety", title: "Live Lesson Protocols", fileUrl: "/policies/03-live-lesson-protocols.pdf", summary: "How live online lessons are run safely, calmly and well.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-04-recording-of-live-lessons-and-use-of-images", number: "04", order: 4, category: "published", parentQuestionCategory: "data", title: "Recording of Live Lessons and Use of Images Policy", fileUrl: "/policies/04-recording-of-live-lessons-and-use-of-images.pdf", summary: "When lessons are recorded, who can see them and how long they are kept.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-05-no-platform-for-extremism-prevent", number: "05", order: 5, category: "published", parentQuestionCategory: "safety", title: "No Platform for Extremism (Prevent) Policy", fileUrl: "/policies/05-no-platform-for-extremism-prevent.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p06", number: "06", order: 6, category: "required", parentQuestionCategory: "safety", title: "Anti-Bullying and Cyberbullying Policy", fileUrl: "/policies/06-anti-bullying-and-cyberbullying.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p07", number: "07", order: 7, category: "required", parentQuestionCategory: "safety", title: "Behaviour and Online Conduct Policy", fileUrl: "/policies/07-behaviour-and-online-conduct.pdf", summary: "Includes suspensions and exclusions.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-08-attendance-punctuality-and-children-missing-education", number: "08", order: 8, category: "published", parentQuestionCategory: "safety", title: "Attendance, Punctuality and Children Missing Education Policy", fileUrl: "/policies/08-attendance-punctuality-and-children-missing-education.pdf", summary: "Includes what happens if a child stops attending.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p09", number: "09", order: 9, category: "required", parentQuestionCategory: "safety", title: "Supporting Pupils with Medical Conditions Policy", fileUrl: "/policies/09-supporting-pupils-with-medical-conditions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p10", number: "10", order: 10, category: "required", parentQuestionCategory: "safety", title: "Health, Safety and Wellbeing Policy", fileUrl: "/policies/10-health-safety-and-wellbeing.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p12", number: "12", order: 11, category: "required", parentQuestionCategory: "curriculum", title: "Curriculum Policy", fileUrl: "/policies/12-curriculum.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-13-assessment", number: "13", order: 12, category: "published", parentQuestionCategory: "curriculum", title: "Assessment Policy", fileUrl: "/policies/13-assessment.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-14-marking-and-feedback", number: "14", order: 13, category: "published", parentQuestionCategory: "curriculum", title: "Marking and Feedback Policy", fileUrl: "/policies/14-marking-and-feedback.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-15-homework-and-independent-study", number: "15", order: 14, category: "published", parentQuestionCategory: "curriculum", title: "Homework and Independent Study Policy", fileUrl: "/policies/15-homework-and-independent-study.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p16", number: "16", order: 15, category: "required", parentQuestionCategory: "curriculum", title: "SEND and Inclusion Policy", fileUrl: "/policies/16-send-and-inclusion.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p17", number: "17", order: 16, category: "required", parentQuestionCategory: "curriculum", title: "Relationships, Sex and Health Education (RSHE) Policy", fileUrl: "/policies/17-relationships-sex-and-health-education.pdf", summary: "PSHE only in every year group, with no RSE; puberty and bulugh are taught to boys and girls separately from Year 7.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p19", number: "18", order: 17, category: "required", parentQuestionCategory: "curriculum", title: "Careers Education and Guidance Policy", fileUrl: "/policies/18-careers-education-and-guidance.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-19-examinations-and-private-candidates", number: "19", order: 18, category: "published", parentQuestionCategory: "curriculum", title: "Examinations and Private Candidates Policy", fileUrl: "/policies/19-examinations-and-private-candidates.pdf", summary: "How International GCSE entries work for an online school.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-20-academic-integrity-and-secure-assessment", number: "20", order: 19, category: "published", parentQuestionCategory: "curriculum", title: "Academic Integrity and Secure Assessment Policy", fileUrl: "/policies/20-academic-integrity-and-secure-assessment.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-21-flexible-learning", number: "21", order: 20, category: "published", parentQuestionCategory: "curriculum", title: "Flexible Learning Policy", fileUrl: "/policies/21-flexible-learning.pdf", summary: "Timetable options for families across time zones and circumstances.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-22-enrichment-and-clubs", number: "22", order: 21, category: "published", parentQuestionCategory: "curriculum", title: "Enrichment and Clubs Policy", fileUrl: "/policies/22-enrichment-and-clubs.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-23-recipe-character-framework", number: "23", order: 22, category: "published", parentQuestionCategory: "curriculum", title: "RECIPE Character Framework", fileUrl: "/policies/23-recipe-character-framework.pdf", summary: "How our values are taught, lived and recognised every day.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p25", number: "24", order: 23, category: "required", featured: true, parentQuestionCategory: "admissions-fees", title: "Admissions Policy", fileUrl: "/policies/24-admissions.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p26", number: "25", order: 24, category: "required", featured: true, parentQuestionCategory: "admissions-fees", title: "Fees Policy", fileUrl: "/policies/25-fees.pdf", summary: "Terms should be read before enrolling.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p27", number: "26", order: 25, category: "required", featured: true, parentQuestionCategory: "complaints", title: "Concerns and Complaints Policy", fileUrl: "/policies/26-concerns-and-complaints.pdf", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "policy-27-parent-communication-charter", number: "27", order: 26, category: "published", parentQuestionCategory: "complaints", title: "Parent Communication Charter", fileUrl: "/policies/27-parent-communication-charter.pdf", summary: "How and when we keep in touch, and how quickly we reply.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p29", number: "28", order: 27, category: "required", featured: true, parentQuestionCategory: "data", title: "Data Protection Policy", fileUrl: "/policies/28-data-protection.pdf", summary: "See also our short Privacy Notice.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
  { _id: "p30", number: "29", order: 28, category: "required", parentQuestionCategory: "curriculum", title: "Equality, Diversity and Accessibility Policy", fileUrl: "/policies/29-equality-diversity-and-accessibility.pdf", summary: "Includes our accessibility plan.", lastReviewed: ISSUED, nextReview: NEXT_REVIEW },
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
// yet, deliberately empty rather than invented, so the section on each
// /curriculum/[stage] page stays hidden until an admin uploads a real one.
export const curriculumDocuments: CurriculumDocument[] = [];
