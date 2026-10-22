"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { DataTable } from "@/components/learn/DataTable";
import { formatDuration, formatHours, CLOCK_EVENT } from "@/components/learn/ClockInGate";
import { learnRoleLabel, STAFF_ROLES, useLearnPermission, useLearnSession, type LearnRole } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type Shift = {
  id: string;
  user_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  note: string | null;
  clocked_out_by: string | null;
  auto_closed: boolean;
};
type Person = { id: string; name: string; roles: LearnRole[] };

const SHIFT_COLUMNS = "id, user_id, clocked_in_at, clocked_out_at, note, clocked_out_by, auto_closed";
const START_KEY = "tga:expected-start";

function dateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dtInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dateInput(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
}
function startOfDay(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function EditShift({ shift, name, adminId, onClose, onDone }: { shift: Shift; name: string; adminId: string; onClose: () => void; onDone: () => void }) {
  const [inAt, setInAt] = useState(dtInput(shift.clocked_in_at));
  const [outAt, setOutAt] = useState(dtInput(shift.clocked_out_at));
  const [note, setNote] = useState(shift.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!inAt) return setError("Choose a clock-in time.");
    const i = new Date(inAt);
    const o = outAt ? new Date(outAt) : null;
    if (o && o < i) return setError("Clock-out can't be before clock-in.");
    setBusy(true);
    setError(null);
    const closing = !shift.clocked_out_at && !!o;
    const { error: err } = await supabase
      .from("staff_shifts")
      .update({
        clocked_in_at: i.toISOString(),
        clocked_out_at: o ? o.toISOString() : null,
        note: note.trim() || null,
        ...(closing ? { clocked_out_by: adminId } : {}),
      })
      .eq("id", shift.id);
    setBusy(false);
    if (err) return setError("Couldn't save that change.");
    window.dispatchEvent(new Event(CLOCK_EVENT));
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Edit shift">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Edit shift: {name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/65 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5 text-sm">
          <label className="block">
            <span className="font-medium text-ink">Clocked in</span>
            <input type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
          </label>
          <label className="block">
            <span className="font-medium text-ink">Clocked out</span>
            <span className="block text-xs text-ink/65">Leave empty to keep the shift open.</span>
            <input type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
          </label>
          <label className="block">
            <span className="font-medium text-ink">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gold-light px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffAttendanceContent() {
  const { session } = useLearnSession();
  const adminId = session && session !== "loading" ? session.user.id : "";
  const canExport = useLearnPermission("can_export_data");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState<Shift[]>([]);
  const [today, setToday] = useState<Shift[]>([]);
  const [history, setHistory] = useState<Shift[]>([]);
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [expected, setExpected] = useState("09:00");
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<Shift | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(START_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved start time from this browser after mount
      if (v && /^\d{2}:\d{2}$/.test(v)) setExpected(v);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.rpc("close_stale_shifts");
    const roleRes = await supabase.from("user_roles").select("user_id, role").in("role", STAFF_ROLES);
    const roleRows = (roleRes.data as { user_id: string; role: LearnRole }[] | null) || [];
    const ids = [...new Set(roleRows.map((r) => r.user_id))];
    const profRes = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [], error: null };
    const profs = (profRes.data as { id: string; full_name: string | null; email: string | null }[] | null) || [];
    setPeople(
      ids
        .map((id) => {
          const p = profs.find((x) => x.id === id);
          return { id, name: p?.full_name || p?.email || "Unknown", roles: roleRows.filter((r) => r.user_id === id).map((r) => r.role) };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

    const openRes = await supabase.from("staff_shifts").select(SHIFT_COLUMNS).is("clocked_out_at", null).order("clocked_in_at");
    const todayRes = await supabase.from("staff_shifts").select(SHIFT_COLUMNS).gte("clocked_in_at", startOfDay(dateInput(new Date())).toISOString());
    const fromD = startOfDay(from);
    const toD = new Date(startOfDay(to).getTime() + 86400000);
    const histRes = await supabase
      .from("staff_shifts")
      .select(SHIFT_COLUMNS)
      .gte("clocked_in_at", fromD.toISOString())
      .lt("clocked_in_at", toD.toISOString())
      .order("clocked_in_at", { ascending: false })
      .limit(2000);
    if (openRes.error || todayRes.error || histRes.error) setError("Couldn't load all the attendance data.");
    else setError(null);
    setOpen((openRes.data as Shift[] | null) || []);
    setToday((todayRes.data as Shift[] | null) || []);
    setHistory((histRes.data as Shift[] | null) || []);
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load clock-ins when the page opens or the dates change
    load();
    const onChange = () => {
      load();
    };
    window.addEventListener(CLOCK_EVENT, onChange);
    return () => window.removeEventListener(CLOCK_EVENT, onChange);
  }, [load]);

  const nameOf = useCallback((id: string) => people?.find((p) => p.id === id)?.name || "Unknown", [people]);

  const closeShift = async (s: Shift) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm(`Clock ${nameOf(s.user_id)} out now?`)) return;
    setBusyId(s.id);
    const { error: err } = await supabase
      .from("staff_shifts")
      .update({ clocked_out_at: new Date().toISOString(), clocked_out_by: adminId })
      .eq("id", s.id)
      .is("clocked_out_at", null);
    setBusyId(null);
    if (err) setError("Couldn't clock them out.");
    else await load();
  };

  const notIn = useMemo(() => {
    if (!people) return [];
    const seen = new Set(today.map((s) => s.user_id));
    return people.filter((p) => !seen.has(p.id));
  }, [people, today]);

  const totals = useMemo(() => {
    const [eh, em] = expected.split(":").map(Number);
    const limit = eh * 60 + em;
    const byUser = new Map<string, Shift[]>();
    for (const s of history) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
    return [...byUser.entries()]
      .map(([uid, list]) => {
        const ms = list.reduce((sum, s) => sum + (new Date(s.clocked_out_at || now.toISOString()).getTime() - new Date(s.clocked_in_at).getTime()), 0);
        const firstByDay = new Map<string, number>();
        for (const s of list) {
          const key = dateInput(new Date(s.clocked_in_at));
          const m = minutesOfDay(s.clocked_in_at);
          const prev = firstByDay.get(key);
          if (prev === undefined || m < prev) firstByDay.set(key, m);
        }
        const starts = [...firstByDay.values()];
        const avg = starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : 0;
        const late = starts.filter((m) => m > limit).length;
        return { uid, name: nameOf(uid), ms, days: starts.length, avg, late };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, expected, now, nameOf]);

  const exportCsv = () => {
    const rows = history.map((s) =>
      [
        csvCell(nameOf(s.user_id)),
        dateInput(new Date(s.clocked_in_at)),
        timeOf(s.clocked_in_at),
        s.clocked_out_at ? timeOf(s.clocked_out_at) : "",
        s.clocked_out_at ? ((new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) / 3600000).toFixed(2) : "",
        s.auto_closed ? "auto" : s.clocked_out_by ? "admin" : "",
        csvCell(s.note || ""),
      ].join(","),
    );
    const csv = ["staff,date,clock_in,clock_out,hours,closed_by,note", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `staff-attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const card = "rounded-2xl border border-gold-light bg-white";

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <section className={card}>
        <div className="border-b border-gold-light px-5 py-4">
          <h2 className="text-base font-semibold text-ink">On shift now ({open.length})</h2>
        </div>
        {open.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink/65">Nobody is clocked in.</p>
        ) : (
          <ul className="divide-y divide-gold-light">
            {open.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span aria-hidden="true" className="text-teal-500">
                  ●
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{nameOf(s.user_id)}</p>
                  <p className="text-xs text-ink/65">
                    Since {timeOf(s.clocked_in_at)} · {formatDuration(now.getTime() - new Date(s.clocked_in_at).getTime())}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                <button type="button" disabled={busyId === s.id} onClick={() => closeShift(s)} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/75 hover:bg-cream disabled:opacity-50">
                  Clock out
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="border-b border-gold-light px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Not clocked in today ({notIn.length})</h2>
          <p className="mt-0.5 text-sm text-ink/65">Everyone with a staff role who has no shift today.</p>
        </div>
        {people === null ? (
          <div className="h-16 animate-pulse" />
        ) : notIn.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink/65">Everyone has clocked in today.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 px-5 py-4">
            {notIn.map((p) => (
              <li key={p.id} className="rounded-full border border-gold-light px-3 py-1 text-sm text-ink/80">
                {p.name} <span className="text-xs text-ink/65">{p.roles.map(learnRoleLabel).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-end gap-3 border-b border-gold-light px-5 py-4">
          <h2 className="mr-auto text-base font-semibold text-ink">History</h2>
          <label className="text-xs text-ink/65">
            From
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gold-light px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink/65">
            To
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 block rounded-lg border border-gold-light px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink/65">
            Expected start
            <input
              type="time"
              value={expected}
              onChange={(e) => {
                if (!e.target.value) return;
                setExpected(e.target.value);
                try {
                  window.localStorage.setItem(START_KEY, e.target.value);
                } catch {
                  /* storage unavailable: setting just won't persist */
                }
              }}
              className="mt-1 block rounded-lg border border-gold-light px-2 py-1.5 text-sm text-ink"
            />
          </label>
          {canExport && (
            <button type="button" onClick={exportCsv} disabled={history.length === 0} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/75 hover:bg-cream disabled:opacity-50">
              Export CSV
            </button>
          )}
        </div>

        <div className="p-4">
          <DataTable
            caption="Hours by staff member"
            rows={totals}
            rowKey={(t) => t.uid}
            initialSort={{ key: "name", dir: "asc" }}
            empty="No shifts in this period."
            columns={[
              { key: "name", header: "Staff", sort: (t) => t.name, cell: (t) => <span className="font-medium">{t.name}</span> },
              { key: "hours", header: "Hours", align: "right", sort: (t) => t.ms, cell: (t) => formatHours(t.ms) },
              { key: "days", header: "Days", align: "right", sort: (t) => t.days, cell: (t) => t.days },
              { key: "avg", header: "Avg start", sort: (t) => t.avg, cell: (t) => hhmm(t.avg) },
              {
                key: "late",
                header: "Late",
                sort: (t) => t.late,
                cell: (t) => (t.late > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">{t.late} late</span> : <span className="text-ink/65">–</span>),
              },
            ]}
          />
        </div>

        <div className="border-t border-gold-light p-4">
          <DataTable
            caption="Every clock-in"
            rows={history}
            rowKey={(s) => s.id}
            initialSort={{ key: "date", dir: "desc" }}
            search={{ text: (s) => `${nameOf(s.user_id)} ${s.note || ""}`, placeholder: "Search staff or note" }}
            empty="No shifts in this period."
            columns={[
              { key: "name", header: "Staff", sort: (s) => nameOf(s.user_id), cell: (s) => <span className="font-medium">{nameOf(s.user_id)}</span> },
              { key: "date", header: "Date", sort: (s) => s.clocked_in_at, cell: (s) => dayOf(s.clocked_in_at) },
              { key: "in", header: "In", cell: (s) => timeOf(s.clocked_in_at) },
              {
                key: "out",
                header: "Out",
                cell: (s) => (
                  <>
                    {s.clocked_out_at ? timeOf(s.clocked_out_at) : <span className="text-teal-700">On shift</span>}
                    {s.auto_closed && <span className="ml-1 text-xs text-amber-800">(auto)</span>}
                    {s.clocked_out_by && <span className="ml-1 text-xs text-ink/65">(by admin)</span>}
                  </>
                ),
              },
              {
                key: "hours",
                header: "Hours",
                align: "right",
                sort: (s) => new Date(s.clocked_out_at || now.toISOString()).getTime() - new Date(s.clocked_in_at).getTime(),
                cell: (s) => formatHours(new Date(s.clocked_out_at || now.toISOString()).getTime() - new Date(s.clocked_in_at).getTime()),
              },
              { key: "note", header: "Note", className: "max-w-[200px] truncate text-ink/70", cell: (s) => s.note || "" },
              {
                key: "edit",
                header: "",
                align: "right",
                cell: (s) => (
                  <button type="button" onClick={() => setEditing(s)} className="text-sm font-medium text-teal-700 hover:underline">
                    Edit
                  </button>
                ),
              },
            ]}
          />
        </div>
      </section>

      {editing && (
        <EditShift
          shift={editing}
          name={nameOf(editing.user_id)}
          adminId={adminId}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function StaffAttendancePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader title="Staff attendance" subtitle="Who is on shift, who hasn't clocked in, and hours worked." />
        <StaffAttendanceContent />
      </LearnGate>
    </section>
  );
}
