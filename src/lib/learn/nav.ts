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
        { href: "/admin/admissions", label: "Admissions", hint: "Bookings, calls and availability" },
        { href: "/admin/people", label: "People & roles", hint: "Families, students and staff" },
      ],
    },
    {
      label: "Teaching",
      items: [
        { href: "/admin/academic", label: "Academic", hint: "Year groups, classes, subjects" },
        { href: "/admin/lessons", label: "Lessons", hint: "Live lessons and recordings", headOnly: true },
        { href: "/admin/attendance", label: "Attendance", hint: "Registers and absences", headOnly: true },
        { href: "/admin/reports", label: "Reports", hint: "Term reports", headOnly: true },
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
      ],
    },
    {
      label: "Compliance",
      items: [
        { href: "/admin/compliance", label: "Compliance", hint: "Safeguarding, audit and retention" },
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
  | "grades";

export type SidebarItem = { href: string; label: string; icon: SidebarIcon; headOnly?: boolean };

export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Overview", icon: "overview" },
    { href: "/admin/calendar", label: "Calendar", icon: "calendar" },
    { href: "/admin/classes", label: "Classes", icon: "classes", headOnly: true },
    { href: "/admin/admissions", label: "Admissions", icon: "admissions" },
    { href: "/admin/people", label: "People & accounts", icon: "people" },
    { href: "/admin/attendance", label: "Attendance", icon: "attendance", headOnly: true },
    { href: "/admin/lessons", label: "Timetable & lessons", icon: "lessons", headOnly: true },
    { href: "/admin/academic", label: "Academic setup", icon: "academic" },
    { href: "/admin/reports", label: "Reports", icon: "reports", headOnly: true },
    { href: "/admin/messages", label: "Messages", icon: "messages", headOnly: true },
    { href: "/admin/fees", label: "Fees", icon: "fees", headOnly: true },
    { href: "/admin/documents", label: "Documents & signatures", icon: "documents", headOnly: true },
    { href: "/admin/compliance", label: "Safeguarding & compliance", icon: "compliance" },
    { href: "/admin/content", label: "Website content", icon: "website" },
    { href: "/admin/quiz", label: "Quiz & sample weeks", icon: "quiz", headOnly: true },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ],
  teach: [
    { href: "/teach/dashboard", label: "Overview", icon: "overview" },
    { href: "/teach/today", label: "Today", icon: "today" },
    { href: "/teach/classes", label: "My classes", icon: "classes" },
    { href: "/teach/calendar", label: "Calendar", icon: "calendar" },
    { href: "/teach/homework", label: "Homework", icon: "homework" },
    { href: "/teach/assessment", label: "Assessment & grades", icon: "grades" },
    { href: "/teach/reports", label: "Reports", icon: "reports" },
    { href: "/teach/messages", label: "Messages", icon: "messages" },
  ],
  family: [
    { href: "/family/dashboard", label: "Overview", icon: "overview" },
    { href: "/family/classes", label: "Classes", icon: "classes" },
    { href: "/family/calendar", label: "Calendar", icon: "calendar" },
    { href: "/family/homework", label: "Homework", icon: "homework" },
    { href: "/family/reports", label: "Reports", icon: "reports" },
    { href: "/family/messages", label: "Messages", icon: "messages" },
    { href: "/family/fees", label: "Fees", icon: "fees" },
  ],
  student: [
    { href: "/student/dashboard", label: "Home", icon: "overview" },
    { href: "/student/classes", label: "My classes", icon: "classes" },
    { href: "/student/calendar", label: "Calendar", icon: "calendar" },
    { href: "/student/homework", label: "Homework", icon: "homework" },
    { href: "/student/reports", label: "Reports", icon: "reports" },
  ],
};

export function visibleSidebar(area: PortalArea, roles: string[]): SidebarItem[] {
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  return SIDEBAR_NAV[area].filter((i) => isHead || !i.headOnly);
}

export const AREA_SUBTITLE: Record<PortalArea, string> = {
  admin: "School administration",
  teach: "Teacher portal",
  family: "Parent portal",
  student: "Student portal",
};
