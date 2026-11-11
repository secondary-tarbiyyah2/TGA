"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { COUNTRIES } from "@/lib/countries";
import { formatTime, formatWhenWithUk as formatWhen, sameAsUk, UK_TIME_ZONE } from "@/lib/timezones";
import { countryByCode, initialPlace, placeTimeName, savePlace, type Place } from "@/lib/place";
import { PlacePicker } from "@/components/booking/PlacePicker";
import { Select } from "@/components/ui/Dropdown";
import { PhoneField } from "@/components/ui/PhoneInput";
import { Combobox } from "@/components/admissions/Combobox";
import { ROLE_EMAILS } from "@/content/contacts";

type Slot = { slot_start: string; slot_end: string };
/** A bookable time, with every staff member free then (who takes the call depends on who is available). */
type OpenSlot = Slot & { staffIds: string[] };
type Status = "idle" | "submitting" | "success" | "error";

const YEAR_GROUPS = [
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Not sure yet",
];

// YYYY-MM-DD from the date's LOCAL parts. (toISOString() converts to UTC, which
// shifts midnight-local dates back a day for anyone ahead of UTC, e.g. UK
// summer time, so month ranges and day cells drifted by one day.)
function fmtDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BookingCalendar() {
  const params = useSearchParams();
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  // "loading" until the bookable-staff query returns. "none" means the query
  // worked but no staff member is marked bookable; "error" means it failed.
  // Both must be shown to the visitor, never a silently empty calendar.
  const [staffStatus, setStaffStatus] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [slotsError, setSlotsError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<OpenSlot | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [renderedAt] = useState(() => Date.now());

  // Where the family is joining from: their saved choice, else what their device reports.
  const [place, setPlace] = useState<Place>(() => initialPlace());
  const tz = place.tz;
  const changePlace = (country: string | null, next: string) => {
    setPlace({ country, tz: next, source: "saved" });
    savePlace(country, next);
    const name = countryByCode(country)?.name;
    if (name && COUNTRIES.includes(name)) setCountryField((v) => (v && v !== countryByCode(place.country)?.name ? v : name));
    if (next !== tz) {
      setSelectedDate(null);
      setSelectedSlot(null);
    }
  };
  const placeName = placeTimeName(tz, place.country);
  const formatWhenWithUk = (iso: string, zone: string) => formatWhen(iso, zone, placeName);
  // The booking form's Country starts as the country chosen above (they can still change it).
  const [countryField, setCountryField] = useState(() => {
    const name = countryByCode(place.country)?.name;
    return name && COUNTRIES.includes(name) ? name : "";
  });
  // A step-by-step wizard (owner, Nov 2026: "like Calendly, no scrolling"):
  // 1 choose a day, 2 choose a time, 3 your details. All three stay mounted
  // (inactive ones hidden) so going Back never loses what was typed.
  type WizardStep = "day" | "time" | "details";
  const [wizard, setWizard] = useState<WizardStep>("day");
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const goTo = (next: WizardStep) => {
    setWizard(next);
    window.setTimeout(() => stepHeading.current?.focus(), 0);
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("bookable_staff")
      .select("id")
      .then(({ data, error }) => {
        if (error) {
          setStaffStatus("error");
          return;
        }
        if (data && data.length) {
          setStaffIds((data as { id: string }[]).map((d) => d.id));
          setStaffStatus("ready");
        } else {
          setStaffStatus("none");
        }
      });
  }, []);

  useEffect(() => {
    if (staffIds.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off an async fetch triggered by staff/month changing
    setLoadingSlots(true);
    // The RPC takes UK dates but days are shown in the visitor's timezone, so
    // ask for one extra day either side; otherwise slots near a month edge
    // (e.g. for visitors in Australia) fall outside the requested range.
    const from = fmtDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 0));
    const to = fmtDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1));
    // Every bookable team member's free times, merged: the family picks a time,
    // not a person, and whoever is free then takes the call.
    let cancelled = false;
    Promise.all(
      staffIds.map((id) =>
        supabase
          .rpc("get_open_slots", { p_meeting_type: "admissions", p_staff_id: id, p_from: from, p_to: to })
          .then(({ data, error }: { data: Slot[] | null; error: unknown }) => ({ id, data: data || [], error: Boolean(error) }))
      )
    ).then((results) => {
      if (cancelled) return;
      const byStart = new Map<string, OpenSlot>();
      for (const r of results) {
        for (const slot of r.data) {
          const existing = byStart.get(slot.slot_start);
          if (existing) existing.staffIds.push(r.id);
          else byStart.set(slot.slot_start, { ...slot, staffIds: [r.id] });
        }
      }
      setSlotsError(results.every((r) => r.error));
      setOpenSlots([...byStart.values()].sort((x, y) => x.slot_start.localeCompare(y.slot_start)));
      setLoadingSlots(false);
    });
    return () => {
      cancelled = true;
    };
  }, [staffIds, monthCursor]);

  // Group by the day in the chosen time zone (recomputed when the zone changes).
  const slotsByDate = useMemo(() => {
    const grouped: Record<string, OpenSlot[]> = {};
    for (const slot of openSlots) {
      const key = new Date(slot.slot_start).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD in the chosen zone
      (grouped[key] ||= []).push(slot);
    }
    return grouped;
  }, [openSlots, tz]);
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const daysInMonth = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    const leadingBlanks = (firstDay.getDay() + 6) % 7; // Monday-first
    for (let i = 0; i < leadingBlanks; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }, [monthCursor]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSlot || selectedSlot.staffIds.length === 0) return;
    setStatus("submitting");
    const form = new FormData(e.currentTarget);
    const url = getEdgeFunctionUrl("book-admissions-call");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setStatus("error");
      return;
    }
    // Try whoever is free at that time, in random order to share the calls;
    // if someone's slot was taken a moment ago, try the next person.
    const candidates = [...selectedSlot.staffIds].sort(() => Math.random() - 0.5);
    try {
      for (const staffId of candidates) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({
            parentName: form.get("parentName"),
            email: form.get("email"),
            phone: form.get("phone"),
            country: form.get("country"),
            yearGroups: form.get("yearGroups"),
            notes: form.get("notes"),
            consent: form.get("consent") === "yes",
            company: form.get("company"),
            formRenderedAt: renderedAt,
            staffId,
            slotStart: selectedSlot.slot_start,
            slotEnd: selectedSlot.slot_end,
            timezone: tz,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          setStatus("success");
          return;
        }
        if (json.error !== "slot_taken") break;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <h2 className="font-serif text-xl font-semibold text-ink">Call booked.</h2>
        {selectedSlot && <p className="mt-2 font-medium text-ink">{formatWhenWithUk(selectedSlot.slot_start, tz)}</p>}
        <p className="mt-2 text-ink/70">You&apos;ll speak with a member of our admissions team. Check your email for confirmation, the Teams link, and a calendar invite.</p>
        <ul className="mt-6 space-y-2 text-left text-sm text-ink/70">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
            A confirmation email with the Teams link and a calendar invite, sent now.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
            Reminder emails 24 hours and 1 hour before your call.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
            Need to change the time? <a href="/manage-booking" className="font-semibold text-gold-700 underline">Reschedule or cancel</a> using the link in your confirmation email.
          </li>
        </ul>
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center text-sm text-ink/70">
        Booking isn&apos;t connected yet. Email{" "}
        <a href={`mailto:${ROLE_EMAILS.admissions}`} className="text-gold-700 underline">{ROLE_EMAILS.admissions}</a> to arrange a call.
      </div>
    );
  }

  if (staffStatus === "loading") {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center text-sm text-ink/65">
        Loading booking calendar…
      </div>
    );
  }

  if (staffStatus === "none" || staffStatus === "error") {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center text-sm text-ink/70">
        <p className="font-medium text-ink">
          {staffStatus === "error" ? "We couldn't load available times just now." : "Online booking isn't open yet."}
        </p>
        <p className="mt-2">
          Please email{" "}
          <a href={`mailto:${ROLE_EMAILS.admissions}`} className="text-gold-700 underline">{ROLE_EMAILS.admissions}</a>{" "}
          or <a href="/contact/" className="text-gold-700 underline">leave your details</a> and our admissions team will arrange a time with you.
        </p>
      </div>
    );
  }

  const STEPS: { key: WizardStep; label: string }[] = [
    { key: "day", label: "Day" },
    { key: "time", label: "Time" },
    { key: "details", label: "Your details" },
  ];
  const stepIndex = STEPS.findIndex((x) => x.key === wizard);
  const dayLabel = selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;
  const titles: Record<WizardStep, string> = { day: "Choose a day", time: dayLabel ? `Choose a time on ${dayLabel}` : "Choose a time", details: "Your details" };

  return (
    <div className="overflow-clip rounded-3xl border border-gold-light/60 bg-white shadow-warm lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Summary: what the call is, and the choices so far (each can be changed). */}
      <aside className="border-b border-gold-light/50 bg-cream/70 p-5 lg:border-b-0 lg:border-r lg:p-6" aria-label="Your booking so far">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Free admissions call</p>
        <p className="mt-1 font-serif text-lg font-semibold text-ink">20 minutes on Microsoft Teams</p>
        <p className="mt-1 text-sm text-ink/70">With a member of our admissions team. No obligation.</p>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-ink/60">Times shown in</dt>
            <dd className="font-medium text-ink">{placeName}</dd>
          </div>
          {dayLabel && (
            <div>
              <dt className="text-ink/60">Day</dt>
              <dd className="flex items-baseline justify-between gap-2 font-medium text-ink">
                {dayLabel}
                <button type="button" onClick={() => goTo("day")} className="text-xs font-semibold text-gold-700 underline underline-offset-2">Change</button>
              </dd>
            </div>
          )}
          {selectedSlot && (
            <div>
              <dt className="text-ink/60">Time</dt>
              <dd className="flex items-baseline justify-between gap-2 font-medium text-ink">
                {formatTime(new Date(selectedSlot.slot_start), tz)}
                <button type="button" onClick={() => goTo("time")} className="text-xs font-semibold text-gold-700 underline underline-offset-2">Change</button>
              </dd>
            </div>
          )}
        </dl>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="border-b border-gold-light/50 px-5 py-4 sm:px-6">
          <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Booking steps">
            {STEPS.map((x, n) => (
              <li key={x.key} aria-current={n === stepIndex ? "step" : undefined} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${n < stepIndex ? "bg-teal-700 text-white" : n === stepIndex ? "bg-gold-500 text-ink-900" : "bg-gold-100 text-ink/60"}`}
                  aria-hidden="true"
                >
                  {n < stepIndex ? "✓" : n + 1}
                </span>
                <span className={n === stepIndex ? "text-ink" : "text-ink/60"}>
                  <span className="sr-only">Step {n + 1}: </span>
                  {x.label}
                  {n < stepIndex ? <span className="sr-only"> (done)</span> : null}
                </span>
                {n < STEPS.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-gold-light sm:w-8" />}
              </li>
            ))}
          </ol>
          <h2 ref={stepHeading} tabIndex={-1} className="mt-3 font-serif text-xl font-semibold text-ink focus:outline-none">
            {titles[wizard]}
          </h2>
        </div>

        {/* A fixed-height panel on larger screens: each step fits without page scrolling. */}
        <div className="p-5 sm:p-6 lg:h-[30rem] lg:overflow-y-auto">
          <div hidden={wizard !== "day"}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_13rem]">
              <div>
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-full text-gold-700 hover:bg-gold-50">
                    ←
                  </button>
                  <p className="font-serif font-semibold text-ink" aria-live="polite">{monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                  <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Next month" className="flex h-10 w-10 items-center justify-center rounded-full text-gold-700 hover:bg-gold-50">
                    →
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-ink/65" aria-hidden="true">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {daysInMonth.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const key = fmtDateKey(day);
                    const hasSlots = (slotsByDate[key]?.length ?? 0) > 0;
                    const isPast = key < todayKey;
                    const isSelected = selectedDate === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!hasSlots || isPast}
                        onClick={() => {
                          setSelectedDate(key);
                          setSelectedSlot(null);
                          goTo("time");
                        }}
                        aria-pressed={isSelected}
                        aria-label={`${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${hasSlots && !isPast ? "" : ", no times"}`}
                        className={`h-10 rounded-lg text-sm transition-colors sm:h-11 ${
                          isSelected ? "bg-gold-500 font-semibold text-ink-900" : hasSlots && !isPast ? "bg-gold-100 font-medium text-ink hover:bg-gold-300" : "text-ink/30"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
                {loadingSlots && (
                  <p role="status" aria-live="polite" className="mt-3 text-xs text-ink/65">Loading availability…</p>
                )}
                {slotsError && !loadingSlots && (
                  <p role="alert" className="mt-3 text-xs text-red-700">
                    We couldn&apos;t load times for this month. Please try again, or email {ROLE_EMAILS.admissions}.
                  </p>
                )}
                {!slotsError && !loadingSlots && staffStatus === "ready" && Object.keys(slotsByDate).length === 0 && (
                  <p className="mt-3 text-xs text-ink/65">No times available this month. Try the next month, or email {ROLE_EMAILS.admissions}.</p>
                )}
              </div>
              <div className="md:border-l md:border-gold-light/50 md:pl-5">
                <PlacePicker country={place.country} tz={tz} fromDevice={place.source === "device"} onChange={changePlace} />
              </div>
            </div>
          </div>

          <div hidden={wizard !== "time"}>
            {selectedDate && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(slotsByDate[selectedDate] || []).map((slot) => {
                    const at = new Date(slot.slot_start);
                    const local = formatTime(at, tz);
                    let uk = "";
                    if (!sameAsUk(tz, at)) {
                      const ukDay = at.toLocaleDateString("en-CA", { timeZone: UK_TIME_ZONE });
                      const dayNote = ukDay !== selectedDate ? ` ${at.toLocaleDateString("en-GB", { weekday: "short", timeZone: UK_TIME_ZONE })}` : "";
                      uk = `${formatTime(at, UK_TIME_ZONE)}${dayNote} UK`;
                    }
                    const selected = selectedSlot?.slot_start === slot.slot_start;
                    return (
                      <button
                        key={slot.slot_start}
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          goTo("details");
                        }}
                        aria-pressed={selected}
                        aria-label={formatWhenWithUk(slot.slot_start, tz)}
                        className={`flex min-h-12 flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm transition-colors ${selected ? "border-gold-500 bg-gold-500 font-semibold text-ink-900" : "border-gold-light/60 text-ink hover:border-gold-500 hover:bg-gold-50"}`}
                      >
                        <span className="font-semibold">{local}</span>
                        {uk && <span className="text-xs text-ink/65">{uk}</span>}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => goTo("day")} className="mt-5 text-sm font-semibold text-gold-700 underline underline-offset-2">
                  ← Choose another day
                </button>
              </>
            )}
          </div>

          <div hidden={wizard !== "details"}>
            {selectedSlot && (
              <form onSubmit={handleSubmit} noValidate>
                <p className="mb-4 rounded-lg bg-cream px-3 py-2 text-sm text-ink">
                  Your call: <span className="font-semibold">{formatWhenWithUk(selectedSlot.slot_start, tz)}</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-ink">
                    Your full name
                    <input name="parentName" defaultValue={params.get("name") || ""} type="text" required autoComplete="name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                  </label>
                  <label className="block text-sm font-medium text-ink">
                    Email
                    <input name="email" defaultValue={params.get("email") || ""} type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                  </label>
                  <div>
                    <label htmlFor="booking-phone" className="block text-sm font-medium text-ink">Phone / WhatsApp</label>
                    <PhoneField id="booking-phone" name="phone" required defaultCountry={place.country ?? "GB"} inputClassName="w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                  </div>
                  <div>
                    <label htmlFor="booking-country" className="block text-sm font-medium text-ink">Country</label>
                    <Combobox
                      id="booking-country"
                      name="country"
                      value={countryField}
                      onChange={setCountryField}
                      options={COUNTRIES}
                      aliases={{ "United Kingdom": ["UK", "England", "Britain"], "United Arab Emirates": ["UAE", "Dubai"], "United States": ["USA", "America"], "Saudi Arabia": ["KSA"] }}
                      listLabel="Countries"
                      autoComplete="country-name"
                      inputClassName="w-full rounded-lg border border-gold-light/60 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-year" className="block text-sm font-medium text-ink">Child&apos;s year group(s)</label>
                    <Select id="booking-year" name="yearGroups" defaultValue={params.get("year") || ""} required wrapperClassName="mt-1" className="rounded-lg border border-gold-light/60 px-3 py-2">
                      <option value="">Select a year group</option>
                      {YEAR_GROUPS.map((y) => <option key={y}>{y}</option>)}
                    </Select>
                  </div>
                  <label className="block text-sm font-medium text-ink">
                    Anything we should know? <span className="font-normal text-ink/65">(optional)</span>
                    <input name="notes" defaultValue={params.get("notes") || ""} type="text" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                  </label>
                </div>
                <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
                  <input type="checkbox" name="consent" value="yes" required className="mt-1" />
                  I consent to Tarbiyyah Global Academy contacting me about this booking.
                </label>
                <div className="hidden" aria-hidden="true">
                  <label>Company <input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => goTo("time")} className="text-sm font-semibold text-gold-700 underline underline-offset-2">
                    ← Back
                  </button>
                  <button type="submit" disabled={status === "submitting"} className="rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
                    {status === "submitting" ? "Booking…" : "Confirm booking"}
                  </button>
                </div>
                {status === "error" && (
                  <p role="alert" className="mt-3 text-sm text-red-700">
                    That time may have just been taken, or something went wrong. Please{" "}
                    <button type="button" onClick={() => goTo("time")} className="font-semibold underline">pick another time</button>.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
