import { defineField, defineType } from "sanity";

export default defineType({
  name: "differentiator",
  title: "Differentiator copy block",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "summary", title: "Homepage summary (1–2 sentences)", type: "text", rows: 2, validation: (r) => r.required() }),
    defineField({ name: "detail", title: "Full detail copy", type: "text", rows: 6 }),
    defineField({ name: "icon", title: "Icon keyword", type: "string", description: "A short word used to pick a matching icon, e.g. \"clock\", \"quran\", \"family\"." }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: { list: ["Confirmed commitment", "Draft / concept — not yet confirmed"] },
      initialValue: "Draft / concept, not yet confirmed",
      validation: (r) => r.required(),
    }),
    defineField({ name: "visible", title: "Show on site", type: "boolean", initialValue: true }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "title", subtitle: "status" },
  },
});
