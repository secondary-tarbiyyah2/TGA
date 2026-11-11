"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEdgeFunctionUrl } from "@/lib/supabase/client";
import { ROLE_EMAILS } from "@/content/contacts";

type State = { kind: "idle" } | { kind: "working" } | { kind: "done"; title?: string; already?: boolean } | { kind: "error"; message: string };

/** Opened from the "cancel your place" link in the confirmation email (?token=…). No login. */
export function ManageOpenEveningClient() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function cancel() {
    if (!token) return;
    setState({ kind: "working" });
    const url = getEdgeFunctionUrl("open-evening-book");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return setState({ kind: "error", message: `The booking service is not available right now. Please email ${ROLE_EMAILS.admissions}.` });
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` }, body: JSON.stringify({ action: "cancel", token }) });
      const data = (await res.json()) as { ok: boolean; error?: string; title?: string; already?: boolean };
      if (!data.ok) return setState({ kind: "error", message: data.error === "not_found" ? "We could not find a booking for this link. It may already have been cancelled, or the link is incomplete." : `Something went wrong. Please try again or email ${ROLE_EMAILS.admissions}.` });
      setState({ kind: "done", title: data.title, already: data.already });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Please try again." });
    }
  }

  if (token === null) return <p className="mt-6 text-ink/70">Loading…</p>;
  if (!token) return <p className="mt-6 text-ink/70">This page works from the link in your confirmation email. If you need help, email {ROLE_EMAILS.admissions}.</p>;

  if (state.kind === "done") {
    return (
      <div className="mt-6 rounded-2xl border border-gold-light/50 bg-cream p-5 text-ink/80">
        <p className="font-semibold text-ink">{state.already ? "This place was already cancelled." : "Your place is cancelled."}</p>
        {state.title && <p className="mt-1 text-sm">{state.title}</p>}
        <p className="mt-3 text-sm">
          Changed your mind, or want a different date? <Link href="/open-evening" className="font-semibold text-gold-700 underline">Book another session</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-gold-light/50 bg-white p-5">
      <p className="text-ink/80">Can&apos;t make it? Cancel your place below so someone else can have it. To come at a different time, cancel here and then book the other session on the open evenings page.</p>
      <button type="button" onClick={cancel} disabled={state.kind === "working"} className="mt-4 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
        {state.kind === "working" ? "Cancelling…" : "Cancel my place"}
      </button>
      {state.kind === "error" && <p className="mt-3 text-sm text-red-700" role="alert">{state.message}</p>}
    </div>
  );
}
