"use client";
/* eslint-disable react-hooks/static-components -- each route's page and layouts are React.lazy components made once and cached (lazyOf), not new components per render */

// Portal demo only: the whole portal as one page. Reads the #hash route, loads
// that page's real component (and its real layouts) from the route table the
// demo build writes, and shows the Demo bar. The sign-in page offers the five
// roles instead of a password.

import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { navigate, setKnownPaths, useDemoLocation } from "@/lib/demo/router";
import { getRole, setRole } from "@/lib/demo/store";
import { ROLE_LABEL, ROLE_ORDER, type DemoRole } from "@/lib/demo/seed";
import { installDemoNetwork } from "@/lib/demo/client";
import { DemoBar } from "@/lib/demo/DemoBar";

export type DemoRoute = { path: string; page: () => Promise<{ default: ComponentType<Record<string, unknown>> }>; layouts: (() => Promise<{ default: ComponentType<{ children: ReactNode }> }>)[] };

const HOME: Record<DemoRole, string> = { head_teacher: "/admin/dashboard", admin: "/admin/dashboard", teacher: "/teach/dashboard", parent: "/family/dashboard", student: "/student/dashboard" };
const WHO: Record<DemoRole, string> = {
  head_teacher: "Amina Rahman: every part of the school, approvals and safeguarding.",
  teacher: "Yusuf Ali, English: today's lessons, registers, classwork and marking.",
  admin: "Sarah Begum, school office: pupils, admissions, absences and fees.",
  parent: "Khadijah Malik, mother of Aisha (Year 8) and Zayd (Year 7).",
  student: "Aisha Malik, Year 8: lessons, homework and progress.",
};

const lazyCache = new Map<unknown, ComponentType<Record<string, unknown>>>();
function lazyOf(loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) {
  let c = lazyCache.get(loader);
  if (!c) {
    c = lazy(loader);
    lazyCache.set(loader, c);
  }
  return c;
}

class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) {
    console.error("[demo] page error", error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="mx-auto max-w-xl p-8 text-center">
          <p className="t-section">This page could not be shown in the demo.</p>
          <p className="t-meta mt-1">{this.state.error.message}</p>
        </div>
      );
    return this.props.children;
  }
}

function Fallback() {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center">
      <div className="portal-progress w-28" aria-hidden="true" />
    </div>
  );
}

export function DemoSignIn() {
  useEffect(() => {
    if (getRole()) setRole(null);
  }, []);
  const choose = (r: DemoRole) => {
    setRole(r);
    navigate(HOME[r], { replace: true });
    window.location.reload();
  };
  return (
    <div className="portal flex min-h-screen flex-col bg-[var(--portal-canvas)]">
      <header className="border-b border-gold-light bg-white">
        <div className="mx-auto flex h-[60px] max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- static demo, relative path */}
          <img src="./brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={124} height={37} className="h-[37px] w-[124px] object-contain" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:py-16">
        <p className="t-eyebrow">Portal demo</p>
        <h1 className="t-title mt-1">Sign in as</h1>
        <p className="t-meta mt-1">A made-up school with made-up people. Nothing you do here is sent anywhere; changes last until you reset the demo or close the tab.</p>
        <ul className="mt-6 space-y-2.5">
          {ROLE_ORDER.map((r) => (
            <li key={r}>
              <button type="button" onClick={() => choose(r)} className="w-full rounded-xl border border-gold-light bg-white px-4 py-3.5 text-left transition-colors hover:border-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700">
                <span className="block text-[0.9375rem] font-semibold text-ink">{ROLE_LABEL[r]}</span>
                <span className="t-meta mt-0.5 block">{WHO[r]}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

export function DemoApp({ routes }: { routes: DemoRoute[] }) {
  useMemo(() => {
    installDemoNetwork();
    setKnownPaths(routes.map((r) => r.path));
  }, [routes]);
  const loc = useDemoLocation();
  // The exported HTML is the same for everyone; the page is chosen after it loads.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- render the chosen page only in the browser
    setMounted(true);
  }, []);
  const role = mounted ? getRole() : null;
  const byPath = useMemo(() => new Map(routes.map((r) => [r.path, r])), [routes]);

  useEffect(() => {
    document.title = "TGA Portal (demo)";
  }, [loc.key]);

  const signInPath = loc.pathname === "/login" || loc.pathname.startsWith("/login/");
  useEffect(() => {
    if (role && loc.pathname === "/") navigate(HOME[role], { replace: true });
  }, [role, loc.pathname]);

  if (!mounted) return <Fallback />;
  if (!role || signInPath) return <DemoSignIn />;
  if (loc.pathname === "/") return <Fallback />;

  const route = byPath.get(loc.pathname);
  let content: ReactNode;
  if (!route) {
    content = (
      <div className="mx-auto max-w-xl p-8 text-center">
        <p className="t-section">That page isn&apos;t in the portal.</p>
        <button type="button" className="mt-3 text-sm font-medium text-forest-700 underline" onClick={() => navigate(HOME[role])}>
          Back to Today
        </button>
      </div>
    );
    return (
      <>
        <div className="portal min-h-screen">{content}</div>
        <DemoBar role={role} />
      </>
    );
  }
  const Page = lazyOf(route.page);
  let tree: ReactNode = (
    <PageBoundary resetKey={loc.pathname}>
      <Suspense fallback={<Fallback />}>
        <Page key={loc.pathname} params={Promise.resolve({})} searchParams={Promise.resolve(Object.fromEntries(new URLSearchParams(loc.search)))} />
      </Suspense>
    </PageBoundary>
  );
  for (let i = route.layouts.length - 1; i >= 0; i--) {
    const Layout = lazyOf(route.layouts[i] as never) as unknown as ComponentType<{ children: ReactNode }>;
    tree = (
      <Suspense fallback={<Fallback />}>
        <Layout>{tree}</Layout>
      </Suspense>
    );
  }
  return (
    <>
      {tree}
      <DemoBar role={role} />
    </>
  );
}
