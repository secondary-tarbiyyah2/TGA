"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";
import { btn, ui } from "@/components/learn/ui";
import { saveCsv, toCsv, type CsvCell } from "@/lib/learn/csv";

/**
 * The one way the portal shows a list of records (pupils, registers, staff
 * hours, behaviour, the audit log…), so every list works the same:
 *
 *   - click a column heading to sort by it (again to reverse);
 *   - an optional search box, plus any filters the page passes in;
 *   - "Showing 1–25 of 214", a page-size choice and Previous / Next;
 *   - an optional "Download CSV" of everything that matches (not just the page);
 *   - on phones, each row becomes a small card of "Heading: value" lines,
 *     so nothing scrolls sideways.
 *
 * Columns describe themselves; the page only says what to show.
 */
export type Column<T> = {
  key: string;
  header: string;
  /** What to show in the cell. */
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. Return a number, string or date string. */
  sort?: (row: T) => string | number | null | undefined;
  /** Value for the CSV download; columns without one are left out of it. */
  csv?: (row: T) => CsvCell;
  align?: "left" | "right" | "center";
  /** Extra classes for the cell (e.g. a width). */
  className?: string;
  /** Hide this column on phones (the card view). */
  hideOnPhone?: boolean;
};

const PAGE_SIZES = [25, 50, 100, 0] as const; // 0 = all

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  search,
  filters,
  initialSort,
  csvName,
  empty = "Nothing to show.",
  emptyFiltered = "Nothing matches. Try clearing the search or filters.",
  pageSize: initialPageSize = 25,
  rowClassName,
}: {
  /** null while loading. */
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Read out to screen-reader users as the table's name. */
  caption: string;
  /** Turns on the search box: the text a row is searched by. */
  search?: { text: (row: T) => string; placeholder?: string };
  /** Filters (selects, chips) shown in the toolbar beside the search box. */
  filters?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Turns on "Download CSV" with this file name. */
  csvName?: string;
  empty?: string;
  emptyFiltered?: string;
  pageSize?: number;
  rowClassName?: (row: T) => string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort || null);
  const [size, setSize] = useState<number>(initialPageSize);
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    let list = rows || [];
    const needle = q.trim().toLowerCase();
    if (search && needle) list = list.filter((r) => search.text(r).toLowerCase().includes(needle));
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sort) {
      const get = col.sort;
      const dir = sort!.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x === y) return 0;
        if (x === null || x === undefined || x === "") return 1; // blanks last
        if (y === null || y === undefined || y === "") return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-GB", { numeric: true })) * dir;
      });
    }
    return list;
  }, [rows, q, search, sort, columns]);

  const pages = size ? Math.max(1, Math.ceil(shown.length / size)) : 1;
  const current = Math.min(page, pages - 1); // stays valid when the page's filters shrink the list
  const pageRows = size ? shown.slice(current * size, current * size + size) : shown;
  const from = shown.length ? current * (size || shown.length) + 1 : 0;
  const to = size ? Math.min(shown.length, (current + 1) * size) : shown.length;

  const toggleSort = (key: string) => {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(0);
  };

  const downloadCsv = () => {
    const cols = columns.filter((c) => c.csv);
    saveCsv(csvName || "export", toCsv(cols.map((c) => c.header), shown.map((r) => cols.map((c) => c.csv!(r)))));
  };

  const alignCls = (a?: Column<T>["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const hasToolbar = !!search || !!filters || !!csvName;

  return (
    <div className="space-y-3">
      {hasToolbar && (
        <div className={ui.toolbar}>
          {search && (
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder={search.placeholder || "Search"}
              aria-label={search.placeholder || "Search"}
              className={`${ui.input} !w-auto min-w-[12rem] flex-1`}
            />
          )}
          {filters}
          {csvName && (
            <button type="button" onClick={downloadCsv} disabled={!shown.length} className={`${btn("secondary")} ml-auto`}>
              <Icon name="download" size="sm" />
              Download CSV
            </button>
          )}
        </div>
      )}

      {rows === null ? (
        <div role="status" aria-label="Loading" className="space-y-2 rounded-2xl border border-gold-light bg-white p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 rounded bg-cream motion-safe:animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-gold-light bg-white p-4 text-sm text-ink/70">{rows.length === 0 ? empty : emptyFiltered}</p>
      ) : (
        <>
          {/* Tablet and desktop: a real table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-gold-light bg-white sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-[1] bg-white">
                <tr className="border-b border-gold-light">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : c.sort ? "none" : undefined}
                        className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/70 ${alignCls(c.align)}`}
                      >
                        {c.sort ? (
                          <button type="button" onClick={() => toggleSort(c.key)} className={`-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-wide hover:text-teal-700 ${active ? "text-teal-700" : ""}`}>
                            {c.header}
                            <Icon name={active ? (sort!.dir === "asc" ? "chevronUp" : "chevronDown") : "chevronDown"} className={`h-3.5 w-3.5 ${active ? "" : "opacity-35"}`} strokeWidth={2.25} />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={rowKey(r)} className={`border-t border-gold-light/50 align-top hover:bg-cream/60 ${rowClassName?.(r) || ""}`}>
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-ink ${alignCls(c.align)} ${c.className || ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per row, the first column as its title. */}
          <ul className="space-y-2 sm:hidden" aria-label={caption}>
            {pageRows.map((r) => {
              const [first, ...rest] = columns.filter((c) => !c.hideOnPhone);
              return (
                <li key={rowKey(r)} className={`rounded-2xl border border-gold-light bg-white p-4 ${rowClassName?.(r) || ""}`}>
                  <div className="font-medium text-ink">{first.cell(r)}</div>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    {rest.map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-ink/65">{c.header}</dt>
                        <dd className="min-w-0 text-ink">{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink/75">
            <p aria-live="polite">
              Showing {from}–{to} of {shown.length}
              {rows.length !== shown.length ? ` (filtered from ${rows.length})` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                Per page
                <select
                  value={size}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    setPage(0);
                  }}
                  className={`${ui.select} !w-auto !py-1 pl-2.5 sm:!min-h-8`}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n || "All"}
                    </option>
                  ))}
                </select>
              </label>
              {pages > 1 && (
                <nav aria-label="Pages" className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className={btn("secondary", "sm")}>
                    <Icon name="chevronLeft" size="sm" />
                    Previous
                  </button>
                  <span className="px-1 tabular-nums">
                    {current + 1} / {pages}
                  </span>
                  <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className={btn("secondary", "sm")}>
                    Next
                    <Icon name="chevronRight" size="sm" />
                  </button>
                </nav>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
