import { defineField, defineType } from "sanity";

export default defineType({
  name: "staffMember",
  title: "Staff member",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "roleTitle", title: "Role / subject", type: "string", validation: (r) => r.required() }),
    defineField({ name: "qualifications", title: "Qualifications / ijazah", type: "text", rows: 3 }),
    defineField({ name: "photo", title: "Photo", type: "image", options: { hotspot: true } }),
    defineField({ name: "introVideoUrl", title: "Intro video URL", type: "url", description: "Link to a short intro video (YouTube/Vimeo), once supplied." }),
    defineField({ name: "isPlaceholder", title: "Marked as placeholder", type: "boolean", initialValue: true }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "name", subtitle: "roleTitle", media: "photo" },
  },
});
