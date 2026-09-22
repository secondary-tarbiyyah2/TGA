import { defineField, defineType } from "sanity";

export default defineType({
  name: "policyLink",
  title: "Policy document",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "fileUrl", title: "Document URL", type: "url", validation: (r) => r.required() }),
    defineField({ name: "summary", title: "One-line summary", type: "string" }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "title", subtitle: "fileUrl" },
  },
});
