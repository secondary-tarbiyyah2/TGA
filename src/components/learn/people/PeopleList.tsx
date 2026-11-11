"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { CredentialsCard } from "./StudentCredentials";
import { studentAccountAction, type IssuedCredentials } from "./studentAccounts";
import { CHIP_STYLES, GOLD_BUTTON, INPUT_CLASS, friendlyError, initials, invite, type Person } from "./shared";
import { Tabs } from "@/components/learn/Tabs";
import { Pagination } from "@/components/learn/templates/parts";
import { btn as btnClass, ui } from "@/components/learn/ui";

import { askConfirm, Loading } from "@/components/learn/kit";
type Tab = "staff" | "families";
type Chip = { id: string; label: string; roles: LearnRole[] };

// Teachers are staff: the top tabs split the school's own people from the
// families it serves, and the chips narrow by role inside a tab.
const TABS: { id: Tab; label: string; roles: LearnRole[]; chips: Chip[] }[] = [
  {
    id: "staff",
    label: "Staff",
    roles: ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco"],
    chips: [
      { id: "all", label: "All staff", roles: [] },
      { id: "head", label: "Headteacher", roles: ["head_teacher"] },
      { id: "admin", label: "Admin", roles: ["admin"] },
      { id: "admissions", label: "Admissions", roles: ["admissions"] },
      { id: "teachers", label: "Teachers", roles: ["teacher"] },
      { id: "cover", label: "Assistants & cover", roles: ["teaching_assistant_cover"] },
      { id: "senco", label: "SENCo", roles: ["senco"] },
    ],
  },
  {
    id: "families",
    label: "Families",
    roles: ["parent", "student"],
    chips: [
      { id: "all", label: "Everyone", roles: [] },
      { id: "parents", label: "Parents", roles: ["parent"] },
      { id: "students", label: "Students", roles: ["student"] },
    ],
  },
];

const PAGE = 50;

const matchesQuery = (p: Person, q: string) => !q || [p.name, p.email, p.username, p.yearGroup, p.parentName, ...p.childNames, ...p.classNames].some((v) => (v || "").toLowerCase().includes(q));

type RowMsg = { kind: "ok" | "err"; text: string; link?: string; code?: string };

function PersonRow({ person, onAddChild, onChanged }: { person: Person; onAddChild: (parentId: string) => void; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<RowMsg | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [creds, setCreds] = useState<IssuedCredentials | null>(null);

  const describe = (r: { emailSent?: boolean; setupLink?: string; setupCode?: string }, email: string): RowMsg =>
    r.emailSent
      ? { kind: "ok", text: `Invite sent to ${email}.` }
      : { kind: "err", text: `Account is ready but the email to ${email} couldn't be sent. Send them the setup link, or the code with the address learn.tarbiyyah.co.uk/login/forgot:`, link: r.setupLink, code: r.setupCode };

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

  // Username login: no email needed. The password is shown once here and emailed to the parent.
  const issueUsernameLogin = async (action: "create" | "reset") => {
    if (!person.childId) return;
    if (action === "reset" && !(await askConfirm(`Generate a new temporary password for ${person.name}? The old one stops working.`))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await studentAccountAction(action, person.childId, person.name);
      if (!r.ok) {
        setMsg({ kind: "err", text: r.text });
        return;
      }
      setCreds(r.creds);
      setLoginOpen(false);
      onChanged();
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

  const btn = btnClass("secondary", "sm");

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
          <p className="truncate text-xs text-ink/65">{[person.username ? `Username: ${person.username}` : null, person.email, ...meta].filter(Boolean).join(" · ") || "–"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* One pupil record: a pupil's sign-in row links straight to their record. */}
          {person.childId && (
            <a className={btn} href={`/admin/pupils?id=${person.childId}`}>
              Pupil record
            </a>
          )}
          {person.profileId && person.roles.some((r) => r === "teacher" || r === "teaching_assistant_cover" || r === "head_teacher" || r === "admin") && (
            <a className={btn} href={`/admin/staff?user=${person.profileId}`}>
              Profile &amp; compliance
            </a>
          )}
          {person.roles.includes("parent") && person.profileId && (
            <button type="button" className={btn} onClick={() => onAddChild(person.profileId as string)}>
              Add child
            </button>
          )}
          {!person.profileId && person.childId && (
            <button type="button" className={btn} disabled={busy} onClick={() => void issueUsernameLogin("create")} title="Creates a username and temporary password. No email address needed.">
              Give login (username)
            </button>
          )}
          {!person.profileId && person.childId && (
            <button type="button" className={btn} onClick={() => setLoginOpen((o) => !o)}>
              Use an email instead
            </button>
          )}
          {person.username && person.childId && (
            <button type="button" className={btn} disabled={busy} onClick={() => void issueUsernameLogin("reset")} title="Generates a new temporary password, shown once and emailed to the parent.">
              Reset password
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
      {creds && (
        <div className="mt-2 sm:ml-[52px]">
          <CredentialsCard creds={creds} onDismiss={() => setCreds(null)} />
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
          {msg.code && (
            <span className="mt-1 block">
              Setup code: <strong className="font-mono text-sm tracking-[0.3em]">{msg.code}</strong>
            </span>
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
  const [tab, setTab] = useState<Tab>("staff");
  const [chip, setChip] = useState("all");
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(0);
  const tabDef = TABS.find((t) => t.id === tab) as (typeof TABS)[number];

  const inTab = useMemo(() => {
    const byTab = (t: (typeof TABS)[number]) => people.filter((p) => p.roles.some((r) => t.roles.includes(r)));
    return { staff: byTab(TABS[0]), families: byTab(TABS[1]) };
  }, [people]);

  const chipCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of tabDef.chips) out[c.id] = c.roles.length ? inTab[tab].filter((p) => p.roles.some((r) => c.roles.includes(r))).length : inTab[tab].length;
    return out;
  }, [tabDef, inTab, tab]);

  const shown = useMemo(() => {
    const roles = tabDef.chips.find((c) => c.id === chip)?.roles || [];
    const q = search.trim().toLowerCase();
    return inTab[tab].filter((p) => (!roles.length || p.roles.some((r) => roles.includes(r))) && matchesQuery(p, q));
  }, [tabDef, chip, search, inTab, tab]);

  // A search that only matches people in the other tab says so, instead of
  // a bare "No matches" (e.g. arriving with ?q=<a parent's name> on Staff).
  const other: Tab = tab === "staff" ? "families" : "staff";
  const otherMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? inTab[other].filter((p) => matchesQuery(p, q)).length : 0;
  }, [search, inTab, other]);
  const switchTab = (k: Tab) => {
    setTab(k);
    setChip("all");
    setPage(0);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
        <Tabs
          variant="switch"
          items={TABS.map((t) => ({ key: t.id, label: t.label, count: inTab[t.id].length }))}
          value={tab}
          onChange={switchTab}
          label="People"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name, email, year group or class…"
          aria-label="Search people"
          data-guide="people-search"
          className={`${INPUT_CLASS} !w-auto min-w-[14rem] flex-1`}
        />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by role">
          {tabDef.chips.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={chip === f.id}
              onClick={() => {
                setChip(f.id);
                setPage(0);
              }}
              className={chip === f.id ? ui.chipOn : ui.chip}
            >
              {f.label} <span className="text-xs opacity-70">{chipCounts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light bg-[var(--portal-surface)]">
      {loading ? (
        <Loading label="Loading…" bare />
      ) : error ? (
        <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : people.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-base font-semibold text-ink">No one here yet</p>
          <p className="mt-1 text-sm text-ink/65">Add your first member of staff, parent or student to get started.</p>
          <button type="button" onClick={onAdd} className={`${GOLD_BUTTON} mt-4`}>
            Add person
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-base font-semibold text-ink">No matches</p>
          <p className="mt-1 text-sm text-ink/65">
            {search.trim() ? `Nothing in ${tabDef.label.toLowerCase()} matches "${search.trim()}"` : "No one in this group yet"}. Try a different search or filter.
          </p>
          {otherMatches > 0 && (
            <button type="button" onClick={() => switchTab(other)} className={`${GOLD_BUTTON} mt-4`}>
              Show {otherMatches} match{otherMatches === 1 ? "" : "es"} in {TABS.find((t) => t.id === other)?.label}
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gold-light/30">
            {shown.slice(page * PAGE, page * PAGE + PAGE).map((p) => (
              <PersonRow key={p.key} person={p} onAddChild={onAddChild} onChanged={onChanged} />
            ))}
          </ul>
          {otherMatches > 0 && (
            <div className="border-t border-gold-light/40 px-4 py-2.5 text-sm">
              <button type="button" onClick={() => switchTab(other)} className={ui.btnLink}>
                {otherMatches} more in {TABS.find((t) => t.id === other)?.label}
              </button>
            </div>
          )}
        </>
      )}
      </div>
      {!loading && !error && shown.length > PAGE && <Pagination page={page} size={PAGE} total={shown.length} onPage={setPage} />}
    </div>
  );
}
