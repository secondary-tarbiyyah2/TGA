"use client";

import { Icon } from "@/components/learn/Icon";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

// The celebratory side of "Star of the week":
//  * StarShoutOuts: this week's approved stars across the school, first name
//    + surname initial + reason, from star_of_the_week_board() (0074), which
//    never includes a child whose family opted out of the leaderboard.
//  * MyCertificates: a family's (or student's) OWN approved stars with a link
//    to the PDF certificate. Visible to the child's family even when the child
//    is opted out, because it is private to them.

type BoardRow = { week_start: string; class_name: string; first_name: string; surname_initial: string | null; reason: string; is_mine: boolean };

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export function StarShoutOuts() {
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("star_of_the_week_board", { p_weeks: 1 });
      if (cancelled) return;
      setRows(error ? [] : ((data as BoardRow[] | null) || []));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section aria-labelledby="stars-heading" className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light px-4 py-3">
        <h2 id="stars-heading" className="text-sm font-semibold text-ink">
          <Icon name="star" className="mr-1.5 inline h-4 w-4 align-[-2px] text-gold-700" />Stars of the week
        </h2>
        <p className="text-[11px] text-ink/65">Week beginning {longDate(rows[0].week_start)}</p>
      </div>
      <ul className="divide-y divide-gold-light/60">
        {rows.map((r, i) => (
          <li key={`${r.class_name}-${r.first_name}-${i}`} className={`px-4 py-2.5 text-sm ${r.is_mine ? "bg-teal-100/40" : ""}`}>
            <p className="font-medium text-ink">
              {r.surname_initial ? `${r.first_name} ${r.surname_initial}.` : r.first_name}
              <span className="ml-2 text-xs font-normal text-ink/65">{r.class_name}</span>
              {r.is_mine && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">That&apos;s you!</span>}
            </p>
            <p className="text-xs text-ink/70">{r.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

type CertRow = { id: string; week_start: string; reason: string; certificate_path: string | null; children: { name: string } | null; classes: { name: string } | null };

export function MyCertificates({ childIds }: { childIds: string[] }) {
  const [rows, setRows] = useState<CertRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const idKey = childIds.join(",");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || childIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("star_of_the_week")
        .select("id, week_start, reason, certificate_path, children(name), classes(name)")
        .in("child_id", childIds)
        .eq("status", "approved")
        .not("certificate_path", "is", null)
        .order("week_start", { ascending: false })
        .limit(10);
      if (!cancelled) setRows((data as unknown as CertRow[] | null) || []);
    })();
    return () => {
      cancelled = true;
    };
    // idKey stands in for the childIds array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const open = async (row: CertRow) => {
    const supabase = getSupabaseClient();
    if (!supabase || !row.certificate_path) return;
    setBusy(row.id);
    setError(false);
    // Open the tab first so the popup isn't blocked by the await below.
    const tab = window.open("about:blank", "_blank");
    const { data, error: err } = await supabase.storage.from("star-certificates").createSignedUrl(row.certificate_path, 300);
    setBusy(null);
    if (err || !data?.signedUrl) {
      tab?.close();
      setError(true);
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section aria-labelledby="certs-heading" className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light px-4 py-3">
        <h2 id="certs-heading" className="text-sm font-semibold text-ink">
          <Icon name="star" className="mr-1.5 inline h-4 w-4 align-[-2px] text-gold-700" />Star of the Week certificates
        </h2>
      </div>
      <ul className="divide-y divide-gold-light/60">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-ink">
                {r.children?.name || "Star"}
                <span className="ml-2 text-xs font-normal text-ink/65">
                  {r.classes?.name ? `${r.classes.name} · ` : ""}
                  week of {longDate(r.week_start)}
                </span>
              </span>
              <span className="block text-xs text-ink/70">{r.reason}</span>
            </span>
            <button type="button" disabled={busy === r.id} onClick={() => open(r)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
              {busy === r.id ? "Opening…" : "View certificate"}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-amber-900">
          Couldn&apos;t open that certificate. Please try again.
        </p>
      )}
    </section>
  );
}
