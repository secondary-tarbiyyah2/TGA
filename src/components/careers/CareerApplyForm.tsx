"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";
import { Dropdown } from "@/components/ui/Dropdown";
import { COUNTRIES } from "@/lib/countries";
import {
  DAYS,
  DBS_STATUS,
  HOURS_PREFERENCE,
  HOW_HEARD,
  ONLINE_EXPERIENCE,
  RIGHT_TO_WORK,
  SUBJECTS,
  TEACHER_STATUS,
  YEARS_EXPERIENCE,
  YEAR_GROUPS,
  labelFor,
  monthLabel,
  type EmploymentEntry,
  type Option,
  type Referee,
  type Vacancy,
} from "@/lib/careers";

// ── shape of the form ──────────────────────────────────────────────────

type Values = {
  vacancyId: string;
  title: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  emailConfirm: string;
  phone: string;
  country: string;
  town: string;
  rightToWork: string;
  teacherStatus: string;
  highestQualification: string;
  qualifications: string;
  islamicQualifications: string;
  subjects: string[];
  yearGroups: string[];
  languages: string;
  yearsExperience: string;
  onlineExperience: string;
  employment: EmploymentEntry[];
  employmentGaps: string;
  hoursPreference: string;
  availableDays: string[];
  earliestStart: string;
  noticePeriod: string;
  hasEquipment: boolean;
  statement: string;
  whyTga: string;
  referees: Referee[];
  dbsStatus: string;
  howHeard: string;
  declarationTrue: boolean;
  consentData: boolean;
  declarationName: string;
};

const blankJob = (): EmploymentEntry => ({ employer: "", role: "", from: "", to: "", current: false, reason: "" });
const blankReferee = (): Referee => ({ name: "", position: "", organisation: "", relationship: "", email: "", phone: "", contactBeforeInterview: false });

const INITIAL: Values = {
  vacancyId: "",
  title: "",
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  emailConfirm: "",
  phone: "",
  country: "",
  town: "",
  rightToWork: "",
  teacherStatus: "",
  highestQualification: "",
  qualifications: "",
  islamicQualifications: "",
  subjects: [],
  yearGroups: [],
  languages: "",
  yearsExperience: "",
  onlineExperience: "",
  employment: [blankJob()],
  employmentGaps: "",
  hoursPreference: "",
  availableDays: [],
  earliestStart: "",
  noticePeriod: "",
  hasEquipment: false,
  statement: "",
  whyTga: "",
  referees: [blankReferee(), blankReferee()],
  dbsStatus: "",
  howHeard: "",
  declarationTrue: false,
  consentData: false,
  declarationName: "",
};

const STEPS = ["The role and you", "Qualifications", "Experience", "Availability and statement", "References and documents", "Checks and declaration"] as const;

const DRAFT_KEY = "tga:careers-draft:v1";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 3;
const STATEMENT_MIN = 100;
const STATEMENT_MAX = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CV_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_ACCEPT = `${CV_ACCEPT},.jpg,.jpeg,.png,image/jpeg,image/png`;

type Errors = Record<string, string | undefined>;
type Phase = "open" | "submitting" | "success";

const inputBase =
  "w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-ink transition-shadow focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300/70 disabled:opacity-60 aria-[invalid=true]:border-red-600";
const inputCls = `mt-1 ${inputBase}`;
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-gold-500 px-5 py-2 font-semibold text-ink-900 hover:bg-gold-300 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-gold-500 bg-white px-5 py-2 font-semibold text-ink hover:bg-cream disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700";
const linkBtn = "text-sm font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900";

// ── validation, one step at a time ─────────────────────────────────────

function validateStep(step: number, v: Values, cv: File | null, docs: File[]): Errors {
  const e: Errors = {};
  const req = (key: keyof Values, msg: string) => {
    const val = v[key];
    if (Array.isArray(val) ? val.length === 0 : typeof val === "string" ? !val.trim() : !val) e[key] = msg;
  };
  if (step === 0) {
    req("vacancyId", "Please choose the role you are applying for.");
    req("firstName", "Please enter your first name.");
    req("lastName", "Please enter your last name.");
    if (!EMAIL_RE.test(v.email.trim())) e.email = "Please enter a valid email address.";
    if (v.emailConfirm.trim().toLowerCase() !== v.email.trim().toLowerCase()) e.emailConfirm = "The two email addresses don't match.";
    if (v.phone.replace(/\D/g, "").length < 6) e.phone = "Please enter a phone number, including the country code if you are outside the UK.";
    req("country", "Please choose the country you live in.");
    req("rightToWork", "Please tell us about your right to work.");
  }
  if (step === 1) {
    req("teacherStatus", "Please choose your teacher status.");
    req("highestQualification", "Please tell us your highest qualification.");
    req("subjects", "Please choose at least one subject or area.");
  }
  if (step === 2) {
    req("yearsExperience", "Please choose how much teaching experience you have.");
    req("onlineExperience", "Please tell us about your online teaching.");
    const needsHistory = v.yearsExperience !== "none";
    v.employment.forEach((j, i) => {
      const blank = !j.employer.trim() && !j.role.trim() && !j.from && !j.to;
      if (blank && (!needsHistory || i > 0)) return;
      if (j.employer.trim().length < 2) e[`employment.${i}.employer`] = "Please enter the employer.";
      if (j.role.trim().length < 2) e[`employment.${i}.role`] = "Please enter your job title.";
      if (!MONTH_RE.test(j.from)) e[`employment.${i}.from`] = "Please enter the start month, for example 2021-09.";
      if (!j.current) {
        if (!MONTH_RE.test(j.to)) e[`employment.${i}.to`] = "Please enter the end month, or tick \"I still work here\".";
        else if (MONTH_RE.test(j.from) && j.to < j.from) e[`employment.${i}.to`] = "The end month is before the start month.";
      }
    });
  }
  if (step === 3) {
    req("hoursPreference", "Please choose the hours you are looking for.");
    req("availableDays", "Please choose at least one day.");
    if (v.statement.trim().length < STATEMENT_MIN) e.statement = `Please write at least ${STATEMENT_MIN} characters (you have ${v.statement.trim().length}).`;
  }
  if (step === 4) {
    v.referees.forEach((r, i) => {
      const optional = i >= 2 && !r.name.trim() && !r.email.trim() && !r.organisation.trim();
      if (optional) return;
      if (r.name.trim().length < 2) e[`referees.${i}.name`] = "Please enter the referee's name.";
      if (r.organisation.trim().length < 2) e[`referees.${i}.organisation`] = "Please enter their school or organisation.";
      if (r.relationship.trim().length < 2) e[`referees.${i}.relationship`] = "Please say how they know you, for example \"Headteacher, my current line manager\".";
      if (!EMAIL_RE.test(r.email.trim())) e[`referees.${i}.email`] = "Please enter a valid work email address.";
      else if (r.email.trim().toLowerCase() === v.email.trim().toLowerCase()) e[`referees.${i}.email`] = "A referee can't use your own email address.";
    });
    if (!cv) e.cv = "Please attach your CV (PDF or Word).";
    else if (cv.size > MAX_FILE_BYTES) e.cv = "Your CV is larger than 10 MB. Please save a smaller copy.";
    if (docs.length > MAX_DOCUMENTS) e.documents = `Please attach no more than ${MAX_DOCUMENTS} supporting documents.`;
    else if (docs.some((d) => d.size > MAX_FILE_BYTES)) e.documents = "Each document must be 10 MB or less.";
  }
  if (step === 5) {
    req("dbsStatus", "Please tell us about your criminal record check.");
    if (!v.declarationTrue) e.declarationTrue = "Please confirm the declaration.";
    if (!v.consentData) e.consentData = "Please agree to how we use your information.";
    if (v.declarationName.trim().length < 2) e.declarationName = "Please type your full name to sign.";
  }
  return e;
}

/** Which step a server-side field error belongs to. */
function stepForField(field: string): number {
  const f = field.split(".")[0];
  if (["vacancyId", "title", "firstName", "lastName", "email", "phone", "country", "town", "rightToWork"].includes(f)) return 0;
  if (["teacherStatus", "highestQualification", "qualifications", "islamicQualifications", "subjects", "yearGroups", "languages"].includes(f)) return 1;
  if (["yearsExperience", "onlineExperience", "employment", "employmentGaps"].includes(f)) return 2;
  if (["hoursPreference", "availableDays", "earliestStart", "noticePeriod", "statement", "whyTga"].includes(f)) return 3;
  if (["referees", "cv", "documents"].includes(f)) return 4;
  return 5;
}

/** A saved draft, made safe to merge into the form (or null if there's nothing worth restoring). */
function sanitiseDraft(d: Partial<Values> | null): Partial<Values> | null {
  if (!d || typeof d !== "object") return null;
  const out: Partial<Values> = {};
  for (const key of Object.keys(INITIAL) as (keyof Values)[]) {
    const want = INITIAL[key];
    const got = d[key];
    if (got === undefined) continue;
    if (Array.isArray(want) ? Array.isArray(got) : typeof got === typeof want) (out as Record<string, unknown>)[key] = got;
  }
  if (out.employment) out.employment = out.employment.filter((j) => j && typeof j === "object").map((j) => ({ ...blankJob(), ...j })).slice(0, 12);
  if (!out.employment?.length) delete out.employment;
  if (out.referees) out.referees = out.referees.filter((r) => r && typeof r === "object").map((r) => ({ ...blankReferee(), ...r })).slice(0, 3);
  if (out.referees && out.referees.length < 2) out.referees = [...out.referees, ...Array.from({ length: 2 - out.referees.length }, blankReferee)];
  for (const k of ["subjects", "yearGroups", "availableDays"] as const) if (out[k]) out[k] = out[k]!.filter((x) => typeof x === "string");
  const touched = Boolean(out.firstName?.trim() || out.email?.trim() || out.statement?.trim());
  return touched ? out : null;
}

// ── small field components ─────────────────────────────────────────────

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={`${id}-err`} className="mt-1 text-sm font-medium text-red-700">
      {msg}
    </p>
  ) : null;
}

function TextInput({
  id, label, value, onChange, error, hint, required, type = "text", autoComplete, maxLength = 200, placeholder, inputMode,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; required?: boolean; type?: string; autoComplete?: string; maxLength?: number; placeholder?: string; inputMode?: "text" | "tel" | "email" | "numeric";
}) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={`f-${id}`} className="block text-sm font-medium text-ink">
        {label} {required ? <span className="text-red-700" aria-hidden="true">*</span> : <span className="font-normal text-ink/60">(optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="text-xs text-ink/65">{hint}</p>}
      <input
        id={`f-${id}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={inputCls}
      />
      <Err id={id} msg={error} />
    </div>
  );
}

function TextArea({
  id, label, value, onChange, error, hint, required, rows = 4, maxLength = 3000, showCount,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; required?: boolean; rows?: number; maxLength?: number; showCount?: boolean;
}) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : "", showCount ? `${id}-count` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={`f-${id}`} className="block text-sm font-medium text-ink">
        {label} {required ? <span className="text-red-700" aria-hidden="true">*</span> : <span className="font-normal text-ink/60">(optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="text-xs text-ink/65">{hint}</p>}
      <textarea
        id={`f-${id}`}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={`${inputCls} leading-relaxed`}
      />
      {showCount && (
        <p id={`${id}-count`} className="mt-1 text-right text-xs text-ink/65">
          {value.trim().length.toLocaleString("en-GB")} / {maxLength.toLocaleString("en-GB")} characters
        </p>
      )}
      <Err id={id} msg={error} />
    </div>
  );
}

/** A titled part of a step ("About you", "Contact details"), so a long step reads as a few short groups. Layout only. */
function Part({ title, hint, first }: { title: string; hint?: string; first?: boolean }) {
  return (
    <div className={first ? "" : "border-t border-gold-light/60 pt-6"}>
      <h3 className="font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-ink/70">{hint}</p>}
    </div>
  );
}

function Radios({ id, legend, options, value, onChange, error, hint }: { id: string; legend: string; options: Option[]; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return (
    <fieldset id={`f-${id}`} tabIndex={-1} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-sm font-medium text-ink">
        {legend} <span className="text-red-700" aria-hidden="true">*</span>
      </legend>
      {hint && <p className="text-xs text-ink/65">{hint}</p>}
      <div className="mt-2 grid gap-2">
        {options.map((o) => (
          <label key={o.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-ink ${value === o.value ? "border-gold-500 bg-gold-50" : "border-gold-light/60 bg-white hover:bg-cream"}`}>
            <input type="radio" name={id} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 h-4 w-4 accent-gold-700" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <Err id={id} msg={error} />
    </fieldset>
  );
}

function Checks({ id, legend, options, value, onChange, error, hint, required = true }: { id: string; legend: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; error?: string; hint?: string; required?: boolean }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <fieldset id={`f-${id}`} tabIndex={-1} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-sm font-medium text-ink">
        {legend} {required ? <span className="text-red-700" aria-hidden="true">*</span> : <span className="font-normal text-ink/60">(optional)</span>}
      </legend>
      {hint && <p className="text-xs text-ink/65">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm ${on ? "border-gold-500 bg-gold-100 font-semibold text-ink" : "border-gold-light/60 bg-white text-ink/85 hover:bg-cream"}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(o)} className="h-4 w-4 accent-gold-700" />
              {o}
            </label>
          );
        })}
      </div>
      <Err id={id} msg={error} />
    </fieldset>
  );
}

function Tick({ id, checked, onChange, children, error }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <div>
      <label htmlFor={`f-${id}`} className="flex cursor-pointer items-start gap-3 text-ink">
        <input id={`f-${id}`} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className="mt-1 h-5 w-5 shrink-0 accent-gold-700" />
        <span>{children}</span>
      </label>
      <Err id={id} msg={error} />
    </div>
  );
}

// ── the form ───────────────────────────────────────────────────────────

export function CareerApplyForm({ email: schoolEmail }: { email: string }) {
  const [roles, setRoles] = useState<Vacancy[] | null>(null);
  const [values, setValues] = useState<Values>(INITIAL);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [cv, setCv] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("open");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; emailSent: boolean } | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const [draftRestored, setDraftRestored] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Roles, the role in the link (?role=slug), and any saved draft.
  const restoreAndLoad = useCallback(() => {
    let draft: Partial<Values> | null = null;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as Partial<Values>;
    } catch {
      draft = null;
    }
    const saved = sanitiseDraft(draft);
    if (saved) {
      setValues((v) => ({ ...v, ...saved, declarationTrue: false, consentData: false, declarationName: "" }));
      setDraftRestored(true);
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setRoles([]);
      return;
    }
    const wanted = new URLSearchParams(window.location.search).get("role") || "";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    void supabase
      .from("job_vacancies")
      .select("id, slug, title, department, closing_date, status, sort_order")
      .eq("status", "open")
      .or(`closing_date.is.null,closing_date.gte.${today}`)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const list = (data as Vacancy[] | null) || [];
        setRoles(list);
        const match = wanted === "general" ? "general" : list.find((r) => r.slug === wanted)?.id;
        if (match) setValues((v) => ({ ...v, vacancyId: match }));
        else
          setValues((v) => {
            const stale = v.vacancyId && v.vacancyId !== "general" && !list.some((r) => r.id === v.vacancyId);
            const current = stale ? "" : v.vacancyId;
            // With a single advertised role (e.g. one "all subjects" vacancy), choose it for them.
            return { ...v, vacancyId: current || (list.length === 1 ? list[0].id : "") };
          });
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off: restore a saved draft and load the roles
    restoreAndLoad();
  }, [restoreAndLoad]);

  // Save a draft as they go (never the files or the signed declaration).
  useEffect(() => {
    if (phase !== "open") return;
    const t = window.setTimeout(() => {
      try {
        const draft: Partial<Values> = { ...values };
        delete draft.declarationTrue;
        delete draft.consentData;
        delete draft.declarationName;
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* storage full or blocked: drafts are a convenience only */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [values, phase]);

  // Move focus to the step heading when the step changes (not on first load).
  const done = phase === "success";
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, done]);

  const roleOptions = useMemo(
    () => [
      ...(roles || []).map((r) => ({ value: r.id, label: r.title, detail: r.department })),
      { value: "general", label: "General application", detail: "Any suitable role, now or in the future" },
    ],
    [roles],
  );
  const roleTitle = values.vacancyId === "general" ? "General application" : roles?.find((r) => r.id === values.vacancyId)?.title || "";

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setValues((v) => ({ ...v, [k]: val }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const setJob = (i: number, patch: Partial<EmploymentEntry>) => {
    setValues((v) => ({ ...v, employment: v.employment.map((j, n) => (n === i ? { ...j, ...patch } : j)) }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[`employment.${i}.${k}`];
      if ("current" in patch) delete next[`employment.${i}.to`];
      return next;
    });
  };
  const setRef = (i: number, patch: Partial<Referee>) => {
    setValues((v) => ({ ...v, referees: v.referees.map((r, n) => (n === i ? { ...r, ...patch } : r)) }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[`referees.${i}.${k}`];
      return next;
    });
  };

  function showErrors(e: Errors) {
    setErrors(e);
    const first = Object.keys(e).find((k) => e[k]);
    if (!first) return;
    window.setTimeout(() => {
      const el = document.getElementById(`f-${first}`);
      el?.focus();
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  }

  function next() {
    const e = validateStep(step, values, cv, docs);
    if (Object.keys(e).length) return showErrors(e);
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function pickCv(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setCv(f);
    setErrors((x) => ({ ...x, cv: f && f.size > MAX_FILE_BYTES ? "Your CV is larger than 10 MB. Please save a smaller copy." : undefined }));
  }

  function pickDocs(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    const all = [...docs, ...picked].slice(0, MAX_DOCUMENTS);
    setDocs(all);
    e.target.value = "";
    setErrors((x) => ({ ...x, documents: picked.length + docs.length > MAX_DOCUMENTS ? `Only the first ${MAX_DOCUMENTS} documents were kept.` : undefined }));
  }

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (step < STEPS.length - 1) return next();
    // Check every step again before sending.
    for (let s = 0; s < STEPS.length; s++) {
      const e = validateStep(s, values, cv, docs);
      if (Object.keys(e).length) {
        setStep(s);
        return showErrors(e);
      }
    }
    const url = getEdgeFunctionUrl("careers-apply");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setSubmitError(`We couldn't send your application just now. Please email your CV to ${schoolEmail}.`);
      return;
    }
    setPhase("submitting");
    setSubmitError(null);

    const employment = values.employment.filter((j) => j.employer.trim() || j.role.trim() || j.from);
    const referees = values.referees.filter((r, i) => i < 2 || r.name.trim() || r.email.trim());
    const payload = {
      ...values,
      emailConfirm: undefined,
      employment,
      referees,
      company: honeypot.current?.value || "",
      formRenderedAt: renderedAt,
    };
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    if (cv) body.append("cv", cv, cv.name);
    for (const d of docs) body.append("documents", d, d.name);

    try {
      const res = await fetch(url, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: string[]; reference?: string; emailSent?: boolean };
      if (!res.ok || !json.ok) {
        setPhase("open");
        const fields = json.fields || [];
        if (json.error === "validation" && fields.length && fields[0] !== "form") {
          const s = Math.min(...fields.map(stepForField));
          setStep(s);
          setSubmitError("Some details need checking. Please look at the highlighted answers.");
          const e: Errors = {};
          for (const f of fields) {
            const [group, index] = f.split(".");
            const key = index === undefined ? f : group === "employment" ? `employment.${index}.employer` : `referees.${index}.name`;
            e[key] = "Please check this answer.";
          }
          showErrors(e);
          return;
        }
        setSubmitError(
          json.error === "rate_limited"
            ? "You have tried several times in a short while. Please wait an hour and try again."
            : json.error === "vacancy_closed"
              ? "Sorry, this role has just closed. You can still choose \"General application\" on the first step."
              : json.error === "file_type"
                ? "One of your files isn't a type we accept. Please attach your CV as a PDF or Word document, and other documents as PDF, Word, JPG or PNG."
                : json.error === "file_size"
                  ? "One of your files is too large. Each must be 10 MB or less."
                  : json.error === "validation"
                    ? "Please take a moment to check your answers, then submit again."
                    : `Something went wrong and your application was not sent. Please try again, or email your CV to ${schoolEmail}.`,
        );
        if (json.error === "vacancy_closed") setStep(0);
        if (json.error === "file_type" || json.error === "file_size") setStep(4);
        return;
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setResult({ reference: json.reference || "", emailSent: json.emailSent !== false });
      setPhase("success");
    } catch {
      setPhase("open");
      setSubmitError(`We couldn't reach the server. Please check your connection and try again, or email your CV to ${schoolEmail}.`);
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setValues(INITIAL);
    setDraftRestored(false);
    setStep(0);
    setErrors({});
  }

  // ── success ──
  if (phase === "success" && result) {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/60 bg-white p-6 sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold text-ink focus:outline-none">
          Thank you. Your application has been sent.
        </h2>
        <p className="mt-3 text-ink/80">
          Your reference is <strong className="text-ink">{result.reference}</strong>. Please keep it in case you need to contact us.
        </p>
        <p className="mt-2 text-ink/80">
          {result.emailSent
            ? "We have emailed you a copy of your reference. Please check your junk folder if you don't see it."
            : `We couldn't send your confirmation email, but your application is safely with us. If you have any questions, write to ${schoolEmail}.`}
        </p>
        <h3 className="mt-6 font-semibold text-ink">What happens next</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink/80">
          <li>We read every application carefully against the role.</li>
          <li>If you are shortlisted, we invite you to an online interview and, for teaching roles, a short sample lesson.</li>
          <li>Before any offer we take up references and make the safer recruitment checks every school must make.</li>
        </ol>
        <p className="mt-6">
          <Link href="/careers/" className={linkBtn}>Back to Careers</Link>
        </p>
      </div>
    );
  }

  const v = values;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-gold-light/60 bg-white">
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input ref={honeypot} type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="border-b border-gold-light/60 p-5 sm:p-6">
        <p className="text-sm font-medium text-gold-700">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-xl font-semibold text-ink focus:outline-none sm:text-2xl">
          {STEPS[step]}
        </h2>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gold-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Application progress">
          <div className="h-full rounded-full bg-gold-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <ol className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-xs text-ink/65 md:flex" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "font-semibold text-ink" : i < step ? "text-ink/80" : ""}>
              {i < step ? "✓ " : `${i + 1}. `}
              {s}
            </li>
          ))}
        </ol>
        {draftRestored && step === 0 && (
          <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-ink/80">
            We restored the answers you saved on this device.{" "}
            <button type="button" onClick={clearDraft} className={linkBtn}>Start again</button>
          </p>
        )}
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {submitError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitError}
          </p>
        )}

        {step === 0 && (
          <>
            <Part first title="The role" hint="Choose “General application” if no current vacancy fits." />
            <div>
              <label htmlFor="f-vacancyId" className="block text-sm font-medium text-ink">
                Which role are you applying for? <span className="text-red-700" aria-hidden="true">*</span>
              </label>
              <div className="mt-1">
                <Dropdown
                  id="f-vacancyId"
                  value={v.vacancyId}
                  onChange={(x) => set("vacancyId", x)}
                  options={roleOptions}
                  placeholder={roles === null ? "Loading the roles…" : "Choose a role"}
                  invalid={!!errors.vacancyId}
                  required
                />
              </div>
              <Err id="vacancyId" msg={errors.vacancyId} />
            </div>

            <Part title="About you" hint="Your name as it appears on your ID documents." />
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
              <TextInput id="title" label="Title" value={v.title} onChange={(x) => set("title", x)} maxLength={20} autoComplete="honorific-prefix" placeholder="e.g. Ms" />
              <TextInput id="firstName" label="First name" required value={v.firstName} onChange={(x) => set("firstName", x)} error={errors.firstName} maxLength={80} autoComplete="given-name" />
              <TextInput id="lastName" label="Last name" required value={v.lastName} onChange={(x) => set("lastName", x)} error={errors.lastName} maxLength={80} autoComplete="family-name" />
            </div>
            <TextInput id="preferredName" label="Name you like to be called" value={v.preferredName} onChange={(x) => set("preferredName", x)} maxLength={80} autoComplete="nickname" />
            <Part title="Contact details" hint="We use these to keep you updated and arrange an interview." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput id="email" label="Email" required type="email" inputMode="email" value={v.email} onChange={(x) => set("email", x)} error={errors.email} maxLength={254} autoComplete="email" />
              <TextInput id="emailConfirm" label="Email again" required type="email" inputMode="email" value={v.emailConfirm} onChange={(x) => set("emailConfirm", x)} error={errors.emailConfirm} maxLength={254} autoComplete="email" />
            </div>
            <TextInput id="phone" label="Phone (with country code)" required type="tel" inputMode="tel" value={v.phone} onChange={(x) => set("phone", x)} error={errors.phone} maxLength={40} autoComplete="tel" placeholder="+44 7…" />
            <Part title="Where you live and work" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-country" className="block text-sm font-medium text-ink">
                  Country you live in <span className="text-red-700" aria-hidden="true">*</span>
                </label>
                <div className="mt-1">
                  <Dropdown id="f-country" value={v.country} onChange={(x) => set("country", x)} options={COUNTRIES.map((c) => ({ value: c, label: c }))} placeholder="Choose a country" searchable invalid={!!errors.country} required />
                </div>
                <Err id="country" msg={errors.country} />
              </div>
              <TextInput id="town" label="Town or city" value={v.town} onChange={(x) => set("town", x)} maxLength={120} autoComplete="address-level2" />
            </div>
            <Radios id="rightToWork" legend="Do you have the right to work in the UK?" options={RIGHT_TO_WORK} value={v.rightToWork} onChange={(x) => set("rightToWork", x)} error={errors.rightToWork} hint="Lessons are live online, so we welcome teachers from outside the UK too. Shortlisted candidates show us their documents." />
          </>
        )}

        {step === 1 && (
          <>
            <Part first title="Qualifications" hint="Teaching, academic and Islamic study, with where and when." />
            <Radios id="teacherStatus" legend="Your teacher status" options={TEACHER_STATUS} value={v.teacherStatus} onChange={(x) => set("teacherStatus", x)} error={errors.teacherStatus} />
            <TextInput id="highestQualification" label="Your highest qualification" required value={v.highestQualification} onChange={(x) => set("highestQualification", x)} error={errors.highestQualification} maxLength={300} placeholder="e.g. BSc Mathematics (2:1), PGCE Secondary" />
            <TextArea id="qualifications" label="Other qualifications and training" value={v.qualifications} onChange={(x) => set("qualifications", x)} hint="Degrees, teaching qualifications and recent training, with the institution and year." rows={4} />
            <TextArea id="islamicQualifications" label="Islamic qualifications, ijazah or study" value={v.islamicQualifications} onChange={(x) => set("islamicQualifications", x)} hint="For example Qur'an study, an ijazah, an alimiyyah course or Arabic study, with where and with whom. An ijazah is welcome but not required." rows={4} />
            <Part title="What you teach" />
            <Checks id="subjects" legend="Subjects or areas you can teach" options={SUBJECTS} value={v.subjects} onChange={(x) => set("subjects", x)} error={errors.subjects} hint="Choose all that apply." />
            <Checks id="yearGroups" legend="Year groups you have taught" options={YEAR_GROUPS} value={v.yearGroups} onChange={(x) => set("yearGroups", x)} required={false} />
            <TextInput id="languages" label="Languages you speak" value={v.languages} onChange={(x) => set("languages", x)} maxLength={300} placeholder="e.g. English, Arabic, Urdu" />
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="f-yearsExperience" className="block text-sm font-medium text-ink">
                  Teaching experience <span className="text-red-700" aria-hidden="true">*</span>
                </label>
                <div className="mt-1">
                  <Dropdown id="f-yearsExperience" value={v.yearsExperience} onChange={(x) => set("yearsExperience", x)} options={YEARS_EXPERIENCE} placeholder="Choose" invalid={!!errors.yearsExperience} required />
                </div>
                <Err id="yearsExperience" msg={errors.yearsExperience} />
              </div>
            </div>
            <Radios id="onlineExperience" legend="Have you taught live online?" options={ONLINE_EXPERIENCE} value={v.onlineExperience} onChange={(x) => set("onlineExperience", x)} error={errors.onlineExperience} />

            <div>
              <h3 className="font-semibold text-ink">Employment history</h3>
              <p className="mt-1 text-sm text-ink/70">
                Please list your jobs, most recent first, including any not in teaching. Schools must check a full history, so please don&apos;t leave gaps unexplained.
              </p>
              <ol className="mt-4 space-y-4">
                {v.employment.map((j, i) => (
                  <li key={i} className="rounded-xl border border-gold-light/60 bg-cream/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{i === 0 ? "Most recent job" : `Job ${i + 1}`}</p>
                      {v.employment.length > 1 && (
                        <button type="button" onClick={() => set("employment", v.employment.filter((_, n) => n !== i))} className="text-sm font-medium text-red-700 underline underline-offset-2">
                          Remove<span className="sr-only"> job {i + 1}</span>
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextInput id={`employment.${i}.employer`} label="Employer" required value={j.employer} onChange={(x) => setJob(i, { employer: x })} error={errors[`employment.${i}.employer`]} maxLength={160} />
                      <TextInput id={`employment.${i}.role`} label="Job title" required value={j.role} onChange={(x) => setJob(i, { role: x })} error={errors[`employment.${i}.role`]} maxLength={160} />
                      <TextInput id={`employment.${i}.from`} label="From (year and month)" required type="month" value={j.from} onChange={(x) => setJob(i, { from: x })} error={errors[`employment.${i}.from`]} maxLength={7} placeholder="2021-09" />
                      {!j.current && <TextInput id={`employment.${i}.to`} label="To (year and month)" required type="month" value={j.to} onChange={(x) => setJob(i, { to: x })} error={errors[`employment.${i}.to`]} maxLength={7} placeholder="2024-07" />}
                    </div>
                    <div className="mt-3">
                      <Tick id={`employment.${i}.current`} checked={j.current} onChange={(x) => setJob(i, { current: x, to: x ? "" : j.to })}>
                        I still work here
                      </Tick>
                    </div>
                    <div className="mt-3">
                      <TextInput id={`employment.${i}.reason`} label={j.current ? "Why are you looking to move?" : "Reason for leaving"} value={j.reason} onChange={(x) => setJob(i, { reason: x })} maxLength={400} />
                    </div>
                  </li>
                ))}
              </ol>
              {v.employment.length < 12 && (
                <button type="button" onClick={() => set("employment", [...v.employment, blankJob()])} className={`${secondaryBtn} mt-4`}>
                  Add another job
                </button>
              )}
              {v.yearsExperience === "none" && <p className="mt-2 text-sm text-ink/65">If you haven&apos;t worked yet, you can leave the job boxes empty.</p>}
            </div>
            <TextArea id="employmentGaps" label="Gaps in your employment or education" value={v.employmentGaps} onChange={(x) => set("employmentGaps", x)} hint="Please explain any gap of more than a month since leaving school, for example travel, study or caring for family." rows={3} maxLength={2000} />
          </>
        )}

        {step === 3 && (
          <>
            <Radios id="hoursPreference" legend="What hours are you looking for?" options={HOURS_PREFERENCE} value={v.hoursPreference} onChange={(x) => set("hoursPreference", x)} error={errors.hoursPreference} />
            <Checks id="availableDays" legend="Which days could you teach?" options={DAYS} value={v.availableDays} onChange={(x) => set("availableDays", x)} error={errors.availableDays} hint="Lessons run in the UK school day, UK time." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput id="earliestStart" label="Earliest start date" value={v.earliestStart} onChange={(x) => set("earliestStart", x)} maxLength={120} placeholder="e.g. January 2027" />
              <TextInput id="noticePeriod" label="Notice period" value={v.noticePeriod} onChange={(x) => set("noticePeriod", x)} maxLength={120} placeholder="e.g. Half a term" />
            </div>
            <Tick id="hasEquipment" checked={v.hasEquipment} onChange={(x) => set("hasEquipment", x)}>
              I have a computer with a camera and microphone, a quiet place to teach and reliable internet.
            </Tick>
            <TextArea
              id="statement"
              label="Supporting statement"
              required
              value={v.statement}
              onChange={(x) => set("statement", x)}
              error={errors.statement}
              rows={10}
              maxLength={STATEMENT_MAX}
              showCount
              hint="Tell us how your skills and experience match the role. Give examples of your teaching, how you help pupils make progress, and how you keep them safe and engaged online."
            />
            <TextArea id="whyTga" label="Why would you like to teach at Tarbiyyah Global Academy?" value={v.whyTga} onChange={(x) => set("whyTga", x)} rows={4} maxLength={3000} />
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h3 className="font-semibold text-ink">References</h3>
              <p className="mt-1 text-sm text-ink/70">
                Please give two referees. One must be your current or most recent employer; if you work with children now, it should be that employer. Referees can&apos;t be relatives or people who only know you as a friend.
              </p>
              <ol className="mt-4 space-y-4">
                {v.referees.map((r, i) => (
                  <li key={i} className="rounded-xl border border-gold-light/60 bg-cream/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">
                        Referee {i + 1}
                        {i === 0 ? " (current or most recent employer)" : i === 2 ? " (optional)" : ""}
                      </p>
                      {i === 2 && (
                        <button type="button" onClick={() => set("referees", v.referees.slice(0, 2))} className="text-sm font-medium text-red-700 underline underline-offset-2">
                          Remove<span className="sr-only"> referee 3</span>
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextInput id={`referees.${i}.name`} label="Name" required value={r.name} onChange={(x) => setRef(i, { name: x })} error={errors[`referees.${i}.name`]} maxLength={120} />
                      <TextInput id={`referees.${i}.position`} label="Their job title" value={r.position} onChange={(x) => setRef(i, { position: x })} maxLength={120} />
                      <TextInput id={`referees.${i}.organisation`} label="School or organisation" required value={r.organisation} onChange={(x) => setRef(i, { organisation: x })} error={errors[`referees.${i}.organisation`]} maxLength={160} />
                      <TextInput id={`referees.${i}.relationship`} label="How they know you" required value={r.relationship} onChange={(x) => setRef(i, { relationship: x })} error={errors[`referees.${i}.relationship`]} maxLength={160} placeholder="e.g. My line manager since 2022" />
                      <TextInput id={`referees.${i}.email`} label="Work email" required type="email" inputMode="email" value={r.email} onChange={(x) => setRef(i, { email: x })} error={errors[`referees.${i}.email`]} maxLength={254} />
                      <TextInput id={`referees.${i}.phone`} label="Phone" type="tel" inputMode="tel" value={r.phone} onChange={(x) => setRef(i, { phone: x })} maxLength={40} />
                    </div>
                    <div className="mt-3">
                      <Tick id={`referees.${i}.contactBeforeInterview`} checked={r.contactBeforeInterview} onChange={(x) => setRef(i, { contactBeforeInterview: x })}>
                        You may contact this referee before my interview
                      </Tick>
                    </div>
                  </li>
                ))}
              </ol>
              {v.referees.length < 3 && (
                <button type="button" onClick={() => set("referees", [...v.referees, blankReferee()])} className={`${secondaryBtn} mt-4`}>
                  Add a third referee
                </button>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-ink">Documents</h3>
              <div className="mt-3 space-y-5">
                <div>
                  <label htmlFor="f-cv" className="block text-sm font-medium text-ink">
                    Your CV <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <p id="cv-hint" className="text-xs text-ink/65">PDF or Word, up to 10 MB.</p>
                  <input id="f-cv" type="file" accept={CV_ACCEPT} onChange={pickCv} aria-invalid={errors.cv ? true : undefined} aria-describedby={`cv-hint${errors.cv ? " cv-err" : ""}`} className="mt-2 block w-full text-sm text-ink file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-gold-500 file:bg-white file:px-4 file:font-semibold file:text-ink hover:file:bg-cream" />
                  {cv && <p className="mt-1 text-sm text-ink/80">Attached: {cv.name}</p>}
                  <Err id="cv" msg={errors.cv} />
                </div>
                <div>
                  <label htmlFor="f-documents" className="block text-sm font-medium text-ink">
                    Supporting documents <span className="font-normal text-ink/60">(optional)</span>
                  </label>
                  <p id="documents-hint" className="text-xs text-ink/65">Up to {MAX_DOCUMENTS}: for example certificates or an ijazah. PDF, Word, JPG or PNG, up to 10 MB each.</p>
                  <input id="f-documents" type="file" multiple accept={DOC_ACCEPT} onChange={pickDocs} disabled={docs.length >= MAX_DOCUMENTS} aria-describedby={`documents-hint${errors.documents ? " documents-err" : ""}`} className="mt-2 block w-full text-sm text-ink file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-gold-500 file:bg-white file:px-4 file:font-semibold file:text-ink hover:file:bg-cream" />
                  {docs.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-ink/80">
                      {docs.map((d, i) => (
                        <li key={`${d.name}-${i}`} className="flex flex-wrap items-center gap-2">
                          <span>{d.name}</span>
                          <button type="button" onClick={() => setDocs(docs.filter((_, n) => n !== i))} className="text-sm font-medium text-red-700 underline underline-offset-2">
                            Remove<span className="sr-only"> {d.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Err id="documents" msg={errors.documents} />
                </div>
              </div>
              <p className="mt-3 text-xs text-ink/65">For your privacy, files aren&apos;t saved in your draft. If you leave this page, please attach them again.</p>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <Radios id="dbsStatus" legend="Criminal record check" options={DBS_STATUS} value={v.dbsStatus} onChange={(x) => set("dbsStatus", x)} error={errors.dbsStatus} hint="We recruit internationally, so we know many teachers don't have a UK DBS. Just tell us what applies to you; if you are shortlisted we agree the right checks for where you live." />
            <div>
              <label htmlFor="f-howHeard" className="block text-sm font-medium text-ink">
                Where did you hear about this role? <span className="font-normal text-ink/60">(optional)</span>
              </label>
              <div className="mt-1 max-w-md">
                <Dropdown id="f-howHeard" value={v.howHeard} onChange={(x) => set("howHeard", x)} options={HOW_HEARD.map((h) => ({ value: h, label: h }))} placeholder="Choose" />
              </div>
            </div>

            <div className="rounded-xl border border-gold-light/60 bg-cream/50 p-4 text-sm text-ink/85">
              <h3 className="font-semibold text-ink">Check your answers</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-[12rem_1fr]">
                <dt className="text-ink/65">Role</dt>
                <dd>{roleTitle || "Not chosen"}</dd>
                <dt className="text-ink/65">Name</dt>
                <dd>{`${v.title} ${v.firstName} ${v.lastName}`.trim()}</dd>
                <dt className="text-ink/65">Email and phone</dt>
                <dd className="break-words">{v.email} · {v.phone}</dd>
                <dt className="text-ink/65">Teacher status</dt>
                <dd>{labelFor(TEACHER_STATUS, v.teacherStatus)}</dd>
                <dt className="text-ink/65">Subjects</dt>
                <dd>{v.subjects.join(", ")}</dd>
                <dt className="text-ink/65">Most recent job</dt>
                <dd>{v.employment[0]?.role ? `${v.employment[0].role}, ${v.employment[0].employer} (${monthLabel(v.employment[0].from)} to ${v.employment[0].current ? "present" : monthLabel(v.employment[0].to)})` : "None given"}</dd>
                <dt className="text-ink/65">Referees</dt>
                <dd>{v.referees.filter((r) => r.name.trim()).map((r) => r.name).join(", ")}</dd>
                <dt className="text-ink/65">CV</dt>
                <dd>{cv?.name || "Not attached"}</dd>
              </dl>
              <p className="mt-3">
                <button type="button" onClick={() => setStep(0)} className={linkBtn}>Change my answers</button>
              </p>
            </div>

            <div className="rounded-xl border border-gold-light/60 p-4 text-sm text-ink/85">
              <h3 className="font-semibold text-ink">Our commitment to safeguarding</h3>
              <p className="mt-1">
                Tarbiyyah Global Academy is committed to safeguarding and promoting the welfare of children and expects all staff to share this commitment. If you are shortlisted, we ask you to complete a self-disclosure, take up references (before interview where you allow it), verify your identity and qualifications, and carry out the criminal record checks that fit where you live: an enhanced DBS in the UK, or a police certificate or equivalent from your country. Where no such check exists, we agree alternative checks with you. We may also carry out online searches on shortlisted candidates.
              </p>
            </div>

            <Tick id="declarationTrue" checked={v.declarationTrue} onChange={(x) => set("declarationTrue", x)} error={errors.declarationTrue}>
              I confirm that the information I have given is true and complete. I understand that giving false information, or leaving out relevant information, may mean my application is rejected or any appointment is ended.
            </Tick>
            <Tick id="consentData" checked={v.consentData} onChange={(x) => set("consentData", x)} error={errors.consentData}>
              I agree to Tarbiyyah Global Academy using my information to consider my application, as described in the{" "}
              <a href="/legal/privacy/" target="_blank" rel="noopener noreferrer" className={linkBtn}>
                privacy policy<span className="sr-only"> (opens in a new tab)</span>
              </a>
              . If I am not successful, my application is deleted six months after the decision.
            </Tick>
            <TextInput id="declarationName" label="Type your full name to sign" required value={v.declarationName} onChange={(x) => set("declarationName", x)} error={errors.declarationName} maxLength={160} autoComplete="name" />
          </>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-gold-light/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {step > 0 ? (
          <button type="button" onClick={back} className={secondaryBtn} disabled={phase === "submitting"}>
            Back
          </button>
        ) : (
          <span className="text-xs text-ink/65">Your answers are saved on this device as you go.</span>
        )}
        <button type="submit" className={primaryBtn} disabled={phase === "submitting"}>
          {step < STEPS.length - 1 ? "Save and continue" : phase === "submitting" ? "Sending your application…" : "Submit my application"}
        </button>
      </div>
    </form>
  );
}
