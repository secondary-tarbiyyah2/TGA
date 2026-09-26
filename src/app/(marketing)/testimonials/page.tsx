import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getTestimonials } from "@/lib/content";

export const metadata: Metadata = {
  title: "Testimonials",
  description: "What parents and students say about Tarbiyyah Global Academy.",
};

export default async function TestimonialsPage() {
  // Never show a fabricated/placeholder quote as if it were real — a
  // testimonial only appears once an admin has a genuine one to publish.
  const testimonials = (await getTestimonials()).filter((t) => !t.isPlaceholder);

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Testimonials</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">What our community says.</h1>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-6 sm:grid-cols-2">
          {testimonials.map((t) => (
            <blockquote key={t._id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{t.role}</p>
              <p className="mt-2 text-ink/80">&ldquo;{t.quote}&rdquo;</p>
              <footer className="mt-4 text-sm font-semibold text-gold-700">{t.attribution}</footer>
            </blockquote>
          ))}
          {testimonials.length === 0 && (
            <p className="text-ink/60 sm:col-span-2">Testimonials from our families will appear here once our first cohort has enrolled.</p>
          )}
        </Container>
      </section>

      <CtaBand heading="Want to hear more?" body="Book a place at our next virtual open evening to ask questions live." ctaLabel="Book Open Evening" ctaHref="/open-evening" />
    </>
  );
}
