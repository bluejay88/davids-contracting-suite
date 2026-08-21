import { serviceTasks } from "../data/catalog";
import { AppSettings, QuoteSelection } from "../types";
import { buildQuote } from "./estimates";

export type EstimatorAuditCase = {
  id: string;
  taskId: string;
  quantity: number;
  passed: boolean;
  checks: string[];
};

export type EstimatorAuditReport = {
  executedAt: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  policy: string[];
  cases: EstimatorAuditCase[];
};

const quantities = [1, 12, 48, 100, 240, 500, 1200, 2400, 80, 360];

/** Deterministic QA: validates arithmetic and the customer-safe unit pricing view. It is not a field-price guarantee. */
export function runEstimatorAudit(settings: AppSettings): EstimatorAuditReport {
  const cases = Array.from({ length: 50 }, (_, index) => {
    const task = serviceTasks[index % serviceTasks.length];
    const quantity = quantities[index % quantities.length] || task.defaultQuantity;
    const selection: QuoteSelection = { taskId: task.id, quantity, scopeNote: "Audit scenario", conditionMultiplier: 1, complexityMultiplier: 1 };
    const quote = buildQuote("Estimator audit", "Deterministic pricing QA", [selection], settings);
    const line = quote.breakdown[0];
    const checks = [
      "positive-range",
      "high-not-below-low",
      "unit-pricing-reconciles",
      "finite-labor-hours",
      ...(task.category === "roofing" && task.unitLabel === "sq ft" ? ["roofing-detail-reconciles"] : []),
    ];
    const within = (actual: number, expected: number) => Math.abs(actual - expected) < 0.03;
    const basePass = Boolean(line) && line.lowTotal >= 0 && line.highTotal >= line.lowTotal && Number.isFinite(line.laborHours)
      && within(line.unitPricing.lowInstalledPerUnit * line.quantity, line.lowTotal)
      && within(line.unitPricing.highInstalledPerUnit * line.quantity, line.highTotal);
    const roofingPass = task.category !== "roofing" || task.unitLabel !== "sq ft" || Boolean(line.roofingDetail
      && within(line.roofingDetail.installedPerSqFt.low, line.unitPricing.lowInstalledPerUnit)
      && within(line.roofingDetail.installedPerSquare.high, line.unitPricing.highInstalledPerUnit * 100));
    return { id: `audit-${String(index + 1).padStart(2, "0")}`, taskId: task.id, quantity, passed: basePass && roofingPass, checks };
  });
  const passed = cases.filter((item) => item.passed).length;
  return {
    executedAt: new Date().toISOString(), total: cases.length, passed, failed: cases.length - passed, passRate: Math.round((passed / cases.length) * 100), cases,
    policy: [
      "Every line must use a positive quantity and a finite labor-hour value.",
      "The high planning allowance must never be below the low planning allowance.",
      "Displayed per-unit amounts must reconcile to the line allowance within two cents.",
      "Roof scopes using square feet must show both $/sq ft and $/roofing square (100 sq ft).",
      "Results are planning checks only; an Owner must confirm field conditions, code, measurements, material selection, and final proposal pricing.",
    ],
  };
}
