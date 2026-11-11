// Run with: node --test --experimental-strip-types src/lib/payments/feePlan.test.ts
// The payments functions (supabase/functions/_shared/feePlan.ts) charge exactly
// what the website and portal quote (src/lib/fees.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../../../supabase/functions/_shared/feePlan.ts";
import { estimateFamilyFees } from "../fees.ts";

const BANDS = [159600, 213000, 279600, 300000];
const settings = { annualDiscountPercent: 2, siblingSecondPercent: 5, siblingLaterPercent: 10 };

for (const annual of BANDS) {
  for (const plan of ["annual", "termly", "monthly"] as const) {
    test(`one child, £${annual / 100}, ${plan}: same payments as the fee estimator`, () => {
      const ours = buildPlan([{ key: "a", label: "A", annualPence: annual }], plan, "2026-11-11", settings)[0];
      const est = estimateFamilyFees({ children: [{ label: "A", annual: annual / 100 }], plan, terms: 2, instalments: 7, annualDiscountPercent: 2, siblingDiscountPercent: 5, siblingDiscountLaterPercent: 10, applicationFee: 0 });
      assert.deepEqual(ours.lines.map((l) => l.amountPence), est.payments.map((p) => Math.round(p * 100)));
    });
  }
}

test("three children: the same sibling discount for each child, totals within a penny a child", () => {
  const kids = [159600, 300000, 213000].map((annualPence, i) => ({ key: String(i), label: String(i), annualPence }));
  for (const plan of ["annual", "termly", "monthly"] as const) {
    const ours = buildPlan(kids, plan, "2026-11-11", settings);
    const est = estimateFamilyFees({ children: kids.map((k) => ({ label: k.label, annual: k.annualPence / 100 })), plan, terms: 2, instalments: 7, annualDiscountPercent: 2, siblingDiscountPercent: 5, siblingDiscountLaterPercent: 10, applicationFee: 0 });
    assert.deepEqual(ours.map((c) => c.siblingPence), est.perChild.map((c) => Math.round(c.siblingDiscount * 100)));
    const ourTotal = ours.reduce((s, c) => s + c.totalPence, 0);
    assert.ok(Math.abs(ourTotal - Math.round(est.total * 100)) <= kids.length, `${plan}: ${ourTotal} vs ${Math.round(est.total * 100)}`);
    for (const c of ours) assert.equal(c.lines.reduce((s, l) => s + l.amountPence, 0), c.totalPence, "each child's payments add up exactly");
  }
});
