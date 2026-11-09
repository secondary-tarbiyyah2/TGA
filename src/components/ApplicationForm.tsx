"use client";

import { useEffect, useState, type FormEvent } from "react";
import { leadRef, readRegisterInterest, type StoredRegisterInterest } from "@/lib/leadRef";
import { COUNTRIES } from "@/lib/countries";
import { Select } from "@/components/ui/Dropdown";

const YEAR_GROUPS = [
  "Year 1 (age 5–6)", "Year 2 (age 6–7)", "Year 3 (age 7–8)", "Year 4 (age 8–9)",
  "Year 5 (age 9–10)", "Year 6 (age 10–11)", "Year 7 (age 11–12)", "Year 8 (age 12–13)", "Year 9 (age 13–14)",
  "Year 10 (age 14–15)", "Year 11 (age 15–16)", "Not sure yet",
];

type Status = "idle" | "submitting" | "success" | "error";

export function ApplicationForm() {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  // Pre-fill from a register-interest submission made earlier on this same
  // device, so a family that already told us who they are doesn't have to
  // retype it, and so the two submissions carry the same lead reference.
  // See src/lib/leadRef.ts for why this (not server-side dedup) is the
  // honest limit given this site's stateless PHP mail backend.
  const [prefill, setPrefill] = useState<StoredRegisterInterest | null>(null);
  const totalSteps = 3;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external system (localStorage), not a render-cycle self-sync; localStorage isn't readable during SSR/first render
    setPrefill(readRegisterInterest());
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const ref = prefill?.lead_ref && prefill.email === data.email ? prefill.lead_ref : await leadRef(data.email || "");

    try {
      const res = await fetch("/apply.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lead_ref: ref, previous_register_interest: prefill ? "yes" : "" }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <h3 className="font-serif text-xl font-semibold text-ink">Application received.</h3>
        <p className="mt-2 text-ink/70">
          Thank you, we&apos;ve received your application and will be in touch with next steps, including any entry
          assessment.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8" noValidate>
      {/* Honeypot: visually hidden via an off-screen clip (not display:none),
          plus tabIndex=-1 and autoComplete="off", so real keyboard/AT users
          never encounter it. apply.php already rejects a non-empty value. */}
      <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-hidden="true">
        <label>
          Leave this field blank
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="mb-6 flex items-center gap-2" role="group" aria-label={`Step ${step} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-gold-500" : "bg-gold-light/50"}`} aria-hidden="true" />
        ))}
      </div>

      <div className={step === 1 ? "block" : "hidden"}>
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gold-700">Step 1 · About you</p>
        {prefill && (
          <p className="mb-4 rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
            We&apos;ve filled in your details from when you registered interest, please check them and update anything that&apos;s changed.
          </p>
        )}
        {/* key forces a remount once prefill loads from localStorage after
            mount, so defaultValue (uncontrolled inputs) actually applies, 
            defaultValue only takes effect when a DOM node is first created. */}
        <div key={prefill ? "prefilled" : "empty"} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Your full name
            <input name="parent_name" type="text" required={step === 1} autoComplete="name" defaultValue={prefill?.parent_name} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Email address
            <input name="email" type="email" required={step === 1} autoComplete="email" defaultValue={prefill?.email} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Contact number
            <input name="phone" type="tel" required={step === 1} autoComplete="tel" defaultValue={prefill?.phone} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Country you&apos;re based in
            <input name="country" type="text" list="application-countries" required={step === 1} autoComplete="country-name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            <datalist id="application-countries">
              {COUNTRIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
        </div>
      </div>

      <div className={step === 2 ? "block" : "hidden"}>
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gold-700">Step 2 · Your child</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Child&apos;s full name
            <input name="child_name" type="text" required={step === 2} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Year group applying for
            <Select native name="yeargroup" required={step === 2} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2">
              <option value="">Select a year group</option>
              {YEAR_GROUPS.map((y) => <option key={y}>{y}</option>)}
            </Select>
          </label>
        </div>
      </div>

      <div className={step === 3 ? "block" : "hidden"}>
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gold-700">Step 3 · Notes &amp; consent</p>
        <label className="block text-sm font-medium text-ink">
          Anything else we should know? <span className="font-normal text-ink/70">(optional)</span>
          <textarea name="notes" rows={4} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
          <input type="checkbox" name="consent" value="yes" required={step === 3} className="mt-1" />
          I consent to Tarbiyyah Global Academy contacting me about this application.
        </label>
      </div>

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className={`rounded-full border border-gold-500 px-5 py-2.5 text-sm font-semibold text-gold-700 ${step === 1 ? "invisible" : ""}`}
        >
          Back
        </button>
        {step < totalSteps ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
            className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95"
          >
            Continue
          </button>
        ) : (
          <button type="submit" disabled={status === "submitting"} className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
            {status === "submitting" ? "Submitting…" : "Submit application"}
          </button>
        )}
      </div>

      {status === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Something went wrong sending your application. Please try again, or email{" "}
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="underline">globalacademy@tarbiyyah.co.uk</a> directly.
        </p>
      )}
    </form>
  );
}
