import Link from "next/link";
import type { ReactNode } from "react";
import { parseFaqAnswer, type FaqInline } from "@/lib/faq";

function renderInline(nodes: FaqInline[], key = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    if (n.kind === "text") return n.text;
    if (n.kind === "bold")
      return (
        <strong key={k} className="font-semibold text-ink">
          {renderInline(n.children, `${k}-`)}
        </strong>
      );
    const cls = "font-medium text-gold-700 underline decoration-gold-300 underline-offset-2 hover:text-gold-900 hover:decoration-gold-700";
    if (n.href.startsWith("/"))
      return (
        <Link key={k} href={n.href} className={cls}>
          {renderInline(n.children, `${k}-`)}
        </Link>
      );
    const external = n.href.startsWith("https://");
    return (
      <a key={k} href={n.href} className={cls} {...(external ? { target: "_blank", rel: "noopener" } : {})}>
        {renderInline(n.children, `${k}-`)}
      </a>
    );
  });
}

/** An FAQ answer rendered from its plain-text formatting (see src/lib/faq.ts). Never injects HTML. */
export function FaqAnswer({ answer, className = "" }: { answer: string; className?: string }) {
  const blocks = parseFaqAnswer(answer);
  return (
    <div className={`space-y-3 leading-relaxed ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === "p") return <p key={i}>{renderInline(b.inline, `${i}-`)}</p>;
        const items = b.items.map((item, j) => (
          <li key={j} className="pl-1">
            {renderInline(item, `${i}-${j}-`)}
          </li>
        ));
        return b.kind === "ol" ? (
          <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-gold-700">
            {items}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
            {items}
          </ul>
        );
      })}
    </div>
  );
}
