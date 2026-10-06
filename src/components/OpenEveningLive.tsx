"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getLiveSiteSettings } from "@/lib/content";
import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  seats_left: number;
};

/** The open-evening details that come from the site settings. */
export type OpenEveningSettings = {
  admissionsEmail?: string;
  bookingWidgetUrl?: string;
  openEveningRecordingUrl?: string;
};

type Status = "idle" | "sending" | "done" | "error";

const DEFAULT_EMAIL = "globalacademy@tarbiyyah.co.uk";
const MAX_PER_BOOKING = 6;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const inputCls = "mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2";

function errorMessage(code: string | undefined, seatsLeft?: number): string {
  switch (code) {
    case "full":
      return seatsLeft && seatsLeft > 0
        ? `Sorry, only ${seatsLeft} ${seatsLeft === 1 ? "place is" : "places are"} left on this evening. Please reduce the number attending, or choose another date.`
        : "Sorry, this evening is now fully booked. Please choose another date, or email us and we will add you to a waiting list.";
    case "already_booked":
      return "There is already a booking for this email address on this evening. Please check your inbox, or email us if you need to change it.";
    case "session_unavailable":
      return "Sorry, this evening is no longer open for booking. Please choose another date.";
    case "rate_limited":
      return "You have tried a few times in a short while. Please wait a little and try again, or email us.";
    case "validation":
      return "Please check the highlighted details and try again.";
    default:
      return "Something went wrong, so your place has not been booked. Please try again, or email us.";
  }
}

/**
 * The public open-evening section: upcoming sessions (live from the database,
 * with places left) and the booking form. The build renders only the
 * heading around it; everything here loads in the browser, so a session the
 * school adds in the admin portal appears straight away, with no rebuild.
 * Bookings go to the open-evening-book Edge Function (honeypot, minimum
 * fill-in time, rate limit), which checks capacity again before saving.
 */
export function OpenEveningLive({ initialSettings }: { initialSettings: OpenEveningSettings }) {
  const [settings, setSettings] = useState<OpenEveningSettings>(initialSettings);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [renderedAt] = useState(() => Date.now());
  const [bookedTitle, setBookedTitle] = useState("");
  const [emailSent, setEmailSent] = useState(true);

  const loadSessions = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadFailed(true);
      setSessions([]);
      return;
    }
    const { data, error } = await supabase.rpc("open_evening_upcoming");
    if (error) {
      setLoadFailed(true);
      setSessions([]);
      return;
    }
    setLoadFailed(false);
    setSessions((data as Session[] | null) || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadSessions();
    let cancelled = false;
    void getLiveSiteSettings().then((live) => {
      if (cancelled || !live) return;
      setSettings({ admissionsEmail: live.admissionsEmail, bookingWidgetUrl: live.bookingWidgetUrl, openEveningRecordingUrl: live.openEveningRecordingUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const email = settings.admissionsEmail || DEFAULT_EMAIL;
  const selected = useMemo(() => sessions?.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const url = getEdgeFunctionUrl("open-evening-book");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setStatus("error");
      setMessage(errorMessage(undefined));
      return;
    }
    const form = new FormData(e.currentTarget);
    setStatus("sending");
    setMessage(null);
    setBadFields([]);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          sessionId: selected.id,
          parentName: form.get("parentName"),
          email: form.get("email"),
          phone: form.get("phone"),
          attendees: Number(form.get("attendees")),
          yearGroups: form.get("yearGroups"),
          questions: form.get("questions"),
          consent: form.get("consent") === "yes",
          company: form.get("company"),
          formRenderedAt: renderedAt,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: string[]; seatsLeft?: number; emailSent?: boolean };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setBadFields(json.fields || []);
        setMessage(errorMessage(json.error, json.seatsLeft));
        if (json.error === "full" || json.error === "session_unavailable") void loadSessions();
        return;
      }
      setBookedTitle(`${fmtDate(selected.starts_at)} at ${fmtTime(selected.starts_at)}`);
      setEmailSent(json.emailSent !== false);
      setStatus("done");
      void loadSessions();
    } catch {
      setStatus("error");
      setMessage(errorMessage(undefined));
    }
  }

  const bad = (name: string) => (badFields.includes(name) ? "border-red-500" : "");

  return (
    <>
      <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-lg font-semibold text-ink">Book your place</h2>

        {status === "done" ? (
          <div role="status" className="mt-4 rounded-xl border border-gold-light/60 bg-cream p-5">
            <p className="font-serif text-lg font-semibold text-ink">Your place is booked.</p>
            <p className="mt-2 text-sm text-ink/75">
              We have reserved your place for {bookedTitle} (UK time).{" "}
              {emailSent
                ? "A confirmation email with the joining link and a calendar invitation is on its way. Please check your junk folder if you do not see it."
                : `We could not send the confirmation email just now, but your place is safe. Please email ${email} and we will send the joining link.`}
            </p>
            <button type="button" onClick={() => { setStatus("idle"); setSelectedId(null); }} className="mt-3 text-sm font-semibold text-gold-700 underline">
              Book for another evening
            </button>
          </div>
        ) : sessions === null ? (
          <p role="status" aria-live="polite" className="mt-2 text-sm text-ink/60">Loading the upcoming evenings…</p>
        ) : sessions.length === 0 ? (
          loadFailed ? (
            <p className="mt-2 text-sm text-ink/70">
              We could not load the dates just now. Please email{" "}
              <a href={`mailto:${email}`} className="text-gold-700 underline">{email}</a>{" "}
              to register for the next evening.
            </p>
          ) : settings.bookingWidgetUrl ? (
            <iframe loading="lazy" title="Book an open evening" src={settings.bookingWidgetUrl} className="mt-4 h-[600px] w-full rounded-xl border border-gold-light/40" />
          ) : (
            <p className="mt-2 text-sm text-ink/70">
              There are no open evenings scheduled at the moment. Please email{" "}
              <a href={`mailto:${email}`} className="text-gold-700 underline">{email}</a>{" "}
              and we will let you know when the next one is announced.
            </p>
          )
        ) : (
          <>
            <p className="mt-1 text-sm text-ink/70">Choose an evening. Times are UK time.</p>
            <ul className="mt-4 space-y-3">
              {sessions.map((s) => {
                const full = s.seats_left <= 0;
                const active = s.id === selectedId;
                return (
                  <li key={s.id} className={`rounded-xl border p-4 ${active ? "border-gold-500 bg-cream/60" : "border-gold-light/60"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.title}</p>
                        <p className="text-sm text-ink/80">{fmtDate(s.starts_at)}, {fmtTime(s.starts_at)} to {fmtTime(s.ends_at)}</p>
                        {s.description && <p className="mt-1 whitespace-pre-line text-sm text-ink/70">{s.description}</p>}
                        <p className={`mt-1 text-xs font-medium ${full ? "text-red-700" : s.seats_left <= 5 ? "text-amber-800" : "text-ink/60"}`}>
                          {full ? "Fully booked" : `${s.seats_left} ${s.seats_left === 1 ? "place" : "places"} left`}
                        </p>
                      </div>
                      {!full && !active && (
                        <button
                          type="button"
                          onClick={() => { setSelectedId(s.id); setStatus("idle"); setMessage(null); setBadFields([]); }}
                          className="rounded-full bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900"
                        >
                          Book a place
                        </button>
                      )}
                    </div>

                    {active && (
                      <form onSubmit={handleSubmit} className="mt-4 border-t border-gold-light/50 pt-4" noValidate>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm font-medium text-ink">
                            Your name
                            <input name="parentName" type="text" required autoComplete="name" maxLength={120} className={`${inputCls} ${bad("parentName")}`} />
                          </label>
                          <label className="block text-sm font-medium text-ink">
                            Email
                            <input name="email" type="email" required autoComplete="email" maxLength={254} className={`${inputCls} ${bad("email")}`} />
                          </label>
                          <label className="block text-sm font-medium text-ink">
                            Phone <span className="font-normal text-ink/50">(optional)</span>
                            <input name="phone" type="tel" autoComplete="tel" maxLength={40} className={`${inputCls} ${bad("phone")}`} />
                          </label>
                          <label className="block text-sm font-medium text-ink">
                            Number of people attending
                            <select name="attendees" defaultValue="1" className={`${inputCls} ${bad("attendees")}`}>
                              {Array.from({ length: Math.min(MAX_PER_BOOKING, s.seats_left) }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="mt-4 block text-sm font-medium text-ink">
                          Your children&apos;s year groups
                          <input name="yearGroups" type="text" required maxLength={200} placeholder="For example: Year 4 and Year 7" className={`${inputCls} ${bad("yearGroups")}`} />
                        </label>
                        <label className="mt-4 block text-sm font-medium text-ink">
                          Questions for the team <span className="font-normal text-ink/50">(optional)</span>
                          <textarea name="questions" rows={3} maxLength={2000} className={`${inputCls} ${bad("questions")}`} />
                        </label>
                        <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
                          <input type="checkbox" name="consent" value="yes" required className="mt-1" />
                          <span>
                            I agree that Tarbiyyah Global Academy may use these details to contact me about this event, as described in the{" "}
                            <Link href="/legal/privacy" className="font-semibold text-gold-700 underline">privacy notice</Link>.
                          </span>
                        </label>
                        <div className="hidden" aria-hidden="true">
                          <label>Company <input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
                        </div>
                        {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button type="submit" disabled={status === "sending"} className="rounded-full bg-gold-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
                            {status === "sending" ? "Booking…" : "Confirm my place"}
                          </button>
                          <button type="button" onClick={() => { setSelectedId(null); setMessage(null); }} className="text-sm text-ink/60 underline">Cancel</button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-ink/60">
              Questions, or need to change a booking? Email{" "}
              <a href={`mailto:${email}`} className="text-gold-700 underline">{email}</a>.
            </p>
          </>
        )}
      </div>

      {settings.openEveningRecordingUrl && (
        <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-lg font-semibold text-ink">Watch a past recording</h2>
          <div className="mt-4 aspect-video overflow-hidden rounded-xl">
            <iframe loading="lazy" title="Past open evening recording" src={settings.openEveningRecordingUrl} className="h-full w-full" allowFullScreen />
          </div>
        </div>
      )}
    </>
  );
}
