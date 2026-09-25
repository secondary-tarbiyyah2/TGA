"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";

type Slot = { slot_start: string; slot_end: string };
type Staff = { id: string; display_name: string; role_title: string };
type Status = "idle" | "submitting" | "success" | "error";

const YEAR_GROUPS = [
  "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Not sure yet",
];

function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/London";
  }
}

function fmtDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [renderedAt] = useState(() => Date.now());

  const tz = useMemo(() => localTz(), []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("bookable_staff")
      .select("id, display_name, role_title")
      .then(({ data }) => {
        if (data && data.length) {
          setStaffList(data);
          setStaffId(data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!staffId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off an async fetch triggered by staff/month changing
    setLoadingSlots(true);
    const from = fmtDateKey(monthCursor);
    const to = fmtDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0));
    supabase
      .rpc("get_open_slots", { p_meeting_type: "admissions", p_staff_id: staffId, p_from: from, p_to: to })
      .then(({ data }: { data: Slot[] | null }) => {
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Previous month" className="p-2 text-gold-700">
            ←
          </button>
          <p className="font-serif font-semibold text-ink">{monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          <button type="button" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Next month" className="p-2 text-gold-700">
            →
          </button>
        </div>

        {staffList.length > 1 && (
          <label className="mt-4 block text-sm font-medium text-ink">
            Speak with
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2">
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name} — {s.role_title}</option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-ink/60">
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
                className={`aspect-square rounded-lg text-sm ${
                  isSelected ? "bg-gold-500 text-ink-900 font-semibold" : hasSlots && !isPast ? "bg-gold-100 text-ink hover:bg-gold-300" : "text-ink/30"
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        {loadingSlots && <p className="mt-3 text-xs text-ink/50">Loading availability…</p>}
        <p className="mt-3 text-xs text-ink/50">Times shown in your local timezone ({tz}), UK time alongside.</p>
      </div>

      <div>
        {selectedDate && (
          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
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
                    className={`rounded-full border px-4 py-2 text-sm ${selected ? "border-gold-500 bg-gold-500 text-ink-900 font-semibold" : "border-gold-light/60 text-ink hover:border-gold-500"}`}
                  >
                    {local}{tz !== "Europe/London" ? ` (${uk} UK)` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedSlot && (
          <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-gold-light/50 bg-white p-6" noValidate>
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
                <input name="country" type="text" required className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
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
              Anything we should know? <span className="font-normal text-ink/50">(optional)</span>
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
