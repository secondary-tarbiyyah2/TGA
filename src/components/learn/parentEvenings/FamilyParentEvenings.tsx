"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/learn/edge";
import {
  EVENING_COLUMNS,
  bookingErrorMessage,
  formatDay,
  formatSlot,
  formatTime,
  generateSlots,
  slotKey,
  type ParentEvening,
} from "@/lib/learn/parentEvenings";
import { useNow } from "@/lib/learn/useNow";
import { EmptyState } from "@/components/learn/ui";

type Option = { evening_id: string; child_id: string; child_name: string; teacher_id: string; teacher_name: string; class_names: string[] | null };
type MyBooking = {
  booking_id: string;
  evening_id: string;
  evening_title: string;
  location: string | null;
  child_id: string;
  child_name: string;
  teacher_id: string;
  teacher_name: string;
  slot_start: string;
  slot_end: string;
  join_url: string | null;
};
type Taken = { slot_start: string; mine: boolean };

function SlotPicker({
  evening,
  teacherId,
  bookings,
  movingId,
  onPick,
  busy,
}: {
  evening: ParentEvening;
  teacherId: string;
  bookings: MyBooking[];
  movingId: string | null;
  onPick: (slot: Date) => void;
  busy: boolean;
}) {
  const supabase = getSupabaseClient();
  const now = useNow();
  const [taken, setTaken] = useState<Taken[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc("parent_evening_taken_slots", { p_evening_id: evening.id, p_teacher_id: teacherId }).then(({ data }) => {
      if (!cancelled) setTaken((data as Taken[] | null) || []);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, evening.id, teacherId]);

  const takenKeys = useMemo(() => new Set((taken || []).map((t) => slotKey(t.slot_start))), [taken]);
  // Times the parent is already busy with another teacher (a moved booking frees its own time).
  const clashKeys = useMemo(
    () => new Set(bookings.filter((b) => b.evening_id === evening.id && b.booking_id !== movingId).map((b) => slotKey(b.slot_start))),
    [bookings, evening.id, movingId]
  );
  const slots = useMemo(() => generateSlots(evening), [evening]);

  if (taken === null) return <p className="mt-2 text-sm text-ink/65">Loading times…</p>;
  if (slots.length === 0) return <p className="mt-2 text-sm text-ink/65">No times are available.</p>;

  return (
    <div className="mt-2">
      <p className="text-xs text-ink/65">{formatDay(evening.starts_at)} · {evening.slot_minutes}-minute meetings (UK time)</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
        {slots.map((s) => {
          const key = slotKey(s);
          const isTaken = takenKeys.has(key);
          const isClash = clashKeys.has(key);
          const isPast = key <= now;
          const disabled = busy || isTaken || isClash || isPast;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              title={isTaken ? "Already booked" : isClash ? "You have another meeting at this time" : isPast ? "Passed" : "Book this time"}
              className={`rounded-lg border px-2 py-1.5 text-sm ${
                disabled ? "cursor-not-allowed border-gold-light/40 bg-cream text-ink/30 line-through" : "border-gold-light bg-white text-ink hover:bg-gold-700 hover:text-white"
              }`}
            >
              {formatTime(s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeacherRow({
  evening,
  option,
  bookings,
  onChanged,
}: {
  evening: ParentEvening;
  option: Option;
  bookings: MyBooking[];
  onChanged: () => Promise<void>;
}) {
  const supabase = getSupabaseClient();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Confirmation shows here, next to the row the parent just used, not at the top of the page.
  const [done, setDone] = useState<string | null>(null);

  const booking = bookings.find((b) => b.evening_id === evening.id && b.child_id === option.child_id && b.teacher_id === option.teacher_id) || null;

  const announce = async (bookingId: string, event: "booked" | "cancelled") => {
    const r = await callEdgeFunction("parent-evening-confirm", { booking_id: bookingId, event });
    return r.ok;
  };

  const pick = async (slot: Date) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const res = booking
        ? await supabase.rpc("rebook_parent_evening_slot", { p_booking_id: booking.booking_id, p_new_slot_start: slot.toISOString() })
        : await supabase.rpc("book_parent_evening_slot", {
            p_evening_id: evening.id,
            p_teacher_id: option.teacher_id,
            p_child_id: option.child_id,
            p_slot_start: slot.toISOString(),
          });
      if (res.error) {
        setError(bookingErrorMessage(res.error.message));
        return;
      }
      const newId = res.data as string | null;
      let emailed = false;
      if (newId) emailed = await announce(newId, "booked");
      if (booking) await announce(booking.booking_id, "cancelled");
      setPicking(false);
      setDone(`Booked for ${formatSlot(slot.toISOString())} (UK time).${emailed ? " A confirmation email is on its way." : ""}`);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!supabase || !booking) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc("cancel_parent_evening_booking", { p_booking_id: booking.booking_id });
      if (err) {
        setError(bookingErrorMessage(err.message));
        return;
      }
      await announce(booking.booking_id, "cancelled");
      setDone("Your booking was cancelled. You can choose another time below.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-gold-light/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{option.teacher_name}</p>
          {option.class_names && option.class_names.length > 0 && <p className="text-xs text-ink/65">{option.class_names.join(", ")}</p>}
        </div>
        {booking ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">{formatSlot(booking.slot_start, booking.slot_end)}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPicking((p) => !p);
                setConfirming(false);
                setDone(null);
              }}
              className="min-h-9 px-1 text-gold-700 underline disabled:opacity-50"
            >
              {picking ? "Keep this time" : "Change"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
                setPicking(false);
                setDone(null);
              }}
              className="min-h-9 px-1 text-red-700 underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPicking((p) => !p);
              setDone(null);
            }}
            aria-expanded={picking}
            className="min-h-9 rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream"
          >
            {picking ? "Hide times" : "Choose a time"}
          </button>
        )}
      </div>
      {confirming && booking && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">
          <span>Cancel your meeting on {formatSlot(booking.slot_start)}?</span>
          <button type="button" disabled={busy} onClick={cancel} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            Yes, cancel it
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink">
            Keep it
          </button>
        </div>
      )}
      {done && (
        <p role="status" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {done}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {picking && <SlotPicker evening={evening} teacherId={option.teacher_id} bookings={bookings} movingId={booking?.booking_id || null} onPick={pick} busy={busy} />}
    </li>
  );
}

/** Family area: book, change and cancel parent-evening slots per child and teacher. */
export function FamilyParentEvenings() {
  const supabase = getSupabaseClient();
  const [evenings, setEvenings] = useState<ParentEvening[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const now = useNow();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [ev, opt, bk] = await Promise.all([
      supabase.from("parent_evenings").select(EVENING_COLUMNS).eq("status", "open").order("starts_at", { ascending: true }),
      supabase.rpc("parent_evening_options"),
      supabase.rpc("my_parent_evening_bookings"),
    ]);
    setEvenings((ev.data as ParentEvening[] | null) || []);
    setOptions((opt.data as Option[] | null) || []);
    setBookings((bk.data as MyBooking[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  if (evenings === null) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;
  // Meetings already over drop off "Your bookings" (and their join links).
  const upcoming = bookings.filter((b) => new Date(b.slot_end).getTime() > now).sort((a, b) => a.slot_start.localeCompare(b.slot_start));

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Your bookings</h2>
          <ul className="mt-3 space-y-2">
            {upcoming.map((b) => (
              <li key={b.booking_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-light/40 p-3 text-sm">
                <span>
                  <span className="font-medium text-ink">{formatSlot(b.slot_start, b.slot_end)} (UK time)</span>
                  <span className="text-ink/70"> · {b.teacher_name} about {b.child_name}</span>
                  {b.location && <span className="block text-xs text-ink/65">{b.location}</span>}
                </span>
                {b.join_url ? (
                  <a href={b.join_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-900">
                    Join meeting
                  </a>
                ) : (
                  <span className="text-xs text-ink/65">No online link, see location</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evenings.length === 0 ? (
        <EmptyState title="No parent evenings open for booking" icon="calendarCheck" tile="tile-violet">There are two a year. When the school opens one you will see the dates here and can book a slot with each of your child&apos;s teachers.</EmptyState>
      ) : (
        evenings.map((ev) => {
          const mine = options.filter((o) => o.evening_id === ev.id);
          const children = [...new Map<string, string>(mine.map((o): [string, string] => [o.child_id, o.child_name])).entries()];
          return (
            <div key={ev.id} className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
              <h2 className="font-serif text-h3 font-semibold text-ink">{ev.title}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {formatDay(ev.starts_at)}, {formatTime(ev.starts_at)} to {formatTime(ev.ends_at)} (UK time) · {ev.slot_minutes}-minute meetings
                {ev.location ? ` · ${ev.location}` : ""}
              </p>
              {ev.notes && <p className="mt-1 text-sm text-ink/65">{ev.notes}</p>}
              {children.length === 0 ? (
                <p className="mt-3 text-sm text-ink/65">None of your children&apos;s teachers are taking part in this evening.</p>
              ) : (
                children.map(([childId, childName]) => (
                  <div key={childId} className="mt-4">
                    <h3 className="text-sm font-semibold text-ink">{childName}</h3>
                    <ul className="mt-2 space-y-2">
                      {mine
                        .filter((o) => o.child_id === childId)
                        .map((o) => (
                          <TeacherRow key={`${o.child_id}-${o.teacher_id}`} evening={ev} option={o} bookings={bookings} onChanged={load} />
                        ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
