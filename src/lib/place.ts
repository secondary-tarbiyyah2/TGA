/**
 * "Where are you joining from?": the visitor's country and, for countries
 * with more than one time zone, which part of it. Country first, because
 * that is how families think ("Pakistan", "Canada"), not "Asia/Karachi".
 *
 * The choice is remembered in this browser and shared by every page that
 * shows times (booking a call, "Is it right for us?", the school-day
 * converter), so a family picks it once. Until they pick, we start from the
 * time zone their device reports and say so.
 */
import { COUNTRY_ZONES, TZ_COUNTRY, type CountryEntry, type CountryZone } from "@/lib/countryZones.generated";
import { detectTimeZone, isValidTimeZone, saveTimeZone, savedTimeZone, UK_TIME_ZONE, zoneCity } from "@/lib/timezones";

export type { CountryEntry, CountryZone };

const PLACE_KEY = "tga-place";

export type Place = {
  /** ISO country code, e.g. "AE"; null when we could not tell. */
  country: string | null;
  tz: string;
  /** "saved": the family chose it; "device": read from their device, not yet confirmed. */
  source: "saved" | "device";
};

const BY_CODE = new Map(COUNTRY_ZONES.map((c) => [c.code, c]));

/** Short names for "… time" wording. */
const SHORT: Record<string, string> = { GB: "UK", AE: "UAE", US: "US", SA: "Saudi", CD: "DR Congo" };

export function countryByCode(code: string | null | undefined): CountryEntry | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

/** The country's zones that this browser can actually use. */
export function zonesFor(c: CountryEntry): CountryZone[] {
  return c.zones.filter((z) => isValidTimeZone(z.tz));
}

/** UTC offsets in mid-January and mid-July, so two zones that always agree count as the same. */
function offsetsKey(tz: string): string {
  const at = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      return "";
    }
  };
  return `${at("2027-01-15T12:00:00Z")}|${at("2027-07-15T12:00:00Z")}`;
}

/** The entry in the country's list for `tz`: the same zone, or one that always shows the same time. */
export function matchZone(c: CountryEntry, tz: string): CountryZone | undefined {
  const zones = zonesFor(c);
  const exact = zones.find((z) => z.tz === tz);
  if (exact) return exact;
  const key = offsetsKey(tz);
  return key !== "|" ? zones.find((z) => offsetsKey(z.tz) === key) : undefined;
}

export function countryForTimeZone(tz: string): string | null {
  return TZ_COUNTRY[tz] ?? null;
}

function readSaved(): { country: string | null; tz: string } | null {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { country?: unknown; tz?: unknown };
    if (!isValidTimeZone(v.tz)) return null;
    const country = typeof v.country === "string" && BY_CODE.has(v.country) ? v.country : null;
    return { country, tz: v.tz };
  } catch {
    return null;
  }
}

/** Remember the family's choice (also under the older time-zone key other pages read). */
export function savePlace(country: string | null, tz: string): void {
  try {
    window.localStorage.setItem(PLACE_KEY, JSON.stringify({ country, tz }));
  } catch {
    // Storage blocked (private window): the page still works, it just won't remember.
  }
  saveTimeZone(tz);
}

/** Saved choice first; otherwise the device's time zone and the country it belongs to. */
export function initialPlace(): Place {
  if (typeof window === "undefined") return { country: "GB", tz: UK_TIME_ZONE, source: "device" };
  const saved = readSaved();
  if (saved) return { ...saved, source: "saved" };
  const oldTz = savedTimeZone();
  if (oldTz) return { country: countryForTimeZone(oldTz), tz: oldTz, source: "saved" };
  const tz = detectTimeZone();
  return { country: countryForTimeZone(tz), tz, source: "device" };
}

/** "UAE", "Pakistan", "Toronto": the word before "time" in "13:00 UAE time". */
export function placeTimeName(tz: string, country?: string | null): string {
  if (tz === UK_TIME_ZONE) return "UK";
  let code = country;
  if (code === undefined && typeof window !== "undefined") {
    const saved = readSaved();
    code = saved && saved.tz === tz ? saved.country : countryForTimeZone(tz);
  }
  const c = countryByCode(code);
  if (c && zonesFor(c).length === 1 && matchZone(c, tz)) return SHORT[c.code] ?? c.name;
  return zoneCity(tz);
}

/** "United Arab Emirates" or "Canada, Eastern (Toronto, Ottawa, Montreal)". */
export function placeLabel(country: string | null, tz: string): string {
  const c = countryByCode(country);
  if (!c) return zoneCity(tz);
  const z = matchZone(c, tz);
  return z?.label && zonesFor(c).length > 1 ? `${c.name}, ${z.label}` : c.name;
}
