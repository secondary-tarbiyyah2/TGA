import { LEARN_ORIGIN } from "./learn/origin";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; items: NavLink[] };
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Five top-level items — About / Learning / Admissions / Parents / Contact —
// plus a prominent "Apply" CTA and a "Log in" link. Only About and Admissions
// open a (single-level) dropdown; Learning and Parents are plain links to hub
// pages (/learning, /parents) whose sub-pages are presented as cards, so the
// detail lives on sub-pages rather than in menu items. Every existing URL is
// still live and reachable from a hub, the footer or a dropdown.
export const primaryNav: NavEntry[] = [
  {
    label: "About",
    items: [
      { href: "/about", label: "About us" },
      { href: "/team", label: "Meet the team" },
      { href: "/testimonials", label: "Testimonials" },
    ],
  },
  { href: "/learning", label: "Learning" },
  {
    label: "Admissions",
    items: [
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/book-a-call", label: "Book a free call" },
    ],
  },
  { href: "/parents", label: "Parents" },
  { href: "/contact", label: "Contact" },
];

export type HubCard = { href: string; title: string; body: string };

export const learningHub: HubCard[] = [
  { href: "/curriculum", title: "Curriculum", body: "The full British national curriculum plus Islamic Studies, by key stage, Reception to GCSE." },
  { href: "/curriculum/reception-year-2", title: "Reception – Year 2", body: "View timetable, subjects and sample week." },
  { href: "/curriculum/year-3-6", title: "Year 3 – Year 6", body: "View timetable, subjects and sample week." },
  { href: "/curriculum/year-7-9", title: "Year 7 – Year 9", body: "View timetable, subjects and sample week." },
  { href: "/curriculum/year-10-11", title: "Year 10 – Year 11 (GCSE)", body: "View timetable, subjects and sample week." },
  { href: "/pastoral-care", title: "Pastoral care & SEND", body: "How we support every child's wellbeing, character and additional needs." },
  { href: "/eligibility", title: "Your child's week", body: "Five short questions to see a sample week in your own timezone." },
];

export const parentsHub: HubCard[] = [
  { href: "/term-dates", title: "Term dates", body: "Term dates and the admissions calendar for the January 2027 launch." },
  { href: "/policies", title: "Policies", body: "Our statutory school policies, including Safeguarding, Admissions, Fees and Data Protection." },
  { href: "/safeguarding", title: "Safeguarding", body: "How we keep children safe, and how to raise a concern." },
  { href: "/pastoral-care", title: "Pastoral care & SEND", body: "Wellbeing, character and additional needs support." },
  { href: "/open-evening", title: "Virtual open evening", body: "Book a place, or watch a past recording." },
  { href: "/faqs", title: "FAQs", body: "Admissions, fees, curriculum, technology, Islamic Studies and SEND." },
  { href: "/manage-booking", title: "Manage a booking", body: "Change or cancel an existing call booking." },
];

export const aboutHub: HubCard[] = [
  { href: "/team", title: "Meet the team", body: "Who teaches at the Academy, as appointments are confirmed." },
  { href: "/testimonials", title: "Testimonials", body: "What parents and students say about the Academy." },
  { href: "/safeguarding", title: "Safeguarding", body: "Our commitment to every child's safety." },
  { href: "/pastoral-care", title: "Pastoral care", body: "How we nurture wellbeing and character." },
];

// Footer: four matching columns of links (+ brand/contact block in Footer.tsx).
export const footerColumns: { heading: string; links: NavLink[] }[] = [
  {
    heading: "School",
    links: [
      { href: "/about", label: "About us" },
      { href: "/team", label: "Meet the team" },
      { href: "/testimonials", label: "Testimonials" },
      { href: "/curriculum", label: "Curriculum" },
      { href: "/learning", label: "Learning" },
    ],
  },
  {
    heading: "Admissions",
    links: [
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/open-evening", label: "Virtual open evening" },
      { href: "/book-a-call", label: "Book a free call" },
    ],
  },
  {
    heading: "Parents",
    links: [
      { href: "/parents", label: "Parent hub" },
      { href: "/term-dates", label: "Term dates" },
      { href: "/safeguarding", label: "Safeguarding" },
      { href: "/policies", label: "Policies" },
      { href: "/faqs", label: "FAQs" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

// Kept for backwards compatibility with any importer.
export const footerNav = footerColumns.flatMap((c) => c.links);

// Primary header CTA is Apply; a free call stays reachable under Admissions.
export const primaryCta = { href: "/admissions", label: "Apply" };
// Single log-in destination across header, mobile drawer and footer — /staff
// and /portal both 301-redirect to this same URL at the server level (see
// public/.htaccess), so there is only ever one login entry point live. This
// is a cross-origin, absolute link (not "/learn/login") because /learn lives
// on its own subdomain — see src/lib/learn/origin.ts.
export const portalCta = { href: `${LEARN_ORIGIN}/login`, label: "Log in" };
export const openEveningCta = { href: "/open-evening", label: "Book Open Evening" };
