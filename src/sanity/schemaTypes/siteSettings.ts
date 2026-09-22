import { defineField, defineType } from "sanity";

export default defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  fields: [
    defineField({ name: "applicationFee", title: "Application fee (£, non-refundable)", type: "number", initialValue: 247 }),
    defineField({ name: "registrationFee", title: "Registration fee (£, one-time)", type: "number", initialValue: 150 }),
    defineField({ name: "bookingWidgetUrl", title: "Open Evening booking widget URL", type: "url", description: "Embed link for the booking widget (e.g. Calendly)." }),
    defineField({ name: "openEveningRecordingUrl", title: "Past open evening recording URL", type: "url" }),
    defineField({ name: "portalUrl", title: "Parent/Student portal URL (Moodle / M365 SSO)", type: "url" }),
    defineField({ name: "admissionsEmail", title: "Admissions email", type: "string", initialValue: "globalacademy@tarbiyyah.co.uk" }),
  ],
  preview: {
    prepare: () => ({ title: "Site settings" }),
  },
});
