import Link from "next/link";
import type { HubCard } from "@/lib/nav";

/** Grid of linked cards used by hub pages (/learning, /parents) and the About page. */
export function HubCards({ cards }: { cards: HubCard[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <li key={c.href}>
          <Link
            href={c.href}
            className="group flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-gold-500 hover:shadow-md"
          >
            <h3 className="font-serif text-lg font-semibold text-gold-700">{c.title}</h3>
            <p className="mt-2 flex-1 text-sm text-ink/70">{c.body}</p>
            <span className="mt-4 text-sm font-semibold text-ink group-hover:text-gold-700" aria-hidden="true">Read more →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
