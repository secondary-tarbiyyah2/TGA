// International dialling codes for the countries in
// src/components/admissions/countryCodes.ts, keyed by ISO 3166-1 alpha-2 code.
// Used by the phone field (src/components/ui/PhoneInput.tsx). Flags are SVGs
// in public/images/flags/<code>.svg (country-flag-icons, MIT, see LICENSE.txt).

import { COUNTRY_CODES } from "@/components/admissions/countryCodes";

export const DIAL_CODES: Record<string, string> = {
  AD: "376", AE: "971", AF: "93", AL: "355", AM: "374", AO: "244", AR: "54", AT: "43", AU: "61", AZ: "994",
  BA: "387", BB: "1", BD: "880", BE: "32", BF: "226", BG: "359", BH: "973", BI: "257", BJ: "229", BN: "673",
  BO: "591", BR: "55", BS: "1", BT: "975", BW: "267", BY: "375", BZ: "501", CA: "1", CF: "236", CG: "242",
  CH: "41", CL: "56", CM: "237", CN: "86", CO: "57", CR: "506", CU: "53", CV: "238", CY: "357", CZ: "420",
  DE: "49", DJ: "253", DK: "45", DM: "1", DO: "1", DZ: "213", EC: "593", EE: "372", EG: "20", ER: "291",
  ES: "34", ET: "251", FI: "358", FJ: "679", FR: "33", GA: "241", GB: "44", GD: "1", GE: "995", GH: "233",
  GM: "220", GN: "224", GQ: "240", GR: "30", GT: "502", GW: "245", GY: "592", HK: "852", HN: "504", HR: "385",
  HT: "509", HU: "36", ID: "62", IE: "353", IL: "972", IN: "91", IQ: "964", IR: "98", IS: "354", IT: "39",
  JM: "1", JO: "962", JP: "81", KE: "254", KG: "996", KH: "855", KI: "686", KM: "269", KR: "82", KW: "965",
  KZ: "7", LA: "856", LB: "961", LC: "1", LI: "423", LK: "94", LR: "231", LS: "266", LT: "370", LU: "352",
  LV: "371", LY: "218", MA: "212", MC: "377", MD: "373", ME: "382", MG: "261", MK: "389", ML: "223", MM: "95",
  MN: "976", MR: "222", MT: "356", MU: "230", MV: "960", MW: "265", MX: "52", MY: "60", MZ: "258", NA: "264",
  NE: "227", NG: "234", NI: "505", NL: "31", NO: "47", NP: "977", NZ: "64", OM: "968", PA: "507", PE: "51",
  PG: "675", PH: "63", PK: "92", PL: "48", PS: "970", PT: "351", PW: "680", PY: "595", QA: "974", RO: "40",
  RS: "381", RU: "7", RW: "250", SA: "966", SB: "677", SC: "248", SD: "249", SE: "46", SG: "65", SI: "386",
  SK: "421", SL: "232", SM: "378", SN: "221", SO: "252", SR: "597", SS: "211", SV: "503", SY: "963", SZ: "268",
  TD: "235", TG: "228", TH: "66", TJ: "992", TL: "670", TM: "993", TN: "216", TO: "676", TR: "90", TT: "1",
  TV: "688", TW: "886", TZ: "255", UA: "380", UG: "256", US: "1", UY: "598", UZ: "998", VA: "39", VE: "58",
  VN: "84", VU: "678", WS: "685", XK: "383", YE: "967", ZA: "27", ZM: "260", ZW: "263",
};

export type DialCountry = { code: string; name: string; dial: string };

/** Every country, in alphabetical order (owner, Nov 2026). */
export const DIAL_COUNTRIES: DialCountry[] = Object.entries(COUNTRY_CODES)
  .filter(([, code]) => DIAL_CODES[code])
  .map(([name, code]) => ({ code, name, dial: DIAL_CODES[code] }))
  .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

/** NANP codes shared by several countries: prefer this one when reading "+1 ..." back. */
const PREFERRED_FOR_DIAL: Record<string, string> = { "1": "US", "7": "RU", "39": "IT", "44": "GB" };

/**
 * Split a stored phone number ("+44 7700 900123") into its country and the
 * local part. Numbers without a "+" are treated as local to `fallback`.
 */
export function splitPhone(value: string, fallback = "GB"): { code: string; local: string } {
  const v = value.trim();
  const m = /^\+(\d{1,4})\s*(.*)$/.exec(v);
  if (!m) return { code: fallback, local: v };
  const digits = m[1];
  for (let len = Math.min(4, digits.length); len >= 1; len--) {
    const dial = digits.slice(0, len);
    const code =
      (DIAL_CODES[fallback] === dial ? fallback : null) ??
      PREFERRED_FOR_DIAL[dial] ??
      Object.keys(DIAL_CODES).find((c) => DIAL_CODES[c] === dial);
    if (code) return { code, local: `${digits.slice(len)}${m[2] ? (digits.slice(len) ? " " : "") + m[2] : ""}`.trim() };
  }
  return { code: fallback, local: v };
}

/** Join a country and a local number into one international number, dropping a leading 0 from the local part. */
export function joinPhone(code: string, local: string): string {
  const l = local.trim();
  if (!l) return "";
  if (l.startsWith("+")) return l;
  const dial = DIAL_CODES[code] ?? "44";
  return `+${dial} ${l.replace(/^0+(?=\d)/, "")}`;
}
