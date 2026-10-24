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
        <div className="max-w-2xl">
          <Kicker>Character, every day</Kicker>
          <h2 id="recipe-heading" className="text-h2 font-serif font-semibold text-ink">
            Our <span className="text-gold-700">RECIPE</span> for character.
          </h2>
          <p className="mt-4 text-ink/75">
            In an online school, much of a child&apos;s conduct happens without an adult in the room. So we teach six values
            by name — one each half term in assemblies and form time — and recognise them with merits, a RECIPE Star in every
            class, and a character comment on every report.
          </p>
        </div>

        {/* The word itself, spelled out as one row of six — never a grid of boxes. */}
        <ol className="mt-10 grid grid-cols-6 gap-1.5 sm:gap-3" aria-label="The six RECIPE values">
          {VALUES.map((v, i) => (
            <li key={`${v.letter}-${i}`} className="flex flex-col items-center rounded-xl border border-gold-light/60 bg-white px-1 py-3 text-center sm:rounded-2xl sm:px-3 sm:py-5">
              <span aria-hidden="true" className="font-serif text-3xl font-bold leading-none text-gold-700 sm:text-5xl">{v.letter}</span>
              <span className="mt-2 text-[10px] font-semibold leading-tight text-ink sm:text-sm">{v.name}</span>
              {v.arabic ? (
                <span lang="ar" dir="rtl" className="mt-1 text-sm font-bold leading-none text-teal-700 sm:text-xl">{v.arabic}</span>
              ) : (
                <span aria-hidden="true" className="mt-1 text-sm leading-none text-ink/30 sm:text-xl">·</span>
              )}
            </li>
          ))}
        </ol>

        {/* What each value means, and what it looks like in an online classroom. One line each. */}
        <dl className="mt-8 divide-y divide-gold-light/50 rounded-2xl border border-gold-light/60 bg-white">
          {VALUES.map((v, i) => (
            <div key={`${v.name}-${i}`} className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <dt className="font-semibold text-ink">
                <span aria-hidden="true" className="mr-2 font-serif text-gold-700">{v.letter}</span>
                {v.name}
                {v.term && <span className="ml-1 text-sm font-normal text-ink/60"><em>{v.term}</em></span>}
              </dt>
              <dd className="text-sm text-ink/75">
                <span className="text-ink">{v.meaning}.</span> {v.online}
              </dd>
            </div>
          ))}
        </dl>
        <Link href="/policies/23-recipe-character-framework.pdf" className="mt-6 inline-block text-sm font-semibold text-gold-700 underline">
          Read the RECIPE Character Framework (PDF)
        </Link>
      </Container>
    </section>
  );
}
