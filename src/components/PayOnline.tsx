import { payOnlineHref } from "@/lib/onlinePayment";

/**
 * "Pay online" button for the public website. Renders nothing until the school
 * has set its payment page address (site_settings.online_payment_url), so the
 * site never shows a dead or placeholder link.
 */
export function PayOnline({ url, className = "" }: { url?: string | null; className?: string }) {
  const href = payOnlineHref(url);
  if (!href) return null;
  return (
    <div className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:-translate-y-px hover:brightness-95 focus-visible:brightness-95"
      >
        Pay online<span className="sr-only"> (opens our secure payment page in a new tab)</span>
      </a>
      <p className="mt-2 text-xs text-ink/70">Card or bank app. Please give your child&apos;s full name as the reference.</p>
    </div>
  );
}
