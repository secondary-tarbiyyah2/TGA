import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { PrelaunchPageHead, PrelaunchRegisterBand } from "@/components/prelaunch/PrelaunchPageHead";
import { getKeyStages } from "@/lib/content";
import { lessonsAWeek, publicSubject } from "@/content/curriculum";

// Public at /curriculum/ while the site is in pre-launch (public/.htaccess).
export const metadata: Metadata = pageMetadata({
  title: "Subjects",
  description: "Subjects taught at Tarbiyyah Global Academy from Year 1 to Year 11, with live lessons each week.",
  path: "/curriculum",
});

// Keep this page simple: subject names only, without exam boards or course codes (publicSubject).
const simpleStageTitle = (t: string) => t.replace(/\s*\(International GCSE\)/i, "");

export default async function HoldingSubjectsPage() {
  const stages = await getKeyStages();
  return (
    <>
      <PrelaunchPageHead kicker="Year 1 to Year 11" title="Subjects">
        Qur&apos;an, Arabic and Islamic Studies every week, alongside the national curriculum, taught live by qualified teachers in classes of no more than 15.
      </PrelaunchPageHead>
      <section className="pt-10">
        <Container className="grid max-w-4xl gap-6 sm:grid-cols-2">
          {stages.map((ks) => (
            <article key={ks.slug} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">{simpleStageTitle(ks.title)}</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">{ks.range}</h2>
              <p className="mt-2 text-sm text-ink/65">{lessonsAWeek(ks)}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                {ks.subjects.map(publicSubject).filter((s): s is string => !!s).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden="true" className="text-gold">◆</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              {ks.slug === "year-10-11" && (
                <p className="mt-4 border-t border-gold-light/40 pt-3 text-xs text-ink/65">Leading to Pearson Edexcel International GCSEs. History is not offered at GCSE.</p>
              )}
            </article>
          ))}
        </Container>
      </section>
      <PrelaunchRegisterBand />
    </>
  );
}
