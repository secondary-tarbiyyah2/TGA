// Generates public/term-dates.ics at build time, from the same confirmed
// term dates the Term Dates page shows (getTermDates() in src/lib/content.ts
//, Sanity if configured, else the bundled seed fallback). This site is a
// fully static export with no server/API routes, so the .ics has to exist as
// a real file written before `next build` runs (wired in as the "prebuild"
// npm script) rather than generated on demand, a static file downloads
// reliably from every mobile calendar app, unlike a `data:` URI link, which
// several iOS/Android calendar apps handle inconsistently.
//
// If there are zero confirmed term dates, no file is written (and any stale
// one from a previous build is removed) · the Term Dates page hides the
// download link entirely rather than ever offering an empty calendar.
import { createClient } from "@sanity/client";
import { writeFileSync, existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "term-dates.ics");

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-01-01";

// Kept in sync by hand with `termDates` in src/content/seed.ts (same
// convention already used by scripts/seed-sanity.mjs).
// Prospectus 2026-27 p.19 (same rows as migration 0106 / site_term_dates).
const seedTermDates = [
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000001", label: "Application deadline for the founding cohort", kind: "Admissions deadline", date: "2026-12-18", notes: "Applications received after 18 December are welcome and are considered while places remain.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000005", label: "Winter break", kind: "Holiday", date: "2026-12-19", endDate: "2027-01-03", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000003", label: "Induction week (the Academy opens)", kind: "Event", date: "2027-01-04", endDate: "2027-01-08", notes: "Set up accounts, test devices and meet teachers.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000002", label: "Registration fee and first fee payment due", kind: "Admissions deadline", date: "2027-01-08", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000006", label: "Spring term A (first live lessons Monday 11 January)", kind: "Term date", date: "2027-01-11", endDate: "2027-02-12", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000007", label: "Ramadan and Eid break", kind: "Holiday", date: "2027-02-15", endDate: "2027-03-12", notes: "Islamic dates depend on the moon sighting and may move by a day or two.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000008", label: "Spring term B", kind: "Term date", date: "2027-03-15", endDate: "2027-03-25", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000009", label: "Spring half term", kind: "Holiday", date: "2027-03-26", endDate: "2027-03-30", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000010", label: "Summer term A", kind: "Term date", date: "2027-03-31", endDate: "2027-05-07", notes: "No lessons on Friday 9 April (INSET) or Monday 3 May.", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000011", label: "Eid al-Adha half term", kind: "Holiday", date: "2027-05-10", endDate: "2027-05-21", confirmed: true },
  { _id: "7e0d0001-0e0e-4e0e-8e0e-000000000012", label: "Summer term B", kind: "Term date", date: "2027-05-24", endDate: "2027-07-09", notes: "No lessons on Monday 31 May. Awards ceremony (online) in early July.", confirmed: true },
];

async function fetchConfirmedTermDates() {
  if (!projectId) return seedTermDates.filter((d) => d.confirmed);
  try {
    const client = createClient({ projectId, dataset, apiVersion, useCdn: false });
    const result = await client.fetch(`*[_type == "termDate" && confirmed == true] | order(date asc)`);
    if (Array.isArray(result) && result.length > 0) return result;
    return seedTermDates.filter((d) => d.confirmed);
  } catch {
    return seedTermDates.filter((d) => d.confirmed);
  }
}

function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function toIcsDate(iso) {
  return iso.replace(/-/g, "");
}

function toIcsUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildIcs(dates) {
  const now = toIcsUtcStamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tarbiyyah Global Academy//Term Dates//EN", "CALSCALE:GREGORIAN"];
  for (const d of dates) {
    const start = toIcsDate(d.date);
    // All-day events use DTEND exclusive of the last day; a single-day event's
    // DTEND is simply the day after DTSTART.
    const endSource = d.endDate || d.date;
    const endDateObj = new Date(`${endSource}T00:00:00Z`);
    endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
    const end = toIcsDate(endDateObj.toISOString().slice(0, 10));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d._id}@globalacademy.tarbiyyah.co.uk`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(`${d.label} (Tarbiyyah Global Academy)`)}`,
      `DESCRIPTION:${icsEscape(d.kind + (d.notes ? ` · ${d.notes}` : ""))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const dates = await fetchConfirmedTermDates();

if (dates.length === 0) {
  if (existsSync(outPath)) unlinkSync(outPath);
  console.log("No confirmed term dates, skipped writing public/term-dates.ics.");
} else {
  mkdirSync(path.dirname(outPath), { recursive: true });
  // DTSTAMP is "now", so every build would rewrite the committed file with
  // nothing but a new timestamp. Keep the existing file when the dates are
  // unchanged; calendar apps only re-import on a real change anyway.
  const fresh = buildIcs(dates);
  const strip = (t) => t.replace(/^DTSTAMP:.*$/gm, "");
  if (existsSync(outPath) && strip(readFileSync(outPath, "utf8")) === strip(fresh)) {
    console.log(`public/term-dates.ics unchanged (${dates.length} confirmed date(s)).`);
  } else {
    writeFileSync(outPath, fresh, "utf8");
    console.log(`Wrote public/term-dates.ics with ${dates.length} confirmed date(s).`);
  }
}
