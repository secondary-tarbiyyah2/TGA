import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "dark";

// See DESIGN.md / brand direction for the full gold palette and contrast table.
const styles: Record<Variant, string> = {
  // Solid gold-500 fill, ink-900 text (5.42:1). Hover darkens via brightness
  // rather than jumping to a darker gold token, every darker gold fails
  // 4.5:1 with ink-900 text, so a token swap would need a text-colour swap
  // too; a subtle brightness dip + 1px lift reads as "slightly deeper gold"
  // without that jump.
  primary: "bg-gold-500 text-ink-900 hover:brightness-95 hover:-translate-y-px focus-visible:brightness-95",
  // Outline style for light (cream/white) backgrounds.
  secondary: "border-[1.5px] border-gold-500 text-ink-900 hover:bg-gold-100",
  // Outline style for use on already-dark (ink) sections/bands, transparent
  // fill (shows the ink section behind it) with gold-300 border/text.
  dark: "border-[1.5px] border-gold-300 text-gold-300 hover:bg-white/10",
};

export function Button({
  href,
  variant = "primary",
  className = "",
  children,
  ...rest
}: { href: string; variant?: Variant; className?: string; children: React.ReactNode } & Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "href"
>) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-wide transition-all duration-150 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
