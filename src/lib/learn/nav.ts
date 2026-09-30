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
  admin: [
    { label: "Dashboard", items: [{ href: "/admin/dashboard", label: "Dashboard" }] },
    {
      label: "People",
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
    { label: "Messages", items: [{ href: "/admin/messages", label: "Messages", headOnly: true }] },
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
  ],
  teach: [
    { label: "Dashboard", items: [{ href: "/teach/dashboard", label: "Dashboard" }] },
    { label: "Homework", items: [{ href: "/teach/homework", label: "Homework" }] },
    { label: "Assessment", items: [{ href: "/teach/assessment", label: "Assessment" }] },
    { label: "Reports", items: [{ href: "/teach/reports", label: "Reports" }] },
    { label: "Messages", items: [{ href: "/teach/messages", label: "Messages" }] },
  ],
  family: [
    { label: "Dashboard", items: [{ href: "/family/dashboard", label: "Dashboard" }] },
    { label: "Homework", items: [{ href: "/family/homework", label: "Homework" }] },
    { label: "Reports", items: [{ href: "/family/reports", label: "Reports" }] },
    { label: "Messages", items: [{ href: "/family/messages", label: "Messages" }] },
  ],
  student: [
    { label: "Dashboard", items: [{ href: "/student/dashboard", label: "Dashboard" }] },
    { label: "Homework", items: [{ href: "/student/homework", label: "Homework" }] },
    { label: "Reports", items: [{ href: "/student/reports", label: "Reports" }] },
  ],
};

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
  return p === href || p.startsWith(href + "/");
}

/** The area's nav with anything the signed-in user can't open removed. */
export function visiblePortalNav(area: PortalArea, roles: string[]): PortalNavGroup[] {
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  return PORTAL_NAV[area]
    .map((g) => ({ ...g, items: g.items.filter((i) => isHead || !i.headOnly) }))
    .filter((g) => g.items.length > 0);
}
