export const reportCatalog = [
  ["Revenue", "Pipeline value", "Won revenue", "Receivables", "Deposits collected", "Estimate conversion", "Average job value", "Gross-margin review"],
  ["Projects", "Project health", "Budget vs actual", "Schedule variance", "Milestone status", "Open risks", "Change-order log", "Closeout readiness"],
  ["Workforce", "Daily assignments", "Capacity forecast", "Hours submitted", "Payroll request register", "Certification expiry", "Training needs", "Safety observations"],
  ["Sales & CRM", "Lead source", "Response-time SLA", "Consultation pipeline", "Follow-up due", "Financing interest", "Lost-job reasons", "Referral performance"],
  ["Operations", "Material demand", "Reorder risk", "Supplier spend", "Equipment needs", "Field documentation", "Photo/media register", "Invoice status", "Owner notifications"],
].flatMap(([group, ...reports]) => reports.map((name) => ({ group, name })));
