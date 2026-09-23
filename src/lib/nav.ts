export type NavLink = { href: string; label: string };
export type NavGroup = { label: string; items: NavLink[] };
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Grouped so no label wraps onto two lines in the header. Some target pages
// (Journey Planner, a dedicated admissions-call booking flow, separate
// Parent/Student portals) don't exist yet — those come with later prompts
// (booking engine, portals) and are intentionally left out rather than
// linking somewhere that doesn't exist yet.
export const primaryNav: NavEntry[] = [
  { href: "/", label: "Home" },
  {
    label: "About",
    items: [
      { href: "/about", label: "About us" },
      { href: "/team", label: "Meet the team" },
      { href: "/pastoral-care", label: "Pastoral care" },
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
      { href: "/admissions", label: "How to apply" },
      { href: "/fees", label: "Fees" },
      { href: "/open-evening", label: "Book an admissions call" },
    ],
  },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

export const footerNav = [
  { href: "/term-dates", label: "Term Dates" },
  { href: "/open-evening", label: "Virtual Open Evening" },
  { href: "/portal", label: "Parent/Student Portal" },
  { href: "/policies", label: "Policies" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/terms", label: "Terms" },
];

export const primaryCta = { href: "/admissions", label: "Apply Now" };
export const portalCta = { href: "/portal", label: "Portals" };
export const openEveningCta = { href: "/open-evening", label: "Book Open Evening" };
