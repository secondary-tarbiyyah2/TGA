"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/components/learn/behaviour/data";
import { HouseTable } from "@/components/learn/rewards/HouseTable";
import { HouseBoard, type BoardChild } from "@/components/learn/rewards/HouseBoard";
import { HouseStandingsMini } from "@/components/learn/rewards/HouseStandingsMini";
import { fetchAllClasses, type ClassSummary } from "@/lib/learn/classes";
import { btn, ui } from "@/components/learn/ui";

// Headteacher/Admin tools for houses (0073): define houses (name, colour),
// assign children, and award bonus points. Merits add house points
// automatically, so nothing here has to be re-entered when merits are logged.

type House = { id: string; name: string; colour: string; motto: string | null; sort_order: number; active: boolean };
type ChildRow = BoardChild;
type Member = { child_id: string; house_id: string };
type Award = { id: string; house_id: string; points: number; reason: string; awarded_on: string; voided_at: string | null };

const HEX = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOURS = ["#C0392B", "#2471A3", "#1E8449", "#B7950B", "#7D3C98", "#CA6F1E"];

function Msg({ m }: { m: { tone: "ok" | "error"; text: string } | null }) {
  if (!m) return null;
  return (
    <p role={m.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${m.tone === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
      {m.text}
    </p>
  );
}

export function HousesAdmin() {
  const [houses, setHouses] = useState<House[] | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [members, setMembers] = useState<Map<string, string>>(new Map());
  const [awards, setAwards] = useState<Award[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState(DEFAULT_COLOURS[0]);
  const [newMotto, setNewMotto] = useState("");

  const [awardHouse, setAwardHouse] = useState("");
  const [awardPoints, setAwardPoints] = useState("5");
  const [awardReason, setAwardReason] = useState("");
  const [awardTarget, setAwardTarget] = useState<"house" | "class">("house");
  const [awardClass, setAwardClass] = useState("");
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classShare, setClassShare] = useState<{ houseId: string; pupils: number }[] | null>(null);
  const [classNoHouse, setClassNoHouse] = useState(0);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [houseRes, kids, mem, awardRes] = await Promise.all([
      supabase.from("houses").select("id, name, colour, motto, sort_order, active").order("sort_order").order("name"),
      fetchAllRows<ChildRow>((f, t) => supabase.from("children").select("id, name, parent_user_id, year_groups(name)").order("name").range(f, t)),
      fetchAllRows<Member>((f, t) => supabase.from("house_members").select("child_id, house_id").order("child_id").range(f, t)),
      supabase.from("house_point_awards").select("id, house_id, points, reason, awarded_on, voided_at").order("created_at", { ascending: false }).limit(15),
    ]);
    setHouses((houseRes.data as House[] | null) || []);
    setChildren(kids);
    setMembers(new Map(mem.map((m) => [m.child_id, m.house_id] as const)));
    setAwards((awardRes.data as Award[] | null) || []);
    setRefresh((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchAllClasses().then((list) => {
      if (!cancelled) setClasses(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Who is in the chosen class, grouped by house, so the form can say who gets what before anything is saved.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (awardTarget !== "class" || !awardClass || !supabase) return;
    let cancelled = false;
    (async () => {
      const enr = await fetchAllRows<{ child_id: string }>((f, t) => supabase.from("enrolments").select("child_id").eq("class_id", awardClass).order("child_id").range(f, t));
      if (cancelled) return;
      const per = new Map<string, number>();
      let none = 0;
      for (const e of enr) {
        const h = members.get(e.child_id);
        if (h) per.set(h, (per.get(h) || 0) + 1);
        else none += 1;
      }
      setClassShare([...per.entries()].map(([houseId, pupils]) => ({ houseId, pupils })));
      setClassNoHouse(none);
    })();
    return () => {
      cancelled = true;
    };
  }, [awardTarget, awardClass, members]);

  const houseById = useMemo(() => new Map((houses || []).map((h) => [h.id, h] as const)), [houses]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    members.forEach((hid) => c.set(hid, (c.get(hid) || 0) + 1));
    return c;
  }, [members]);

  const run = async (fn: () => Promise<string | null>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const err = await fn();
      setMsg(err ? { tone: "error", text: err } : { tone: "ok", text: okText });
      if (!err) await load();
    } finally {
      setBusy(false);
    }
  };

  const addHouse = () =>
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      if (!newName.trim()) return "Give the house a name.";
      if (!HEX.test(newColour)) return "Pick a colour.";
      const { error } = await supabase.from("houses").insert({ name: newName.trim(), colour: newColour, motto: newMotto.trim() || null, sort_order: (houses?.length || 0) + 1 });
      if (error) return error.code === "23505" ? "A house with that name already exists." : "Couldn't add that house.";
      setNewName("");
      setNewMotto("");
      setNewColour(DEFAULT_COLOURS[((houses?.length || 0) + 1) % DEFAULT_COLOURS.length]);
      return null;
    }, "House added.");

  const saveHouse = (h: House) =>
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      if (!h.name.trim() || !HEX.test(h.colour)) return "A house needs a name and a colour.";
      const { error } = await supabase.from("houses").update({ name: h.name.trim(), colour: h.colour, motto: h.motto?.trim() || null, active: h.active }).eq("id", h.id);
      return error ? (error.code === "23505" ? "A house with that name already exists." : "Couldn't save that house.") : null;
    }, "House saved.");

  const deleteHouse = (h: House) => {
    if (!window.confirm(`Delete ${h.name}? Its children become unassigned and its bonus points are removed.`)) return;
    return run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const { error } = await supabase.from("houses").delete().eq("id", h.id);
      return error ? "Couldn't delete that house." : null;
    }, "House deleted.");
  };

  const assignMany = (childIds: string[], houseId: string) =>
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      for (let i = 0; i < childIds.length; i += 200) {
        const chunk = childIds.slice(i, i + 200);
        const { error } = houseId
          ? await supabase.from("house_members").upsert(chunk.map((child_id) => ({ child_id, house_id: houseId })), { onConflict: "child_id" })
          : await supabase.from("house_members").delete().in("child_id", chunk);
        if (error) return "Couldn't change those houses. Try again.";
      }
      return null;
    }, childIds.length === 1 ? "House updated." : `${childIds.length} children moved.`);

  // Siblings go to the same house; each family joins the smallest active house.
  const autoAssign = () => {
    const active = (houses || []).filter((h) => h.active);
    if (active.length === 0) return setMsg({ tone: "error", text: "Add at least one active house first." });
    const unassigned = children.filter((c) => !members.has(c.id));
    if (unassigned.length === 0) return setMsg({ tone: "ok", text: "Every child already has a house." });
    if (!window.confirm(`Assign ${unassigned.length} children evenly across ${active.length} houses (siblings together)?`)) return;
    return run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const size = new Map(active.map((h) => [h.id, counts.get(h.id) || 0] as const));
      const families = new Map<string, ChildRow[]>();
      unassigned.forEach((c) => families.set(c.parent_user_id, [...(families.get(c.parent_user_id) || []), c]));
      const rows: { child_id: string; house_id: string }[] = [];
      for (const kids of families.values()) {
        // A family with a child already placed follows that child; otherwise the smallest house.
        const placed = children.map((c) => (c.parent_user_id === kids[0].parent_user_id ? members.get(c.id) : undefined)).find((h) => h && size.has(h));
        let target = placed;
        if (!target) {
          target = [...size.entries()].sort((a, b) => a[1] - b[1])[0][0];
        }
        for (const k of kids) rows.push({ child_id: k.id, house_id: target });
        size.set(target, (size.get(target) || 0) + kids.length);
      }
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("house_members").upsert(rows.slice(i, i + 200), { onConflict: "child_id" });
        if (error) return "Couldn't assign everyone. Try again.";
      }
      return null;
    }, "Children assigned.");
  };

  const award = () =>
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const pts = Number(awardPoints);
      if (!Number.isInteger(pts) || pts < 1 || pts > 100) return "Points must be a whole number from 1 to 100.";
      if (!awardReason.trim()) return "Add a reason.";
      let rows: { house_id: string; points: number; reason: string }[];
      if (awardTarget === "house") {
        if (!awardHouse) return "Choose a house.";
        rows = [{ house_id: awardHouse, points: pts, reason: awardReason.trim() }];
      } else {
        if (!awardClass) return "Choose a class.";
        if (!classShare || classShare.length === 0) return "None of the pupils in that class have a house yet.";
        // Each pupil earns their house `pts`; an award row holds at most 100, so large totals are split.
        rows = [];
        for (const s of classShare) {
          let left = pts * s.pupils;
          while (left > 0) {
            const part = Math.min(100, left);
            rows.push({ house_id: s.houseId, points: part, reason: awardReason.trim().slice(0, 200) });
            left -= part;
          }
        }
      }
      const { error } = await supabase.from("house_point_awards").insert(rows);
      if (error) return "Couldn't award those points.";
      setAwardReason("");
      return null;
    }, awardTarget === "house" ? "Bonus points awarded." : "Bonus points awarded to the class's houses.");

  const voidAward = (a: Award) => {
    if (!window.confirm("Void this award? It stops counting.")) return;
    return run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const { error } = await supabase.from("house_point_awards").update({ voided_at: new Date().toISOString() }).eq("id", a.id);
      return error ? "Couldn't void that award." : null;
    }, "Award voided.");
  };

  const editHouse = (id: string, patch: Partial<House>) => setHouses((hs) => (hs || []).map((h) => (h.id === id ? { ...h, ...patch } : h)));

  if (houses === null) return <p className="text-sm text-ink/65">Loading…</p>;

  return (
    <div className="space-y-6">
      <Msg m={msg} />

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">Houses</h2>
        <p className="mt-1 text-xs text-ink/65">Merits automatically earn points for the child&apos;s house. Archive a house to hide it from the table without losing its history.</p>
        {houses.length > 0 && (
          <ul className="mt-3 space-y-2">
            {houses.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gold-light/50 px-3 py-2 text-sm">
                <input type="color" aria-label={`${h.name} colour`} value={HEX.test(h.colour) ? h.colour : "#B08E45"} onChange={(e) => editHouse(h.id, { colour: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-gold-light" />
                <input aria-label="House name" value={h.name} maxLength={40} onChange={(e) => editHouse(h.id, { name: e.target.value })} className={`${ui.input} !w-40`} />
                <input aria-label="Motto" placeholder="Motto (optional)" value={h.motto || ""} maxLength={120} onChange={(e) => editHouse(h.id, { motto: e.target.value })} className={`${ui.input} min-w-0 flex-1`} />
                <span className="text-xs text-ink/65">{counts.get(h.id) || 0} children</span>
                <label className="flex items-center gap-1 text-xs text-ink/70">
                  <input type="checkbox" checked={h.active} onChange={(e) => editHouse(h.id, { active: e.target.checked })} />
                  Active
                </label>
                <button type="button" disabled={busy} onClick={() => saveHouse(h)} className={btn("primary", "sm")}>
                  Save
                </button>
                <button type="button" disabled={busy} onClick={() => deleteHouse(h)} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gold-light/40 pt-4">
          <label className="text-xs font-medium text-ink/70">
            Name
            <input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Al-Farabi" className={`${ui.input} mt-1 !w-40`} />
          </label>
          <label className="text-xs font-medium text-ink/70">
            Colour
            <input type="color" value={newColour} onChange={(e) => setNewColour(e.target.value)} className="mt-1 block h-9 w-12 cursor-pointer rounded border border-gold-light" />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium text-ink/70">
            Motto (optional)
            <input value={newMotto} maxLength={120} onChange={(e) => setNewMotto(e.target.value)} className={`${ui.input} mt-1`} />
          </label>
          <button type="button" disabled={busy} onClick={addHouse} className={btn("primary")}>
            Add house
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">Bonus points</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div>
            <div role="group" aria-label="Who earns the points" className="mb-3 inline-flex gap-0.5 rounded-lg bg-cream p-0.5">
              {([
                ["house", "A house"],
                ["class", "A whole class"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={awardTarget === id} onClick={() => setAwardTarget(id)} className={`rounded-md px-3 py-1 text-xs font-semibold ${awardTarget === id ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {awardTarget === "house" ? (
                <label className="text-xs font-medium text-ink/70">
                  House
                  <select value={awardHouse} onChange={(e) => setAwardHouse(e.target.value)} className={`${ui.select} mt-1 !w-auto`}>
                    <option value="">Choose…</option>
                    {houses.filter((h) => h.active).map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="text-xs font-medium text-ink/70">
                  Class
                  <select
                    value={awardClass}
                    onChange={(e) => {
                      setAwardClass(e.target.value);
                      setClassShare(null);
                    }}
                    className={`${ui.select} mt-1 !w-auto`}
                  >
                    <option value="">Choose…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-medium text-ink/70">
                {awardTarget === "class" ? "Points per pupil" : "Points"}
                <input type="text" inputMode="decimal" min={1} max={100} value={awardPoints} onChange={(e) => setAwardPoints(e.target.value)} className={`${ui.input} mt-1 !w-20`} />
              </label>
              <label className="min-w-[12rem] flex-1 text-xs font-medium text-ink/70">
                Reason
                <input value={awardReason} maxLength={200} onChange={(e) => setAwardReason(e.target.value)} placeholder="e.g. Charity bake sale" className={`${ui.input} mt-1`} />
              </label>
              <button type="button" disabled={busy} onClick={award} className={btn("primary")}>
                Award
              </button>
            </div>
            {awardTarget === "class" && awardClass && classShare && (
              <p className="mt-2 text-xs text-ink/65">
                {classShare.length === 0
                  ? "None of this class's pupils have a house yet."
                  : `${classShare.map((s) => `${houseById.get(s.houseId)?.name || "House"} +${(Number(awardPoints) || 0) * s.pupils}`).join(", ")}${classNoHouse > 0 ? `. ${classNoHouse} without a house earn nothing.` : "."}`}
              </p>
            )}
          </div>
          <HouseStandingsMini refreshKey={refresh} highlightHouseId={awardTarget === "house" ? awardHouse : undefined} />
        </div>
        {awards.length > 0 && (
          <ul className="mt-4 divide-y divide-gold-light/50 text-sm">
            {awards.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 py-1.5 ${a.voided_at ? "text-ink/65 line-through" : ""}`}>
                <span>
                  <strong>+{a.points}</strong> {houseById.get(a.house_id)?.name || "House"} · {a.reason}
                  <span className="ml-2 text-xs text-ink/65">{new Date(`${a.awarded_on}T12:00:00`).toLocaleDateString("en-GB")}</span>
                </span>
                {!a.voided_at && (
                  <button type="button" disabled={busy} onClick={() => voidAward(a)} className="text-xs font-medium text-red-700 underline disabled:opacity-50">
                    Void
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <HouseBoard houses={houses} pupils={children}members={members} busy={busy} onMove={assignMany} onAutoAssign={autoAssign} />

      <div key={refresh} className="max-w-xl">
        <HouseTable title="Current house table" />
      </div>
    </div>
  );
}
