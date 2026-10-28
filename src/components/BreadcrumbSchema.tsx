"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JsonLd } from "./JsonLd";
import { Container } from "./Container";
import { breadcrumbJsonLd } from "@/lib/seo";
import { keyStages } from "@/content/curriculum";

// Human names for the indexable marketing routes. Pages not listed here
// (home, noindex tools, anything new) simply emit no breadcrumb rather than
// a guessed one.
const NAMES: Record<string, string> = {
  "/about": "Our School",
  "/testimonials": "Testimonials",
  "/learning": "Learning",
  "/curriculum": "Curriculum",
  "/pastoral-care": "Pastoral care & SEND",
  "/eligibility": "Is it right for us?",
  "/admissions": "Admissions",
  "/fees": "Fees",
  "/book-a-call": "Book a free call",
  "/parents": "For Parents",
  "/term-dates": "Term dates",
  "/policies": "Policies",
  "/safeguarding": "Safeguarding",
  "/open-evening": "Open evenings & taster morning",
  "/manage-booking": "Manage a booking",
  "/sample-lesson": "Sample lesson",
  "/faqs": "FAQs",
  "/contact": "Contact",
  "/legal/privacy": "Privacy policy",
  "/legal/cookies": "Cookie policy",
  "/legal/terms": "Terms",
};

// Section parents, mirroring the header groups in src/lib/nav.ts (Our School
// → /about, Learning → /learning, Admissions → /admissions, For Parents →
// /parents), so the visible trail and the menu agree.
const PARENT: Record<string, string> = {
  "/testimonials": "/about",
  "/faqs": "/about",
  "/pastoral-care": "/learning",
  "/curriculum": "/learning",
  "/sample-lesson": "/learning",
  "/eligibility": "/admissions",
  "/open-evening": "/admissions",
  "/fees": "/admissions",
  "/book-a-call": "/admissions",
  "/term-dates": "/parents",
  "/policies": "/parents",
  "/safeguarding": "/parents",
  "/manage-booking": "/parents",
};

export function BreadcrumbSchema() {
  const raw = usePathname() || "/";
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;

  const trail: { name: string; path: string }[] = [];
  const stage = path.startsWith("/curriculum/") ? keyStages.find((k) => `/curriculum/${k.slug}` === path) : undefined;
  if (stage) {
    trail.push({ name: NAMES["/learning"], path: "/learning" }, { name: NAMES["/curriculum"], path: "/curriculum" }, { name: stage.range, path });
  } else if (NAMES[path]) {
    const parent = PARENT[path];
    if (parent) {
      const grand = PARENT[parent];
      if (grand) trail.push({ name: NAMES[grand], path: grand });
      trail.push({ name: NAMES[parent], path: parent });
    }
    trail.push({ name: NAMES[path], path });
  }
  if (trail.length === 0) return null;
  return <JsonLd data={breadcrumbJsonLd(trail)} />;
}

/**
 * The visible trail (Home › Admissions › Fees) at the top of every section
 * page, so a visitor who arrived from search or a deep link can see where
 * they are and step up a level. Uses the same NAMES/PARENT map as the
 * JSON-LD above so the two never disagree. Top-level hubs (/about,
 * /learning, /admissions, /parents, /contact) show just "Home › Section".
 */
export function Breadcrumbs() {
  const raw = usePathname() || "/";
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;

  const trail: { name: string; path: string }[] = [];
  const stage = path.startsWith("/curriculum/") ? keyStages.find((k) => `/curriculum/${k.slug}` === path) : undefined;
  if (stage) {
    trail.push({ name: NAMES["/learning"], path: "/learning" }, { name: NAMES["/curriculum"], path: "/curriculum" }, { name: stage.range, path });
  } else if (NAMES[path]) {
    const parent = PARENT[path];
    if (parent) {
      const grand = PARENT[parent];
      if (grand) trail.push({ name: NAMES[grand], path: grand });
      trail.push({ name: NAMES[parent], path: parent });
    }
    trail.push({ name: NAMES[path], path });
  }
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="border-b border-gold-light/30 bg-cream/60">
      <Container>
        <ol className="flex flex-wrap items-center gap-1 py-2 text-xs text-ink/60">
          <li>
            <Link href="/" className="hover:text-gold-700">Home</Link>
          </li>
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={crumb.path} className="flex items-center gap-1">
                <span aria-hidden="true">›</span>
                {last ? (
                  <span aria-current="page" className="font-medium text-ink/80">{crumb.name}</span>
                ) : (
                  <Link href={crumb.path} className="hover:text-gold-700">{crumb.name}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </nav>
  );
}
