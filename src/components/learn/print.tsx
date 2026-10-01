import { PRINT_AREA } from "@/components/learn/reports/printArea";

/**
 * Shared A4 print stylesheet for the Summary page and report documents.
 * Hides portal chrome (sidebar, header, banners, dialogs, controls), sets
 * page margins, keeps tiles/rows together, repeats table headers and keeps
 * colours. Page numbers use @page margin boxes (Chrome/Edge 131+, Firefox
 * ignores them harmlessly, Safari too); everything else works everywhere.
 */
export const PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 14mm 12mm 16mm;
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9pt sans-serif; color: #666; }
  @bottom-left { content: "Tarbiyyah Global Academy"; font: 9pt sans-serif; color: #666; }
}
@media print {
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  .portal > aside, .portal > div > header, .portal [role="dialog"], .portal .fixed, .no-print { display: none !important; }
  .portal main > div > [role="status"] { display: none !important; }
  .portal, .portal > div { display: block !important; padding-left: 0 !important; min-height: 0 !important; }
  .portal main > div { max-width: none !important; padding: 0 !important; }
  .app-pad { padding: 0 !important; }
  .portal nav[aria-label="Breadcrumb"] { display: none !important; }

  .print-card, .print-avoid, tr, li { break-inside: avoid; page-break-inside: avoid; }
  .print-tiles { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 6px !important; margin-bottom: 14px !important; }
  .print-tiles > * { min-width: 0; break-inside: avoid; }
  .print-tiles [class*="p-5"] { padding: 8px 10px !important; }
  .print-tiles .text-3xl { font-size: 16pt !important; line-height: 1.2 !important; }
  .print-scroll { overflow: visible !important; border-radius: 0 !important; }
  .print-scroll table { min-width: 0 !important; width: 100% !important; font-size: 9pt; border-collapse: collapse; }
  .print-scroll th, .print-scroll td { padding: 4px 6px !important; }
  .print-scroll th [aria-hidden="true"] { display: none !important; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  h1, h2, h3 { break-after: avoid; }

  /* A single report: print only the report area, but keep it flowing over several pages. */
  .portal main:has(.${PRINT_AREA}) *:not(.${PRINT_AREA}):not(:has(.${PRINT_AREA})):not(.${PRINT_AREA} *) { display: none !important; }
  .${PRINT_AREA} { border: none !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; width: 100% !important; }
  .${PRINT_AREA} .grid { break-inside: avoid; }
}
`;

/** Renders the print stylesheet once on the page. */
export function PrintSheet() {
  return <style>{PRINT_CSS}</style>;
}

/** Clean letterhead shown only when printing. */
export function PrintHeader({ title, period, generatedBy }: { title: string; period?: string; generatedBy?: string | null }) {
  const now = new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mb-4 hidden border-b-2 border-black/70 pb-2 print:block">
      <p className="text-[10pt] font-semibold uppercase tracking-wider">Tarbiyyah Global Academy</p>
      <p className="font-serif text-[18pt] font-semibold leading-tight">{title}</p>
      <p className="mt-1 text-[9pt] text-black/70">
        {period ? `Period: ${period} · ` : ""}Generated {now}
        {generatedBy ? ` by ${generatedBy}` : ""}
      </p>
    </div>
  );
}
