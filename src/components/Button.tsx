import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-maroon text-white hover:bg-maroon-dark focus-visible:bg-maroon-dark",
  secondary: "bg-gold text-ink hover:bg-gold-light",
  ghost: "border border-maroon text-maroon hover:bg-cream",
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
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-wide transition-colors duration-150 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
