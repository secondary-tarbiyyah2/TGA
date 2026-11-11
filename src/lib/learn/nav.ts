import type { IconName } from "@/components/learn/Icon";
import type { FeatureKey, FeatureMap } from "@/lib/learn/features";

// One place for every /learn area's navigation.
//
// The rule: the sidebar lists DESTINATIONS, and a destination is either a
// single page or a HUB. A hub is one sidebar entry that groups closely
// related pages (Curriculum = Lesson library, Syllabus, Revision results). The sidebar shows only the hub; it stays highlighted on any of
// its pages, and the sidebar lists the hub's pages under it (staff: inside the
// category's dropdown; families and pupils: under the entry while you are in
// it). There is no strip of tabs across the top of the page (owner, 11 Nov
// 2026; docs/portal-structure.md). Nothing is listed twice: a page is either a
// sidebar entry or a tab inside one hub.
//
// Teaching work lives in the class (Stream · Classwork · Lessons · People ·
// Attendance · Grades · Insights), like Google Classroom and Teams for
// Education. The cross-class pages (Classwork to action, To review, Gradebook)
// are overviews reached from the class hub, not separate top-level entries.
// Work is only set inside a class: "Classwork to action" lists what needs
// marking or chasing and links into each class's Classwork tab.

export type PortalArea = "admin" | "teach" | "family" | "student";
// headOnly: the page's LearnGate only admits head_teacher/admin, so the
// entry is hidden from admissions staff rather than leading to a refusal.
export type PortalNavItem = { href: string; label: string; hint?: string; headOnly?: boolean };
export type PortalNavGroup = { label: string; items: PortalNavItem[] };

export const AREA_LABEL: Record<PortalArea, string> = {
  admin: "Admin",
  teach: "Teaching",
  family: "Family",
  student: "Student",
};

/** Pages are served at the learn subdomain's root ("/admin/…"), but strip a
 * "/learn" prefix too so the same checks work under the main-domain path. */
export function normalisePortalPath(pathname: string): string {
  return pathname.replace(/^\/learn(?=\/|$)/, "") || "/";
}

export function portalAreaFor(pathname: string): PortalArea | null {
  const m = normalisePortalPath(pathname).match(/^\/(admin|teach|family|student)(?=\/|$)/);
  return (m?.[1] as PortalArea) || null;
}

/** Active if it's the page itself or a sub-page (e.g. /admin/lessons/view). */
export function isActivePath(pathname: string, href: string): boolean {
  const p = normalisePortalPath(pathname);
  // A single class page (/teach/class?id=…) belongs under "My classes".
  if (href.endsWith("/classes") && (p === href.slice(0, -2) || p === href.slice(0, -2) + "/")) return true;
  return p === href || p.startsWith(href + "/");
}

const underPrefix = (p: string, prefixes?: string[]) => !!prefixes?.some((m) => p === m || p.startsWith(m + "/"));

// ── Sidebar ─────────────────────────────────────────────────────────

export type SidebarIcon = IconName;

export type NavBadgeName = "actions" | "messages" | "todo" | "review";

/** One page inside a hub, shown as a tab at the top of the hub's pages.
 * `keywords` are extra plain words search (Ctrl K) matches ("attendance" finds
 * Registers); `short` is the one-word name on the phone tab bar. */
export type HubTab = {
  href: string;
  label: string;
  hint?: string;
  icon?: SidebarIcon;
  headOnly?: boolean;
  matchPrefixes?: string[];
  senco?: boolean;
  badge?: NavBadgeName;
  keywords?: string;
  short?: string;
  /** Hidden while the Headteacher has this School feature switched off (Settings, School features). */
  feature?: FeatureKey;
};

/** `group` is the category the item sits under in grouped areas (staff).
 * `matchPrefixes` keeps an item highlighted across related routes (e.g. a
 * single class page keeps "My classes" lit). `tabs` makes the item a hub: its
 * href is the first tab the user can open. `page` marks a single page drawn
 * as its own row (a page inside a category, or a Home page). */
export type SidebarItem = {
  /** Stable key: the entry's href as written below, even after a hub is
   * pointed at a different first tab for this user. */
  id?: string;
  href: string;
  label: string;
  icon: SidebarIcon;
  hint?: string;
  headOnly?: boolean;
  /** Also open to an account whose only staff role is SENCo (see sencoOnly). */
  senco?: boolean;
  group?: string;
  matchPrefixes?: string[];
  badge?: NavBadgeName;
  tabs?: HubTab[];
  keywords?: string;
  short?: string;
  page?: boolean;
  feature?: FeatureKey;
};
export type SidebarGroup = { label: string; icon: SidebarIcon; items: SidebarItem[] };

/** A category of pages. Staff (admin, teach) see each category as a dropdown
 * in the sidebar holding its pages; the `home` category's pages are plain links
 * at the top, always open. Families and pupils see each category as one simple
 * link (a hub), with its pages listed under it while they are in it. */
export type NavCategory = { label: string; icon: SidebarIcon; hint?: string; home?: boolean; pages: (HubTab & { icon: SidebarIcon })[] };

// Portal structure, November 2026 (owner: "better and just easier to
// navigate ... categorise things better and maybe make it dropdown; look at
// SIMS and Arbor and Moodle"). Staff areas are laid out like a school MIS:
// Home (the everyday pages, always visible), then categories named after the
// job (Pupils and admissions, Attendance and behaviour, Safeguarding and SEND
// ...). Each category is a dropdown in the sidebar, remembered open or closed
// per user, and staff can pin any page to the top. Families and pupils keep a
// short flat menu. Every page keeps its address; see docs/portal-redesign.md
// ("Navigation and tour") for the reasoning and the before and after.
export const NAV_CATEGORIES: Record<PortalArea, NavCategory[]> = {
  admin: [
    {
      label: "Home",
      icon: "house",
      home: true,
      pages: [
        { href: "/admin/dashboard", label: "Today", icon: "house", hint: "Today across the school", keywords: "home dashboard overview start", short: "Today" },
        { href: "/admin/actions", label: "Waiting for you", icon: "flag", hint: "Everything waiting for the office, by urgency", headOnly: true, badge: "actions", keywords: "action centre to do tasks alerts needs attention" },
        { href: "/admin/messages", label: "Messages", icon: "messageSquare", hint: "Conversations with families and staff", headOnly: true, badge: "messages", keywords: "inbox email chat parents contact", short: "Messages" },
        { href: "/admin/calendar", label: "Calendar", icon: "calendarDays", hint: "Term dates and school events", headOnly: true, keywords: "term dates holidays events diary" },
      ],
    },
    {
      label: "Pupils and admissions",
      icon: "backpack",
      pages: [
        { href: "/admin/pupils", label: "All pupils", icon: "backpack", hint: "Every pupil's record in one place", headOnly: true, keywords: "students children records add pupil missing details medical", short: "Pupils" },
        { href: "/admin/families", label: "Families and contacts", icon: "contact", hint: "Parents and emergency contacts for every pupil, and what is missing", headOnly: true, keywords: "parents guardians emergency contacts phone email missing parental responsibility download" },
        { href: "/admin/admissions", label: "Applications", icon: "userRoundPlus", hint: "Applications, calls and availability", keywords: "admissions apply enquiries new families" },
        { href: "/admin/assessments", label: "Entry assessments", icon: "clipboardCheck", hint: "Baseline and entry assessments", keywords: "baseline test placement" },
        { href: "/admin/open-evening", label: "Open evenings", icon: "school", hint: "Sessions, bookings and attendee lists", keywords: "open day taster visits bookings" },
      ],
    },
    {
      label: "Classes and timetable",
      icon: "presentation",
      pages: [
        { href: "/admin/classes", label: "Classes", icon: "presentation", hint: "Every class: stream, classwork, people and grades", headOnly: true, matchPrefixes: ["/admin/class"], keywords: "groups sets add a class", short: "Classes" },
        { href: "/admin/lessons", label: "Timetable", icon: "layoutDashboard", hint: "Lessons by week, live lessons and recordings", headOnly: true, keywords: "lessons schedule week recordings cover" },
        { href: "/admin/lessons/generate", label: "Make the timetable", icon: "calendarCheck", hint: "Match staff availability with what each class needs, then place every lesson", headOnly: true, keywords: "generate timetable solver availability" },
        { href: "/admin/academic/meeting-links", label: "Teams links", icon: "monitor", hint: "The Teams meeting link for each class's live lessons", headOnly: true, keywords: "microsoft teams meeting live lesson link join" },
        { href: "/admin/homework", label: "Classwork to action", icon: "notebookPen", hint: "To mark, missing and late, with links into each class", headOnly: true, keywords: "homework late missing marking" },
      ],
    },
    {
      label: "Curriculum",
      icon: "library",
      pages: [
        { href: "/admin/curriculum/map", label: "Curriculum map", icon: "calendarDays", hint: "Every unit across the year; open a unit for its lessons, plan and specification", headOnly: true, keywords: "units year overview scheme" },
        { href: "/admin/curriculum", label: "Browse", icon: "folder", hint: "Years, subjects and units as folders, with their lessons and resources", headOnly: true, keywords: "lesson library lessons slides resources plans revision packs folders drive" },
        { href: "/admin/curriculum/review", label: "Lesson review", icon: "clipboardCheck", hint: "Submitted, changes requested and approved lessons", headOnly: true, keywords: "approve sign off quality check lessons" },
        { href: "/admin/curriculum/resources", label: "Resources", icon: "printer", hint: "Resources in the Curriculum folders, and each term's printable list", headOnly: true, keywords: "worksheets quizzes tests mocks mark schemes knowledge organisers writing frames printables term resources" },
        { href: "/admin/planner", label: "Planner", icon: "layoutGrid", hint: "Long-term and week-by-week plans, unit by unit", headOnly: true, keywords: "long term plan medium term weekly" },
        { href: "/admin/syllabus", label: "Syllabus", icon: "scrollText", hint: "Schemes of work and exam specifications", headOnly: true, keywords: "scheme of work specification gcse spec" },
      ],
    },
    {
      label: "Assessment and reports",
      icon: "chartLine",
      pages: [
        { href: "/admin/reports", label: "Term reports", icon: "fileText", hint: "Write, approve and issue reports", headOnly: true, keywords: "progress reports report cards approve" },
        { href: "/admin/gcse", label: "GCSE grades", icon: "graduationCap", hint: "Predicted and actual grades, Years 10 and 11", headOnly: true, keywords: "predicted grades exams year 10 year 11 interventions" },
        { href: "/admin/revision", feature: "revision_packs", label: "Revision results", icon: "target", hint: "How pupils did on each unit's revision", headOnly: true, keywords: "quiz results revision scores" },
        { href: "/admin/quran", label: "Qur'an", icon: "bookMarked", hint: "Each Qur'an class's recitations, and the marking standard", headOnly: true, keywords: "quran hifdh hifz qaidah recitation mistakes strictness bands marking standard tajweed" },
        { href: "/admin/summary", label: "School at a glance", icon: "chartColumnIncreasing", hint: "Attendance, homework and progress", headOnly: true, keywords: "data analytics summary figures statistics" },
      ],
    },
    {
      label: "Attendance and behaviour",
      icon: "userCheck",
      pages: [
        { href: "/admin/attendance", label: "Registers", icon: "userCheck", hint: "Take and review lesson registers", headOnly: true, keywords: "attendance register present late take the register" },
        { href: "/admin/absences", label: "Absences and cover", icon: "calendarX", hint: "Reported absences, follow-ups and staff cover", headOnly: true, keywords: "absent sick off staff cover unexplained" },
        { href: "/admin/behaviour", label: "Behaviour", icon: "heartHandshake", hint: "Incidents and praise", headOnly: true, keywords: "incidents conduct praise sanctions" },
        { href: "/admin/rewards", feature: "house_points", label: "House points", icon: "trophy", hint: "House points and Star of the Week", headOnly: true, keywords: "merits rewards stars houses star of the week" },
        { href: "/admin/enrichment", label: "Enrichment", icon: "calendarCheck", hint: "Who joined each supervised block", headOnly: true, keywords: "clubs activities supervised blocks" },
      ],
    },
    {
      label: "Safeguarding and SEND",
      icon: "shieldCheck",
      pages: [
        { href: "/admin/compliance", label: "Safeguarding", icon: "shieldCheck", hint: "Concerns, compliance, audit and retention", keywords: "dsl concerns compliance child protection" },
        { href: "/admin/send", label: "SEND register", icon: "listChecks", hint: "Support plans, adjustments, access arrangements and reviews", headOnly: true, keywords: "special needs senco ehcp support plans" },
        { href: "/admin/message-oversight", label: "Message oversight", icon: "shieldAlert", hint: "Safeguarding view of staff-family messages", headOnly: true, keywords: "flagged messages monitoring" },
        { href: "/admin/data-protection", label: "Data protection", icon: "fileCheck", hint: "Retention rules and subject access exports", headOnly: true, keywords: "gdpr subject access request retention erase" },
        { href: "/admin/audit-log", label: "Audit log", icon: "listChecks", hint: "Who changed what, with filters and CSV export", headOnly: true, keywords: "history changes who did what" },
      ],
    },
    {
      label: "Communication",
      icon: "megaphone",
      pages: [
        { href: "/admin/announcements", label: "Announcements", icon: "megaphone", hint: "School-wide notices", headOnly: true, keywords: "notices news post send to all" },
        { href: "/admin/digest", label: "Weekly digest", icon: "mail", hint: "Friday parent email", headOnly: true, keywords: "newsletter friday email" },
        { href: "/admin/parent-evenings", label: "Parent evenings", icon: "calendarClock", hint: "Create evenings, open booking, see bookings", headOnly: true, keywords: "parents evening appointments slots meetings" },
        { href: "/admin/feedback", label: "Portal feedback", icon: "messageSquarePlus", hint: "Suggestions and bug reports from portal users", headOnly: true, keywords: "bugs suggestions problems reported" },
      ],
    },
    {
      label: "Staff",
      icon: "userRound",
      pages: [
        { href: "/admin/staff", label: "Staff", icon: "userRound", hint: "Teacher profiles and compliance dates", headOnly: true, keywords: "teachers team dbs checks" },
        { href: "/admin/staff-attendance", label: "Staff hours", icon: "clock", hint: "Clock-ins, hours and late arrivals", headOnly: true, keywords: "clock in timesheet hours worked" },
        { href: "/admin/recruitment", label: "Job applications", icon: "briefcase", hint: "Vacancies and applications from the website's Apply for a job form", headOnly: true, keywords: "recruitment vacancies jobs hiring" },
        { href: "/admin/handbook", label: "Staff handbook", icon: "bookOpen", hint: "Policies and how-tos for staff", headOnly: true, keywords: "how to guide help policies" },
      ],
    },
    {
      label: "School office",
      icon: "wallet",
      pages: [
        { href: "/admin/fees", label: "Fees", icon: "wallet", hint: "Invoices and payment status", headOnly: true, keywords: "payments invoices money bursary" },
        { href: "/admin/payments", label: "Payments", icon: "receipt", hint: "Every charge and Stripe payment, checked against Stripe daily", headOnly: true, keywords: "stripe reconcile references invoices overdue refunds disputes" },
        { href: "/admin/documents", label: "Policies to sign", icon: "fileCheck", hint: "Policies families and staff sign", headOnly: true, keywords: "documents signatures consent forms" },
        { href: "/admin/people", label: "Accounts and sign-ins", icon: "idCard", hint: "Sign-ins and roles for families, pupils and staff", keywords: "people users logins invite roles password" },
        { href: "/admin/content", label: "Website pages", icon: "globe", hint: "Pages on the public site", keywords: "website cms public site" },
      ],
    },
    {
      label: "Settings",
      icon: "settings",
      pages: [
        { href: "/admin/academic", label: "Academic setup", icon: "layers", hint: "Years, terms, year groups, classes and subjects", keywords: "terms year groups subjects set up" },
        { href: "/admin/settings", label: "School settings", icon: "settings", hint: "School features, school details, alerts, clock-in and Microsoft 365", keywords: "configuration ai helpers alerts microsoft school features switches turn on off revision packs" },
      ],
    },
  ],
  teach: [
    {
      label: "Home",
      icon: "house",
      home: true,
      pages: [
        { href: "/teach/dashboard", label: "Today", icon: "house", hint: "Your day at a glance", keywords: "home dashboard overview start", short: "Today" },
        { href: "/teach/actions", label: "Waiting for you", icon: "flag", hint: "Everything waiting for you", badge: "actions", keywords: "action centre to do tasks alerts" },
        { href: "/teach/messages", label: "Messages", icon: "messageSquare", hint: "Conversations with families and colleagues", badge: "messages", keywords: "inbox email chat parents contact", short: "Messages" },
        { href: "/teach/calendar", label: "Calendar", icon: "calendarDays", hint: "Term dates and school events", keywords: "term dates holidays events diary" },
      ],
    },
    {
      label: "My teaching",
      icon: "presentation",
      pages: [
        { href: "/teach/classes", label: "My classes", icon: "presentation", hint: "Register, classwork, grades and pupils for each class", matchPrefixes: ["/teach/class", "/teach/lessons"], keywords: "classes groups set work stream", short: "Classes" },
        { href: "/teach/today", label: "Lessons and registers", icon: "userCheck", hint: "Today's lessons, with the register for each", matchPrefixes: ["/teach/enrichment"], keywords: "attendance register take the register lessons today teams join" },
        { href: "/teach/review", label: "To mark", icon: "clipboardCheck", hint: "Work handed in and waiting to be marked", badge: "review", keywords: "marking feedback submissions handed in", short: "To mark" },
        { href: "/teach/homework", label: "Classwork to action", icon: "notebookPen", hint: "To mark, missing and late, with links into each class", keywords: "homework late missing chase" },
        // Its own page, apart from My pupils (owner, 11 Nov 2026): hear each Qur'an class recite.
        { href: "/teach/quran", label: "Qur'an and Qaidah", icon: "bookMarked", hint: "Hear each Qur'an class recite, log mistakes and see each pupil's history", keywords: "quran hifz memorisation recitation qaidah mistakes tajweed strictness" },
      ],
    },
    {
      label: "Pupils",
      icon: "backpack",
      pages: [
        { href: "/teach/pupils", label: "My pupils", icon: "backpack", hint: "Records for the pupils you teach", keywords: "students children records" },
      ],
    },
    {
      label: "Curriculum",
      icon: "library",
      pages: [
        { href: "/teach/curriculum/map", label: "Curriculum map", icon: "calendarDays", hint: "Every unit across the year; open a unit for its lessons, plan and specification", keywords: "units year overview scheme" },
        { href: "/teach/curriculum", label: "Browse", icon: "folder", hint: "Years, subjects and units as folders, with their lessons and resources", keywords: "lesson library lessons slides resources plans revision packs edit a lesson folders drive" },
        { href: "/teach/curriculum/review", label: "Lesson review", icon: "clipboardCheck", hint: "Lessons in review, sent back or approved", keywords: "approve sign off lessons" },
        { href: "/teach/curriculum/resources", label: "Resources", icon: "printer", hint: "Resources in the Curriculum folders, and each term's printable list", keywords: "worksheets quizzes tests mocks mark schemes knowledge organisers writing frames printables term resources" },
        { href: "/teach/planner", label: "Planner", icon: "layoutGrid", hint: "Long-term and week-by-week plans, unit by unit", keywords: "long term plan medium term weekly" },
        { href: "/teach/syllabus", label: "Syllabus", icon: "scrollText", hint: "Schemes of work and exam specifications", keywords: "scheme of work specification gcse spec" },
      ],
    },
    {
      label: "Assessment and reports",
      icon: "chartLine",
      pages: [
        { href: "/teach/assessment", label: "Gradebook", icon: "award", hint: "Enter a whole class's results at once", keywords: "marks grades results markbook" },
        { href: "/teach/reports", label: "Term reports", icon: "fileText", hint: "Term reports for your classes", keywords: "report comments progress reports write" },
        { href: "/teach/revision", feature: "revision_packs", label: "Revision results", icon: "target", hint: "How your pupils did on each unit's revision", keywords: "quiz results revision scores" },
      ],
    },
    {
      label: "Attendance and behaviour",
      icon: "heartHandshake",
      pages: [
        { href: "/teach/absences", label: "Absences", icon: "calendarX", hint: "Reported pupil absences", keywords: "absent sick off away" },
        { href: "/teach/behaviour", label: "Behaviour", icon: "heartHandshake", hint: "Incidents and praise", keywords: "incidents conduct praise sanctions log behaviour" },
        { href: "/teach/stars", feature: "house_points", label: "House points", icon: "trophy", hint: "House points and Star of the Week", keywords: "merits rewards stars award points star of the week" },
      ],
    },
    {
      label: "Safeguarding and SEND",
      icon: "shieldCheck",
      pages: [
        { href: "/teach/send", label: "Support plans", icon: "listChecks", hint: "Adjustments and access arrangements for pupils with SEND", senco: true, keywords: "special needs senco ehcp send register" },
        { href: "/report-concern", label: "Report a concern", icon: "shieldAlert", hint: "Tell the safeguarding lead about a worry", senco: true, keywords: "safeguarding dsl worry child protection" },
      ],
    },
    {
      label: "Communication",
      icon: "megaphone",
      pages: [
        { href: "/teach/announcements", label: "Announcements", icon: "megaphone", hint: "School-wide notices", keywords: "notices news" },
        { href: "/teach/parent-evenings", label: "Parent evenings", icon: "calendarClock", hint: "Your parent evening slots and bookings", keywords: "parents evening appointments slots meetings" },
      ],
    },
    {
      label: "My staff area",
      icon: "userRound",
      pages: [
        { href: "/teach/profile", label: "My profile", icon: "userRound", hint: "Your teacher profile", keywords: "about me bio photo" },
        { href: "/teach/clock", label: "My hours", icon: "clock", hint: "Clock-ins and hours worked", keywords: "clock in timesheet hours" },
        { href: "/teach/handbook", label: "Staff handbook", icon: "bookOpen", hint: "Policies and how-tos for staff", senco: true, keywords: "how to guide help policies" },
      ],
    },
  ],
  family: [
    {
      label: "Today",
      icon: "house",
      pages: [
        { href: "/family/dashboard", label: "Today", icon: "house", hint: "Your children's day and week", keywords: "home dashboard overview start", short: "Today" },
        { href: "/family/actions", label: "Waiting for you", icon: "flag", hint: "Forms to sign, payments and replies", keywords: "action to do sign forms consent" },
      ],
    },
    {
      label: "Homework",
      icon: "listChecks",
      pages: [{ href: "/family/todo", label: "Homework", icon: "listChecks", hint: "Homework due, missing and handed in", matchPrefixes: ["/family/homework"], badge: "todo", keywords: "classwork due missing to do", short: "Homework" }],
    },
    {
      label: "Messages",
      icon: "messageSquare",
      pages: [
        { href: "/family/messages", label: "Inbox", icon: "messageSquare", hint: "Conversations with teachers and the office", badge: "messages", keywords: "messages contact teacher email chat", short: "Messages" },
        { href: "/family/announcements", label: "Announcements", icon: "megaphone", hint: "Notices from the school", keywords: "notices news" },
      ],
    },
    {
      label: "My children",
      icon: "houseHeart",
      pages: [
        { href: "/family/classes", label: "Classes and timetable", icon: "presentation", hint: "Each child's classes, lessons and classwork", matchPrefixes: ["/family/class", "/family/lessons"], keywords: "timetable lessons teams join live lesson", short: "Children" },
        { href: "/family/teachers", label: "Teachers", icon: "users", hint: "Who teaches each child", keywords: "staff who teaches" },
        { href: "/family/child-details", label: "Child details", icon: "contact", hint: "Contact, medical and consent details", keywords: "address medical allergies consent contacts update details" },
        { href: "/family/support", label: "Support plan", icon: "listChecks", hint: "SEND support plan and reviews", keywords: "send special needs" },
        { href: "/family/absences", label: "Report an absence", icon: "calendarX", hint: "Tell us your child will be away", keywords: "absent sick ill off away holiday" },
      ],
    },
    {
      label: "Progress",
      icon: "chartLine",
      pages: [
        { href: "/family/reports", label: "Reports", icon: "fileText", hint: "Term reports", keywords: "report card grades progress", short: "Progress" },
        { href: "/family/quran", label: "Qur'an", icon: "bookMarked", hint: "Qur'an and Qaidah: recitation and memorisation progress", keywords: "quran hifz qaidah memorisation" },
        { href: "/family/behaviour", label: "Behaviour", icon: "heartHandshake", hint: "Praise and incidents", keywords: "merits house points praise" },
        { href: "/family/revision", feature: "revision_packs", label: "Revision", icon: "target", hint: "Unit revision results", keywords: "quiz results" },
      ],
    },
    {
      label: "Calendar",
      icon: "calendarDays",
      pages: [
        { href: "/family/calendar", label: "Calendar", icon: "calendarDays", hint: "Term dates and school events", keywords: "term dates holidays events" },
        { href: "/family/parent-evenings", label: "Parent evenings", icon: "calendarClock", hint: "Book a slot with your child's teachers", keywords: "parents evening book appointment meeting" },
      ],
    },
    { label: "Fees", icon: "wallet", pages: [{ href: "/family/fees", label: "Fees", icon: "wallet", hint: "Invoices and payments", keywords: "pay payment invoice money bank" }] },
  ],
  student: [
    {
      label: "Today",
      icon: "house",
      pages: [
        { href: "/student/dashboard", label: "Today", icon: "house", hint: "Your lessons and work today", keywords: "home dashboard start", short: "Today" },
        { href: "/student/actions", label: "Waiting for you", icon: "flag", hint: "Things waiting for you", keywords: "to do tasks" },
        { href: "/student/announcements", label: "Announcements", icon: "megaphone", hint: "Notices from the school", keywords: "notices news" },
        { href: "/student/messages", label: "Messages", icon: "messageSquare", hint: "Messages from your teachers", badge: "messages", keywords: "inbox class group teacher" },
      ],
    },
    {
      label: "Homework",
      icon: "listChecks",
      pages: [{ href: "/student/todo", label: "Homework", icon: "listChecks", hint: "Homework due, missing and handed in", matchPrefixes: ["/student/homework"], badge: "todo", keywords: "classwork due missing to do hand in", short: "Homework" }],
    },
    {
      label: "My classes",
      icon: "presentation",
      pages: [
        { href: "/student/classes", label: "My classes", icon: "presentation", hint: "Your classes, lessons and classwork", matchPrefixes: ["/student/class", "/student/lessons"], keywords: "lessons timetable teams join", short: "Classes" },
        { href: "/student/teachers", label: "My teachers", icon: "users", hint: "Who teaches you", keywords: "staff teacher" },
      ],
    },
    {
      label: "Revise",
      icon: "bookOpen",
      pages: [
        { href: "/student/revision", feature: "revision_packs", label: "Unit revision", icon: "target", hint: "Revise each unit and test yourself", keywords: "quiz practice test revise", short: "Revise" },
        { href: "/student/quran", label: "Qur'an and Qaidah", icon: "bookMarked", hint: "Your recitation and memorisation", keywords: "quran hifz qaidah" },
      ],
    },
    {
      label: "My progress",
      icon: "chartLine",
      pages: [
        { href: "/student/reports", label: "Reports", icon: "fileText", hint: "Your term reports", keywords: "report grades", short: "Progress" },
        { href: "/student/behaviour", label: "Merits", icon: "heartHandshake", hint: "Your merits, badges and house points", keywords: "house points badges stars" },
      ],
    },
    { label: "Calendar", icon: "calendarDays", pages: [{ href: "/student/calendar", label: "Calendar", icon: "calendarDays", hint: "Term dates and school events", keywords: "term dates holidays" }] },
  ],
};

/** Areas whose sidebar is a list of category dropdowns (staff). Families and
 * pupils get a short flat list. */
export const GROUPED_AREAS: PortalArea[] = ["admin", "teach"];
export const isGroupedArea = (area: PortalArea) => GROUPED_AREAS.includes(area);

/** The sidebar entries, built from the categories. Staff: each Home page is
 * its own entry; every other category is a hub (its pages as tabs). Families
 * and pupils: each category is a hub, or a single page. */
function buildSidebar(area: PortalArea): SidebarItem[] {
  const grouped = isGroupedArea(area);
  return NAV_CATEGORIES[area].flatMap((c): SidebarItem[] => {
    if (c.home && grouped) return c.pages.map((p) => ({ ...p, group: c.label, page: true }));
    if (c.pages.length === 1) {
      const p = c.pages[0];
      return [{ ...p, label: c.label, icon: c.icon, group: grouped ? c.label : undefined }];
    }
    return [
      {
        href: c.pages[0].href,
        label: c.label,
        icon: c.icon,
        hint: c.hint,
        group: grouped ? c.label : undefined,
        badge: c.pages.find((p) => p.badge)?.badge,
        tabs: c.pages,
      },
    ];
  });
}

export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  admin: buildSidebar("admin"),
  teach: buildSidebar("teach"),
  family: buildSidebar("family"),
  student: buildSidebar("student"),
};

/** Every hub, by area: one sidebar entry with tabs for its pages. */
export const HUBS: Record<PortalArea, SidebarItem[]> = {
  admin: SIDEBAR_NAV.admin.filter((i) => i.tabs),
  teach: SIDEBAR_NAV.teach.filter((i) => i.tabs),
  family: SIDEBAR_NAV.family.filter((i) => i.tabs),
  student: SIDEBAR_NAV.student.filter((i) => i.tabs),
};

/** The sidebar's coloured icon tiles: one hue per icon family, so the same idea keeps the same
 * colour in every area (classes teal, messages blue, safeguarding red, rewards gold...). */
const TILE_HUE: Partial<Record<SidebarIcon, string>> = {
  house: "tile-gold", houseHeart: "tile-gold", school: "tile-gold", star: "tile-gold", trophy: "tile-gold", award: "tile-gold",
  sun: "tile-amber", calendarDays: "tile-amber", calendarClock: "tile-amber", scrollText: "tile-amber", megaphone: "tile-amber", hourglass: "tile-amber",
  flag: "tile-rose", heartHandshake: "tile-rose", shieldCheck: "tile-rose", shieldAlert: "tile-rose", calendarX: "tile-rose", palette: "tile-rose",
  presentation: "tile-teal", backpack: "tile-teal", library: "tile-teal", layers: "tile-teal", layoutDashboard: "tile-teal", calculator: "tile-teal",
  messageSquare: "tile-blue", messageSquarePlus: "tile-blue", users: "tile-blue", contact: "tile-blue", idCard: "tile-blue", userRoundPlus: "tile-blue", globe: "tile-blue", monitor: "tile-blue", languages: "tile-blue", mail: "tile-blue",
  clipboardCheck: "tile-violet", listChecks: "tile-violet", notebookPen: "tile-violet", graduationCap: "tile-violet", fileText: "tile-violet", fileCheck: "tile-violet",
  bookMarked: "tile-emerald", bookOpen: "tile-emerald", moon: "tile-emerald", bookOpenCheck: "tile-emerald",
  target: "tile-green", chartLine: "tile-green", chartColumnIncreasing: "tile-green", wallet: "tile-green", flask: "tile-green", activity: "tile-green", userCheck: "tile-green", calendarCheck: "tile-green", clock: "tile-green",
};
export const tileFor = (icon: SidebarIcon): string => TILE_HUE[icon] || "tile-slate";

export const dashboardPathForArea = (area: PortalArea): string => `/${area}/dashboard`;

function isHeadRole(roles: string[]): boolean {
  return roles.some((r) => r === "head_teacher" || r === "admin");
}

/** A SENCo account with no teaching or office role: in the Teaching area it
 * sees only the pages marked `senco` (the SEND register and the handbook). */
export function isSencoOnly(roles: string[]): boolean {
  return roles.includes("senco") && !roles.some((r) => ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"].includes(r));
}

/** How well a route matches the current path: the href's length for the page
 * or a sub-page, 1 for a matchPrefix, 0 for no match. Longest wins. */
function matchScore(p: string, href: string, prefixes?: string[]): number {
  if (isActivePath(p, href)) return href.length + 1;
  return underPrefix(p, prefixes) ? 1 : 0;
}

function itemScore(p: string, item: SidebarItem): number {
  const own = matchScore(p, item.href, item.matchPrefixes);
  const tabs = (item.tabs || []).map((t) => matchScore(p, t.href, t.matchPrefixes));
  return Math.max(own, ...tabs);
}

/** The sidebar item a page belongs to (its own route, a sub-page, a hub tab
 * or a matchPrefix), plus the hub tab it is on, if any, used by PageHeader
 * for the icon tile and breadcrumb. */
export function navItemFor(pathname: string): { item: SidebarItem; tab: HubTab | null; area: PortalArea } | null {
  const area = portalAreaFor(pathname);
  if (!area) return null;
  const p = normalisePortalPath(pathname);
  let best: SidebarItem | null = null;
  let bestScore = 0;
  for (const i of SIDEBAR_NAV[area]) {
    const s = itemScore(p, i);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  if (!best) return null;
  return { item: best, tab: activeTab(p, best.tabs || []), area };
}

function activeTab(p: string, tabs: HubTab[]): HubTab | null {
  let best: HubTab | null = null;
  let bestScore = 0;
  for (const t of tabs) {
    const s = matchScore(p, t.href, t.matchPrefixes);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return best;
}

/** Is this sidebar item the current page (own route, sub-page, a hub tab or any matchPrefix)?
 * A single-page row (`page`) is lit only when it is the best-matching page. */
export function isSidebarItemActive(pathname: string, item: SidebarItem): boolean {
  if (item.page) return navPageFor(pathname)?.href === item.href;
  const p = normalisePortalPath(pathname);
  return itemScore(p, item) > 0 && navItemFor(pathname)?.item.href === (item.id || item.href);
}

export type NavPage = HubTab & { icon: SidebarIcon; category: string };

/** Every page of an area, in menu order, with the category it is in. */
export function allPages(area: PortalArea): NavPage[] {
  return NAV_CATEGORIES[area].flatMap((c) => c.pages.map((p) => ({ ...p, category: c.label })));
}

/** The menu page the current address belongs to (the most specific match). */
export function navPageFor(pathname: string, fallbackArea?: PortalArea | null): NavPage | null {
  const p = normalisePortalPath(pathname);
  const area = portalAreaFor(pathname) || fallbackArea;
  const pages = area ? allPages(area) : [];
  let best: NavPage | null = null;
  let bestScore = 0;
  for (const pg of pages) {
    const s = matchScore(p, pg.href, pg.matchPrefixes);
    if (s > bestScore) {
      best = pg;
      bestScore = s;
    }
  }
  return best;
}

/** Is this page's School feature switched off? Pages with no feature are always on. */
export const featureOff = (features: Partial<FeatureMap> | undefined, key: FeatureKey | undefined): boolean => !!key && features?.[key] === false;

/** Every page (in any area) hidden by a switched-off School feature. */
export function hiddenFeatureHrefs(features: Partial<FeatureMap> | undefined): string[] {
  return (Object.keys(NAV_CATEGORIES) as PortalArea[]).flatMap((a) => allPages(a).filter((p) => featureOff(features, p.feature)).map((p) => p.href));
}

/** Words in the Portal guide about a switched-off feature (lines in other pages' entries). */
const FEATURE_WORDS: Partial<Record<FeatureKey, RegExp>> = {
  revision_packs: /revision pack/i,
  house_points: /house points? (leaderboard|table)/i,
  lesson_feedback: /leave feedback on a lesson|lesson feedback/i,
};

/** What the Portal guide leaves out with these switches (see filterGuide in the guide content). */
export function guideFilterFor(features: Partial<FeatureMap> | undefined): { hiddenHrefs: string[]; dropText: RegExp[]; journeys: boolean } {
  return {
    hiddenHrefs: hiddenFeatureHrefs(features),
    dropText: (Object.keys(FEATURE_WORDS) as FeatureKey[]).filter((k) => featureOff(features, k)).map((k) => FEATURE_WORDS[k]!),
    journeys: !featureOff(features, "guide_journeys"),
  };
}

/** The area's sidebar items this user can open: headOnly pages removed, each
 * hub cut down to the tabs they can open (and pointing at the first one), and
 * a hub left with no tabs dropped. */
export function visibleSidebar(area: PortalArea, roles: string[], features?: Partial<FeatureMap>): SidebarItem[] {
  const isHead = isHeadRole(roles);
  const sencoOnly = area === "teach" && isSencoOnly(roles);
  const out: SidebarItem[] = [];
  for (const i of SIDEBAR_NAV[area]) {
    if (i.headOnly && !isHead) continue;
    if (featureOff(features, i.feature)) continue;
    if (!i.tabs) {
      if (!sencoOnly || i.senco) out.push(i);
      continue;
    }
    const tabs = i.tabs.filter((t) => (isHead || !t.headOnly) && (!sencoOnly || t.senco || i.senco) && !featureOff(features, t.feature));
    if (tabs.length === 0) continue;
    // A hub with one page left for this user is just that page. If that page
    // is the hub's own first page, it keeps the hub's name ("Today", not "Overview").
    const own = tabs.length === 1 && tabs[0].href === i.href;
    if (tabs.length === 1) out.push({ ...i, id: i.href, href: tabs[0].href, label: own ? i.label : tabs[0].label, icon: own ? i.icon : tabs[0].icon || i.icon, hint: tabs[0].hint, badge: tabs[0].badge, tabs });
    else out.push({ ...i, id: i.href, href: tabs[0].href, tabs });
  }
  return out;
}

export type PortalPage = { href: string; label: string; hint?: string; parent?: string; icon: SidebarIcon; keywords?: string };

/** Pages one level below a menu page (a section's own steps). The menu doesn't
 * list them, but search and the Site administration index do, so "subjects"
 * or "availability" finds them. Keyed by the parent's href. */
export const SUB_PAGES: Record<string, PortalNavItem[]> = {
  "/admin/lessons": [
    { href: "/admin/lessons/timetable", label: "Weekly timetable", hint: "Move, edit, print and publish the timetable" },
    { href: "/admin/lessons/availability", label: "Teacher availability", hint: "When each teacher can teach" },
    { href: "/admin/lessons/day", label: "School day", hint: "Lesson periods, protected breaks and sessions" },
    { href: "/admin/lessons/list", label: "Upcoming lessons", hint: "Dated lessons, join links and cover" },
  ],
  "/admin/academic": [
    { href: "/admin/academic/years", label: "Years and terms", hint: "Academic years and their term dates" },
    { href: "/admin/academic/year-groups", label: "Year groups", hint: "The year groups pupils are placed in" },
    { href: "/admin/academic/subjects", label: "Subjects", hint: "Everything the school teaches" },
    { href: "/admin/academic/classes", label: "Classes and teachers", hint: "Create classes, enrol pupils, choose teachers" },
  ],
};

/** Every page this user can open in an area, one row per page (hub tabs
 * included, with the category as `parent`, and their sub-pages): the command
 * palette lists these. */
export function visiblePages(area: PortalArea, roles: string[], features?: Partial<FeatureMap>): PortalPage[] {
  const pages: PortalPage[] = visibleSidebar(area, roles, features).flatMap((i): PortalPage[] =>
    i.tabs && i.tabs.length > 1
      ? i.tabs.flatMap((t): PortalPage[] => [
          { href: t.href, label: t.label, hint: t.hint, parent: i.label === t.label ? undefined : i.label, icon: t.icon || i.icon, keywords: t.keywords },
          ...(SUB_PAGES[t.href] || []).map((sp) => ({ href: sp.href, label: sp.label, hint: sp.hint, parent: t.label, icon: t.icon || i.icon })),
        ])
      : [
          { href: i.href, label: i.label, hint: i.hint || i.tabs?.[0]?.hint, parent: i.page && i.group !== "Home" ? i.group : undefined, icon: i.icon, keywords: i.keywords || i.tabs?.[0]?.keywords },
          ...(SUB_PAGES[i.href] || []).map((sp) => ({ href: sp.href, label: sp.label, hint: sp.hint, parent: i.label, icon: i.icon })),
        ],
  );
  // The index of every admin page is not in the menu itself (its footer links to it).
  if (area === "admin") pages.push({ href: ADMIN_INDEX_HREF, label: "Site administration", hint: "Every admin page in one searchable list", icon: "layoutGrid", keywords: "all admin pages index" });
  return pages;
}

/** Site administration: every admin page in one searchable list. */
export const ADMIN_INDEX_HREF = "/admin/site";

/** The hub the current page is in, when it has two or more tabs this user can
 * open (the pages the sidebar lists together). */
export function hubFor(pathname: string, roles: string[], features?: Partial<FeatureMap>): { item: SidebarItem; tabs: HubTab[]; active: HubTab | null } | null {
  const area = portalAreaFor(pathname);
  if (!area) return null;
  const found = navItemFor(pathname);
  if (!found?.item.tabs) return null;
  const item = visibleSidebar(area, roles, features).find((i) => i.id === found.item.href);
  // Only pages in this area belong in the strip (Report a concern lives outside it).
  const tabs = (item?.tabs || []).filter((t) => portalAreaFor(t.href) === area);
  if (!item || tabs.length < 2) return null;
  // Only on the hub's own pages: a single class page (a matchPrefix of the
  // classes hub) has its own tabs and doesn't repeat the hub's.
  const p = normalisePortalPath(pathname);
  // The most specific tab wins (Timetable at /admin/lessons, "Make the timetable" at /admin/lessons/generate).
  const active = activeTab(p, tabs);
  if (!active) return null;
  return { item, tabs, active };
}

/** Site administration (/admin/site): every admin page by category, built from the menu. */
export function visibleAdminSections(roles: string[], features?: Partial<FeatureMap>): PortalNavGroup[] {
  const groups = new Map<string, PortalNavItem[]>();
  for (const i of visibleSidebar("admin", roles, features)) {
    if (!i.group) continue;
    const list = groups.get(i.group) || [];
    if (i.tabs) list.push(...i.tabs.map((t) => ({ href: t.href, label: t.label, hint: t.hint })));
    else list.push({ href: i.href, label: i.label, hint: i.hint });
    groups.set(i.group, list);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/** One row of the sidebar: a plain link, or a category that opens in place. */
export type SidebarEntry = { kind: "link"; item: SidebarItem } | { kind: "section"; section: SidebarGroup };

/** The sidebar layout. Families and pupils: one link per entry, in the order
 * written above. Staff: the Home pages as plain links at the top, then one
 * dropdown per category holding its pages as rows. */
export function sidebarLayout(area: PortalArea, roles: string[], features?: Partial<FeatureMap>): SidebarEntry[] {
  const items = visibleSidebar(area, roles, features);
  if (!isGroupedArea(area)) return items.map((item) => ({ kind: "link", item }));
  return items.map((item): SidebarEntry => {
    if (item.page) return { kind: "link", item };
    const pages: SidebarItem[] = (item.tabs || [item]).map((t) => ({ href: t.href, label: t.label, hint: t.hint, icon: t.icon || item.icon, badge: t.badge, matchPrefixes: t.matchPrefixes, keywords: t.keywords, group: item.group, page: true }));
    return { kind: "section", section: { label: item.group || item.label, icon: item.icon, items: pages } };
  });
}

export const AREA_SUBTITLE: Record<PortalArea, string> = {
  admin: "School administration",
  teach: "Teacher portal",
  family: "Parent portal",
  student: "Student portal",
};

/** The places each kind of user goes most, in priority order: the phone tab
 * bar shows the first four this user can open (see mobileTabsFor). Each is a
 * page's href. Extra entries are fallbacks for roles that can't open the
 * earlier ones (admissions staff, a SENCo). */
export const MOBILE_TABS: Record<PortalArea, string[]> = {
  student: ["/student/dashboard", "/student/todo", "/student/classes", "/student/revision"],
  family: ["/family/dashboard", "/family/todo", "/family/messages", "/family/classes"],
  teach: ["/teach/dashboard", "/teach/classes", "/teach/review", "/teach/messages", "/teach/send", "/teach/handbook"],
  admin: ["/admin/dashboard", "/admin/messages", "/admin/pupils", "/admin/classes", "/admin/admissions", "/admin/calendar", "/admin/people", "/admin/open-evening"],
};

/** The (at most four) entries in this user's phone tab bar. Staff get single
 * pages (lit only on that page, or its own sub-pages); families and pupils get
 * their hubs, lit on any of the hub's pages. Labels are the short names. */
export function mobileTabsFor(area: PortalArea, roles: string[], features?: Partial<FeatureMap>): SidebarItem[] {
  const visible = visibleSidebar(area, roles, features);
  const grouped = isGroupedArea(area);
  const out: SidebarItem[] = [];
  for (const href of MOBILE_TABS[area]) {
    const item = visible.find((i) => itemHasHref(i, href));
    if (!item) continue;
    const tab = item.tabs?.find((t) => t.href === href);
    const entry: SidebarItem =
      grouped && tab && (item.tabs?.length || 0) > 1
        ? { href: tab.href, label: tab.short || tab.label, icon: tab.icon || item.icon, badge: tab.badge, matchPrefixes: tab.matchPrefixes, page: true }
        : { ...item, label: tab?.short || item.short || item.label };
    if (!out.some((o) => o.href === entry.href)) out.push(entry);
    if (out.length === 4) break;
  }
  return out;
}

/** Does this sidebar entry stand for the given href (its own, or one of its tabs)? */
export function itemHasHref(item: SidebarItem, href: string): boolean {
  return item.href === href || !!item.tabs?.some((t) => t.href === href);
}
