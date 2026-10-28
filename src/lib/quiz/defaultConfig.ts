import type { QuizConfig } from "./schema";

/**
 * Build-time fallback / seed content, same pattern as src/content/seed.ts:
 * used whenever no published quiz_config_versions row is reachable (no
 * Supabase connection configured yet, or none published yet), and also the
 * starting point an admin's first draft is created from in the quiz
 * builder.
 *
 * Deliberately a short "fit check", not a placement tool. The result only
 * restates things the school has already published (key stage, the live day
 * in the family's own time zone, the fee band, the dated next step). It
 * never estimates a child's level or promises a course, a timetable or a
 * weighting: those are confirmed with the family during admissions, so
 * nothing here commits the school to something it has not decided yet.
 */
export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  schemaVersion: 1,
  intro: {
    kicker: "Is TGA right for your child?",
    title: "Check the fit in under two minutes.",
    body: "Three quick questions. You get your child's key stage, what the live day looks like in your own time zone, the fee band and your next step, with the dates that matter.",
  },
  resultHeading: "{name}, here is how Tarbiyyah Global Academy would work for your child.",
  disclaimer:
    "A quick summary based on your answers, not an offer of a place. Fees are the published 2026-27 founding-cohort fees; everything else is confirmed with you during admissions.",
  consentText:
    "Email me this summary and keep me updated about open evenings and admissions. I understand I can unsubscribe at any time.",
  questions: [
    {
      key: "year_group",
      step: 1,
      order: 1,
      title: "What year group is your child joining?",
      subtitle: "Year 1 to Year 11. If you have more than one child, start with the eldest.",
      type: "year_group",
      options: [],
      active: true,
    },
    {
      key: "timezone",
      step: 2,
      order: 1,
      title: "Where will your child be learning from?",
      subtitle: "Live lessons run on UK time, so this shows you when the school day falls for your family.",
      type: "timezone",
      options: [],
      active: true,
    },
    {
      key: "start_when",
      step: 3,
      order: 1,
      title: "When are you thinking of starting?",
      type: "single_select",
      active: true,
      options: [
        { value: "january", label: "January 2027, the founding cohort", detail: "Live lessons begin on Monday 11 January 2027.", icon: "target" },
        { value: "later", label: "Later in 2027", detail: "Not ready for January, but interested in a later start.", icon: "clock" },
        { value: "exploring", label: "Just exploring for now", detail: "Finding out what online schooling would be like.", icon: "compass" },
      ],
    },
    {
      key: "parent_available",
      step: 4,
      order: 1,
      title: "Is an adult usually at home during lessons?",
      subtitle: "Younger children settle best in live lessons with an adult nearby.",
      type: "single_select",
      active: true,
      showWhen: [{ questionKey: "year_group", operator: "in", value: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"] }],
      options: [
        { value: "yes", label: "Yes, usually", detail: "An adult is nearby for most lessons.", icon: "user-check" },
        { value: "sometimes", label: "Sometimes", detail: "Depends on the day.", icon: "users" },
        { value: "no", label: "Rarely", detail: "My child would mostly be learning on their own.", icon: "user-away" },
      ],
    },
  ],
  rules: [
    {
      id: "rule-start-january",
      name: "Starting January → application deadline",
      active: true,
      order: 1,
      match: "all",
      conditions: [{ questionKey: "start_when", operator: "equals", value: "january" }],
      action: {
        type: "show_text",
        text: "Your next step: applications for the January 2027 founding cohort close on Friday 18 December 2026. Come to an open evening first if you can, or book a call and apply online.",
      },
    },
    {
      id: "rule-start-later",
      name: "Starting later → stay in touch",
      active: true,
      order: 2,
      match: "all",
      conditions: [{ questionKey: "start_when", operator: "equals", value: "later" }],
      action: {
        type: "show_text",
        text: "Your next step: come to an open evening to see how lessons work, and we will let you know when places for a later start open.",
      },
    },
    {
      id: "rule-start-exploring",
      name: "Exploring → open evening",
      active: true,
      order: 3,
      match: "all",
      conditions: [{ questionKey: "start_when", operator: "equals", value: "exploring" }],
      action: {
        type: "show_text",
        text: "Your next step: an open evening is the easiest way to see what a live lesson and the portals are like, with no commitment.",
      },
    },
    {
      id: "rule-parent-no-flag",
      name: "Adult rarely at home (primary) → talk it through",
      active: true,
      order: 4,
      match: "all",
      conditions: [{ questionKey: "parent_available", operator: "equals", value: "no" }],
      action: {
        type: "show_flag",
        tone: "warning",
        text: "Primary pupils usually need an adult nearby during live lessons. If that is not often possible, it is worth a quick call so we can talk through what would work for your family before you apply.",
      },
    },
  ],
  resultSections: [
    { key: "timezone_flag", order: 1, active: true },
    { key: "fees", order: 2, active: true },
    { key: "hifz_role_note", order: 3, active: true },
    { key: "ctas", order: 4, active: true },
    { key: "sample_week", order: 5, active: false },
    { key: "starting_points", order: 6, active: false },
  ],
};
