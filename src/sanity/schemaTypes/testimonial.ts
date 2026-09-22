import { defineField, defineType } from "sanity";

export default defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "quote", title: "Quote", type: "text", rows: 4, validation: (r) => r.required() }),
    defineField({ name: "attribution", title: "Attribution", type: "string", description: "e.g. \"Parent of a Year 4 pupil\"", validation: (r) => r.required() }),
    defineField({ name: "role", title: "Role", type: "string", options: { list: ["Parent", "Student"] } }),
    defineField({ name: "photo", title: "Photo", type: "image", options: { hotspot: true } }),
    defineField({ name: "isPlaceholder", title: "Marked as placeholder copy", type: "boolean", initialValue: true, description: "Untick once this is a real, supplied testimonial." }),
    defineField({ name: "order", title: "Display order", type: "number" }),
  ],
  preview: {
    select: { title: "attribution", subtitle: "quote", media: "photo" },
  },
});
