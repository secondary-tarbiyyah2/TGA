"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getEdgeFunctionUrl } from "@/lib/supabase/client";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";
const COVERS = [
  { id: "application_fee", label: "Application fee" },
  { id: "registration_fee", label: "Registration fee" },
  { id: "first_payment", label: "First payment" },
] as const;
const PLANS = [
  { id: "monthly", label: "Monthly instalments" },
  { id: "termly", label: "Termly payments" },
  { id: "annual", label: "Annual, paid in full" },
] as const;

type Info = {
  reference: string;
  childName: string;
  parentName: string;
  proofs: { fileName: string | null; covers: string[]; plan: string | null; uploadedAt: string; status: "pending" | "verified" | "rejected"; reason: string | null }[];
};

const ERRORS: Record<string, string> = {
  invalid_link: "This link isn't valid any more. Please use the most recent email from us, or reply to it and we'll send a new link.",
  rate_limited: "Too many attempts. Please wait a little while and try again.",
  application_closed: "This application is closed. Please contact the admissions team.",
  choose_what_it_covers: "Please tick what the payment covers.",
  choose_plan: "Please choose the payment plan for the first payment.",
  invalid_amount: "Please check the amount.",
  no_files: "Please choose at least one file.",
  too_many_files: `You can upload up to ${MAX_FILES} files at a time.`,
  file_too_large: "One of the files is over 10 MB.",
  too_large: "The files are too large in total. Please upload fewer or smaller files.",
  unsupported_file_type: "Only JPG, PNG or PDF files can be uploaded.",
  too_many_proofs: "You have reached the upload limit for this application. Please reply to our email instead.",
  network_error: "We couldn't reach the server. Check your connection and try again.",
  not_configured: "This page isn't connected yet. Please reply to our email instead.",
};

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-base text-ink";

async function post(body: BodyInit, json: boolean): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const url = getEdgeFunctionUrl("admissions-payment-proof");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body,
    });
    const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    return data && typeof data === "object" ? data : { ok: false, error: "network_error" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export function PaymentProofClient() {
  const params = useSearchParams();
  const reference = params.get("ref") || "";
  const token = params.get("token") || "";
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [covers, setCovers] = useState<string[]>([]);
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadInfo = useCallback(async () => {
    if (!reference || !token) {
      setLoadError(ERRORS.invalid_link);
      return;
    }
    const r = await post(JSON.stringify({ action: "info", reference, token }), true);
    if (r.ok) {
      setInfo(r as unknown as Info);
      setLoadError(null);
    } else {
      setLoadError(ERRORS[r.error || ""] || "Something went wrong. Please try again.");
    }
  }, [reference, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadInfo();
  }, [loadInfo]);

  function pickFiles(list: FileList | null) {
    setError(null);
    const chosen = Array.from(list || []);
    if (chosen.length > MAX_FILES) return setError(ERRORS.too_many_files);
    for (const f of chosen) {
      const okType = /\.(jpe?g|png|pdf)$/i.test(f.name) || ["image/jpeg", "image/png", "application/pdf"].includes(f.type);
      if (!okType) return setError(`"${f.name}" isn't a JPG, PNG or PDF.`);
      if (f.size > MAX_BYTES) return setError(`"${f.name}" is over 10 MB.`);
    }
    setFiles(chosen);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (covers.length === 0) return setError(ERRORS.choose_what_it_covers);
    if (covers.includes("first_payment") && !plan) return setError(ERRORS.choose_plan);
    if (files.length === 0) return setError(ERRORS.no_files);
    const form = new FormData(e.currentTarget);
    form.set("action", "upload");
    form.set("reference", reference);
    form.set("token", token);
    form.set("covers", covers.join(","));
    form.set("plan", plan);
    form.set("amount", amount.trim().replace(/^£/, ""));
    form.set("note", note);
    form.delete("files");
    for (const f of files) form.append("files", f);
    setBusy(true);
    const r = await post(form, false);
    setBusy(false);
    if (!r.ok) return setError(ERRORS[r.error || ""] || "Something went wrong. Please try again.");
    setDone(true);
    setFiles([]);
    setCovers([]);
    setPlan("");
    setAmount("");
    setNote("");
    void loadInfo();
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {loadError}
      </div>
    );
  }
  if (!info) return <p role="status" className="text-ink/60">Loading…</p>;

  const toggle = (id: string) => setCovers((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="space-y-8">
      <p className="text-ink/80">
        Assalamu alaikum {info.parentName.split(/\s+/)[0]}. Please upload a screenshot or receipt for the payment you made for <strong>{info.childName}</strong> ({info.reference}). Please make sure the amount, date and reference are visible.
      </p>

      {done && (
        <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          Thank you, we&apos;ve received your upload and emailed you a confirmation. Our team will check it and email you once it is confirmed. You can upload more below if needed.
        </div>
      )}

      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="hidden" aria-hidden="true">
          <label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">What does this payment cover?</legend>
          <div className="mt-2 space-y-2">
            {COVERS.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-base text-ink">
                <input type="checkbox" checked={covers.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Which plan did you choose for the first payment?{covers.includes("first_payment") ? "" : " (if applicable)"}</legend>
          <div className="mt-2 space-y-2">
            {PLANS.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-base text-ink">
                <input type="radio" name="plan-choice" checked={plan === p.id} onChange={() => setPlan(p.id)} className="h-4 w-4" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-ink">
          Amount paid (£)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250" className={fieldCls} />
        </label>

        <label className="block text-sm font-semibold text-ink">
          Files (JPG, PNG or PDF, up to 10 MB each, max {MAX_FILES})
          <input type="file" multiple accept={ACCEPT} onChange={(e) => pickFiles(e.target.files)} className="mt-1 block w-full text-base" />
        </label>
        {files.length > 0 && (
          <ul className="text-sm text-ink/70">
            {files.map((f) => (
              <li key={f.name + f.size}>{f.name} ({(f.size / 1048576).toFixed(1)} MB)</li>
            ))}
          </ul>
        )}

        <label className="block text-sm font-semibold text-ink">
          Anything we should know? (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={fieldCls} />
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-6 py-2.5 text-base font-semibold text-ink-900 disabled:opacity-60">
          {busy ? "Uploading…" : "Upload proof of payment"}
        </button>
      </form>

      {info.proofs.length > 0 && (
        <section aria-label="Your uploads">
          <h2 className="font-serif text-xl font-semibold text-ink">Your uploads</h2>
          <ul className="mt-3 space-y-3">
            {info.proofs.map((p, i) => (
              <li key={i} className="rounded-xl border border-gold-light/50 bg-white p-3 text-sm text-ink">
                <p className="font-medium break-words">{p.fileName || "Proof of payment"}</p>
                <p className="text-xs text-ink/60">
                  {new Date(p.uploadedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} ·{" "}
                  <span className={p.status === "verified" ? "font-semibold text-teal-700" : p.status === "rejected" ? "font-semibold text-red-700" : "text-ink/70"}>
                    {p.status === "verified" ? "Confirmed" : p.status === "rejected" ? "Not accepted" : "Waiting to be checked"}
                  </span>
                </p>
                {p.status === "rejected" && p.reason && <p className="mt-1 text-red-700">{p.reason} Please upload a new file above.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
