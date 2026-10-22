"use client";

import { useState } from "react";
import Link from "next/link";
import { ui } from "@/components/learn/ui";

const KEY = "tga-parent-setup";
const STEPS: { id: string; label: string; href?: string; auto?: boolean }[] = [
  { id: "child", label: "Your child is on your account", auto: true },
  { id: "todo", label: "See what your child has to do this week", href: "/family/todo" },
  { id: "calendar", label: "Add the school calendar to your phone", href: "/family/calendar" },
  { id: "absence", label: "Know where to report an absence", href: "/family/absences" },
  { id: "teachers", label: "Meet your child's teachers", href: "/family/teachers" },
];

function read(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

/** A short first-week checklist for parents. The first step ticks itself; the others are ticked by the parent. Remembered on this device only. */
export function ParentSetup({ hasChild }: { hasChild: boolean }) {
  const [done, setDone] = useState<string[]>(() => (typeof window === "undefined" ? [] : read()));
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(KEY + "-hide") === "1";
    } catch {
      return false;
    }
  });
  const isDone = (id: string) => (id === "child" ? hasChild : done.includes(id));
  const count = STEPS.filter((s) => isDone(s.id)).length;
  if (hidden || count === STEPS.length) return null;

  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: the tick just won't be remembered */
    }
  };

  return (
    <section className={ui.card} aria-labelledby="parent-setup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="parent-setup" className="text-base font-semibold text-ink">
          Getting started <span className="font-normal text-ink/60">· {count} of {STEPS.length}</span>
        </h2>
        <button
          type="button"
          className={ui.btnLink}
          onClick={() => {
            setHidden(true);
            try {
              window.localStorage.setItem(KEY + "-hide", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          Hide
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {STEPS.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <input type="checkbox" id={`ps-${s.id}`} checked={isDone(s.id)} disabled={s.auto} onChange={() => toggle(s.id)} className="h-4 w-4 accent-teal-700" />
            <label htmlFor={`ps-${s.id}`}>{s.label}</label>
            {s.href && (
              <Link href={s.href} className={ui.btnLink}>
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
