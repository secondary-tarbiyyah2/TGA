import { type SchemaTypeDefinition } from "sanity";

import feeBand from "./feeBand";
import faqEntry from "./faqEntry";
import termDate from "./termDate";
import testimonial from "./testimonial";
import staffMember from "./staffMember";
import differentiator from "./differentiator";
import policyLink from "./policyLink";
import siteSettings from "./siteSettings";
import homepageContent from "./homepageContent";
import aboutContent from "./aboutContent";
import curriculumContent from "./curriculumContent";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    feeBand, faqEntry, termDate, testimonial, staffMember, differentiator, policyLink, siteSettings,
    homepageContent, aboutContent, curriculumContent,
  ],
};
