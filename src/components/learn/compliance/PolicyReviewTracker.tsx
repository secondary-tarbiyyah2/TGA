"use client";

import { useEffect, useState } from "react";
import { getSanityClient } from "@/lib/sanity/client";

type Policy = { _id: string; number: string; title: string; lastReviewed: string | null; nextReview: string | null };
const WARNING_WINDOW_DAYS = 30;

/**
 * Human-facing view of scripts/check-policy-reviews.mjs's underlying data —
 * fed live from Sanity's policyLink documents (never duplicated into
 * Supabase, per ground rule 1). Unlike the public /policies pages, /learn
 * isn't statically exported at build time for its data (it's a signed-in
 * SPA reading Supabase/Sanity live at request time in the browser — see
 * next.config's `output: "export"` note: the HTML shell is static, but
 * every /learn page's DATA is fetched client-side after load), so a direct
 * client-side Sanity fetch here is appropriate and reads the current
 * review dates, not a stale build-time snapshot.
 */
export function PolicyReviewTracker() {
  const [policies, setPolicies] = useState<Policy[] | null>(null);

  useEffect(() => {
    const client = getSanityClient();
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load (CMS not configured), not a render-cycle sync
      setPolicies([]);
      return;
    }
    client
      .fetch<Policy[]>(`*[_type == "policyLink" && defined(nextReview)] | order(nextReview asc) { _id, number, title, lastReviewed, nextReview }`)
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }, []);

  const now = new Date();
  const cutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 86400000);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Policy review tracker</h2>
      <p className="mt-1 text-xs text-ink/50">Read live from the Policies manager (Sanity) — the same data scripts/check-policy-reviews.mjs alerts on weekly, not a separate copy.</p>
      {policies === null && <p className="mt-3 text-sm text-ink/60">Loading…</p>}
      {policies && policies.length === 0 && <p className="mt-3 text-sm text-ink/60">No policies with a review date found (or the CMS isn&apos;t connected yet).</p>}
      <ul className="mt-3 space-y-2">
        {(policies || []).map((p) => {
          const due = p.nextReview ? new Date(p.nextReview) : null;
          const overdue = due && due < now;
          const dueSoon = due && !overdue && due <= cutoff;
          return (
            <li key={p._id} className={`rounded-lg border p-3 text-sm ${overdue ? "border-red-300 bg-red-50" : dueSoon ? "border-gold-500/60 bg-gold-50" : "border-gold-light/40"}`}>
              <p className="font-semibold">{p.number} — {p.title}</p>
              <p className="mt-1 text-xs text-ink/60">
                Last reviewed {p.lastReviewed || "—"} · next review {p.nextReview || "—"}
                {overdue && <span className="ml-1 font-semibold text-red-700">OVERDUE</span>}
                {dueSoon && <span className="ml-1 font-semibold text-gold-700">Due within {WARNING_WINDOW_DAYS} days</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
