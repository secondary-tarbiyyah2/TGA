// Turn an offered place and the family's chosen plan into dated charges
// (fee_charges rows with invoice numbers). Used by payments-checkout-public
// (the family chooses a plan from the offer email) and payments-admin (the
// office sets the plan). Amounts come from fee_bands and site_settings only.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */
import { buildPlan, matchBand, toPence, PLANS, type Band, type ChildIn, type Plan, type PlanLine } from "./feePlan.ts";
import { ukToday } from "./payments.ts";

const CLOSED = ["declined", "withdrawn"];

export type PlanResult =
  | { ok: true; plan: Plan; chargeIds: string[]; created: boolean }
  | { ok: false; error: "not_found" | "closed" | "not_offered" | "no_fee_band" | "plan_locked" | "invalid_plan" | "no_account" | "save_failed"; detail?: string };

export async function loadPlanInputs(sb: any, applicationId: string) {
  const { data: app } = await sb
    .from("admissions_applications")
    .select("id, reference, status, child_first_name, child_last_name, year_group_applying, family_id, parent_profile_id, child_id, parent_email")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return null;
  const { data: accountId } = await sb.rpc("fee_account_for_application", { p_application: applicationId });
  if (!accountId) return { app, accountId: null };
  const [{ data: bandRows }, { data: settings }, { data: accountCharges }] = await Promise.all([
    sb.from("fee_bands").select("year_group_range, annual_fee").order("order_index"),
    sb.from("site_settings").select("annual_discount_percent, sibling_discount_percent").eq("id", true).maybeSingle(),
    sb.from("fee_charges").select("application_id").eq("fee_account_id", accountId).not("application_id", "is", null),
  ]);
  const ids = Array.from(new Set([applicationId, ...((accountCharges || []) as any[]).map((r) => r.application_id as string)]));
  const [{ data: apps }, { data: stages }] = await Promise.all([
    sb.from("admissions_applications").select("id, status, child_first_name, child_last_name, year_group_applying").in("id", ids),
    sb.from("admissions_stage_details").select("application_id, annual_fee_override, chosen_plan").in("application_id", ids),
  ]);
  const bands: Band[] = ((bandRows || []) as any[]).map((b) => ({ yearGroupRange: b.year_group_range, annualFee: Number(b.annual_fee) }));
  const stageBy = new Map(((stages || []) as any[]).map((s) => [s.application_id as string, s]));
  const siblings: (ChildIn & { appId: string })[] = [];
  for (const a of (apps || []) as any[]) {
    if (CLOSED.includes(a.status) && a.id !== applicationId) continue;
    const override = stageBy.get(a.id)?.annual_fee_override;
    const band = matchBand(a.year_group_applying, bands);
    const annual = override !== null && override !== undefined ? Number(override) : band?.annualFee;
    if (annual === undefined || !Number.isFinite(annual)) continue;
    siblings.push({ appId: a.id, key: a.id, label: `${a.child_first_name} ${a.child_last_name}`.trim(), annualPence: toPence(annual) });
  }
  // Stable order (application order) so ranking ties fall the same way each time.
  siblings.sort((x, y) => ids.indexOf(x.appId) - ids.indexOf(y.appId));
  return {
    app,
    accountId: accountId as string,
    siblings,
    chosenPlan: (stageBy.get(applicationId)?.chosen_plan as Plan | null) || null,
    settings: {
      annualDiscountPercent: Number(settings?.annual_discount_percent ?? 2),
      siblingSecondPercent: Number(settings?.sibling_discount_percent ?? 5),
      siblingLaterPercent: 10,
    },
  };
}

/** The lines this child would be charged on each plan, for the family to choose from (nothing saved). */
export async function quotePlans(sb: any, applicationId: string, today = ukToday()): Promise<Record<Plan, PlanLine[]> | null> {
  const inp = await loadPlanInputs(sb, applicationId);
  if (!inp || !inp.accountId || !inp.siblings?.some((s) => s.appId === applicationId)) return null;
  const out = {} as Record<Plan, PlanLine[]>;
  for (const plan of PLANS) out[plan] = buildPlan(inp.siblings, plan, today, inp.settings).find((c) => c.key === applicationId)!.lines;
  return out;
}

/**
 * Create the plan's charges for one application. A plan can be changed until
 * any of its money is paid or in progress; then it is locked.
 */
export async function ensurePlanCharges(sb: any, applicationId: string, plan: string, today = ukToday()): Promise<PlanResult> {
  if (!(PLANS as string[]).includes(plan)) return { ok: false, error: "invalid_plan" };
  const inp = await loadPlanInputs(sb, applicationId);
  if (!inp) return { ok: false, error: "not_found" };
  if (CLOSED.includes(inp.app.status)) return { ok: false, error: "closed" };
  if (!["offered", "accepted"].includes(inp.app.status)) return { ok: false, error: "not_offered" };
  if (!inp.accountId) return { ok: false, error: "no_account" };
  const me = inp.siblings?.find((s) => s.appId === applicationId);
  if (!me) return { ok: false, error: "no_fee_band", detail: inp.app.year_group_applying };

  const { data: existing } = await sb
    .from("fee_charges")
    .select("id, plan, status, paid_pence, instalment_no")
    .eq("application_id", applicationId)
    .not("plan", "is", null)
    .is("voided_at", null)
    .order("instalment_no");
  const rows = (existing || []) as any[];
  if (rows.length) {
    if (rows[0].plan === plan) return { ok: true, plan: plan as Plan, chargeIds: rows.map((r) => r.id), created: false };
    const locked = rows.some((r) => r.paid_pence > 0 || ["processing", "paid", "part_paid", "waived"].includes(r.status));
    if (locked) return { ok: false, error: "plan_locked" };
    await sb.from("fee_charges").update({ voided_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  }

  const lines = buildPlan(inp.siblings!, plan as Plan, today, inp.settings).find((c) => c.key === applicationId)!.lines;
  const insert = lines.map((l) => ({
    application_id: applicationId,
    fee_account_id: inp.accountId,
    parent_user_id: inp.app.parent_profile_id || null,
    child_id: inp.app.child_id || null,
    description: l.description,
    amount: l.amountPence / 100,
    due_date: l.dueDate,
    kind: l.kind,
    plan: l.plan,
    instalment_no: l.instalmentNo,
    instalment_count: l.instalmentCount,
  }));
  const { data: made, error } = await sb.from("fee_charges").insert(insert).select("id");
  if (error) {
    // A parallel request may have made the same plan a moment ago.
    const { data: again } = await sb.from("fee_charges").select("id, plan").eq("application_id", applicationId).eq("plan", plan).is("voided_at", null);
    if (again && again.length === lines.length) return { ok: true, plan: plan as Plan, chargeIds: (again as any[]).map((r) => r.id), created: false };
    return { ok: false, error: "save_failed", detail: error.message };
  }
  await sb.from("admissions_stage_details").upsert({ application_id: applicationId, chosen_plan: plan }, { onConflict: "application_id" });
  return { ok: true, plan: plan as Plan, chargeIds: ((made || []) as any[]).map((r) => r.id), created: true };
}
