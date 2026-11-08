// A short fingerprint of a lesson's (or a unit's) content, the same whatever order its keys
// are in. "Build lesson decks" stores it with each deck (curriculum_lessons.built_hash) so a
// change to the lesson, from the portal editor or the repo, rebuilds its slides and plan;
// the curriculum sync (scripts/curriculum/sync.mjs) uses it to tell who changed what.
import crypto from "node:crypto";

/** JSON with object keys sorted at every level, so equal content gives equal text. */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
    .join(",")}}`;
}

export function contentHash(v) {
  return crypto.createHash("sha256").update(stableStringify(v)).digest("hex").slice(0, 32);
}
