"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { type FeeSummary } from "@/components/learn/admissions/paymentCalc";
import { STAGE_COLUMNS, type AdmissionsSettings, type FeeBandRow, type StageDetails, type StagePatch } from "@/components/learn/admissions/stageTypes";
import { feesFor, fetchAdmissionsData, normaliseDetails } from "@/components/learn/admissions/admissionsData";
import type { TemplateRow } from "@/components/learn/admissions/messageTemplates";

export type AdmissionsContext = {
  loading: boolean;
  error: string | null;
  settings: AdmissionsSettings | null;
  details: StageDetails | null;
  planIntent: string | null;
  /** Editable email texts by key (defaults apply to any missing key). */
  templates: Record<string, TemplateRow>;
  bands: FeeBandRow[];
  fees: FeeSummary;
  /** Upsert fields on admissions_stage_details. Resolves true on success. */
  saveDetails: (patch: StagePatch) => Promise<boolean>;
  reload: () => Promise<void>;
};

/** Loads everything the assessment / interview / offer / payments panels share, once per open application. */
export function useAdmissionsContext(app: ApplicationRow): AdmissionsContext {
  const [settings, setSettings] = useState<AdmissionsSettings | null>(null);
  const [bands, setBands] = useState<FeeBandRow[]>([]);
  const [details, setDetails] = useState<StageDetails | null>(null);
  const [planIntent, setPlanIntent] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, TemplateRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchAdmissionsData(app.id);
    setError(data.error);
    setSettings(data.settings);
    setBands(data.bands);
    setDetails(data.details);
    setPlanIntent(data.planIntent);
    setTemplates(data.templates);
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

  const fees = useMemo(() => feesFor(app, { settings, bands, details, planIntent }), [app, settings, bands, details, planIntent]);

  return { loading, error, settings, details, planIntent, templates, bands, fees, saveDetails, reload };
}
