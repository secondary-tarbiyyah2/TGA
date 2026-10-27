"use client";

import { useState, type FormEvent } from "react";
import { leadRef, saveRegisterInterest } from "@/lib/leadRef";

type Status = "idle" | "submitting" | "success" | "error";

const inputClass = (bad: boolean) => `mt-1 w-full rounded-lg border px-3 py-2 ${bad ? "border-red-600" : "border-gold-light/60"}`;
const FieldError = ({ id, msg }: { id: string; msg?: string }) => (msg ? <span id={id} role="alert" className="mt-1 block text-xs font-normal text-red-700">{msg}</span> : null);

export function RegisterInterestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorKind, setErrorKind] = useState<"failed" | "rate_limited">("failed");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(data: Record<string, string>): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!data.parent_name?.trim()) errs.parent_name = "Please enter your name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email?.trim() || "")) errs.email = "Please enter a valid email address.";
    if ((data.phone?.match(/\d/g)?.length ?? 0) < 7) errs.phone = "Please enter a contact number with at least 7 digits (include the country code if you are outside the UK).";
    if (!data.yeargroup?.trim()) errs.yeargroup = "Please choose a year group.";
    if (data.consent !== "yes") errs.consent = "Please tick the box so we can contact you.";
    return errs;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    // Checked here (the form is noValidate) so a parent sees which field needs
    // attention rather than register.php's 400 turning into "something went wrong".
    const errs = validate(data);
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setStatus("idle");
      form.querySelector<HTMLElement>(`[name="${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    setStatus("submitting");
    const ref = await leadRef(data.email || "");

    try {
      const res = await fetch("/register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lead_ref: ref, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!res.ok) throw new Error(res.status === 429 ? "rate_limited" : "failed");
      // Lets the admissions application form (if the same family completes
      // it on this device) pre-fill and carry the same lead reference, see
      // src/lib/leadRef.ts for why this is the honest limit of "one lead"
      // linking given this site's stateless PHP mail backend.
      saveRegisterInterest({
        parent_name: data.parent_name || "",
        email: data.email || "",
        phone: data.phone || "",
        yeargroup: data.yeargroup || "",
        lead_ref: ref,
      });
      setStatus("success");
    } catch (err) {
      setErrorKind(err instanceof Error && err.message === "rate_limited" ? "rate_limited" : "failed");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <h3 className="font-serif text-xl font-semibold text-ink">Thank you.</h3>
        <p className="mt-2 text-ink/70">Your interest has been registered. We&apos;ll be in touch as places open.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Your full name
          <input name="parent_name" type="text" required autoComplete="name" aria-invalid={!!fieldErrors.parent_name} aria-describedby={fieldErrors.parent_name ? "ri-err-name" : undefined} className={inputClass(!!fieldErrors.parent_name)} />
          <FieldError id="ri-err-name" msg={fieldErrors.parent_name} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email address
          <input name="email" type="email" required autoComplete="email" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "ri-err-email" : undefined} className={inputClass(!!fieldErrors.email)} />
          <FieldError id="ri-err-email" msg={fieldErrors.email} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Contact number
          <input name="phone" type="tel" required autoComplete="tel" aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? "ri-err-phone" : undefined} className={inputClass(!!fieldErrors.phone)} />
          <FieldError id="ri-err-phone" msg={fieldErrors.phone} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Child&apos;s year group
          <select name="yeargroup" required defaultValue="" aria-invalid={!!fieldErrors.yeargroup} aria-describedby={fieldErrors.yeargroup ? "ri-err-year" : undefined} className={`${inputClass(!!fieldErrors.yeargroup)} bg-white`}>
            <option value="" disabled>
              Choose a year group
            </option>
            {Array.from({ length: 11 }, (_, i) => `Year ${i + 1}`).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="Not sure yet">Not sure yet</option>
          </select>
          <FieldError id="ri-err-year" msg={fieldErrors.yeargroup} />
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-ink">
        Message <span className="font-normal text-ink/70">(optional)</span>
        <textarea name="message" rows={3} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
      </label>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" name="consent" value="yes" required aria-invalid={!!fieldErrors.consent} aria-describedby={fieldErrors.consent ? "ri-err-consent" : undefined} className="mt-1 h-5 w-5" />
        <span>
          I&apos;m happy for Tarbiyyah Global Academy to contact me about this registration. See our{" "}
          <a href="/legal/privacy/" className="underline">privacy notice</a>.
          <FieldError id="ri-err-consent" msg={fieldErrors.consent} />
        </span>
      </label>
      {/* Honeypot: visually hidden (not display:none, which some screen readers
          skip entirely along with everything an assistive-tech user would
          need to notice and avoid it) via an off-screen clip, plus
          tabIndex=-1 and autoComplete="off" so real keyboard/AT users never
          land on or fill it. Bots that fill every field trip it; register.php
          rejects any submission where it's non-empty. */}
      <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-hidden="true">
        <label>
          Leave this field blank
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button type="submit" disabled={status === "submitting"} className="mt-6 w-full rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
        {status === "submitting" ? "Sending…" : "Register interest"}
      </button>
      {status === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {errorKind === "rate_limited" ? "Too many submissions from this connection in the last hour. " : "Something went wrong. "}
          Please try again later, or email{" "}
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="underline">globalacademy@tarbiyyah.co.uk</a> directly.
        </p>
      )}
    </form>
  );
}
