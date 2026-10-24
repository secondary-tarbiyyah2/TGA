import { defineField, defineType } from "sanity";

export default defineType({
  name: "feeBand",
  title: "Fee band",
  type: "document",
  fields: [
    defineField({ name: "yearGroupRange", title: "Year group range", type: "string", description: "e.g. \"Year 1 – Year 2\"", validation: (r) => r.required() }),
    defineField({ name: "order", title: "Display order", type: "number", validation: (r) => r.required() }),
    defineField({ name: "annualFee", title: "Annual fee (£) - the only stored fee figure", type: "number", validation: (r) => r.required().positive() }),
    // Deprecated + ignored: termly/monthly are derived from the annual fee
    // (src/lib/fees.ts). Kept read-only/hidden so old documents still load.
    defineField({ name: "termlyFee", title: "Termly fee (deprecated - ignored)", type: "number", readOnly: true, hidden: true, deprecated: { reason: "Derived from annualFee and the site-wide number of terms." } }),
    defineField({ name: "monthlyFee", title: "Monthly fee (deprecated - ignored)", type: "number", readOnly: true, hidden: true, deprecated: { reason: "Derived from annualFee and the site-wide number of instalments." } }),
    defineField({ name: "notes", title: "Notes", type: "text", description: "Optional footnote for this band, e.g. GCSE exam fees billed separately." }),
  ],
  preview: {
    select: { title: "yearGroupRange", subtitle: "annualFee" },
    prepare: ({ title, subtitle }) => ({ title, subtitle: subtitle ? `£${subtitle}/yr` : "" }),
  },
  orderings: [{ title: "Display order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
});
