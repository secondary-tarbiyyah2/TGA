import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Best-effort, low-cardinality hash — never store raw IPs. */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns true if this ip/email combination has made too many attempts recently. */
export async function isRateLimited(
  supabase: SupabaseClient,
  ipHash: string,
  email: string
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour window

  const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
    supabase.from("booking_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
    supabase.from("booking_attempts").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since),
  ]);

  return (ipCount ?? 0) >= 8 || (emailCount ?? 0) >= 4;
}

export async function recordAttempt(supabase: SupabaseClient, ipHash: string, email: string) {
  await supabase.from("booking_attempts").insert({ ip_hash: ipHash, email });
}
