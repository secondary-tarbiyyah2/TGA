import type { IconName } from "@/components/learn/Icon";

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

// ── Sidebar ─────────────────────────────────────────────────────────
// The portal's only navigation. A few always-visible links (Home, Today)
// followed by sections that open and close in place, each listing its
// pages directly underneath. Every page is reachable from the sidebar, and
// nothing is repeated as tabs along the top of the page.

export type SidebarIcon = IconName;

/** `group` is the section the item sits under; items with no group are the
 * always-visible links at the top. `matchPrefixes` keeps an item highlighted
 * across related routes (e.g. a single class page keeps "My classes" lit). */
export type SidebarItem = { href: string; label: string; icon: SidebarIcon; headOnly?: boolean; group?: string; matchPrefixes?: string[]; badge?: "actions" | "messages" | "todo" };
export type SidebarGroup = { label: string; icon: SidebarIcon; items: SidebarItem[] };

// Section names and their icons. Order here is the order in the sidebar.
const SECTIONS: { label: string; icon: SidebarIcon }[] = [
  { label: "Teaching", icon: "presentation" },
  { label: "Learning", icon: "bookOpen" },
  { label: "Qur'an", icon: "bookMarked" },
  { label: "Pupils", icon: "users" },
  { label: "Progress", icon: "chartLine" },
  { label: "Calendar", icon: "calendarDays" },
  { label: "Communication", icon: "messageSquare" },
  { label: "Admissions and staff", icon: "idCard" },
  { label: "Finance and policies", icon: "wallet" },
  { label: "Safeguarding", icon: "shieldCheck" },
  { label: "Website and settings", icon: "settings" },
  { label: "School", icon: "school" },
  { label: "My family", icon: "houseHeart" },
  { label: "My staff area", icon: "userRound" },
];
const SECTION_ICON = Object.fromEntries(SECTIONS.map((s) => [s.label, s.icon])) as Record<string, SidebarIcon>;
const SECTION_ORDER = SECTIONS.map((s) => s.label);

export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Home", icon: "house" },
    { href: "/admin/actions", label: "Action centre", icon: "flag", headOnly: true, badge: "actions" },
    { href: "/admin/classes", label: "Classes", icon: "presentation", headOnly: true, group: "Teaching", matchPrefixes: ["/admin/class"] },
    { href: "/admin/lessons", label: "Timetable and lessons", icon: "layoutDashboard", headOnly: true, group: "Teaching" },
    { href: "/admin/homework", label: "Homework", icon: "notebookPen", headOnly: true, group: "Teaching" },
    { href: "/admin/curriculum", label: "Lesson library", icon: "library", headOnly: true, group: "Teaching" },
    { href: "/admin/syllabus", label: "Syllabus and specs", icon: "scrollText", headOnly: true, group: "Teaching" },
    { href: "/admin/revision", label: "Revision results", icon: "chartLine", headOnly: true, group: "Teaching" },
    { href: "/admin/academic", label: "Academic setup", icon: "layers", group: "Teaching" },
    { href: "/admin/pupils", label: "Pupil records", icon: "contact", group: "Pupils" },
    { href: "/admin/assessments", label: "Baseline assessments", icon: "clipboardCheck", group: "Pupils" },
    { href: "/admin/attendance", label: "Attendance", icon: "userCheck", headOnly: true, group: "Pupils" },
    { href: "/admin/absences", label: "Absences", icon: "calendarX", headOnly: true, group: "Pupils" },
    { href: "/admin/enrichment", label: "Enrichment attendance", icon: "calendarCheck", headOnly: true, group: "Pupils" },
    { href: "/admin/behaviour", label: "Behaviour", icon: "heartHandshake", headOnly: true, group: "Pupils" },
    { href: "/admin/rewards", label: "Houses and stars", icon: "trophy", headOnly: true, group: "Pupils" },
    { href: "/admin/reports", label: "Reports", icon: "fileText", headOnly: true, group: "Pupils" },
    { href: "/admin/gcse", label: "GCSE progress", icon: "graduationCap", headOnly: true, group: "Pupils" },
    { href: "/admin/summary", label: "School summary", icon: "chartColumnIncreasing", headOnly: true, group: "Pupils" },
    { href: "/admin/calendar", label: "Calendar", icon: "calendarDays", group: "Calendar" },
    { href: "/admin/parent-evenings", label: "Parent evenings", icon: "users", headOnly: true, group: "Calendar" },
    { href: "/admin/open-evening", label: "Open evenings", icon: "school", group: "Calendar" },
    { href: "/admin/messages", label: "Messages", icon: "messageSquare", headOnly: true, badge: "messages", group: "Communication" },
    { href: "/admin/announcements", label: "Announcements", icon: "megaphone", headOnly: true, group: "Communication" },
    { href: "/admin/digest", label: "Weekly digest", icon: "inbox", headOnly: true, group: "Communication" },
    { href: "/admin/message-oversight", label: "Message oversight", icon: "shieldAlert", headOnly: true, group: "Communication" },
    { href: "/admin/feedback", label: "Feedback and requests", icon: "messageSquarePlus", headOnly: true, group: "Communication" },
    { href: "/admin/admissions", label: "Admissions", icon: "userRoundPlus", group: "Admissions and staff" },
    { href: "/admin/people", label: "People and accounts", icon: "idCard", group: "Admissions and staff" },
    { href: "/admin/staff", label: "Staff profiles", icon: "userRound", headOnly: true, group: "Admissions and staff" },
    { href: "/admin/staff-attendance", label: "Staff attendance", icon: "userCheck", headOnly: true, group: "Admissions and staff" },
    { href: "/admin/handbook", label: "Staff handbook", icon: "bookOpen", group: "Admissions and staff" },
    { href: "/admin/fees", label: "Fees", icon: "wallet", headOnly: true, group: "Finance and policies" },
    { href: "/admin/compliance", label: "Safeguarding and compliance", icon: "shieldCheck", group: "Safeguarding" },
    { href: "/admin/documents", label: "Policies and signatures", icon: "fileCheck", headOnly: true, group: "Finance and policies" },
    { href: "/admin/data-protection", label: "Data protection", icon: "shieldCheck", headOnly: true, group: "Safeguarding" },
    { href: "/admin/audit-log", label: "Audit log", icon: "listChecks", headOnly: true, group: "Safeguarding" },
    { href: "/admin/content", label: "Website content", icon: "globe", group: "Website and settings" },
    { href: "/admin/quiz", label: "Quiz and sample weeks", icon: "bookOpenCheck", headOnly: true, group: "Website and settings" },
    { href: "/admin/settings", label: "School settings", icon: "settings", group: "Website and settings" },
  ],
  teach: [
    { href: "/teach/dashboard", label: "Home", icon: "house" },
    { href: "/teach/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/teach/today", label: "Today", icon: "sun", matchPrefixes: ["/teach/enrichment"] },
    { href: "/teach/classes", label: "My classes", icon: "presentation", matchPrefixes: ["/teach/class", "/teach/lessons"] },
    { href: "/teach/homework", label: "Homework", icon: "notebookPen", group: "Teaching" },
    { href: "/teach/review", label: "To review", icon: "clipboardCheck" },
    { href: "/teach/assessment", label: "Assessment and grades", icon: "award", group: "Teaching" },
    { href: "/teach/curriculum", label: "Lesson library", icon: "library", group: "Teaching" },
    { href: "/teach/syllabus", label: "Syllabus and specs", icon: "scrollText", group: "Teaching" },
    { href: "/teach/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Qur'an" },
    { href: "/teach/revision", label: "Revision results", icon: "chartLine", group: "Teaching" },
    { href: "/teach/pupils", label: "Pupils", icon: "contact", group: "Pupils" },
    { href: "/teach/behaviour", label: "Behaviour", icon: "heartHandshake", group: "Pupils" },
    { href: "/teach/stars", label: "Houses and stars", icon: "trophy", group: "Pupils" },
    { href: "/teach/reports", label: "Reports", icon: "fileText", group: "Pupils" },
    { href: "/teach/calendar", label: "Calendar", icon: "calendarDays", group: "Calendar" },
    { href: "/teach/parent-evenings", label: "Parent evenings", icon: "users", group: "Calendar" },
    { href: "/teach/messages", label: "Messages", icon: "messageSquare", badge: "messages" },
    { href: "/teach/announcements", label: "Announcements", icon: "megaphone", group: "Communication" },
    { href: "/teach/profile", label: "My profile", icon: "userRound", group: "My staff area" },
    { href: "/teach/clock", label: "My hours", icon: "clock", group: "My staff area" },
    { href: "/teach/handbook", label: "Staff handbook", icon: "bookOpen", group: "My staff area" },
    { href: "/teach/absences", label: "Pupil absences", icon: "calendarX", group: "Pupils" },
  ],
  family: [
    { href: "/family/dashboard", label: "Home", icon: "house" },
    { href: "/family/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/family/classes", label: "Classes", icon: "presentation", group: "Learning", matchPrefixes: ["/family/class", "/family/lessons"] },
    { href: "/family/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/family/homework"] },
    { href: "/family/behaviour", label: "Behaviour", icon: "heartHandshake", group: "Progress" },
    { href: "/family/reports", label: "Reports", icon: "fileText", group: "Progress" },
    { href: "/family/revision", label: "Revision", icon: "target", group: "Progress" },
    { href: "/family/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Qur'an" },
    { href: "/family/calendar", label: "Calendar", icon: "calendarDays", group: "Calendar" },
    { href: "/family/parent-evenings", label: "Parent evenings", icon: "users", group: "Calendar" },
    { href: "/family/messages", label: "Messages", icon: "messageSquare", badge: "messages" },
    { href: "/family/announcements", label: "Announcements", icon: "megaphone", group: "Communication" },
    { href: "/family/child-details", label: "Child details", icon: "contact", group: "My family" },
    { href: "/family/absences", label: "Report an absence", icon: "calendarX", group: "My family" },
    { href: "/family/teachers", label: "Meet the teachers", icon: "users", group: "My family" },
    { href: "/family/fees", label: "Fees", icon: "wallet", group: "My family" },
  ],
  student: [
    { href: "/student/dashboard", label: "Home", icon: "house" },
    { href: "/student/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/student/classes", label: "My classes", icon: "presentation", matchPrefixes: ["/student/class", "/student/lessons"] },
    { href: "/student/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/student/homework"] },
    { href: "/student/revision", label: "Unit revision", icon: "target", group: "Learning" },
    { href: "/student/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Qur'an" },
    { href: "/student/calendar", label: "Calendar", icon: "calendarDays", group: "Learning" },
    { href: "/student/behaviour", label: "Behaviour", icon: "heartHandshake", group: "Progress" },
    { href: "/student/reports", label: "Reports", icon: "fileText", group: "Progress" },
    { href: "/student/announcements", label: "Announcements", icon: "megaphone", group: "School" },
    { href: "/student/teachers", label: "My teachers", icon: "users", group: "School" },
  ],
};


/** The sidebar's coloured icon tiles: one hue per icon family, so the same idea keeps the same
 * colour in every area (classes teal, messages blue, safeguarding red, rewards gold...). */
const TILE_HUE: Partial<Record<SidebarIcon, string>> = {
  house: "tile-gold", houseHeart: "tile-gold", school: "tile-gold", star: "tile-gold", trophy: "tile-gold", award: "tile-gold",
  sun: "tile-amber", calendarDays: "tile-amber", scrollText: "tile-amber", megaphone: "tile-amber", hourglass: "tile-amber",
  flag: "tile-rose", heartHandshake: "tile-rose", shieldCheck: "tile-rose", shieldAlert: "tile-rose", calendarX: "tile-rose", palette: "tile-rose",
  presentation: "tile-teal", library: "tile-teal", layers: "tile-teal", layoutDashboard: "tile-teal", calculator: "tile-teal",
  messageSquare: "tile-blue", messageSquarePlus: "tile-blue", users: "tile-blue", contact: "tile-blue", idCard: "tile-blue", userRoundPlus: "tile-blue", globe: "tile-blue", monitor: "tile-blue", languages: "tile-blue",
  clipboardCheck: "tile-violet", listChecks: "tile-violet", notebookPen: "tile-violet", graduationCap: "tile-violet", fileText: "tile-violet", fileCheck: "tile-violet",
  bookMarked: "tile-emerald", bookOpen: "tile-emerald", moon: "tile-emerald", bookOpenCheck: "tile-emerald",
  target: "tile-green", chartLine: "tile-green", chartColumnIncreasing: "tile-green", wallet: "tile-green", flask: "tile-green", activity: "tile-green", userCheck: "tile-green", calendarCheck: "tile-green",
};
export const tileFor = (icon: SidebarIcon): string => TILE_HUE[icon] || "tile-slate";

export const dashboardPathForArea = (area: PortalArea): string => `/${area}/dashboard`;

/** The sidebar item a page belongs to (its own route, a sub-page or a matchPrefix), with its section — used by PageHeader for the icon tile and breadcrumb. */
export function navItemFor(pathname: string): { item: SidebarItem; area: PortalArea } | null {
  const area = portalAreaFor(pathname);
  if (!area) return null;
  const items = SIDEBAR_NAV[area];
  const p = normalisePortalPath(pathname);
  // Prefer the longest matching href so "/admin/lessons/runs" picks Lessons, not Home.
  const exact = items.filter((i) => p === i.href || p.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
  if (exact) return { item: exact, area };
  const byPrefix = items.find((i) => i.matchPrefixes?.some((m) => p === m || p.startsWith(m + "/")));
  return byPrefix ? { item: byPrefix, area } : null;
}

/** Is this sidebar item the current page (own route, sub-page or any matchPrefix)? */
export function isSidebarItemActive(pathname: string, item: SidebarItem): boolean {
  if (isActivePath(pathname, item.href)) return true;
  const p = normalisePortalPath(pathname);
  return !!item.matchPrefixes?.some((m) => p === m || p.startsWith(m + "/"));
}

function isHeadRole(roles: string[]): boolean {
  return roles.some((r) => r === "head_teacher" || r === "admin");
}

/** Every page this user can open in an area, as one flat list (used by the
 * command palette). */
export function visibleSidebar(area: PortalArea, roles: string[]): SidebarItem[] {
  const isHead = isHeadRole(roles);
  return SIDEBAR_NAV[area].filter((i) => isHead || !i.headOnly);
}

/** One row of the sidebar: a plain link, or a section that opens in place. */
export type SidebarEntry = { kind: "link"; item: SidebarItem } | { kind: "section"; section: SidebarGroup };

/** The sidebar layout: always-visible links first, then the sections in
 * order. A section left with a single page (after role filtering) is shown
 * in its place as a plain link rather than a one-item section. */
export function sidebarLayout(area: PortalArea, roles: string[]): SidebarEntry[] {
  const items = visibleSidebar(area, roles);
  const out: SidebarEntry[] = items.filter((i) => !i.group).map((item) => ({ kind: "link", item }));
  const labels = [...new Set(items.filter((i) => i.group).map((i) => i.group as string))];
  labels.sort((a, b) => (SECTION_ORDER.indexOf(a) + 1 || 99) - (SECTION_ORDER.indexOf(b) + 1 || 99));
  for (const label of labels) {
    const groupItems = items.filter((i) => i.group === label);
    if (groupItems.length === 1) out.push({ kind: "link", item: groupItems[0] });
    else out.push({ kind: "section", section: { label, icon: SECTION_ICON[label] || groupItems[0].icon, items: groupItems } });
  }
  return out;
}

export const AREA_SUBTITLE: Record<PortalArea, string> = {
  admin: "School administration",
  teach: "Teacher portal",
  family: "Parent portal",
  student: "Student portal",
};


/** The four pages each kind of user goes to most: the phone tab bar shows
 * these, and the phone "More" menu leaves them out so nothing appears twice. */
export const MOBILE_TABS: Record<PortalArea, string[]> = {
  student: ["/student/dashboard", "/student/todo", "/student/actions", "/student/classes"],
  family: ["/family/dashboard", "/family/todo", "/family/actions", "/family/messages"],
  teach: ["/teach/today", "/teach/classes", "/teach/actions", "/teach/messages"],
  admin: ["/admin/dashboard", "/admin/attendance", "/admin/messages", "/admin/calendar"],
};

/** The sidebar layout without the given pages. A section left empty is
 * dropped, and one left with a single page becomes a plain link. */
export function withoutPages(entries: SidebarEntry[], hrefs: string[]): SidebarEntry[] {
  if (!hrefs.length) return entries;
  const hide = new Set(hrefs);
  const out: SidebarEntry[] = [];
  for (const e of entries) {
    if (e.kind === "link") {
      if (!hide.has(e.item.href)) out.push(e);
      continue;
    }
    const items = e.section.items.filter((i) => !hide.has(i.href));
    if (items.length === 1) out.push({ kind: "link", item: items[0] });
    else if (items.length > 1) out.push({ kind: "section", section: { ...e.section, items } });
  }
  return out;
}
