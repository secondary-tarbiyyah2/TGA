"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "@/lib/learn/push";

const DISMISS_KEY = "tga-push-dismissed";

/**
 * "Turn on notifications" for this device. `variant="card"` sits on a Today
 * page and hides once notifications are on (or the user says not now);
 * `variant="setting"` is a full on/off row for settings and the account menu.
 * Shows nothing where notifications can't work (unsupported browser, or the
 * school hasn't set the keys up yet).
 */
export function PushOptIn({ variant = "card" }: { variant?: "card" | "setting" }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [env, setEnv] = useState({ dismissed: false, ios: false });
  const { dismissed, ios } = env;
  const setDismissed = (v: boolean) => setEnv((e) => ({ ...e, dismissed: v }));

  useEffect(() => {
    pushState().then(setState);
    let d = false;
    let i = false;
    try {
      d = window.localStorage.getItem(DISMISS_KEY) === "1";
      i = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only facts, read once after mount
    setEnv({ dismissed: d, ios: i });
  }, []);

  if (variant === "setting" && state === "not-configured") return <p className="text-sm text-ink/70">Not switched on for the school yet.</p>;
  if (state === null || state === "not-configured") return null;
  if (variant === "card" && (state === "on" || dismissed)) return null;
  if (state === "unsupported" && !ios) return variant === "setting" ? <p className="text-sm text-ink/70">This browser can&apos;t show notifications.</p> : null;

  const turnOn = async () => {
    setBusy(true);
    setNote("");
    const next = await enablePush();
    setState(next);
    setBusy(false);
    if (next === "on") setNote((await sendTestPush()) ? "Done. We sent a test notification to this device." : "Done. Notifications are on for this device.");
    else if (next === "off") setNote("Couldn't turn notifications on just now. Please try again later.");
    else if (next === "denied") setNote("Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.");
  };
  const turnOff = async () => {
    setBusy(true);
    setState(await disablePush());
    setBusy(false);
    setNote("Notifications are off for this device.");
  };

  if (variant === "setting") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Notifications on this device</p>
          <p className="text-xs text-ink/70">{state === "on" ? "On: you'll hear about new messages." : state === "denied" ? "Blocked in your browser settings." : "Off"}</p>
          {note && <p role="status" className="mt-1 text-xs text-ink/80">{note}</p>}
        </div>
        {state === "on" ? (
          <button type="button" onClick={turnOff} disabled={busy} className={`${ui.btnSecondary} ${ui.sm}`}>
            Turn off
          </button>
        ) : (
          <button type="button" onClick={turnOn} disabled={busy || state === "denied" || state === "unsupported"} className={`${ui.btnPrimary} ${ui.sm}`}>
            Turn on
          </button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="push-optin" className="flex flex-wrap items-start gap-3 rounded-2xl border border-gold-light bg-white p-4 print:hidden">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
        <Icon name="bell" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h2 id="push-optin" className="text-sm font-semibold text-ink">
          Get a notification when you have a new message
        </h2>
        {ios && state === "unsupported" ? (
          <p className="mt-0.5 text-sm text-ink/70">
            On iPhone and iPad, first add the portal to your Home Screen (Share, then Add to Home Screen), open it from there, and turn notifications on.{" "}
            <Link href="/install" className="font-medium text-teal-700 underline">How to install</Link>
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-ink/70">On this phone or computer. Only who it&apos;s from is shown, never the message itself.</p>
        )}
        {note && (
          <p role="status" className="mt-1 text-sm text-ink/80">
            {note}
          </p>
        )}
      </div>
      <div className="flex w-full gap-2 pl-[3.25rem] sm:w-auto sm:pl-0">
        {state !== "unsupported" && (
          <button type="button" onClick={turnOn} disabled={busy || state === "denied"} className={`${ui.btnPrimary} ${ui.sm}`}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
          className={`${ui.btnGhost} ${ui.sm}`}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
