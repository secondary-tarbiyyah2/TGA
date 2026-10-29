import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getTestimonials } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Testimonials",
  description: "What parents and pupils say about Tarbiyyah Global Academy, and how to see the school for yourself before our founding families join in January 2027.",
  path: "/testimonials",
});

// Until there are real quotes, the page says so plainly and points families to
// the ways they can judge the school themselves. Dates match the term dates
// and open evening pages.
const SEE_FOR_YOURSELF = [
  { href: "/open-evening", label: "Online open evenings", when: "Thu 26 November, 7:30pm and Sun 6 December, 4:00pm (UK time)", body: "Meet the Headteacher and ask your questions live." },
  { href: "/open-evening", label: "Taster morning", when: "Saturday 12 December", body: "Your child joins a real live lesson with one of our teachers." },
  { href: "/book-a-call#book", label: "A free call", when: "At a time that suits you", body: "Twenty minutes with admissions, with no obligation." },
];

export default async function TestimonialsPage() {
  // Never show a fabricated/placeholder quote as if it were real, a
  // testimonial only appears once an admin has a genuine one to publish.
  const testimonials = (await getTestimonials()).filter((t) => !t.isPlaceholder);
  const hasQuotes = testimonials.length > 0;

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Testimonials</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">
            {hasQuotes ? "What our community says." : "Our founding families join in January 2027."}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            {hasQuotes
              ? "Words from parents and pupils at the Academy, published with their permission."
              : "We will only ever publish words from real parents and pupils, with their permission, so this page will fill once they have had time to get to know us."}
          </p>
        </Container>
      </section>

      {hasQuotes ? (
        <section className="section-pad">
          <Container className="grid gap-6 sm:grid-cols-2">
            {testimonials.map((t) => (
              <blockquote key={t._id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{t.role}</p>
                <p className="mt-2 text-ink/80">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-4 text-sm font-semibold text-gold-700">{t.attribution}</footer>
              </blockquote>
            ))}
          </Container>
        </section>
      ) : (
        <section className="section-pad">
          <Container>
            <Kicker>Until then</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">See the school for yourself.</h2>
            <p className="mt-4 max-w-2xl text-ink/75">
              The best way to judge us is to meet our teachers and watch a lesson. Every one of these is free.
            </p>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {SEE_FOR_YOURSELF.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="group flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-gold-500 hover:shadow-md">
                    <span className="font-serif text-xl font-semibold text-ink">{s.label}</span>
                    <span className="mt-1 text-sm font-semibold text-gold-700">{s.when}</span>
                    <span className="mt-3 flex-1 text-sm text-ink/75">{s.body}</span>
                    <span aria-hidden="true" className="mt-4 text-sm font-semibold text-ink group-hover:text-gold-700">Find out more →</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-2xl text-sm text-ink/70">
              The Academy is part of the Tarbiyyah Education Trust, alongside Tarbiyyah Primary, Tarbiyyah Secondary and Tarbiyyah
              Al-Banaat. You can read <Link href="/about" className="font-semibold text-gold-700 underline">about our school</Link> and{" "}
              <Link href="/staff" className="font-semibold text-gold-700 underline">meet the team</Link>.
            </p>
          </Container>
        </section>
      )}

      {hasQuotes && (
        <CtaBand heading="Want to hear more?" body="Book a place at our next online open evening to ask questions live." ctaLabel="Book an open evening" ctaHref="/open-evening" />
      )}
    </>
  );
}
