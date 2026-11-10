"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { askConfirm, Loading } from "@/components/learn/kit";
import { ui } from "@/components/learn/ui";
import { validPhone } from "./data";

/** The pupil_details columns staff edit here. */
const FIELDS = [
  "gender",
  "address_line1",
  "address_line2",
  "town",
  "postcode",
  "home_language",
  "previous_school",
  "gp_name",
  "gp_phone",
  "medical_conditions",
  "allergies",
  "medication",
  "dietary_needs",
  "sen_notes",
  "photo_consent",
  "trip_consent",
] as const;
type Field = (typeof FIELDS)[number];
type Details = Record<Field, string | boolean | null>;
type Contact = {
  key: string;
  id: string | null;
  name: string;
  relationship: string;
  phone: string;
  alt_phone: string;
  email: string;
  is_authorised_collector: boolean;
  parental_responsibility: boolean;
  removed?: boolean;
};

const EMPTY: Details = Object.fromEntries(FIELDS.map((f) => [f, null])) as Details;

const SECTIONS: { id: string; label: string; fields: Field[] | "contacts" }[] = [
  { id: "home", label: "Home", fields: ["gender", "address_line1", "address_line2", "town", "postcode", "home_language", "previous_school"] },
  { id: "health", label: "Health", fields: ["gp_name", "gp_phone", "medical_conditions", "allergies", "medication", "dietary_needs"] },
  { id: "support", label: "Support needs", fields: ["sen_notes"] },
  { id: "contacts", label: "Emergency contacts", fields: "contacts" },
  { id: "consents", label: "Consents", fields: ["photo_consent", "trip_consent"] },
];

const input = `${ui.input} mt-1`;
const same = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");
const contactKey = (c: Contact) => JSON.stringify([c.name, c.relationship, c.phone, c.alt_phone, c.email, c.is_authorised_collector, c.parental_responsibility, !!c.removed]);

/**
 * Staff edit a pupil's details on one page (owner, Nov 2026): Home, Health,
 * Support needs, Emergency contacts and Consents, with a list of sections
 * that marks what has changed and one Save bar for everything. Families keep
 * their own step-by-step form; this is for the office (head teacher and
 * admin, as RLS allows). Every change is written to the audit log by the
 * existing triggers.
 */
export function PupilDetailsEditor({ id }: { id: string }) {
  const [name, setName] = useState<string>("");
  const [orig, setOrig] = useState<Details | null>(null);
  const [form, setForm] = useState<Details>(EMPTY);
  const [origContacts, setOrigContacts] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [c, d, e] = await Promise.all([
        supabase.from("children").select("name").eq("id", id).maybeSingle(),
        supabase.from("pupil_details").select(FIELDS.join(", ")).eq("child_id", id).maybeSingle(),
        supabase.from("pupil_emergency_contacts").select("id, name, relationship, phone, alt_phone, email, is_authorised_collector, parental_responsibility, priority").eq("child_id", id).order("priority"),
      ]);
      if (!alive) return;
      setName((c.data as { name: string } | null)?.name || "Pupil");
      const det = { ...EMPTY, ...((d.data as unknown as Partial<Details> | null) || {}) };
      setOrig(det);
      setForm(det);
      const list = ((e.data as Omit<Contact, "key">[] | null) || []).map((x) => ({ ...x, key: x.id || "", alt_phone: x.alt_phone || "", email: x.email || "" }));
      setOrigContacts(list);
      setContacts(list);
    })();
    return () => {
      alive = false;
    };
  }, [id, reload]);

  const changedFields = useMemo(() => (orig ? FIELDS.filter((f) => !same(form[f], orig[f])) : []), [form, orig]);
  const contactsChanged = useMemo(() => {
    const before = new Map(origContacts.map((c) => [c.key, contactKey(c)]));
    return contacts.some((c) => !c.id || before.get(c.key) !== contactKey(c));
  }, [contacts, origContacts]);
  const sectionChanged = (s: (typeof SECTIONS)[number]) => (s.fields === "contacts" ? contactsChanged : s.fields.some((f) => changedFields.includes(f)));
  const changedCount = SECTIONS.filter(sectionChanged).length;

  const set = (f: Field, v: string | boolean | null) => setForm((p) => ({ ...p, [f]: v }));
  const text = (f: Field) => (typeof form[f] === "string" ? (form[f] as string) : "");
  const patchContact = (key: string, patch: Partial<Contact>) => setContacts((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const live = contacts.filter((c) => !c.removed);
    const bad = live.find((c) => !c.name.trim() || !c.phone.trim() || !validPhone(c.phone));
    if (bad) return setMsg({ tone: "err", text: `Each emergency contact needs a name and a valid phone number${bad.name ? ` (check ${bad.name})` : ""}.` });
    if (text("gp_phone").trim() && !validPhone(text("gp_phone"))) return setMsg({ tone: "err", text: "The GP's phone number doesn't look right." });
    setBusy(true);
    setMsg(null);
    let failed = "";
    if (changedFields.length) {
      const row: Record<string, unknown> = { child_id: id };
      for (const f of changedFields) {
        const v = form[f];
        row[f] = typeof v === "string" ? v.trim() || null : v;
      }
      const { error } = await supabase.from("pupil_details").upsert(row, { onConflict: "child_id" });
      if (error) failed = "the details";
    }
    if (contactsChanged) {
      for (const c of contacts.filter((x) => x.removed && x.id)) {
        const { error } = await supabase.from("pupil_emergency_contacts").delete().eq("id", c.id!);
        if (error) failed ||= "a contact";
      }
      const before = new Map(origContacts.map((c) => [c.key, contactKey(c)]));
      for (const [i, c] of live.entries()) {
        if (c.id && before.get(c.key) === contactKey(c)) continue;
        const row = {
          child_id: id,
          name: c.name.trim(),
          relationship: c.relationship.trim(),
          phone: c.phone.trim(),
          alt_phone: c.alt_phone.trim() || null,
          email: c.email.trim() || null,
          is_authorised_collector: c.is_authorised_collector,
          parental_responsibility: c.parental_responsibility,
          priority: i + 1,
        };
        const { error } = c.id ? await supabase.from("pupil_emergency_contacts").update(row).eq("id", c.id) : await supabase.from("pupil_emergency_contacts").insert(row);
        if (error) failed ||= "a contact";
      }
    }
    setBusy(false);
    if (failed) return setMsg({ tone: "err", text: `Some changes could not be saved (${failed}). Nothing else was lost; try again.` });
    setMsg({ tone: "ok", text: "Saved. The family sees the same details in their account." });
    setReload((r) => r + 1);
  };

  const discard = async () => {
    if (!(await askConfirm("Discard your changes? Everything you changed on this page since the last save goes back to how it was.", { confirmLabel: "Discard", danger: true }))) return;
    if (orig) setForm(orig);
    setContacts(origContacts);
    setMsg(null);
  };

  const crumbs = [
    { label: "Today", href: "/admin/dashboard" },
    { label: "Pupils", href: "/admin/pupils" },
    { label: name || "Pupil", href: `/admin/pupils?id=${id}` },
    { label: "Edit details" },
  ];

  if (!orig) return <Loading label="Loading the pupil's details" />;

  // Plain render helpers, not components: a component made inside render would
  // remount its input on every keystroke and lose focus.
  const field = (f: Field, label: string, hint?: string, area?: boolean) => (
    <label key={f} className="block text-sm font-medium text-ink">
      {label}
      {hint && <span className="block text-xs font-normal text-ink/65">{hint}</span>}
      {area ? <textarea rows={2} value={text(f)} onChange={(e) => set(f, e.target.value)} className={input} /> : <input value={text(f)} onChange={(e) => set(f, e.target.value)} className={input} />}
    </label>
  );
  const consent = (f: Field, label: string, hint: string) => {
    const v = form[f];
    const opts: [boolean | null, string, string][] = [
      [true, "Given", "bg-forest-100 text-forest-900"],
      [false, "Refused", "bg-red-50 text-red-800"],
      [null, "Not asked", "bg-cream text-ink"],
    ];
    return (
      <div key={f} className="flex flex-wrap items-center gap-3 border-t border-gold-light/70 py-3 first:border-t-0">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-ink/65">{hint}</p>
        </div>
        <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-xl border border-gold-light bg-white p-1">
          {opts.map(([val, l, on]) => (
            <button key={l} type="button" aria-pressed={v === val} onClick={() => set(f, val)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${v === val ? on : "text-ink/65 hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader crumbs={crumbs} title={`Edit ${name.split(/\s+/)[0]}'s details`} subtitle="Every section on one page. Changes save together and are logged." />
      <div className="flex flex-col gap-6 pb-24 lg:flex-row lg:items-start">
        <nav aria-label="Sections" className="lg:sticky lg:top-24 lg:w-56 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a href={`#${s.id}`} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 text-sm text-ink/80 hover:bg-cream hover:text-ink">
                  {s.label}
                  {sectionChanged(s) && (
                    <span className="h-2 w-2 rounded-full bg-gold-500">
                      <span className="sr-only">changed</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 hidden px-3 text-xs text-ink/60 lg:block">
            Name, year group and classes are under{" "}
            <Link href={`/admin/pupils?id=${id}`} className="font-medium text-teal-700 hover:underline">
              Edit pupil
            </Link>{" "}
            on the record.
          </p>
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          <section id="home" aria-labelledby="home-h" className={`${ui.card} scroll-mt-24 space-y-4`}>
            <h2 id="home-h" className="text-base font-semibold text-ink">
              Home
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block text-sm font-medium text-ink">
                <span id="gender-l">Gender</span>
                <div role="group" aria-labelledby="gender-l" className="mt-1 flex gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <button key={g} type="button" aria-pressed={form.gender === g} onClick={() => set("gender", g)} className={form.gender === g ? ui.chipOn : ui.chip}>
                      {g === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </div>
              {field("home_language", "Language spoken at home")}
              {field("address_line1", "Address")}
              {field("address_line2", "Address line 2")}
              {field("town", "Town or city")}
              {field("postcode", "Postcode")}
              {field("previous_school", "Previous school")}
            </div>
          </section>

          <section id="health" aria-labelledby="health-h" className={`${ui.card} scroll-mt-24 space-y-4`}>
            <h2 id="health-h" className="text-base font-semibold text-ink">
              Health
            </h2>
            <p className="-mt-2 text-sm text-ink/65">Shown to every adult who teaches this pupil. Write &ldquo;None&rdquo; where there is nothing.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("gp_name", "GP surgery")}
              <div className="block text-sm font-medium text-ink">
                <label htmlFor="gp-phone">GP phone</label>
                <PhoneInput id="gp-phone" value={text("gp_phone")} onChange={(v) => set("gp_phone", v)} inputClassName={ui.input} />
              </div>
              {field("medical_conditions", "Medical conditions", undefined, true)}
              {field("allergies", "Allergies", undefined, true)}
              {field("medication", "Medication", undefined, true)}
              {field("dietary_needs", "Dietary needs", undefined, true)}
            </div>
          </section>

          <section id="support" aria-labelledby="support-h" className={`${ui.card} scroll-mt-24 space-y-3`}>
            <h2 id="support-h" className="text-base font-semibold text-ink">
              Support needs
            </h2>
            {field("sen_notes", "What helps this pupil learn", "Plans and reviews are in the Support plan tab of the record.", true)}
          </section>

          <section id="contacts" aria-labelledby="contacts-h" className={`${ui.card} scroll-mt-24 space-y-3`}>
            <h2 id="contacts-h" className="text-base font-semibold text-ink">
              Emergency contacts
            </h2>
            <p className="-mt-1 text-sm text-ink/65">Called in this order.</p>
            {contacts.filter((c) => !c.removed).length === 0 && <p className="text-sm text-ink/65">No contacts yet.</p>}
            {contacts.map((c, i) =>
              c.removed ? null : (
                <fieldset key={c.key} className="rounded-xl border border-gold-light p-4">
                  <legend className="px-1 text-sm font-semibold text-ink">{c.name.trim() || `Contact ${i + 1}`}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-ink">
                      Name
                      <input value={c.name} onChange={(e) => patchContact(c.key, { name: e.target.value })} className={input} />
                    </label>
                    <label className="block text-sm font-medium text-ink">
                      Relationship
                      <input value={c.relationship} onChange={(e) => patchContact(c.key, { relationship: e.target.value })} className={input} />
                    </label>
                    <div className="block text-sm font-medium text-ink">
                      <label htmlFor={`ph-${c.key}`}>Phone</label>
                      <PhoneInput id={`ph-${c.key}`} value={c.phone} onChange={(v) => patchContact(c.key, { phone: v })} inputClassName={ui.input} />
                    </div>
                    <div className="block text-sm font-medium text-ink">
                      <label htmlFor={`ph2-${c.key}`}>Second phone (optional)</label>
                      <PhoneInput id={`ph2-${c.key}`} value={c.alt_phone} onChange={(v) => patchContact(c.key, { alt_phone: v })} inputClassName={ui.input} />
                    </div>
                    <label className="block text-sm font-medium text-ink sm:col-span-2">
                      Email (optional)
                      <input type="email" value={c.email} onChange={(e) => patchContact(c.key, { email: e.target.value })} className={input} />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={c.parental_responsibility} onChange={(e) => patchContact(c.key, { parental_responsibility: e.target.checked })} className="h-4 w-4 accent-forest-700" />
                      Parental responsibility
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={c.is_authorised_collector} onChange={(e) => patchContact(c.key, { is_authorised_collector: e.target.checked })} className="h-4 w-4 accent-forest-700" />
                      Can collect
                    </label>
                    <button type="button" onClick={() => patchContact(c.key, { removed: true })} className={`${ui.btnLinkDanger} ml-auto`}>
                      Remove
                    </button>
                  </div>
                </fieldset>
              ),
            )}
            <button
              type="button"
              onClick={() =>
                setContacts((cs) => [...cs, { key: `new-${Date.now()}`, id: null, name: "", relationship: "", phone: "", alt_phone: "", email: "", is_authorised_collector: false, parental_responsibility: false }])
              }
              className={`${ui.btnSecondary} ${ui.sm}`}
            >
              Add a contact
            </button>
          </section>

          <section id="consents" aria-labelledby="consents-h" className={`${ui.card} scroll-mt-24`}>
            <h2 id="consents-h" className="text-base font-semibold text-ink">
              Consents
            </h2>
            <p className="mb-2 text-sm text-ink/65">&ldquo;Not asked&rdquo; is different from &ldquo;Refused&rdquo;: ask the family before a trip or photo.</p>
            {consent("photo_consent", "Photos in school materials", "Website, prospectus and newsletters")}
            {consent("trip_consent", "Educational visits", "Trips during the school day")}
          </section>
        </div>
      </div>

      <div role="region" aria-label="Save changes" className="fixed inset-x-0 bottom-0 z-30 border-t border-gold-light bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(18,50,31,0.08)] backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <p role="status" className={`text-sm ${msg ? (msg.tone === "err" ? "text-red-800" : "text-forest-800") : "text-ink/70"}`}>
            {msg ? msg.text : changedCount ? `${changedCount} section${changedCount === 1 ? "" : "s"} changed` : "No changes yet"}
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={discard} disabled={busy || !changedCount} className={ui.btnSecondary}>
              Discard
            </button>
            <button type="button" onClick={save} disabled={busy || !changedCount} className={ui.btnPrimary}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
