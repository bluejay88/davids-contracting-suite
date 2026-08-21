import { useMemo } from "react";
import { BadgeDollarSign, BookOpenCheck, BrainCircuit, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { AppState, ContactLead, CrmRecord, FinancingInquiry } from "../types";
import { formatCurrency } from "../lib/estimates";
import { runEstimatorAudit } from "../lib/estimatorAudit";
import { reportCatalog } from "../data/reportCatalog";

type Signal = { label: string; points: number; detail: string };
type LeadInsight = {
  id: string;
  name: string;
  source: string;
  readiness: number;
  closeScore: number;
  value: number;
  signals: Signal[];
  nextActions: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const daysSince = (value: string) => value ? Math.max(0, (Date.now() - new Date(value).getTime()) / 86_400_000) : 999;

function scoreContact(lead: ContactLead): LeadInsight {
  const signals: Signal[] = [
    { label: "Contact permission", points: lead.consentToContact ? 20 : 0, detail: lead.consentToContact ? "Permission is recorded." : "No permission to contact is recorded." },
    { label: "Project clarity", points: Math.min(20, lead.serviceInterest.length * 7 + (lead.message.trim().length >= 40 ? 6 : 0)), detail: `${lead.serviceInterest.length} service interests and ${lead.message.trim().length} message characters.` },
    { label: "Reachability", points: (lead.email ? 8 : 0) + (lead.phone ? 8 : 0), detail: `${lead.email ? "Email" : "No email"}; ${lead.phone ? "phone" : "no phone"}.` },
    { label: "Pipeline progress", points: ({ New: 2, Contacted: 12, Qualified: 25, Closed: 35 } as const)[lead.status], detail: `Current status: ${lead.status}.` },
    { label: "Recency", points: daysSince(lead.createdAt) <= 7 ? 9 : daysSince(lead.createdAt) <= 30 ? 5 : 1, detail: `Received ${Math.round(daysSince(lead.createdAt))} day(s) ago.` },
  ];
  const readiness = clamp(signals[0].points + signals[1].points + signals[2].points + signals[4].points + (lead.financingInterest ? 10 : 4));
  const closeScore = clamp(signals.reduce((sum, signal) => sum + signal.points, 0));
  const nextActions = [
    !lead.consentToContact ? "Do not contact until permission is obtained." : lead.status === "New" ? "Respond using the preferred contact method and confirm the project scope." : "Confirm the next dated commitment with the homeowner.",
    lead.financingInterest ? "Discuss budget range and provide neutral financing resources without promising approval." : "Confirm a working budget range and desired start window.",
    lead.serviceInterest.length ? `Prepare discovery questions for ${lead.serviceInterest.slice(0, 2).join(" and ")}.` : "Identify the primary service and property constraints.",
  ];
  return { id: `contact-${lead.id}`, name: `${lead.firstName} ${lead.lastName}`, source: "Website inquiry", readiness, closeScore, value: 0, signals, nextActions };
}

function scoreFinancing(item: FinancingInquiry): LeadInsight {
  const value = item.estimatedProjectCost ?? item.requestedAmount ?? 0;
  const signals: Signal[] = [
    { label: "Contact permission", points: item.consentToContact ? 18 : 0, detail: item.consentToContact ? "Permission is recorded." : "Permission is not recorded." },
    { label: "Budget definition", points: value > 0 ? 22 : 3, detail: value > 0 ? `${formatCurrency(value)} project value supplied.` : "Project value is not supplied." },
    { label: "Project definition", points: (item.projectType.trim() ? 12 : 0) + (item.financingGoals.trim().length >= 30 ? 8 : 2), detail: `${item.projectType || "No project type"}; financing goal detail recorded.` },
    { label: "Pipeline progress", points: ({ New: 3, Reviewing: 14, Referred: 25, Closed: 35 } as const)[item.status], detail: `Current status: ${item.status}.` },
    { label: "Estimate connection", points: item.estimateRecordId ? 10 : 0, detail: item.estimateRecordId ? "Connected to an estimate." : "No connected estimate." },
  ];
  const total = signals.reduce((sum, signal) => sum + signal.points, 0);
  return {
    id: `finance-${item.id}`, name: `${item.firstName} ${item.lastName}`, source: "Financing inquiry", readiness: clamp(total - signals[3].points + 18), closeScore: clamp(total), value, signals,
    nextActions: [
      !item.consentToContact ? "Do not contact until permission is obtained." : "Confirm project scope, target payment comfort, and timing.",
      item.estimateRecordId ? "Review the connected estimate before the consultation." : "Invite the homeowner to complete an estimate so funding and scope can be discussed together.",
      "Present multiple neutral funding paths and clearly state that lenders make all credit decisions.",
    ],
  };
}

function scoreCrm(record: CrmRecord): LeadInsight {
  const quote = record.quoteHistory[0];
  const value = quote?.totals.totalHigh ?? record.client.budget ?? 0;
  const hasScope = record.client.requestedJobs.trim().length > 15;
  const signals: Signal[] = [
    { label: "Contact permission", points: record.client.consentEmailContact || record.client.consentSmsContact ? 15 : 0, detail: "Uses only recorded email/SMS permissions." },
    { label: "Estimate", points: quote ? 24 : value > 0 ? 12 : 0, detail: quote ? "A detailed estimate exists." : value ? "Budget supplied; detailed estimate pending." : "Budget and estimate pending." },
    { label: "Scope clarity", points: hasScope ? 15 : 5, detail: hasScope ? "Requested work has useful detail." : "More discovery is needed." },
    { label: "Consultation", points: ({ None: 0, Requested: 8, Confirmed: 16, Completed: 22, Declined: 0 } as const)[record.client.consultationStatus], detail: `Consultation: ${record.client.consultationStatus}.` },
    { label: "Pipeline progress", points: ({ "Prospecting/Negotiating": 12, "In-Progress": 27, Completed: 35, Declined: 0 } as const)[record.client.jobStatus], detail: `Job status: ${record.client.jobStatus}.` },
    { label: "Deposit", points: record.client.paymentCollected ? 16 : 0, detail: record.client.paymentCollected ? `${formatCurrency(record.client.paymentAmount)} collected.` : "No payment recorded." },
  ];
  const closeScore = clamp(signals.reduce((sum, signal) => sum + signal.points, 0));
  const readiness = clamp(signals[0].points + signals[1].points + signals[2].points + signals[3].points + (record.client.date ? 10 : 0));
  const nextActions = [
    !quote ? "Turn the stated scope into a written estimate with assumptions and exclusions." : record.client.consultationStatus === "None" ? "Offer a specific consultation time and confirm decision-makers." : "Document the next dated commitment and owner.",
    !record.client.paymentCollected && closeScore >= 65 ? "Review deposit terms only after scope, price, and contract approval." : "Keep payment milestones aligned to verified project progress.",
    record.nextFollowUpAt ? `Follow up by ${record.nextFollowUpAt}.` : "Set a specific follow-up date.",
  ];
  return { id: `crm-${record.id}`, name: `${record.client.firstName} ${record.client.lastName}`, source: "CRM / estimate", readiness, closeScore, value, signals, nextActions };
}

const training = [
  { title: "OSHA construction safety", reason: "Core hazard recognition and compliance foundation.", url: "https://www.osha.gov/training/outreach/training-programs/construction" },
  { title: "EPA lead-safe renovation", reason: "Lead-safe requirements for qualifying pre-1978 work.", url: "https://www.epa.gov/lead/renovation-repair-and-painting-program" },
  { title: "NCCER craft training", reason: "Structured construction credentials and assessments.", url: "https://www.nccer.org/" },
  { title: "Building science education", reason: "Moisture, enclosure, energy, and healthy-home fundamentals.", url: "https://www.energy.gov/eere/buildings/building-science-education" },
  { title: "Small-business financial management", reason: "Job costing, cash flow, and operating discipline.", url: "https://www.sba.gov/business-guide/manage-your-business/manage-your-finances" },
];

export function RevenueIntelligence({ appState }: { appState: AppState }) {
  const insights = useMemo(() => [
    ...appState.crmRecords.map(scoreCrm),
    ...appState.financingInquiries.map(scoreFinancing),
    ...appState.contactLeads.map(scoreContact),
  ].sort((a, b) => b.closeScore - a.closeScore), [appState]);
  const weeklyLabor = appState.employees.filter((employee) => employee.status === "Active").reduce((sum, employee) => sum + employee.hourlyRate * employee.weeklyCapacityHours, 0);
  const monthlyLabor = weeklyLabor * 4.33;
  const remainingContractValue = appState.projects.filter((project) => project.status === "Active" || project.status === "Planning").reduce((sum, project) => sum + Math.max(0, project.budget - project.actualCost), 0);
  const coverageWeeks = weeklyLabor ? remainingContractValue / weeklyLabor : 0;
  const pipelineValue = insights.reduce((sum, item) => sum + item.value, 0);
  const estimatorAudit = useMemo(() => runEstimatorAudit(appState.settings), [appState.settings]);

  return <section className="revenue-intelligence" aria-labelledby="revenue-intelligence-title">
    <header className="revenue-intelligence__header"><div><p className="eyebrow">Decision support</p><h2 id="revenue-intelligence-title">Revenue, lead readiness, and workforce coverage</h2><p>Explainable operational signals only. Scores do not use protected traits, creditworthiness, or inferred personal characteristics, and every recommendation requires human review.</p></div><BrainCircuit aria-hidden="true" /></header>
    <div className="revenue-intelligence__metrics">
      <article><TrendingUp/><span>Visible pipeline</span><strong>{formatCurrency(pipelineValue)}</strong><small>Known budgets and estimates—not a revenue forecast</small></article>
      <article><Users/><span>Weekly labor capacity cost</span><strong>{formatCurrency(weeklyLabor)}</strong><small>{formatCurrency(monthlyLabor)} approximate monthly capacity</small></article>
      <article><BadgeDollarSign/><span>Gross coverage indicator</span><strong>{coverageWeeks.toFixed(1)} weeks</strong><small>Remaining project budgets ÷ weekly labor; excludes overhead and materials</small></article>
      <article><ShieldCheck/><span>Human review</span><strong>Required</strong><small>Validate scope, margin, schedule, consent, and customer needs</small></article>
    </div>
    <div className="lead-intelligence-list">
      {insights.length ? insights.slice(0, 20).map((item) => <details key={item.id} className="lead-intelligence-card">
        <summary><div><strong>{item.name}</strong><small>{item.source}{item.value ? ` · ${formatCurrency(item.value)}` : ""}</small></div><span><b>{item.readiness}</b> readiness</span><span><b>{item.closeScore}</b> close-to-closing</span></summary>
        <div className="lead-intelligence-card__body"><div><h3>Why these scores</h3>{item.signals.map((signal) => <p key={signal.label}><strong>{signal.label}: +{signal.points}</strong><span>{signal.detail}</span></p>)}</div><div><h3>Recommended next moves</h3><ol>{item.nextActions.map((action) => <li key={action}>{action}</li>)}</ol><p className="human-review-note">Owner review required. Never pressure a customer, promise financing, or treat this score as a credit or eligibility decision.</p></div></div>
      </details>) : <p className="helper-text">Lead guidance will appear after website inquiries, estimates, or financing requests are received.</p>}
    </div>
    <section className="training-foundation"><div><p className="eyebrow">Reporting library</p><h3>40 owner reporting views</h3><p>Definitions are ready; each view is enabled only when its source records are available and validated.</p></div><div>{reportCatalog.map((report) => <span key={report.name}><strong>{report.name}</strong><small>{report.group}</small></span>)}</div></section>
    <section className="training-foundation estimator-audit-report"><div><p className="eyebrow">Estimator quality control</p><h3>{estimatorAudit.passed}/{estimatorAudit.total} deterministic cases passed</h3><p>Checks unit-pricing math across square-foot, linear-foot, item, and roofing scopes. This is a calculation QA report—not a promise that a field quote will match an online planning range.</p></div><div><strong>{estimatorAudit.passRate}% pass rate</strong><small>{estimatorAudit.failed ? `${estimatorAudit.failed} case(s) require correction before pricing changes are approved.` : "No calculation exceptions detected in the current 50-case policy run."}</small>{estimatorAudit.policy.map((rule) => <small key={rule}>• {rule}</small>)}</div></section>
    <section className="training-foundation"><div><p className="eyebrow">Workforce development</p><h3><BookOpenCheck/> Training recommendation foundation</h3><p>Curated starting points. The owner must verify role fit, current requirements, provider status, cost, and completion records.</p></div><div>{training.map((item) => <a key={item.title} href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.reason}</span></a>)}</div></section>
  </section>;
}
