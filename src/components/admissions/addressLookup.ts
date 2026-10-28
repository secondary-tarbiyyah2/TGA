// Address lookup for the application form: the family picks a country, types a
// postcode or ZIP (and optionally a house number or name), and chooses their
// address from a list that fills Address line 1, line 2, Town or city and
// Postcode. The lookup is only ever a shortcut: every field stays editable,
// "Enter the address manually" is always offered, and a failed or empty lookup
// never blocks the form.
//
// Providers, chosen at build time:
//
//  * Google Places (Places API (New), REST): used when
//    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Autocomplete is restricted to the
//    chosen country; the picked suggestion is resolved with Place Details for
//    its address components. Google does not list every address inside a
//    postcode (that needs a paid PAF-style service such as Loqate or
//    getAddress.io), so a house number alongside the postcode works best. The
//    key should be restricted by HTTP referrer to the site's domain and to the
//    Places API (New) only, because it ships in the browser bundle.
//
//  * Free, keyless sources otherwise:
//      - UK: https://api.postcodes.io checks and normalises the postcode and
//        gives its centre point; Photon (https://photon.komoot.io, built on
//        OpenStreetMap) then supplies houses and streets near that point.
//      - Elsewhere: Photon alone, filtered to the chosen country. The
//        postcode is first located with a Photon search, then nearby houses
//        and streets are listed.
//    OpenStreetMap coverage is honest but patchy: many UK streets have every
//    house mapped, many do not, and in some countries only streets (or
//    nothing) are known. When no houses are found we offer nearby streets
//    (the family adds their house number), and when nothing is found we say
//    so and the family types the address. The postcode the family typed is
//    always kept, because OSM postcodes on buildings are often missing.
//
// Photon and postcodes.io are free public services with fair-use limits, so
// the form debounces typing and only searches once the postcode looks complete.
// The public site sends no Content-Security-Policy header (see public/.htaccess);
// if one is added, connect-src must allow https://api.postcodes.io,
// https://photon.komoot.io and https://places.googleapis.com.

import { countryCode } from "@/components/admissions/countryCodes";

export type AddressFill = { line1: string; line2: string; town: string; postcode: string };

export type AddressSuggestion = {
  id: string;
  label: string;
  detail?: string;
  /** "street" means we know the street but not the house: the family adds the number. */
  kind: "address" | "street" | "place";
  fill?: AddressFill;
  /** Google suggestions are resolved (Place Details) only when picked. */
  resolve?: () => Promise<AddressFill | null>;
};

export type LookupOutcome =
  | { status: "ok"; suggestions: AddressSuggestion[]; postcode: string; streetsOnly: boolean }
  | { status: "invalid_postcode" }
  | { status: "none"; postcode: string }
  | { status: "error" };

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
export const LOOKUP_PROVIDER: "google" | "osm" = GOOGLE_KEY ? "google" : "osm";

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const MAX_SUGGESTIONS = 40;

/** "sw1a2aa" becomes "SW1A 2AA" for the UK; elsewhere just trimmed and upper-cased. */
export function normalisePostcode(postcode: string, country: string): string {
  const raw = postcode.trim().replace(/\s+/g, " ").toUpperCase();
  if (countryCode(country) === "GB" && UK_POSTCODE.test(raw)) {
    const tight = raw.replace(/\s/g, "");
    return `${tight.slice(0, -3)} ${tight.slice(-3)}`;
  }
  return raw;
}

/** True once a lookup is worth sending: a full UK postcode, or 3+ characters elsewhere. */
export function postcodeLooksComplete(postcode: string, country: string): boolean {
  const pc = postcode.trim();
  if (countryCode(country) === "GB") return UK_POSTCODE.test(pc);
  return pc.replace(/[\s-]/g, "").length >= 3 && pc.toLowerCase() !== "none";
}

/** True when the lookup can be offered for this country (we know its code). */
export function lookupAvailableFor(country: string): boolean {
  return countryCode(country) !== null;
}

const tight = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

export async function lookupAddresses(opts: { country: string; postcode: string; house: string; signal: AbortSignal }): Promise<LookupOutcome> {
  const cc = countryCode(opts.country);
  if (!cc) return { status: "error" };
  const postcode = normalisePostcode(opts.postcode, opts.country);
  const house = opts.house.trim();
  if (GOOGLE_KEY) {
    try {
      return await googleLookup(cc, postcode, house, opts.signal);
    } catch (e) {
      if (opts.signal.aborted) throw e;
      // Fall through to the free sources if Google is misconfigured or down.
    }
  }
  return osmLookup(cc, postcode, house, opts.signal);
}

// ── Google Places (New) ──────────────────────────────────────────────────

type GooglePrediction = {
  placePrediction?: {
    placeId: string;
    text?: { text: string };
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    types?: string[];
  };
};
type GoogleComponent = { longText?: string; shortText?: string; types?: string[] };

async function googleLookup(cc: string, postcode: string, house: string, signal: AbortSignal): Promise<LookupOutcome> {
  const sessionToken = crypto.randomUUID();
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY },
    body: JSON.stringify({
      input: [house, postcode].filter(Boolean).join(" "),
      includedRegionCodes: [cc.toLowerCase()],
      regionCode: cc.toLowerCase(),
      languageCode: "en-GB",
      sessionToken,
    }),
  });
  if (!res.ok) throw new Error(`places autocomplete ${res.status}`);
  const data = (await res.json()) as { suggestions?: GooglePrediction[] };
  const suggestions: AddressSuggestion[] = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<GooglePrediction["placePrediction"]> => Boolean(p && p.placeId))
    .map((p) => ({
      id: `g-${p.placeId}`,
      label: p.structuredFormat?.mainText?.text || p.text?.text || "",
      detail: p.structuredFormat?.secondaryText?.text,
      kind: (p.types || []).some((t) => t === "street_address" || t === "premise" || t === "subpremise") ? ("address" as const) : ("place" as const),
      resolve: () => googleDetails(p.placeId, sessionToken, postcode),
    }))
    .filter((s) => s.label);
  if (suggestions.length === 0) return { status: "none", postcode };
  return { status: "ok", suggestions, postcode, streetsOnly: false };
}

async function googleDetails(placeId: string, sessionToken: string, typedPostcode: string): Promise<AddressFill | null> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en-GB`, {
      headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "addressComponents" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { addressComponents?: GoogleComponent[] };
    const comps = data.addressComponents || [];
    const get = (...types: string[]) => {
      for (const t of types) {
        const c = comps.find((x) => (x.types || []).includes(t));
        if (c?.longText) return c.longText;
      }
      return "";
    };
    const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
    const premise = get("premise");
    const sub = get("subpremise");
    const line1 = street || premise;
    const line2 = [sub, street ? premise : ""].filter(Boolean).join(", ") || get("sublocality_level_1", "neighborhood");
    return {
      line1,
      line2,
      town: get("postal_town", "locality", "administrative_area_level_2", "administrative_area_level_1"),
      postcode: get("postal_code") || typedPostcode,
    };
  } catch {
    return null;
  }
}

// ── OpenStreetMap: postcodes.io + Photon ─────────────────────────────────

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    locality?: string;
    district?: string;
    county?: string;
    countrycode?: string;
  };
};

async function photon(path: "api" | "reverse", params: Record<string, string>, signal: AbortSignal): Promise<PhotonFeature[]> {
  const res = await fetch(`https://photon.komoot.io/${path}/?${new URLSearchParams(params).toString()}`, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return data.features || [];
}

/** Distance in km between two [lon, lat] points. */
function km(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function osmLookup(cc: string, postcode: string, house: string, signal: AbortSignal): Promise<LookupOutcome> {
  try {
    // 1. Where is the postcode?
    let centre: [number, number] | null = null;
    let fallbackTown = "";
    if (cc === "GB") {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g, ""))}`, { signal });
      if (res.status === 404) return { status: "invalid_postcode" };
      if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
      const data = (await res.json()) as { result?: { postcode?: string; latitude?: number | null; longitude?: number | null; admin_district?: string | null } };
      const r = data.result;
      if (r?.postcode) postcode = r.postcode;
      if (r?.latitude != null && r?.longitude != null) centre = [r.longitude, r.latitude];
      fallbackTown = r?.admin_district || "";
    } else {
      const found = await photon("api", { q: postcode, limit: "10" }, signal);
      const inCountry = found.filter((f) => (f.properties.countrycode || "").toUpperCase() === cc && f.geometry?.coordinates);
      const exact = inCountry.find((f) => f.properties.postcode && tight(f.properties.postcode) === tight(postcode));
      const hit = exact || inCountry[0];
      if (hit?.geometry?.coordinates) centre = hit.geometry.coordinates;
      if (hit) fallbackTown = placeTown(hit) || "";
    }
    if (!centre) return { status: "none", postcode };

    // 2. Houses and streets near it: a search (finds buildings tagged with the
    // postcode) and a reverse lookup around the centre (finds what is close by).
    const radiusKm = cc === "GB" ? 0.6 : 1.5;
    const [lon, lat] = centre;
    const d = cc === "GB" ? 0.012 : 0.03;
    const near = { lat: String(lat), lon: String(lon) };
    const [searched, around] = await Promise.all([
      photon("api", { q: [house, postcode].filter(Boolean).join(" "), limit: "30", ...near, bbox: [lon - d, lat - d, lon + d, lat + d].join(",") }, signal).catch(() => [] as PhotonFeature[]),
      photon("reverse", { ...near, limit: "40", radius: String(radiusKm) }, signal).catch(() => [] as PhotonFeature[]),
    ]);

    const seen = new Set<string>();
    const addresses: (AddressSuggestion & { sort: string; houseMatch: boolean })[] = [];
    const streets: (AddressSuggestion & { dist: number })[] = [];
    const houseLc = house.toLowerCase();
    for (const f of [...searched, ...around]) {
      const p = f.properties;
      const coords = f.geometry?.coordinates;
      if ((p.countrycode || "").toUpperCase() !== cc || !coords) continue;
      const dist = km(centre, coords);
      if (dist > radiusKm * 1.5) continue;
      const town = placeTown(f) || fallbackTown;
      const isStreet = p.osm_key === "highway" || p.type === "street";
      if (p.housenumber && (p.street || p.name)) {
        // A building with its own different postcode is in the next postcode over.
        if (p.postcode && tight(p.postcode) !== tight(postcode)) continue;
        const street = p.street || p.name || "";
        const line1 = `${p.housenumber} ${street}`;
        const line2 = p.name && p.street && p.name !== p.street ? p.name : "";
        const key = `${line1}|${line2}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const houseMatch = houseLc !== "" && (p.housenumber.toLowerCase() === houseLc || (p.name || "").toLowerCase().includes(houseLc));
        addresses.push({
          id: `a-${key}`,
          label: [line2, line1].filter(Boolean).join(", "),
          detail: [town, postcode].filter(Boolean).join(", "),
          kind: "address",
          fill: { line1, line2, town, postcode },
          sort: `${street.toLowerCase()}|${p.housenumber.padStart(6, "0")}`,
          houseMatch,
        });
      } else if (isStreet && p.name) {
        const key = `street|${p.name}|${town}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const line1 = house ? `${house} ${p.name}` : p.name;
        streets.push({
          id: `s-${key}`,
          label: line1,
          detail: house ? [town, postcode].filter(Boolean).join(", ") : `${[town, postcode].filter(Boolean).join(", ")}. Add your house number after choosing.`,
          kind: "street",
          fill: { line1, line2: "", town, postcode },
          dist,
        });
      }
    }

    // With a house number typed, keep only the matching houses if there are any.
    const matching = addresses.filter((a) => a.houseMatch);
    const houses = (matching.length > 0 ? matching : addresses).sort((a, b) => a.sort.localeCompare(b.sort, "en", { numeric: true }));
    streets.sort((a, b) => a.dist - b.dist);
    const list: AddressSuggestion[] = [...houses, ...streets].slice(0, MAX_SUGGESTIONS).map((s) => ({ id: s.id, label: s.label, detail: s.detail, kind: s.kind, fill: s.fill }));
    if (list.length === 0) return { status: "none", postcode };
    return { status: "ok", suggestions: list, postcode, streetsOnly: houses.length === 0 };
  } catch (e) {
    if (signal.aborted) throw e;
    return { status: "error" };
  }
}

function placeTown(f: PhotonFeature): string {
  const p = f.properties;
  return p.city || p.town || p.village || p.locality || p.district || p.county || "";
}
