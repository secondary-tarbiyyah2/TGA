"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { leadRef, saveRegisterInterest } from "@/lib/leadRef";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Select } from "@/components/ui/Dropdown";
import { YEAR_GROUP_OPTIONS } from "@/components/admissions/applicationShared";
import { Icon } from "@/components/learn/Icon";
import { ROLE_EMAILS } from "@/content/contacts";

type Status = "idle" | "submitting" | "success" | "error";
type Enquiry = "interest" | "question" | "current";
type Values = { enquiry: Enquiry; parent_name: string; email: string; phone: string; yeargroup: string; message: string; consent: boolean; company: string };
type Errors = Partial<Record<keyof Values, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INITIAL: Values = { enquiry: "interest", parent_name: "", email: "", phone: "", yeargroup: "", message: "", consent: false, company: "" };
const inputBase =
  "w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-ink transition-shadow focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300/70 aria-[invalid=true]:border-red-600";

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.parent_name.trim()) e.parent_name = "Please enter your full name.";
  if (!v.email.trim()) e.email = "Please enter your email address.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "That doesn't look like an email address. It should look like name@example.com.";
  if (v.phone.replace(/\D/g, "").length < 8) e.phone = "Please enter a phone number we can reach you on.";
  if (v.enquiry === "interest" && !v.yeargroup) e.yeargroup = "Please choose your child's year group.";
  if (v.enquiry !== "interest" && !v.message.trim()) e.message = "Please write your question.";
  if (!v.consent) e.consent = "Please tick the box so we can contact you.";
  return e;
}

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-ink/70">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** `heading={false}` where the page already titles the form. */
export function RegisterInterestForm({ heading = true, enquiryChoice = false }: { heading?: boolean; enquiryChoice?: boolean } = {}) {
  const [status, setStatus] = useState<Status>("idle");
  const [v, setV] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const formRef = useRef<HTMLFormElement>(null);

  function set<K extends keyof Values>(k: K, val: Values[K]) {
    setV((cur) => ({ ...cur, [k]: val }));
    if (errors[k]) setErrors((cur) => ({ ...cur, [k]: undefined }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const found = validate(v);
    setErrors(found);
    const first = (Object.keys(found) as (keyof Values)[])[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#rif-${first}`)?.focus();
      return;
    }
    setStatus("submitting");
    const data = {
      parent_name: v.parent_name.trim(),
      email: v.email.trim(),
      phone: v.phone.trim(),
      yeargroup: v.yeargroup,
      message: v.message.trim(),
      enquiry: v.enquiry,
      consent: "yes",
      company: v.company,
    };
    const ref = await leadRef(data.email);
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
      if (v.enquiry === "interest") saveRegisterInterest({ parent_name: data.parent_name, email: data.email, phone: data.phone, yeargroup: data.yeargroup, lead_ref: ref });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="foil-top relative rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest-50 text-forest-700">
          <Icon name="circleCheck" size="lg" />
        </span>
        <h3 className="mt-4 font-serif text-xl font-semibold text-ink">Thank you, {v.parent_name.trim().split(/\s+/)[0]}.</h3>
        <p className="mt-2 text-ink/70">{v.enquiry === "interest" ? "Your interest is registered. We'll be in touch as places open." : "We have your message and will reply within one working day."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/eligibility" className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-gold-500 px-5 text-sm font-semibold text-ink-900 hover:bg-gold-100">
            Is it right for us?
          </Link>
          <Link href="/admissions/apply" className="inline-flex min-h-11 items-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink-900 hover:brightness-95">
            Apply now
          </Link>
        </div>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const busy = status === "submitting";
  const describe = (k: keyof Values) => (errors[k] ? `rif-${k}-err` : undefined);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="foil-top relative rounded-2xl border border-gold-light/50 bg-white p-6 shadow-warm sm:p-8" noValidate>
      {heading && (
        <>
          <h2 className="font-serif text-xl font-semibold text-ink">Register your interest</h2>
          <p className="mt-1 text-sm text-ink/70">Two minutes. We&apos;ll keep you updated about places, open evenings and key dates.</p>
        </>
      )}

      {enquiryChoice && (
        <fieldset className={heading ? "mt-6" : ""}>
          <legend className="text-sm font-semibold text-ink">What is this about?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(
              [
                ["interest", "A place for my child"],
                ["question", "A general question"],
                ["current", "I'm a current family"],
              ] as [Enquiry, string][]
            ).map(([val, label]) => (
              <label key={val} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${v.enquiry === val ? "border-ink-900 bg-cream font-semibold text-ink" : "border-gold-light/70 text-ink/80"}`}>
                <input type="radio" name="enquiry" value={val} checked={v.enquiry === val} onChange={() => set("enquiry", val)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className={heading || enquiryChoice ? "mt-6" : ""}>
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">About you</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field id="rif-parent_name" label="Your full name" error={errors.parent_name}>
            <input id="rif-parent_name" name="parent_name" type="text" autoComplete="name" maxLength={120} value={v.parent_name} onChange={(e) => set("parent_name", e.target.value)} aria-invalid={!!errors.parent_name || undefined} aria-describedby={describe("parent_name")} className={`mt-1 ${inputBase}`} />
          </Field>
          <Field id="rif-email" label="Email address" error={errors.email}>
            <input id="rif-email" name="email" type="email" autoComplete="email" maxLength={254} value={v.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby={describe("email")} className={`mt-1 ${inputBase}`} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="rif-phone" label="Contact number" error={errors.phone}>
              <PhoneInput id="rif-phone" name="phone" value={v.phone} onChange={(x) => set("phone", x)} invalid={!!errors.phone} describedBy={describe("phone")} disabled={busy} inputClassName={inputBase} />
            </Field>
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{v.enquiry === "interest" ? "Your child" : "Your message"}</legend>
        <div className="mt-3 grid gap-4">
          {v.enquiry === "interest" && (
          <Field id="rif-yeargroup" label="Year group applying for" error={errors.yeargroup}>
            <Select
              id="rif-yeargroup"
              name="yeargroup"
              value={v.yeargroup}
              onChange={(e) => set("yeargroup", e.target.value)}
              invalid={!!errors.yeargroup}
              aria-describedby={describe("yeargroup")}
              placeholder="Choose a year group"
              wrapperClassName="mt-1"
              className="rounded-lg border border-gold-light/60 px-3 py-2"
            >
              {YEAR_GROUP_OPTIONS.map((y) => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </Select>
          </Field>
          )}
          <Field id="rif-message" label={v.enquiry === "interest" ? "Anything you'd like to ask?" : "Your question"} optional={v.enquiry === "interest"} error={errors.message}>
            <textarea id="rif-message" name="message" rows={3} maxLength={2000} value={v.message} onChange={(e) => set("message", e.target.value)} aria-invalid={!!errors.message || undefined} aria-describedby={describe("message")} className={`mt-1 ${inputBase}`} />
          </Field>
        </div>
      </fieldset>

      <div className="mt-5">
        <label className="flex items-start gap-2 text-sm text-ink/80">
          <input id="rif-consent" type="checkbox" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={!!errors.consent || undefined} aria-describedby={describe("consent")} className="mt-1" />
          I&apos;m happy for Tarbiyyah Global Academy to contact me about this registration.
        </label>
        {errors.consent && <p id="rif-consent-err" role="alert" className="mt-1 text-sm text-red-700">{errors.consent}</p>}
      </div>

      {/* Honeypot: off-screen (not display:none), skipped by keyboard and
          assistive tech. Bots that fill every field trip it; register.php
          rejects any submission where it's non-empty. */}
      <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-hidden="true">
        <label>
          Leave this field blank
          <input type="text" name="company" tabIndex={-1} autoComplete="off" value={v.company} onChange={(e) => set("company", e.target.value)} />
        </label>
      </div>

      {errorCount > 0 && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          Please fix the {errorCount === 1 ? "problem" : `${errorCount} problems`} marked above.
        </p>
      )}

      <button type="submit" disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
        {busy ? "Sending…" : v.enquiry === "interest" ? "Register interest" : "Send message"}
        {!busy && <Icon name="arrowRight" size="sm" className="h-4 w-4" />}
      </button>
      {status === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Something went wrong. Please try again, or email{" "}
          <a href={`mailto:${ROLE_EMAILS.admissions}`} className="underline">{ROLE_EMAILS.admissions}</a> directly.
        </p>
      )}
    </form>
  );
}
