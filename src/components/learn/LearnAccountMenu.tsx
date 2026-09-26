"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLearnSignOut, learnRoleLabel, type RoleGrant } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * The single, consistently-placed place for "who am I / my account / sign
 * out" across every /learn role area — top-right of src/app/learn/layout.tsx.
 * Replaces the previous plain-text "Sign out" buried at the bottom of
 * AdminShell's sidebar (easy to miss, admin-only, no account-settings entry
 * point at all).
 */
export function LearnAccountMenu({ session, roles }: { session: Session; roles: RoleGrant[] }) {
  const supabase = getSupabaseClient();
  const signOut = useLearnSignOut();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setFullName((data as { full_name?: string } | null)?.full_name || null));
  }, [supabase, session.user.id]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const roleSummary = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(", ");
  const displayName = fullName || session.user.email || "Your account";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-gold-light/50 py-1.5 pl-1.5 pr-3 text-sm font-medium text-ink hover:bg-cream"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-500 text-xs font-semibold text-ink-900" aria-hidden="true">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{displayName}</span>
        <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-gold-light/50 bg-white p-2 shadow-warm">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="truncate text-xs text-ink/60">{roleSummary || "No /learn role"}</p>
          </div>
          <div className="my-1 border-t border-gold-light/40" />
          <Link
            href="/learn/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-ink/80 hover:bg-cream"
          >
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
