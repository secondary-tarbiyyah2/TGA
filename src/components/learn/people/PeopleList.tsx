"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { CHIP_STYLES, GOLD_BUTTON, INPUT_CLASS, friendlyError, initials, invite, type Person } from "./shared";

type Filter = "all" | "students" | "parents" | "teachers" | "staff";

const FILTERS: { id: Filter; label: string; roles: LearnRole[] }[] = [
  { id: "all", label: "All", roles: [] },
  { id: "students", label: "Students", roles: ["student"] },
  { id: "parents", label: "Parents", roles: ["parent"] },
  { id: "teachers", label: "Teachers", roles: ["teacher", "teaching_assistant_cover"] },
  { id: "staff", label: "Staff", roles: ["head_teacher", "admin", "admissions"] },
];

type RowMsg = { kind: "ok" | "err"; text: string; link?: string };

function PersonRow({ person, onAddChild, onChanged }: { person: Person; onAddChild: (parentId: string) => void; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<RowMsg | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");

  const describe = (r: { emailSent?: boolean; setupLink?: string }, email: string): RowMsg =>
    r.emailSent
      ? { kind: "ok", text: `Invite sent to ${email}.` }
      : { kind: "err", text: `Account is ready but the email to ${email} couldn't be sent. Copy the setup link and send it yourself:`, link: r.setupLink };

  // Same learn-invite call as adding: for an existing account it sends a fresh setup / password-reset link.
  const resend = async () => {
    if (!person.email || person.roles.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const role = person.roles[0];
      const body: Record<string, unknown> = { email: person.email, fullName: person.name, role };
      if ((role === "teacher" || role === "teaching_assistant_cover") && person.classScope) {
        body.scopeType = "class";
        body.scopeId = person.classScope;
      }
      const r = await invite(body);
      setMsg(r.ok ? describe(r, person.email) : { kind: "err", text: friendlyError(r) });
    } finally {
      setBusy(false);
    }
  };

  const giveLogin = async () => {
    const email = loginEmail.trim();
    if (!supabase || !person.childId || !/^\S+@\S+\.\S+$/.test(email)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await invite({ email, fullName: person.name, role: "student" });
      if (!r.ok || !r.profileId) {
        setMsg({ kind: "err", text: friendlyError(r) });
        return;
      }
      const { error } = await supabase
        .from("student_accounts")
        .upsert({ child_id: person.childId, profile_id: r.profileId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
      if (error) {
        setMsg({ kind: "err", text: `Login created but couldn't be linked to ${person.name}: ${error.message}` });
        return;
      }
      setMsg(describe(r, email));
      setLoginOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const meta = [
    person.yearGroup,
    person.parentName ? `Parent: ${person.parentName}` : null,
    person.childNames.length ? `Children: ${person.childNames.join(", ")}` : null,
    person.classNames.length ? person.classNames.join(", ") : null,
  ].filter(Boolean) as string[];

  const btn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50";

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">
          {initials(person.name)}
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{person.name}</span>
            {person.roles.map((r) => (
              <span key={r} className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_STYLES[r]}`}>
                {learnRoleLabel(r)}
              </span>
            ))}
            {!person.profileId && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">No login yet</span>}
          </div>
          <p className="truncate text-xs text-ink/55">{[person.email, ...meta].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {person.roles.includes("parent") && person.profileId && (
            <button type="button" className={btn} onClick={() => onAddChild(person.profileId as string)}>
              Add child
            </button>
          )}
          {!person.profileId && person.childId && (
            <button type="button" className={btn} onClick={() => setLoginOpen((o) => !o)}>
              Give login
            </button>
          )}
          {person.profileId && person.email && (
            <button type="button" className={btn} disabled={busy} onClick={resend} title="Sends a fresh setup link. For existing accounts this also resets the password.">
              {busy ? "Sending…" : "Resend invite / reset password"}
            </button>
          )}
        </div>
      </div>
      {loginOpen && (
        <div className="mt-2 flex flex-wrap gap-2 pl-[52px]">
          <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder={`${person.name}'s email`} className={`${INPUT_CLASS} max-w-xs`} aria-label="Student email" />
          <button type="button" disabled={busy || !loginEmail.trim()} onClick={giveLogin} className={GOLD_BUTTON}>
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-xs sm:ml-[52px] ${msg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
          {msg.text}
          {msg.link && (
            <>
              {" "}
              <a href={msg.link} className="break-all text-gold-700 underline">
                {msg.link}
              </a>
            </>
          )}
        </p>
      )}
    </li>
  );
}

export function PeopleList({
  people,
  loading,
  error,
  onAdd,
  onAddChild,
  onChanged,
  initialSearch = "",
}: {
  people: Person[];
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onAddChild: (parentId: string) => void;
  onChanged: () => void;
  initialSearch?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState(initialSearch);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: people.length, students: 0, parents: 0, teachers: 0, staff: 0 };
    for (const f of FILTERS) {
      if (f.id === "all") continue;
      c[f.id] = people.filter((p) => p.roles.some((r) => f.roles.includes(r))).length;
    }
    return c;
  }, [people]);

  const shown = useMemo(() => {
    const roles = FILTERS.find((f) => f.id === filter)?.roles || [];
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (roles.length && !p.roles.some((r) => roles.includes(r))) return false;
      if (!q) return true;
      return [p.name, p.email, p.yearGroup, p.parentName, ...p.childNames, ...p.classNames].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [people, filter, search]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white">
      <div className="space-y-3 border-b border-gold-light/40 p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, year group or class…"
          aria-label="Search people"
          className={INPUT_CLASS}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter people">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === f.id ? "border-gold-500 bg-gold-500 text-ink" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
            >
              {f.label} <span className="text-xs opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-ink/60">Loading…</p>
      ) : error ? (
        <p className="p-6 text-sm text-amber-900">{error}</p>
      ) : people.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-base font-semibold text-ink">No one here yet</p>
          <p className="mt-1 text-sm text-ink/60">Add your first student, parent or teacher to get started.</p>
          <button type="button" onClick={onAdd} className={`${GOLD_BUTTON} mt-4`}>
            Add person
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-base font-semibold text-ink">No matches</p>
          <p className="mt-1 text-sm text-ink/60">
            {search.trim() ? `Nothing matches "${search.trim()}"` : "No one in this group yet"}. Try a different search or filter.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gold-light/30">
          {shown.map((p) => (
            <PersonRow key={p.key} person={p} onAddChild={onAddChild} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}
