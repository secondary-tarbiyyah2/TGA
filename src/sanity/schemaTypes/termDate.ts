import { defineField, defineType } from "sanity";

export default defineType({
  name: "termDate",
  title: "Term / admissions date",
  type: "document",
  fields: [
    defineField({ name: "label", title: "Label", type: "string", description: "e.g. \"Autumn Term begins\" or \"Application deadline\"", validation: (r) => r.required() }),
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      options: { list: ["Term date", "Holiday", "Admissions deadline", "Event"] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "date", title: "Date", type: "date", validation: (r) => r.required() }),
    defineField({ name: "endDate", title: "End date (optional, for ranges)", type: "date" }),
    defineField({ name: "notes", title: "Notes", type: "string" }),
    defineField({
      name: "confirmed",
      title: "Confirmed",
      type: "boolean",
      initialValue: false,
      description: "Only confirmed dates are ever shown on the public Term Dates page, leave off while a date is provisional.",
    }),
  ],
  preview: {
    select: { title: "label", subtitle: "date" },
  },
  orderings: [{ title: "Date", name: "dateAsc", by: [{ field: "date", direction: "asc" }] }],
});
