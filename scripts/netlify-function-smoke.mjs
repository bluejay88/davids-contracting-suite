import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiHandler from "../netlify/functions/api.mjs";

const baseUrl = "http://local.test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localNetlifyStateFile = path.join(rootDir, "server-data", "netlify-app-state.json");

const STAFF_EMAIL = process.env.STAFF_EMAIL || "estimator@davidscontracting.local";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || "FieldReady30!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "owner@davidscontracting.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "BuiltOnPurpose30!";
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL || "developer@davidscontracting.local";
const DEVELOPER_PASSWORD = process.env.DEVELOPER_PASSWORD || "DeveloperReady30!";
const MOCK_BASE = process.env.MOCK_BASE_URL || "http://127.0.0.1:4310";

const log = (message) => {
  console.log(message);
};
const securityCheck = async (action) => {
  const response = await requestJson(`/api/security/challenge?action=${encodeURIComponent(action)}`);
  assert(response.ok, `Could not obtain a ${action} security challenge.`);
  await new Promise((resolve) => setTimeout(resolve, 1250));
  const challenge = response.payload;
  return {
    website: "",
    challengeAction: challenge.action,
    challengeId: challenge.challengeId,
    challengeIssuedAt: challenge.issuedAt,
    challengeA: challenge.a,
    challengeB: challenge.b,
    challengeAnswer: Number(challenge.a) + Number(challenge.b),
    challengeSignature: challenge.signature,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createCookieJar = () => ({
  cookie: "",
  update(response) {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      return;
    }

    const [cookiePart] = setCookie.split(";");
    this.cookie = cookiePart;
  },
});

const requestJson = async (pathName, options = {}, cookieJar) => {
  const request = new Request(`${baseUrl}${pathName}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar?.cookie ? { cookie: cookieJar.cookie } : {}),
      ...(options.sameOrigin === false ? {} : { origin: baseUrl }),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const response = await apiHandler(request);
  cookieJar?.update(response);
  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const timestamp = Date.now();
const publicSmokeRecordId = `crm-public-netlify-${timestamp}`;
const staffSmokeRecordId = `crm-staff-netlify-${timestamp}`;
const smokeQuoteId = `quote-netlify-${timestamp}`;

const baseClient = {
  firstName: "Smoke",
  lastName: "Netlify",
  address: "123 Audit Lane",
  city: "Decatur",
  state: "IL",
  zip: "62526",
  email: "smoke.netlify@example.com",
  phone: "217-555-0199",
  budget: 3200,
  emergencyIssues: "None",
  requestedJobs: "Interior repaint",
  date: "2026-05-05",
  jobStatus: "Prospecting/Negotiating",
  declineReason: "",
  declineOtherReason: "",
  notes: "Netlify function smoke test record.",
  paymentCollected: false,
  paymentAmount: 0,
  assignedRep: "David Carter",
  aidSuggestions: [],
  consentEmailContact: true,
  consentSmsContact: true,
  consentMarketing: false,
  consultationRequested: true,
  consultationDate: "2026-05-08",
  consultationTime: "10:00",
  consultationNotes: "Netlify smoke consultation request.",
  consultationStatus: "Requested",
};

const publicSmokeRecord = {
  id: publicSmokeRecordId,
  source: "public-estimate",
  client: baseClient,
  quoteHistory: [],
  paymentDue: 3200,
  lastContactedAt: "2026-05-05",
  nextFollowUpAt: "2026-05-10",
  invoiceStatus: "Open",
  crewLead: "David Carter",
  documentation: [],
};

const staffSmokeRecord = {
  id: staffSmokeRecordId,
  source: "staff-estimate",
  client: {
    ...baseClient,
    lastName: "Staff",
    email: "smoke.staff@example.com",
    consultationRequested: false,
    consultationDate: "",
    consultationTime: "",
    consultationNotes: "",
    consultationStatus: "None",
  },
  quoteHistory: [],
  paymentDue: 3200,
  lastContactedAt: "2026-05-05",
  nextFollowUpAt: "2026-05-10",
  invoiceStatus: "Open",
  crewLead: "David Carter",
  documentation: [],
};

const smokeQuote = {
  id: smokeQuoteId,
  projectTitle: "Smoke Test Interior Repaint",
  projectSummary: "Minimal quote payload for Netlify integration testing.",
  categories: ["painting"],
  selections: [
    {
      taskId: "paint-interior-walls",
      quantity: 220,
      scopeNote: "Smoke test quantity",
      conditionMultiplier: 1,
      complexityMultiplier: 1,
    },
  ],
  breakdown: [
    {
      taskId: "paint-interior-walls",
      category: "painting",
      taskName: "Paint interior walls",
      quantity: 220,
      unitLabel: "sq ft",
      scopeNote: "Smoke test quantity",
      lowLabor: 480,
      highLabor: 620,
      lowMaterials: 190,
      highMaterials: 285,
      lowTotal: 670,
      highTotal: 905,
      laborHours: 9,
      customaryIncludes: [],
      customaryExcludes: [],
      materials: [],
    },
  ],
  categoryTotals: [
    {
      category: "painting",
      label: "Painting",
      lowTotal: 670,
      highTotal: 905,
      laborHours: 9,
    },
  ],
  materialRollup: [],
  assumptions: [],
  exclusions: [],
  paymentSchedule: [],
  budgetFit: {
    status: "near-budget",
    varianceLow: 2530,
    varianceHigh: 2295,
    note: "Smoke budget fit note.",
  },
  healthChecks: [],
  options: {
    discountPct: 0,
    contingencyPct: 0.05,
    rushJob: false,
    includePermitAllowance: false,
    permitAllowance: 0,
    includeHaulAway: false,
    haulAwayFee: 0,
    customerSuppliedMaterials: false,
    taxExempt: false,
    travelOverrideEnabled: false,
    travelOverrideFee: 95,
    crewSize: 1,
  },
  validityDays: 14,
  quoteExpiresAt: "2026-05-19T00:00:00.000Z",
  estimatedDays: 2,
  suggestedCrewSize: 1,
  scopeComplexityScore: 1.3,
  totals: {
    laborLow: 480,
    laborHigh: 620,
    materialsLow: 190,
    materialsHigh: 285,
    subtotalLow: 670,
    subtotalHigh: 905,
    markupLow: 94,
    markupHigh: 199,
    contingencyLow: 34,
    contingencyHigh: 45,
    taxLow: 61,
    taxHigh: 88,
    travelFee: 95,
    haulAwayFee: 0,
    permitAllowance: 0,
    discountLow: 0,
    discountHigh: 0,
    totalLow: 920,
    totalHigh: 1287,
    laborHours: 9,
  },
  generatedAt: new Date(timestamp).toISOString(),
};

const smokePdfDataUrl = "data:application/pdf;base64,JVBERi0xLjQKJUZha2UgUERG";

const run = async () => {
  process.env.DC_DEVELOPER_USERNAME = DEVELOPER_EMAIL;
  process.env.DC_DEVELOPER_PASSWORD = DEVELOPER_PASSWORD;
  await rm(localNetlifyStateFile, { force: true });

  const publicJar = createCookieJar();
  const staffJar = createCookieJar();
  const adminJar = createCookieJar();
  const developerJar = createCookieJar();

  const publicBootstrap = await requestJson("/api/bootstrap", {}, publicJar);
  assert(publicBootstrap.ok, "Public bootstrap request failed.");
  assert(publicBootstrap.payload.sessionRole === "public", "Expected public bootstrap session role.");
  assert(
    publicBootstrap.payload.appState.historicalJobs.every((job) => job.clientName === "Prior client"),
    "Public bootstrap should only expose redacted historical jobs.",
  );
  log("PASS netlify public bootstrap exposes only redacted history.");

  const publicAiAttempt = await requestJson("/api/ai/scope-plan", { method: "POST", body: {} }, publicJar);
  assert(publicAiAttempt.status === 401, "Public sessions must not invoke billable AI routes.");
  const publicEmailAttempt = await requestJson("/api/quotes/email", { method: "POST", body: {} }, publicJar);
  assert(publicEmailAttempt.status === 401, "Public sessions must not invoke quote email delivery.");
  log("PASS netlify public sessions cannot invoke protected AI or email routes.");

  const publicQuoteSave = await requestJson(
    "/api/quotes/save",
    {
      method: "POST",
      body: {
        ...(await securityCheck("estimate")),
        record: publicSmokeRecord,
        quote: smokeQuote,
      },
    },
    publicJar,
  );
  assert(publicQuoteSave.ok, "Public estimate request save should succeed.");
  assert(publicQuoteSave.payload.recordId && publicQuoteSave.payload.recordId !== publicSmokeRecordId, "Public estimate save must return a server-generated CRM ID.");
  const persistedPublicRecordId = publicQuoteSave.payload.recordId;
  log("PASS netlify public estimate request save succeeded.");

  const staffLogin = await requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        ...(await securityCheck("login")),
        role: "staff",
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
      },
    },
    staffJar,
  );
  assert(staffLogin.ok, "Netlify staff login failed.");
  log("PASS netlify staff login succeeds.");

  const adminLogin = await requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        ...(await securityCheck("login")),
        role: "admin",
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    },
    adminJar,
  );
  assert(adminLogin.ok, "Netlify admin login failed.");
  log("PASS netlify admin login succeeds.");

  const developerLogin = await requestJson(
    "/api/auth/login",
    { method: "POST", body: { ...(await securityCheck("login")), role: "developer", email: DEVELOPER_EMAIL, password: DEVELOPER_PASSWORD } },
    developerJar,
  );
  assert(developerLogin.ok && developerLogin.payload.sessionRole === "developer", "Netlify developer login failed.");
  const developerDashboard = await requestJson("/api/developer/dashboard", {}, developerJar);
  assert(developerDashboard.ok && developerDashboard.payload.appState.crmRecords.length === 0, "Developer dashboard must be isolated from Owner CRM data.");
  log("PASS netlify developer dashboard is authenticated and isolated from Owner records.");

  const unauthorizedOperationsUpdate = await requestJson(
    "/api/admin/operations",
    {
      method: "PUT",
      body: {
        patch: {
          applicants: [],
        },
      },
    },
    staffJar,
  );
  assert(
    unauthorizedOperationsUpdate.status === 401,
    "Netlify staff session should not update executive operations data.",
  );
  log("PASS netlify staff session cannot update executive operations data.");

  const operationsDashboard = await requestJson("/api/admin/dashboard", {}, adminJar);
  assert(operationsDashboard.ok, "Netlify admin dashboard read failed before operations round-trip.");
  const operationsPatch = Object.fromEntries(
    ["applicants", "jobOpenings", "projects", "employees", "materials", "aiReviews"].map((key) => [
      key,
      operationsDashboard.payload.appState[key] || [],
    ]),
  );
  const operationsUpdate = await requestJson(
    "/api/admin/operations",
    {
      method: "PUT",
      body: {
        patch: operationsPatch,
      },
    },
    adminJar,
  );
  assert(operationsUpdate.ok, "Netlify admin operations update failed.");
  const operationsRoundTrip = await requestJson("/api/admin/dashboard", {}, adminJar);
  assert(operationsRoundTrip.ok, "Netlify admin dashboard read failed after operations update.");
  for (const [key, expected] of Object.entries(operationsPatch)) {
    assert(
      JSON.stringify(operationsRoundTrip.payload.appState[key] || []) === JSON.stringify(expected),
      `Netlify executive operations round-trip did not preserve ${key}.`,
    );
  }
  log("PASS netlify executive operations collections persist through an authenticated round-trip.");

  const currentSettings = developerLogin.payload.appState.settings;
  const settingsUpdate = await requestJson(
    "/api/developer/settings",
    {
      method: "PUT",
      body: {
        settings: {
          ...currentSettings,
          adminPassword: "",
          staffPassword: "",
          openAiApiKey: "",
          aiProvider: "webhook",
          aiWebhookUrl: `${MOCK_BASE}/ai`,
          emailWebhookUrl: `${MOCK_BASE}/email`,
          googleAppsScriptUrl: `${MOCK_BASE}/sheets`,
        },
      },
    },
    developerJar,
  );
  assert(settingsUpdate.ok, "Netlify admin settings update failed.");
  log("PASS netlify developer settings update succeeds.");

  const quoteEmail = await requestJson(
    "/api/quotes/email",
    {
      method: "POST",
      body: {
        client: staffSmokeRecord.client,
        quote: smokeQuote,
        pdfDataUrl: smokePdfDataUrl,
        filename: "smoke-test-quote.pdf",
      },
    },
    staffJar,
  );
  assert(quoteEmail.ok, "Netlify quote email request failed.");
  assert(
    String(quoteEmail.payload.message || "").includes("Mock quote email accepted"),
    "Expected the mock quote email response.",
  );
  log("PASS netlify quote email webhook path succeeds.");

  const consultationConfirm = await requestJson(
    `/api/admin/records/${persistedPublicRecordId}`,
    {
      method: "PATCH",
      body: {
        patch: {
          client: {
            ...publicSmokeRecord.client,
            consultationStatus: "Confirmed",
          },
        },
      },
    },
    adminJar,
  );
  assert(consultationConfirm.ok, "Netlify consultation update failed.");
  assert(
    String(consultationConfirm.payload.message || "").includes("Mock consultation confirmation accepted"),
    "Expected the consultation confirmation webhook response.",
  );
  log("PASS netlify consultation confirmation webhook path succeeds.");
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
