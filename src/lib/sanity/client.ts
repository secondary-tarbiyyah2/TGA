import { createClient, type SanityClient } from "next-sanity";
import { apiVersion, dataset, projectId, sanityConfigured } from "./env";

let cachedClient: SanityClient | null = null;

/** Returns a configured Sanity client, or null if no project is set up yet. */
export function getSanityClient(): SanityClient | null {
  if (!sanityConfigured) return null;
  if (!cachedClient) {
    cachedClient = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: process.env.NODE_ENV === "production",
      perspective: "published",
    });
  }
  return cachedClient;
}
