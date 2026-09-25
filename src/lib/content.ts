import { getSanityClient } from "./sanity/client";
import {
  feeBands as seedFeeBands, siteSettings as seedSiteSettings, faqEntries as seedFaqEntries,
  termDates as seedTermDates, testimonials as seedTestimonials, staffMembers as seedStaffMembers,
  differentiators as seedDifferentiators, policyLinks as seedPolicyLinks,
  type FeeBand, type FaqEntry, type TermDate, type Testimonial, type StaffMember, type Differentiator, type PolicyLink,
} from "@/content/seed";

/** Every getter below tries live Sanity content first, and falls back to bundled seed
 * content (same shape) whenever Sanity isn't configured yet or a query fails. This lets
 * every page work out of the box, and start reading real CMS data the moment a Sanity
 * project is connected — no code change required.
 *
 * This site is statically exported (output: "export"), so these queries only ever run
 * at build time — there is no server to re-fetch at request time. CMS edits appear on
 * the next rebuild/redeploy, not instantly; see README for how to trigger one. */
async function fetchOrFallback<T>(query: string, fallback: T): Promise<T> {
  const client = getSanityClient();
  if (!client) return fallback;
  try {
    const result = await client.fetch<T>(query);
    if (Array.isArray(result) && result.length === 0) return fallback;
    if (result == null) return fallback;
    return result;
  } catch {
    return fallback;
  }
}

export const getFeeBands = () => fetchOrFallback<FeeBand[]>(`*[_type == "feeBand"] | order(order asc)`, seedFeeBands);

export const getSiteSettings = () => fetchOrFallback(`*[_type == "siteSettings"][0]`, seedSiteSettings);

export const getFaqEntries = () => fetchOrFallback<FaqEntry[]>(`*[_type == "faqEntry"] | order(order asc)`, seedFaqEntries);

export const getTermDates = () => fetchOrFallback<TermDate[]>(`*[_type == "termDate"] | order(date asc)`, seedTermDates);

export const getTestimonials = () => fetchOrFallback<Testimonial[]>(`*[_type == "testimonial"] | order(order asc)`, seedTestimonials);

export const getStaffMembers = () => fetchOrFallback<StaffMember[]>(`*[_type == "staffMember"] | order(order asc)`, seedStaffMembers);

export const getDifferentiators = () =>
  fetchOrFallback<Differentiator[]>(`*[_type == "differentiator" && visible == true] | order(order asc)`, seedDifferentiators.filter((d) => d.visible));

export const getPolicyLinks = () =>
  fetchOrFallback<PolicyLink[]>(
    `*[_type == "policyLink"] | order(order asc) {
      _id, number, title, category, summary, lastReviewed, nextReview, order,
      "fileUrl": coalesce(file.asset->url, fileUrl)
    }`,
    seedPolicyLinks
  );
