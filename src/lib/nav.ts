import { LEARN_ORIGIN } from "./learn/origin";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; items: NavLink[]; blurb?: string };
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Five top-level items in the order a prospective parent thinks: understand
// the school (Our School) → see how learning works (Learning) → decide,
// cost it and take the next step (Admissions) → enrolled families (For
// Parents) → Contact. Admissions is for prospective families and For
// Parents for current ones, so neither group wades through the other's
// links. Each group is a single-level dropdown on desktop and an
// expandable section in the mobile drawer; `blurb` is the one-line hint
// shown under the group name on mobile. Every existing URL stays live and
// is reachable from a dropdown, a hub page or the footer.
export const primaryNav: NavEntry[] = [
  {
    label: "Our School",
    blurb: "About us, team, testimonials, FAQs",
    items: [
      { href: "/about", label: "About us" },
      { href: "/testimonials", label: "Testimonials" },
      { href: "/faqs", label: "FAQs" },
    ],
  },
  {
    label: "Learning",
    blurb: "Curriculum, how live lessons work, support",
    items: [
      { href: "/learning", label: "How learning works" },
      { href: "/curriculum", label: "Curriculum by key stage" },
      { href: "/pastoral-care", label: "Pastoral care & SEND" },
    ],
  },
  {
    label: "Admissions",
    blurb: "Is it right for us? Open evenings, fees and how to apply",
    items: [
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/open-evening", label: "Open evenings & taster morning" },
      { href: "/fees", label: "Fees" },
      { href: "/admissions", label: "How to apply" },
      { href: "/prospectus/TGA-Prospectus-2026-27.pdf", label: "Prospectus (PDF)" },
    ],
  },
  {
    label: "For Parents",
    blurb: "Parent hub, term dates, policies",
    items: [
      { href: "/parents", label: "Parent hub" },
      { href: "/term-dates", label: "Term dates" },
      { href: "/policies", label: "Policies" },
      { href: "/safeguarding", label: "Safeguarding" },
      { href: "/manage-booking", label: "Manage a booking" },
    ],
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
    ],
  },
  {
    heading: "Admissions",
    links: [
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/open-evening", label: "Open evenings & taster morning" },
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
