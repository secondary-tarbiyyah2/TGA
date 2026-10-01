// Hijri (Islamic) calendar helpers for /learn. Umm al-Qura is computed by the
// browser's Intl (no data to download); if the browser lacks it we fall back
// to the tabular "islamic-civil" calendar.

export type HijriDate = { year: number; month: number; day: number };

const MONTH_NAMES = [
  "Muharram",
  "Safar",
  "Rabiʻ al-Awwal",
  "Rabiʻ al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Shaʻban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qaʻdah",
  "Dhu al-Hijjah",
];

export function hijriMonthName(month: number): string {
  return MONTH_NAMES[(((month - 1) % 12) + 12) % 12];
}

function makeFormatter(calendar: string): Intl.DateTimeFormat | null {
  try {
    const f = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, { day: "numeric", month: "numeric", year: "numeric" });
    return f.resolvedOptions().calendar === calendar ? f : null;
  } catch {
    return null;
  }
}

let cached: { fmt: Intl.DateTimeFormat; umalqura: boolean } | null | undefined;

function engine(): { fmt: Intl.DateTimeFormat; umalqura: boolean } | null {
  if (cached === undefined) {
    const uq = makeFormatter("islamic-umalqura");
    if (uq) cached = { fmt: uq, umalqura: true };
    else {
      const civil = makeFormatter("islamic-civil");
      cached = civil ? { fmt: civil, umalqura: false } : null;
    }
  }
  return cached;
}

/** True when the browser really computes Umm al-Qura (false = civil fallback). */
export function isUmmAlQura(): boolean {
  return engine()?.umalqura ?? false;
}

/** Re-detect the calendar support (used by "Sync Islamic dates"). */
export function resetHijriEngine(): void {
  cached = undefined;
}

/** Noon-local date, immune to DST edges. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

export function toHijri(date: Date): HijriDate {
  const e = engine();
  if (!e) return { year: 1, month: 1, day: 1 };
  const parts = e.fmt.formatToParts(date);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function todayHijri(): HijriDate {
  return toHijri(new Date());
}

/** Gregorian date (local noon) of the 1st of the given Hijri month. */
export function hijriMonthStart(year: number, month: number): Date {
  const target = year * 12 + (month - 1);
  const approx = Date.UTC(622, 6, 16) + ((year - 1) * 354.367 + (month - 1) * 29.5306) * 86400000;
  const a = new Date(approx);
  let d = new Date(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate(), 12);
  if (a.getUTCFullYear() < 100) d.setFullYear(a.getUTCFullYear());
  for (let i = 0; i < 200; i++) {
    const h = toHijri(d);
    const cur = h.year * 12 + (h.month - 1);
    if (cur === target) return addDays(d, -(h.day - 1));
    const dm = target - cur;
    const step = Math.abs(dm) <= 1 ? 10 : Math.floor(Math.abs(dm) * 29);
    d = addDays(d, dm > 0 ? step : -step);
  }
  return d;
}

/** 29 or 30. */
export function hijriMonthLength(year: number, month: number): number {
  const start = hijriMonthStart(year, month);
  return toHijri(addDays(start, 29)).day === 1 ? 29 : 30;
}

/** Month shifted by n (handles year wrap). */
export function shiftHijriMonth(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 };
}

export function formatHijri(h: HijriDate, withYear = true): string {
  return `${h.day} ${hijriMonthName(h.month)}${withYear ? ` ${h.year} AH` : ""}`;
}
