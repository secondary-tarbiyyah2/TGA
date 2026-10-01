"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { getSupabaseClient } from "@/lib/supabase/client";

type Receipt = {
  id: string;
  typed_full_name: string;
  signed_at: string;
  asset_id_signed: string;
  content_hash: string | null;
  document_title_signed: string | null;
  document_id: string;
};

function ReceiptContent() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const supabase = getSupabaseClient();
    if (!id || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount
      setState("missing");
      return;
    }
    supabase
      .from("document_signatures")
      .select("id, typed_full_name, signed_at, asset_id_signed, content_hash, document_title_signed, document_id")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setReceipt(data as Receipt);
          setState("ready");
        } else setState("missing");
      });
  }, []);

  if (state === "loading") return <p className="text-sm text-ink/60">Loading…</p>;
  if (state === "missing" || !receipt)
    return (
      <div className="rounded-2xl border border-gold-light bg-white p-8 text-center">
        <p className="font-medium text-ink">We couldn&apos;t find that signed copy</p>
        <p className="mt-1 text-sm text-ink/60">You can only open copies of documents you signed yourself.</p>
        <Link href="/documents" className="mt-4 inline-block text-sm font-medium text-teal-700 underline">Back to My documents</Link>
      </div>
    );

  const when = new Date(receipt.signed_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/London" });
  const rows: [string, string][] = [
    ["Document", receipt.document_title_signed || "Document"],
    ["Version signed", receipt.asset_id_signed],
    ["Signed by", receipt.typed_full_name],
    ["Signed at", `${when} (UK time)`],
    ["Reference", receipt.id],
    ["Record hash (SHA-256)", receipt.content_hash || "Not available for signatures made before receipts were introduced"],
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">Print or save as PDF</button>
        <Link href="/documents" className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">Back to My documents</Link>
      </div>
      <article className="mx-auto max-w-2xl rounded-2xl border border-gold-light bg-white p-8 print:border-0 print:p-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Tarbiyyah Global Academy</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Signed document record</h1>
        <p className="mt-2 text-sm text-ink/70">This confirms that the person below read and signed the document at the time shown.</p>
        <dl className="mt-6 divide-y divide-gold-light/70 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-ink/55">{k}</dt>
              <dd className={`break-all text-ink ${k.startsWith("Record") || k === "Reference" ? "font-mono text-xs" : "font-medium"}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-ink/50">The hash is computed by the school&apos;s system from the document title, version, signer, typed name and time of signing. Keep this record for your files.</p>
      </article>
    </>
  );
}

export default function ReceiptPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"]}>
        <ReceiptContent />
      </LearnGate>
    </section>
  );
}
