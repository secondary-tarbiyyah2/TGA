/**
 * Time zones for the public booking pages (families book from all over the
 * world). The visitor's zone is detected, can be changed from a searchable
 * list (common zones first) and is remembered in this browser.
 * All conversion uses Intl, so daylight saving is handled by the platform.
 */

export const UK_TIME_ZONE = "Europe/London";
const STORAGE_KEY = "tga-booking-timezone";

export type ZoneOption = { tz: string; label: string; keywords?: string };

/** Common zones for our families, in the order shown at the top of the list. */
export const COMMON_TIME_ZONES: ZoneOption[] = [
  { tz: "Europe/London", label: "United Kingdom (London)", keywords: "uk britain england scotland wales gmt bst" },
  { tz: "Asia/Dubai", label: "UAE (Dubai, Abu Dhabi)", keywords: "gulf emirates oman muscat" },
  { tz: "Asia/Riyadh", label: "Saudi Arabia (Riyadh, Makkah, Madinah)", keywords: "gulf ksa jeddah" },
  { tz: "Asia/Qatar", label: "Qatar (Doha)", keywords: "gulf bahrain" },
  { tz: "Asia/Kuwait", label: "Kuwait", keywords: "gulf" },
  { tz: "Asia/Karachi", label: "Pakistan (Karachi, Lahore, Islamabad)", keywords: "pk pkt" },
  { tz: "Asia/Kolkata", label: "India (Delhi, Mumbai)", keywords: "ist calcutta" },
  { tz: "Asia/Dhaka", label: "Bangladesh (Dhaka)" },
  { tz: "Asia/Kuala_Lumpur", label: "Malaysia (Kuala Lumpur)", keywords: "singapore brunei" },
  { tz: "Asia/Singapore", label: "Singapore" },
  { tz: "Asia/Jakarta", label: "Indonesia (Jakarta)" },
  { tz: "Africa/Lagos", label: "Nigeria (Lagos, Abuja)", keywords: "west africa wat" },
  { tz: "Africa/Cairo", label: "Egypt (Cairo)" },
  { tz: "Europe/Istanbul", label: "Turkey (Istanbul)", keywords: "turkiye" },
  { tz: "Africa/Casablanca", label: "Morocco (Casablanca)" },
  { tz: "Africa/Nairobi", label: "Kenya (Nairobi)", keywords: "east africa" },
  { tz: "Africa/Johannesburg", label: "South Africa (Johannesburg, Cape Town)" },
  { tz: "Europe/Dublin", label: "Ireland (Dublin)" },
  { tz: "Europe/Paris", label: "Central Europe (Paris, Berlin, Madrid)", keywords: "france germany spain italy netherlands belgium cet" },
  { tz: "Europe/Athens", label: "Eastern Europe (Athens, Bucharest)", keywords: "greece romania" },
  { tz: "America/New_York", label: "US and Canada Eastern (New York, Toronto)", keywords: "usa est edt" },
  { tz: "America/Chicago", label: "US and Canada Central (Chicago, Winnipeg)", keywords: "usa cst" },
  { tz: "America/Denver", label: "US and Canada Mountain (Denver, Calgary)", keywords: "usa mst" },
  { tz: "America/Los_Angeles", label: "US and Canada Pacific (Los Angeles, Vancouver)", keywords: "usa pst" },
  { tz: "Australia/Perth", label: "Australia Western (Perth)" },
  { tz: "Australia/Sydney", label: "Australia Eastern (Sydney, Melbourne)", keywords: "canberra" },
  { tz: "Pacific/Auckland", label: "New Zealand (Auckland)" },
];

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : UK_TIME_ZONE;
  } catch {
    return UK_TIME_ZONE;
  }
}

/** The zone this visitor chose before, if any (browser storage may be unavailable). */
export function savedTimeZone(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isValidTimeZone(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveTimeZone(tz: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, tz);
  } catch {
    // Not remembered (private window or blocked storage); the page still works.
  }
}

/** Saved choice, else the detected zone. */
export function initialTimeZone(): string {
  return savedTimeZone() ?? detectTimeZone();
}

/** "GMT+4", "GMT-5", "GMT+5:30" for the zone at `at`. */
export function gmtOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
    if (part) return part === "GMT" ? "GMT+0" : part;
  } catch {
    // shortOffset not supported: fall through.
  }
  return "";
}

/** "Ho Chi Minh (Asia)" from "Asia/Ho_Chi_Minh". */
function labelFromId(tz: string): string {
  const parts = tz.split("/");
  const city = (parts[parts.length - 1] || tz).replace(/_/g, " ");
  return parts.length > 1 ? `${city} (${parts.slice(0, -1).join(", ").replace(/_/g, " ")})` : city;
}

export function zoneLabel(tz: string): string {
  return COMMON_TIME_ZONES.find((z) => z.tz === tz)?.label ?? labelFromId(tz);
}

/** "Dubai" from "Asia/Dubai", for short wording such as "14:00 Dubai time". */
export function zoneCity(tz: string): string {
  if (tz === UK_TIME_ZONE) return "UK";
  return (tz.split("/").pop() || tz).replace(/_/g, " ");
}

let allZonesCache: ZoneOption[] | null = null;

/** Every zone the browser knows, common ones excluded (they are listed first). */
export function otherTimeZones(): ZoneOption[] {
  if (allZonesCache) return allZonesCache;
  let ids: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    ids = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  } catch {
    ids = [];
  }
  const common = new Set(COMMON_TIME_ZONES.map((z) => z.tz));
  allZonesCache = ids
    .filter((id) => !common.has(id) && id.includes("/") && !id.startsWith("Etc/"))
    .map((id) => ({ tz: id, label: labelFromId(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return allZonesCache;
}

/** Does `tz` show the same date and time as the UK at this instant? */
export function sameAsUk(tz: string, at: Date): boolean {
  if (tz === UK_TIME_ZONE) return true;
  const f = (zone: string) => at.toLocaleString("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  try {
    return f(tz) === f(UK_TIME_ZONE);
  } catch {
    return true;
  }
}

export function formatTime(at: Date, tz: string): string {
  return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export function formatDay(at: Date, tz: string): string {
  return at.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
}

/**
 * "Monday 2 November 2026 at 14:00 Dubai time (10:00 UK time)", or
 * "Monday 2 November 2026 at 10:00 UK time" when the zone matches the UK.
 */
export function formatWhenWithUk(iso: string, tz: string): string {
  const at = new Date(iso);
  const ukDay = formatDay(at, UK_TIME_ZONE);
  const ukTime = formatTime(at, UK_TIME_ZONE);
  if (!isValidTimeZone(tz) || sameAsUk(tz, at)) return `${ukDay} at ${ukTime} UK time`;
  const day = formatDay(at, tz);
  const ukPart = day === ukDay ? `${ukTime} UK time` : `${ukDay} at ${ukTime} UK time`;
  return `${day} at ${formatTime(at, tz)} ${zoneCity(tz)} time (${ukPart})`;
}
