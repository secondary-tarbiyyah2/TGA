// One place for every /learn area's navigation. The sidebar
// (PortalSidebar, SIDEBAR_NAV below) is the ONLY navigation: there is no
// top tab strip, so no destination is listed twice.

export type PortalArea = "admin" | "teach" | "family" | "student";
// headOnly: the page's LearnGate only admits head_teacher/admin, so the
// tab is hidden from admissions staff rather than leading to a refusal.
export type PortalNavItem = { href: string; label: string; hint?: string; headOnly?: boolean };
export type PortalNavGroup = { label: string; items: PortalNavItem[] };

/** Every admin tool, grouped like Moodle's Site administration tabs. */
export const ADMIN_SECTIONS: PortalNavGroup[] = [
    {
      label: "Users",
      items: [
        { href: "/admin/admissions", label: "Admissions", hint: "Applications, calls and availability" },
        { href: "/admin/people", label: "People & roles", hint: "Families, students and staff" },
        { href: "/admin/staff", label: "Staff profiles", hint: "Teacher profiles and compliance dates", headOnly: true },
      ],
    },
    {
      label: "Teaching",
      items: [
        { href: "/admin/academic", label: "Academic", hint: "Year groups, classes, subjects" },
        { href: "/admin/lessons", label: "Lessons", hint: "Live lessons and recordings", headOnly: true },
        { href: "/admin/attendance", label: "Attendance", hint: "Registers and absences", headOnly: true },
        { href: "/admin/staff-attendance", label: "Staff attendance", hint: "Clock-ins, hours and late arrivals", headOnly: true },
        { href: "/admin/enrichment", label: "Enrichment attendance", hint: "Who joined each supervised block", headOnly: true },
        { href: "/admin/reports", label: "Reports", hint: "Term reports", headOnly: true },
        { href: "/admin/gcse", label: "GCSE progress", hint: "Predicted vs actual grades, Years 10-11", headOnly: true },
        { href: "/admin/parent-evenings", label: "Parent evenings", hint: "Create evenings, open booking, see bookings", headOnly: true },
        { href: "/admin/rewards", label: "Houses & stars", hint: "House points, bonus points and Star of the Week", headOnly: true },
        { href: "/admin/digest", label: "Weekly digest", hint: "Friday parent email: preview and test", headOnly: true },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/admin/fees", label: "Fees", hint: "Invoices and payment status", headOnly: true },
        { href: "/admin/documents", label: "Documents", hint: "Policies and signatures", headOnly: true },
      ],
    },
    {
      label: "Website",
      items: [
        { href: "/admin/content", label: "Website content", hint: "Pages on the public site" },
        { href: "/admin/quiz", label: "Quiz & sample weeks", hint: "Eligibility quiz and timetables", headOnly: true },
        { href: "/admin/open-evening", label: "Open evenings", hint: "Sessions, bookings and attendee lists" },
      ],
    },
    {
      label: "Compliance",
      items: [
        { href: "/admin/compliance", label: "Compliance", hint: "Safeguarding, audit and retention" },
        { href: "/admin/audit-log", label: "Audit log", hint: "Who changed what, with filters and CSV export", headOnly: true },
        { href: "/admin/data-protection", label: "Data protection", hint: "Retention rules and subject access exports", headOnly: true },
        { href: "/admin/settings", label: "School settings", hint: "Bursary seats and site options" },
      ],
    },
];

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
  // Every admin tool page sits under "Site administration".
  if (href === "/admin/site" && /^\/admin\//.test(p) && !/^\/admin\/(dashboard|classes|class|messages)(\/|$)/.test(p)) return true;
  return p === href || p.startsWith(href + "/");
}

/** Site administration sections with anything the user can't open removed. */
export function visibleAdminSections(roles: string[]): PortalNavGroup[] {
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  return ADMIN_SECTIONS.map((g) => ({ ...g, items: g.items.filter((i) => isHead || !i.headOnly) })).filter((g) => g.items.length > 0);
}

// ── Sidebar (Ihsan-style) ───────────────────────────────────────────
// The portal's main navigation: one flat list of icon links per area,
// always visible down the left, so nothing is hidden inside a dropdown.
export type SidebarIcon =
  | "overview"
  | "today"
  | "calendar"
  | "classes"
  | "admissions"
  | "people"
  | "attendance"
  | "lessons"
  | "academic"
  | "reports"
  | "messages"
  | "fees"
  | "documents"
  | "compliance"
  | "website"
  | "quiz"
  | "settings"
  | "homework"
  | "grades"
  | "clock"
  | "announcements"
  | "behaviour"
  | "absences"
  | "summary";

// `group` is the collapsible heading the item sits under in the sidebar.
// Areas whose items have no group render as one flat list.
// `group` is the collapsible heading the item sits under in the sidebar.
// Items with no `group` render first, as an unlabelled flat list.
// `matchPrefixes` lets one item stay highlighted across several routes
// (e.g. a single class page keeps "My classes" highlighted).
export type SidebarItem = { href: string; label: string; icon: SidebarIcon; headOnly?: boolean; group?: string; matchPrefixes?: string[] };
export type SidebarGroup = { label: string; items: SidebarItem[] };

const G_CLASSROOM = "Classroom";
const G_PROGRESS = "Progress";
const G_PUPIL_WORK = "Pupils & progress";
const G_CALENDAR = "Calendar & timetable";
const G_PEOPLE = "People & attendance";
const G_COMMS = "Communication";
const G_FINANCE = "Admin & settings";
const G_STAFF = "My staff area";
const G_SCHOOL = "School";
const G_FAMILY = "My family";

/** Display order of the sidebar groups (unlabelled "Home" items come first). */
export const SIDEBAR_GROUP_ORDER: string[] = [
  "",
  G_CLASSROOM,
  G_PUPIL_WORK,
  G_PROGRESS,
  G_CALENDAR,
  G_COMMS,
  G_SCHOOL,
  G_PEOPLE,
  G_FINANCE,
  G_FAMILY,
  G_STAFF,
];

// Each destination appears exactly once per area, and every area has at
// most 7 top-level entries (unlabelled items + collapsible groups):
//   admin   Home + Classroom, Pupils & progress, Calendar, Communication,
//           People & attendance, Admin & settings (see below)
//   teach   Home, Today + Classroom, Pupils & progress, Calendar,
//           Communication, My staff area
// Admin groups are collapsed by default (see PortalSidebar), except the
// one holding the current page.
export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  // Admin: seven top-level entries (Home + six groups). "Classroom" and
  // "Pupils & progress" together cover class, homework, behaviour and reports.
  admin: [
    { href: "/admin/dashboard", label: "Home", icon: "overview" },
    { href: "/admin/classes", label: "Classes", icon: "classes", headOnly: true, group: G_CLASSROOM, matchPrefixes: ["/admin/class"] },
    { href: "/admin/homework", label: "Homework", icon: "homework", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/curriculum", label: "Lesson library", icon: "academic", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/academic", label: "Academic setup", icon: "academic", group: G_CLASSROOM },
    { href: "/admin/lessons", label: "Timetable & lessons", icon: "lessons", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/summary", label: "Summary", icon: "summary", headOnly: true, group: G_PUPIL_WORK },
    { href: "/admin/behaviour", label: "Behaviour", icon: "behaviour", headOnly: true, group: G_PUPIL_WORK },
    { href: "/admin/rewards", label: "Houses & stars", icon: "behaviour", headOnly: true, group: G_PUPIL_WORK },
    { href: "/admin/reports", label: "Reports", icon: "reports", headOnly: true, group: G_PUPIL_WORK },
    { href: "/admin/gcse", label: "GCSE progress", icon: "grades", headOnly: true, group: G_PUPIL_WORK },
    { href: "/admin/calendar", label: "Calendar", icon: "calendar", group: G_CALENDAR },
    { href: "/admin/parent-evenings", label: "Parent evenings", icon: "calendar", headOnly: true, group: G_CALENDAR },
    { href: "/admin/open-evening", label: "Open evenings", icon: "calendar", group: G_CALENDAR },
    { href: "/admin/messages", label: "Messages", icon: "messages", headOnly: true, group: G_COMMS },
    { href: "/admin/message-oversight", label: "Message oversight", icon: "compliance", headOnly: true, group: G_COMMS },
    { href: "/admin/announcements", label: "Announcements", icon: "announcements", headOnly: true, group: G_COMMS },
    { href: "/admin/digest", label: "Weekly digest", icon: "messages", headOnly: true, group: G_COMMS },
    { href: "/admin/admissions", label: "Admissions", icon: "admissions", group: G_PEOPLE },
    { href: "/admin/people", label: "People & accounts", icon: "people", group: G_PEOPLE },
    { href: "/admin/pupils", label: "Pupil records", icon: "documents", group: G_PEOPLE },
    { href: "/admin/staff", label: "Staff profiles", icon: "people", headOnly: true, group: G_PEOPLE },
    { href: "/admin/attendance", label: "Attendance", icon: "attendance", headOnly: true, group: G_PEOPLE },
    { href: "/admin/absences", label: "Absences", icon: "absences", headOnly: true, group: G_PEOPLE },
    { href: "/admin/staff-attendance", label: "Staff attendance", icon: "clock", headOnly: true, group: G_PEOPLE },
    { href: "/admin/enrichment", label: "Enrichment attendance", icon: "attendance", headOnly: true, group: G_PEOPLE },
    { href: "/admin/fees", label: "Fees", icon: "fees", headOnly: true, group: G_FINANCE },
    { href: "/admin/documents", label: "Documents & signatures", icon: "documents", headOnly: true, group: G_FINANCE },
    { href: "/admin/compliance", label: "Safeguarding & compliance", icon: "compliance", group: G_FINANCE },
    { href: "/admin/audit-log", label: "Audit log", icon: "compliance", headOnly: true, group: G_FINANCE },
    { href: "/admin/data-protection", label: "Data protection", icon: "compliance", headOnly: true, group: G_FINANCE },
    { href: "/admin/content", label: "Website content", icon: "website", group: G_FINANCE },
    { href: "/admin/quiz", label: "Quiz & sample weeks", icon: "quiz", headOnly: true, group: G_FINANCE },
    { href: "/admin/settings", label: "Settings", icon: "settings", group: G_FINANCE },
  ],
  // Teacher/family/student: the sidebar is the ONLY place destinations are
  // listed (there is no second tab strip), so each appears exactly once. A
  // class's own sections (Stream, Classwork, People, Grades) are in-page
  // tabs on the class page itself.
  teach: [
    { href: "/teach/dashboard", label: "Home", icon: "overview" },
    { href: "/teach/today", label: "Today", icon: "today", matchPrefixes: ["/teach/enrichment"] },
    { href: "/teach/classes", label: "My classes", icon: "classes", group: G_CLASSROOM, matchPrefixes: ["/teach/class", "/teach/lessons"] },
    { href: "/teach/curriculum", label: "Lesson library", icon: "academic", group: G_CLASSROOM },
    { href: "/teach/homework", label: "Homework", icon: "homework", group: G_CLASSROOM },
    { href: "/teach/review", label: "To review", icon: "attendance", group: G_CLASSROOM },
    { href: "/teach/assessment", label: "Assessment & grades", icon: "grades", group: G_CLASSROOM },
    { href: "/teach/pupils", label: "Pupils", icon: "people", group: G_PUPIL_WORK },
    { href: "/teach/behaviour", label: "Behaviour", icon: "behaviour", group: G_PUPIL_WORK },
    { href: "/teach/stars", label: "Houses & stars", icon: "behaviour", group: G_PUPIL_WORK },
    { href: "/teach/reports", label: "Reports", icon: "reports", group: G_PUPIL_WORK },
    { href: "/teach/calendar", label: "Calendar", icon: "calendar", group: G_CALENDAR },
    { href: "/teach/parent-evenings", label: "Parent evenings", icon: "calendar", group: G_CALENDAR },
    { href: "/teach/messages", label: "Messages", icon: "messages", group: G_COMMS },
    { href: "/teach/announcements", label: "Announcements", icon: "announcements", group: G_COMMS },
    { href: "/teach/profile", label: "My profile", icon: "people", group: G_STAFF },
    { href: "/teach/clock", label: "My hours", icon: "clock", group: G_STAFF },
    { href: "/teach/absences", label: "Absences", icon: "absences", group: G_STAFF },
  ],
  // Family: Home + Classroom, Progress, Calendar, Communication, My family.
  family: [
    { href: "/family/dashboard", label: "Home", icon: "overview" },
    { href: "/family/classes", label: "My classes", icon: "classes", group: G_CLASSROOM, matchPrefixes: ["/family/class", "/family/lessons"] },
    { href: "/family/todo", label: "To do", icon: "homework", group: G_CLASSROOM, matchPrefixes: ["/family/homework"] },
    { href: "/family/behaviour", label: "Behaviour", icon: "behaviour", group: G_PROGRESS },
    { href: "/family/reports", label: "Reports", icon: "reports", group: G_PROGRESS },
    { href: "/family/calendar", label: "Calendar", icon: "calendar", group: G_CALENDAR },
    { href: "/family/parent-evenings", label: "Parent evenings", icon: "calendar", group: G_CALENDAR },
    { href: "/family/messages", label: "Messages", icon: "messages", group: G_COMMS },
    { href: "/family/announcements", label: "Announcements", icon: "announcements", group: G_COMMS },
    { href: "/family/teachers", label: "Meet the teachers", icon: "people", group: G_FAMILY },
    { href: "/family/absences", label: "Absences", icon: "absences", group: G_FAMILY },
    { href: "/family/child-details", label: "Child details", icon: "documents", group: G_FAMILY },
    { href: "/family/fees", label: "Fees", icon: "fees", group: G_FAMILY },
  ],
  student: [
    { href: "/student/dashboard", label: "Home", icon: "overview" },
    { href: "/student/classes", label: "My classes", icon: "classes", group: G_CLASSROOM, matchPrefixes: ["/student/class", "/student/lessons"] },
    { href: "/student/todo", label: "To do", icon: "homework", group: G_CLASSROOM, matchPrefixes: ["/student/homework"] },
    { href: "/student/behaviour", label: "Behaviour", icon: "behaviour", group: G_PROGRESS },
    { href: "/student/reports", label: "Reports", icon: "reports", group: G_PROGRESS },
    { href: "/student/calendar", label: "Calendar", icon: "calendar", group: G_CALENDAR },
    { href: "/student/announcements", label: "Announcements", icon: "announcements", group: G_SCHOOL },
    { href: "/student/teachers", label: "My teachers", icon: "people", group: G_SCHOOL },
  ],
};

/** Is this sidebar item the current page (own route, sub-page or any matchPrefix)? */
export function isSidebarItemActive(pathname: string, item: SidebarItem): boolean {
  if (isActivePath(pathname, item.href)) return true;
  const p = normalisePortalPath(pathname);
  return !!item.matchPrefixes?.some((m) => p === m || p.startsWith(m + "/"));
}

export function visibleSidebar(area: PortalArea, roles: string[]): SidebarItem[] {
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  return SIDEBAR_NAV[area].filter((i) => isHead || !i.headOnly);
}

/** The sidebar as collapsible groups (visibility rules applied). Items with
 * no `group` land in one unlabelled group, so flat areas still work. Empty
 * groups are dropped. Use visibleSidebar() when a flat list is needed. */
export function visibleSidebarGroups(area: PortalArea, roles: string[]): SidebarGroup[] {
  const items = visibleSidebar(area, roles);
  const labels = [...new Set(items.map((i) => i.group || ""))];
  labels.sort((a, b) => {
    const ia = SIDEBAR_GROUP_ORDER.indexOf(a);
    const ib = SIDEBAR_GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return labels.map((label) => ({ label, items: items.filter((i) => (i.group || "") === label) }));
}

export const AREA_SUBTITLE: Record<PortalArea, string> = {
  admin: "School administration",
  teach: "Teacher portal",
  family: "Parent portal",
  student: "Student portal",
};
