import {
  AppSettings,
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
} from "../types";

const jsonHeaders = {
  "Content-Type": "application/json",
};

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

export const loginUser = (role: AuthRole, email: string, password: string) =>
  requestJson<LoginPayload>("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ role, email, password }),
  });

export const logoutSession = () =>
  requestJson<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });

export const fetchAdminDashboard = () => requestJson<DashboardPayload>("/api/admin/dashboard");

export const saveQuoteRecord = (record: CrmRecord, quote: QuoteResult) =>
  requestJson<SaveQuotePayload>("/api/quotes/save", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ record, quote }),
  });

export const updateAdminSettings = (settings: AppSettings) =>
  requestJson<SettingsPayload>("/api/admin/settings", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ settings }),
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
