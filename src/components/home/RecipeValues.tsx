import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";

/**
 * The six RECIPE values, word for word from the RECIPE Character Framework
 * (policy 23). Arabic is shown beside each transliterated term so pupils —
 * and parents — learn to read it.
 */
const VALUES: { letter: string; name: string; meaning: string; term?: string; arabic?: string; online: string }[] = [
  { letter: "R", name: "Resilience", meaning: "Persevering through difficulty with patience", term: "sabr", arabic: "صَبْر", online: "Keeps trying when work is hard and handles technical problems calmly." },
  { letter: "E", name: "Eeman", meaning: "Faith that shapes action", arabic: "إِيمَان", online: "Prays on time, reflects on the Qur'an and brings good intentions to learning." },
  { letter: "C", name: "Contentment", meaning: "Gratitude and inner peace", term: "shukr", arabic: "شُكْر", online: "Appreciates blessings and manages screen time and wellbeing sensibly." },
  { letter: "I", name: "Integrity", meaning: "Honesty and trustworthiness", term: "amanah", arabic: "أَمَانَة", online: "The same camera and chat conduct whether watched or not." },
  { letter: "P", name: "Progress", meaning: "Always seeking to improve", online: "Acts on feedback, sets goals and takes pride in growth." },
  { letter: "E", name: "Excellence", meaning: "Doing everything as well as possible", term: "ihsan", arabic: "إِحْسَان", online: "High-quality work, excellent manners and helping others excel." },
];

export function RecipeValues() {
  return (
    <section className="section-pad" aria-labelledby="recipe-heading">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <Kicker>Character, every day</Kicker>
            <h2 id="recipe-heading" className="text-h2 font-serif font-semibold text-ink">
              Our <span className="text-gold-700">RECIPE</span> for character.
            </h2>
            <p className="mt-4 text-ink/75">
              In an online school, much of a child&apos;s conduct happens without an adult in the room. So we teach six values
              by name — one each half term in assemblies and form time — and recognise them with merits, a RECIPE Star in every
              class, and a character comment on every report.
            </p>
            <Link href="/policies/23-recipe-character-framework.pdf" className="mt-6 inline-block text-sm font-semibold text-gold-700 underline">
              Read the RECIPE Character Framework (PDF)
            </Link>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {VALUES.map((v) => (
              <li key={v.name} className="flex gap-4 rounded-2xl border border-gold-light/60 bg-white p-5">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-900 font-serif text-xl font-bold text-gold-300">
                  {v.letter}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-ink">
                    {v.name}
                    {v.arabic && (
                      <span lang="ar" dir="rtl" className="text-lg font-bold text-teal-700">
                        {v.arabic}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink/70">
                    {v.meaning}
                    {v.term && <> (<em>{v.term}</em>)</>}
                  </p>
                  <p className="mt-2 text-sm text-ink/80">{v.online}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
