"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";
import { AdmissionsTimeline } from "@/components/admissions/AdmissionsSteps";
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
  addressOneLine,
  admissionsProcessSteps,
  documentExtension,
  postcodeOptionalFor,
  suggestYearGroup,
  type DocumentKind,
} from "@/components/admissions/applicationShared";
import { COUNTRIES } from "@/lib/countries";
import { bandForYearGroup } from "@/components/learn/admissions/paymentCalc";
import type { FeeBand } from "@/content/seed";
import { FEE_DEFAULTS, FEE_POLICY_DEFAULTS, estimateFamilyFees, type FamilyEstimate, type PaymentPlan } from "@/lib/fees";
import { formatGBP } from "@/lib/format";

// ── types ────────────────────────────────────────────────────────────────

/** Fields about the family (entered once, whatever the number of children). */
type ParentKey =
  | "parentName" | "parentEmail" | "parentPhone" | "relationship" | "preferredStart" | "howHeard"
  | "addressLine1" | "addressLine2" | "addressTown" | "addressPostcode" | "addressCountry"
  | "siblingDetails" | "declarationName" | "website" | "paymentPlan";
type BoolKey = "sibling" | "consentContact" | "consentData";
type Values = Record<ParentKey, string> & Record<BoolKey, boolean>;

type ChildDocKind = "report" | "child_id" | "guardian_id";
/** One card per child: everything that differs between children lives here. */
type ChildForm = {
  key: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  yearGroup: string;
  /** Once the family picks a year group themselves we stop overwriting it. */
  yearTouched: boolean;
  currentSchool: string;
  currentSchoolYear: string;
  islamicEducation: string;
  sendNotes: string;
  /** This child's legal parent or guardian is someone other than the contact above. */
  otherGuardian: boolean;
  guardianName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianAddress: string;
  docs: Record<ChildDocKind, File[]>;
};
type ChildTextKey =
  | "firstName" | "lastName" | "dob" | "gender" | "yearGroup" | "currentSchool" | "currentSchoolYear" | "islamicEducation" | "sendNotes"
  | "guardianName" | "guardianRelationship" | "guardianEmail" | "guardianPhone" | "guardianAddress";

/** Keys: a parent field ("parentName"), a document ("doc-parent_id"), or a child field ("c0-firstName", "c0-doc-child_id"). The element id is "f-" + key. */
type Errors = Record<string, string | undefined>;
type Phase = "loading" | "closed" | "open" | "submitting" | "success";

const MAX_CHILDREN = 6;
const STEP_TITLES = ["About you", "Your children", "Fees and declaration"] as const;
const CHILD_LIMITS: Record<ChildDocKind, number> = { report: MAX_REPORT_FILES, child_id: MAX_ID_FILES, guardian_id: MAX_ID_FILES };

const INITIAL: Values = {
  parentName: "", parentEmail: "", parentPhone: "", relationship: "", preferredStart: "", howHeard: "",
  addressLine1: "", addressLine2: "", addressTown: "", addressPostcode: "", addressCountry: "",
  siblingDetails: "", declarationName: "", website: "", paymentPlan: "",
  sibling: false, consentContact: false, consentData: false,
};

function blankChild(key: string): ChildForm {
  return {
    key,
    firstName: "", lastName: "", dob: "", gender: "", yearGroup: "", yearTouched: false,
    currentSchool: "", currentSchoolYear: "", islamicEducation: "", sendNotes: "",
    otherGuardian: false, guardianName: "", guardianRelationship: "", guardianEmail: "", guardianPhone: "", guardianAddress: "",
    docs: { report: [], child_id: [], guardian_id: [] },
  };
}

const inputCls = "mt-1 w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-ink disabled:opacity-60 aria-[invalid=true]:border-red-600";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── validation ───────────────────────────────────────────────────────────

function dobError(dob: string): string | undefined {
  if (!dob) return "Please enter the date of birth.";
  const d = new Date(dob);
  const now = new Date();
  const oldest = new Date(now.getFullYear() - 19, now.getMonth(), now.getDate());
  if (Number.isNaN(d.getTime())) return "That date doesn't look right. Please check it.";
  if (d > now) return "The date of birth can't be in the future.";
  if (d < oldest) return "That date of birth looks too long ago. Please check the year.";
  return undefined;
}

function phoneError(phone: string, who: string): string | undefined {
  if (!phone.trim()) return `Please enter a phone number we can reach ${who} on.`;
  if (phone.replace(/\D/g, "").length < 7) return "That phone number looks too short. Please include the full number with its country code if outside the UK.";
  return undefined;
}

function postcodeError(postcode: string, country: string): string | undefined {
  if (postcode.trim() || postcodeOptionalFor(country)) return undefined;
  return "Please enter the postcode or ZIP code. If there is no postcode where you live, type \"None\".";
}

function validateStep(step: number, v: Values, kids: ChildForm[], parentIds: File[]): Errors {
  const e: Errors = {};
  const put = (k: string, msg: string | undefined) => {
    if (msg) e[k] = msg;
  };
  if (step === 0) {
    put("parentName", v.parentName.trim() ? undefined : "Please enter your full name.");
    if (!v.parentEmail.trim()) put("parentEmail", "Please enter your email address.");
    else if (!EMAIL_RE.test(v.parentEmail.trim())) put("parentEmail", "That doesn't look like an email address. It should look like name@example.com.");
    put("parentPhone", phoneError(v.parentPhone, "you"));
    put("addressCountry", v.addressCountry.trim() ? undefined : "Please enter the country your child lives in.");
    put("addressLine1", v.addressLine1.trim() ? undefined : "Please enter the first line of your child's home address.");
    put("addressTown", v.addressTown.trim() ? undefined : "Please enter the town or city.");
    put("addressPostcode", postcodeError(v.addressPostcode, v.addressCountry));
    put("doc-parent_id", parentIds.length === 0 ? "Please upload photo ID for a parent or guardian." : undefined);
  }
  if (step === 1) {
    kids.forEach((k, i) => {
      const p = `c${i}-`;
      put(`${p}firstName`, k.firstName.trim() ? undefined : "Please enter your child's first name.");
      put(`${p}lastName`, k.lastName.trim() ? undefined : "Please enter your child's last name.");
      put(`${p}dob`, dobError(k.dob));
      put(`${p}gender`, k.gender === "Male" || k.gender === "Female" ? undefined : "Please choose Male or Female.");
      put(`${p}yearGroup`, k.yearGroup ? undefined : "Please choose the year group you are applying for.");
      put(`${p}doc-child_id`, k.docs.child_id.length === 0 ? "Please upload your child's passport or birth certificate." : undefined);
      if (k.otherGuardian) {
        put(`${p}guardianName`, k.guardianName.trim() ? undefined : "Please enter the legal parent or guardian's full name.");
        if (!k.guardianEmail.trim()) put(`${p}guardianEmail`, "Please enter their email address.");
        else if (!EMAIL_RE.test(k.guardianEmail.trim())) put(`${p}guardianEmail`, "That doesn't look like an email address. It should look like name@example.com.");
        put(`${p}guardianPhone`, phoneError(k.guardianPhone, "them"));
        put(`${p}doc-guardian_id`, k.docs.guardian_id.length === 0 ? "Please upload photo ID for this legal parent or guardian." : undefined);
      }
    });
  }
  if (step === 2) {
    if (v.paymentPlan !== "annual" && v.paymentPlan !== "termly" && v.paymentPlan !== "monthly") put("paymentPlan", "Please choose the payment plan you expect to use. You can change it later.");
    put("consentContact", v.consentContact ? undefined : "Please tick the box to say we may contact you about this application.");
    put("consentData", v.consentData ? undefined : "Please tick the box to agree to us using your information for this application.");
    put("declarationName", v.declarationName.trim() ? undefined : "Please type your full name to confirm the declaration.");
  }
  return e;
}

function nullIfEmpty(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** Returns a message when the new files can't be added to the existing ones, else null. */
function fileProblem(incoming: File[], existing: number, limit: number): string | null {
  const bad = incoming.find((f) => documentExtension(f) === null);
  if (bad) return `"${bad.name}" is not a PDF, JPG or PNG. Please upload one of those types.`;
  const big = incoming.find((f) => f.size > MAX_REPORT_BYTES);
  if (big) return `"${big.name}" is larger than 10 MB. Please upload a smaller file.`;
  if (existing + incoming.length > limit) return `You can upload up to ${limit} files here.`;
  return null;
}

// ── small presentational pieces ──────────────────────────────────────────

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

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8">
      <legend className="px-2 font-serif text-xl font-semibold text-ink">{title}</legend>
      {intro && <p className="mb-4 text-sm text-ink/70">{intro}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function DocPicker({
  id, label, hint, optional, files, limit, error, disabled, onAdd, onRemove,
}: {
  id: string; label: string; hint: string; optional?: boolean; files: File[]; limit: number; error?: string; disabled: boolean;
  onAdd: (list: FileList | null) => void; onRemove: (index: number) => void;
}) {
  return (
    <div>
      <Field id={id} label={label} optional={optional} hint={hint} error={error}>
        <input
          id={id}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          disabled={disabled || files.length >= limit}
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = "";
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `e-${id}` : `h-${id}`}
          className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-cream file:px-3 file:py-1 file:text-sm`}
        />
      </Field>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink/80">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-cream px-3 py-1.5">
              <span className="min-w-0 truncate">{f.name} <span className="text-ink/65">({(f.size / 1048576).toFixed(1)} MB)</span></span>
              <button type="button" disabled={disabled} onClick={() => onRemove(i)} className="shrink-0 font-semibold text-gold-700 underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function kidName(k: ChildForm, i: number): string {
  const n = `${k.firstName} ${k.lastName}`.trim();
  return n || `Child ${i + 1}`;
}

/** The per-child and total fee estimate, with the sibling discount shown line by line. */
function FeeSummary({
  estimate, kids, plan, siblingPercent, siblingNote, terms, instalments,
}: {
  estimate: FamilyEstimate; kids: ChildForm[]; plan: PaymentPlan | ""; siblingPercent: number; siblingNote?: string; terms: number; instalments: number;
}) {
  const many = kids.length > 1;
  const siblingTotal = estimate.perChild.reduce((s, c) => s + c.siblingDiscount, 0);
  const otherDiscounts = estimate.discounts.filter((d) => !d.label.startsWith("Sibling discount"));
  const unit = estimate.paymentUnit === "term" ? "term" : estimate.paymentUnit === "month" ? "month" : "year";
  const evenPayments = estimate.payments.every((p) => p === estimate.payments[0]);
  return (
    <div className="space-y-3 text-sm sm:col-span-2" aria-live="polite">
      <p className="text-ink/70">
        {many ? "Your children and their estimated fees for the year." : "Your estimated fees for the year."} This is an estimate; your offer confirms the exact figures. Nothing is charged on this form.
      </p>
      <ul className="divide-y divide-gold-light/40 rounded-xl border border-gold-light/50 bg-white">
        {estimate.perChild.map((c, i) => {
          const k = kids[i];
          return (
            <li key={k.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span className="min-w-0 break-words font-medium text-ink">
                {kidName(k, i)} <span className="font-normal text-ink/65">({k.yearGroup || "year group not chosen"})</span>
              </span>
              {c.gross <= 0 ? (
                <span className="text-ink/65">Fee to be confirmed</span>
              ) : (
                <span className="text-right text-ink">
                  {c.siblingDiscount > 0 ? (
                    <>
                      <span className="text-ink/65 line-through">{formatGBP(c.gross)}</span>{" "}
                      <span className="font-semibold">{formatGBP(c.net)}</span>
                      <span className="block text-xs text-teal-700">Sibling discount: {formatGBP(c.siblingDiscount)} off</span>
                    </>
                  ) : (
                    <span className="font-semibold">{formatGBP(c.gross)}</span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {many && siblingPercent <= 0 && <p className="text-ink/70">{siblingNote || "Siblings may qualify for a discount. We confirm it in your offer."}</p>}
      {many && siblingPercent > 0 && (
        <p className="rounded-lg bg-teal-100/60 px-3 py-2 text-ink">
          Sibling discount applied: {siblingPercent}% off from the second child onwards, {formatGBP(siblingTotal)} in total.
          {siblingNote ? ` ${siblingNote}` : ""}
        </p>
      )}
      <dl className="space-y-1 rounded-xl bg-cream px-4 py-3">
        {otherDiscounts.map((d) => (
          <div key={d.label} className="flex justify-between gap-4">
            <dt className="text-ink/80">{d.label}</dt>
            <dd className="text-ink">-{formatGBP(d.amountOff)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 font-semibold text-ink">
          <dt>Estimated tuition{plan === "annual" ? " (paid in full)" : ""}</dt>
          <dd>{formatGBP(estimate.total)}</dd>
        </div>
        {plan && estimate.payments.length > 1 && (
          <div className="flex justify-between gap-4 text-ink/80">
            <dt>{plan === "termly" ? `Paid in ${terms} payments` : `Paid in ${instalments} monthly payments`}</dt>
            <dd>{evenPayments ? `${formatGBP(estimate.payments[0])} per ${unit}` : `${formatGBP(estimate.payments[0])} per ${unit}, final ${formatGBP(estimate.payments[estimate.payments.length - 1])}`}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 text-ink/80">
          <dt>Application fee, if you proceed</dt>
          <dd>{formatGBP(estimate.applicationFeeTotal)}{many ? ` (${kids.length} children)` : ""}</dd>
        </div>
        <div className="flex justify-between gap-4 text-ink/80">
          <dt>Registration fee, if we offer a place</dt>
          <dd>{formatGBP(estimate.registrationFeeTotal)}{many ? ` (${kids.length} children)` : ""}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── the form ─────────────────────────────────────────────────────────────

export function ApplyForm({
  admissionsEmail,
  applicationFee,
  registrationFee,
  feeBands = [],
  siblingDiscountPercent,
  siblingDiscountNote,
  annualDiscountPercent,
  feeTerms,
  feeInstalments,
}: {
  admissionsEmail: string;
  applicationFee?: number;
  registrationFee?: number;
  feeBands?: FeeBand[];
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  annualDiscountPercent?: number;
  feeTerms?: number;
  feeInstalments?: number;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [values, setValues] = useState<Values>(INITIAL);
  const [kids, setKids] = useState<ChildForm[]>(() => [blankChild("kid-first")]);
  const [parentIds, setParentIds] = useState<File[]>([]);
  const [addressProofs, setAddressProofs] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState(false);
  const [step, setStep] = useState(0);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<{ names: string[]; email: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const busy = phase === "submitting";
  const clearError = (key: string) => setErrors((er) => (er[key] ? { ...er, [key]: undefined } : er));

  // ── family-level fields ──
  function setText(k: ParentKey, val: string) {
    setValues((v) => ({ ...v, [k]: val }));
    clearError(k);
    if (k === "preferredStart") {
      // A new start date can change the suggested year group of children the family hasn't set themselves.
      setKids((list) =>
        list.map((c) => {
          if (c.yearTouched) return c;
          const sg = suggestYearGroup(c.dob, val);
          return sg ? { ...c, yearGroup: sg.yearGroup } : c;
        }),
      );
    }
  }
  function setBool(k: BoolKey, val: boolean) {
    setValues((v) => ({ ...v, [k]: val }));
    clearError(k);
  }
  const props = (k: ParentKey) => ({
    id: `f-${k}`,
    name: k,
    value: values[k],
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setText(k, e.target.value),
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `e-f-${k}` : undefined,
  });

  // ── per-child fields ──
  function patchKid(i: number, patch: Partial<ChildForm>) {
    setKids((list) =>
      list.map((k, j) => {
        if (j !== i) return k;
        const next = { ...k, ...patch };
        if ("dob" in patch && !next.yearTouched) {
          const sg = suggestYearGroup(next.dob, values.preferredStart);
          if (sg) next.yearGroup = sg.yearGroup;
        }
        return next;
      }),
    );
  }
  function setKidText(i: number, k: ChildTextKey, val: string) {
    patchKid(i, k === "yearGroup" ? { yearGroup: val, yearTouched: true } : ({ [k]: val } as Partial<ChildForm>));
    clearError(`c${i}-${k}`);
  }
  const kidProps = (i: number, k: ChildTextKey) => ({
    id: `f-c${i}-${k}`,
    name: `c${i}-${k}`,
    value: kids[i][k],
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setKidText(i, k, e.target.value),
    "aria-invalid": errors[`c${i}-${k}`] ? true : undefined,
    "aria-describedby": errors[`c${i}-${k}`] ? `e-f-c${i}-${k}` : undefined,
  });
  function addKid() {
    setKids((list) => (list.length >= MAX_CHILDREN ? list : [...list, blankChild(crypto.randomUUID())]));
  }
  function removeKid(i: number) {
    setKids((list) => (list.length <= 1 ? list : list.filter((_, j) => j !== i)));
    // Error keys are positional, so drop the children's errors rather than show them against the wrong child.
    setErrors((er) => Object.fromEntries(Object.entries(er).filter(([key]) => !/^c\d+-/.test(key))));
  }

  // ── documents ──
  function addParentIds(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const problem = fileProblem(incoming, parentIds.length, MAX_ID_FILES);
    if (problem) return setErrors((er) => ({ ...er, "doc-parent_id": problem }));
    clearError("doc-parent_id");
    setParentIds((f) => [...f, ...incoming]);
  }
  function addAddressProofs(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const problem = fileProblem(incoming, addressProofs.length, MAX_ID_FILES);
    if (problem) return setErrors((er) => ({ ...er, "doc-address_proof": problem }));
    clearError("doc-address_proof");
    setAddressProofs((f) => [...f, ...incoming]);
  }
  function addKidFiles(i: number, kind: ChildDocKind, list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const problem = fileProblem(incoming, kids[i].docs[kind].length, CHILD_LIMITS[kind]);
    if (problem) return setErrors((er) => ({ ...er, [`c${i}-doc-${kind}`]: problem }));
    clearError(`c${i}-doc-${kind}`);
    setKids((l) => l.map((k, j) => (j === i ? { ...k, docs: { ...k.docs, [kind]: [...k.docs[kind], ...incoming] } } : k)));
  }
  function removeKidFile(i: number, kind: ChildDocKind, index: number) {
    setKids((l) => l.map((k, j) => (j === i ? { ...k, docs: { ...k.docs, [kind]: k.docs[kind].filter((_, x) => x !== index) } } : k)));
  }

  // ── fees: the same family estimator the Fees page uses ──
  const sibPct = siblingDiscountPercent != null && siblingDiscountPercent > 0 ? siblingDiscountPercent : 0;
  const terms = feeTerms ?? FEE_DEFAULTS.terms;
  const instalments = feeInstalments ?? FEE_DEFAULTS.instalments;
  const bands = feeBands.map((b) => ({ year_group_range: b.yearGroupRange, annual_fee: b.annualFee }));
  const chosenPlan: PaymentPlan | "" = values.paymentPlan === "annual" || values.paymentPlan === "termly" || values.paymentPlan === "monthly" ? values.paymentPlan : "";
  const estimate = estimateFamilyFees({
    children: kids.map((k, i) => ({ label: kidName(k, i), annual: bandForYearGroup(k.yearGroup, bands)?.annual_fee ?? 0 })),
    plan: chosenPlan || "monthly",
    terms,
    instalments,
    annualDiscountPercent: annualDiscountPercent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent,
    siblingDiscountPercent: sibPct > 0 ? sibPct : undefined,
    applicationFee: applicationFee ?? FEE_POLICY_DEFAULTS.applicationFee,
    registrationFee: registrationFee ?? FEE_POLICY_DEFAULTS.registrationFee,
  });

  // ── navigation and submit ──
  function focusFirst(found: Errors) {
    const first = Object.keys(found).find((k) => found[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#f-${first}`)?.focus();
  }

  function goNext() {
    const found = validateStep(step, values, kids, parentIds);
    setErrors((er) => ({ ...er, ...found }));
    if (Object.keys(found).length > 0) return focusFirst(found);
    setStep(step + 1);
    formRef.current?.scrollIntoView({ block: "start" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (step < STEP_TITLES.length - 1) return goNext();
    setSubmitError(false);
    // Re-check every step; send the family back to the first one with a problem.
    for (let s = 0; s < STEP_TITLES.length; s++) {
      const found = validateStep(s, values, kids, parentIds);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        if (s !== step) setStep(s);
        else focusFirst(found);
        return;
      }
    }
    setErrors({});
    // Honeypot: bots fill the hidden field. Pretend it worked, send nothing.
    if (values.website.trim() !== "") {
      setSubmitted({ names: kids.map((k, i) => kidName(k, i)), email: values.parentEmail.trim() });
      setPhase("success");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSubmitError(true);
      return;
    }
    setPhase("submitting");
    // Anon can't read rows back, so every id is generated here and the inserts
    // deliberately don't ask for the row back (no .select()).
    const familyId = crypto.randomUUID();
    const appIds = kids.map(() => crypto.randomUUID());
    const snapshot = {
      plan: values.paymentPlan,
      perChild: estimate.perChild.map((c) => ({ gross: c.gross, siblingDiscount: c.siblingDiscount, net: c.net })),
      total: estimate.total,
      totalDiscount: estimate.totalDiscount,
      siblingPercent: sibPct,
    };
    const parentName = values.parentName.trim();
    const parentEmail = values.parentEmail.trim();
    const parentPhone = values.parentPhone.trim();
    const addressParts = {
      address_line1: values.addressLine1.trim(),
      address_line2: nullIfEmpty(values.addressLine2),
      address_town: values.addressTown.trim(),
      address_postcode: nullIfEmpty(values.addressPostcode),
      address_country: values.addressCountry.trim(),
    };
    // The one-line copy keeps the older free-text column (and anything reading it) filled.
    const address = addressOneLine(addressParts).slice(0, 500) || null;
    const { error: famErr } = await supabase.from("admissions_families").insert({
      id: familyId,
      lead_application_id: appIds[0],
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: parentPhone,
      relationship: nullIfEmpty(values.relationship),
      address,
      ...addressParts,
      children_count: kids.length,
      fee_snapshot: snapshot,
    });
    if (famErr) {
      setPhase("open");
      setSubmitError(true);
      return;
    }
    // One insert for all children, so either every child is recorded or none.
    const { error } = await supabase.from("admissions_applications").insert(
      kids.map((k, i) => ({
        id: appIds[i],
        family_id: familyId,
        sibling_index: i + 1,
        parent_name: parentName,
        parent_email: parentEmail,
        parent_phone: parentPhone,
        relationship: nullIfEmpty(values.relationship),
        address,
        ...addressParts,
        child_first_name: k.firstName.trim(),
        child_last_name: k.lastName.trim(),
        child_dob: k.dob,
        child_gender: k.gender,
        year_group_applying: k.yearGroup,
        preferred_start: nullIfEmpty(values.preferredStart),
        current_school: nullIfEmpty(k.currentSchool),
        current_school_year: nullIfEmpty(k.currentSchoolYear),
        previous_islamic_education: nullIfEmpty(k.islamicEducation),
        send_or_medical_notes: nullIfEmpty(k.sendNotes),
        how_heard: nullIfEmpty(values.howHeard),
        sibling_at_tarbiyyah: values.sibling,
        sibling_details: values.sibling ? nullIfEmpty(values.siblingDetails) : null,
        payment_plan_intent: values.paymentPlan,
        children_applying: kids.length,
        guardian_is_other: k.otherGuardian,
        guardian_name: k.otherGuardian ? nullIfEmpty(k.guardianName) : null,
        guardian_relationship: k.otherGuardian ? nullIfEmpty(k.guardianRelationship) : null,
        guardian_email: k.otherGuardian ? nullIfEmpty(k.guardianEmail) : null,
        guardian_phone: k.otherGuardian ? nullIfEmpty(k.guardianPhone) : null,
        guardian_address: k.otherGuardian ? nullIfEmpty(k.guardianAddress) : null,
        consent_contact: values.consentContact,
        consent_data: values.consentData,
        declaration_name: values.declarationName.trim(),
      })),
    );
    if (error) {
      setPhase("open");
      setSubmitError(true);
      return;
    }
    // Documents go in after the applications exist: storage only accepts uploads
    // for an application created in the last hour (migrations 0041, 0060, 0081).
    // File names carry the document kind: <application_id>/<kind>-<uuid>.<ext>.
    // The parent's ID is uploaded ONCE, against the first child's application.
    const failed: string[] = [];
    const upload = async (applicationId: string, kind: DocumentKind, files: File[], failLabel: string) => {
      for (const f of files) {
        const ext = documentExtension(f);
        if (!ext) continue;
        const { error: upErr } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(`${applicationId}/${kind}-${crypto.randomUUID()}.${ext}`, f, { contentType: DOCUMENT_CONTENT_TYPES[ext], upsert: false });
        if (upErr && !failed.includes(failLabel)) failed.push(failLabel);
      }
    };
    await upload(appIds[0], "parent_id", parentIds, "your photo ID");
    await upload(appIds[0], "address_proof", addressProofs, "your proof of address");
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const who = k.firstName.trim() || `child ${i + 1}`;
      await upload(appIds[i], "report", k.docs.report, `${who}'s school report`);
      await upload(appIds[i], "child_id", k.docs.child_id, `${who}'s passport or birth certificate`);
      if (k.otherGuardian) await upload(appIds[i], "guardian_id", k.docs.guardian_id, `${who}'s guardian's ID`);
    }
    setFailedUploads(failed);
    setSubmitted({ names: kids.map((k, i) => kidName(k, i)), email: parentEmail });
    setPhase("success");

    // Instant confirmation email (one for the whole family). Best effort: the
    // application is already saved, so a failure here changes nothing.
    const url = getEdgeFunctionUrl("admissions-submitted");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anonKey) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ applicationId: appIds[0] }),
      }).catch(() => undefined);
    }
  }

  // ── states other than the form ──
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
    const names = submitted?.names ?? [];
    const uploadNote =
      failedUploads.length > 0
        ? `Your application was sent, but we couldn't upload ${failedUploads.join(", ")}. Please email ${failedUploads.length > 1 ? "them" : "it"} to ${admissionsEmail}.`
        : addressProofs.length === 0
          ? `Thank you for uploading your documents. We will ask you for proof of ${names.length > 1 ? "your children's" : "your child's"} home address during the review, or you can email it to ${admissionsEmail}.`
          : "Thank you for uploading your documents. We will tell you if we need anything else.";
    return (
      <div role="status" className="min-w-0 rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8">
        <h3 className="text-center font-serif text-xl font-semibold text-ink">
          {names.length > 1 ? `${names.length} applications received. Thank you.` : "Application received. Thank you."}
        </h3>
        <p className="mt-2 break-words text-center text-sm text-ink/70">
          {names.length > 1 ? `We have recorded a separate application for ${names.join(", ")}, linked as one family.` : names[0] ? `We have recorded ${names[0]}'s application.` : ""}{" "}
          {submitted?.email ? `A confirmation is on its way to ${submitted.email}. ` : ""}
          You do not need to pay anything now.
        </p>
        <h4 className="mt-6 font-semibold text-ink">What happens next</h4>
        <AdmissionsTimeline steps={processSteps} currentIndex={1} notes={{ 0: uploadNote, 3: `${processSteps[3].body} Interviews are held by video call.` }} />
        {values.paymentPlan && (
          <p className="mt-6 break-words rounded-lg bg-cream px-3 py-2 text-sm text-ink/80">
            You told us you expect to pay <strong>{values.paymentPlan}</strong>
            {names.length > 1 ? ` for ${names.length} children` : ""}. You can still change this before you accept an offer.
            {registrationFee != null && ` The registration fee is ${formatGBP(registrationFee)}${names.length > 1 ? `, and ${formatGBP(registrationFee / 2)} for each additional sibling` : ""}.`}
            {names.length > 1 && estimate.totalDiscount > 0 && chosenPlan && ` Estimated tuition for the family, after discounts: ${formatGBP(estimate.total)}.`}
          </p>
        )}
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const childLabel = kids.length === 1 ? "your child" : "your children";

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
              className={`rounded-full px-3 py-1 font-medium ${i === step ? "bg-gold-500 text-ink-900" : i < step ? "bg-cream text-ink" : "bg-white text-ink/65 ring-1 ring-gold-light/50"}`}
            >
              {i + 1}. {t}
            </li>
          ))}
        </ol>
      </nav>

      {step === 0 && (
        <>
          <Section title="Parent or guardian" intro="You only enter these details once, even if you are applying for several children.">
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
            <Field id="f-preferredStart" label="Preferred start" optional>
              <input {...props("preferredStart")} type="text" maxLength={120} placeholder="e.g. December 2026" className={inputCls} />
            </Field>
            <Field id="f-howHeard" label="How did you hear about us?" optional>
              <input {...props("howHeard")} type="text" maxLength={300} className={inputCls} />
            </Field>
          </Section>

          <Section
            title={kids.length > 1 ? "Your children's home address" : "Your child's home address"}
            intro="Where the child you are applying for lives. If you are applying for several children, use the address they live at with you. We will ask you for proof of this address."
          >
            <div className="sm:col-span-2">
              <Field id="f-addressCountry" label="Country" error={errors.addressCountry}>
                <input {...props("addressCountry")} type="text" list="apply-countries" autoComplete="country-name" maxLength={80} className={inputCls} />
                <datalist id="apply-countries">
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="f-addressLine1" label="Address line 1" error={errors.addressLine1}>
                <input {...props("addressLine1")} type="text" autoComplete="address-line1" maxLength={120} className={inputCls} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="f-addressLine2" label="Address line 2" optional>
                <input {...props("addressLine2")} type="text" autoComplete="address-line2" maxLength={120} className={inputCls} />
              </Field>
            </div>
            <Field id="f-addressTown" label="Town or city" error={errors.addressTown}>
              <input {...props("addressTown")} type="text" autoComplete="address-level2" maxLength={80} className={inputCls} />
            </Field>
            {(() => {
              const optional = postcodeOptionalFor(values.addressCountry);
              const hint = optional
                ? `There is usually no postcode in ${values.addressCountry.trim()}, so you can leave this blank.`
                : "If there is no postcode where you live, type \"None\".";
              return (
                <Field id="f-addressPostcode" label="Postcode or ZIP code" optional={optional} hint={hint} error={errors.addressPostcode}>
                  <input
                    {...props("addressPostcode")}
                    type="text"
                    autoComplete="postal-code"
                    maxLength={20}
                    aria-describedby={errors.addressPostcode ? "e-f-addressPostcode" : "h-f-addressPostcode"}
                    className={inputCls}
                  />
                </Field>
              );
            })()}
          </Section>

          <Section
            title="Proof of identity and address"
            intro="Admissions is a safeguarding process, so we verify the identity of the adults with parental responsibility, and we need proof of identity and address for the pupil. Files are stored privately and only admissions staff can open them. We ask for these once and use them for every child you apply for. You upload each child's passport or birth certificate on the next step, where you can also add a different legal parent or guardian."
          >
            <div className="sm:col-span-2">
              <DocPicker
                id="f-doc-parent_id"
                label="Photo ID for a parent or guardian"
                hint={`Passport, driving licence or national ID card. PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each.`}
                files={parentIds}
                limit={MAX_ID_FILES}
                error={errors["doc-parent_id"]}
                disabled={busy}
                onAdd={addParentIds}
                onRemove={(idx) => setParentIds((f) => f.filter((_, x) => x !== idx))}
              />
            </div>
            <div className="sm:col-span-2">
              <DocPicker
                id="f-doc-address_proof"
                label={kids.length > 1 ? "Proof of your children's home address" : "Proof of your child's home address"}
                optional
                hint={`A recent utility bill, council tax bill, bank statement or tenancy agreement showing the address above, dated in the last three months. PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each. If you don't have it to hand, we will ask for it during the review, or you can email it to ${admissionsEmail}.`}
                files={addressProofs}
                limit={MAX_ID_FILES}
                error={errors["doc-address_proof"]}
                disabled={busy}
                onAdd={addAddressProofs}
                onRemove={(idx) => setAddressProofs((f) => f.filter((_, x) => x !== idx))}
              />
            </div>
          </Section>
        </>
      )}

      {step === 1 && (
        <>
          <p className="text-sm text-ink/70">
            Add a card for each child. Each child becomes their own application, and we link them as one family. Your details, home address, photo ID and proof of address are shared, so you do not repeat them.
          </p>
          {kids.map((k, i) => (
            <fieldset key={k.key} className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:p-8">
              <legend className="px-2 font-serif text-xl font-semibold text-ink">{kids.length > 1 ? `Child ${i + 1}${k.firstName.trim() ? `: ${k.firstName.trim()}` : ""}` : "Your child"}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`f-c${i}-firstName`} label="First name" error={errors[`c${i}-firstName`]}>
                  <input {...kidProps(i, "firstName")} type="text" autoComplete="off" maxLength={80} className={inputCls} />
                </Field>
                <Field id={`f-c${i}-lastName`} label="Last name" error={errors[`c${i}-lastName`]}>
                  <input {...kidProps(i, "lastName")} type="text" autoComplete="off" maxLength={80} className={inputCls} />
                </Field>
                <Field id={`f-c${i}-dob`} label="Date of birth" error={errors[`c${i}-dob`]}>
                  <input {...kidProps(i, "dob")} type="date" className={inputCls} />
                </Field>
                <div role="radiogroup" aria-labelledby={`l-c${i}-gender`} aria-describedby={errors[`c${i}-gender`] ? `e-f-c${i}-gender` : undefined}>
                  <p id={`l-c${i}-gender`} className="block text-sm font-medium text-ink">Gender</p>
                  <div className="mt-2 flex gap-6">
                    {GENDER_OPTIONS.map((g, gi) => (
                      <label key={g} className="flex items-center gap-2 text-ink">
                        <input
                          id={gi === 0 ? `f-c${i}-gender` : undefined}
                          type="radio"
                          name={`c${i}-gender`}
                          value={g}
                          checked={k.gender === g}
                          disabled={busy}
                          onChange={() => setKidText(i, "gender", g)}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                  {errors[`c${i}-gender`] && <p id={`e-f-c${i}-gender`} role="alert" className="mt-1 text-sm text-red-700">{errors[`c${i}-gender`]}</p>}
                </div>
                <Field id={`f-c${i}-yearGroup`} label="Year group applying for" error={errors[`c${i}-yearGroup`]}>
                  <select {...kidProps(i, "yearGroup")} className={inputCls}>
                    <option value="">Select a year group</option>
                    {YEAR_GROUP_OPTIONS.map((y) => (
                      <option key={y.value} value={y.value}>{y.label}</option>
                    ))}
                  </select>
                </Field>
                {(() => {
                  const suggestion = suggestYearGroup(k.dob, values.preferredStart);
                  if (!suggestion) return null;
                  return (
                    <p role="status" className="rounded-lg bg-cream px-3 py-2 text-sm text-ink sm:col-span-2">
                      Suggested year group: <strong className="text-base">{suggestion.yearGroup}</strong>{" "}
                      <span className="text-ink/70">(age {suggestion.ageAtEntry} on 31 August {suggestion.entryYear}).</span>{" "}
                      {k.yearGroup !== suggestion.yearGroup ? (
                        <button type="button" onClick={() => patchKid(i, { yearGroup: suggestion.yearGroup, yearTouched: false })} className="font-semibold text-gold-700 underline">
                          Use this
                        </button>
                      ) : (
                        <span className="text-ink/70">You can change it above if it isn&apos;t right.</span>
                      )}
                    </p>
                  );
                })()}
                <Field id={`f-c${i}-currentSchool`} label="Current school" optional>
                  <input {...kidProps(i, "currentSchool")} type="text" maxLength={200} className={inputCls} />
                </Field>
                <Field id={`f-c${i}-currentSchoolYear`} label="Current year group" optional>
                  <input {...kidProps(i, "currentSchoolYear")} type="text" maxLength={60} className={inputCls} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id={`f-c${i}-islamicEducation`} label="Previous Islamic education" optional hint="For example Qur'an level, any hifdh, and Arabic.">
                    <textarea {...kidProps(i, "islamicEducation")} rows={2} maxLength={1500} className={inputCls} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field id={`f-c${i}-sendNotes`} label="Special educational needs, medical needs or anything else we should know" optional hint="This helps us prepare the right support. Share only what you are comfortable with.">
                    <textarea {...kidProps(i, "sendNotes")} rows={3} maxLength={3000} className={inputCls} />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <DocPicker
                    id={`f-c${i}-doc-report`}
                    label="Latest school report(s)"
                    optional
                    hint={`PDF, JPG or PNG, up to ${MAX_REPORT_FILES} files, 10 MB each. You can also email them to ${admissionsEmail}.`}
                    files={k.docs.report}
                    limit={MAX_REPORT_FILES}
                    error={errors[`c${i}-doc-report`]}
                    disabled={busy}
                    onAdd={(l) => addKidFiles(i, "report", l)}
                    onRemove={(idx) => removeKidFile(i, "report", idx)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <DocPicker
                    id={`f-c${i}-doc-child_id`}
                    label="Passport or birth certificate"
                    hint={`Your child's proof of identity. PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each.`}
                    files={k.docs.child_id}
                    limit={MAX_ID_FILES}
                    error={errors[`c${i}-doc-child_id`]}
                    disabled={busy}
                    onAdd={(l) => addKidFiles(i, "child_id", l)}
                    onRemove={(idx) => removeKidFile(i, "child_id", idx)}
                  />
                </div>

                <div className="rounded-xl bg-cream p-4 sm:col-span-2">
                  <p className="text-sm text-ink">
                    <span className="font-medium">Parent or guardian: </span>
                    {k.otherGuardian ? "someone else, as entered below." : `same as above${values.parentName.trim() ? ` (${values.parentName.trim()})` : ""}, including the photo ID you uploaded.`}
                  </p>
                  <label className="mt-2 flex items-start gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={k.otherGuardian}
                      disabled={busy}
                      onChange={(e) => patchKid(i, { otherGuardian: e.target.checked })}
                      className="mt-1"
                    />
                    This child&apos;s legal parent or guardian is someone else
                  </label>
                  {k.otherGuardian && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <p className="text-xs text-ink/70 sm:col-span-2">
                        For example in a blended family, or where a different adult has parental responsibility. We will contact them about {k.firstName.trim() || "this child"}, and they get their own parent account.
                      </p>
                      <Field id={`f-c${i}-guardianName`} label="Full name" error={errors[`c${i}-guardianName`]}>
                        <input {...kidProps(i, "guardianName")} type="text" maxLength={120} className={inputCls} />
                      </Field>
                      <Field id={`f-c${i}-guardianRelationship`} label="Relationship to the child" optional>
                        <input {...kidProps(i, "guardianRelationship")} type="text" maxLength={60} placeholder="e.g. Father, Stepmother" className={inputCls} />
                      </Field>
                      <Field id={`f-c${i}-guardianEmail`} label="Email address" error={errors[`c${i}-guardianEmail`]}>
                        <input {...kidProps(i, "guardianEmail")} type="email" maxLength={254} className={inputCls} />
                      </Field>
                      <Field id={`f-c${i}-guardianPhone`} label="Phone number" error={errors[`c${i}-guardianPhone`]}>
                        <input {...kidProps(i, "guardianPhone")} type="tel" maxLength={40} className={inputCls} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field id={`f-c${i}-guardianAddress`} label="Home address" optional>
                          <textarea {...kidProps(i, "guardianAddress")} rows={2} maxLength={500} className={inputCls} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <DocPicker
                          id={`f-c${i}-doc-guardian_id`}
                          label="Photo ID for this legal parent or guardian"
                          hint={`Passport, driving licence or national ID card. PDF, JPG or PNG, up to ${MAX_ID_FILES} files, 10 MB each.`}
                          files={k.docs.guardian_id}
                          limit={MAX_ID_FILES}
                          error={errors[`c${i}-doc-guardian_id`]}
                          disabled={busy}
                          onAdd={(l) => addKidFiles(i, "guardian_id", l)}
                          onRemove={(idx) => removeKidFile(i, "guardian_id", idx)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {kids.length > 1 && (
                <div className="mt-4 text-right">
                  <button type="button" disabled={busy} onClick={() => removeKid(i)} className="text-sm font-semibold text-red-700 underline">
                    Remove {k.firstName.trim() || `child ${i + 1}`}
                  </button>
                </div>
              )}
            </fieldset>
          ))}
          {kids.length < MAX_CHILDREN && (
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={addKid}
                className="rounded-full border border-gold-500 bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-60"
              >
                Add another child
              </button>
              <p className="mt-1 text-xs text-ink/70">
                {sibPct > 0 ? `Siblings get ${sibPct}% off from the second child onwards.` : "Siblings may qualify for a discount."} You can add up to {MAX_CHILDREN} children.
              </p>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <Section title="Fees and plan" intro={`Here is what ${childLabel} would cost, with any sibling discount already applied.`}>
            <FeeSummary estimate={estimate} kids={kids} plan={chosenPlan} siblingPercent={sibPct} siblingNote={siblingDiscountNote} terms={terms} instalments={instalments} />
            <Field id="f-paymentPlan" label="Payment plan you expect to use" error={errors.paymentPlan} hint="Annual, 2 payments or monthly. This is only your intention; you confirm it when you accept an offer.">
              <select {...props("paymentPlan")} className={inputCls}>
                <option value="">Select a plan</option>
                {PAYMENT_PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
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
                Another child in our family already attends a Tarbiyyah school
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
                  I agree that Tarbiyyah Global Academy may contact me about {kids.length > 1 ? "these applications" : "this application"}.
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
                    I agree to my and {kids.length > 1 ? "my children's" : "my child's"} information being used to process {kids.length > 1 ? "these applications" : "this application"}, as explained in the{" "}
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

          {submitError && (
            <p role="alert" className="text-sm text-red-700">
              Something went wrong sending your application, so nothing has been submitted. Please try again, or email{" "}
              <a href={`mailto:${admissionsEmail}`} className="underline">{admissionsEmail}</a> directly.
            </p>
          )}
        </>
      )}

      {errorCount > 0 && (
        <p role="alert" className="text-sm font-medium text-red-700">
          Please fix the {errorCount === 1 ? "problem" : `${errorCount} problems`} marked above and continue.
        </p>
      )}

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
            {busy ? "Sending…" : kids.length > 1 ? `Submit ${kids.length} applications` : "Submit application"}
          </button>
        )}
      </div>
    </form>
  );
}
