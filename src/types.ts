export type ServiceCategory =
  | "painting"
  | "flooring"
  | "roofing"
  | "handiwork"
  | "electrical-hvac";

export type AiProvider = "heuristic" | "openai-direct" | "anthropic-direct" | "webhook";
export type AuthRole = "staff" | "admin" | "developer";
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
  automationEnabled: boolean;
  googleAppsScriptUrl: string;
  aiWebhookUrl: string;
  emailWebhookUrl: string;
  openAiApiKey: string;
  anthropicApiKey: string;
  openAiModel: string;
  anthropicModel: string;
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
  hasAiGateway: boolean;
  hasAnthropicApiKey: boolean;
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
  /** Customer-safe planning rate derived from the selected quantity and line allowance. */
  unitPricing: {
    unitLabel: string;
    lowLaborPerUnit: number;
    highLaborPerUnit: number;
    lowMaterialsPerUnit: number;
    highMaterialsPerUnit: number;
    lowInstalledPerUnit: number;
    highInstalledPerUnit: number;
  };
  /** Roofing-only view; a roofing square equals 100 square feet. */
  roofingDetail?: {
    coverageSqFt: number;
    roofingSquares: number;
    laborPerSqFt: { low: number; high: number };
    materialsPerSqFt: { low: number; high: number };
    installedPerSqFt: { low: number; high: number };
    installedPerSquare: { low: number; high: number };
  };
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

export type ApplicantStage = "New" | "Screening" | "Interview" | "Offer" | "Hired" | "Rejected" | "Withdrawn";
export type EmploymentType = "Full-time" | "Part-time" | "Temporary" | "Contract";

export interface Applicant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  source: "Website" | "Referral" | "Job board" | "Walk-in" | "Other";
  desiredRoles: string[];
  skills: string[];
  yearsExperience: number;
  certifications: string[];
  availabilityDate: string;
  employmentPreference: EmploymentType[];
  stage: ApplicantStage;
  assignedTo: string;
  resumeFileName: string;
  resumeText: string;
  notes: string;
  consentToAiReview: boolean;
  createdAt: string;
  updatedAt: string;
  applicationAnswers?: Record<string, string | boolean | number>;
  resume?: { fileName: string; mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; size: number; storageKey: string };
}

export interface ContactLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContact: "Email" | "Phone" | "Text";
  serviceInterest: string[];
  message: string;
  financingInterest: boolean;
  consentToContact: boolean;
  status: "New" | "Contacted" | "Qualified" | "Closed";
  createdAt: string;
}

export interface FinancingInquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  projectType: string;
  estimatedProjectCost: number | null;
  requestedAmount: number | null;
  timeline: string;
  financingGoals: string;
  estimateRecordId: string;
  consentToContact: boolean;
  status: "New" | "Reviewing" | "Referred" | "Closed";
  createdAt: string;
}

export interface SiteAnalyticsEvent {
  id: string;
  anonymousSessionId: string;
  eventType: "page_view" | "page_leave" | "cta_click" | "service_interest" | "financing_resource_click";
  page: string;
  target: string;
  durationSeconds: number | null;
  occurredAt: string;
}

export interface GalleryProject {
  id: string;
  title: string;
  slug: string;
  city: string;
  state: string;
  projectType: string;
  purpose?: string;
  propertyLabel?: string;
  address?: string;
  summary: string;
  completedAt: string;
  coverImageUrl: string;
  media: Array<{ id: string; type: "image" | "video"; url: string; thumbnailUrl: string; alt: string; caption: string; attribution?: string }>;
  published: boolean;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PodcastEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  description: string;
  format: "Audio" | "Video" | "Audio & Video";
  mediaUrl: string;
  thumbnailUrl: string;
  duration: string;
  publishedAt: string;
  status: "Draft" | "Scheduled" | "Published";
  featured: boolean;
}

export interface PodcastEvent {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  format: "Live stream" | "Premiere" | "Recording";
  watchUrl: string;
  description: string;
  published: boolean;
}

export interface JobOpening {
  id: string;
  title: string;
  department: "Field Operations" | "Estimating" | "Administration" | "Project Management";
  employmentType: EmploymentType;
  location: string;
  status: "Draft" | "Open" | "Paused" | "Filled" | "Closed";
  openings: number;
  requiredSkills: string[];
  preferredSkills: string[];
  minimumYearsExperience: number;
  requiredCertifications: string[];
  payRangeLow: number;
  payRangeHigh: number;
  description: string;
  hiringManager: string;
  targetStartDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  employmentType: EmploymentType;
  status: "Active" | "Leave" | "Inactive";
  email: string;
  phone: string;
  hireDate: string;
  hourlyRate: number;
  payFrequency: "Daily" | "Weekly" | "Biweekly" | "Semimonthly" | "Monthly" | "Per Project" | "Contracted" | "Hourly" | "Commission" | "Other";
  paymentMethod: "Cash" | "Check" | "Direct Deposit" | "PayPal" | "Cash App" | "Venmo" | "Zelle" | "ACH" | "Prepaid Card" | "Other";
  /** Private payout alias or account label only. Never store bank/card numbers here. */
  paymentHandle: string;
  skills: string[];
  certifications: Array<{ name: string; expiresAt: string }>;
  availability: "Available" | "Partially Allocated" | "Fully Allocated" | "Unavailable";
  weeklyCapacityHours: number;
  assignedProjectIds: string[];
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
}

export interface FieldInvoiceDraft {
  id: string;
  projectId: string;
  employeeId: string;
  workDate: string;
  hoursWorked: number;
  workSummary: string;
  materialsNote: string;
  photoUrls: string[];
  status: "Draft" | "Submitted" | "Approved" | "Paid" | "Returned";
  submittedAt: string;
}

export interface ProjectMilestone {
  id: string;
  name: string;
  dueDate: string;
  status: "Not Started" | "In Progress" | "Blocked" | "Complete";
  percentComplete: number;
}

export interface ProjectRisk {
  id: string;
  title: string;
  impact: "Low" | "Medium" | "High" | "Critical";
  probability: "Low" | "Medium" | "High";
  mitigation: string;
  owner: string;
  status: "Open" | "Monitoring" | "Resolved";
}

export interface Project {
  id: string;
  crmRecordId: string;
  name: string;
  clientName: string;
  status: "Planning" | "Active" | "On Hold" | "Completed" | "Cancelled";
  health: "Green" | "Amber" | "Red";
  priority: "Low" | "Medium" | "High" | "Critical";
  projectManager: string;
  employeeIds: string[];
  startDate: string;
  targetEndDate: string;
  budget: number;
  committedCost: number;
  actualCost: number;
  percentComplete: number;
  summary: string;
  milestones: ProjectMilestone[];
  risks: ProjectRisk[];
  materialIds: string[];
  activity?: ProjectActivity[];
  updatedAt: string;
}

export interface MaterialItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderPoint: number;
  unitCost: number;
  supplierName: string;
  supplierUrl: string;
  leadTimeDays: number;
  location: string;
  projectIds: string[];
  status: "In Stock" | "Low Stock" | "Backordered" | "Discontinued";
  lastUpdatedAt: string;
}

export interface AiReview {
  id: string;
  subjectType: "Applicant" | "Project" | "Employee" | "Material";
  subjectId: string;
  reviewType: "Job Readiness" | "Project Health" | "Workforce Match" | "Material Risk";
  status: "Pending" | "Completed" | "Failed" | "Needs Human Review";
  provider: string;
  model: string;
  score: number | null;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  evidence: string[];
  confidence: number | null;
  humanDecision: "Pending" | "Accepted" | "Overridden";
  reviewedBy: string;
  createdAt: string;
  completedAt: string;
}

export interface AppState {
  settings: AppSettings;
  crmRecords: CrmRecord[];
  reminders: Reminder[];
  historicalJobs: HistoricalJob[];
  applicants: Applicant[];
  jobOpenings: JobOpening[];
  projects: Project[];
  employees: Employee[];
  materials: MaterialItem[];
  aiReviews: AiReview[];
  contactLeads: ContactLead[];
  financingInquiries: FinancingInquiry[];
  analyticsEvents: SiteAnalyticsEvent[];
  galleryProjects: GalleryProject[];
  podcastEpisodes: PodcastEpisode[];
  podcastEvents: PodcastEvent[];
  fieldInvoices?: FieldInvoiceDraft[];
  ownerNotifications?: OwnerNotification[];
}

export interface ProjectAttachment {
  id: string;
  name: string;
  mediaType: "image" | "video" | "document";
  url: string;
  uploadedAt: string;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  kind: "Field Note" | "Owner Comment" | "Private Owner Note" | "System Alert";
  authorName: string;
  authorRole: "Owner" | "Contractor" | "Estimator" | "System";
  body: string;
  attachments: ProjectAttachment[];
  createdAt: string;
}

export interface OwnerNotification {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  severity: "Info" | "Review" | "Urgent";
  createdAt: string;
  readAt: string;
  source: "Field documentation" | "Owner activity" | "Rules review";
}

export interface BootstrapPayload {
  sessionRole: SessionRole;
  sessionEmail?: string;
  hasQuoteSession: boolean;
  hasAdminSession: boolean;
  hasDeveloperSession?: boolean;
  adminEmailHint: string;
  staffEmailHint: string;
  appState: AppState;
}

export interface LoginPayload {
  sessionRole: AuthRole;
  sessionEmail?: string;
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
