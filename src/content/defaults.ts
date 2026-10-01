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
    "Live, timetabled lessons with qualified UK teachers on the full British curriculum, taught with tarbiyyah — the nurturing of character and faith — at its heart. Reception to Year 11, live lessons launching January 2027.",
  pillars: [
    { title: "Specialist curriculum", body: "The full British national curriculum, live-timetabled, taught to GCSE by qualified UK teachers." },
    { title: "Tarbiyyah & Islamic Studies", body: "Qur'an, Arabic and Islamic Studies on the timetable at every key stage — not an add-on." },
    { title: "Live, small classes", body: "Real-time lessons with real teachers, sized to keep every child known and supported." },
  ] as TitleBody[],
  how_it_works_heading: "Four steps to a place at TGA.",
  how_it_works_steps: [
    { title: "Apply", body: "A short multi-step application — no obligation." },
    { title: "Entry assessment", body: "A friendly, age-appropriate check so we know how to support your child." },
    { title: "Offer", body: "A place offered, confirmed with a one-time registration fee." },
    { title: "Welcome", body: "Onboarding ahead of live lessons launching January 2027." },
  ] as TitleBody[],
  stages_heading: "A specialist curriculum, from Reception to GCSE.",
  stages_body:
    "The full British curriculum, live-timetabled and taught by qualified UK teachers — with Qur'an, Islamic Studies and Arabic woven through every key stage, not bolted on.",
  fee_teaser_heading: "Transparent fees, no surprises.",
  fee_teaser_body:
    'Every fee is published on our website — nothing shared only "on enquiry." Annual, termly and monthly plans are available for every year group.',
  safe_heading: "Safe, open and accountable.",
  safe_body:
    "Every member of staff is DBS-checked, and a named Designated Safeguarding Lead is responsible for keeping children safe.",
};

export const aboutDefaults = {
  hero_heading: "Academic excellence, rooted in faith.",
  hero_body:
    "Tarbiyyah Global Academy is a specialist online school where academic excellence meets Islamic values — preparing children for success in this life and the Hereafter.",
  mission_body:
    "To nurture confident, compassionate and capable Muslims who excel academically, lead with integrity and make a positive impact.",
  safeguarding_body:
    "The safety and wellbeing of every child is our first responsibility, with vetted, DBS-checked staff and a named Designated Safeguarding Lead.",
  recipe_intro: "Building akhlaq alongside attainment.",
  recipe_items: [
    { letter: "R", word: "Respect", body: "For Allah, for others, and for oneself." },
    { letter: "E", word: "Excellence", body: "In academic work and in character alike." },
    { letter: "C", word: "Compassion", body: "Kindness modelled and expected, every day." },
    { letter: "I", word: "Integrity", body: "Doing right when no one is watching." },
    { letter: "P", word: "Purpose", body: "Learning connected to a life of meaning and worship." },
    { letter: "E", word: "Etiquette (Adab)", body: "Manners and conduct as the foundation of learning." },
  ] as RecipeItem[],
  family_heading: "10+ years, three established schools.",
  family_body:
    "Tarbiyyah Global Academy is part of the established Tarbiyyah family of schools — Tarbiyyah Primary, Tarbiyyah Secondary School for Boys, and Tarbiyyah Al-Banaat, all operating for over ten years. The Academy brings that same ethos and standard of care online, for families anywhere in the world.",
};

export const curriculumDefaults = {
  hero_heading: "A specialist curriculum, academic and Islamic together.",
  hero_body:
    "The full British curriculum, live-timetabled and taught by qualified UK teachers, through to GCSE — with Qur'an, Islamic Studies and Arabic on the timetable at every key stage.",
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
