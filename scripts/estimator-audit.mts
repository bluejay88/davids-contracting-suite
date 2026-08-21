import { initialAppState } from "../src/data/mockData.ts";
import { runEstimatorAudit } from "../src/lib/estimatorAudit.ts";

const report = runEstimatorAudit(initialAppState.settings);
console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, passRate: report.passRate, policy: report.policy }, null, 2));
if (report.failed) process.exitCode = 1;
