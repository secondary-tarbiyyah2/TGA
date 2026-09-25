// Syncs Sanity's policyLink documents flagged `requiresSignature` into the
// `signable_documents` table (0014_esignature.sql), the same "Sanity is
// the single source of truth, synced not hand-duplicated" pattern as
// scripts/sync-terms-from-sanity.mjs (see its header for the fuller
// reasoning). Keyed on `sanity_document_id` (Sanity's `_id`), so re-running
// is idempotent.
//
// Version identifier: Sanity's own file asset `_id` (re-uploading a PDF in
// Studio creates a brand-new asset with a new `_id` — Sanity never mutates
// an asset in place), used exactly as-is as `current_asset_id` rather than
// inventing a parallel version number.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SANITY_PROJECT_ID
// (+ optionally SANITY_API_TOKEN for a private dataset).
import { createClient as createSanityClient } from "@sanity/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const sanityToken = process.env.SANITY_API_TOKEN;

if (!supabaseUrl || !serviceRoleKey || !sanityProjectId) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SANITY_PROJECT_ID");
  process.exit(1);
}

const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey);
const sanity = createSanityClient({ projectId: sanityProjectId, dataset: sanityDataset, token: sanityToken, apiVersion: "2025-01-01", useCdn: false });

const docs = await sanity.fetch(
  `*[_type == "policyLink" && requiresSignature == true && defined(file.asset)]{
    _id, title, signatureTargetRoles, "assetId": file.asset->_id
  }`
);

console.log(`Found ${docs.length} Sanity document(s) flagged requiresSignature with a file uploaded.`);

let synced = 0;
for (const d of docs) {
  const roles = Array.isArray(d.signatureTargetRoles) ? d.signatureTargetRoles : [];
  if (roles.length === 0) {
    console.warn(`Skipping "${d.title}" (${d._id}): requiresSignature is on but no target roles are set.`);
    continue;
  }
  const { error } = await supabase.from("signable_documents").upsert(
    {
      sanity_document_id: d._id,
      title: d.title,
      target_roles: roles,
      requires_signature: true,
      current_asset_id: d.assetId,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "sanity_document_id" }
  );
  if (error) throw error;
  synced += 1;
}

// A document that used to require a signature but no longer does (or lost
// its file) should stop being sync-owned as "requires a signature" too —
// flip requires_signature off rather than deleting, so existing
// document_signatures history (audit trail) is never lost.
const syncedIds = new Set(docs.map((d) => d._id));
const { data: existing } = await supabase.from("signable_documents").select("id, sanity_document_id").eq("requires_signature", true);
for (const row of existing || []) {
  if (!syncedIds.has(row.sanity_document_id)) {
    await supabase.from("signable_documents").update({ requires_signature: false }).eq("id", row.id);
  }
}

console.log(`Synced ${synced} signable document(s).`);
