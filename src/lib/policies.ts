import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Policy text: the header fields and markdown body a policy is written as
 * (editable in /learn/admin/content -> Policy documents -> Edit text, stored
 * in policy_links.body_md / meta, migration 0174). The same text drives the
 * PDF (scripts/build-policies.cjs) and the readable page at
 * /policies/<slug>/. When the database is not reachable at build time the
 * markdown files in content/policies/ (the seed, and the git backup) are
 * used instead, so the pages always build.
 */

import { parsePolicyMarkdown, type PolicyMeta, type PolicyText } from "@/lib/policyMeta";

export { POLICY_META_FIELDS, parsePolicyMarkdown } from "@/lib/policyMeta";
export type { PolicyMeta, PolicyText } from "@/lib/policyMeta";

function fromFiles(): PolicyText[] {
  const dir = join(process.cwd(), "content", "policies");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const parsed = parsePolicyMarkdown(readFileSync(join(dir, f), "utf8"));
      return parsed ? { slug: f.replace(/\.md$/, ""), ...parsed } : null;
    })
    .filter((p): p is PolicyText => p !== null);
}

/** Every public policy that has text (not file-only), for the static build. */
export async function getPolicyTexts(): Promise<PolicyText[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("policy_links")
        .select("slug, number, title, meta, body_md, file_path")
        .eq("visibility", "public")
        .not("body_md", "is", null)
        .order("order_index");
      if (!error && Array.isArray(data)) {
        const texts = data
          .filter((r) => r.slug && r.body_md && !r.file_path)
          .map((r) => ({ slug: r.slug as string, number: r.number as string, title: r.title as string, meta: (r.meta as PolicyMeta) || {}, body: r.body_md as string }));
        // No text imported yet (fresh database): the bundled markdown is the seed.
        if (texts.length > 0) return texts;
      }
    } catch {
      // fall through to the files
    }
  }
  return fromFiles();
}
