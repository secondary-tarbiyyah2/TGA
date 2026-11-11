// The Portal guide (owner, Nov 2026: "the tour needs to be detailed and
// explain everything A to Z: each page, its purpose, how to use it"). Every
// page each role can open has one entry, written as plain data so a unit test
// (src/lib/learn/guide.test.ts) can check that every menu page has one, that
// the text keeps house style, and that every "Show me" target really is on
// that page (a data-guide="..." attribute in the page's own code).
//
// No imports here: this file runs in node tests as well as in the portal.

/** Who the guide is written for. Head teacher and admin share one guide;
 * teachers and cover staff share one; a SENCo-only account, a Digital
 * Lead-only account and admissions staff get their own (they see fewer pages). */
export type GuideRole = "head" | "admissions" | "teacher" | "senco" | "digital" | "parent" | "pupil";

export const GUIDE_ROLE_LABEL: Record<GuideRole, string> = {
  head: "Head teacher and admin",
  admissions: "Admissions",
  teacher: "Teachers and cover staff",
  senco: "SENCo",
  digital: "Digital Lead",
  parent: "Parents and carers",
  pupil: "Pupils",
};

/** One thing to point at on the live page: the value of a data-guide
 * attribute, a short name for it and one sentence about it. */
export type GuideTarget = { target: string; label: string; say: string };

export type GuideEntry = {
  /** The page's address, as in the menu (nav.ts), without the /learn prefix. */
  href: string;
  /** The page's name exactly as the menu shows it. */
  name: string;
  /** The chapter of the journey map: the menu category the page sits in. */
  category: string;
  /** One line: what the page is for. */
  purpose: string;
  /** When you would use it. */
  when: string;
  /** 3 to 7 numbered steps naming the real buttons and fields. */
  steps: string[];
  /** 1 to 3 tips or common mistakes. */
  tips: string[];
  /** Who else sees what you do here. */
  privacy: string;
  /** Related pages (hrefs that also have an entry for this role). */
  related: string[];
  /** 1 to 4 things to spotlight on the live page, in order. */
  showMe: GuideTarget[];
  /** Common jobs done here, in plain words, for the A to Z index ("take a register"). */
  tasks?: string[];
  /** Opened from another page (a class, a lesson), not from the menu. */
  detail?: boolean;
};

/** One stop on a "Day in the life" journey: go to `href`, point at `target`. */
export type JourneyStep = {
  href: string;
  target?: string;
  title: string;
  body: string;
  /** The page needs a record (a class, a lesson): follow the first link inside
   * this data-guide target on the step before to reach a real one. */
  from?: string;
};

export type Journey = { id: string; title: string; summary: string; steps: JourneyStep[] };
