import type { IconName } from "@/components/learn/Icon";
import { primaryNav, isNavGroup, portalCta } from "@/lib/nav";
import { keyStages } from "@/content/curriculum";

// The path a prospective family takes through the site, used by the
// "Your journey" bar at the top of these pages (src/components/JourneyBar.tsx)
// so every page says where you are and what comes next.

export type JourneyStep = { key: string; label: string; href: string; icon: IconName; pages: string[]; nextLabel: string };

export const JOURNEY: JourneyStep[] = [
  {
    key: "explore",
    label: "Explore",
    href: "/learning",
    icon: "school",
    pages: ["/about", "/learning", "/curriculum", "/pastoral-care", "/sample-lesson", "/testimonials", ...keyStages.map((k) => `/curriculum/${k.slug}`)],
    nextLabel: "See how the school works",
  },
  { key: "fit", label: "Check the fit", href: "/eligibility", icon: "listChecks", pages: ["/eligibility"], nextLabel: "Is it right for us? (2 minutes)" },
  { key: "fees", label: "Fees", href: "/fees", icon: "wallet", pages: ["/fees"], nextLabel: "See the fees" },
  { key: "meet", label: "Meet us", href: "/open-evening", icon: "presentation", pages: ["/open-evening", "/book-a-call"], nextLabel: "Open evening or a free call" },
  { key: "apply", label: "Apply", href: "/admissions", icon: "clipboardCheck", pages: ["/admissions", "/admissions/apply"], nextLabel: "How to apply" },
];

export function normalisePath(raw: string): string {
  return raw.length > 1 ? raw.replace(/\/$/, "") : raw;
}

/** The step this page belongs to, or -1 when it isn't on the journey. */
export function journeyIndex(path: string): number {
  return JOURNEY.findIndex((s) => s.pages.includes(path));
}

// ── Site search (the public command palette) ─────────────────────────────

export type SitePage = { href: string; title: string; desc: string; group: string; icon: IconName; keywords?: string };

const EXTRA: SitePage[] = [
  { href: "/", title: "Home", desc: "Start here", group: "Start", icon: "house" },
  { href: "/admissions/apply", title: "Apply online", desc: "About ten minutes, several children at once", group: "Admissions", icon: "notebookPen", keywords: "application form enrol register" },
  { href: "/book-a-call#book", title: "Book a free call", desc: "20 minutes with admissions, at a time that suits you", group: "Admissions", icon: "calendarCheck", keywords: "phone talk speak meeting" },
  { href: "/careers", title: "Careers", desc: "Working at Tarbiyyah Global Academy", group: "Our School", icon: "briefcase", keywords: "jobs work teacher vacancy staff recruitment hiring" },
  { href: "/contact", title: "Contact", desc: "Email, phone or register your interest", group: "Contact", icon: "mail", keywords: "email phone address register interest" },
  { href: "/sample-lesson", title: "Sample lesson", desc: "See what a live lesson looks like", group: "Learning", icon: "play" },
  { href: "/accessibility", title: "Accessibility", desc: "How we make the site work for everyone", group: "About the site", icon: "eye" },
  { href: "/legal/privacy", title: "Privacy policy", desc: "How we use your information", group: "About the site", icon: "shieldCheck", keywords: "gdpr data" },
  { href: portalCta.href, title: "Sign in to the portal", desc: "For enrolled families and staff", group: "For Parents", icon: "logOut", keywords: "login portal account" },
  ...keyStages.map((k) => ({
    href: `/curriculum/${k.slug}`,
    title: `Curriculum: ${k.range}`,
    desc: k.title,
    group: "Learning",
    icon: "bookOpen" as IconName,
    keywords: `${k.title} ${k.range} key stage year`,
  })),
];

const GROUP_NAMES: Record<string, string> = { "Our School": "Our School", Learning: "Learning", Admissions: "Admissions", "For Parents": "For Parents" };

/** Every public page worth jumping to: the menus plus a few extras, without duplicates. */
export const SITE_PAGES: SitePage[] = (() => {
  const out: SitePage[] = [];
  const seen = new Set<string>();
  const add = (p: SitePage) => {
    if (seen.has(p.href)) return;
    seen.add(p.href);
    out.push(p);
  };
  add(EXTRA[0]);
  for (const entry of primaryNav) {
    if (!isNavGroup(entry)) continue;
    for (const item of entry.items) {
      add({ href: item.href, title: item.label, desc: item.desc ?? "", group: GROUP_NAMES[entry.label] ?? entry.label, icon: item.icon ?? "fileText" });
    }
  }
  for (const p of EXTRA.slice(1)) add(p);
  return out;
})();
