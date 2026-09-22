import { defineField, defineType } from "sanity";

export default defineType({
  name: "feeBand",
  title: "Fee band",
  type: "document",
  fields: [
    defineField({ name: "yearGroupRange", title: "Year group range", type: "string", description: "e.g. \"Reception – Year 2\"", validation: (r) => r.required() }),
    defineField({ name: "order", title: "Display order", type: "number", validation: (r) => r.required() }),
    defineField({ name: "annualFee", title: "Annual fee (£, paid yearly)", type: "number", validation: (r) => r.required().positive() }),
    defineField({ name: "termlyFee", title: "Termly fee (£, per term)", type: "number", validation: (r) => r.required().positive() }),
    defineField({ name: "monthlyFee", title: "Monthly fee (£, per month)", type: "number", validation: (r) => r.required().positive() }),
    defineField({ name: "notes", title: "Notes", type: "text", description: "Optional footnote for this band, e.g. GCSE exam fees billed separately." }),
  ],
  preview: {
    select: { title: "yearGroupRange", subtitle: "annualFee" },
    prepare: ({ title, subtitle }) => ({ title, subtitle: subtitle ? `£${subtitle}/yr` : "" }),
  },
  orderings: [{ title: "Display order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
});
