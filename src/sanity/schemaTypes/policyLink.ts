import { defineField, defineType } from "sanity";

export default defineType({
  name: "policyLink",
  title: "Policy document",
  type: "document",
  fields: [
    defineField({ name: "number", title: "Policy number", type: "string", description: "e.g. \"01\" — used for filing/ordering only.", validation: (r) => r.required() }),
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "category",
      title: "DfE category",
      type: "string",
      description: "Kept for the DfE-required-vs-published-for-simplicity distinction — shown as a small badge, not a separate section.",
      options: { list: [{ title: "Must be on the website", value: "required" }, { title: "Published for simplicity", value: "published" }] },
      initialValue: "required",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "parentQuestionCategory",
      title: "Parent question group",
      type: "string",
      description: "Which question a parent is likely to have when they reach for this document. Used to group the Policies page by what parents actually want to know, instead of by DfE category.",
      options: {
        list: [
          { title: "Is my child safe?", value: "safety" },
          { title: "How do we apply and what does it cost?", value: "admissions-fees" },
          { title: "What if something goes wrong?", value: "complaints" },
          { title: "How is my data used?", value: "data" },
          { title: "What do you teach and how?", value: "curriculum" },
        ],
      },
    }),
    defineField({
      name: "file",
      title: "Document file (PDF)",
      type: "file",
      options: { accept: "application/pdf" },
      description: "Upload a replacement here to update the published document — no code change needed.",
    }),
    defineField({ name: "fileUrl", title: "Document URL (fallback)", type: "url", description: "Used only if no file is uploaded above — e.g. a path under /policies/ on this site." }),
    defineField({ name: "summary", title: "One-line summary", type: "string" }),
    defineField({
      name: "requiresSignature",
      title: "Requires e-signature on /learn",
      type: "boolean",
      description: "When on, targeted roles must sign this document's current file version on the /learn portal (staff policy sign-off, parent consent forms, etc). Most published policies don't need this.",
      initialValue: false,
    }),
    defineField({
      name: "signatureTargetRoles",
      title: "Who must sign",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Head Teacher", value: "head_teacher" },
          { title: "Admin", value: "admin" },
          { title: "Admissions", value: "admissions" },
          { title: "Teacher", value: "teacher" },
          { title: "Teaching Assistant/Cover", value: "teaching_assistant_cover" },
          { title: "Parent", value: "parent" },
          { title: "Student", value: "student" },
        ],
      },
      hidden: ({ parent }) => !parent?.requiresSignature,
      description: "Only shown/used when \"Requires e-signature\" is on. Synced into /learn's signable_documents table by scripts/sync-signable-documents-from-sanity.mjs.",
    }),
    defineField({ name: "lastReviewed", title: "Last reviewed", type: "date" }),
    defineField({ name: "nextReview", title: "Next review due", type: "date" }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "title", number: "number", category: "category" },
    prepare: ({ title, number, category }) => ({ title: `${number ? `${number} — ` : ""}${title}`, subtitle: category }),
  },
});
