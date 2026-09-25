import type { LineIcon as LineIconKey } from "@/lib/quiz/schema";

/**
 * Small, discreet line icons in brand colour only — deliberately not
 * emoji. Kept to a fixed, curated set (matching the LineIcon union in
 * src/lib/quiz/schema.ts) so admin-authored option copy can reference an
 * icon by name without ever being able to inject an arbitrary glyph.
 */
export function LineIcon({ icon, className = "h-5 w-5" }: { icon?: LineIconKey; className?: string }) {
  if (!icon || icon === "none") return null;
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

  switch (icon) {
    case "book":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
        </svg>
      );
    case "graduation-cap":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m2 9 10-5 10 5-10 5-10-5Z" />
          <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "home":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-2 6-6 2 2-6 6-2Z" />
        </svg>
      );
    default:
      return null;
  }
}
