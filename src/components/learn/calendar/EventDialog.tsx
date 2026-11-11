"use client";

import { useState } from "react";
import { Dialog, useConfirm } from "@/components/learn/kit";
import { DatePicker } from "@/components/learn/DatePicker";
import { Select } from "@/components/learn/Select";
import { Switch, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CAT, EVENT_CATEGORY, EVENT_CATEGORY_CHOICES } from "./calendarUtils";
import type { EventRow } from "./useCalendarData";

type Audience = EventRow["audience"];

/**
 * Add or change a calendar entry (0206) in one dialog that fits the screen:
 * what, which category, when (a day or several, all day or a time), who sees
 * it, and an optional place or link and note. The office can show an entry to
 * everyone or families; other staff add staff-only entries and entries for the
 * classes they teach (the database checks the same).
 */
export function EventDialog({
  initial,
  date,
  office,
  classes,
  onClose,
  onSaved,
}: {
  initial?: EventRow | null;
  date: string;
  office: boolean;
  classes: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "school_event");
  const [start, setStart] = useState(initial?.starts_on || date);
  const [end, setEnd] = useState(initial?.ends_on && initial.ends_on !== initial.starts_on ? initial.ends_on : "");
  const [multiDay, setMultiDay] = useState(!!end);
  const [allDay, setAllDay] = useState(initial ? !initial.start_time : true);
  const [from, setFrom] = useState(initial?.start_time?.slice(0, 5) || "09:00");
  const [to, setTo] = useState(initial?.end_time?.slice(0, 5) || "10:00");
  const [audience, setAudience] = useState<Audience>(initial?.audience || (office ? "everyone" : classes.length ? "class" : "staff"));
  const [classId, setClassId] = useState(initial?.class_id || classes[0]?.id || "");
  const [location, setLocation] = useState(initial?.location || initial?.link_url || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const admissions = category === "admissions";
  const effectiveAudience: Audience = admissions ? "staff" : audience;
  const audiences: { key: Audience; label: string; hint: string }[] = [
    ...(office ? [{ key: "everyone" as Audience, label: "Everyone", hint: "Staff, families and pupils" }, { key: "families" as Audience, label: "Families", hint: "Parents and pupils, and staff" }] : []),
    ...(classes.length ? [{ key: "class" as Audience, label: "A class", hint: "Its teachers, pupils and parents" }] : []),
    { key: "staff", label: "Staff only", hint: "Not shown to families or pupils" },
  ];

  const valid = title.trim().length > 0 && !!start && (!end || end >= start) && (allDay || !to || to > from || (!!end && end > start)) && (effectiveAudience !== "class" || !!classId);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    const isLink = /^https:\/\//i.test(location.trim());
    const row = {
      title: title.trim().slice(0, 120),
      category,
      starts_on: start,
      ends_on: end && end !== start ? end : null,
      start_time: allDay ? null : from,
      end_time: allDay || !to ? null : to,
      audience: effectiveAudience,
      class_id: effectiveAudience === "class" ? classId : null,
      location: location.trim() && !isLink ? location.trim().slice(0, 200) : null,
      link_url: isLink ? location.trim().slice(0, 500) : null,
      notes: notes.trim() ? notes.trim().slice(0, 1000) : null,
    };
    const { error: err } = initial ? await supabase.from("calendar_events").update(row).eq("id", initial.id) : await supabase.from("calendar_events").insert(row);
    setBusy(false);
    if (err) {
      setError(err.code === "42501" ? "You can add entries for staff, or for classes you teach. Ask the office to add one for everyone." : "Couldn't save that entry. Please check the details and try again.");
      return;
    }
    onSaved();
  };

  const remove = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !initial) return;
    if (!(await confirm({ title: `Delete "${initial.title}"?`, description: "It disappears from everyone's calendar.", confirmLabel: "Delete", danger: true }))) return;
    setBusy(true);
    const { error: err } = await supabase.from("calendar_events").delete().eq("id", initial.id);
    setBusy(false);
    if (err) return setError("Couldn't delete that entry. Please try again.");
    onSaved();
  };

  return (
    <Dialog
      title={initial ? "Change calendar entry" : "Add to the calendar"}
      onClose={onClose}
      size="md"
      footer={
        <>
          {initial && (
            <button type="button" onClick={remove} disabled={busy} className={`${ui.btnLinkDanger} mr-auto`}>
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancel
          </button>
          <button type="submit" form="cal-event-form" disabled={!valid || busy} className={ui.btnPrimary}>
            {busy ? "Saving" : initial ? "Save changes" : "Add to calendar"}
          </button>
        </>
      }
    >
      <form
        id="cal-event-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4 pb-1"
      >
        <div>
          <label htmlFor="ce-title" className={ui.label}>
            What is it?
          </label>
          <input id="ce-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Sports day" className={`${ui.input} mt-1`} required />
        </div>

        <fieldset>
          <legend className={ui.label}>Category</legend>
          <div role="radiogroup" aria-label="Category" className="mt-1 flex flex-wrap gap-1.5">
            {EVENT_CATEGORY_CHOICES.filter((c) => office || c.value !== "admissions").map((c) => {
              const colour = CAT[EVENT_CATEGORY[c.value]].colour;
              const on = category === c.value;
              return (
                <button key={c.value} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.value)} className={on ? ui.chipOn : ui.chip}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <DatePicker id="ce-start" label="Date" value={start} onChange={setStart} required />
          {multiDay ? (
            <DatePicker id="ce-end" label="Last day" value={end} onChange={setEnd} min={start} defaultView={start} />
          ) : (
            <div className="flex items-end">
              <button type="button" onClick={() => setMultiDay(true)} className={ui.btnLink}>
                Lasts more than one day
              </button>
            </div>
          )}
        </div>

        <Switch checked={allDay} onChange={setAllDay} label="All day" />
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ce-from" className={ui.label}>
                Starts
              </label>
              <input id="ce-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`${ui.input} mt-1`} />
            </div>
            <div>
              <label htmlFor="ce-to" className={ui.label}>
                Ends
              </label>
              <input id="ce-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`${ui.input} mt-1`} />
            </div>
          </div>
        )}

        <fieldset>
          <legend className={ui.label}>Who sees it</legend>
          {admissions ? (
            <p className="mt-1 text-sm text-ink-500">Admissions entries are for staff only.</p>
          ) : (
            <div role="radiogroup" aria-label="Who sees it" className="mt-1 flex flex-wrap gap-1.5">
              {audiences.map((a) => (
                <button key={a.key} type="button" role="radio" aria-checked={audience === a.key} title={a.hint} onClick={() => setAudience(a.key)} className={audience === a.key ? ui.chipOn : ui.chip}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {!admissions && audience === "class" && (
            <Select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} className={`${ui.select} mt-2`}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </fieldset>

        <div>
          <label htmlFor="ce-where" className={ui.label}>
            Where or link (optional)
          </label>
          <input id="ce-where" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A place, or a https:// meeting link" className={`${ui.input} mt-1`} />
        </div>
        <div>
          <label htmlFor="ce-notes" className={ui.label}>
            Note (optional)
          </label>
          <textarea id="ce-notes" value={notes} maxLength={1000} rows={2} onChange={(e) => setNotes(e.target.value)} className={`${ui.input} mt-1 resize-none`} />
        </div>
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
