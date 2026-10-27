import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Only the anon key is ever used here, safe to ship in frontend code.
 * Import this ONLY from client components that actually need Supabase
 * (booking, portals, staff area), per DESIGN.md, it's dead weight on every
 * other page otherwise.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!cached) cached = createClient(url, anonKey);
  return cached;
}

export function getEdgeFunctionUrl(functionName: string): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/functions/v1/${functionName}`;
}

export const ADMISSIONS_TEAMS_URL = process.env.NEXT_PUBLIC_ADMISSIONS_TEAMS_URL || "";
