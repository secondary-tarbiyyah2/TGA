"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { Select } from "@/components/learn/Select";
import { Switch, ui } from "@/components/learn/ui";
import { Tabs } from "@/components/learn/Tabs";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { STAFF_ROLE_IDS, initials, type Person } from "@/components/learn/messages/messagesShared";

type Preset = { preset_type: "class" | "year_group"; preset_id: string; name: string; parents: number; pupils: number };
type Candidate = { user_id: string; full_name: string; member_kind: "staff" | "parent" | "pupil"; detail: string | null };
type GroupKind = "class" | "year_group" | "staff" | "ad_hoc";

function roleText(roles: string[]): string {
  const staff = roles.filter((r) => STAFF_ROLE_IDS.includes(r));
  return (staff.length ? staff : roles).map((r) => learnRoleLabel(r as LearnRole) || r).join(", ");
}

/**
 * "New message": one dialog that fits the screen. A person (the directory of
 * who you may message, 0085) or, for staff, a group: a class's families, a
 * year group (the office), a staff team or anyone you choose (0204's
 * create_message_group applies the same rules on the server).
 */
export function NewConversation({ people, isStaff, onClose, onPickPerson, onCreated }: { people: Person[]; isStaff: boolean; onClose: () => void; onPickPerson: (p: Person) => void; onCreated: (threadId: string) => void }) {
  const [mode, setMode] = useState<"person" | "group">("person");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = people.filter((p) => !q || p.full_name.toLowerCase().includes(q) || (p.detail || "").toLowerCase().includes(q));
  const staffList = filtered.filter((p) => p.roles.some((r) => STAFF_ROLE_IDS.includes(r)));
  const parentList = filtered.filter((p) => !p.roles.some((r) => STAFF_ROLE_IDS.includes(r)));

  return (
    <Dialog title="New message" onClose={onClose} size="md" description={mode === "group" ? "Families and pupils in a group only ever see the staff's messages and their own, never each other's." : undefined}>
      {isStaff && (
        <div className="mb-3">
          <Tabs
            variant="switch"
            fill
            label="Message a person or a group"
            items={[
              { key: "person", label: "A person" },
              { key: "group", label: "A group" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}
      {mode === "person" ? (
        <div>
          <label className="sr-only" htmlFor="nc-search">
            Search people
          </label>
          <input id="nc-search" data-autofocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or child" className={ui.input} />
          <div className="mt-2 max-h-[min(52vh,26rem)] overflow-y-auto">
            {[
              { label: "Staff", list: staffList },
              { label: "Parents", list: parentList },
            ].map(
              (g) =>
                g.list.length > 0 && (
                  <div key={g.label} className="mb-1">
                    <p className="t-eyebrow px-2 pb-1 pt-2">{g.label}</p>
                    {g.list.map((p) => (
                      <button key={p.user_id} type="button" onClick={() => onPickPerson(p)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--portal-hover)]">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold text-forest-900">{initials(p.full_name)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{p.full_name}</span>
                          <span className="block truncate text-xs text-ink-500">
                            {roleText(p.roles)}
                            {p.detail ? ` · ${p.detail}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ),
            )}
            {filtered.length === 0 && <p className="px-2 py-8 text-center text-sm text-ink-500">{people.length ? `No one matches "${query}".` : "No one is set up for you to message yet."}</p>}
          </div>
        </div>
      ) : (
        <GroupForm onCreated={onCreated} onCancel={onClose} />
      )}
    </Dialog>
  );
}

function GroupForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<GroupKind>("class");
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [presetId, setPresetId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [parents, setParents] = useState(true);
  const [pupils, setPupils] = useState(false);
  const [classStaff, setClassStaff] = useState(true);
  const [canReply, setCanReply] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc("message_group_presets").then(({ data }) => setPresets((data as Preset[] | null) || []));
    supabase.rpc("message_group_candidates").then(({ data }) => setCandidates((data as Candidate[] | null) || []));
  }, []);

  const classPresets = (presets || []).filter((p) => p.preset_type === "class");
  const yearPresets = (presets || []).filter((p) => p.preset_type === "year_group");
  const kinds: { key: GroupKind; label: string }[] = [
    { key: "class", label: "Class" },
    ...(yearPresets.length ? [{ key: "year_group" as GroupKind, label: "Year group" }] : []),
    { key: "staff", label: "Staff" },
    { key: "ad_hoc", label: "Choose people" },
  ];
  const preset = (kind === "class" ? classPresets : yearPresets).find((p) => p.preset_id === presetId) || null;

  // Suggest a name from the class or year group until the person types their own.
  const suggested = preset ? `${preset.name} ${parents && !pupils ? "families" : pupils && !parents ? "pupils" : "group"}` : kind === "staff" ? "Staff team" : "";
  const name = titleTouched ? title : suggested;

  const pool = useMemo(() => (candidates || []).filter((c) => (kind === "staff" ? c.member_kind === "staff" : true)), [candidates, kind]);
  const f = find.trim().toLowerCase();
  const shown = pool.filter((c) => !f || c.full_name.toLowerCase().includes(f) || (c.detail || "").toLowerCase().includes(f));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const usesPreset = kind === "class" || kind === "year_group";
  const familyCount = preset ? (parents ? preset.parents : 0) + (pupils ? preset.pupils : 0) : 0;
  const ready = name.trim().length > 0 && (usesPreset ? !!preset && (parents || pupils) : picked.size > 0);

  const create = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !ready) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("create_message_group", {
      p_title: name.trim().slice(0, 80),
      p_group_type: kind,
      p_class_id: kind === "class" ? presetId : null,
      p_year_group_id: kind === "year_group" ? presetId : null,
      p_include_parents: usesPreset && parents,
      p_include_pupils: usesPreset && pupils,
      p_include_class_staff: kind === "class" && classStaff,
      p_member_ids: usesPreset ? [] : [...picked],
      p_members_can_reply: canReply,
    });
    setBusy(false);
    if (err || !data) return setError(err?.message ? `Couldn't make the group: ${err.message}` : "Couldn't make the group. Please try again.");
    onCreated(data as string);
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Kind of group" className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => {
              setKind(k.key);
              setPresetId("");
              setPicked(new Set());
            }}
            className={kind === k.key ? ui.chipOn : ui.chip}
          >
            {k.label}
          </button>
        ))}
      </div>

      {usesPreset && (
        <div className="space-y-3">
          <div>
            <label htmlFor="ng-preset" className={ui.label}>
              {kind === "class" ? "Class" : "Year group"}
            </label>
            <Select id="ng-preset" value={presetId} onChange={(e) => setPresetId(e.target.value)} className={`${ui.select} mt-1`}>
              <option value="">{presets === null ? "Loading" : kind === "class" ? "Choose a class" : "Choose a year group"}</option>
              {(kind === "class" ? classPresets : yearPresets).map((p) => (
                <option key={p.preset_id} value={p.preset_id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <fieldset>
            <legend className={ui.label}>Who is in it</legend>
            <div className="mt-1 space-y-1">
              <Check checked={parents} onChange={setParents} label="Parents" hint={preset ? `${preset.parents} with portal accounts` : undefined} />
              <Check checked={pupils} onChange={setPupils} label="Pupils" hint={preset ? `${preset.pupils} with portal accounts` : undefined} />
              {kind === "class" && <Check checked={classStaff} onChange={setClassStaff} label="The class's other teachers" />}
            </div>
          </fieldset>
        </div>
      )}

      {!usesPreset && (
        <div>
          <label htmlFor="ng-find" className={ui.label}>
            {kind === "staff" ? "Staff in the group" : "People in the group"}
          </label>
          <input id="ng-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search by name" className={`${ui.input} mt-1`} />
          <ul className="mt-2 max-h-[min(30vh,14rem)] overflow-y-auto rounded-lg border border-gold-light">
            {candidates === null ? (
              <li className="px-3 py-4 text-sm text-ink-500">Loading</li>
            ) : shown.length === 0 ? (
              <li className="px-3 py-4 text-sm text-ink-500">No one matches.</li>
            ) : (
              shown.map((c) => (
                <li key={c.user_id} className="border-b border-gold-light last:border-b-0">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-[var(--portal-hover)]">
                    <input type="checkbox" checked={picked.has(c.user_id)} onChange={() => toggle(c.user_id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{c.full_name}</span>
                      <span className="block truncate text-xs text-ink-500">{c.member_kind === "staff" ? c.detail || "Staff" : c.member_kind === "parent" ? c.detail || "Parent" : `Pupil${c.detail ? ` · ${c.detail}` : ""}`}</span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          {picked.size > 0 && <p className="mt-1 text-xs text-ink-500">{picked.size} chosen</p>}
        </div>
      )}

      <div>
        <label htmlFor="ng-title" className={ui.label}>
          Group name
        </label>
        <input
          id="ng-title"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setTitleTouched(true);
            setTitle(e.target.value);
          }}
          placeholder="For example, 7A families"
          className={`${ui.input} mt-1`}
        />
      </div>

      {kind !== "staff" && (
        <Switch
          checked={canReply}
          onChange={setCanReply}
          label="Families and pupils can reply"
          hint="Their replies reach the staff in the group only. Turn off for a noticeboard where only staff write."
        />
      )}

      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {usesPreset && preset && <span className="mr-auto text-xs text-ink-500">{familyCount} {familyCount === 1 ? "person" : "people"} plus staff</span>}
        <button type="button" onClick={onCancel} className={ui.btnGhost}>
          Cancel
        </button>
        <button type="button" disabled={!ready || busy} onClick={create} className={ui.btnPrimary}>
          <Icon name="users" size="sm" />
          {busy ? "Making the group" : "Make the group"}
        </button>
      </div>
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-[var(--portal-hover)] sm:min-h-9">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-ink">{label}</span>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
    </label>
  );
}
