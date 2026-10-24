"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/learn/Icon";

/**
 * "Install the app": the portal is a Progressive Web App (public/learn/
 * app.webmanifest + sw.js), so Chrome, Edge and Android offer to install it
 * like an ordinary app, with its own icon and window. iPhone and iPad don't
 * offer a button; there it's Share → Add to Home Screen, explained on /install.
 */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
let registered = false;

function setup() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* not served on this origin (e.g. a preview): installing just isn't offered */
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export type InstallState = { standalone: boolean; canPrompt: boolean; ios: boolean; install: () => Promise<"accepted" | "dismissed" | "unavailable"> };

export function useInstallApp(): InstallState {
  const [, tick] = useState(0);
  const [env, setEnv] = useState({ standalone: false, ios: false });
  useEffect(() => {
    setup();
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the browser environment once after mount
    setEnv({ standalone, ios });
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    ...env,
    canPrompt: !!deferred,
    install: async () => {
      if (!deferred) return "unavailable";
      const ev = deferred;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === "accepted") deferred = null;
      return outcome;
    },
  };
}

/** Registers the service worker; render once in the portal shell. */
export function InstallAppSetup() {
  useEffect(() => setup(), []);
  return null;
}

/** A quiet row for the sidebar footer, hidden once the portal is running as an installed app. */
export function InstallAppLink({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { standalone, canPrompt, install } = useInstallApp();
  if (standalone) return null;
  const cls = `portal-nav-row ${compact ? "justify-center" : ""}`;
  const inner = (
    <>
      <span className="portal-tile tile-gold" aria-hidden="true">
        <Icon name="download" />
      </span>
      {!compact && <span className="min-w-0 flex-1 truncate">Install the app</span>}
    </>
  );
  return canPrompt ? (
    <button type="button" className={cls} onClick={() => void install()} title="Install the TGA Portal as an app">
      {inner}
    </button>
  ) : (
    <Link href="/install" className={cls} onClick={onNavigate} title="Install the TGA Portal as an app">
      {inner}
    </Link>
  );
}
