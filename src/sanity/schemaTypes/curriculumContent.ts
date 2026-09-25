import { defineField, defineType } from "sanity";

// Singleton (_id: "curriculumContent") — lets Head Teacher/Admin edit the
// Curriculum ("Learning") page's headline and time-bands copy without code.
// Optional fields fall back to the existing bundled copy when blank — see
// homepageContent.ts for the same pattern and reasoning.
export default defineType({
  name: "curriculumContent",
  title: "Curriculum (Learning) page content",
  type: "document",
  fields: [
    defineField({ name: "heroHeading", title: "Headline", type: "string" }),
    defineField({ name: "heroBody", title: "Intro paragraph", type: "text", rows: 3 }),
    defineField({ name: "timeBandsHeading", title: "\"Time bands\" section heading", type: "string" }),
    defineField({ name: "timeBandsBody", title: "\"Time bands\" body", type: "text", rows: 4 }),
  ],
  preview: {
    prepare: () => ({ title: "Curriculum (Learning) page content" }),
  },
});
