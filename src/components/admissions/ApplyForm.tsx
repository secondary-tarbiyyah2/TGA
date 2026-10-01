"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  DOCUMENTS_BUCKET,
  DOCUMENT_ACCEPT,
  DOCUMENT_CONTENT_TYPES,
  GENDER_OPTIONS,
  MAX_ID_FILES,
  MAX_REPORT_BYTES,
  MAX_REPORT_FILES,
  PAYMENT_PLAN_OPTIONS,
  YEAR_GROUP_OPTIONS,
  admissionsProcessSteps,
  documentExtension,
  suggestYearGroup,
  type DocumentKind,
} from "@/components/admissions/applicationShared";
import { formatGBP } from "@/lib/format";

type TextKey =
  | "parentName" | "parentEmail" | "parentPhone" | "relationship" | "address"
  | "childFirstName" | "childLastName" | "childDob" | "childGender"
  | "yearGroup" | "preferredStart" | "currentSchool" | "currentSchoolYear"
  | "islamicEducation" | "sendNotes" | "howHeard" | "siblingDetails" | "declarationName" | "website" | "paymentPlan";
type BoolKey = "sibling" | "consentContact" | "consentData";
type Values = Record<TextKey, string> & Record<BoolKey, boolean>;
type Errors = Partial<Record<TextKey | BoolKey, string>>;
type Phase = "loading" | "closed" | "open" | "submitting" | "success";
type FileErrors = Partial<Record<DocumentKind, string>>;
type SiblingApplicant = { name: string; yearGroup: string };

const STEP_TITLES = ["About you and your child", "Documents", "Plan and declaration"] as const;
const STEP_FIELDS: (TextKey | BoolKey)[][] = [
  ["parentName", "parentEmail", "parentPhone", "childFirstName", "childLastName", "childDob", "childGender", "yearGroup"],
  [],
  ["paymentPlan", "consentContact", "consentData", "declarationName"],
];
const KIND_LIMITS: Record<DocumentKind, number> = { report: MAX_REPORT_FILES, parent_id: MAX_ID_FILES, child_id: MAX_ID_FILES };

const INITIAL: Values = {
  parentName: "", parentEmail: "", parentPhone: "", relationship: "", address: "",
  childFirstName: "", childLastName: "", childDob: "", childGender: "",
  yearGroup: "", preferredStart: "", currentSchool: "", currentSchoolYear: "",
  islamicEducation: "", sendNotes: "", howHeard: "", siblingDetails: "", declarationName: "", website: "", paymentPlan: "",
  sibling: false, consentContact: false, consentData: false,
};

// Display order, used to focus the first problem.
const FIELD_ORDER: (TextKey | BoolKey)[] = [
  "parentName", "parentEmail", "parentPhone", "childFirstName", "childLastName", "childDob", "childGender",
  "yearGroup", "consentContact", "consentData", "declarationName",
];

const inputCls = "mt-1 w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-ink disabled:opacity-60 aria-[invalid=true]:border-red-600";

function validate(v: Values, step?: number): Errors {
  const all = validateAll(v);
  if (step == null) return all;
  const e: Errors = {};
  for (const k of STEP_FIELDS[step]) if (all[k]) e[k] = all[k];
  return e;
}

function validateAll(v: Values): Errors {
  const e: Errors = {};
  if (!v.parentName.trim()) e.parentName = "Please enter your full name.";
  if (!v.parentEmail.trim()) e.parentEmail = "Please enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.parentEmail.trim())) e.parentEmail = "That doesn't look like an email address. It should look like name@example.com.";
  if (!v.parentPhone.trim()) e.parentPhone = "Please enter a phone number we can reach you on.";
  else if (v.parentPhone.replace(/\D/g, "").length < 7) e.parentPhone = "That phone number looks too short. Please include the full number with its country code if outside the UK.";
  if (!v.childFirstName.trim()) e.childFirstName = "Please enter your child's first name.";
  if (!v.childLastName.trim()) e.childLastName = "Please enter your child's last name.";
  if (!v.childDob) e.childDob = "Please enter your child's date of birth.";
  else {
    const d = new Date(v.childDob);
    const now = new Date();
    const oldest = new Date(now.getFullYear() - 19, now.getMonth(), now.getDate());
    if (Number.isNaN(d.getTime())) e.childDob = "That date doesn't look right. Please check it.";
    else if (d > now) e.childDob = "The date of birth can't be in the future.";
    else if (d < oldest) e.childDob = "That date of birth looks too long ago. Please check the year.";
  }
  if (v.childGender !== "Male" && v.childGender !== "Female") e.childGender = "Please choose Male or Female.";
  if (!v.yearGroup) e.yearGroup = "Please choose the year group you are applying for.";
  if (v.paymentPlan !== "annual" && v.paymentPlan !== "termly" && v.paymentPlan !== "monthly") e.paymentPlan = "Please choose the payment plan you expect to use. You can change it later.";
  if (!v.consentContact) e.consentContact = "Please tick the box to say we may contact you about this application.";
  if (!v.consentData) e.consentData = "Please tick the box to agree to us using your information for this application.";
  if (!v.declarationName.trim()) e.declarationName = "Please type your full name to confirm the declaration.";
  return e;
}

function nullIfEmpty(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function Field({ id, label, optional, error, hint, children }: { id: string; label: string; optional?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-ink/70">(optional)</span>}
      </label>
      {hint && <p id={`h-${id}`} className="text-xs text-ink/70">{hint}</p>}
      {children}
      {error && <p id={`e-${id}`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8">
      <legend className="px-2 font-serif text-xl font-semibold text-ink">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ApplyForm({ admissionsEmail, applicationFee, registrationFee }: { admissionsEmail: string; applicationFee?: number; registrationFee?: number }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Record<DocumentKind, File[]>>({ report: [], parent_id: [], child_id: [] });
  const [fileErrors, setFileErrors] = useState<FileErrors>({});
  const [failedKinds, setFailedKinds] = useState<DocumentKind[]>([]);
  const [childrenCount, setChildrenCount] = useState(1);
  const [siblingApplicants, setSiblingApplicants] = useState<SiblingApplicant[]>([]);
  // Once the family picks a year group themselves we stop overwriting it.
  const [yearTouched, setYearTouched] = useState(false);
  const suggestion = suggestYearGroup(values.childDob, values.preferredStart);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- whether Supabase is configured is only known post-mount
      setPhase("open");
      return;
    }
    supabase
      .from("site_settings")
      .select("accepting_applications")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { accepting_applications: boolean | null } | null;
        setPhase(row && row.accepting_applications === false ? "closed" : "open");
      });
  }, []);

  function setText(k: TextKey, val: string) {
    setValues((v) => {
      const next = { ...v, [k]: val };
      if ((k === "childDob" || k === "preferredStart") && !yearTouched) {
        const sg = suggestYearGroup(next.childDob, next.preferredStart);
        if (sg) next.yearGroup = sg.yearGroup;
      }
      return next;
    });
    if (k === "yearGroup") setYearTouched(true);
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  }
  function setBool(k: BoolKey, val: boolean) {
    setValues((v) => ({ ...v, [k]: val }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  }

  const busy = phase === "submitting";
  const props = (k: TextKey) => ({
    id: `f-${k}`,
    name: k,
    value: values[k],
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setText(k, e.target.value),
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `e-f-${k}` : undefined,
  });

  function addFiles(kind: DocumentKind, list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const bad = incoming.find((f) => documentExtension(f) === null);
    if (bad) return setFileErrors((e) => ({ ...e, [kind]: `"${bad.name}" is not a PDF, JPG or PNG. Please upload one of those types.` }));
    const big = incoming.find((f) => f.size > MAX_REPORT_BYTES);
    if (big) return setFileErrors((e) => ({ ...e, [kind]: `"${big.name}" is larger than 10 MB. Please upload a smaller file.` }));
    if (docs[kind].length + incoming.length > KIND_LIMITS[kind]) return setFileErrors((e) => ({ ...e, [kind]: `You can upload up to ${KIND_LIMITS[kind]} files here.` }));
    setFileErrors((e) => ({ ...e, [kind]: undefined }));
    setDocs((d) => ({ ...d, [kind]: [...d[kind], ...incoming] }));
  }

  function setChildren(n: number) {
    const count = Math.max(1, Math.min(6, n));
    setChildrenCount(count);
    setSiblingApplicants((list) => Array.from({ length: count - 1 }, (_, i) => list[i] ?? { name: "", yearGroup: "" }));
  }
  function setSibling(i: number, patch: Partial<SiblingApplicant>) {
    setSiblingApplicants((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  /** Step 2 (documents): parent and child ID are required up front. */
  function validateDocs(): FileErrors {
    const e: FileErrors = {};
    if (docs.parent_id.length === 0) e.parent_id = "Please upload photo ID for a parent or guardian.";
    if (docs.child_id.length === 0) e.child_id = "Please upload your child's passport or birth certificate.";
    return e;
  }

  function goNext() {
    const found = validate(values, step);
    const fe = step === 1 ? validateDocs() : {};
    setErrors((er) => ({ ...er, ...found }));
    if (step === 1) setFileErrors((f) => ({ ...f, ...fe }));
    const first = STEP_FIELDS[step].find((k) => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#f-${first}`)?.focus();
      return;
    }
    const firstDoc = (["parent_id", "child_id"] as DocumentKind[]).find((k) => fe[k]);
    if (firstDoc) {
      formRef.current?.querySelector<HTMLElement>(`#f-doc-${firstDoc}`)?.focus();
      return;
    }
    setStep(step + 1);
    formRef.current?.scrollIntoView({ block: "start" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (step < STEP_TITLES.length - 1) return goNext();
    setSubmitError(false);
    const found = validate(values);
    setErrors(found);
    const docErr = validateDocs();
    setFileErrors((f) => ({ ...f, ...docErr }));
    // Send the family back to the step holding the first problem.
    if (STEP_FIELDS[0].some((k) => found[k])) return setStep(0);
    if (docErr.parent_id || docErr.child_id) return setStep(1);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#f-${first}`)?.focus();
      return;
    }
    // Honeypot: bots fill the hidden field. Pretend it worked, send nothing.
    if (values.website.trim() !== "") {
      setPhase("success");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSubmitError(true);
      return;
    }
    setPhase("submitting");
    // Anon can't read the row back, so the id is generated here and the
    // insert deliberately doesn't ask for the row back (no .select()).
    const applicationId = crypto.randomUUID();
    const { error } = await supabase.from("admissions_applications").insert({
      id: applicationId,
      parent_name: values.parentName.trim(),
      parent_email: values.parentEmail.trim(),
      parent_phone: values.parentPhone.trim(),
      relationship: nullIfEmpty(values.relationship),
      address: nullIfEmpty(values.address),
      child_first_name: values.childFirstName.trim(),
      child_last_name: values.childLastName.trim(),
      child_dob: values.childDob,
      child_gender: values.childGender,
      year_group_applying: values.yearGroup,
      preferred_start: nullIfEmpty(values.preferredStart),
      current_school: nullIfEmpty(values.currentSchool),
      current_school_year: nullIfEmpty(values.currentSchoolYear),
      previous_islamic_education: nullIfEmpty(values.islamicEducation),
      send_or_medical_notes: nullIfEmpty(values.sendNotes),
      how_heard: nullIfEmpty(values.howHeard),
      sibling_at_tarbiyyah: values.sibling,
      sibling_details: values.sibling ? nullIfEmpty(values.siblingDetails) : null,
      payment_plan_intent: values.paymentPlan,
      children_applying: childrenCount,
      sibling_applicants: siblingApplicants
        .map((s) => ({ name: s.name.trim(), year_group: s.yearGroup }))
        .filter((s) => s.name !== "" || s.year_group !== ""),
      consent_contact: values.consentContact,
      consent_data: values.consentData,
      declaration_name: values.declarationName.trim(),
    });
    if (error) {
      setPhase("open");
      setSubmitError(true);
      return;
    }
    // Documents go in after the application exists: storage only accepts
    // uploads for an application created in the last hour (migration 0041/0060).
    // File names carry the document kind: <application_id>/<kind>-<uuid>.<ext>.
    const failed: DocumentKind[] = [];
    for (const kind of Object.keys(docs) as DocumentKind[]) {
      for (const f of docs[kind]) {
        const ext = documentExtension(f);
        if (!ext) continue;
        const { error: upErr } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(`${applicationId}/${kind}-${crypto.randomUUID()}.${ext}`, f, { contentType: DOCUMENT_CONTENT_TYPES[ext], upsert: false });
        if (upErr && !failed.includes(kind)) failed.push(kind);
      }
    }
    setFailedKinds(failed);
    setPhase("success");
  }

  if (phase === "loading") {
    return <p role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center text-ink/70">Loading the application form…</p>;
  }

  if (phase === "closed") {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <h3 className="font-serif text-xl font-semibold text-ink">Applications are closed for now.</h3>
        <p className="mt-2 text-ink/70">
          We aren&apos;t taking new applications at the moment. Please email{" "}
          <a href={`mailto:${admissionsEmail}`} className="font-semibold text-gold-700 underline">{admissionsEmail}</a>{" "}
          and we&apos;ll let you know when they reopen, or <Link href="/book-a-call" className="font-semibold text-gold-700 underline">book a call</Link> with our admissions team.
        </p>
      </div>
    );
  }

  if (phase === "success") {
    const processSteps = admissionsProcessSteps({ applicationFee, registrationFee });
    const uploadNote = failedKinds.length > 0
      ? `Your application was sent, but we couldn't upload some documents. Please email them to ${admissionsEmail}.`
      : "Thank you for uploading your documents. We will tell you if we need anything else.";
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8">
        <h3 className="text-center font-serif text-xl font-semibold text-ink">Application received. Thank you.</h3>
        <p className="mt-2 text-center text-sm text-ink/70">
          You do not need to pay anything now. Here is what happens next.
        </p>
        <ol className="mt-6 space-y-4 border-l-2 border-gold-light/70 pl-5">
          {processSteps.map((st, i) => (
            <li key={st.title} className="relative">
              <span aria-hidden="true" className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ${i === 0 ? "bg-gold-500" : "bg-gold-light"}`} />
              <p className="text-sm font-medium text-ink">{i + 1}. {i === 0 ? "Apply: done" : st.title}</p>
              <p className="text-sm text-ink/70">
                {i === 0 ? uploadNote : st.body}
                {i === 3 && " Interviews are held by video call."}
              </p>
            </li>
          ))}
        </ol>
        {values.paymentPlan && (
          <p className="mt-6 rounded-lg bg-cream px-3 py-2 text-sm text-ink/80">
            You told us you expect to pay <strong>{values.paymentPlan}</strong>
            {childrenCount > 1 ? ` for ${childrenCount} children` : ""}. You can still change this before you accept an offer.
            {registrationFee != null && ` The registration fee is ${formatGBP(registrationFee)} per child.`}
          </p>
        )}
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length + Object.values(fileErrors).filter(Boolean).length;

  function renderDocPicker({ kind, label, hint, optional }: { kind: DocumentKind; label: string; hint: string; optional?: boolean }) {
    const list = docs[kind];
    const err = fileErrors[kind];
    return (
      <div>
        <Field id={`f-doc-${kind}`} label={label} optional={optional} hint={hint} error={err}>
          <input
            id={`f-doc-${kind}`}
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            disabled={busy || list.length >= KIND_LIMITS[kind]}
            onChange={(e) => {
              addFiles(kind, e.target.files);
              e.target.value = "";
            }}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `e-f-doc-${kind}` : `h-f-doc-${kind}`}
            className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-cream file:px-3 file:py-1 file:text-sm`}
          />
        </Field>
        {list.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-ink/80">
            {list.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-cream px-3 py-1.5">
                <span className="truncate">{f.name} <span className="text-ink/50">({(f.size / 1048576).toFixed(1)} MB)</span></span>
                <button type="button" disabled={busy} onClick={() => setDocs((d) => ({ ...d, [kind]: d[kind].filter((_, j) => j !== i) }))} className="shrink-0 font-semibold text-gold-700 underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="relative space-y-6" aria-busy={busy}>
      {/* Honeypot: off-screen (not display:none), skipped by keyboard and assistive tech. */}
      <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-hidden="true">
        <label>
          Leave this field blank
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => setText("website", e.target.value)} />
        </label>
      </div>

      <nav aria-label="Application steps">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEP_TITLES.map((t, i) => (
            <li
              key={t}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 font-medium ${i === step ? "bg-gold-500 text-ink-900" : i < step ? "bg-cream text-ink" : "bg-white text-ink/60 ring-1 ring-gold-light/50"}`}
            >
              {i + 1}. {t}
            </li>
          ))}
        </ol>
      </nav>

      {step === 0 && (<>
      <Section title="Parent or guardian">
        <Field id="f-parentName" label="Full name" error={errors.parentName}>
          <input {...props("parentName")} type="text" autoComplete="name" maxLength={120} className={inputCls} />
        </Field>
        <Field id="f-relationship" label="Relationship to the child" optional>
          <input {...props("relationship")} type="text" maxLength={60} placeholder="e.g. Mother, Father, Guardian" className={inputCls} />
        </Field>
        <Field id="f-parentEmail" label="Email address" error={errors.parentEmail}>
          <input {...props("parentEmail")} type="email" autoComplete="email" maxLength={254} className={inputCls} />
        </Field>
        <Field id="f-parentPhone" label="Phone number" error={errors.parentPhone}>
          <input {...props("parentPhone")} type="tel" autoComplete="tel" maxLength={40} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="f-address" label="Home address" optional>
            <textarea {...props("address")} rows={2} maxLength={500} autoComplete="street-address" className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Your child">
        <Field id="f-childFirstName" label="First name" error={errors.childFirstName}>
          <input {...props("childFirstName")} type="text" autoComplete="off" maxLength={80} className={inputCls} />
        </Field>
        <Field id="f-childLastName" label="Last name" error={errors.childLastName}>
          <input {...props("childLastName")} type="text" autoComplete="off" maxLength={80} className={inputCls} />
        </Field>
        <Field id="f-childDob" label="Date of birth" error={errors.childDob}>
          <input {...props("childDob")} type="date" className={inputCls} />
        </Field>
        <div role="radiogroup" aria-labelledby="l-childGender" aria-describedby={errors.childGender ? "e-f-childGender" : undefined}>
          <p id="l-childGender" className="block text-sm font-medium text-ink">Gender</p>
          <div className="mt-2 flex gap-6">
            {GENDER_OPTIONS.map((g, i) => (
              <label key={g} className="flex items-center gap-2 text-ink">
                <input
                  id={i === 0 ? "f-childGender" : undefined}
                  type="radio"
                  name="childGender"
                  value={g}
                  checked={values.childGender === g}
                  disabled={busy}
                  onChange={() => setText("childGender", g)}
                />
                {g}
              </label>
            ))}
          </div>
          {errors.childGender && <p id="e-f-childGender" role="alert" className="mt-1 text-sm text-red-700">{errors.childGender}</p>}
        </div>
        <Field id="f-yearGroup" label="Year group applying for" error={errors.yearGroup}>
          <select {...props("yearGroup")} className={inputCls}>
            <option value="">Select a year group</option>
            {YEAR_GROUP_OPTIONS.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </Field>
        {suggestion && (
          <p role="status" className="rounded-lg bg-cream px-3 py-2 text-sm text-ink sm:col-span-2">
            Suggested year group: <strong className="text-base">{suggestion.yearGroup}</strong>{" "}
            <span className="text-ink/70">(age {suggestion.ageAtEntry} on 31 August {suggestion.entryYear}).</span>{" "}
            {values.yearGroup !== suggestion.yearGroup ? (
              <button
                type="button"
                onClick={() => {
                  setYearTouched(false);
                  setText("yearGroup", suggestion.yearGroup);
                  setYearTouched(false);
                }}
                className="font-semibold text-gold-700 underline"
              >
                Use this
              </button>
            ) : (
              <span className="text-ink/70">You can change it above if it isn&apos;t right.</span>
            )}
          </p>
        )}
        <Field id="f-preferredStart" label="Preferred start" optional>
          <input {...props("preferredStart")} type="text" maxLength={120} placeholder="e.g. January 2027" className={inputCls} />
        </Field>
      </Section>

      </>)}

      {step === 1 && (<>
      <Section title="Education so far">
        <Field id="f-currentSchool" label="Current school" optional>
          <input {...props("currentSchool")} type="text" maxLength={200} className={inputCls} />
        </Field>
        <Field id="f-currentSchoolYear" label="Current year group" optional>
          <input {...props("currentSchoolYear")} type="text" maxLength={60} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          {renderDocPicker({ kind: "report", label: "Latest school report(s)", optional: true, hint: `PDF, JPG or PNG, up to ${MAX_REPORT_FILES} files, 10 MB each. You can also email them to ${admissionsEmail}.` })}
        </div>
        <div className="sm:col-span-2">
          <Field id="f-islamicEducation" label="Previous Islamic education" optional hint="For example Qur'an level, any hifz, and Arabic.">
            <textarea {...props("islamicEducation")} rows={3} maxLength={1500} aria-describedby={errors.islamicEducation ? "e-f-islamicEducation" : "h-f-islamicEducation"} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Identity documents">
        <p className="text-sm text-ink/70 sm:col-span-2">
          Admissions is a safeguarding process, so we verify the identity of the adults with parental responsibility and of your child. Files are stored privately and only admissions staff can open them. We will ask for proof of address and any other documents later, if needed.
        </p>
        <div className="sm:col-span-2">
          {renderDocPicker({ kind: "parent_id", label: "Photo ID for a parent or guardian", hint: `Passport, driving licence or national ID card. PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each.` })}
        </div>
        <div className="sm:col-span-2">
          {renderDocPicker({ kind: "child_id", label: "Your child's passport or birth certificate", hint: `PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each.` })}
        </div>
      </Section>
      </>)}

      {step === 2 && (<>
      <Section title="Anything we should know">
        <div className="sm:col-span-2">
          <Field id="f-sendNotes" label="Special educational needs, medical needs or anything else we should know" optional hint="This helps us prepare the right support. Share only what you are comfortable with.">
            <textarea {...props("sendNotes")} rows={4} maxLength={3000} aria-describedby={errors.sendNotes ? "e-f-sendNotes" : "h-f-sendNotes"} className={inputCls} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field id="f-howHeard" label="How did you hear about us?" optional>
            <input {...props("howHeard")} type="text" maxLength={300} className={inputCls} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              name="sibling"
              checked={values.sibling}
              disabled={busy}
              onChange={(e) => setBool("sibling", e.target.checked)}
              className="mt-1"
            />
            Another child in our family attends a Tarbiyyah school
          </label>
        </div>
        {values.sibling && (
          <div className="sm:col-span-2">
            <Field id="f-siblingDetails" label="Which child and which school?" optional>
              <input {...props("siblingDetails")} type="text" maxLength={500} className={inputCls} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Fees and siblings">
        <Field id="f-paymentPlan" label="Payment plan you expect to use" error={errors.paymentPlan} hint="Annual, termly or monthly. This is only your intention; you confirm it when you accept an offer.">
          <select {...props("paymentPlan")} className={inputCls}>
            <option value="">Select a plan</option>
            {PAYMENT_PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field id="f-childrenCount" label="Number of children applying together" hint="Including this child. Siblings may qualify for a discount.">
          <select id="f-childrenCount" value={childrenCount} disabled={busy} onChange={(e) => setChildren(Number(e.target.value))} className={inputCls}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        {siblingApplicants.map((sib, i) => (
          <div key={i} className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <Field id={`f-sibName-${i}`} label={`Child ${i + 2}: full name`}>
              <input id={`f-sibName-${i}`} type="text" value={sib.name} maxLength={120} disabled={busy} onChange={(e) => setSibling(i, { name: e.target.value })} className={inputCls} />
            </Field>
            <Field id={`f-sibYear-${i}`} label={`Child ${i + 2}: year group applying for`}>
              <select id={`f-sibYear-${i}`} value={sib.yearGroup} disabled={busy} onChange={(e) => setSibling(i, { yearGroup: e.target.value })} className={inputCls}>
                <option value="">Select a year group</option>
                {YEAR_GROUP_OPTIONS.map((y) => (
                  <option key={y.value} value={y.value}>{y.label}</option>
                ))}
              </select>
            </Field>
          </div>
        ))}
        {childrenCount > 1 && (
          <p className="text-sm text-ink/70 sm:col-span-2">
            Each child needs their own application form, so please submit one for each child. Telling us the names here lets us link them and apply any sibling discount.
          </p>
        )}
      </Section>

      <Section title="Consent and declaration">
        <div className="space-y-3 sm:col-span-2">
          <div>
            <label className="flex items-start gap-2 text-sm text-ink/80">
              <input
                id="f-consentContact"
                type="checkbox"
                name="consentContact"
                checked={values.consentContact}
                disabled={busy}
                onChange={(e) => setBool("consentContact", e.target.checked)}
                aria-invalid={errors.consentContact ? true : undefined}
                aria-describedby={errors.consentContact ? "e-f-consentContact" : undefined}
                className="mt-1"
              />
              I agree that Tarbiyyah Global Academy may contact me about this application.
            </label>
            {errors.consentContact && <p id="e-f-consentContact" role="alert" className="mt-1 text-sm text-red-700">{errors.consentContact}</p>}
          </div>
          <div>
            <label className="flex items-start gap-2 text-sm text-ink/80">
              <input
                id="f-consentData"
                type="checkbox"
                name="consentData"
                checked={values.consentData}
                disabled={busy}
                onChange={(e) => setBool("consentData", e.target.checked)}
                aria-invalid={errors.consentData ? true : undefined}
                aria-describedby={errors.consentData ? "e-f-consentData" : undefined}
                className="mt-1"
              />
              <span>
                I agree to my and my child&apos;s information being used to process this application, as explained in the{" "}
                <Link href="/legal/privacy" target="_blank" className="font-semibold text-gold-700 underline">privacy policy</Link>.
              </span>
            </label>
            {errors.consentData && <p id="e-f-consentData" role="alert" className="mt-1 text-sm text-red-700">{errors.consentData}</p>}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field id="f-declarationName" label="Type your full name to confirm" hint="I confirm that the information given is true to the best of my knowledge." error={errors.declarationName}>
            <input
              {...props("declarationName")}
              type="text"
              maxLength={120}
              aria-describedby={errors.declarationName ? "e-f-declarationName" : "h-f-declarationName"}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {errorCount > 0 && (
        <p role="alert" className="text-sm font-medium text-red-700">
          Please fix the {errorCount === 1 ? "problem" : `${errorCount} problems`} marked above and continue.
        </p>
      )}
      {submitError && (
        <p role="alert" className="text-sm text-red-700">
          Something went wrong sending your application, so nothing has been submitted. Please try again, or email{" "}
          <a href={`mailto:${admissionsEmail}`} className="underline">{admissionsEmail}</a> directly.
        </p>
      )}

      </>)}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(step - 1)}
            className="rounded-full border border-gold-light/70 bg-white px-6 py-3 text-sm font-semibold text-ink disabled:opacity-60"
          >
            Back
          </button>
        )}
        {step < STEP_TITLES.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95"
          >
            Next: {STEP_TITLES[step + 1]}
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Submit application"}
          </button>
        )}
      </div>
    </form>
  );
}
