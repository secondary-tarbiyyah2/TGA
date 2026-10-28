"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { COUNTRIES } from "@/lib/countries";

type Slot = { slot_start: string; slot_end: string };
type Staff = { id: string; display_name: string; role_title: string };
type Status = "idle" | "submitting" | "success" | "error";

const YEAR_GROUPS = [
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Not sure yet",
];

function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/London";
  }
}

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
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  // "loading" until the bookable-staff query returns. "none" means the query
  // worked but no staff member is marked bookable; "error" means it failed.
  // Both must be shown to the visitor, never a silently empty calendar.
  const [staffStatus, setStaffStatus] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [slotsError, setSlotsError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [renderedAt] = useState(() => Date.now());

  const tz = useMemo(() => localTz(), []);
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
      .select("id, display_name, role_title")
      .then(({ data, error }) => {
        if (error) {
          setStaffStatus("error");
          return;
        }
        if (data && data.length) {
          setStaffList(data);
          setStaffId(data[0].id);
          setStaffStatus("ready");
        } else {
          setStaffStatus("none");
        }
      });
  }, []);

  useEffect(() => {
    if (!staffId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off an async fetch triggered by staff/month changing
    setLoadingSlots(true);
    // The RPC takes UK dates but days are shown in the visitor's timezone, so
    // ask for one extra day either side; otherwise slots near a month edge
    // (e.g. for visitors in Australia) fall outside the requested range.
    const from = fmtDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 0));
    const to = fmtDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1));
    supabase
      .rpc("get_open_slots", { p_meeting_type: "admissions", p_staff_id: staffId, p_from: from, p_to: to })
      .then(({ data, error }: { data: Slot[] | null; error: unknown }) => {
        setSlotsError(Boolean(error));
        const grouped: Record<string, Slot[]> = {};
        for (const slot of data || []) {
          const key = new Date(slot.slot_start).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD in local tz
          (grouped[key] ||= []).push(slot);
        }
        setSlotsByDate(grouped);
        setLoadingSlots(false);
      });
  }, [staffId, monthCursor, tz]);

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
    if (!selectedSlot || !staffId) return;
    setStatus("submitting");
    const form = new FormData(e.currentTarget);
    const url = getEdgeFunctionUrl("book-admissions-call");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setStatus("error");
      return;
    }
    try {
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
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center">
        <h2 className="font-serif text-xl font-semibold text-ink">Call booked.</h2>
        <p className="mt-2 text-ink/70">Check your email for confirmation, the Teams link, and a calendar invite.</p>
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

  const activeStaff = staffList.find((s) => s.id === staffId) || staffList[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        {activeStaff && staffList.length === 1 && (
          <p className="text-sm font-medium text-ink">
            You&apos;ll be speaking with <span className="font-semibold">{activeStaff.display_name}</span>, {activeStaff.role_title}.
          </p>
        )}
        {staffList.length > 1 && (
          <label className="block text-sm font-medium text-ink">
            Speak with
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2">
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name} · {s.role_title}</option>
              ))}
            </select>
          </label>
        )}
        <p className="mt-2 text-sm text-ink/65">Times shown in your local timezone ({tz}), UK time alongside.</p>

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
            const isPast = day < new Date(new Date().toDateString());
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
                const local = new Date(slot.slot_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
                const uk = new Date(slot.slot_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
                const selected = selectedSlot?.slot_start === slot.slot_start;
                return (
                  <button
                    key={slot.slot_start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    aria-pressed={selected}
                    className={`min-h-10 rounded-full border px-4 py-2.5 text-sm ${selected ? "border-gold-500 bg-gold-500 text-ink-900 font-semibold" : "border-gold-light/60 text-ink hover:border-gold-500"}`}
                  >
                    {local}{tz !== "Europe/London" ? ` (${uk} UK)` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedSlot && (
          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 scroll-mt-24 rounded-2xl border border-gold-light/50 bg-white p-6" noValidate>
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
              <label className="block text-sm font-medium text-ink">
                Country
                <input name="country" type="text" list="booking-countries" required autoComplete="country-name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                <datalist id="booking-countries">
                  {COUNTRIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink">
              Child&apos;s year group(s)
              <select name="yearGroups" defaultValue={params.get("year") || ""} required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2">
                <option value="">Select a year group</option>
                {YEAR_GROUPS.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
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
