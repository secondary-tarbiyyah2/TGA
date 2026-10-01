"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { getSupabaseClient } from "@/lib/supabase/client";
import { openSignedPdf } from "../signedPdf";
import { signatureImageUrl } from "@/components/learn/documents/signatureImage";
import { PrintSheet } from "@/components/learn/print";
import { PRINT_AREA } from "@/components/learn/reports/printArea";
import { METHOD_LABEL, type SignatureMethod } from "@/components/learn/documents/signatureMethod";

type Receipt = {
  id: string;
  typed_full_name: string;
  signed_at: string;
  asset_id_signed: string;
  content_hash: string | null;
  document_title_signed: string | null;
  document_id: string;
  method?: string | null;
  recorded_by_name?: string | null;
  recorded_at?: string | null;
  record_note?: string | null;
  signature_image_path?: string | null;
  signature_image_sha256?: string | null;
};

function ReceiptContent() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
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
      .select("id, typed_full_name, signed_at, asset_id_signed, content_hash, document_title_signed, document_id, method, recorded_by_name, recorded_at, record_note, signature_image_path, signature_image_sha256")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const r = data as Receipt;
          setReceipt(r);
          setState("ready");
          if (r.signature_image_path) void signatureImageUrl(supabase, r.signature_image_path).then((u) => u && setSigUrl(u));
        } else setState("missing");
      });
  }, []);

  useEffect(() => () => {
    if (sigUrl) URL.revokeObjectURL(sigUrl);
  }, [sigUrl]);

  if (state === "loading") return <p className="text-sm text-ink/60">Loading…</p>;
  if (state === "missing" || !receipt)
    return (
      <div className="rounded-2xl border border-gold-light bg-white p-8 text-center">
        <p className="font-medium text-ink">We couldn&apos;t find that signed copy</p>
        <p className="mt-1 text-sm text-ink/60">You can only open copies of documents you signed yourself (the Headteacher and admins can open any).</p>
        <Link href="/documents" className="mt-4 inline-block text-sm font-medium text-teal-700 underline">Back to My documents</Link>
      </div>
    );

  const when = new Date(receipt.signed_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/London" });
  const method = (receipt.method || "portal") as SignatureMethod;
  const handRecorded = method !== "portal";
  const rows: [string, string][] = [
    ["Document", receipt.document_title_signed || "Document"],
    ["Version signed", receipt.asset_id_signed],
    ["Signed by", receipt.typed_full_name],
    [handRecorded ? "Date signed" : "Signed at", handRecorded ? `${new Date(receipt.signed_at).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/London" })}` : `${when} (UK time)`],
    ["Reference", receipt.id],
    ...(handRecorded
      ? ([
          ["How it was signed", METHOD_LABEL[method] || "Signed by hand"],
          ["Recorded by", `${receipt.recorded_by_name || "School staff"}${receipt.recorded_at ? ` on ${new Date(receipt.recorded_at).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/London" })}` : ""}`],
          ...(receipt.record_note ? [["Note", receipt.record_note]] : []),
        ] as [string, string][])
      : []),
    ...(receipt.signature_image_sha256 ? ([["Signature image hash", receipt.signature_image_sha256]] as [string, string][]) : []),
    ["Record hash (SHA-256)", receipt.content_hash || "Not available for signatures made before receipts were introduced"],
  ];
  return (
    <>
      <PrintSheet />
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            setPdfFailed(!(await openSignedPdf(receipt.id)));
            setPdfBusy(false);
          }}
          className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60"
        >
          {pdfBusy ? "Preparing…" : "Open signed PDF"}
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">Print this record</button>
        <Link href="/documents" className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">Back to My documents</Link>
      </div>
      {pdfFailed && <p role="alert" className="mb-3 text-sm text-red-800 print:hidden">We couldn&apos;t prepare the signed PDF just now. Please try again in a moment.</p>}
      <article className={`${PRINT_AREA} mx-auto max-w-2xl rounded-2xl border border-gold-light bg-white p-8 print:border-0 print:p-0`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Tarbiyyah Global Academy</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Signed document record</h1>
        <p className="mt-2 text-sm text-ink/70">{handRecorded ? "This confirms that the person below signed the document by hand, and that the school recorded it on their behalf." : "This confirms that the person below read and signed the document at the time shown."}</p>
        {receipt.signature_image_path && (
          <figure className="mt-6 rounded-xl border border-gold-light bg-cream/40 p-4">
            <figcaption className="text-xs font-semibold uppercase tracking-wider text-ink/50">Handwritten signature</figcaption>
            {sigUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- private blob URL
              <img src={sigUrl} alt={`Handwritten signature of ${receipt.typed_full_name}`} className="mx-auto mt-2 max-h-32 w-auto" />
            ) : (
              <p className="mt-2 text-sm text-ink/55">Loading signature…</p>
            )}
            <p className="mt-2 border-t border-ink/20 pt-1 text-center text-xs text-ink/60">{receipt.typed_full_name}</p>
          </figure>
        )}
        <dl className="mt-6 divide-y divide-gold-light/70 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-ink/55">{k}</dt>
              <dd className={`break-all text-ink ${k.startsWith("Record") || k.startsWith("Signature image") || k === "Reference" ? "font-mono text-xs" : "font-medium"}`}>{v}</dd>
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
