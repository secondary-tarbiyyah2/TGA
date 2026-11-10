"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "./Container";
import { Icon } from "@/components/learn/Icon";
import { JOURNEY, journeyIndex } from "@/lib/siteJourney";

type Related = { href: string; label: string; body: string };

// "Where next" links at the foot of the main section pages, following the
// order a prospective parent works through: understand → check the fit →
// cost it → see the school → apply. Rendered once from the marketing layout
// so every page gets the same treatment; pages not listed get nothing. The
// eligibility check is deliberately not listed: its result already ends with
// the next steps, and a second block underneath was clutter (owner, Nov 2026).
const RELATED: Record<string, Related[]> = {
  "/about": [
    { href: "/learning", label: "How learning works", body: "Live lessons, the portals and the school day." },
    { href: "/curriculum", label: "Curriculum by key stage", body: "Subjects and timetables, Year 1 to Year 11." },
    { href: "/eligibility", label: "Is it right for us?", body: "An honest two-minute check before you apply." },
  ],
  "/learning": [
    { href: "/curriculum", label: "Curriculum by key stage", body: "Subjects and timetables, Year 1 to Year 11." },
    { href: "/eligibility", label: "Is it right for us?", body: "An honest answer, your local lesson times, fees and the next step." },
    { href: "/fees", label: "Fees", body: "Published fees and payment plans." },
  ],
  "/curriculum": [
    { href: "/learning", label: "How learning works", body: "Live lessons, the portals and the school day." },
    { href: "/eligibility", label: "Is it right for us?", body: "An honest two-minute check before you apply." },
    { href: "/fees", label: "Fees", body: "Published fees and payment plans." },
  ],
  "/fees": [
    { href: "/book-a-call#book", label: "Book a free call", body: "Talk fees and payment plans through with admissions." },
    { href: "/faqs", label: "FAQs", body: "Payment plans, discounts and what is included." },
    { href: "/term-dates", label: "Term dates", body: "Payment dates alongside the school calendar." },
  ],
  "/admissions": [
    { href: "/book-a-call#book", label: "Book a free call", body: "No obligation, 20 minutes." },
    { href: "/curriculum", label: "Curriculum by key stage", body: "Subjects and timetables, Year 1 to Year 11." },
    { href: "/faqs", label: "FAQs", body: "Assessment, joining mid-year and applying from abroad." },
  ],
  "/open-evening": [
    { href: "/book-a-call#book", label: "Book a free call", body: "Can't make a date? Talk to admissions instead." },
    { href: "/fees", label: "Fees", body: "Published fees and payment plans." },
    { href: "/admissions", label: "How to apply", body: "The steps, the dates and what you need." },
  ],
  "/term-dates": [
    { href: "/open-evening", label: "Open evenings & taster morning", body: "Dates for November and December." },
    { href: "/policies", label: "Policies", body: "Attendance, fees, safeguarding and more." },
    { href: "/parents", label: "Parent hub", body: "Everything for enrolled families." },
  ],
  "/policies": [
    { href: "/safeguarding", label: "Safeguarding", body: "How to raise a concern." },
    { href: "/term-dates", label: "Term dates", body: "The academic calendar." },
    { href: "/contact", label: "Contact", body: "Email, phone or a free call." },
  ],
};

export function RelatedLinks() {
  const raw = usePathname() || "/";
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  const links = RELATED[path];
  if (!links) return null;
  // Journey pages already end with the "Next step" card (JourneyNext); one closing block, not two.
  const step = journeyIndex(path);
  if (step !== -1 && step < JOURNEY.length - 1) return null;

  return (
    <section aria-labelledby="related-heading" className="border-t border-gold-light/30 bg-cream">
      <Container className="py-10">
        <h2 id="related-heading" className="text-xs font-semibold uppercase tracking-wider text-ink/65">Where next</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="card-lift group flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-4">
                <span className="flex items-center justify-between gap-2 font-serif font-semibold text-ink">
                  {l.label}
                  <Icon name="arrowRight" size="sm" className="h-4 w-4 text-gold-700 transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-1 block text-sm text-ink/65">{l.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
