/**
 * Default copy for the admin "Website content" editor (/learn/admin/content).
 *
 * These strings mirror, word for word, the fallback text the public marketing
 * pages render when a field is left empty in the database
 * (`content.heroHeading || "..."` in src/app/(marketing)/*). The editor
 * pre-fills empty fields with these so the owner edits real text instead of
 * staring at empty boxes. On save, a value equal to its default (or blank) is
 * stored as NULL / [] so the site keeps using its own built-in fallback — the
 * public site can never end up blank.
 *
 * If you change fallback copy on a marketing page, change it here too.
 */

export type TitleBody = { title: string; body: string };
export type RecipeItem = { letter: string; word: string; body: string };

export const homepageDefaults = {
  hero_kicker: "An online school by Tarbiyyah Education Trust",
  // The live page styles "wherever home is." in gold; here it is plain text.
  // Saving it unchanged keeps the styled version.
  hero_heading: "A specialist, quality education, rooted in faith — wherever home is.",
  hero_body:
    "A specialist online school: Qur'an, Arabic and Islamic Studies on the timetable every week, alongside the full national curriculum to GCSE, taught live by qualified teachers with tarbiyyah — the nurturing of character and faith — at its heart. Year 1 to Year 11, live lessons launching December 2026.",
  pillars: [
    { title: "Specialist curriculum", body: "Qur'an, Arabic and Islamic Studies every week, with the full national curriculum to GCSE, taught live by qualified teachers." },
    { title: "Tarbiyyah & Islamic Studies", body: "Qur'an, Arabic and Islamic Studies on the timetable at every key stage — not an add-on." },
    { title: "Live, small classes", body: "Real-time lessons with no more than 15 pupils in a class, so every child is known and supported." },
  ] as TitleBody[],
  how_it_works_heading: "Six steps to a place at TGA.",
  how_it_works_steps: [
    { title: "Apply", body: "Apply online and upload your child's school report and ID." },
    { title: "We review", body: "We review your application and documents." },
    { title: "Remote assessment", body: "A supervised online assessment; we email the details." },
    { title: "Interview", body: "A conversation with you and your child." },
    { title: "Offer", body: "We email the offer; send proof of payment to confirm your place." },
    { title: "Welcome", body: "Accounts created and onboarding ahead of live lessons in December 2026." },
  ] as TitleBody[],
  stages_heading: "A specialist curriculum, from Year 1 to GCSE.",
  stages_body:
    "The deen at the heart of the day — Qur'an, Islamic Studies and Arabic on the timetable at every key stage — with the full national curriculum to GCSE, taught live by qualified teachers.",
  fee_teaser_heading: "Transparent fees, no surprises.",
  fee_teaser_body:
    'Every fee is published on our website — nothing shared only "on enquiry." Annual, two-payment and monthly plans are available for every year group.',
  safe_heading: "Safe, open and accountable.",
  safe_body:
    "Every member of staff is vetted before they start (an enhanced DBS check in the UK, an overseas criminal record check for staff abroad), and a named Designated Safeguarding Lead is responsible for keeping children safe.",
};

export const aboutDefaults = {
  hero_heading: "Academic excellence, rooted in faith.",
  hero_body:
    "Tarbiyyah Global Academy is a specialist online school where academic excellence meets Islamic values — preparing children for success in this life and the Hereafter.",
  mission_body:
    "To nurture confident, compassionate and capable Muslims who excel academically, lead with integrity and make a positive impact.",
  safeguarding_body:
    "The safety and wellbeing of every child is our first responsibility, with safer-recruitment vetting for every member of staff (enhanced DBS in the UK, overseas checks abroad) and a named Designated Safeguarding Lead.",
  recipe_intro: "Building akhlaq alongside attainment.",
  // The six values exactly as the RECIPE Character Framework (policy 23) names them.
  recipe_items: [
    { letter: "R", word: "Resilience", body: "Persevering through difficulty with patience (sabr)." },
    { letter: "E", word: "Eeman", body: "Faith that shapes action." },
    { letter: "C", word: "Contentment", body: "Gratitude (shukr) and inner peace." },
    { letter: "I", word: "Integrity", body: "Honesty and trustworthiness (amanah)." },
    { letter: "P", word: "Progress", body: "Always seeking to improve." },
    { letter: "E", word: "Excellence", body: "Ihsan: doing everything as well as possible." },
  ] as RecipeItem[],
  family_heading: "10+ years, three established schools.",
  family_body:
    "Tarbiyyah Global Academy is part of the established Tarbiyyah family of schools — Tarbiyyah Primary, Tarbiyyah Secondary School for Boys, and Tarbiyyah Al-Banaat, all operating for over ten years. The Academy brings that same ethos and standard of care online, for families anywhere in the world.",
};

export const curriculumDefaults = {
  hero_heading: "A specialist curriculum, academic and Islamic together.",
  hero_body:
    "A specialist curriculum: Qur'an, Islamic Studies and Arabic on the timetable at every key stage, with the full national curriculum to GCSE, taught live by qualified teachers.",
};

/** Site-settings fields that have a built-in fallback on the public site. */
export const siteSettingsDefaults = {
  cta_primary_label: "Apply Now",
  cta_primary_href: "/admissions",
  admissions_email: "globalacademy@tarbiyyah.co.uk",
};

/** Helper copy shown under every pre-filled editor. */
export const PREFILLED_HELP = "Showing the current website text. Edit it and Save to change the site.";

/** Value to put in the editor: the stored text, or the default when empty. */
export function withDefault(stored: string | null | undefined, def: string): string {
  return stored && stored.trim() !== "" ? stored : def;
}

/** Value to write to the DB: null when blank or unchanged-from-default, so the
 * site's own fallback keeps applying (and the page can never go blank). */
export function toStored(value: string | null | undefined, def: string): string | null {
  const v = (value ?? "").trim();
  return v === "" || v === def.trim() ? null : value ?? null;
}

export function listWithDefault<T>(stored: T[] | null | undefined, def: T[]): T[] {
  return stored && stored.length > 0 ? stored : def;
}

/** [] (page falls back to its default list) when empty or identical to default. */
export function listToStored<T>(value: T[] | null | undefined, def: T[]): T[] {
  if (!value || value.length === 0) return [];
  return JSON.stringify(value) === JSON.stringify(def) ? [] : value;
}
