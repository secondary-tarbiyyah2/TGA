import { defineField, defineType } from "sanity";

// Singleton (_id: "homepageContent") — lets Head Teacher/Admin edit the
// homepage's headline copy, pillar cards and "how it works" steps from
// Studio, with draft/publish/history/revert, instead of needing a code
// change + redeploy for every wording tweak. Every field is optional and
// falls back to the existing bundled copy (src/content/seed.ts) when left
// blank — so an empty Studio never breaks the homepage, it just shows the
// same copy the page already ships with today.
export default defineType({
  name: "homepageContent",
  title: "Homepage content",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "pillars", title: "Three pillars" },
    { name: "howItWorks", title: "How it works" },
    { name: "sections", title: "Other section headings" },
  ],
  fields: [
    defineField({ name: "heroKicker", title: "Kicker (small text above headline)", type: "string", group: "hero" }),
    defineField({ name: "heroHeading", title: "Headline", type: "string", group: "hero", description: "Plain text — the gold highlight styling on the live page is applied automatically to the last clause." }),
    defineField({ name: "heroBody", title: "Intro paragraph", type: "text", rows: 3, group: "hero" }),

    defineField({
      name: "pillars",
      title: "Pillar cards",
      type: "array",
      group: "pillars",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 2, validation: (r) => r.required() }),
          ],
        },
      ],
    }),

    defineField({ name: "howItWorksHeading", title: "Section heading", type: "string", group: "howItWorks" }),
    defineField({
      name: "howItWorksSteps",
      title: "Steps",
      type: "array",
      group: "howItWorks",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 2, validation: (r) => r.required() }),
          ],
        },
      ],
    }),

    defineField({ name: "stagesHeading", title: "\"Stages of school\" heading", type: "string", group: "sections" }),
    defineField({ name: "stagesBody", title: "\"Stages of school\" body", type: "text", rows: 3, group: "sections" }),
    defineField({ name: "feeTeaserHeading", title: "Fees teaser heading", type: "string", group: "sections" }),
    defineField({ name: "feeTeaserBody", title: "Fees teaser body", type: "text", rows: 2, group: "sections" }),
  ],
  preview: {
    prepare: () => ({ title: "Homepage content" }),
  },
});
