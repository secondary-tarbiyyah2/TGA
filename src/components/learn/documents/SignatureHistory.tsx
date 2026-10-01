"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { methodBadge } from "./signatureMethod";

type Row = {
  id: string;
  typed_full_name: string;
  signed_at: string;
  method: string;
  recorded_by_name: string | null;
  recorded_at: string;
  evidence_path: string | null;
  record_note: string | null;
  document_title_signed: string | null;
};

/** Recent hand-recorded signatures (staff view) with a link to the scan. */
export function SignatureHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("document_signatures")
      .select("id, typed_full_name, signed_at, method, recorded_by_name, recorded_at, evidence_path, record_note, document_title_signed")
      .neq("method", "portal")
      .order("recorded_at", { ascending: false })
      .limit(25)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [refreshKey]);

  const openScan = useCallback(async (path: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setErr(null);
    const { data, error } = await supabase.storage.from("signed-paper-copies").createSignedUrl(path, 300);
    if (error || !data) return setErr("Couldn't open the scan.");
    window.open(data.signedUrl, "_blank", "noopener");
  }, []);

  if (!rows || rows.length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl border border-gold-light bg-white">
      <h3 className="border-b border-gold-light px-5 py-3 text-sm font-semibold text-ink">Recently recorded by hand</h3>
      {err && <p className="px-5 py-2 text-xs text-red-800">{err}</p>}
      <ul className="divide-y divide-gold-light/70">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-2.5 text-sm">
            <span className="font-medium text-ink">{r.typed_full_name}</span>
            <span className="ml-2 text-ink/65">{r.document_title_signed || "Document"}</span>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink/55">
              <span className="rounded-full bg-cream px-2 py-0.5 font-medium text-ink/75">{methodBadge(r.method, r.recorded_by_name)}</span>
              <span>signed {new Date(r.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}</span>
              {r.record_note && <span>· {r.record_note}</span>}
              {r.evidence_path && (
                <button type="button" onClick={() => openScan(r.evidence_path!)} className="font-medium text-teal-700 underline">
                  View scan
                </button>
              )}
              <Link href={`/documents/receipt?id=${r.id}`} className="font-medium text-teal-700 underline">
                Record
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
