import { defineField, defineType } from "sanity";

// Admin-editable curriculum overview/scheme-of-work documents, shown on each
// key stage's /curriculum/[stage] page grouped by subject. Mirrors
// policyLink.ts exactly (file upload + fallback URL) · same pattern, no new
// approach. Hidden entirely on the site wherever no document has been
// uploaded for a given key stage (see getCurriculumDocuments in
// src/lib/content.ts and the [stage] page) · no placeholder ever shown.
//
// The value list below is deliberately duplicated from src/content/curriculum.ts's
// keyStages (rather than imported) · no other schema file in this project
// imports from src/content, and Sanity Studio's own build doesn't share
// Next.js's path-alias resolution, so this keeps the schema safely
// self-contained. If a key stage's slug/range ever changes there, update
// this list to match.
const KEY_STAGES = [
  { title: "Year 1 – Year 2", value: "year-1-2" },
  { title: "Year 3 – Year 6", value: "year-3-6" },
  { title: "Year 7 – Year 9", value: "year-7-9" },
  { title: "Year 10 – Year 11", value: "year-10-11" },
];

export default defineType({
  name: "curriculumDocument",
  title: "Curriculum document",
  type: "document",
  fields: [
    defineField({
      name: "keyStage",
      title: "Key stage",
      type: "string",
      options: { list: KEY_STAGES },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "subject",
      title: "Subject",
      type: "string",
      description: "Type the subject name exactly as it appears in that key stage's subject list on the Curriculum page (e.g. \"Mathematics\", \"Qur'an & Hifdh\") so it groups correctly.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "title", title: "Document title", type: "string", description: "e.g. \"Year 7 Science overview\" or \"KS2 Qur'an & Hifdh scheme of work\".", validation: (r) => r.required() }),
    defineField({
      name: "term",
      title: "Term",
      type: "string",
      description: "Optional, leave blank if the document covers the whole year.",
      options: { list: [{ title: "Autumn", value: "autumn" }, { title: "Spring", value: "spring" }, { title: "Summer", value: "summer" }] },
    }),
    defineField({ name: "file", title: "Document file (PDF)", type: "file", options: { accept: "application/pdf" }, description: "Upload here to publish/update, no code change needed." }),
    defineField({ name: "fileUrl", title: "Document URL (fallback)", type: "url", description: "Used only if no file is uploaded above." }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "title", subject: "subject", keyStage: "keyStage" },
    prepare: ({ title, subject, keyStage }) => ({ title, subtitle: [keyStage, subject].filter(Boolean).join("– ") }),
  },
});
