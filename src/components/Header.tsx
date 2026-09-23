"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container } from "./Container";
import { primaryNav, primaryCta } from "@/lib/nav";

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-gold-light/40 bg-white/95 backdrop-blur">
      <Container className="flex h-20 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" aria-label="Tarbiyyah Global Academy — home">
          <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={220} height={67} priority />
        </Link>

        <button
          type="button"
          className="lg:hidden rounded-md p-2 text-gold-700"
          aria-expanded={open}
          aria-controls="primary-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6l-12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>

        <nav
          id="primary-nav"
          aria-label="Primary"
          className={`${open ? "flex" : "hidden"} absolute left-0 right-0 top-20 flex-col gap-1 border-b border-gold-light/40 bg-white p-4 shadow-lg lg:static lg:flex lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
        >
          {primaryNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "text-gold-700" : "text-ink/80 hover:text-gold-700"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href={primaryCta.href}
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 lg:mt-0 lg:ml-2"
          >
            {primaryCta.label}
          </Link>
        </nav>
      </Container>
    </header>
  );
}
