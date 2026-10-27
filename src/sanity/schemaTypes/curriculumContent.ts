import { defineField, defineType } from "sanity";

// Singleton (_id: "curriculumContent") · lets Headteacher/Admin edit the
// Curriculum ("Learning") page's headline copy without code. Optional
// fields fall back to the existing bundled copy when blank, see
// homepageContent.ts for the same pattern and reasoning.
export default defineType({
  name: "curriculumContent",
  title: "Curriculum (Learning) page content",
  type: "document",
  fields: [
    defineField({ name: "heroHeading", title: "Headline", type: "string" }),
    defineField({ name: "heroBody", title: "Intro paragraph", type: "text", rows: 3 }),
  ],
  preview: {
    prepare: () => ({ title: "Curriculum (Learning) page content" }),
  },
});
