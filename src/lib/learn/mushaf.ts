// The digital mushaf used to hear a recitation in a Qur'an class (owner, 11 Nov 2026: "include this
// quran system as part of classroom but better"). The text is the King Fahd Complex's Uthmanic Hafs v18
// data in public/mushaf (one file per 20 pages, fetched when first needed); page breaks follow the
// 604-page Madinah mushaf (mushafPages.ts, generated). See docs/mushaf.md.

import { PAGE_START } from "./mushafPages.ts";
import { surahAyat } from "./surahs.ts";

export const PAGE_COUNT = 604;

/** Sort key for an ayah: surah * 1000 + ayah. */
const key = (surah: number, ayah: number) => surah * 1000 + ayah;

/** The mushaf page an ayah is on. */
export function pageOf(surah: number, ayah: number): number {
  const k = key(surah, ayah);
  let lo = 0;
  let hi = PAGE_START.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = PAGE_START[mid];
    if (key(s, a) <= k) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** The first and last ayah on a page. */
export function pageRange(page: number): { from: [number, number]; to: [number, number] } {
  const p = Math.max(1, Math.min(PAGE_COUNT, Math.floor(page)));
  const from = PAGE_START[p - 1] as [number, number];
  if (p === PAGE_COUNT) return { from, to: [114, 6] };
  const [ns, na] = PAGE_START[p];
  const to: [number, number] = na > 1 ? [ns, na - 1] : [ns - 1, surahAyat(ns - 1)];
  return { from, to };
}

/** How many ayat are on a page (all surahs on it). */
export function ayatOnPage(page: number): number {
  const { from, to } = pageRange(page);
  let n = 0;
  for (let s = from[0]; s <= to[0]; s++) {
    const a = s === from[0] ? from[1] : 1;
    const b = s === to[0] ? to[1] : surahAyat(s);
    n += Math.max(0, b - a + 1);
  }
  return n;
}

/**
 * How many pages a set of ayat fills: each ayah counts as its share of its own page, so three ayat of a
 * ten-ayah page are 0.3 of a page. Ayat are given as [surah, ayah].
 */
export function pagesForAyat(ayat: ReadonlyArray<readonly [number, number]>): number {
  const perPage = new Map<number, number>();
  let total = 0;
  for (const [s, a] of ayat) {
    const p = pageOf(s, a);
    let n = perPage.get(p);
    if (n === undefined) {
      n = ayatOnPage(p);
      perPage.set(p, n);
    }
    total += n > 0 ? 1 / n : 0;
  }
  return Math.round(total * 100) / 100;
}

/** Every ayah of a surah range, as [surah, ayah]. */
export function ayatOfPortion(surah: number, from?: number | null, to?: number | null): [number, number][] {
  const total = surahAyat(surah);
  if (!total) return [];
  const a = Math.max(1, Math.min(from ?? 1, total));
  const b = Math.max(a, Math.min(to ?? total, total));
  return Array.from({ length: b - a + 1 }, (_, i) => [surah, a + i] as [number, number]);
}

/** Every ayah on a range of pages, as [surah, ayah]. */
export function ayatOfPages(fromPage: number, toPage: number): [number, number][] {
  const a = pageRange(Math.min(fromPage, toPage)).from;
  const b = pageRange(Math.max(fromPage, toPage)).to;
  const out: [number, number][] = [];
  for (let s = a[0]; s <= b[0]; s++) {
    const x = s === a[0] ? a[1] : 1;
    const y = s === b[0] ? b[1] : surahAyat(s);
    for (let n = x; n <= y; n++) out.push([s, n]);
  }
  return out;
}

/** The file holding a page: p001-020.json … p601-604.json. */
export function chunkFile(page: number): string {
  const start = Math.floor((page - 1) / 20) * 20 + 1;
  const end = Math.min(start + 19, PAGE_COUNT);
  const pad = (n: number) => String(n).padStart(3, "0");
  return `/mushaf/p${pad(start)}-${pad(end)}.json`;
}

/** Words of an ayah as shown in the mushaf (split on spaces; the text has none inside words). */
export const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

export type MushafAyah = { surah: number; ayah: number; page: number; words: string[] };

const cache = new Map<string, Promise<Record<string, [number, number, string][]>>>();

function loadChunk(file: string) {
  let p = cache.get(file);
  if (!p) {
    p = fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(`mushaf ${file}: ${r.status}`);
        return r.json() as Promise<{ pages: Record<string, [number, number, string][]> }>;
      })
      .then((j) => j.pages)
      .catch((e) => {
        cache.delete(file);
        throw e;
      });
    cache.set(file, p);
  }
  return p;
}

/** The text of the given ayat, in mushaf order, loading only the files needed. */
export async function loadAyat(ayat: ReadonlyArray<readonly [number, number]>): Promise<MushafAyah[]> {
  if (ayat.length === 0) return [];
  const wanted = new Set(ayat.map(([s, a]) => key(s, a)));
  const pages = [...new Set(ayat.map(([s, a]) => pageOf(s, a)))].sort((x, y) => x - y);
  const files = [...new Set(pages.map(chunkFile))];
  const chunks = await Promise.all(files.map(loadChunk));
  const out: MushafAyah[] = [];
  for (const p of pages) {
    const rows = chunks.map((c) => c[String(p)]).find(Boolean) || [];
    for (const [s, a, text] of rows) if (wanted.has(key(s, a))) out.push({ surah: s, ayah: a, page: p, words: wordsOf(text) });
  }
  return out;
}
