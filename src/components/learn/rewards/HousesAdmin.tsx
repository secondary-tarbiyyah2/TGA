"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/components/learn/behaviour/data";
import { HouseTable } from "@/components/learn/rewards/HouseTable";

// Headteacher/Admin tools for houses (0073): define houses (name, colour),
// assign children, and award bonus points. Merits add house points
// automatically, so nothing here has to be re-entered when merits are logged.

type House = { id: string; name: string; colour: string; motto: string | null; sort_order: number; active: boolean };
type ChildRow = { id: string; name: string; parent_user_id: string; year_groups: { name: string } | null };
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

  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [search, setSearch] = useState("");

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

  const assign = (childId: string, houseId: string) =>
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const { error } = houseId
        ? await supabase.from("house_members").upsert({ child_id: childId, house_id: houseId }, { onConflict: "child_id" })
        : await supabase.from("house_members").delete().eq("child_id", childId);
      return error ? "Couldn't change that house." : null;
    }, "House updated.");

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
      if (!awardHouse) return "Choose a house.";
      if (!Number.isInteger(pts) || pts < 1 || pts > 100) return "Points must be a whole number from 1 to 100.";
      if (!awardReason.trim()) return "Add a reason.";
      const { error } = await supabase.from("house_point_awards").insert({ house_id: awardHouse, points: pts, reason: awardReason.trim() });
      if (error) return "Couldn't award those points.";
      setAwardReason("");
      return null;
    }, "Bonus points awarded.");

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

  const visibleChildren = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((c) => (!onlyUnassigned || !members.has(c.id)) && (!q || c.name.toLowerCase().includes(q))).slice(0, 200);
  }, [children, members, onlyUnassigned, search]);

  if (houses === null) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <Msg m={msg} />

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">Houses</h2>
        <p className="mt-1 text-xs text-ink/60">Merits automatically earn points for the child&apos;s house. Archive a house to hide it from the table without losing its history.</p>
        {houses.length > 0 && (
          <ul className="mt-3 space-y-2">
            {houses.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gold-light/50 px-3 py-2 text-sm">
                <input type="color" aria-label={`${h.name} colour`} value={HEX.test(h.colour) ? h.colour : "#B08E45"} onChange={(e) => editHouse(h.id, { colour: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-gold-light" />
                <input aria-label="House name" value={h.name} maxLength={40} onChange={(e) => editHouse(h.id, { name: e.target.value })} className="w-40 rounded-lg border border-gold-light px-2 py-1" />
                <input aria-label="Motto" placeholder="Motto (optional)" value={h.motto || ""} maxLength={120} onChange={(e) => editHouse(h.id, { motto: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-gold-light px-2 py-1" />
                <span className="text-xs text-ink/60">{counts.get(h.id) || 0} children</span>
                <label className="flex items-center gap-1 text-xs text-ink/70">
                  <input type="checkbox" checked={h.active} onChange={(e) => editHouse(h.id, { active: e.target.checked })} />
                  Active
                </label>
                <button type="button" disabled={busy} onClick={() => saveHouse(h)} className="rounded-md bg-gold-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
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
            <input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Al-Farabi" className="mt-1 block w-40 rounded-lg border border-gold-light px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-ink/70">
            Colour
            <input type="color" value={newColour} onChange={(e) => setNewColour(e.target.value)} className="mt-1 block h-9 w-12 cursor-pointer rounded border border-gold-light" />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium text-ink/70">
            Motto (optional)
            <input value={newMotto} maxLength={120} onChange={(e) => setNewMotto(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light px-2 py-1.5 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={addHouse} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            Add house
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">Bonus points</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink/70">
            House
            <select value={awardHouse} onChange={(e) => setAwardHouse(e.target.value)} className="mt-1 block rounded-lg border border-gold-light bg-white px-2 py-1.5 text-sm">
              <option value="">Choose…</option>
              {houses.filter((h) => h.active).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink/70">
            Points
            <input type="number" min={1} max={100} value={awardPoints} onChange={(e) => setAwardPoints(e.target.value)} className="mt-1 block w-20 rounded-lg border border-gold-light px-2 py-1.5 text-sm" />
          </label>
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-ink/70">
            Reason
            <input value={awardReason} maxLength={200} onChange={(e) => setAwardReason(e.target.value)} placeholder="e.g. Charity bake sale" className="mt-1 block w-full rounded-lg border border-gold-light px-2 py-1.5 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={award} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
            Award
          </button>
        </div>
        {awards.length > 0 && (
          <ul className="mt-4 divide-y divide-gold-light/50 text-sm">
            {awards.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 py-1.5 ${a.voided_at ? "text-ink/40 line-through" : ""}`}>
                <span>
                  <strong>+{a.points}</strong> {houseById.get(a.house_id)?.name || "House"} · {a.reason}
                  <span className="ml-2 text-xs text-ink/50">{new Date(`${a.awarded_on}T12:00:00`).toLocaleDateString("en-GB")}</span>
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

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Assign children</h2>
          <button type="button" disabled={busy} onClick={autoAssign} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
            Auto-assign everyone without a house
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="rounded-lg border border-gold-light px-3 py-1.5" />
          <label className="flex items-center gap-1.5 text-ink/70">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
            Only children without a house
          </label>
          <span className="text-xs text-ink/50">
            {children.length - members.size > 0 ? `${children.length - members.size} without a house` : "Everyone has a house"}
          </span>
        </div>
        {visibleChildren.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No children to show.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gold-light/50">
            {visibleChildren.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span>
                  {c.name}
                  {c.year_groups?.name && <span className="ml-2 text-xs text-ink/50">{c.year_groups.name}</span>}
                </span>
                <select aria-label={`House for ${c.name}`} disabled={busy} value={members.get(c.id) || ""} onChange={(e) => assign(c.id, e.target.value)} className="rounded-lg border border-gold-light bg-white px-2 py-1 text-sm">
                  <option value="">No house</option>
                  {(houses || []).filter((h) => h.active || members.get(c.id) === h.id).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {children.length > visibleChildren.length && <p className="mt-2 text-xs text-ink/50">Showing the first {visibleChildren.length}. Use search to find others.</p>}
      </section>

      <div key={refresh} className="max-w-xl">
        <HouseTable title="Current house table" />
      </div>
    </div>
  );
}
