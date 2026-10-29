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
    <section className="geo-texture bg-ink-900 py-14 text-cream sm:py-16">
      <Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-h2 font-serif font-semibold text-white">{heading}</h2>
          <p className="mt-2 max-w-xl text-cream/85">{body}</p>
        </div>
        <Button href={ctaHref} variant="primary" className="shrink-0">
          {ctaLabel}
        </Button>
      </Container>
    </section>
  );
}
