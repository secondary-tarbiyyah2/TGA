"use client";

// Portal demo only: stands in for "next/navigation" (the demo build aliases it here),
// so useRouter, usePathname and useSearchParams follow the #hash router in ./router.
export * from "next/dist/client/components/navigation";
import { useMemo } from "react";
import { navigate, useDemoLocation } from "@/lib/demo/router";

export function usePathname(): string {
  return useDemoLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useDemoLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T = Record<string, string>>(): T {
  return {} as T;
}

const router = {
  push: (href: string, opts?: { scroll?: boolean }) => navigate(href, { scroll: opts?.scroll }),
  replace: (href: string, opts?: { scroll?: boolean }) => navigate(href, { replace: true, scroll: opts?.scroll }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => window.dispatchEvent(new Event("demo:refresh")),
  prefetch: () => {},
};

export function useRouter() {
  return router;
}

export function redirect(href: string): never {
  navigate(href, { replace: true });
  throw new Error("redirect");
}
