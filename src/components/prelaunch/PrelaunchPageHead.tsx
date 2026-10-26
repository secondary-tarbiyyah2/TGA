/* eslint-disable @next/next/no-html-link-for-pages -- the holding pages are served by .htaccess rewrites, so links are full page loads (src/lib/prelaunch.ts) */
import { Container } from "@/components/Container";

export function PrelaunchPageHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <section className="geo-texture bg-cream">
      <Container className="max-w-4xl py-12 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">{kicker}</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold text-ink sm:text-5xl">{title}</h1>
        {children && <div className="mt-5 max-w-2xl text-lg text-ink/75">{children}</div>}
      </Container>
    </section>
  );
}

export function PrelaunchRegisterBand() {
  return (
    <Container className="max-w-4xl">
      <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl border border-gold-light/60 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-serif text-xl font-semibold text-ink">Interested in a founding place?</p>
          <p className="mt-1 text-sm text-ink/70">Register your interest and we will be in touch when admissions open.</p>
        </div>
        <a href="/#register" className="shrink-0 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">Register interest</a>
      </div>
    </Container>
  );
}
