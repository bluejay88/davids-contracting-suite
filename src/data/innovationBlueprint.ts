export interface InnovationPillar {
  id: string;
  name: string;
  count: number;
  summary: string;
  phase: "Now" | "Next" | "Later";
}

export interface LaunchPriority {
  id: string;
  title: string;
  outcome: string;
  whyNow: string;
}

export interface PlatformModule {
  id: string;
  name: string;
  stack: string;
  summary: string;
  nextStep: string;
}

export const innovationPillars: InnovationPillar[] = [
  {
    id: "pillar-estimating",
    name: "Estimating Intelligence",
    count: 10,
    summary: "AI-assisted scope building, benchmark pricing, revision intelligence, and confidence-aware quote guidance.",
    phase: "Now",
  },
  {
    id: "pillar-vision-ar",
    name: "Vision + AR Capture",
    count: 10,
    summary: "Phone-first room scans, annotated surfaces, damage detection, and spatial takeoff workflows.",
    phase: "Now",
  },
  {
    id: "pillar-materials",
    name: "Materials + Procurement AI",
    count: 10,
    summary: "Supplier intelligence, live pricing snapshots, substitutions, and waste-aware order planning.",
    phase: "Next",
  },
  {
    id: "pillar-crm-sales",
    name: "CRM + Sales AI",
    count: 10,
    summary: "Lead scoring, follow-up drafting, financing-fit prompts, and homeowner intent prediction.",
    phase: "Now",
  },
  {
    id: "pillar-ops",
    name: "Operations + Scheduling",
    count: 8,
    summary: "Crew-aware routing, consultation orchestration, job sequencing, and conflict prevention.",
    phase: "Next",
  },
  {
    id: "pillar-field",
    name: "Field Execution + QA",
    count: 8,
    summary: "Punch-list automation, photo proof, change-order capture, and completion quality checks.",
    phase: "Next",
  },
  {
    id: "pillar-finance",
    name: "Finance + Risk",
    count: 6,
    summary: "Margin protection, payment prediction, scope-risk alerts, and fraud/chargeback hygiene.",
    phase: "Next",
  },
  {
    id: "pillar-platform",
    name: "Data Platform + Integrations",
    count: 6,
    summary: "A normalized backend, async AI jobs, asset storage, search, warehouse feeds, and API versioning.",
    phase: "Now",
  },
  {
    id: "pillar-workforce",
    name: "Workforce + Knowledge",
    count: 4,
    summary: "Crew coaching, SOP retrieval, skill matching, and onboarding assistance.",
    phase: "Later",
  },
  {
    id: "pillar-analytics",
    name: "Owner Analytics + Strategy",
    count: 3,
    summary: "Profitability intelligence, service-area strategy, and AI-assisted business planning.",
    phase: "Later",
  },
];

export const launchPriorities: LaunchPriority[] = [
  {
    id: "priority-room-packet",
    title: "Room-by-room AI scope packets",
    outcome: "Turn photos, notes, and measurements into structured room scopes with assumptions, risks, and follow-up questions.",
    whyNow: "Current tools still require too much manual interpretation after capture.",
  },
  {
    id: "priority-ar-measure",
    title: "Guided AR measurement walk",
    outcome: "Prompt the contractor or homeowner to capture walls, floors, ceilings, openings, and fixtures in a repeatable order.",
    whyNow: "Measurement inconsistency is one of the fastest ways to lose quote accuracy.",
  },
  {
    id: "priority-quote-revisions",
    title: "Append-only quote revision engine",
    outcome: "Track estimate versions, homeowner approvals, alternates, and change-order deltas without losing history.",
    whyNow: "The current `quoteHistory[0]` approach will not scale to real negotiations.",
  },
  {
    id: "priority-price-observations",
    title: "Supplier price observation service",
    outcome: "Store vendor snapshots over time so the app can explain why today's material range moved.",
    whyNow: "Live pricing is only useful if the estimate can defend and audit the number later.",
  },
  {
    id: "priority-ai-artifacts",
    title: "AI artifact registry",
    outcome: "Persist prompts, outputs, citations, confidence, and source files for every scope/material/program run.",
    whyNow: "Without provenance, AI recommendations are hard to trust or improve.",
  },
  {
    id: "priority-public-leads",
    title: "Public-to-contractor conversion funnel",
    outcome: "Let homeowners self-start estimates, book consultations, and enter consented contact details without staff login.",
    whyNow: "This is already partially live and should become a measurable acquisition channel.",
  },
  {
    id: "priority-margin-alerts",
    title: "Margin and underbid alerts",
    outcome: "Warn when quote structure, crew hours, travel, or materials drift below safe margin thresholds.",
    whyNow: "Owners need fewer silent underbids and better visibility into risk before sending the PDF.",
  },
  {
    id: "priority-job-memory",
    title: "Historical job retrieval memory",
    outcome: "Retrieve similar jobs using text, structured scope, transcripts, and image captions instead of category-only matching.",
    whyNow: "Past work is one of the best proprietary data assets a contractor has.",
  },
  {
    id: "priority-async-ai",
    title: "Async AI + upload pipeline",
    outcome: "Move image, audio, and scan analysis off synchronous browser requests and into tracked background jobs.",
    whyNow: "AR and multimodal features will outgrow the current inline data URL pattern.",
  },
  {
    id: "priority-owner-command",
    title: "Owner command center",
    outcome: "Blend close rate, receivables, consultation pressure, crew capacity, and AI pipeline insights into one dashboard.",
    whyNow: "The app should compete on business intelligence, not just capture and quoting.",
  },
];

export const platformModules: PlatformModule[] = [
  {
    id: "module-core-db",
    name: "Operational source of truth",
    stack: "PostgreSQL + PostGIS",
    summary: "Normalize CRM, properties, opportunities, appointments, estimates, projects, invoices, and payments.",
    nextStep: "Replace single-blob AppState persistence with entity tables plus migration mapping.",
  },
  {
    id: "module-asset-store",
    name: "Media and document layer",
    stack: "S3-compatible object storage",
    summary: "Store photos, audio, PDFs, scan bundles, thumbnails, and derived files outside the primary database.",
    nextStep: "Introduce asset records with signed URLs, retention rules, and access scope.",
  },
  {
    id: "module-ai-registry",
    name: "AI provenance and replay",
    stack: "Postgres + JSONB + background queue",
    summary: "Persist prompts, model choices, citations, confidence, and execution timing for every AI run.",
    nextStep: "Create async AI job ids and artifact records for scope/material/program analysis.",
  },
  {
    id: "module-search-memory",
    name: "Search and retrieval",
    stack: "Postgres full-text + pgvector",
    summary: "Support semantic recall across historical jobs, transcripts, OCR text, and supplier/product knowledge.",
    nextStep: "Embed job summaries, transcripts, and AI notes for better scope retrieval.",
  },
  {
    id: "module-events",
    name: "Analytics event spine",
    stack: "Operational events + warehouse feed",
    summary: "Track funnel, quote revision, payment, and AI usage events without deriving KPIs from mutable rows.",
    nextStep: "Emit immutable activity facts for quote created, lead captured, job won, payment posted, and AI run finished.",
  },
  {
    id: "module-contracts",
    name: "Versioned integration contracts",
    stack: "Typed REST resources + webhook versioning",
    summary: "Decouple Google Sheets, email, AI, and future mobile/AR clients from the current nested payload shape.",
    nextStep: "Replace whole-object update routes with typed resource endpoints and contract versions.",
  },
];

export const totalInnovationCount = innovationPillars.reduce((sum, pillar) => sum + pillar.count, 0);
