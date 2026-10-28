// Brings the website's policy list (policy_links) in line with the policy
// set in Google Drive, as listed in scripts/policies.json. Only touches
// policy_links — unlike seed-website-content.mjs, nothing else on the site
// is overwritten.
//
// For each policy in the list:
//   - an existing row is found by its seed id, or by its old or new address,
//     and updated IN PLACE (same id), so signature records that point at it
//     (signable_documents.policy_link_id) stay attached;
//   - a policy that isn't on the site yet is added;
//   - any file uploaded earlier in the admin portal is detached, so the
//     website serves the Drive version bundled in /policies/ (deploy/policy.php
//     falls back to it). The admin portal can still replace it afterwards.
//   - where the Drive text actually changed (contentChanged), file_updated_at
//     is bumped so anyone who must sign that policy is asked to sign the new
//     version.
// Rows not in the list (e.g. added by an admin) are left alone.
//
// Where content/policies/<stem>.md exists, its header fields and body are
// written into the row (meta, body_md) so the policy is editable as text in
// the portal (0171). By default that only happens for a row that has no text
// yet, so wording edited in the portal is never overwritten by the repo copy;
// --overwrite-text replaces it anyway (use after editing the markdown in git).
//
// Run AFTER the site deploy that ships the new PDFs, via
// .github/workflows/sync-policies.yml. Pass --dry-run to only print the plan.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

/** Front matter + body of a content/policies markdown file, or null if there is none. */
function readPolicyText(stem) {
  const path = new URL(`../content/policies/${stem}.md`, import.meta.url);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!["number", "title"].includes(key)) meta[key] = value;
  }
  return { meta, body: text.slice(m[0].length).trim() };
}

const dryRun = process.argv.includes("--dry-run");
const overwriteText = process.argv.includes("--overwrite-text");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Same id scheme as seed-website-content.mjs.
function deterministicId(seed) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const ISSUED = "2026-09-01";
const NEXT_REVIEW = "2027-08-31";
const list = JSON.parse(readFileSync(new URL("./policies.json", import.meta.url), "utf8"));

const { data: existing, error: readErr } = await supabase
  .from("policy_links")
  .select("id, number, title, slug, file_url, file_path, deleted_at, body_md");
if (readErr) throw new Error(`read policy_links: ${readErr.message}`);

const byId = new Map(existing.map((r) => [r.id, r]));
const bySlug = new Map(existing.filter((r) => r.slug).map((r) => [r.slug, r]));
const byUrl = new Map(existing.filter((r) => r.file_url).map((r) => [r.file_url, r]));
const claimed = new Set();
const now = new Date().toISOString();

// Free up every slug the new list needs first, so renaming row A to a slug
// another row still holds can't trip the unique index mid-way.
const plan = [];
for (const p of list) {
  const id = deterministicId(p.seed);
  const url = `/policies/${p.stem}.pdf`;
  const oldUrl = p.oldStem ? `/policies/${p.oldStem}.pdf` : null;
  const match =
    [byId.get(id), bySlug.get(p.stem), byUrl.get(url), p.oldStem && bySlug.get(p.oldStem), oldUrl && byUrl.get(oldUrl)].find(
      (r) => r && !claimed.has(r.id),
    ) || null;
  if (match) claimed.add(match.id);
  const fields = {
    number: p.number,
    title: p.title,
    category: p.category,
    parent_question_category: p.group,
    order_index: p.order,
    summary: p.summary || null,
    slug: p.stem,
    file_url: url,
    file_path: null,
    file_name: null,
    file_kind: null,
    extracted_text: null,
    last_reviewed: ISSUED,
    next_review: NEXT_REVIEW,
    ...(p.contentChanged ? { file_updated_at: now } : {}),
  };
  const text = readPolicyText(p.stem);
  if (text && (!match || !match.body_md || overwriteText)) {
    fields.body_md = text.body;
    fields.meta = text.meta;
  }
  plan.push({ p, match, id: match ? match.id : id, fields });
}

const holders = existing.filter((r) => plan.some((x) => x.fields.slug === r.slug) && !plan.some((x) => x.match?.id === r.id));
for (const r of holders) {
  console.log(`! slug ${r.slug} is held by an unlisted row (${r.number} ${r.title}); renaming it to ${r.slug}-old`);
  if (!dryRun) {
    const { error } = await supabase.from("policy_links").update({ slug: `${r.slug}-old` }).eq("id", r.id);
    if (error) throw new Error(`free slug ${r.slug}: ${error.message}`);
  }
}
// Temporary slugs on matched rows avoid clashes between two listed rows swapping addresses.
for (const x of plan.filter((x) => x.match && x.match.slug !== x.fields.slug)) {
  if (!dryRun) {
    const { error } = await supabase.from("policy_links").update({ slug: `tmp-${x.match.id.slice(0, 8)}` }).eq("id", x.match.id);
    if (error) throw new Error(`temp slug ${x.p.number}: ${error.message}`);
  }
}

let updated = 0;
let added = 0;
for (const { p, match, id, fields } of plan) {
  if (match) {
    const moved = match.number !== p.number || match.file_url !== fields.file_url;
    console.log(`= ${p.number} ${p.title}${moved ? `  (was ${match.number}, ${match.file_url})` : ""}${match.file_path ? "  [detached admin upload]" : ""}${match.deleted_at ? "  [note: removed in admin, left removed]" : ""}${fields.body_md ? "  [text imported]" : ""}`);
    if (!dryRun) {
      const { error } = await supabase.from("policy_links").update(fields).eq("id", match.id);
      if (error) throw new Error(`update ${p.number}: ${error.message}`);
    }
    updated++;
  } else {
    console.log(`+ ${p.number} ${p.title}`);
    if (!dryRun) {
      const { error } = await supabase.from("policy_links").insert({ id, ...fields });
      if (error) throw new Error(`insert ${p.number}: ${error.message}`);
    }
    added++;
  }
}

console.log(`${dryRun ? "[dry run] " : ""}Policies: ${updated} updated, ${added} added, ${existing.length - claimed.size} other row(s) left as they were.`);
