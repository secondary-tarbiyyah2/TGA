import { LEARN_ORIGIN } from "./learn/origin";

export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; items: NavLink[] };
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Grouped so no label wraps onto two lines in the header. Five top-level
// groups — About / Learning / Admissions / Parents / Contact — plus a single
// "Book a free call" primary CTA (see primaryCta below). Applying is still
// reachable via Admissions → "How to apply"; it's just no longer the header's
// primary button. "Parents" gathers pages that used to be scattered across
// About and the footer only (Policies, Safeguarding, Term Dates, Open
// Evening, Pastoral care) into one place a parent would actually look.
export const primaryNav: NavEntry[] = [
  { href: "/", label: "Home" },
  {
    label: "About",
    items: [
      { href: "/about", label: "About us" },
      { href: "/team", label: "Meet the team" },
      { href: "/testimonials", label: "Testimonials" },
    ],
  },
  {
    label: "Learning",
    items: [
      { href: "/curriculum", label: "Curriculum" },
      { href: "/flexible-learning", label: "Flexible learning" },
    ],
  },
  {
    label: "Admissions",
    items: [
      { href: "/eligibility", label: "Is it right for us?" },
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/book-a-call", label: "Book a free call" },
    ],
  },
  {
    label: "Parents",
    items: [
      { href: "/policies", label: "Policies" },
      { href: "/safeguarding", label: "Safeguarding" },
      { href: "/term-dates", label: "Term dates" },
      { href: "/open-evening", label: "Open evening" },
      { href: "/pastoral-care", label: "Pastoral care" },
    ],
  },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

export const footerNav = [
  { href: "/term-dates", label: "Term Dates" },
  { href: "/open-evening", label: "Virtual Open Evening" },
  { href: "/safeguarding", label: "Safeguarding" },
  { href: "/policies", label: "Policies" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/terms", label: "Terms" },
];

// A single, unambiguous primary CTA. Applying remains reachable (Admissions
// → "How to apply"), but a free call is a lower-commitment first step and is
// what the header now leads with.
export const primaryCta = { href: "/book-a-call", label: "Book a free call" };
// Single log-in destination across header, mobile drawer and footer — /staff
// and /portal both 301-redirect to this same URL at the server level (see
// public/.htaccess), so there is only ever one login entry point live. This
// is a cross-origin, absolute link (not "/learn/login") because /learn lives
// on its own subdomain — see src/lib/learn/origin.ts.
export const portalCta = { href: `${LEARN_ORIGIN}/login`, label: "Log in" };
export const openEveningCta = { href: "/open-evening", label: "Book Open Evening" };
