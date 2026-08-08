import {
  AppSettings,
  AppState,
  AuthRole,
  BootstrapPayload,
  ClientIntake,
  CrmRecord,
  DashboardPayload,
  EmailQuotePayload,
  IntegrationKey,
  IntegrationTestResult,
  LoginPayload,
  QuoteResult,
  RecordPayload,
  SaveQuotePayload,
  SettingsPayload,
  ContactLead,
  FinancingInquiry,
  GalleryProject,
  SiteAnalyticsEvent,
} from "../types";

const jsonHeaders = {
  "Content-Type": "application/json",
};

export type OperationsStatePatch = Partial<
  Pick<AppState, "applicants" | "jobOpenings" | "projects" | "employees" | "materials" | "aiReviews" | "galleryProjects" | "podcastEpisodes" | "podcastEvents">
>;

const blobToDataUrl = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const requestJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}.`);
  }

  return payload as T;
};

export const fetchBootstrap = () => requestJson<BootstrapPayload>("/api/bootstrap");

export const loginUser = (role: AuthRole, email: string, password: string, security: Record<string, unknown>) =>
  requestJson<LoginPayload>("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ role, email, password, ...security }),
  });

export const logoutSession = () =>
  requestJson<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });

export const fetchAdminDashboard = () => requestJson<DashboardPayload>("/api/admin/dashboard");

export const saveQuoteRecord = (record: CrmRecord, quote: QuoteResult, security: Record<string, unknown> = {}) =>
  requestJson<SaveQuotePayload>("/api/quotes/save", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ record, quote, ...security }),
  });

export const updateAdminSettings = (settings: AppSettings) =>
  requestJson<SettingsPayload>("/api/admin/settings", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ settings }),
  });

export const updateOperationsState = (patch: OperationsStatePatch) =>
  requestJson<SettingsPayload>("/api/admin/operations", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ patch }),
  });

export const updateDashboardRecord = (recordId: string, patch: Partial<CrmRecord>) =>
  requestJson<RecordPayload>(`/api/admin/records/${recordId}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ patch }),
  });

export const runIntegrationTest = (kind: IntegrationKey) =>
  requestJson<IntegrationTestResult>("/api/admin/integrations/test", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ kind }),
  });

export const emailQuote = async (
  client: ClientIntake,
  quote: QuoteResult,
  pdfBlob: Blob,
) => {
  const pdfDataUrl = await blobToDataUrl(pdfBlob);
  return requestJson<EmailQuotePayload>("/api/quotes/email", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      client,
      quote,
      pdfDataUrl,
      filename: `${client.lastName || "client"}-${quote.projectTitle.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    }),
  });
};

export const submitContactLead = (lead: Omit<ContactLead, "id" | "status" | "createdAt">) =>
  requestJson<{ message: string; id: string }>("/api/contact", { method: "POST", headers: jsonHeaders, body: JSON.stringify(lead) });

export const submitFinancingInquiry = (inquiry: Omit<FinancingInquiry, "id" | "status" | "createdAt">) =>
  requestJson<{ message: string; id: string }>("/api/financing", { method: "POST", headers: jsonHeaders, body: JSON.stringify(inquiry) });

export const recordAnalyticsEvent = (event: Omit<SiteAnalyticsEvent, "id" | "occurredAt">) =>
  requestJson<{ message: string }>("/api/analytics", { method: "POST", headers: jsonHeaders, body: JSON.stringify(event) });

export const fetchGallery = () => requestJson<{ projects: GalleryProject[] }>("/api/gallery");

export interface CareersApplicationPayload {
  firstName: string; lastName: string; email: string; phone: string; city?: string; state?: string;
  desiredRole?: string; desiredRoles?: string[]; skills: string | string[]; yearsExperience: number;
  certifications?: string[]; availabilityDate?: string; consentToAiReview: true;
  answers: Record<string, string | boolean | number>; resumeFileName: string; resumeMimeType: string;
  resumeSize: number; resumeDataUrl: string; resumeText?: string;
}

export const submitCareersApplication = (application: CareersApplicationPayload) =>
  requestJson<{ message: string; applicationId: string }>("/api/careers/apply", { method: "POST", headers: jsonHeaders, body: JSON.stringify(application) });
