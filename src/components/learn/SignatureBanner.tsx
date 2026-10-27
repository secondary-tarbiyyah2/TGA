"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";

/** Amber "you have documents to sign" banner; renders nothing when clear. */
export function SignatureBanner() {
  const supabase = getSupabaseClient();
  const [count, setCount] = useState(0);
  const { roles } = useLearnSession();
  // Students never see signing prompts (parents sign on their behalf).
  const studentOnly = roles.length > 0 && roles.every((r) => r.role === "student");

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("my_outstanding_signatures").select("document_id");
      if (!cancelled) setCount(((data as { document_id: string }[] | null) || []).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (count === 0 || studentOnly) return null;

  return (
    <div role="status" data-onboarding className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <span className="font-medium">
        You have {count} document{count === 1 ? "" : "s"} to sign
      </span>
      <Link href="/documents" className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">
        Review &amp; sign
      </Link>
    </div>
  );
}
