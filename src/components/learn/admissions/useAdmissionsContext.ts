"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { summariseFees, type FeeSummary } from "@/components/learn/admissions/paymentCalc";
import { SETTINGS_COLUMNS, STAGE_COLUMNS, type AdmissionsSettings, type FeeBandRow, type StageDetails, type StagePatch } from "@/components/learn/admissions/stageTypes";

export type AdmissionsContext = {
  loading: boolean;
  error: string | null;
  settings: AdmissionsSettings | null;
  details: StageDetails | null;
  planIntent: string | null;
  fees: FeeSummary;
  /** Upsert fields on admissions_stage_details. Resolves true on success. */
  saveDetails: (patch: StagePatch) => Promise<boolean>;
  reload: () => Promise<void>;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function normaliseDetails(row: Record<string, unknown> | null): StageDetails | null {
  if (!row) return null;
  return {
    ...(row as unknown as StageDetails),
    application_fee_amount: num(row.application_fee_amount),
    annual_fee_override: num(row.annual_fee_override),
    first_payment_override: num(row.first_payment_override),
  };
}

/** Loads everything the assessment / interview / offer / payments panels share, once per open application. */
export function useAdmissionsContext(app: ApplicationRow): AdmissionsContext {
  const [settings, setSettings] = useState<AdmissionsSettings | null>(null);
  const [bands, setBands] = useState<FeeBandRow[]>([]);
  const [details, setDetails] = useState<StageDetails | null>(null);
  const [planIntent, setPlanIntent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("The portal isn't connected to the server yet.");
      setLoading(false);
      return;
    }
    const [s, b, d, i] = await Promise.all([
      supabase.from("site_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle(),
      supabase.from("fee_bands").select("year_group_range, annual_fee").order("order_index"),
      supabase.from("admissions_stage_details").select(STAGE_COLUMNS).eq("application_id", app.id).maybeSingle(),
      // From migration 0060; ignore the error if that column isn't there yet.
      supabase.from("admissions_applications").select("payment_plan_intent").eq("id", app.id).maybeSingle(),
    ]);
    if (s.error || d.error) {
      setError("Couldn't load the admissions settings. If this keeps happening, migration 0061 may not be applied yet.");
    } else {
      setError(null);
    }
    const sr = s.data as Record<string, unknown> | null;
    setSettings(
      sr
        ? ({
            ...(sr as unknown as AdmissionsSettings),
            application_fee: num(sr.application_fee),
            registration_fee: num(sr.registration_fee),
            annual_discount_percent: num(sr.annual_discount_percent),
          } as AdmissionsSettings)
        : null,
    );
    setBands(((b.data as { year_group_range: string; annual_fee: number | string }[] | null) || []).map((x) => ({ year_group_range: x.year_group_range, annual_fee: Number(x.annual_fee) })));
    setDetails(normaliseDetails(d.data as Record<string, unknown> | null));
    setPlanIntent(((i.data as { payment_plan_intent?: string | null } | null)?.payment_plan_intent) ?? null);
    setLoading(false);
  }, [app.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [reload]);

  const saveDetails = useCallback(
    async (patch: StagePatch): Promise<boolean> => {
      const supabase = getSupabaseClient();
      if (!supabase) return false;
      const { data, error: err } = await supabase
        .from("admissions_stage_details")
        .upsert({ application_id: app.id, ...patch }, { onConflict: "application_id" })
        .select(STAGE_COLUMNS)
        .single();
      if (err) return false;
      setDetails(normaliseDetails(data as Record<string, unknown>));
      return true;
    },
    [app.id],
  );

  const fees = useMemo(
    () => summariseFees({ yearGroup: app.year_group_applying, adminFeeAmount: app.admin_fee_amount === null ? null : Number(app.admin_fee_amount), settings, bands, details, planIntent }),
    [app.year_group_applying, app.admin_fee_amount, settings, bands, details, planIntent],
  );

  return { loading, error, settings, details, planIntent, fees, saveDetails, reload };
}
