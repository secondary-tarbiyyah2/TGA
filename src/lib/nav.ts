import { LEARN_ORIGIN } from "./learn/origin";

import type { IconName } from "@/components/learn/Icon";

export type NavLink = { href: string; label: string; icon?: IconName; desc?: string };
/** A highlighted call to action shown beside a group's links in the desktop menu. */
export type NavFeature = { eyebrow: string; title: string; body: string; href: string; cta: string };
export type NavGroup = { label: string; items: NavLink[]; blurb?: string; feature?: NavFeature };
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Five top-level items in the order a prospective parent thinks: understand
// the school (Our School) → see how learning works (Learning) → decide,
// cost it and take the next step (Admissions) → enrolled families (For
// Parents) → Contact. Admissions is for prospective families and For
// Parents for current ones, so neither group wades through the other's
// links. On desktop each group opens a panel (icon, link, one-line
// description, plus a featured next step); in the mobile drawer it is an
// expandable section. `blurb` is the one-line hint under the group name on
// mobile. Every existing URL stays live and is reachable from a menu, a hub
// page or the footer.
export const primaryNav: NavEntry[] = [
  {
    label: "Our School",
    blurb: "About us, testimonials, FAQs, careers",
    items: [
      { href: "/about", label: "About us", icon: "school", desc: "Who we are and the trust behind us" },
      { href: "/testimonials", label: "Testimonials", icon: "messageSquare", desc: "Family stories, once our first cohort joins" },
      { href: "/faqs", label: "FAQs", icon: "circleHelp", desc: "Fees, lessons, technology and more" },
      { href: "/careers", label: "Careers", icon: "briefcase", desc: "Teach with us, wherever you are" },
    ],
    feature: { eyebrow: "Meet us", title: "Online open evening", body: "See a lesson, meet the team and ask anything.", href: "/open-evening#open-evenings", cta: "Choose a date" },
  },
  {
    label: "Learning",
    blurb: "Curriculum, how live lessons work, support",
    items: [
      { href: "/learning", label: "How learning works", icon: "monitor", desc: "Live lessons, timetable and classes" },
      { href: "/curriculum", label: "Curriculum by key stage", icon: "bookOpen", desc: "National curriculum with Qur'an, Arabic and Islamic Studies" },
      { href: "/pastoral-care", label: "Pastoral care & SEND", icon: "heartHandshake", desc: "Wellbeing, character and extra support" },
    ],
    feature: { eyebrow: "Try it", title: "Taster morning", body: "Your child joins real lessons before you decide.", href: "/open-evening#taster", cta: "Book a taster" },
  },
  {
    label: "Admissions",
    blurb: "Is it right for us? Open evenings, fees and how to apply",
    items: [
      { href: "/eligibility", label: "Is it right for us?", icon: "listChecks", desc: "Two minutes: lesson times, fees, next step" },
      { href: "/admissions", label: "How to apply", icon: "clipboardCheck", desc: "The six steps from form to first lesson" },
      { href: "/fees", label: "Fees", icon: "wallet", desc: "Costs, sibling discount and payment plans" },
      { href: "/open-evening#open-evenings", label: "Online open evenings", icon: "presentation", desc: "Meet us live from home" },
      { href: "/open-evening#taster", label: "Taster morning", icon: "sun", desc: "Join real lessons for a morning" },
      { href: "/prospectus/TGA-Prospectus-2026-27.pdf", label: "Prospectus (PDF)", icon: "download", desc: "Everything in one download" },
    ],
    feature: { eyebrow: "Founding cohort", title: "Apply online", body: "About ten minutes, and several children at once.", href: "/admissions/apply", cta: "Start your application" },
  },
  {
    label: "For Parents",
    blurb: "Parent hub, term dates, policies",
    items: [
      { href: "/parents", label: "Parent hub", icon: "houseHeart", desc: "Everything for current families" },
      { href: "/term-dates", label: "Term dates", icon: "calendarDays", desc: "Terms, holidays and key dates" },
      { href: "/policies", label: "Policies", icon: "scrollText", desc: "Safeguarding, admissions, fees, data" },
      { href: "/safeguarding", label: "Safeguarding", icon: "shieldCheck", desc: "How we keep children safe" },
      { href: "/manage-booking", label: "Manage a booking", icon: "calendarClock", desc: "Change or cancel a call" },
    ],
    feature: { eyebrow: "Families", title: "Learning portal", body: "Timetable, classwork, reports and messages.", href: `${LEARN_ORIGIN}/login`, cta: "Sign in" },
  },
  { href: "/contact", label: "Contact" },
];

export type HubCard = { href: string; title: string; body: string };

export const learningHub: HubCard[] = [
  // The key stage pages are listed with their lessons a week on /learning itself, so not repeated here.
  { href: "/curriculum", title: "Curriculum", body: "Qur'an, Arabic and Islamic Studies alongside the full national curriculum, Year 1 to International GCSE." },
  { href: "/pastoral-care", title: "Pastoral care & SEND", body: "How we support every child's wellbeing, character and additional needs." },
  { href: "/eligibility", title: "Is it right for us?", body: "Two minutes: an honest answer, your local lesson times, the fees and the next step." },
];

export const parentsHub: HubCard[] = [
  { href: "/term-dates", title: "Term dates", body: "Term dates and the admissions calendar for the January 2027 launch." },
  { href: "/policies", title: "Policies", body: "Our school policies, including Safeguarding, Admissions, Fees and Data Protection." },
  { href: "/safeguarding", title: "Safeguarding", body: "How we keep children safe, and how to raise a concern." },
  { href: "/pastoral-care", title: "Pastoral care & SEND", body: "Wellbeing, character and additional needs support." },
  { href: "/faqs", title: "FAQs", body: "Fees, curriculum, technology, Islamic Studies and SEND." },
  { href: "/manage-booking", title: "Manage a booking", body: "Change or cancel an existing call booking." },
];

export const aboutHub: HubCard[] = [
  { href: "/testimonials", title: "Testimonials", body: "Words from our families, published once our founding cohort has joined." },
  { href: "/safeguarding", title: "Safeguarding", body: "Our commitment to every child's safety." },
  { href: "/pastoral-care", title: "Pastoral care", body: "How we nurture wellbeing and character." },
];

// Footer: four matching columns of links (+ brand/contact block in Footer.tsx).
export const footerColumns: { heading: string; links: NavLink[] }[] = [
  {
    heading: "School",
    links: [
      { href: "/about", label: "About us" },
      { href: "/testimonials", label: "Testimonials" },
      { href: "/learning", label: "How learning works" },
      { href: "/curriculum", label: "Curriculum" },
      { href: "/careers", label: "Careers" },
    ],
  },
  {
    heading: "Admissions",
    links: [
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/open-evening#open-evenings", label: "Online open evenings" },
      { href: "/open-evening#taster", label: "Taster morning" },
      { href: "/prospectus/TGA-Prospectus-2026-27.pdf", label: "Prospectus (PDF)" },
      { href: "/book-a-call#book", label: "Book a free call" },
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
      { href: "/contact", label: "Contact" },
      { href: `${LEARN_ORIGIN}/login`, label: "Sign in to the portal" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/accessibility", label: "Accessibility" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

// Kept for backwards compatibility with any importer.
export const footerNav = footerColumns.flatMap((c) => c.links);

// One primary action (Apply) and one secondary (Book a free call) for
// families who are not ready to apply; Register interest is the holding
// site's own form. The free call is also reachable from "Is it right for us?",
// the open-evening page and the footer.
export const primaryCta = { href: "/admissions", label: "Apply now" };
export const secondaryCta = { href: "/book-a-call#book", label: "Book a free call" };
// Single log-in destination across header, mobile drawer and footer, /staff
// and /portal both 301-redirect to this same URL at the server level (see
// public/.htaccess), so there is only ever one login entry point live. This
// is a cross-origin, absolute link (not "/learn/login") because /learn lives
// on its own subdomain, see src/lib/learn/origin.ts.
export const portalCta = { href: `${LEARN_ORIGIN}/login`, label: "Staff & parent sign-in", shortLabel: "Sign in" };
export const openEveningCta = { href: "/open-evening", label: "Book Open Evening" };
