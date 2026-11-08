"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { COUNTRIES } from "@/lib/countries";
import { formatTime, formatWhenWithUk as formatWhen, sameAsUk, UK_TIME_ZONE } from "@/lib/timezones";
import { countryByCode, initialPlace, placeTimeName, savePlace, type Place } from "@/lib/place";
import { PlacePicker } from "@/components/booking/PlacePicker";
import { Select } from "@/components/ui/Dropdown";
import { Combobox } from "@/components/admissions/Combobox";

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
  const timesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // On a phone the times and the form render below the calendar, so bring
  // each into view as it appears rather than leaving the visitor to scroll
  // and wonder whether their tap did anything.
  useEffect(() => {
    if (!selectedDate) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    timesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDate]);
  useEffect(() => {
    if (!selectedSlot) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSlot]);

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
        <a href="mailto:globalacademy@tarbiyyah.co.uk" className="text-gold-700 underline">globalacademy@tarbiyyah.co.uk</a> to arrange a call.
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
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="text-gold-700 underline">globalacademy@tarbiyyah.co.uk</a>{" "}
          or <a href="/contact/" className="text-gold-700 underline">leave your details</a> and our admissions team will arrange a time with you.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <PlacePicker country={place.country} tz={tz} fromDevice={place.source === "device"} onChange={changePlace} />
        <p className="mt-5 border-t border-gold-light/40 pt-4 text-sm font-medium text-ink">Choose a day. You&apos;ll speak with a member of our admissions team.</p>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Previous month" className="p-2 text-gold-700">
            ←
          </button>
          <p className="font-serif font-semibold text-ink">{monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Next month" className="p-2 text-gold-700">
            →
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-ink/65">
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
                onClick={() => { setSelectedDate(key); setSelectedSlot(null); }}
                aria-pressed={isSelected}
                className={`aspect-square min-h-10 rounded-lg text-sm ${
                  isSelected ? "bg-gold-500 text-ink-900 font-semibold" : hasSlots && !isPast ? "bg-gold-100 text-ink hover:bg-gold-300" : "text-ink/30"
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
            We couldn&apos;t load times for this month. Please try again, or email globalacademy@tarbiyyah.co.uk.
          </p>
        )}
        {!slotsError && !loadingSlots && staffStatus === "ready" && Object.keys(slotsByDate).length === 0 && (
          <p className="mt-3 text-xs text-ink/65">No times available this month. Try the next month, or email globalacademy@tarbiyyah.co.uk.</p>
        )}
      </div>

      <div>
        {!selectedDate && (
          <p className="hidden rounded-2xl border border-dashed border-gold-light/60 p-6 text-sm text-ink/60 lg:block">
            Choose a highlighted day to see the available times.
          </p>
        )}
        {selectedDate && (
          <div ref={timesRef} className="scroll-mt-24 rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif font-semibold text-ink">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
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
                    onClick={() => setSelectedSlot(slot)}
                    aria-pressed={selected}
                    aria-label={formatWhenWithUk(slot.slot_start, tz)}
                    className={`min-h-10 rounded-full border px-4 py-2.5 text-sm ${selected ? "border-gold-500 bg-gold-500 text-ink-900 font-semibold" : "border-gold-light/60 text-ink hover:border-gold-500"}`}
                  >
                    {local}{uk ? ` (${uk})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedSlot && (
          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 scroll-mt-24 rounded-2xl border border-gold-light/50 bg-white p-6" noValidate>
            <p className="mb-4 rounded-lg bg-cream px-3 py-2 text-sm text-ink">
              Your call: <span className="font-semibold">{formatWhenWithUk(selectedSlot.slot_start, tz)}</span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Your full name
                <input name="parentName" defaultValue={params.get("name") || ""} type="text" required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium text-ink">
                Email
                <input name="email" defaultValue={params.get("email") || ""} type="email" required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium text-ink">
                Phone / WhatsApp
                <input name="phone" type="tel" required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
              </label>
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
            </div>
            <div className="mt-4">
              <label htmlFor="booking-year" className="block text-sm font-medium text-ink">Child&apos;s year group(s)</label>
              <Select id="booking-year" name="yearGroups" defaultValue={params.get("year") || ""} required wrapperClassName="mt-1" className="rounded-lg border border-gold-light/60 px-3 py-2">
                <option value="">Select a year group</option>
                {YEAR_GROUPS.map((y) => <option key={y}>{y}</option>)}
              </Select>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink">
              Anything we should know? <span className="font-normal text-ink/65">(optional)</span>
              <textarea name="notes" defaultValue={params.get("notes") || ""} rows={3} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </label>
            <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
              <input type="checkbox" name="consent" value="yes" required className="mt-1" />
              I consent to Tarbiyyah Global Academy contacting me about this booking.
            </label>
            <div className="hidden" aria-hidden="true">
              <label>Company <input type="text" name="company" tabIndex={-1} autoComplete="off" /></label>
            </div>
            <button type="submit" disabled={status === "submitting"} className="mt-6 w-full rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
              {status === "submitting" ? "Booking…" : "Confirm booking"}
            </button>
            {status === "error" && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                That slot may have just been taken, or something went wrong. Please pick another time.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
