import { defineField, defineType } from "sanity";

export default defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  groups: [
    { name: "launch", title: "Launch & CTAs" },
    { name: "fees", title: "Fees" },
    { name: "contact", title: "Contact & hours" },
    { name: "safeguarding", title: "Safeguarding" },
    { name: "compliance", title: "Compliance & regulatory status" },
    { name: "welcome", title: "Headteacher welcome" },
  ],
  fields: [
    defineField({ name: "launchDate", title: "Launch date (first live lessons)", type: "date", group: "launch" }),
    defineField({ name: "ctaPrimaryLabel", title: "Primary call-to-action label", type: "string", initialValue: "Apply Now", group: "launch" }),
    defineField({ name: "ctaPrimaryHref", title: "Primary call-to-action link", type: "string", initialValue: "/admissions", group: "launch" }),

    defineField({ name: "applicationFee", title: "Application fee (£, non-refundable)", type: "number", initialValue: 150, group: "fees" }),
    defineField({
      name: "siblingDiscountPercent",
      title: "Sibling discount (%)",
      type: "number",
      description: "Leave blank if there is no sibling discount yet, the fees page hides this row until a value is set.",
      group: "fees",
    }),
    defineField({
      name: "siblingDiscountNote",
      title: "Sibling discount, how it applies",
      type: "text",
      rows: 2,
      description: "e.g. which child the discount applies to, from which sibling onward.",
      group: "fees",
    }),
    defineField({
      name: "discounts",
      title: "Other discounts",
      type: "array",
      group: "fees",
      description:
        "General-purpose discount catalogue for the fee estimator (early-registration, bursary, multi-child, etc). Leave empty until the school has confirmed a real discount to add here, an empty list hides the fee estimator's discount section entirely.",
      of: [
        defineField({
          name: "discount",
          title: "Discount",
          type: "object",
          fields: [
            defineField({ name: "label", title: "Label", type: "string", validation: (Rule) => Rule.required() }),
            defineField({
              name: "type",
              title: "Discount type",
              type: "string",
              options: {
                list: [
                  { title: "Percentage off", value: "percent" },
                  { title: "Fixed amount off (£)", value: "fixedAmount" },
                ],
              },
              initialValue: "percent",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "percent",
              title: "Percent off (%)",
              type: "number",
              hidden: ({ parent }) => (parent as { type?: string } | undefined)?.type !== "percent",
            }),
            defineField({
              name: "fixedAmount",
              title: "Fixed amount off (£)",
              type: "number",
              hidden: ({ parent }) => (parent as { type?: string } | undefined)?.type !== "fixedAmount",
            }),
            defineField({ name: "note", title: "Note, how it applies", type: "text", rows: 2 }),
            defineField({
              name: "appliesAutomatically",
              title: "Applies automatically (no eligibility check needed)",
              type: "boolean",
              initialValue: false,
              description: "On, e.g., a straightforward promotional discount. Off for anything needing a human eligibility check, like a bursary.",
            }),
            defineField({
              name: "eligibilityDescription",
              title: "Eligibility description",
              type: "text",
              rows: 2,
              description:
                "For discounts needing a human check (e.g. a bursary). Shown as an 'I believe I qualify' checkbox on the fee estimator, never applied automatically, and final eligibility is always confirmed during application.",
            }),
          ],
          preview: {
            select: { title: "label", type: "type", percent: "percent", fixedAmount: "fixedAmount" },
            prepare: ({ title, type, percent, fixedAmount }) => ({
              title,
              subtitle: type === "percent" ? `${percent ?? "?"}% off` : `£${fixedAmount ?? "?"} off`,
            }),
          },
        }),
      ],
    }),
    defineField({ name: "bookingWidgetUrl", title: "Open Evening booking widget URL", type: "url", description: "Embed link for the booking widget (e.g. Calendly).", group: "launch" }),
    defineField({ name: "openEveningRecordingUrl", title: "Past open evening recording URL", type: "url", group: "launch" }),
    defineField({ name: "portalUrl", title: "Parent/Student portal URL (legacy, superseded by /learn)", type: "url", group: "launch" }),

    defineField({ name: "admissionsEmail", title: "Admissions email", type: "string", initialValue: "globalacademy@tarbiyyah.co.uk", group: "contact" }),
    defineField({ name: "contactPhone", title: "Contact phone number", type: "string", description: "Leave blank to hide from the site until a real number is confirmed.", group: "contact" }),
    defineField({ name: "contactAddress", title: "Postal address", type: "text", rows: 3, group: "contact" }),
    defineField({ name: "openingHours", title: "Office opening hours", type: "text", rows: 3, description: "e.g. Monday–Friday, 9am–4pm (UK time). Leave blank to hide.", group: "contact" }),

    defineField({ name: "safeguardingLeadName", title: "Designated Safeguarding Lead, name", type: "string", group: "safeguarding" }),
    defineField({ name: "safeguardingLeadContact", title: "Designated Safeguarding Lead, contact (email or phone)", type: "string", group: "safeguarding" }),
    defineField({
      name: "complaintsLastYear",
      title: "Formal complaints in the last academic year",
      type: "number",
      description: "Shown on the Policies page next to the Concerns and Complaints Policy, per the DfE transparency expectation.",
      initialValue: 0,
      group: "safeguarding",
    }),

    defineField({
      name: "registrationBody",
      title: "Registration/regulatory body",
      type: "string",
      description: "e.g. a named regulator, once actually registered. Leave blank until confirmed, never state a regulatory status that isn't yet true.",
      group: "compliance",
    }),
    defineField({ name: "registrationNumber", title: "Registration number", type: "string", group: "compliance" }),
    defineField({
      name: "regulatoryStatusNote",
      title: "Regulatory status, public-facing note",
      type: "text",
      rows: 3,
      description: "Exact, factual wording only. This is the only regulatory claim ever shown publicly, nothing is stated beyond what's entered here.",
      group: "compliance",
    }),

    defineField({
      name: "headteacherWelcomeQuote",
      title: "Headteacher welcome, quote",
      type: "text",
      rows: 4,
      description: "Must be an actual quote provided by the Headteacher. Leave blank to hide this section, never a stand-in or drafted-for-them quote.",
      group: "welcome",
    }),
    defineField({ name: "headteacherName", title: "Headteacher, name", type: "string", group: "welcome" }),
  ],
  preview: {
    prepare: () => ({ title: "Site settings" }),
  },
});
