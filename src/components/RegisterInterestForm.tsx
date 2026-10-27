"use client";

import { useState, type FormEvent } from "react";
import { leadRef, saveRegisterInterest } from "@/lib/leadRef";

type Status = "idle" | "submitting" | "success" | "error";

export function RegisterInterestForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const ref = await leadRef(data.email || "");

    try {
      const res = await fetch("/register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lead_ref: ref, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!res.ok) throw new Error("failed");
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
    } catch {
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
          <input name="parent_name" type="text" required autoComplete="name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email address
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Contact number
          <input name="phone" type="tel" required autoComplete="tel" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Child&apos;s year group
          <input name="yeargroup" type="text" required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-ink">
        Message <span className="font-normal text-ink/70">(optional)</span>
        <textarea name="message" rows={3} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
      </label>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" name="consent" value="yes" required className="mt-1" />
        I&apos;m happy for Tarbiyyah Global Academy to contact me about this registration.
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
          Something went wrong. Please try again, or email{" "}
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="underline">globalacademy@tarbiyyah.co.uk</a> directly.
        </p>
      )}
    </form>
  );
}
