"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  CONTACT_SELECT,
  DETAILS_SELECT,
  ProgressBar,
  completeness,
  Required,
  UK_POSTCODE,
  fieldCls,
  formatDob,
  formatStamp,
  validPhone,
  type EmergencyContact,
  type PupilDetails,
} from "./data";

type Child = { id: string; name: string; dob: string | null };
type StepKey = "basics" | "health" | "contacts" | "consents";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "basics", label: "Basics" },
  { key: "health", label: "Health" },
  { key: "contacts", label: "Emergency contacts" },
  { key: "consents", label: "Consents" },
];

type Form = {
  gender: "" | "male" | "female";
  address_line1: string;
  address_line2: string;
  town: string;
  postcode: string;
  home_language: string;
  ethnicity: string;
  previous_school: string;
  siblings_at_school: string;
  gp_name: string;
  gp_phone: string;
  medical_conditions: string;
  allergies: string;
  medication: string;
  dietary_needs: string;
  sen_notes: string;
  health_confirmed: boolean;
  photo_consent: "" | "yes" | "no";
  trip_consent: "" | "yes" | "no";
};

const EMPTY: Form = {
  gender: "",
  address_line1: "",
  address_line2: "",
  town: "",
  postcode: "",
  home_language: "",
  ethnicity: "",
  previous_school: "",
  siblings_at_school: "",
  gp_name: "",
  gp_phone: "",
  medical_conditions: "",
  allergies: "",
  medication: "",
  dietary_needs: "",
  sen_notes: "",
  health_confirmed: false,
  photo_consent: "",
  trip_consent: "",
};

type FieldErrors = Partial<Record<string, string>>;

/** Inline validation per section. Everything marked Required in the form is checked here. */
function validate(step: StepKey, f: Form): FieldErrors {
  const e: FieldErrors = {};
  if (step === "basics") {
    if (!f.gender) e.gender = "Please choose male or female.";
    if (!f.address_line1.trim()) e.address_line1 = "Please enter the first line of the home address.";
    if (!f.postcode.trim()) e.postcode = "Please enter the postcode.";
    else if (!UK_POSTCODE.test(f.postcode.trim())) e.postcode = "That doesn't look like a UK postcode, e.g. NW1 6XE.";
  }
  if (step === "health") {
    if (!f.gp_name.trim()) e.gp_name = "Please enter your GP's name or surgery.";
    if (!f.gp_phone.trim()) e.gp_phone = "Please enter your GP's phone number.";
    else if (!validPhone(f.gp_phone)) e.gp_phone = "Please enter a valid phone number.";
    if (!f.health_confirmed) e.health_confirmed = "Please tick the box to confirm you've checked this page.";
  }
  if (step === "consents") {
    if (!f.photo_consent) e.photo_consent = "Please answer yes or no.";
    if (!f.trip_consent) e.trip_consent = "Please answer yes or no.";
  }
  return e;
}

const yn = (v: boolean | null): "" | "yes" | "no" => (v === null || v === undefined ? "" : v ? "yes" : "no");

function toForm(d: PupilDetails | null): Form {
  if (!d) return EMPTY;
  return {
    gender: d.gender || "",
    address_line1: d.address_line1 || "",
    address_line2: d.address_line2 || "",
    town: d.town || "",
    postcode: d.postcode || "",
    home_language: d.home_language || "",
    ethnicity: d.ethnicity || "",
    previous_school: d.previous_school || "",
    siblings_at_school: d.siblings_at_school || "",
    gp_name: d.gp_name || "",
    gp_phone: d.gp_phone || "",
    medical_conditions: d.medical_conditions || "",
    allergies: d.allergies || "",
    medication: d.medication || "",
    dietary_needs: d.dietary_needs || "",
    sen_notes: d.sen_notes || "",
    health_confirmed: d.health_confirmed,
    photo_consent: yn(d.photo_consent),
    trip_consent: yn(d.trip_consent),
  };
}

const text = (v: string) => (v.trim() === "" ? null : v.trim());

type Draft = {
  key: string; // contact id, or "new-N" until saved
  id: string | null;
  name: string;
  relationship: string;
  phone: string;
  alt_phone: string;
  email: string;
  is_authorised_collector: boolean;
  parental_responsibility: boolean;
  dirty: boolean;
  error?: string;
};

const toDraft = (c: EmergencyContact): Draft => ({
  key: c.id,
  id: c.id,
  name: c.name,
  relationship: c.relationship,
  phone: c.phone,
  alt_phone: c.alt_phone || "",
  email: c.email || "",
  is_authorised_collector: c.is_authorised_collector,
  parental_responsibility: c.parental_responsibility,
  dirty: false,
});

export function ChildDetailsForm() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState("");
  const [details, setDetails] = useState<PupilDetails | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [step, setStep] = useState<StepKey>("basics");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // Sections the parent has tried to save: only then do empty required fields turn red.
  const [tried, setTried] = useState<Partial<Record<StepKey, boolean>>>({});

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data, error: e } = await supabase.from("children").select("id, name, dob").order("name");
      const list = (data as unknown as Child[]) || [];
      setChildren(list);
      if (e) setError("We couldn't load your children just now. Please refresh in a moment.");
      if (list.length > 0) setChildId((cur) => cur || list[0].id);
    })();
  }, []);

  const load = useCallback(async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !id) return;
    setLoading(true);
    const [d, c] = await Promise.all([
      supabase.from("pupil_details").select(DETAILS_SELECT).eq("child_id", id).maybeSingle(),
      supabase.from("pupil_emergency_contacts").select(CONTACT_SELECT).eq("child_id", id).order("priority"),
    ]);
    if (d.error || c.error) setError("Some details couldn't load. Please refresh in a moment.");
    const row = (d.data as unknown as PupilDetails | null) || null;
    setDetails(row);
    setForm(toForm(row));
    setDrafts(((c.data as unknown as EmergencyContact[]) || []).map(toDraft));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!childId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data for the chosen child
    setStep("basics");
    setSaved(null);
    setError(null);
    setTried({});
    void load(childId);
  }, [childId, load]);

  const savedContacts = drafts.filter((d) => d.id).length;
  const childDob = children?.find((c) => c.id === childId)?.dob ?? null;
  const progress = useMemo(() => completeness(details, savedContacts, childDob), [details, savedContacts, childDob]);
  const errs = useMemo<Record<StepKey, FieldErrors>>(() => ({ basics: validate("basics", form), health: validate("health", form), contacts: {}, consents: validate("consents", form) }), [form]);
  const shown = (k: StepKey): FieldErrors => (tried[k] ? errs[k] : {});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const saveFields = async (fields: Record<string, unknown>, next?: StepKey) => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return false;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("pupil_details")
      .upsert({ child_id: childId, ...fields }, { onConflict: "child_id" })
      .select(DETAILS_SELECT)
      .single();
    setBusy(false);
    if (e || !data) {
      setError("We couldn't save that just now. Please try again.");
      return false;
    }
    const row = data as unknown as PupilDetails;
    setDetails(row);
    setSaved(row.completed_at ? "Saved. Everything we need is now in. Thank you." : "Saved.");
    if (next) setStep(next);
    return true;
  };

  const saveBasics = () => {
    setTried((t) => ({ ...t, basics: true }));
    if (Object.keys(errs.basics).length > 0) return setError("Please fix the fields marked in red.");
    return saveFields(
      {
        gender: form.gender,
        address_line1: text(form.address_line1),
        address_line2: text(form.address_line2),
        town: text(form.town),
        postcode: text(form.postcode)?.toUpperCase() ?? null,
        home_language: text(form.home_language),
        ethnicity: text(form.ethnicity),
        previous_school: text(form.previous_school),
        siblings_at_school: text(form.siblings_at_school),
      },
      "health",
    );
  };

  const saveHealth = () => {
    setTried((t) => ({ ...t, health: true }));
    if (Object.keys(errs.health).length > 0) return setError("Please fix the fields marked in red. Write \"None\" where nothing applies.");
    return saveFields(
      {
        gp_name: text(form.gp_name),
        gp_phone: text(form.gp_phone),
        medical_conditions: text(form.medical_conditions),
        allergies: text(form.allergies),
        medication: text(form.medication),
        dietary_needs: text(form.dietary_needs),
        sen_notes: text(form.sen_notes),
        health_confirmed: form.health_confirmed,
      },
      "contacts",
    );
  };

  const saveConsents = () => {
    setTried((t) => ({ ...t, consents: true }));
    if (Object.keys(errs.consents).length > 0) return setError("Please answer both questions. Yes or no is fine.");
    return saveFields({ photo_consent: form.photo_consent === "yes", trip_consent: form.trip_consent === "yes" });
  };

  // ── contacts ──
  const patchDraft = (key: string, patch: Partial<Draft>) => {
    setSaved(null);
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch, dirty: true, error: undefined } : d)));
  };

  const addDraft = () =>
    setDrafts((ds) => [
      ...ds,
      { key: `new-${Date.now()}`, id: null, name: "", relationship: "", phone: "", alt_phone: "", email: "", is_authorised_collector: false, parental_responsibility: false, dirty: true },
    ]);

  const saveDraft = async (d: Draft, index: number) => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    if (!d.name.trim()) return patchDraftError(d.key, "Please enter the contact's full name.");
    if (!d.relationship.trim()) return patchDraftError(d.key, "Please say how they are related to your child.");
    if (!d.phone.trim() || !validPhone(d.phone)) return patchDraftError(d.key, "Please enter a valid phone number.");
    setBusy(true);
    setError(null);
    const payload = {
      child_id: childId,
      name: d.name.trim(),
      relationship: d.relationship.trim(),
      phone: d.phone.trim(),
      alt_phone: text(d.alt_phone),
      email: text(d.email),
      is_authorised_collector: d.is_authorised_collector,
      parental_responsibility: d.parental_responsibility,
      priority: index + 1,
    };
    const res = d.id ? await supabase.from("pupil_emergency_contacts").update(payload).eq("id", d.id) : await supabase.from("pupil_emergency_contacts").insert(payload);
    setBusy(false);
    if (res.error) return patchDraftError(d.key, "We couldn't save this contact. Please try again.");
    setSaved("Contact saved.");
    await load(childId);
    setStep("contacts");
  };

  const patchDraftError = (key: string, message: string) => setDrafts((ds) => ds.map((x) => (x.key === key ? { ...x, error: message } : x)));

  const removeDraft = async (d: Draft) => {
    if (d.id) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      setBusy(true);
      const { error: e } = await supabase.from("pupil_emergency_contacts").delete().eq("id", d.id);
      setBusy(false);
      if (e) return setError("We couldn't remove that contact. Please try again.");
      await load(childId);
      setStep("contacts");
    } else {
      setDrafts((ds) => ds.filter((x) => x.key !== d.key));
    }
  };

  const stepOk = (k: StepKey) => {
    const miss = new Set(progress.missing);
    if (k === "basics") return !miss.has("basics") && !miss.has("address");
    if (k === "health") return !miss.has("gp") && !miss.has("health");
    if (k === "contacts") return !miss.has("contacts");
    return !miss.has("consents");
  };

  const nextStep = (k: StepKey) => STEPS[STEPS.findIndex((s) => s.key === k) + 1]?.key;
  const childName = children?.find((c) => c.id === childId)?.name || "your child";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/family/dashboard" }, { label: "Child details" }]}
        title="Child details"
        subtitle="The information every school needs: home, health, who to call in an emergency, and your consents. Each section saves as you go."
      />

      {children !== null && children.length === 0 && (
        <p className="rounded-2xl border border-gold-light bg-white p-4 text-sm text-ink/60">There are no children on your account yet. Once your child is enrolled you can fill in their details here.</p>
      )}

      {children !== null && children.length > 0 && (
        <div className="space-y-4">
          {children.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a child">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={childId === c.id}
                  onClick={() => setChildId(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${childId === c.id ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <section className="rounded-2xl border border-gold-light bg-white p-4" aria-label="Progress">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{childName}</h2>
              <p className="text-sm text-ink/60">{progress.percent}% complete{details?.completed_at ? ` · finished ${formatStamp(details.completed_at)}` : ""}</p>
            </div>
            <div className="mt-2">
              <ProgressBar percent={progress.percent} />
            </div>
            {progress.percent < 100 ? (
              <>
                <p className="mt-2 text-xs font-medium text-red-700">Everything below is required. The bar reaches 100% only when all of it is done.</p>
                <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2" aria-label="Required items">
                  {progress.items.map((i) => (
                    <li key={i.label} className={i.ok ? "text-green-700" : "text-red-700"}>
                      <span aria-hidden="true">{i.ok ? "✓" : "○"}</span> {i.label}
                      <span className="sr-only">{i.ok ? " done" : " still required"}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-xs text-green-700">All done. You can change anything at any time and we&apos;ll keep it up to date.</p>
            )}
          </section>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sections">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={step === s.key}
                onClick={() => {
                  setStep(s.key);
                  setError(null);
                  setSaved(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${step === s.key ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
              >
                {i + 1}. {s.label}
                {stepOk(s.key) && details ? <span aria-label="done"> ✓</span> : <span className="ml-1 text-[10px] font-semibold uppercase" aria-label="required">{step === s.key ? "" : "Required"}</span>}
              </button>
            ))}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {saved && !error && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{saved}</p>}

          {loading ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : (
            <div className="rounded-2xl border border-gold-light bg-white p-4">
              {step === "basics" && (
                <div className="space-y-4">
                  <div className="text-sm">
                    <p className="font-medium text-ink">
                      Date of birth <span className="ml-1 text-xs font-semibold text-green-700">{childDob ? "✓ on record" : ""}</span>
                    </p>
                    <p className="mt-1 text-ink/75">{childDob ? formatDob(childDob) : "Not on record. Please ask the school office to add your child's date of birth."}</p>
                  </div>
                  <fieldset aria-invalid={!!shown("basics").gender}>
                    <legend className="text-sm font-medium text-ink">
                      Gender
                      <Required />
                    </legend>
                    <div className="mt-1 flex gap-4 text-sm text-ink">
                      {(["male", "female"] as const).map((g) => (
                        <label key={g} className="flex items-center gap-2">
                          <input type="radio" name="gender" checked={form.gender === g} onChange={() => set("gender", g)} /> {g === "male" ? "Male" : "Female"}
                        </label>
                      ))}
                    </div>
                    <FieldError message={shown("basics").gender} />
                  </fieldset>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Text label="Home address, line 1" required error={shown("basics").address_line1} value={form.address_line1} onChange={(v) => set("address_line1", v)} autoComplete="address-line1" />
                    <Text label="Line 2 (optional)" value={form.address_line2} onChange={(v) => set("address_line2", v)} autoComplete="address-line2" />
                    <Text label="Town or city" value={form.town} onChange={(v) => set("town", v)} autoComplete="address-level2" />
                    <Text label="Postcode" required error={shown("basics").postcode} value={form.postcode} onChange={(v) => set("postcode", v)} autoComplete="postal-code" />
                    <Text label="Language spoken at home" value={form.home_language} onChange={(v) => set("home_language", v)} />
                    <Text label="Ethnicity (optional)" value={form.ethnicity} onChange={(v) => set("ethnicity", v)} />
                    <Text label="Previous school (if any)" value={form.previous_school} onChange={(v) => set("previous_school", v)} />
                    <Text label="Brothers or sisters at the school" value={form.siblings_at_school} onChange={(v) => set("siblings_at_school", v)} />
                  </div>
                  <SaveRow busy={busy} onSave={saveBasics} label="Save and continue" />
                </div>
              )}

              {step === "health" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Text label="GP's name or surgery" required error={shown("health").gp_name} value={form.gp_name} onChange={(v) => set("gp_name", v)} />
                    <Text label="GP's phone number" required error={shown("health").gp_phone} value={form.gp_phone} onChange={(v) => set("gp_phone", v)} type="tel" />
                  </div>
                  <Area label="Medical conditions" hint="Asthma, diabetes, epilepsy and so on. Write None if there are none." value={form.medical_conditions} onChange={(v) => set("medical_conditions", v)} />
                  <Area label="Allergies" hint="Food, medicine, stings. Please say how serious." value={form.allergies} onChange={(v) => set("allergies", v)} />
                  <Area label="Regular medication" hint="What, how much, and when." value={form.medication} onChange={(v) => set("medication", v)} />
                  <Area label="Dietary needs" hint="Halal is assumed. Mention anything else, such as vegetarian or dairy-free." value={form.dietary_needs} onChange={(v) => set("dietary_needs", v)} />
                  <Area label="Additional learning needs" hint="Anything that helps us teach your child well: dyslexia, speech, hearing or sight, a plan from a previous school." value={form.sen_notes} onChange={(v) => set("sen_notes", v)} />
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" className="mt-1" checked={form.health_confirmed} onChange={(e) => set("health_confirmed", e.target.checked)} />
                    <span>
                      I&apos;ve checked this page and the information is correct. Where nothing applies, I&apos;ve written &quot;None&quot;.
                      <Required />
                    </span>
                  </label>
                  <FieldError message={shown("health").health_confirmed} />
                  <SaveRow busy={busy} onSave={saveHealth} label="Save and continue" />
                </div>
              )}

              {step === "contacts" && (
                <div className="space-y-4">
                  <p className="text-sm text-ink/70">
                    Please give at least two people we can call in an emergency, in the order we should try them. They don&apos;t have to live with you.
                    <Required />
                  </p>
                  {drafts.length === 0 && <p className="text-sm text-ink/55">No contacts yet.</p>}
                  <ul className="space-y-3">
                    {drafts.map((d, i) => (
                      <li key={d.key} className="rounded-xl border border-gold-light/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Contact {i + 1}</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <Text label="Full name" required value={d.name} onChange={(v) => patchDraft(d.key, { name: v })} />
                          <Text label="Relationship to child" required value={d.relationship} onChange={(v) => patchDraft(d.key, { relationship: v })} />
                          <Text label="Phone" required value={d.phone} onChange={(v) => patchDraft(d.key, { phone: v })} type="tel" />
                          <Text label="Second phone (optional)" value={d.alt_phone} onChange={(v) => patchDraft(d.key, { alt_phone: v })} type="tel" />
                          <Text label="Email (optional)" value={d.email} onChange={(v) => patchDraft(d.key, { email: v })} type="email" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={d.is_authorised_collector} onChange={(e) => patchDraft(d.key, { is_authorised_collector: e.target.checked })} /> Allowed to collect my child
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={d.parental_responsibility} onChange={(e) => patchDraft(d.key, { parental_responsibility: e.target.checked })} /> Has parental responsibility
                          </label>
                        </div>
                        {d.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{d.error}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={busy || (!d.dirty && !!d.id)} onClick={() => saveDraft(d, i)} className="rounded-lg bg-gold-700 px-3 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                            {d.id ? "Save changes" : "Save contact"}
                          </button>
                          <button type="button" disabled={busy} onClick={() => removeDraft(d)} className="rounded-lg border border-gold-light px-3 py-2 text-sm font-medium text-ink/70 hover:bg-cream disabled:opacity-50">
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={addDraft} className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">
                    + Add a contact
                  </button>
                  {savedContacts < 2 && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">You have {savedContacts} saved contact{savedContacts === 1 ? "" : "s"}. At least 2 are required.</p>}
                  <div>
                    <button type="button" onClick={() => setStep("consents")} className="text-sm font-medium text-teal-800 underline">
                      Continue to consents
                    </button>
                  </div>
                </div>
              )}

              {step === "consents" && (
                <div className="space-y-5">
                  <Choice
                    legend="Photographs"
                    help="May we take photographs or video of your child for school records, displays and the school's newsletters and website?"
                    value={form.photo_consent}
                    onChange={(v) => set("photo_consent", v)}
                    name="photo"
                    error={shown("consents").photo_consent}
                  />
                  <Choice
                    legend="Trips and visits"
                    help="May your child take part in local trips and visits led by the school (for example to the masjid or park)? We will always tell you first about longer or more involved trips."
                    value={form.trip_consent}
                    onChange={(v) => set("trip_consent", v)}
                    name="trip"
                    error={shown("consents").trip_consent}
                  />
                  <p className="text-xs text-ink/55">You can change your mind at any time by coming back to this page.</p>
                  <SaveRow busy={busy} onSave={saveConsents} label="Save consents" />
                  {nextStep("consents") === undefined && progress.percent === 100 && <p className="text-sm text-green-700">That&apos;s everything. Thank you.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-xs font-medium text-red-700">
      {message}
    </p>
  ) : null;
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      <span>
        {label}
        {required && <Required />}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldCls} ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
      />
      <FieldError message={error} />
    </label>
  );
}

function Area({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      {hint && <span className="mt-0.5 block text-xs font-normal text-ink/55">{hint}</span>}
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls} />
    </label>
  );
}

function Choice({ legend, help, value, onChange, name, error }: { legend: string; help: string; value: "" | "yes" | "no"; onChange: (v: "yes" | "no") => void; name: string; error?: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">
        {legend}
        <Required />
      </legend>
      <p className="mt-1 text-sm text-ink/70">{help}</p>
      <div className="mt-2 flex gap-5 text-sm text-ink">
        <label className="flex items-center gap-2">
          <input type="radio" name={name} checked={value === "yes"} onChange={() => onChange("yes")} /> Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={name} checked={value === "no"} onChange={() => onChange("no")} /> No
        </label>
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}

function SaveRow({ busy, onSave, label }: { busy: boolean; onSave: () => void; label: string }) {
  return (
    <button type="button" disabled={busy} onClick={onSave} className="w-full rounded-lg bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50 sm:w-auto">
      {busy ? "Saving…" : label}
    </button>
  );
}
