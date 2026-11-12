"use client";

// Portal demo only: stands in for "next/link" (the demo build aliases it here).
// Links point at the #hash route, never prefetch, and navigate in place.
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { hashFor, navigate, resolveHref } from "@/lib/demo/router";

type Url = string | { pathname?: string | null; query?: Record<string, string | number | boolean | null | undefined> | string | null; hash?: string | null };
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Url;
  as?: Url;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null | "auto";
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
  onNavigate?: (e: { preventDefault: () => void }) => void;
  unstable_dynamicOnHover?: boolean;
  transitionTypes?: string[];
  children?: ReactNode;
};

export function hrefString(href: Url): string {
  if (typeof href === "string") return href;
  const q = href.query;
  const search = !q ? "" : typeof q === "string" ? q : new URLSearchParams(Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
  return `${href.pathname || ""}${search ? `?${search.replace(/^\?/, "")}` : ""}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
}

const DemoLink = forwardRef<HTMLAnchorElement, Props>(function DemoLink(props, ref) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next-only props, dropped
  const { href, as, replace, scroll, prefetch, shallow, passHref, legacyBehavior, locale, onNavigate, unstable_dynamicOnHover, transitionTypes, onClick, children, target, ...rest } = props;
  const raw = hrefString(as || href);
  const internal = resolveHref(raw);
  const shown = internal === null ? raw : hashFor(internal);
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || internal === null) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (target && target !== "_self")) return;
    e.preventDefault();
    let stopped = false;
    onNavigate?.({ preventDefault: () => (stopped = true) });
    if (!stopped) navigate(raw, { replace, scroll });
  };
  return (
    <a ref={ref} href={shown} target={target} onClick={click} {...rest}>
      {children}
    </a>
  );
});

export default DemoLink;
export const useLinkStatus = () => ({ pending: false });
