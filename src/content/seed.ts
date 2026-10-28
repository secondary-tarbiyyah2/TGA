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
  { _id: "f1", category: "Admissions", order: 1, question: "When do live lessons start, and what is the deadline to apply?", answer: "Live lessons start on **Monday 11 January 2027**, and the deadline to apply is **Friday 18 December 2026**.\n\nThe school opens a week earlier with induction week (4 to 8 January), so your child meets their teachers and learns the portal first. Later applications are considered while places remain. See [Term dates](/term-dates)." },
  { _id: "f3", category: "Admissions", order: 2, question: "How do I apply, step by step?", answer: "Apply online, then a short assessment and an offer.\n\n1. Come to an open evening or [book a call](/book-a-call) if you would like to talk first.\n2. [Apply online](/admissions) by **Friday 18 December 2026**. It takes about ten minutes.\n3. We email you payment details for the {{applicationFee}} application fee, which is paid before a place is confirmed.\n4. Your child sits a short online entry assessment, and we talk with you.\n5. We offer a place in writing.\n6. Accept within five working days, pay your first fee payment by **Friday 8 January 2027** and sign the parent agreement on the portal.\n7. Induction week runs 4 to 8 January, and live lessons start on Monday 11 January 2027." },
  { _id: "f5", category: "Admissions", order: 3, question: "Can we see the school before we commit?", answer: "Yes, at an online open evening or the taster morning.\n\n- Open evenings: **Thursday 26 November, 7:30pm** and **Sunday 6 December, 4:00pm** (UK time)\n- Taster morning: **Saturday 12 December**, when your child joins a real live lesson (Years 1 to 6 at 10:00, Years 7 to 11 at 11:15)\n\n[Register on the Open evenings page](/open-evening) and we email you the joining link." },
  { _id: "f2", category: "Admissions", order: 4, question: "Which year groups can apply?", answer: "Year 1 to Year 11 (children aged 5 to 15 on 31 August 2026). We do not offer Reception. The application works out your child's year group from their date of birth." },
  { _id: "f4", category: "Admissions", order: 5, question: "What is the entry assessment like?", answer: "A short, friendly online check, not a test to pass.\n\n- Reading and maths at your child's level\n- A few minutes of Qur'an reading or recitation, at whatever level they are\n- A conversation with you and your child\n\nIt places your child in the right Qur'an and Arabic group and helps us plan support. There is nothing to revise." },
  { _id: "f20", category: "Admissions", order: 6, question: "Is there a probationary period?", answer: "Yes, for the first half term. It gives you and the school time to check that online learning at TGA suits your child, with regular feedback throughout." },
  { _id: "f6", category: "Admissions", order: 7, question: "Can we apply from outside the UK?", answer: "Yes. Lessons run on UK time (09:00 to 15:00), which suits families in the UK, Europe, North and West Africa, Turkey and the Middle East. Check the times where you live with [Is TGA right for us?](/eligibility)" },
  { _id: "f7", category: "Admissions", order: 8, question: "Can my child join part-way through the year?", answer: "Yes, if there is a place in their year group. The usual application, assessment and induction apply, and fees are adjusted for the part of the year your child attends." },
  { _id: "f8", category: "Admissions", order: 9, question: "What is the difference between registering interest and applying?", answer: "Registering interest is a short form that keeps you updated and commits you to nothing. Applying is the full application, followed by the {{applicationFee}} application fee, and starts the admissions process." },
  { _id: "f15", category: "Fees", order: 10, question: "How much are the fees?", answer: "For January to July 2027, including VAT:\n\n- Years 1 to 2: £1,596\n- Years 3 to 6: £2,130\n- Years 7 to 9: £2,796\n- Years 10 to 11: £3,000\n\nFees cover all tuition and digital learning materials. See [Fees](/fees) for payment plans and a family estimate." },
  { _id: "f16", category: "Fees", order: 11, question: "What is the application fee, and is there a registration fee?", answer: "The application fee is **{{applicationFee}} per child** and is non-refundable. There is **no registration fee**.\n\nWe email payment details after you apply, and the fee is paid before a place is confirmed. To accept a place, reply within five working days and pay your first fee payment by Friday 8 January 2027." },
  { _id: "f17", category: "Fees", order: 12, question: "How can we pay?", answer: "Choose one of three plans when you accept a place:\n\n- In full by 8 January 2027, with a {{annualDiscount}} discount\n- Two payments: 8 January and 28 March 2027\n- Seven monthly payments: 8 January, then the 28th of each month from January to June\n\nPay by bank transfer, standing order or card. See [Fees](/fees)." },
  { _id: "f18", category: "Fees", order: 13, question: "Is there a sibling discount?", answer: "Yes: 5% off tuition for a second child and 10% off for a third or further child. It applies to the younger sibling's tuition and can be combined with the pay-in-full discount." },
  { _id: "f19", category: "Fees", order: 14, question: "What is not included in the fees?", answer: "Three things:\n\n- International GCSE exam entry fees, paid directly to the exam centre\n- Printed books or stationery you choose to buy\n- Your own device and internet connection" },
  { _id: "f21", category: "Fees", order: 15, question: "What happens if we withdraw or miss a payment?", answer: "To withdraw, give one half term's written notice using the Withdrawal Form; fees are payable for the notice period. If a payment is missed, we give you 14 days' written notice before taking further steps.\n\nThe Fees Policy on the [Policies](/policies) page has the full detail, including refunds and your 14-day cancellation right." },
  { _id: "f9", category: "School day", order: 16, question: "What are the school hours?", answer: "Monday to Thursday **09:00 to 15:00**, and Friday **09:00 to 12:00** (UK time) so families can prepare for Jumu'ah. Form time starts at 09:00, lessons at 09:10, and Dhuhr is built into the timetable." },
  { _id: "f10", category: "School day", order: 17, question: "How long are lessons, and how big are the classes?", answer: "Classes have **no more than 15 pupils**, taught live by a qualified teacher. Each week:\n\n- Years 1 to 2: 15 live lessons of 30 minutes\n- Years 3 to 6: 20 live lessons of 45 minutes\n- Years 7 to 11: 23 live lessons of 50 minutes\n\nThere is a ten-minute movement break between lessons. Each [key stage page](/curriculum) shows a sample week." },
  { _id: "f11", category: "School day", order: 18, question: "Is my child on a screen all day?", answer: "No. Live lessons are broken up with independent tasks, reading, handwriting, prayer and movement breaks, and there are no lessons on Friday afternoons. Homework is kept manageable and tracked on the portal." },
  { _id: "f12", category: "School day", order: 19, question: "Does a parent need to be at home during lessons?", answer: "For Years 1 to 3, yes: an adult should be nearby to help with logging in and staying on task. Most pupils manage on their own from Year 4 once settled, and we expect it from Year 7. The register shows you every lesson your child attended." },
  { _id: "f13", category: "School day", order: 20, question: "What does my child do if they are unwell or miss a lesson?", answer: "Report the absence through the Parent Portal or by emailing the school, before 09:00 if you can. Lesson resources and homework stay on the portal, and the teacher helps your child catch up." },
  { _id: "f14", category: "School day", order: 21, question: "Are there term dates and holidays?", answer: "Yes. The year runs from January to July, with a Ramadan and Eid break, a spring half term and an Eid al-Adha half term.\n\n- School opens: Monday 4 January 2027 (induction week)\n- First live lessons: Monday 11 January 2027\n- Last day: Friday 9 July 2027\n\nSee [Term dates](/term-dates) for every date." },
  { _id: "f22", category: "Curriculum", order: 22, question: "What does my child study?", answer: "Three strands every week:\n\n- Qur'an, Arabic and Islamic Studies\n- The national curriculum: English, Mathematics, Science, humanities, computing, art and PSHE\n- Tarbiyyah (character), built around our RECIPE values\n\nPE is not on the timetable. See [Curriculum](/curriculum) for each key stage." },
  { _id: "f24", category: "Curriculum", order: 23, question: "Are the teachers qualified?", answer: "Yes. Every subject is taught by a qualified teacher with an enhanced DBS check (or the overseas equivalent) and safeguarding training, and Qur'an is taught by experienced Qur'an teachers. See [Meet the team](/team)." },
  { _id: "f25", category: "Curriculum", order: 24, question: "How will I know how my child is doing?", answer: "Through the Parent Portal, your own login, set up when you accept a place. It shows attendance, homework, Qur'an progress, merits, reports and messages from teachers.\n\n- A written report each term\n- Two parents' evenings a year\n- A weekly Tarbiyah Note from the form tutor" },
  { _id: "f23", category: "Curriculum", order: 25, question: "Which GCSEs do you offer, and with which exam boards?", answer: "Pearson Edexcel International GCSEs, sat as a private candidate at an approved exam centre near you. We help you register.\n\n- **Core:** English Language, English Literature, Mathematics, Science (Double Award or separate sciences) and Islamic Studies\n- **Two options from:** Arabic (first language), Business, Computer Science and Geography\n\nHistory is not offered at GCSE. See [Years 10 to 11](/curriculum/year-10-11) for subject details." },
  { _id: "f26", category: "Curriculum", order: 26, question: "Will my child be able to move back to a mainstream school?", answer: "Yes. We follow the national curriculum year by year and keep full records, so your child can join any UK school in the matching year group. We provide a transfer report." },
  { _id: "f27", category: "Islamic Studies", order: 27, question: "How is Qur'an taught, and is hifdh compulsory?", answer: "Hifdh is not compulsory: every pupil memorises at a pace agreed with you, and a full hifdh track is available if you want it to be central.\n\nQur'an is taught every week in small groups set by level, not age, from Qa'idah and early reading to fluent reading with tajweed." },
  { _id: "f28", category: "Islamic Studies", order: 28, question: "Will my child learn Arabic properly?", answer: "Yes. Arabic is taught as a language from Year 1: reading, writing, speaking and grammar. In Years 10 and 11 it is an International GCSE option (Arabic as a first language)." },
  { _id: "f29", category: "Islamic Studies", order: 29, question: "What is taught in Islamic Studies, and from which perspective?", answer: "Aqeedah, fiqh, seerah, hadith and akhlaq, taught from the Qur'an and Sunnah following the understanding of the early generations. It leads to the International GCSE in Islamic Studies, and we are happy to talk you through the syllabus." },
  { _id: "f40", category: "Islamic Studies", order: 30, question: "Do you teach relationships and sex education (RSE)?", answer: "No. Every year group has PSHE only, with no sex education.\n\n- PSHE covers manners, friendships and family, health and hygiene, and staying safe online and offline, including age-appropriate body safety\n- From Year 7, puberty and its fiqh (bulugh) are taught to boys and girls separately\n\nAll PSHE materials are on the Parent Portal." },
  { _id: "f30", category: "Islamic Studies", order: 31, question: "How do you keep lessons appropriate for an Islamic setting?", answer: "Teachers set the tone, and camera use and conduct follow our Online Conduct and RECIPE expectations. The teacher controls the chat. Ask us at an open evening about class arrangements for your child's year group." },
  { _id: "f31", category: "Technology", order: 32, question: "What equipment do we need?", answer: "A computer or iPad with a webcam and headset, reliable internet and a quiet place to work.\n\n- A Windows or Mac laptop or desktop, or an iPad\n- Webcam, microphone and headset\n- A wired connection or good Wi-Fi\n- Microsoft Teams (free), and Safe Exam Browser for secure assessments\n\nWe check your setup with you during induction week." },
  { _id: "f32", category: "Technology", order: 33, question: "Where do lessons happen, and how does my child join?", answer: "On Microsoft Teams, through the Student Portal. Your child opens today's timetable and presses Join to go straight into the right lesson. Homework, resources and recordings are in the same place." },
  { _id: "f34", category: "Technology", order: 34, question: "How is my family's data protected?", answer: "Under UK GDPR: it is used only for your child's education and running the school, and never sold. Lesson recordings are kept for safeguarding and catch-up and are not shared outside the school.\n\nSee the Data Protection and Recording of Live Lessons policies on the [Policies](/policies) page." },
  { _id: "f35", category: "SEND", order: 35, question: "Can you support my child's special educational needs?", answer: "Often, yes, within what a live online school can provide. Tell us about your child's needs when you apply, and we will say honestly what we can offer before you commit.\n\n- An individual support plan, reviewed regularly with you\n- Adjustments in lessons, in classes of up to 15\n- Extra time, a reader or a scribe in assessments\n- Lesson resources and homework kept on the portal to revisit\n\nWe cannot offer in-person help such as an adult in the room, so younger children or those with higher needs may need a parent or carer nearby. See [Pastoral care and SEND](/pastoral-care)." },
  { _id: "f36", category: "SEND", order: 36, question: "Can you support a child who is behind in reading, maths or Qur'an?", answer: "Yes. The entry assessment shows where your child is, Qur'an and Arabic groups are set by level rather than age, and small classes make catch-up practical. You can follow progress week by week on the portal." },
  { _id: "f37", category: "SEND", order: 37, question: "Is the website and portal accessible?", answer: "Yes. Use **Display** (the Aa button in the menu or the footer) for larger text, easy reading, higher contrast and less motion; the portal has the same options. Policies are available in accessible formats on request. See [Accessibility](/accessibility)." },
  { _id: "f38", category: "Safeguarding", order: 38, question: "How do you keep children safe online?", answer: "Every member of staff is DBS-checked and safeguarding-trained, and a Designated Safeguarding Lead oversees it all.\n\n- Live lessons are recorded and run on school accounts only\n- One-to-one sessions are booked through the school calendar, with parents told in advance and the session recorded\n\nSee [Safeguarding](/safeguarding)." },
  { _id: "f39", category: "Safeguarding", order: 39, question: "Who do I contact if I am worried about something?", answer: "Your child's form tutor for everyday matters. For any worry about a child's safety, contact the Designated Safeguarding Lead, whose details are on the [Safeguarding](/safeguarding) page and in the portal. Complaints follow the Concerns and Complaints Policy." },
];

export const faqCategories = ["Admissions", "Fees", "School day", "Curriculum", "Islamic Studies", "Technology", "SEND", "Safeguarding"] as const;

export type TermDate = { _id: string; label: string; kind: string; date: string; endDate?: string; notes?: string; confirmed?: boolean };

// The founding-year calendar from the Prospectus 2026-27 (p.19), the same
// rows migration 0106 put in site_term_dates. This is only the build-time
// fallback; the live list is the site_term_dates table.
export const termDates: TermDate[] = [
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000001", label: "Application deadline for the founding cohort", kind: "Admissions deadline", date: "2026-12-18", notes: "Applications received after 18 December are welcome and are considered while places remain.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000005", label: "Winter break", kind: "Holiday", date: "2026-12-19", endDate: "2027-01-03", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000003", label: "Induction week (the Academy opens)", kind: "Event", date: "2027-01-04", endDate: "2027-01-08", notes: "Set up accounts, test devices and meet teachers.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000002", label: "First fee payment due", kind: "Admissions deadline", date: "2027-01-08", confirmed: true },
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
