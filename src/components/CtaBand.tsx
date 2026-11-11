import { Container } from "./Container";
import { Button } from "./Button";

export function CtaBand({
  heading,
  body,
  ctaLabel = "Apply now",
  ctaHref = "/admissions",
}: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section className="geo-texture-dark relative overflow-hidden bg-ink-900 py-14 text-cream sm:py-20">
      <span aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold-500/20 blur-3xl" />
      <Container className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-h2 font-serif font-semibold text-white">{heading}</h2>
          <p className="mt-2 max-w-xl text-cream/85">{body}</p>
        </div>
        <Button href={ctaHref} variant="primary" className="shrink-0 shadow-lg shadow-black/20">
          {ctaLabel}
        </Button>
      </Container>
    </section>
  );
}
