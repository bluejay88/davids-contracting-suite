export type ServiceCategory =
  | "painting"
  | "flooring"
  | "roofing"
  | "handiwork"
  | "electrical-hvac";

export type AiProvider = "heuristic" | "openai-direct" | "webhook";
export type AuthRole = "staff" | "admin";
export type SessionRole = "public" | AuthRole;

export type JobStatus =
  | "Prospecting/Negotiating"
  | "In-Progress"
  | "Declined"
  | "Completed";

export type DeclineReason =
  | "Cost too high"
  | "Went with another contractor"
  | "Unable to get supplies needed"
  | "Do not have the manpower needed"
  | "Unable to meet the requested timeframe"
  | "Other";

export interface Supplier {
  id: string;
  name: string;
  focus: string;
  address: string;
  phone: string;
  url: string;
}

export interface MaterialTemplate {
  id: string;
  name: string;
  unit: string;
  quantityPerUnit: number;
  lowUnitCost: number;
  highUnitCost: number;
  supplierIds: string[];
  notes?: string;
}

export interface ServiceTask {
  id: string;
  category: ServiceCategory;
  name: string;
  shortLabel: string;
  unitLabel: string;
  defaultQuantity: number;
  lowRate: number;
  highRate: number;
  laborHoursPerUnit: number;
  materialWasteFactor: number;
  description: string;
  customaryIncludes: string[];
  customaryExcludes: string[];
  discoveryQuestions: string[];
  defaultMaterials: MaterialTemplate[];
}

export interface AidProgram {
  id: string;
  name: string;
  provider: string;
  eligibilityHint: string;
  focus: string;
  notes: string;
  url: string;
}

export interface RepProfile {
  repName: string;
  companyName: string;
  phone: string;
  email: string;
  title: string;
}

export interface AvailabilityWindow {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  enabled: boolean;
  start: string;
  end: string;
}

export interface AppSettings {
  repProfile: RepProfile;
  adminEmail: string;
  adminPassword: string;
  staffEmail: string;
  staffPassword: string;
  serviceAreaZip: string;
  aiProvider: AiProvider;
  googleAppsScriptUrl: string;
  aiWebhookUrl: string;
  emailWebhookUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiSearchModel: string;
  openAiTranscriptionModel: string;
  lowMarkupPct: number;
  highMarkupPct: number;
  taxPct: number;
  travelFee: number;
  defaultQuoteValidityDays: number;
  standardDepositPct: number;
  largeJobDepositPct: number;
  largeJobThreshold: number;
  defaultContingencyPct: number;
  availabilitySchedule: AvailabilityWindow[];
  consultationBlackoutDates: string[];
  hasAdminPassword: boolean;
  hasStaffPassword: boolean;
  hasOpenAiApiKey: boolean;
  hasAiWebhook: boolean;
  hasEmailWebhook: boolean;
  hasGoogleSheetsSync: boolean;
}

export interface QuoteSelection {
  taskId: string;
  quantity: number;
  scopeNote: string;
  conditionMultiplier: number;
  complexityMultiplier: number;
}

export interface ClientIntake {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  budget: number;
  emergencyIssues: string;
  requestedJobs: string;
  date: string;
  jobStatus: JobStatus;
  declineReason: DeclineReason | "";
  declineOtherReason: string;
  notes: string;
  paymentCollected: boolean;
  paymentAmount: number;
  assignedRep: string;
  aidSuggestions: string[];
  consentEmailContact: boolean;
  consentSmsContact: boolean;
  consentMarketing: boolean;
  consultationRequested: boolean;
  consultationDate: string;
  consultationTime: string;
  consultationNotes: string;
  consultationStatus: "None" | "Requested" | "Confirmed" | "Completed" | "Declined";
}

export interface QuoteLineBreakdown {
  taskId: string;
  category: ServiceCategory;
  taskName: string;
  quantity: number;
  unitLabel: string;
  scopeNote: string;
  lowLabor: number;
  highLabor: number;
  lowMaterials: number;
  highMaterials: number;
  lowTotal: number;
  highTotal: number;
  laborHours: number;
  customaryIncludes: string[];
  customaryExcludes: string[];
  materials: Array<MaterialTemplate & { lowExtendedCost: number; highExtendedCost: number }>;
}

export interface QuoteBuildOptions {
  discountPct: number;
  contingencyPct: number;
  rushJob: boolean;
  includePermitAllowance: boolean;
  permitAllowance: number;
  includeHaulAway: boolean;
  haulAwayFee: number;
  customerSuppliedMaterials: boolean;
  taxExempt: boolean;
  travelOverrideEnabled: boolean;
  travelOverrideFee: number;
  crewSize: number;
}

export interface QuoteCategoryTotal {
  category: ServiceCategory;
  label: string;
  lowTotal: number;
  highTotal: number;
  laborHours: number;
}

export interface QuoteMaterialRollup {
  name: string;
  unit: string;
  totalQuantity: number;
  lowTotal: number;
  highTotal: number;
  supplierIds: string[];
}

export interface QuotePaymentMilestone {
  label: string;
  lowAmount: number;
  highAmount: number;
  notes: string;
}

export interface QuoteHealthCheck {
  severity: "info" | "warning";
  message: string;
}

export interface QuoteBudgetFit {
  status: "under-budget" | "near-budget" | "over-budget" | "unknown";
  varianceLow: number;
  varianceHigh: number;
  note: string;
}

export interface QuoteTotals {
  laborLow: number;
  laborHigh: number;
  materialsLow: number;
  materialsHigh: number;
  subtotalLow: number;
  subtotalHigh: number;
  markupLow: number;
  markupHigh: number;
  contingencyLow: number;
  contingencyHigh: number;
  taxLow: number;
  taxHigh: number;
  travelFee: number;
  haulAwayFee: number;
  permitAllowance: number;
  discountLow: number;
  discountHigh: number;
  totalLow: number;
  totalHigh: number;
  laborHours: number;
}

export interface QuoteResult {
  id: string;
  projectTitle: string;
  projectSummary: string;
  categories: ServiceCategory[];
  selections: QuoteSelection[];
  breakdown: QuoteLineBreakdown[];
  categoryTotals: QuoteCategoryTotal[];
  materialRollup: QuoteMaterialRollup[];
  assumptions: string[];
  exclusions: string[];
  paymentSchedule: QuotePaymentMilestone[];
  budgetFit: QuoteBudgetFit;
  healthChecks: QuoteHealthCheck[];
  options: QuoteBuildOptions;
  validityDays: number;
  quoteExpiresAt: string;
  estimatedDays: number;
  suggestedCrewSize: number;
  scopeComplexityScore: number;
  totals: QuoteTotals;
  generatedAt: string;
}

export interface Reminder {
  id: string;
  clientName: string;
  note: string;
  dueDate: string;
  priority: "High" | "Medium" | "Low";
}

export interface HistoricalJob {
  id: string;
  clientName: string;
  projectTitle: string;
  categories: ServiceCategory[];
  notes: string;
  quoteTotal: number;
  status: JobStatus;
  generatedAt: string;
}

export interface CrmRecord {
  id: string;
  source: "staff-estimate" | "public-estimate";
  client: ClientIntake;
  quoteHistory: QuoteResult[];
  paymentDue: number;
  lastContactedAt: string;
  nextFollowUpAt: string;
  invoiceStatus: "Open" | "Partially Paid" | "Paid";
  crewLead: string;
  documentation: string[];
}

export interface AppState {
  settings: AppSettings;
  crmRecords: CrmRecord[];
  reminders: Reminder[];
  historicalJobs: HistoricalJob[];
}

export interface BootstrapPayload {
  sessionRole: SessionRole;
  hasQuoteSession: boolean;
  hasAdminSession: boolean;
  adminEmailHint: string;
  staffEmailHint: string;
  appState: AppState;
}

export interface LoginPayload {
  sessionRole: AuthRole;
  appState: AppState;
  message: string;
}

export interface SaveQuotePayload {
  message: string;
  googleSyncStatus: "success" | "failed" | "skipped";
  googleSyncMessage: string;
  appState: AppState;
}

export interface DashboardPayload {
  appState: AppState;
}

export interface SettingsPayload {
  appState: AppState;
  message: string;
}

export interface RecordPayload {
  appState: AppState;
  message: string;
}

export interface EmailQuotePayload {
  message: string;
}

export type IntegrationKey = "ai" | "email" | "google-sheets";
export type IntegrationStatus = "success" | "failed";

export interface IntegrationTestResult {
  key: IntegrationKey;
  status: IntegrationStatus;
  message: string;
  checkedAt: string;
  detail?: string;
}

export interface AiTaskSuggestion {
  taskId: string;
  quantity: number;
  conditionMultiplier: number;
  complexityMultiplier: number;
  scopeNote: string;
  rationale: string;
}

export interface AiProgramRecommendation {
  name: string;
  provider: string;
  focus: string;
  eligibilityHint: string;
  url: string;
  reasoning: string;
  source: "curated" | "live-search" | "model";
}

export interface AiMaterialRecommendation {
  name: string;
  taskId: string;
  quantity: number;
  unit: string;
  supplierId: string;
  supplierName: string;
  estimatedLow: number;
  estimatedHigh: number;
  sourceNote: string;
  reasoning: string;
}

export interface AiScopePlan {
  projectTitle: string;
  projectSummary: string;
  suggestedRequestedJobs: string;
  suggestedEmergencyIssues: string;
  suggestedNotes: string;
  categories: ServiceCategory[];
  taskSuggestions: AiTaskSuggestion[];
  followUpQuestions: string[];
  riskFlags: string[];
  similarJobIds: string[];
  confidenceNote: string;
  programs: AiProgramRecommendation[];
  materials: AiMaterialRecommendation[];
}
