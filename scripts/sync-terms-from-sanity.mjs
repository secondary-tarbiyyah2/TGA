// Syncs Sanity's confirmed "Term date" termDate documents into the
// `terms` table (0008_timetabling.sql), so term dates have exactly one
// source of truth (Sanity) and are never hand-duplicated in the DB — per
// the ground rule "dates ... live in Sanity CMS ... never hardcoded" and
// "term dates in the new `terms` table must sync from Sanity's `termDate`
// content, not be entered twice".
//
// Groups consecutive/overlapping Sanity term-date ranges under academic
// years (naming an academic year "<start year>/<end year short>", e.g.
// dates in Sep 2026 - Jul 2027 become "2026/27") and upserts one
// `academic_years` row plus one `terms` row per Sanity document, keyed on
// `sanity_document_id` so re-running this is idempotent (createOrReplace
// style, matching scripts/seed-sanity.mjs's own convention) and so the
// `protect_sanity_owned_terms` trigger recognises these rows as
// Sanity-owned (never hand-editable from the admin UI).
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (this writes via the
// service-role key, like every other batch script here) and
// NEXT_PUBLIC_SANITY_PROJECT_ID (+ optionally SANITY_API_TOKEN for a
// private dataset). Run via:
//   node scripts/sync-terms-from-sanity.mjs
//
// Intended to run on a schedule (e.g. nightly via a GitHub Actions cron)
// or after editing Sanity's Term Dates — not wired to a live trigger in
// Phase A; that's a reasonable follow-up, not required for the sync
// mechanism itself to be correct.
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
const sanity = createSanityClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  token: sanityToken,
  apiVersion: "2025-01-01",
  useCdn: false,
});

function academicYearLabelFor(dateStr) {
  const d = new Date(dateStr);
  // Academic year runs Sep -> Aug: a date in Jan-Aug belongs to the year
  // that started the previous September.
  const startYear = d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}/${endYearShort}`;
}

const termDates = await sanity.fetch(
  `*[_type == "termDate" && kind == "Term date" && confirmed == true] | order(date asc){ _id, label, date, endDate }`
);

if (termDates.length === 0) {
  console.log("No confirmed Sanity term dates found — nothing to sync.");
  process.exit(0);
}

const byYear = new Map();
for (const t of termDates) {
  const label = academicYearLabelFor(t.date);
  if (!byYear.has(label)) byYear.set(label, []);
  byYear.get(label).push(t);
}

for (const [label, terms] of byYear) {
  const starts = terms.map((t) => t.date).sort()[0];
  const ends = terms.map((t) => t.endDate || t.date).sort().at(-1);
  // starts_on/ends_on must strictly bracket every term; pad the academic
  // year's own end date by a day if a term's own end date matches it
  // exactly (the DB's check constraint requires ends_on > starts_on, and a
  // single-day term is a valid edge case in real data).
  const yearEnds = ends > starts ? ends : new Date(new Date(starts).getTime() + 86400000).toISOString().slice(0, 10);

  const { data: yearRow, error: yearErr } = await supabase
    .from("academic_years")
    .upsert({ label, starts_on: starts, ends_on: yearEnds, is_test: false }, { onConflict: "label" })
    .select()
    .single();
  if (yearErr) throw yearErr;

  for (const t of terms) {
    const termEnds = t.endDate && t.endDate > t.date ? t.endDate : new Date(new Date(t.date).getTime() + 86400000).toISOString().slice(0, 10);
    const { error: termErr } = await supabase.from("terms").upsert(
      {
        academic_year_id: yearRow.id,
        name: t.label,
        starts_on: t.date,
        ends_on: termEnds,
        sanity_document_id: t._id,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "sanity_document_id" }
    );
    if (termErr) throw termErr;
  }

  console.log(`Synced academic year "${label}" with ${terms.length} term(s).`);
}

console.log("Done.");
