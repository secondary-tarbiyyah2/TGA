import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";

/** Fires the rebuild trigger after a successful website-content save (see
 * supabase/functions/publish-website-content). The database write already
 * succeeded either way — this only decides what "when will it go live"
 * message the editor shows next to its "Saved" confirmation. */
export async function triggerPublish(): Promise<string> {
  const result = await callEdgeFunction("publish-website-content", {});
  if (result.ok) return "Saved. A rebuild has been triggered — live in a few minutes.";
  if (result.error === "not_configured") return "Saved, but the rebuild trigger isn't set up yet — run \"Deploy site\" manually, or push any code change, to publish this.";
  return `Saved, but couldn't trigger a rebuild automatically (${edgeErrorMessage(result)}). Run "Deploy site" manually to publish this.`;
}
