import type { IconName } from "@/components/learn/Icon";

// One place for every /learn area's navigation.
//
// The rule: the sidebar lists DESTINATIONS, and a destination is either a
// single page or a HUB. A hub is one sidebar entry that groups closely
// related pages (Curriculum = Lesson library, Syllabus, Revision results). The sidebar shows only the hub; it stays highlighted on any of
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

/** `group` is the section the item sits under in grouped areas (admin); the
 * first group's items are the always-visible links at the top. `matchPrefixes` keeps an item highlighted
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


export const SIDEBAR_NAV: Record<PortalArea, SidebarItem[]> = {
  // Each entry is a page or a hub whose pages show as tabs. Grouped (see GROUPED_AREAS): the first group's entries are always-visible
  // links at the top; the rest sit under headings that open and close. The
  // groups also lay out the Site administration index (/admin/site).
  admin: [
    {
      href: "/admin/dashboard",
      label: "Home",
      icon: "house",
      badge: "actions",
      group: "Overview",
      tabs: [
        { href: "/admin/dashboard", label: "Overview", hint: "Today across the school" },
        { href: "/admin/actions", label: "Action centre", hint: "Everything waiting for the office", icon: "flag", headOnly: true },
        { href: "/admin/summary", label: "School summary", hint: "Attendance, homework and progress at a glance", icon: "chartColumnIncreasing", headOnly: true },
      ],
    },
    {
      href: "/admin/messages",
      label: "Messages",
      icon: "messageSquare",
      badge: "messages",
      group: "Overview",
      tabs: [
        { href: "/admin/messages", label: "Inbox", hint: "Conversations with families and staff", headOnly: true },
        { href: "/admin/announcements", label: "Announcements", hint: "School-wide notices", icon: "megaphone", headOnly: true },
        { href: "/admin/digest", label: "Weekly digest", hint: "Friday parent email", icon: "mail", headOnly: true },
        { href: "/admin/message-oversight", label: "Oversight", hint: "Safeguarding view of staff-family messages", icon: "shieldAlert", headOnly: true },
        { href: "/admin/feedback", label: "Feedback", hint: "Suggestions and bug reports from portal users", icon: "messageSquarePlus", headOnly: true },
      ],
    },
    {
      href: "/admin/calendar",
      label: "Calendar",
      icon: "calendarDays",
      group: "Overview",
      tabs: [
        { href: "/admin/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/admin/parent-evenings", label: "Parent evenings", hint: "Create evenings, open booking, see bookings", icon: "calendarClock", headOnly: true },
      ],
    },
    {
      href: "/admin/pupils",
      label: "Pupils",
      icon: "backpack",
      group: "Pupils",
      tabs: [
        { href: "/admin/pupils", label: "All pupils", hint: "Every pupil's record in one place" },
        { href: "/admin/behaviour", label: "Behaviour", hint: "Incidents and praise", icon: "heartHandshake", headOnly: true },
        { href: "/admin/rewards", label: "House points", hint: "House points and Star of the Week", icon: "trophy", headOnly: true },
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
      href: "/admin/reports",
      label: "Reports",
      icon: "fileText",
      group: "Pupils",
      tabs: [
        { href: "/admin/reports", label: "Term reports", hint: "Write, approve and issue reports", headOnly: true },
        { href: "/admin/gcse", label: "GCSE", hint: "Predicted and actual grades, Years 10 and 11", icon: "graduationCap", headOnly: true },
      ],
    },
    {
      href: "/admin/classes",
      label: "Classes",
      icon: "presentation",
      group: "Teaching",
      matchPrefixes: ["/admin/class"],
      tabs: [
        { href: "/admin/classes", label: "Classes", hint: "Every class: stream, classwork, people and grades", headOnly: true, matchPrefixes: ["/admin/class"] },
        { href: "/admin/homework", label: "Classwork", hint: "Work set across every class, late and missing work", icon: "notebookPen", headOnly: true },
        { href: "/admin/lessons", label: "Timetable", hint: "Timetable, live lessons and recordings", icon: "layoutDashboard", headOnly: true },
      ],
    },
    {
      href: "/admin/curriculum",
      label: "Curriculum",
      icon: "library",
      group: "Teaching",
      tabs: [
        { href: "/admin/curriculum", label: "Lesson library", hint: "Lesson plans, resources and revision packs", headOnly: true },
        { href: "/admin/syllabus", label: "Syllabus", hint: "Schemes of work and exam specifications", icon: "scrollText", headOnly: true },
        { href: "/admin/revision", label: "Revision results", hint: "How pupils did on each unit's revision", icon: "chartLine", headOnly: true },
      ],
    },
    {
      href: "/admin/admissions",
      label: "Admissions",
      icon: "userRoundPlus",
      group: "School office",
      tabs: [
        { href: "/admin/admissions", label: "Applications", hint: "Applications, calls and availability" },
        { href: "/admin/assessments", label: "Entry assessments", hint: "Baseline and entry assessments", icon: "clipboardCheck" },
        { href: "/admin/open-evening", label: "Open evenings", hint: "Sessions, bookings and attendee lists", icon: "school" },
      ],
    },
    {
      href: "/admin/people",
      label: "People",
      icon: "idCard",
      group: "School office",
      tabs: [
        { href: "/admin/people", label: "Accounts", hint: "Families, students and staff accounts and roles" },
        { href: "/admin/staff", label: "Staff", hint: "Teacher profiles and compliance dates", icon: "userRound", headOnly: true },
        { href: "/admin/staff-attendance", label: "Staff hours", hint: "Clock-ins, hours and late arrivals", icon: "clock", headOnly: true },
        { href: "/admin/handbook", label: "Handbook", hint: "Policies and how-tos for staff", icon: "bookOpen" },
      ],
    },
    {
      href: "/admin/fees",
      label: "Fees and policies",
      icon: "wallet",
      group: "School office",
      tabs: [
        { href: "/admin/fees", label: "Fees", hint: "Invoices and payment status", headOnly: true },
        { href: "/admin/documents", label: "Policies", hint: "Policies families and staff sign", icon: "fileCheck", headOnly: true },
      ],
    },
    {
      href: "/admin/compliance",
      label: "Safeguarding",
      icon: "shieldCheck",
      group: "School office",
      tabs: [
        { href: "/admin/compliance", label: "Compliance", hint: "Safeguarding, audit and retention" },
        { href: "/admin/data-protection", label: "Data protection", hint: "Retention rules and subject access exports", headOnly: true },
        { href: "/admin/audit-log", label: "Audit log", hint: "Who changed what, with filters and CSV export", icon: "listChecks", headOnly: true },
      ],
    },
    {
      href: "/admin/settings",
      label: "Settings",
      icon: "settings",
      group: "School office",
      tabs: [
        { href: "/admin/settings", label: "General", hint: "Bursary seats, Microsoft 365 and site options" },
        { href: "/admin/academic", label: "Academic setup", hint: "Years, terms, year groups, classes and subjects", icon: "layers" },
        { href: "/admin/content", label: "Website", hint: "Pages on the public site", icon: "globe" },
        { href: "/admin/quiz", label: "Quiz and sample weeks", hint: "Eligibility quiz and timetables", icon: "bookOpenCheck", headOnly: true },
      ],
    },
  ],

  teach: [
    {
      href: "/teach/dashboard",
      label: "Home",
      icon: "house",
      badge: "actions",
      tabs: [
        { href: "/teach/dashboard", label: "Overview", hint: "Your day at a glance" },
        { href: "/teach/actions", label: "Action centre", hint: "Things waiting for you", icon: "flag" },
      ],
    },
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
    {
      href: "/teach/messages",
      label: "Messages",
      icon: "messageSquare",
      badge: "messages",
      tabs: [
        { href: "/teach/messages", label: "Inbox", hint: "Conversations with families and colleagues" },
        { href: "/teach/announcements", label: "Announcements", hint: "School-wide notices", icon: "megaphone" },
      ],
    },
    {
      href: "/teach/pupils",
      label: "Pupils",
      icon: "backpack",
      tabs: [
        { href: "/teach/pupils", label: "Pupils", hint: "Records for the pupils you teach" },
        { href: "/teach/quran", label: "Qur'an and Qaidah", hint: "Recitation and memorisation progress", icon: "bookMarked" },
        { href: "/teach/behaviour", label: "Behaviour", hint: "Incidents and praise", icon: "heartHandshake" },
        { href: "/teach/stars", label: "Houses and stars", hint: "House points and Star of the Week", icon: "trophy" },
        { href: "/teach/absences", label: "Absences", hint: "Reported pupil absences", icon: "calendarX" },
      ],
    },
    { href: "/teach/reports", label: "Reports", icon: "fileText", hint: "Term reports for your classes" },
    {
      href: "/teach/curriculum",
      label: "Curriculum",
      icon: "library",
      tabs: [
        { href: "/teach/curriculum", label: "Lesson library", hint: "Lesson plans, resources and revision packs" },
        { href: "/teach/syllabus", label: "Syllabus", hint: "Schemes of work and exam specifications", icon: "scrollText" },
        { href: "/teach/revision", label: "Revision results", hint: "How your pupils did on each unit's revision", icon: "chartLine" },
      ],
    },
    {
      href: "/teach/calendar",
      label: "Calendar",
      icon: "calendarDays",
      tabs: [
        { href: "/teach/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/teach/parent-evenings", label: "Parent evenings", hint: "Your parent evening slots and bookings", icon: "calendarClock" },
      ],
    },
    {
      href: "/teach/profile",
      label: "My staff area",
      icon: "userRound",
      tabs: [
        { href: "/teach/profile", label: "My profile", hint: "Your teacher profile" },
        { href: "/teach/clock", label: "My hours", hint: "Clock-ins and hours worked", icon: "clock" },
        { href: "/teach/handbook", label: "Staff handbook", hint: "Policies and how-tos for staff", icon: "bookOpen" },
      ],
    },
  ],

  family: [
    {
      href: "/family/dashboard",
      label: "Home",
      icon: "house",
      badge: "actions",
      tabs: [
        { href: "/family/dashboard", label: "Overview", hint: "Your children's week" },
        { href: "/family/actions", label: "Action centre", hint: "Things waiting for you", icon: "flag" },
      ],
    },
    { href: "/family/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/family/homework"], hint: "Homework due and missing" },
    {
      href: "/family/messages",
      label: "Messages",
      icon: "messageSquare",
      badge: "messages",
      tabs: [
        { href: "/family/messages", label: "Inbox", hint: "Conversations with teachers and the office" },
        { href: "/family/announcements", label: "Announcements", hint: "Notices from the school", icon: "megaphone" },
      ],
    },
    {
      href: "/family/classes",
      label: "Classes",
      icon: "presentation",
      matchPrefixes: ["/family/class", "/family/lessons"],
      tabs: [
        { href: "/family/classes", label: "Classes", hint: "Your child's classes, lessons and classwork", matchPrefixes: ["/family/class", "/family/lessons"] },
        { href: "/family/teachers", label: "Teachers", hint: "Who teaches your child", icon: "users" },
      ],
    },
    {
      href: "/family/reports",
      label: "Progress",
      icon: "chartLine",
      tabs: [
        { href: "/family/reports", label: "Reports", hint: "Term reports", icon: "fileText" },
        { href: "/family/quran", label: "Qur'an", hint: "Qur'an and Qaidah: recitation and memorisation progress", icon: "bookMarked" },
        { href: "/family/behaviour", label: "Behaviour", hint: "Praise and incidents", icon: "heartHandshake" },
        { href: "/family/revision", label: "Revision", hint: "Unit revision results", icon: "target" },
      ],
    },
    {
      href: "/family/calendar",
      label: "Calendar",
      icon: "calendarDays",
      tabs: [
        { href: "/family/calendar", label: "Calendar", hint: "Term dates and school events" },
        { href: "/family/parent-evenings", label: "Parent evenings", hint: "Book a slot with your child's teachers", icon: "calendarClock" },
      ],
    },
    {
      href: "/family/child-details",
      label: "My family",
      icon: "houseHeart",
      tabs: [
        { href: "/family/child-details", label: "Child details", hint: "Contact, medical and consent details", icon: "contact" },
        { href: "/family/absences", label: "Report an absence", hint: "Tell us your child will be away", icon: "calendarX" },
        { href: "/family/fees", label: "Fees", hint: "Invoices and payments", icon: "wallet" },
      ],
    },
  ],

  student: [
    {
      href: "/student/dashboard",
      label: "Home",
      icon: "house",
      badge: "actions",
      tabs: [
        { href: "/student/dashboard", label: "Overview", hint: "Your day" },
        { href: "/student/actions", label: "Action centre", hint: "Things waiting for you", icon: "flag" },
      ],
    },
    { href: "/student/todo", label: "To do", icon: "listChecks", badge: "todo", matchPrefixes: ["/student/homework"], hint: "Homework due and missing" },
    { href: "/student/classes", label: "My classes", icon: "presentation", matchPrefixes: ["/student/class", "/student/lessons"], hint: "Your classes, lessons and classwork" },
    {
      href: "/student/revision",
      label: "Learning",
      icon: "bookOpen",
      tabs: [
        { href: "/student/revision", label: "Unit revision", hint: "Revise each unit and test yourself", icon: "target" },
        { href: "/student/quran", label: "Qur'an and Qaidah", hint: "Your recitation and memorisation", icon: "bookMarked" },
      ],
    },
    {
      href: "/student/reports",
      label: "Progress",
      icon: "chartLine",
      tabs: [
        { href: "/student/reports", label: "Reports", icon: "fileText" },
        { href: "/student/behaviour", label: "Behaviour", icon: "heartHandshake" },
      ],
    },
    {
      href: "/student/calendar",
      label: "School",
      icon: "school",
      tabs: [
        { href: "/student/calendar", label: "Calendar", icon: "calendarDays" },
        { href: "/student/announcements", label: "Announcements", icon: "megaphone" },
        { href: "/student/teachers", label: "My teachers", icon: "users" },
      ],
    },
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
    // A hub with one page left for this user is just that page. If that page
    // is the hub's own first page, it keeps the hub's name ("Home", not "Overview").
    const own = tabs.length === 1 && tabs[0].href === i.href;
    if (tabs.length === 1) out.push({ ...i, id: i.href, href: tabs[0].href, label: own ? i.label : tabs[0].label, icon: own ? i.icon : tabs[0].icon || i.icon, hint: tabs[0].hint, tabs });
    else out.push({ ...i, id: i.href, href: tabs[0].href, tabs });
  }
  return out;
}

/** Every page this user can open in an area, one row per page (hub tabs
 * included, with the hub as `parent`) · the command palette lists these. */
export function visiblePages(area: PortalArea, roles: string[]): { href: string; label: string; hint?: string; parent?: string; icon: SidebarIcon }[] {
  const pages: { href: string; label: string; hint?: string; parent?: string; icon: SidebarIcon }[] = visibleSidebar(area, roles).flatMap((i) =>
    i.tabs && i.tabs.length > 1
      ? i.tabs.map((t) => ({ href: t.href, label: t.label, hint: t.hint, parent: i.label === t.label ? undefined : i.label, icon: t.icon || i.icon }))
      : [{ href: i.href, label: i.label, hint: i.hint || i.tabs?.[0]?.hint, icon: i.icon }],
  );
  // The index of every admin page is not in the sidebar itself (its footer links to it).
  if (area === "admin") pages.push({ href: ADMIN_INDEX_HREF, label: "Site administration", hint: "Every admin page in one searchable list", icon: "layoutGrid" });
  return pages;
}

/** Site administration: every admin page in one searchable list. */
export const ADMIN_INDEX_HREF = "/admin/site";

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

/** Areas whose sidebar is long enough to need headed, collapsible groups.
 * The others are short flat lists (seven or eight entries). */
const GROUPED_AREAS: PortalArea[] = ["admin"];

/** The sidebar layout. Flat areas: one link per entry, in the order written
 * above. Grouped areas: the first group's entries are plain links at the top
 * (the everyday destinations), then one section per remaining group, in order. */
export function sidebarLayout(area: PortalArea, roles: string[]): SidebarEntry[] {
  const items = visibleSidebar(area, roles);
  if (!GROUPED_AREAS.includes(area)) return items.map((item) => ({ kind: "link", item }));
  const firstGroup = SIDEBAR_NAV[area][0]?.group;
  const out: SidebarEntry[] = [];
  for (const item of items) {
    if (!item.group || item.group === firstGroup) {
      out.push({ kind: "link", item });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "section" && last.section.label === item.group) last.section.items.push(item);
    else out.push({ kind: "section", section: { label: item.group, icon: item.icon, items: [item] } });
  }
  return out;
}

export const AREA_SUBTITLE: Record<PortalArea, string> = {
  admin: "School administration",
  teach: "Teacher portal",
  family: "Parent portal",
  student: "Student portal",
};

/** The places each kind of user goes most, in priority order: the phone tab
 * bar shows the first four this user can open (see mobileTabsFor), and the
 * phone "More" menu leaves those out so nothing appears twice. Each is a
 * sidebar entry's href (for a hub, any of its tabs). Extra entries are
 * fallbacks for roles that can't open the earlier ones. */
export const MOBILE_TABS: Record<PortalArea, string[]> = {
  student: ["/student/dashboard", "/student/todo", "/student/classes", "/student/revision"],
  family: ["/family/dashboard", "/family/todo", "/family/messages", "/family/classes"],
  teach: ["/teach/today", "/teach/classes", "/teach/review", "/teach/messages"],
  admin: ["/admin/dashboard", "/admin/messages", "/admin/pupils", "/admin/attendance", "/admin/admissions", "/admin/calendar"],
};

/** The (at most four) sidebar entries in this user's phone tab bar. */
export function mobileTabsFor(area: PortalArea, roles: string[]): SidebarItem[] {
  const visible = visibleSidebar(area, roles);
  const out: SidebarItem[] = [];
  for (const href of MOBILE_TABS[area]) {
    const item = visible.find((i) => itemHasHref(i, href));
    if (item && !out.includes(item)) out.push(item);
    if (out.length === 4) break;
  }
  return out;
}

/** Does this sidebar entry stand for the given href (its own, or one of its tabs)? */
export function itemHasHref(item: SidebarItem, href: string): boolean {
  return item.href === href || !!item.tabs?.some((t) => t.href === href);
}

/** The sidebar layout without the given pages. A section left empty is
 * dropped; one left with a single page keeps its heading, so the groups stay
 * where people expect them. */
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
    if (items.length > 0) out.push({ kind: "section", section: { ...e.section, items } });
  }
  return out;
}
