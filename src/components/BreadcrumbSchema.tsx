"use client";

import { usePathname } from "next/navigation";
import { JsonLd } from "./JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";
import { keyStages } from "@/content/curriculum";

// Human names for the indexable marketing routes. Pages not listed here
// (home, noindex tools, anything new) simply emit no breadcrumb rather than
// a guessed one.
const NAMES: Record<string, string> = {
  "/about": "About us",
  "/team": "Meet the team",
  "/testimonials": "Testimonials",
  "/learning": "Learning",
  "/curriculum": "Curriculum",
  "/pastoral-care": "Pastoral care & SEND",
  "/eligibility": "Is it right for us?",
  "/admissions": "Admissions",
  "/fees": "Fees",
  "/book-a-call": "Book a free call",
  "/parents": "Parents",
  "/term-dates": "Term dates",
  "/policies": "Policies",
  "/safeguarding": "Safeguarding",
  "/open-evening": "Virtual open evening",
  "/faqs": "FAQs",
  "/contact": "Contact",
  "/legal/privacy": "Privacy policy",
  "/legal/cookies": "Cookie policy",
  "/legal/terms": "Terms",
};

// Section parents, so the trail reflects the site's structure.
const PARENT: Record<string, string> = {
  "/pastoral-care": "/learning",
  "/curriculum": "/learning",
  "/eligibility": "/learning",
  "/fees": "/admissions",
  "/book-a-call": "/admissions",
  "/term-dates": "/parents",
  "/policies": "/parents",
  "/safeguarding": "/parents",
  "/open-evening": "/parents",
  "/faqs": "/parents",
  "/team": "/about",
  "/testimonials": "/about",
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
