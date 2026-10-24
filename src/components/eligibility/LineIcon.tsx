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
    case "moon": // legacy key from older published configs: drawn as an open mushaf (the brand avoids crescent motifs)
    case "pages":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 6.5c3-1.4 6-1.4 9 .5 3-1.9 6-1.9 9-.5v12c-3-1.4-6-1.4-9 .5-3-1.9-6-1.9-9-.5v-12Z" />
          <path d="M12 7v12" />
          <path d="M6 10.5c1.5-.3 3-.2 4 .3M6 13.5c1.5-.3 3-.2 4 .3M14 10.8c1-.5 2.5-.6 4-.3M14 13.8c1-.5 2.5-.6 4-.3" />
        </svg>
      );
    case "sprout":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 21v-9" />
          <path d="M12 12c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6Z" />
          <path d="M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
          <path d="M6 21h12" />
        </svg>
      );
    case "letters":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 17V9.5a4 4 0 0 1 8 0V17" />
          <path d="M4 13.5h8" />
          <path d="M15 7h5M17.5 7v10" />
        </svg>
      );
    case "speech":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 5.5h16v10H9l-5 4v-14Z" />
          <path d="M8 9.5h8M8 12.5h5" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 3.5h12v17l-6-4-6 4v-17Z" />
          <path d="M9 8h6" />
        </svg>
      );
    case "target":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );
    case "scales":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3v18M7 21h10" />
          <path d="M4 7h16" />
          <path d="m6 7-3 7h6l-3-7ZM18 7l-3 7h6l-3-7Z" />
        </svg>
      );
    case "user-check":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="m15 11 2 2 4-4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 4.5a3.5 3.5 0 0 1 0 7M17 14a6 6 0 0 1 4 6" />
        </svg>
      );
    case "user-away":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 8h5M18.5 5.5 21 8l-2.5 2.5" />
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
