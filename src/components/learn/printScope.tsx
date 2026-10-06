"use client";

import { useCallback, useRef } from "react";
import { PRINT_CSS, PrintHeader } from "@/components/learn/print";

/**
 * Print scoping. Pressing "Print / Save as PDF" must output ONLY the thing
 * the button is about (a timetable, a record), never the whole page with the
 * sidebar, side panel, calendar and other widgets.
 *
 * How it works: wrap the printable element in <PrintScope> (or attach the ref
 * from usePrintArea()). printElement() marks it `data-print-active` and gives
 * <body> the `print-scoped` class; PRINT_CSS then hides every element that is
 * neither the target, an ancestor of it, nor inside it. Both marks are removed
 * on `afterprint`, so normal browsing is untouched.
 */

const STYLE_ID = "tga-print-css";
const BODY_CLASS = "print-scoped";
const ACTIVE_ATTR = "data-print-active";
const SCOPE_ATTR = "data-print-scope";

function ensurePrintStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);
}

/** Print just `el` (or the whole page, chrome hidden, when null). */
export function printElement(el: Element | null): void {
  if (typeof window === "undefined") return;
  ensurePrintStyles();
  if (!el) {
    window.print();
    return;
  }
  const cleanup = () => {
    document.body.classList.remove(BODY_CLASS);
    el.removeAttribute(ACTIVE_ATTR);
    window.removeEventListener("afterprint", cleanup);
  };
  el.setAttribute(ACTIVE_ATTR, "");
  document.body.classList.add(BODY_CLASS);
  window.addEventListener("afterprint", cleanup);
  try {
    window.print();
  } finally {
    // print() blocks until the dialog closes in most browsers; where it does
    // not, afterprint (or this fallback) restores the page.
    window.setTimeout(cleanup, 2000);
  }
}

/** The printable scope a button refers to: an ancestor scope, else the nearest scope below an ancestor. */
export function findPrintScope(from: Element | null, id?: string): Element | null {
  if (typeof document === "undefined") return null;
  if (id) return document.querySelector(`[${SCOPE_ATTR}="${id}"]`);
  let node: Element | null = from ? from.parentElement : null;
  while (node) {
    if (node.hasAttribute(SCOPE_ATTR)) return node;
    const inner = node.querySelector(`[${SCOPE_ATTR}]`);
    if (inner) return inner;
    node = node.parentElement;
  }
  return null;
}

/** Hook form: attach `ref` to the element to print and call `print()`. */
export function usePrintArea<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const print = useCallback(() => printElement(ref.current), []);
  return { ref, print };
}

/**
 * Marks its children as the printable area. Shows a letterhead (school name +
 * title) only on paper. A PrintButton placed anywhere in the same card, or
 * given `scope="<id>"`, prints just this.
 */
export function PrintScope({ id, title, period, className, children }: { id?: string; title: string; period?: string; className?: string; children: React.ReactNode }) {
  return (
    <div data-print-scope={id || ""} className={className}>
      <PrintHeader title={title} period={period} />
      {children}
    </div>
  );
}
