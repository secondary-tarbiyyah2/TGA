import { STORE_APP, STORE_APP_FEES_TEXT } from "@/lib/storeApp";

const PORTAL_FEES = "https://learn.tarbiyyah.co.uk/family/fees/";

/**
 * "Pay fees" on the public website (T71): payments are made in the parent
 * portal, where each charge has its own reference and is matched to the family
 * automatically. Hidden in an app-store build (NEXT_PUBLIC_STORE_APP).
 */
export function PayOnline({ className = "" }: { className?: string }) {
  if (STORE_APP) return <p className={`text-sm text-ink/70 ${className}`}>{STORE_APP_FEES_TEXT}.</p>;
  return (
    <div className={className}>
      <a
        href={PORTAL_FEES}
        className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:-translate-y-px hover:brightness-95 focus-visible:brightness-95"
      >
        Pay in the parent portal
      </a>
      <p className="mt-2 text-xs text-ink/70">Sign in, open Fees and press Pay now. Bank app or card.</p>
    </div>
  );
}
