import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { PrelaunchPageHead, PrelaunchRegisterBand } from "@/components/prelaunch/PrelaunchPageHead";
import { getKeyStages } from "@/lib/content";

// Public at /curriculum/ while the site is in pre-launch (public/.htaccess).
export const metadata: Metadata = pageMetadata({
  title: "Subjects",
  description: "Subjects taught at Tarbiyyah Global Academy from Year 1 to Year 11, with live lessons each week.",
  path: "/curriculum",
});

// Keep this page simple: subject names only, without exam boards or course codes.
const DETAIL = /\s*\((?:[^()]*(?:GCSE|taught from|Double Award|Edexcel|AQA|Pearson)[^()]*)\)/g;
function simpleSubject(s: string): string | null {
  if (/^PE\b/i.test(s)) return null;
  if (/^Combined\b.*separate sciences/i.test(s)) return "Science: combined, or biology, chemistry and physics";
  return s.replace(DETAIL, "").replace(/\s+/g, " ").trim();
}
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
              {(ks.totalLessons || ks.lessonLength) && (
                <p className="mt-2 text-sm text-ink/65">
                  {[ks.totalLessons, ks.lessonLength && `${ks.lessonLength} each`].filter(Boolean).join(", ")}
                </p>
              )}
              <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                {ks.subjects.map(simpleSubject).filter((s): s is string => !!s).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden="true" className="text-gold">◆</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Container>
      </section>
      <PrelaunchRegisterBand />
    </>
  );
}
