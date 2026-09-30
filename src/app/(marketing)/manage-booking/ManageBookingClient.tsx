"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getEdgeFunctionUrl } from "@/lib/supabase/client";

type Booking = { id: string; status: string; startsAt: string; endsAt: string; teamsJoinUrl: string; staffName: string };

async function callManageBooking(action: string, token: string, extra: Record<string, unknown> = {}) {
  const url = getEdgeFunctionUrl("manage-booking");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("not_configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ action, token, ...extra }),
  });
  return res.json();
}

/** Fallback for a lost/never-received confirmation email — the only way
 * forward used to be "use the link from your confirmation email", a dead
 * end if that email never arrived. Deliberately shows the same
 * "if we found it, check your email" message either way (see the Edge
 * Function's resend_link action), never confirming whether an address has
 * a booking. */
function ResendLinkForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await callManageBooking("resend_link", "", { email: email.trim() });
    } catch {
      // fall through to the same message regardless — see note above
    }
    setStatus("done");
  }

  if (status === "done") {
    return <p className="mt-4 text-sm text-ink/70">If that email has a booking with us, we&apos;ve just sent a link to manage it.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="text-sm text-ink">
        Your email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2"
        />
      </label>
      <button type="submit" disabled={status === "sending"} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60">
        {status === "sending" ? "Sending…" : "Email me my link"}
      </button>
    </form>
  );
}

export function ManageBookingClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<"cancelled" | null>(null);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- token comes from the URL, only known post-mount
      setError("no_token");
      setLoading(false);
      return;
    }
    callManageBooking("view", token)
      .then((json) => {
        if (json.ok) setBooking(json.booking);
        else setError(json.error || "not_found");
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel() {
    if (!confirm("Cancel this booking? This can't be undone.")) return;
    const json = await callManageBooking("cancel", token);
    if (json.ok) setActionDone("cancelled");
    else setError(json.error || "failed");
  }

  if (loading) return <p className="text-ink/60">Loading your booking…</p>;
  if (error === "no_token") {
    return (
      <div>
        <p className="text-ink/70">No booking link found. Use the link from your confirmation email, or get a new one below.</p>
        <ResendLinkForm />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <p className="text-ink/70">We couldn&apos;t find that booking — the link may have expired. Get a new one below, or email us at globalacademy@tarbiyyah.co.uk.</p>
        <ResendLinkForm />
      </div>
    );
  }
  if (!booking) return null;

  if (actionDone === "cancelled" || booking.status === "cancelled") {
    return (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-lg font-semibold text-ink">This booking has been cancelled.</h2>
        <p className="mt-2 text-sm text-ink/70">You can book a new call any time from our Admissions page.</p>
      </div>
    );
  }

  const when = new Date(booking.startsAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" });

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-lg font-semibold text-ink">Your admissions call</h2>
      <p className="mt-2 text-ink/80">{when} (UK time), with {booking.staffName}</p>
      <a href={booking.teamsJoinUrl} className="mt-2 inline-block text-sm font-semibold text-gold-700 underline">Join on Microsoft Teams</a>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/book-a-call" className="rounded-full border border-gold-500 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-cream">
          Book a different time
        </a>
        <button type="button" onClick={handleCancel} className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          Cancel booking
        </button>
      </div>
      <p className="mt-4 text-xs text-ink/50">To reschedule, book a different time above — your original slot will be freed once the new one is confirmed.</p>
    </div>
  );
}
