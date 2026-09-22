import type { StructureResolver } from "sanity/structure";

/** Custom desk structure: singleton Site settings at the top, then editable lists. */
export const structure: StructureResolver = (S) =>
  S.list()
    .title("Tarbiyyah Global Academy content")
    .items([
      S.listItem()
        .title("Site settings")
        .id("siteSettings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
      S.divider(),
      S.documentTypeListItem("feeBand").title("Fee bands"),
      S.documentTypeListItem("faqEntry").title("FAQ entries"),
      S.documentTypeListItem("termDate").title("Term & admissions dates"),
      S.documentTypeListItem("testimonial").title("Testimonials"),
      S.documentTypeListItem("staffMember").title("Staff members"),
      S.documentTypeListItem("differentiator").title("Differentiator copy blocks"),
      S.documentTypeListItem("policyLink").title("Policy documents"),
    ]);
