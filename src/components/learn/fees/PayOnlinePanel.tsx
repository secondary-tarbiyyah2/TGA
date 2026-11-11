"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { payOnlineHref } from "@/lib/onlinePayment";
import { btn } from "@/components/learn/ui";

/**
 * "Pay online" on the family Fees page. Shows nothing until the school has set
 * its payment page address (site_settings.online_payment_url, migration 0214).
 * For a Stripe Payment Link the family's account id goes along as the
 * reference, so a later webhook can match the payment to this family.
 */
export function PayOnlinePanel({ balance }: { balance: number }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let live = true;
    (async () => {
      const [{ data: settings }, { data: auth }] = await Promise.all([
        supabase.from("site_settings").select("online_payment_url").eq("id", true).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!live) return;
      const url = (settings as { online_payment_url?: string | null } | null)?.online_payment_url;
      setHref(payOnlineHref(url, { reference: auth.user?.id ?? null, email: auth.user?.email ?? null }));
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!href) return null;
  return (
    <section aria-labelledby="pay-online-title" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-light bg-white p-4">
      <div className="min-w-0">
        <h2 id="pay-online-title" className="t-section text-ink">Pay online</h2>
        <p className="t-meta mt-0.5">
          By card or straight from your bank app, on our secure payment page. Please give your child&apos;s full name as the reference.
          {balance > 0 ? " It shows here as paid once the school office has recorded it." : ""}
        </p>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className={btn("primary")}>
        Pay online<span className="sr-only"> (opens the secure payment page in a new tab)</span>
      </a>
    </section>
  );
}
