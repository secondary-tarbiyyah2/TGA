import { defineField, defineType } from "sanity";

export const FAQ_CATEGORIES = [
  "Admissions",
  "Fees",
  "Curriculum",
  "Technology",
  "Islamic Studies",
  "SEND",
] as const;

export default defineType({
  name: "faqEntry",
  title: "FAQ entry",
  type: "document",
  fields: [
    defineField({ name: "question", title: "Question", type: "string", validation: (r) => r.required() }),
    defineField({ name: "answer", title: "Answer", type: "text", rows: 4, validation: (r) => r.required() }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: { list: [...FAQ_CATEGORIES] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "question", subtitle: "category" },
  },
});
