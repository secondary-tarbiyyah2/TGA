"use client";

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";
import { btn, LoadingState, ui } from "@/components/learn/ui";
import { saveCsv, toCsv, type CsvCell } from "@/lib/learn/csv";
import { BulkActionBar, Pagination } from "@/components/learn/templates/parts";

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
  onRowClick,
  bulkActions,
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
  /**
   * Makes the whole row (and the phone card) a click target, e.g. to open a
   * record. Clicks on links, buttons and form controls inside the row keep
   * their own behaviour. Keyboard users need a link or button in the row that
   * does the same (put one in the first column).
   */
  onRowClick?: (row: T) => void;
  /**
   * Turns on a tick box per row and, while any are ticked, a bar above the list with these
   * actions (Directory template). Called with the ticked rows and a function that clears them.
   */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort || null);
  const [size, setSize] = useState<number>(initialPageSize);
  const [page, setPage] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());

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

  const tickedRows = bulkActions ? (rows || []).filter((r) => ticked.has(rowKey(r))) : [];
  const clearTicks = () => setTicked(new Set());
  const toggleTick = (k: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const pageKeys = pageRows.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => ticked.has(k));
  const tickPage = () =>
    setTicked((cur) => {
      const next = new Set(cur);
      for (const k of pageKeys) {
        if (allOnPage) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  const tickBox = (r: T) => (
    <input type="checkbox" checked={ticked.has(rowKey(r))} onChange={() => toggleTick(rowKey(r))} aria-label="Tick this row" className="h-4 w-4 accent-[var(--color-forest-700)]" />
  );

  const toggleSort = (key: string) => {
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(0);
  };

  const downloadCsv = () => {
    const cols = columns.filter((c) => c.csv);
    saveCsv(csvName || "export", toCsv(cols.map((c) => c.header), shown.map((r) => cols.map((c) => c.csv!(r)))));
  };

  const rowClick = (r: T) =>
    onRowClick
      ? (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label, summary, details, [role=button], [role=combobox]")) return;
          if (window.getSelection()?.toString()) return; // selecting text, not opening
          onRowClick(r);
        }
      : undefined;
  const clickCls = onRowClick ? "cursor-pointer" : "";

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

      {bulkActions && (
        <BulkActionBar count={tickedRows.length} onClear={clearTicks}>
          {bulkActions(tickedRows, clearTicks)}
        </BulkActionBar>
      )}

      {rows === null ? (
        <LoadingState label={`Loading ${caption.toLowerCase()}`} />
      ) : shown.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--portal-control-line)] bg-white px-4 py-6 text-sm text-ink-500 sm:px-5">
          <span className="portal-tile tile-gold shrink-0" aria-hidden="true">
            <Icon name={rows.length === 0 ? "inbox" : "search"} size="sm" />
          </span>
          <p className="min-w-0">{rows.length === 0 ? empty : emptyFiltered}</p>
        </div>
      ) : (
        <>
          {/* Tablet and desktop: a real table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-gold-light bg-white sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-sm">
                <tr className="border-b border-[var(--portal-line)]">
                  {bulkActions && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <input type="checkbox" checked={allOnPage} onChange={tickPage} aria-label="Tick every row on this page" className="h-4 w-4 accent-[var(--color-forest-700)]" />
                    </th>
                  )}
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : c.sort ? "none" : undefined}
                        className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500 ${alignCls(c.align)}`}
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
                  <tr key={rowKey(r)} onClick={rowClick(r)} className={`border-t border-[var(--portal-line-soft)] align-top hover:bg-[var(--portal-row-hover)] ${clickCls} ${rowClassName?.(r) || ""}`}>
                    {bulkActions && <td className="w-10 px-4 py-2.5">{tickBox(r)}</td>}
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-ink ${alignCls(c.align)} ${c.align === "right" ? "tabular-nums" : ""} ${c.className || ""}`}>
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
                <li key={rowKey(r)} onClick={rowClick(r)} className={`rounded-2xl border border-gold-light bg-white p-4 ${clickCls} ${rowClassName?.(r) || ""}`}>
                  <div className="flex items-start gap-3 font-medium text-ink">
                    {bulkActions && <span className="pt-0.5">{tickBox(r)}</span>}
                    <div className="min-w-0 flex-1">{first.cell(r)}</div>
                  </div>
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

          <Pagination
            page={current}
            size={size}
            total={shown.length}
            filteredFrom={rows.length}
            onPage={setPage}
            onSize={(n) => {
              setSize(n);
              setPage(0);
            }}
          />
        </>
      )}
    </div>
  );
}
