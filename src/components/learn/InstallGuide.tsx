"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/learn/Icon";
import { useInstallApp } from "@/components/learn/InstallApp";

const DEVICES: { key: string; label: string; icon: IconName; steps: string[] }[] = [
  {
    key: "android",
    label: "Android phone or tablet",
    icon: "monitor",
    steps: [
      "Open learn.tarbiyyah.co.uk in Chrome.",
      "Tap Install when the banner appears, or tap the ⋮ menu (top right) and choose Install app (on some phones: Add to Home screen).",
      "Tap Install. The TGA Portal icon appears on your home screen and in your app list.",
    ],
  },
  {
    key: "ios",
    label: "iPhone or iPad",
    icon: "monitor",
    steps: [
      "Open learn.tarbiyyah.co.uk in Safari (on iOS 16.4 or later, Chrome and Edge work too).",
      "Tap the Share button (the square with an arrow pointing up).",
      "Scroll down and tap Add to Home Screen, then Add.",
      "Open TGA Portal from your home screen. It opens full-screen, without the browser bars.",
    ],
  },
  {
    key: "windows",
    label: "Windows or Chromebook (Chrome or Edge)",
    icon: "monitor",
    steps: [
      "Open learn.tarbiyyah.co.uk in Chrome or Microsoft Edge.",
      "Click the install icon at the right of the address bar (a small screen with a down arrow), or the button on this page.",
      "Chrome: ⋮ menu → Cast, save and share → Install page as app. Edge: … menu → Apps → Install this site as an app.",
      "The portal opens in its own window and is added to the Start menu; right-click its taskbar icon and choose Pin to taskbar.",
    ],
  },
  {
    key: "mac",
    label: "Mac",
    icon: "monitor",
    steps: [
      "In Safari (macOS Sonoma or later): File → Add to Dock.",
      "In Chrome or Edge: click the install icon in the address bar, or use the button on this page.",
      "The portal appears in your Dock and Launchpad like any other app.",
    ],
  },
];

export function InstallGuide() {
  const { standalone, canPrompt, ios, install } = useInstallApp();
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(ios ? "ios" : null);

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static icon from /public */}
        <img src="/app-icon-192.png" alt="" width={64} height={64} className="h-16 w-16 rounded-2xl shadow-sm" />
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-ink">Install the TGA Portal</h1>
          <p className="text-sm text-ink/65">Its own icon on your phone, tablet or computer, opening straight into the portal. Free, and no app store needed.</p>
        </div>
      </div>

      {standalone ? (
        <p className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">You&apos;re already using the installed app.</p>
      ) : canPrompt ? (
        <div className="mt-6 rounded-2xl border border-gold-light bg-white p-5">
          <p className="text-sm text-ink/75">Your browser can install it straight away.</p>
          <button
            type="button"
            onClick={async () => {
              const r = await install();
              setResult(r === "accepted" ? "Installed. You'll find TGA Portal with your other apps." : r === "dismissed" ? "No problem. You can install it any time from here." : null);
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gold-700 px-5 py-3 text-sm font-semibold text-white hover:bg-gold-900"
          >
            <Icon name="download" className="h-4 w-4" />
            Install TGA Portal
          </button>
          {result && <p className="mt-3 text-sm text-ink/75" role="status">{result}</p>}
        </div>
      ) : null}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink/60">Step by step</h2>
      <ul className="mt-3 space-y-2">
        {DEVICES.map((d) => (
          <li key={d.key} className="rounded-2xl border border-gold-light bg-white">
            <button type="button" aria-expanded={open === d.key} onClick={() => setOpen(open === d.key ? null : d.key)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
              <span className="font-semibold text-ink">{d.label}</span>
              <Icon name="chevronDown" className={`h-4 w-4 text-ink/60 transition-transform ${open === d.key ? "rotate-180" : ""}`} />
            </button>
            {open === d.key && (
              <ol className="list-decimal space-y-1.5 px-5 pb-5 pl-10 text-sm text-ink/80">
                {d.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-ink/60">
        The app is the same secure portal: you sign in once and stay signed in on that device. Updates arrive automatically; there is nothing to update yourself. To remove it, delete it like any other app.
      </p>
    </div>
  );
}
