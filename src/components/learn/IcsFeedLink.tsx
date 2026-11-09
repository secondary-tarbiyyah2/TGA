"use client";

import { Icon } from "@/components/learn/Icon";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { generateIcsToken, googleSubscribeUrl, hashIcsToken, icsFeedUrl, outlookSubscribeUrl, webcalUrl } from "@/lib/learn/timetable";

type Saved = { userId: string; tokenId: string; url: string };

const STORE_KEY = "learn.ics.feed";

function readSaved(userId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    return v && v.userId === userId && typeof v.tokenId === "string" && typeof v.url === "string" ? (v as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(v: Saved | null) {
  try {
    if (v) window.localStorage.setItem(STORE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked: a new link is made next time */
  }
}

/**
 * One button: "Add to my calendar". The feed link is created the first time
 * it's needed (only its SHA-256 hash is stored server-side, so the link is
 * remembered in this browser and re-made if that memory is gone). Choices:
 * Google, Outlook, Apple/other (webcal), copy link, and "Stop sharing" which
 * revokes every live link for this user.
 */
export function IcsFeedLink() {
  const supabase = getSupabaseClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!supabase) return null;

  // Creates the link on first use; reuses the remembered one while it is still live.
  const ensureLink = async () => {
    setBusy(true);
    setError(null);
    setStopped(false);
    setConfirmStop(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You're signed out. Sign in again to add your calendar.");
        return;
      }
      const saved = readSaved(user.id);
      if (saved) {
        const { data: live } = await supabase.from("ics_tokens").select("id").eq("id", saved.tokenId).is("revoked_at", null).maybeSingle();
        if (live) {
          setUrl(saved.url);
          return;
        }
        writeSaved(null);
      }
      const token = generateIcsToken();
      const feed = icsFeedUrl(token);
      if (!feed) {
        setError("Calendar links aren't available on this site yet. Please tell the school office.");
        return;
      }
      const hash = await hashIcsToken(token);
      const { data: row, error: insErr } = await supabase.from("ics_tokens").insert({ user_id: user.id, token_hash: hash }).select("id").single();
      if (insErr || !row) {
        setError("We couldn't create your calendar link. Check your connection and try again.");
        return;
      }
      writeSaved({ userId: user.id, tokenId: (row as { id: string }).id, url: feed });
      setUrl(feed);
    } catch {
      setError("We couldn't create your calendar link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    setOpen(true);
    setCopied(false);
    setUrl(null);
    void ensureLink();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Use one of the calendar buttons instead.");
    }
  };

  const stopSharing = async () => {
    setBusy(true);
    setError(null);
    const { error: revErr } = await supabase.from("ics_tokens").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
    setBusy(false);
    if (revErr) {
      setError("We couldn't stop sharing just now. Check your connection and try again.");
      return;
    }
    writeSaved(null);
    setUrl(null);
    setConfirmStop(false);
    setStopped(true);
  };

  const choice = "flex w-full items-center justify-center rounded-xl px-4 py-3.5 text-base font-semibold transition-colors";

  return (
    <div className="print:hidden mt-4">
      <button
        type="button"
        onClick={openMenu}
        className="inline-flex items-center gap-2 rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5M10 11v3.5M8.25 12.75h3.5" />
        </svg>
        Add to my calendar
      </button>

      {open && (
        <div className="portal fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add to my calendar">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-ink">Add to my calendar</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-ink/65 hover:bg-cream">
                <Icon name="x" size="sm" />
              </button>
            </div>

            {stopped ? (
              <p role="status" className="mt-4 text-sm text-ink/70">
                Sharing stopped. Calendars that used your old link will stop updating. Close this and tap the button again any time to make a new link.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink/70">Pick the calendar you use. Your timetable, homework and events will show up there and stay up to date by themselves.</p>
                <div className="mt-4 space-y-2.5">
                  {url ? (
                    <>
                      <a href={googleSubscribeUrl(url)} target="_blank" rel="noopener noreferrer" className={`${choice} flex-col bg-gold-700 text-white hover:bg-gold-900`}>
                        Google Calendar
                        <span className="text-xs font-normal text-white/80">Gmail, Android phones</span>
                      </a>
                      <a href={outlookSubscribeUrl(url)} target="_blank" rel="noopener noreferrer" className={`${choice} flex-col bg-gold-700 text-white hover:bg-gold-900`}>
                        Outlook
                        <span className="text-xs font-normal text-white/80">Outlook.com, Microsoft 365, Hotmail</span>
                      </a>
                      <a href={webcalUrl(url)} className={`${choice} flex-col bg-gold-700 text-white hover:bg-gold-900`}>
                        Apple Calendar
                        <span className="text-xs font-normal text-white/80">iPhone, iPad, Mac and most other apps</span>
                      </a>
                      <button type="button" onClick={copy} className={`${choice} flex-col border border-gold-light bg-white text-ink hover:bg-cream`}>
                        {copied ? "Link copied" : "Copy link"}
                        <span className="text-xs font-normal text-ink/65">Paste it into any calendar&apos;s &ldquo;add by link&rdquo; option. Keep it private.</span>
                      </button>
                    </>
                  ) : (
                    <p role="status" className="py-6 text-center text-sm text-ink/65">
                      {error ? "" : busy ? "Setting up your link…" : ""}
                    </p>
                  )}
                </div>
              </>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
                {!url && !stopped && (
                  <button type="button" onClick={() => void ensureLink()} className="ml-2 font-semibold underline">
                    Try again
                  </button>
                )}
              </p>
            )}

            {!stopped && (
              <div className="mt-4 border-t border-gold-light/50 pt-3 text-right">
                {confirmStop ? (
                  <span className="text-xs text-ink/70">
                    Stop all calendar links?{" "}
                    <button type="button" onClick={() => void stopSharing()} disabled={busy} className="font-semibold text-red-700 underline disabled:opacity-50">
                      Yes, stop
                    </button>{" "}
                    <button type="button" onClick={() => setConfirmStop(false)} className="underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmStop(true)} className="text-xs text-ink/65 underline hover:text-red-700">
                    Stop sharing
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
