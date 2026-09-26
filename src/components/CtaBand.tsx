import { Container } from "./Container";
import { Button } from "./Button";

export function CtaBand({
  heading,
  body,
  ctaLabel = "Apply Now",
  ctaHref = "/admissions",
}: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section className="geo-texture bg-ink-900 section-pad text-cream">
      <Container className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-white sm:text-3xl">{heading}</h2>
          <p className="mt-2 max-w-xl text-cream/85">{body}</p>
        </div>
        <Button href={ctaHref} variant="primary" className="shrink-0">
          {ctaLabel}
        </Button>
      </Container>
    </section>
  );
}
