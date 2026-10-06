// One place for every /learn area's primary navigation. The shared portal
// header (src/app/learn/layout.tsx → PortalNav) reads this, so admin,
// teach, family and student all get the same Moodle-style top bar instead
// of each area drawing its own second nav strip inside the page.
//
// A group with one item is a plain tab. A group with several items opens
// as a dropdown.

export type PortalArea = "admin" | "teach" | "family" | "student";
// headOnly: the page's LearnGate only admits head_teacher/admin, so the
// tab is hidden from admissions staff rather than leading to a refusal.
export type PortalNavItem = { href: string; label: string; hint?: string; headOnly?: boolean };
export type PortalNavGroup = { label: string; items: PortalNavItem[] };

export const PORTAL_NAV: Record<PortalArea, PortalNavGroup[]> = {
  // Moodle-style: a handful of primary tabs, with every admin tool
  // collected on one "Site administration" page (ADMIN_SECTIONS below).
  admin: [
    { label: "Dashboard", items: [{ href: "/admin/dashboard", label: "Dashboard" }] },
    { label: "Classes", items: [{ href: "/admin/classes", label: "Classes" }] },
    { label: "Messages", items: [{ href: "/admin/messages", label: "Messages", headOnly: true }] },
    { label: "Site administration", items: [{ href: "/admin/site", label: "Site administration" }] },
  ],
  teach: [
    { label: "Dashboard", items: [{ href: "/teach/dashboard", label: "Dashboard" }] },
    { label: "My classes", items: [{ href: "/teach/classes", label: "My classes" }] },
    { label: "Homework", items: [{ href: "/teach/homework", label: "Homework" }] },
    { label: "Assessment", items: [{ href: "/teach/assessment", label: "Assessment" }] },
    { label: "Reports", items: [{ href: "/teach/reports", label: "Reports" }] },
    { label: "Messages", items: [{ href: "/teach/messages", label: "Messages" }] },
  ],
  family: [
    { label: "Dashboard", items: [{ href: "/family/dashboard", label: "Dashboard" }] },
    { label: "My classes", items: [{ href: "/family/classes", label: "My classes" }] },
    { label: "Homework", items: [{ href: "/family/homework", label: "Homework" }] },
    { label: "Reports", items: [{ href: "/family/reports", label: "Reports" }] },
    { label: "Messages", items: [{ href: "/family/messages", label: "Messages" }] },
  ],
  student: [
    { label: "Dashboard", items: [{ href: "/student/dashboard", label: "Dashboard" }] },
    { label: "My classes", items: [{ href: "/student/classes", label: "My classes" }] },
    { label: "Homework", items: [{ href: "/student/homework", label: "Homework" }] },
    { label: "Reports", items: [{ href: "/student/reports", label: "Reports" }] },
  ],
};

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

/** The area's nav with anything the signed-in user can't open removed. */
export function visiblePortalNav(area: PortalArea, roles: string[]): PortalNavGroup[] {
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  return PORTAL_NAV[area]
    .map((g) => ({ ...g, items: g.items.filter((i) => isHead || !i.headOnly) }))
    .filter((g) => g.items.length > 0);
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

const G_OVERVIEW = "Overview";
const G_PEOPLE = "People & admissions";
const G_CLASSROOM = "Classroom";
const G_ATTENDANCE = "Attendance";
const G_COMMS = "Communication";
const G_FINANCE = "Finance & compliance";
const G_SETTINGS = "Settings";
const G_STAFF = "Staff";

/** Display order of the sidebar groups (unlabelled items come first). */
export const SIDEBAR_GROUP_ORDER: string[] = ["", G_OVERVIEW, G_PEOPLE, G_CLASSROOM, G_ATTENDANCE, G_COMMS, G_FINANCE, G_SETTINGS, G_STAFF];

export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Overview", icon: "overview", group: G_OVERVIEW },
    { href: "/admin/summary", label: "Summary", icon: "summary", headOnly: true, group: G_OVERVIEW },
    { href: "/admin/calendar", label: "Calendar", icon: "calendar", group: G_OVERVIEW },
    { href: "/admin/admissions", label: "Admissions", icon: "admissions", group: G_PEOPLE },
    { href: "/admin/people", label: "People & accounts", icon: "people", group: G_PEOPLE },
    { href: "/admin/pupils", label: "Pupil records", icon: "documents", group: G_PEOPLE },
    { href: "/admin/staff", label: "Staff profiles", icon: "people", headOnly: true, group: G_PEOPLE },
    { href: "/admin/classes", label: "Classes", icon: "classes", headOnly: true, group: G_CLASSROOM, matchPrefixes: ["/admin/class"] },
    { href: "/admin/homework", label: "Homework", icon: "homework", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/gcse", label: "GCSE progress", icon: "grades", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/behaviour", label: "Behaviour", icon: "behaviour", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/rewards", label: "Houses & stars", icon: "behaviour", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/lessons", label: "Timetable & lessons", icon: "lessons", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/academic", label: "Academic setup", icon: "academic", group: G_CLASSROOM },
    { href: "/admin/reports", label: "Reports", icon: "reports", headOnly: true, group: G_CLASSROOM },
    { href: "/admin/attendance", label: "Attendance", icon: "attendance", headOnly: true, group: G_ATTENDANCE },
    { href: "/admin/absences", label: "Absences", icon: "absences", headOnly: true, group: G_ATTENDANCE },
    { href: "/admin/staff-attendance", label: "Staff attendance", icon: "clock", headOnly: true, group: G_ATTENDANCE },
    { href: "/admin/messages", label: "Messages", icon: "messages", headOnly: true, group: G_COMMS },
    { href: "/admin/message-oversight", label: "Message oversight", icon: "compliance", headOnly: true, group: G_COMMS },
    { href: "/admin/announcements", label: "Announcements", icon: "announcements", headOnly: true, group: G_COMMS },
    { href: "/admin/parent-evenings", label: "Parent evenings", icon: "calendar", headOnly: true, group: G_COMMS },
    { href: "/admin/digest", label: "Weekly digest", icon: "messages", headOnly: true, group: G_COMMS },
    { href: "/admin/fees", label: "Fees", icon: "fees", headOnly: true, group: G_FINANCE },
    { href: "/admin/documents", label: "Documents & signatures", icon: "documents", headOnly: true, group: G_FINANCE },
    { href: "/admin/compliance", label: "Safeguarding & compliance", icon: "compliance", group: G_FINANCE },
    { href: "/admin/audit-log", label: "Audit log", icon: "compliance", headOnly: true, group: G_FINANCE },
    { href: "/admin/data-protection", label: "Data protection", icon: "compliance", headOnly: true, group: G_FINANCE },
    { href: "/admin/content", label: "Website content", icon: "website", group: G_SETTINGS },
    { href: "/admin/quiz", label: "Quiz & sample weeks", icon: "quiz", headOnly: true, group: G_SETTINGS },
    { href: "/admin/open-evening", label: "Open evenings", icon: "calendar", group: G_SETTINGS },
    { href: "/admin/settings", label: "Settings", icon: "settings", group: G_SETTINGS },
  ],
  // Teacher/family/student: one flat list. The sidebar is the ONLY place
  // classroom destinations are listed (there is no second tab strip), so
  // each destination appears exactly once. A class's own sections (Stream,
  // Classwork, People, Grades) are in-page tabs on the class page itself.
  teach: [
    { href: "/teach/dashboard", label: "Overview", icon: "overview" },
    { href: "/teach/today", label: "Today", icon: "today" },
    { href: "/teach/classes", label: "My classes", icon: "classes", matchPrefixes: ["/teach/class", "/teach/lessons"] },
    { href: "/teach/review", label: "To review", icon: "attendance" },
    { href: "/teach/homework", label: "Homework", icon: "homework" },
    { href: "/teach/assessment", label: "Assessment & grades", icon: "grades" },
    { href: "/teach/behaviour", label: "Behaviour", icon: "behaviour" },
    { href: "/teach/pupils", label: "Pupils", icon: "people" },
    { href: "/teach/calendar", label: "Calendar", icon: "calendar" },
    { href: "/teach/parent-evenings", label: "Parent evenings", icon: "calendar" },
    { href: "/teach/messages", label: "Messages", icon: "messages" },
    { href: "/teach/reports", label: "Reports", icon: "reports" },
    { href: "/teach/stars", label: "Star of the week", icon: "behaviour" },
    { href: "/teach/profile", label: "My profile", icon: "people", group: G_STAFF },
    { href: "/teach/clock", label: "My hours", icon: "clock", group: G_STAFF },
    { href: "/teach/absences", label: "Absences", icon: "absences", group: G_STAFF },
    { href: "/teach/announcements", label: "Announcements", icon: "announcements", group: G_STAFF },
  ],
  family: [
    { href: "/family/dashboard", label: "Overview", icon: "overview" },
    { href: "/family/classes", label: "My classes", icon: "classes", matchPrefixes: ["/family/class", "/family/lessons"] },
    { href: "/family/todo", label: "To do", icon: "homework", matchPrefixes: ["/family/homework"] },
    { href: "/family/behaviour", label: "Behaviour", icon: "behaviour" },
    { href: "/family/reports", label: "Reports", icon: "reports" },
    { href: "/family/calendar", label: "Calendar", icon: "calendar" },
    { href: "/family/parent-evenings", label: "Parent evenings", icon: "calendar" },
    { href: "/family/messages", label: "Messages", icon: "messages" },
    { href: "/family/announcements", label: "Announcements", icon: "announcements" },
    { href: "/family/teachers", label: "Meet the teachers", icon: "people" },
    { href: "/family/absences", label: "Absences", icon: "absences" },
    { href: "/family/child-details", label: "Child details", icon: "documents" },
    { href: "/family/fees", label: "Fees", icon: "fees" },
  ],
  student: [
    { href: "/student/dashboard", label: "Home", icon: "overview" },
    { href: "/student/classes", label: "My classes", icon: "classes", matchPrefixes: ["/student/class", "/student/lessons"] },
    { href: "/student/todo", label: "To do", icon: "homework", matchPrefixes: ["/student/homework"] },
    { href: "/student/behaviour", label: "Behaviour", icon: "behaviour" },
    { href: "/student/reports", label: "Reports", icon: "reports" },
    { href: "/student/calendar", label: "Calendar", icon: "calendar" },
    { href: "/student/announcements", label: "Announcements", icon: "announcements" },
    { href: "/student/teachers", label: "My teachers", icon: "people" },
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
