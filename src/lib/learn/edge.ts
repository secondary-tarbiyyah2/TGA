import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";

export type EdgeResult = { ok: boolean; error?: string; detail?: string; [key: string]: unknown };

// Plain-English versions of the error codes our Edge Functions return, so
// staff see "Video calls aren't set up yet" rather than a stuck button or
// "bbb_not_configured".
const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "The portal isn't connected to the server yet.",
  network_error: "Couldn't reach the server. Check your connection and try again.",
  function_not_deployed: "This feature hasn't been switched on on the server yet. It will work after the next deploy.",
  bbb_not_configured: "Video calls aren't set up on the server yet. For admissions calls, add a Teams link to the staff member in Admissions to use in the meantime.",
  bbb_create_failed: "The video call server didn't respond. Try again in a minute.",
  forbidden: "Your account isn't allowed to do this.",
  booking_not_found: "That booking couldn't be found.",
  booking_cancelled: "That booking has been cancelled.",
};

export function edgeErrorMessage(result: EdgeResult): string {
  return (result.error && ERROR_MESSAGES[result.error]) || result.detail || result.error || "Something went wrong. Try again.";
}

/**
 * POST to one of our Supabase Edge Functions as the signed-in user.
 * Never throws: a network failure, a missing function (404, which also
 * comes back without CORS headers and so surfaces as a network error) or
 * a non-JSON reply all resolve to { ok: false, error }. Before this, each
 * page had its own copy that did `return res.json()`, and any of those
 * failures left the page's button stuck on "Starting…" forever.
 */
export async function callEdgeFunction(name: string, body: Record<string, unknown>): Promise<EdgeResult> {
  const supabase = getSupabaseClient();
  const url = getEdgeFunctionUrl(name);
  if (!supabase || !url) return { ok: false, error: "not_configured" };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: JSON.stringify(body),
    });
    if (res.status === 404) return { ok: false, error: "function_not_deployed" };
    const json = (await res.json().catch(() => null)) as EdgeResult | null;
    return json && typeof json === "object" ? json : { ok: false, error: `http_${res.status}` };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
