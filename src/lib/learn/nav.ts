import type { IconName } from "@/components/learn/Icon";

// One place for every /learn area's navigation.
//
// The rule: the sidebar lists DESTINATIONS, and a destination is either a
// single page or a HUB. A hub is one sidebar entry that groups closely
// related pages (Curriculum = Lesson library · Syllabus and specs · Revision
// results). The sidebar shows only the hub; it stays highlighted on any of
// its pages, and the shell draws a compact tab strip of the hub's pages at
// the top of each of them (HubTabs in PageHeader.tsx, rendered by
// LearnLayoutShell), so no page needs to know it belongs to a hub. Nothing is
// listed twice: a page is either a sidebar entry or a tab inside one hub.
//
// Teaching work lives in the class (Stream · Classwork · Lessons · People ·
// Attendance · Grades · Insights), like Google Classroom and Teams for
// Education. The cross-class pages (All homework, To review, Gradebook) are
// overviews reached from the class hub, not separate top-level entries.

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

/** One page inside a hub, shown as a tab at the top of the hub's pages. */
export type HubTab = { href: string; label: string; hint?: string; icon?: SidebarIcon; headOnly?: boolean; matchPrefixes?: string[] };

/** `group` is the section the item sits under; items with no group are the
 * always-visible links at the top. `matchPrefixes` keeps an item highlighted
 * across related routes (e.g. a single class page keeps "My classes" lit).
 * `tabs` makes the item a hub: its href is the first tab the user can open. */
export type SidebarItem = {
  /** Stable key: the entry's href as written below, even after a hub is
   * pointed at a different first tab for this user. */
  id?: string;
  href: string;
  label: string;
  icon: SidebarIcon;
  hint?: string;
  headOnly?: boolean;
  group?: string;
  matchPrefixes?: string[];
  badge?: "actions" | "messages" | "todo" | "review";
  tabs?: HubTab[];
};
export type SidebarGroup = { label: string; icon: SidebarIcon; items: SidebarItem[] };

// Section names and their icons. Order here is the order in the sidebar.
const SECTIONS: { label: string; icon: SidebarIcon }[] = [
  { label: "Teaching", icon: "presentation" },
  { label: "Learning", icon: "bookOpen" },
  { label: "Pupils", icon: "users" },
  { label: "Progress", icon: "chartLine" },
  { label: "Calendar", icon: "calendarDays" },
  { label: "Communication", icon: "messageSquare" },
  { label: "People and staff", icon: "idCard" },
  { label: "School office", icon: "briefcase" },
  { label: "School", icon: "school" },
  { label: "My family", icon: "houseHeart" },
];
const SECTION_ICON = Object.fromEntries(SECTIONS.map((s) => [s.label, s.icon])) as Record<string, SidebarIcon>;
const SECTION_ORDER = SECTIONS.map((s) => s.label);

export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Home", icon: "house" },
    { href: "/admin/actions", label: "Action centre", icon: "flag", headOnly: true, badge: "actions", hint: "Everything waiting for the office" },

    // Teaching: the class is the home for teaching work.
    {
      href: "/admin/classes",
      label: "Classes",
      icon: "presentation",
      group: "Teaching",
      matchPrefixes: ["/admin/class"],
      tabs: [
        { href: "/admin/classes", label: "Classes", hint: "Every class: stream, classwork, people and grades", headOnly: true, matchPrefixes: ["/admin/class"] },
        { href: "/admin/homework", label: "All classwork", hint: "Homework set across every class, late and missing work", icon: "notebookPen", headOnly: true },
      ],
    },
    { href: "/admin/lessons", label: "Timetable and lessons", icon: "layoutDashboard", headOnly: true, group: "Teaching", hint: "Timetable, live lessons and recordings" },
    {
      href: "/admin/curriculum",
      label: "Curriculum",
      icon: "library",
      group: "Teaching",
      tabs: [
        { href: "/admin/curriculum", label: "Lesson library", hint: "Lesson plans, resources and revision packs", headOnly: true },
        { href: "/admin/syllabus", label: "Syllabus and specs", hint: "Schemes of work and exam specifications", icon: "scrollText", headOnly: true },
        { href: "/admin/revision", label: "Revision results", hint: "How pupils did on each unit's revision", icon: "chartLine", headOnly: true },
      ],
    },
    { href: "/admin/academic", label: "Academic setup", icon: "layers", group: "Teaching", hint: "Years, year groups, classes and subjects" },

    // Pupils
    {
      href: "/admin/pupils",
      label: "Pupils",
      icon: "contact",
      group: "Pupils",
      tabs: [
        { href: "/admin/pupils", label: "Pupil records", hint: "Every pupil's record in one place" },
        { href: "/admin/assessments", label: "Entry assessments", hint: "Baseline and entry assessments", icon: "clipboardCheck" },
      ],
    },
    {
      href: "/admin/attendance",
      label: "Attendance",
      icon: "userCheck",
      group: "Pupils",
      tabs: [
        { href: "/admin/attendance", label: "Registers", hint: "Take and review lesson registers", headOnly: true },
        { href: "/admin/absences", label: "Absences", hint: "Reported absences and follow-ups", icon: "calendarX", headOnly: true },
        { href: "/admin/enrichment", label: "Enrichment", hint: "Who joined each supervised block", icon: "calendarCheck", headOnly: true },
      ],
    },
    {
      href: "/admin/behaviour",
      label: "Behaviour and rewards",
      icon: "heartHandshake",
      group: "Pupils",
      tabs: [
        { href: "/admin/behaviour", label: "Behaviour", hint: "Incidents and praise", headOnly: true },
        { href: "/admin/rewards", label: "Houses and stars", hint: "House points, bonus points and Star of the Week", icon: "trophy", headOnly: true },
      ],
    },
    {
      href: "/admin/reports",
      label: "Progress and reports",
      icon: "fileText",
      group: "Pupils",
      tabs: [
        { href: "/admin/reports", label: "Reports", hint: "Term reports", headOnly: true },
        { href: "/admin/gcse", label: "GCSE progress", hint: "Predicted vs actual grades, Years 10-11", icon: "graduationCap", headOnly: true },
        { href: "/admin/summary", label: "School summary", hint: "Attendance, homework and progress at a glance", icon: "chartColumnIncreasing", headOnly: true },
      ],
    },

    // Calendar
    {
      href: "/admin/calendar",
      label: "Calendar",
      icon: "calendarDays",
      group: "Calendar",
      tabs: [
        { href: "/admin/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/admin/parent-evenings", label: "Parent evenings", hint: "Create evenings, open booking, see bookings", icon: "users", headOnly: true },
        { href: "/admin/open-evening", label: "Open evenings", hint: "Sessions, bookings and attendee lists", icon: "school" },
      ],
    },

    // Communication
    { href: "/admin/messages", label: "Messages", icon: "messageSquare", headOnly: true, badge: "messages", group: "Communication", hint: "Conversations with families and staff" },
    { href: "/admin/announcements", label: "Announcements", icon: "megaphone", headOnly: true, group: "Communication", hint: "School-wide notices" },
    { href: "/admin/digest", label: "Weekly digest", icon: "inbox", headOnly: true, group: "Communication", hint: "Friday parent email: preview and test" },
    {
      href: "/admin/message-oversight",
      label: "Oversight",
      icon: "shieldAlert",
      group: "Communication",
      tabs: [
        { href: "/admin/message-oversight", label: "Message oversight", hint: "Safeguarding view of staff-family messages", headOnly: true },
        { href: "/admin/feedback", label: "Feedback and requests", hint: "Suggestions and bug reports from portal users", icon: "messageSquarePlus", headOnly: true },
      ],
    },

    // People and staff
    { href: "/admin/admissions", label: "Admissions", icon: "userRoundPlus", group: "People and staff", hint: "Applications, calls and availability" },
    { href: "/admin/people", label: "People and accounts", icon: "idCard", group: "People and staff", hint: "Families, students and staff accounts and roles" },
    {
      href: "/admin/staff",
      label: "Staff",
      icon: "userRound",
      group: "People and staff",
      tabs: [
        { href: "/admin/staff", label: "Staff profiles", hint: "Teacher profiles and compliance dates", headOnly: true },
        { href: "/admin/staff-attendance", label: "Staff attendance", hint: "Clock-ins, hours and late arrivals", icon: "userCheck", headOnly: true },
        { href: "/admin/handbook", label: "Staff handbook", hint: "Policies and how-tos for staff", icon: "bookOpen" },
      ],
    },

    // School office
    { href: "/admin/fees", label: "Fees", icon: "wallet", headOnly: true, group: "School office", hint: "Invoices and payment status" },
    { href: "/admin/documents", label: "Policies and signatures", icon: "fileCheck", headOnly: true, group: "School office", hint: "Policies families and staff sign" },
    {
      href: "/admin/compliance",
      label: "Safeguarding",
      icon: "shieldCheck",
      group: "School office",
      tabs: [
        { href: "/admin/compliance", label: "Safeguarding and compliance", hint: "Safeguarding, audit and retention" },
        { href: "/admin/data-protection", label: "Data protection", hint: "Retention rules and subject access exports", headOnly: true },
        { href: "/admin/audit-log", label: "Audit log", hint: "Who changed what, with filters and CSV export", icon: "listChecks", headOnly: true },
      ],
    },
    {
      href: "/admin/content",
      label: "Website and settings",
      icon: "settings",
      group: "School office",
      tabs: [
        { href: "/admin/content", label: "Website content", hint: "Pages on the public site", icon: "globe" },
        { href: "/admin/quiz", label: "Quiz and sample weeks", hint: "Eligibility quiz and timetables", icon: "bookOpenCheck", headOnly: true },
        { href: "/admin/settings", label: "School settings", hint: "Bursary seats and site options" },
      ],
    },
  ],

  teach: [
    { href: "/teach/dashboard", label: "Home", icon: "house" },
    { href: "/teach/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/teach/today", label: "Today", icon: "sun", matchPrefixes: ["/teach/enrichment"], hint: "Today's lessons and registers" },
    {
      href: "/teach/classes",
      label: "My classes",
      icon: "presentation",
      matchPrefixes: ["/teach/class", "/teach/lessons"],
      tabs: [
        { href: "/teach/classes", label: "My classes", hint: "Stream, classwork, people and grades for each class", matchPrefixes: ["/teach/class", "/teach/lessons"] },
        { href: "/teach/homework", label: "All homework", hint: "Homework across your classes, late and missing work", icon: "notebookPen" },
        { href: "/teach/assessment", label: "Gradebook", hint: "Enter a whole class's results at once", icon: "award" },
      ],
    },
    { href: "/teach/review", label: "To review", icon: "clipboardCheck", badge: "review", hint: "Work handed in and waiting to be marked" },
    { href: "/teach/messages", label: "Messages", icon: "messageSquare", badge: "messages" },

    {
      href: "/teach/curriculum",
      label: "Curriculum",
      icon: "library",
      group: "Teaching",
      tabs: [
        { href: "/teach/curriculum", label: "Lesson library", hint: "Lesson plans, resources and revision packs" },
        { href: "/teach/syllabus", label: "Syllabus and specs", hint: "Schemes of work and exam specifications", icon: "scrollText" },
        { href: "/teach/revision", label: "Revision results", hint: "How your pupils did on each unit's revision", icon: "chartLine" },
      ],
    },
    { href: "/teach/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Teaching", hint: "Recitation and memorisation progress" },

    { href: "/teach/pupils", label: "Pupils", icon: "contact", group: "Pupils", hint: "Records for the pupils you teach" },
    { href: "/teach/absences", label: "Absences", icon: "calendarX", group: "Pupils", hint: "Reported pupil absences" },
    {
      href: "/teach/behaviour",
      label: "Behaviour and rewards",
      icon: "heartHandshake",
      group: "Pupils",
      tabs: [
        { href: "/teach/behaviour", label: "Behaviour", hint: "Incidents and praise" },
        { href: "/teach/stars", label: "Houses and stars", hint: "House points and Star of the Week", icon: "trophy" },
      ],
    },
    { href: "/teach/reports", label: "Reports", icon: "fileText", group: "Pupils", hint: "Term reports for your classes" },

    {
      href: "/teach/calendar",
      label: "Calendar",
      icon: "calendarDays",
      group: "School",
      tabs: [
        { href: "/teach/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/teach/parent-evenings", label: "Parent evenings", hint: "Your parent evening slots and bookings", icon: "users" },
      ],
    },
    { href: "/teach/announcements", label: "Announcements", icon: "megaphone", group: "School", hint: "School-wide notices" },
    {
      href: "/teach/profile",
      label: "My staff area",
      icon: "userRound",
      group: "School",
      tabs: [
        { href: "/teach/profile", label: "My profile", hint: "Your teacher profile" },
        { href: "/teach/clock", label: "My hours", hint: "Clock-ins and hours worked", icon: "clock" },
        { href: "/teach/handbook", label: "Staff handbook", hint: "Policies and how-tos for staff", icon: "bookOpen" },
      ],
    },
  ],

  family: [
    { href: "/family/dashboard", label: "Home", icon: "house" },
    { href: "/family/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/family/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/family/homework"], hint: "Homework due and missing" },
    { href: "/family/classes", label: "Classes", icon: "presentation", matchPrefixes: ["/family/class", "/family/lessons"], hint: "Your child's classes, lessons and classwork" },
    { href: "/family/messages", label: "Messages", icon: "messageSquare", badge: "messages" },

    { href: "/family/reports", label: "Reports", icon: "fileText", group: "Progress", hint: "Term reports" },
    { href: "/family/behaviour", label: "Behaviour", icon: "heartHandshake", group: "Progress", hint: "Praise and incidents" },
    { href: "/family/revision", label: "Revision", icon: "target", group: "Progress", hint: "Unit revision results" },
    { href: "/family/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Progress", hint: "Recitation and memorisation progress" },

    {
      href: "/family/calendar",
      label: "Calendar",
      icon: "calendarDays",
      group: "School",
      tabs: [
        { href: "/family/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/family/parent-evenings", label: "Parent evenings", hint: "Book a slot with your child's teachers", icon: "users" },
      ],
    },
    { href: "/family/announcements", label: "Announcements", icon: "megaphone", group: "School", hint: "Notices from the school" },
    { href: "/family/teachers", label: "Meet the teachers", icon: "users", group: "School" },

    { href: "/family/child-details", label: "Child details", icon: "contact", group: "My family", hint: "Contact, medical and consent details" },
    { href: "/family/absences", label: "Report an absence", icon: "calendarX", group: "My family" },
    { href: "/family/fees", label: "Fees", icon: "wallet", group: "My family", hint: "Invoices and payments" },
  ],

  student: [
    { href: "/student/dashboard", label: "Home", icon: "house" },
    { href: "/student/actions", label: "Action centre", icon: "flag", badge: "actions" },
    { href: "/student/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/student/homework"], hint: "Homework due and missing" },
    { href: "/student/classes", label: "My classes", icon: "presentation", matchPrefixes: ["/student/class", "/student/lessons"], hint: "Your classes, lessons and classwork" },

    { href: "/student/revision", label: "Unit revision", icon: "target", group: "Learning", hint: "Revise each unit and test yourself" },
    { href: "/student/quran", label: "Qur'an and Qaidah", icon: "bookMarked", group: "Learning", hint: "Your recitation and memorisation" },

    { href: "/student/reports", label: "Reports", icon: "fileText", group: "Progress" },
    { href: "/student/behaviour", label: "Behaviour", icon: "heartHandshake", group: "Progress" },

    { href: "/student/calendar", label: "Calendar", icon: "calendarDays", group: "School" },
    { href: "/student/announcements", label: "Announcements", icon: "megaphone", group: "School" },
    { href: "/student/teachers", label: "My teachers", icon: "users", group: "School" },
  ],
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

function isHeadRole(roles: string[]): boolean {
  return roles.some((r) => r === "head_teacher" || r === "admin");
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
 * or a matchPrefix), plus the hub tab it is on, if any — used by PageHeader
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

/** Is this sidebar item the current page (own route, sub-page, a hub tab or any matchPrefix)? */
export function isSidebarItemActive(pathname: string, item: SidebarItem): boolean {
  const p = normalisePortalPath(pathname);
  return itemScore(p, item) > 0 && navItemFor(pathname)?.item.href === (item.id || item.href);
}

/** The area's sidebar items this user can open: headOnly pages removed, each
 * hub cut down to the tabs they can open (and pointing at the first one), and
 * a hub left with no tabs dropped. */
export function visibleSidebar(area: PortalArea, roles: string[]): SidebarItem[] {
  const isHead = isHeadRole(roles);
  const out: SidebarItem[] = [];
  for (const i of SIDEBAR_NAV[area]) {
    if (i.headOnly && !isHead) continue;
    if (!i.tabs) {
      out.push(i);
      continue;
    }
    const tabs = i.tabs.filter((t) => isHead || !t.headOnly);
    if (tabs.length === 0) continue;
    // A hub with one page left for this user is just that page.
    if (tabs.length === 1) out.push({ ...i, id: i.href, href: tabs[0].href, label: tabs[0].label, icon: tabs[0].icon || i.icon, hint: tabs[0].hint, tabs });
    else out.push({ ...i, id: i.href, href: tabs[0].href, tabs });
  }
  return out;
}

/** Every page this user can open in an area, one row per page (hub tabs
 * included, with the hub as `parent`) — the command palette lists these. */
export function visiblePages(area: PortalArea, roles: string[]): { href: string; label: string; hint?: string; parent?: string; icon: SidebarIcon }[] {
  return visibleSidebar(area, roles).flatMap((i) =>
    i.tabs && i.tabs.length > 1
      ? i.tabs.map((t) => ({ href: t.href, label: t.label, hint: t.hint, parent: i.label === t.label ? undefined : i.label, icon: t.icon || i.icon }))
      : [{ href: i.href, label: i.label, hint: i.hint || i.tabs?.[0]?.hint, icon: i.icon }],
  );
}

/** The hub the current page is in, when it has two or more tabs this user can
 * open: the shell draws these as a tab strip at the top of the page. */
export function hubFor(pathname: string, roles: string[]): { item: SidebarItem; tabs: HubTab[]; active: HubTab | null } | null {
  const area = portalAreaFor(pathname);
  if (!area) return null;
  const found = navItemFor(pathname);
  if (!found?.item.tabs) return null;
  const item = visibleSidebar(area, roles).find((i) => i.id === found.item.href);
  if (!item?.tabs || item.tabs.length < 2) return null;
  // Only on the hub's own pages: a single class page (a matchPrefix of the
  // classes hub) has its own tabs and doesn't repeat the hub's.
  const p = normalisePortalPath(pathname);
  const active = item.tabs.find((t) => p === t.href || p.startsWith(t.href + "/")) || null;
  if (!active) return null;
  return { item, tabs: item.tabs, active };
}

/** Site administration (/admin/site): every admin page by section, built from the sidebar. */
export function visibleAdminSections(roles: string[]): PortalNavGroup[] {
  const groups = new Map<string, PortalNavItem[]>();
  for (const i of visibleSidebar("admin", roles)) {
    if (!i.group) continue;
    const list = groups.get(i.group) || [];
    if (i.tabs) list.push(...i.tabs.map((t) => ({ href: t.href, label: t.label, hint: t.hint })));
    else list.push({ href: i.href, label: i.label, hint: i.hint });
    groups.set(i.group, list);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/** One row of the sidebar: a plain link, or a section that opens in place. */
export type SidebarEntry = { kind: "link"; item: SidebarItem } | { kind: "section"; section: SidebarGroup };

/** The sidebar layout: always-visible links first, then the sections in
 * order. A section left with a single entry (after role filtering) is shown
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

/** The four places each kind of user goes most: the phone tab bar shows
 * these, and the phone "More" menu leaves them out so nothing appears twice.
 * Each is a sidebar entry's href (for a hub, any of its tabs). */
export const MOBILE_TABS: Record<PortalArea, string[]> = {
  student: ["/student/dashboard", "/student/todo", "/student/classes", "/student/actions"],
  family: ["/family/dashboard", "/family/todo", "/family/classes", "/family/messages"],
  teach: ["/teach/today", "/teach/classes", "/teach/review", "/teach/messages"],
  admin: ["/admin/dashboard", "/admin/attendance", "/admin/messages", "/admin/calendar"],
};

/** Does this sidebar entry stand for the given href (its own, or one of its tabs)? */
export function itemHasHref(item: SidebarItem, href: string): boolean {
  return item.href === href || !!item.tabs?.some((t) => t.href === href);
}

/** The sidebar layout without the given pages. A section left empty is
 * dropped, and one left with a single page becomes a plain link. */
export function withoutPages(entries: SidebarEntry[], hrefs: string[]): SidebarEntry[] {
  if (!hrefs.length) return entries;
  const hidden = (i: SidebarItem) => hrefs.some((h) => itemHasHref(i, h));
  const out: SidebarEntry[] = [];
  for (const e of entries) {
    if (e.kind === "link") {
      if (!hidden(e.item)) out.push(e);
      continue;
    }
    const items = e.section.items.filter((i) => !hidden(i));
    if (items.length === 1) out.push({ kind: "link", item: items[0] });
    else if (items.length > 1) out.push({ kind: "section", section: { ...e.section, items } });
  }
  return out;
}
