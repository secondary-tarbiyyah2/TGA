import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { Button } from "@/components/Button";
import { MobileCtaBar } from "@/components/MobileCtaBar";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const HELPFUL = [
  { href: "/admissions", title: "How to apply", body: "The admissions process, step by step." },
  { href: "/fees", title: "Fees", body: "Every fee published, by year group." },
  { href: "/learning", title: "Learning", body: "Curriculum by key stage, pastoral care and a sample week." },
  { href: "/faqs", title: "FAQs", body: "Quick answers on admissions, fees and more." },
  { href: "/parents", title: "Parents", body: "Term dates, policies and safeguarding." },
  { href: "/contact", title: "Contact us", body: "Ask the admissions team directly." },
];

// Rendered outside the (marketing) group (the root layout has no chrome), so
// it brings its own Header/Footer — this is also what becomes 404.html in the
// static export.
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        <section className="geo-texture bg-cream section-pad">
          <Container className="max-w-3xl">
            <Kicker>Error 404</Kicker>
            <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">We can&apos;t find that page.</h1>
            <p className="mt-6 text-lg text-ink/75">
              The link may be out of date or mistyped. Here are the places families most often look for — or head
              back to the homepage.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href="/">Back to the homepage</Button>
              <Button href="/book-a-call" variant="secondary">Book a free call</Button>
            </div>
          </Container>
        </section>
        <section className="section-pad !pt-10">
          <Container className="max-w-3xl">
            <ul className="grid gap-4 sm:grid-cols-2">
              {HELPFUL.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block h-full rounded-2xl border border-gold-light/50 bg-white p-5 shadow-sm transition hover:border-gold-500 hover:shadow-md"
                  >
                    <span className="font-serif text-lg font-semibold text-gold-700">{l.title}</span>
                    <span className="mt-1 block text-sm text-ink/70">{l.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      </main>
      <Footer />
      <MobileCtaBar />
    </>
  );
}
