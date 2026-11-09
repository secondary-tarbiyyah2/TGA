import { defineField, defineType } from "sanity";

// Singleton (_id: "aboutContent") · lets Headteacher/Admin edit the About
// page's mission, safeguarding summary, Tarbiyyah Compass character framework and
// "Tarbiyyah family" copy without code. Optional fields fall back to the
// existing bundled copy when blank, see homepageContent.ts for the same
// pattern and reasoning.
export default defineType({
  name: "aboutContent",
  title: "About page content",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "mission", title: "Mission & safeguarding" },
    { name: "recipe", title: "Tarbiyyah Compass framework" },
    { name: "family", title: "Tarbiyyah family" },
  ],
  fields: [
    defineField({ name: "heroHeading", title: "Headline", type: "string", group: "hero" }),
    defineField({ name: "heroBody", title: "Intro paragraph", type: "text", rows: 3, group: "hero" }),

    defineField({ name: "missionBody", title: "Mission statement", type: "text", rows: 3, group: "mission" }),
    defineField({ name: "safeguardingBody", title: "Safeguarding summary", type: "text", rows: 4, group: "mission" }),

    defineField({ name: "recipeIntro", title: "\"Tarbiyyah Compass\" section heading", type: "string", group: "recipe" }),
    defineField({
      name: "recipeItems",
      title: "Tarbiyyah Compass values",
      type: "array",
      group: "recipe",
      description: "Leave empty to use the default six Tarbiyyah Compass values.",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "letter", title: "Letter", type: "string", validation: (r) => r.required().max(2) }),
            defineField({ name: "word", title: "Word", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 2, validation: (r) => r.required() }),
          ],
        },
      ],
    }),

    defineField({ name: "familyHeading", title: "\"Tarbiyyah family\" heading", type: "string", group: "family" }),
    defineField({ name: "familyBody", title: "\"Tarbiyyah family\" body", type: "text", rows: 4, group: "family" }),
  ],
  preview: {
    prepare: () => ({ title: "About page content" }),
  },
});
