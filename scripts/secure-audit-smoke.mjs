const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:4173";

const STAFF_EMAIL = process.env.STAFF_EMAIL || "estimator@davidscontracting.local";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || "FieldReady30!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "owner@davidscontracting.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "BuiltOnPurpose30!";
const MOCK_BASE = process.env.MOCK_BASE_URL || "http://127.0.0.1:4310";

const log = (message) => {
  // eslint-disable-next-line no-console
  console.log(message);
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

const requestJson = async (path, options = {}, cookieJar) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar?.cookie ? { Cookie: cookieJar.cookie } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  cookieJar?.update(response);

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const timestamp = Date.now();
const publicSmokeRecordId = `crm-public-smoke-${timestamp}`;
const staffSmokeRecordId = `crm-staff-smoke-${timestamp}`;
const smokeQuoteId = `quote-smoke-${timestamp}`;

const baseClient = {
  firstName: "Smoke",
  lastName: "Test",
  address: "123 Audit Lane",
  city: "Decatur",
  state: "IL",
  zip: "62526",
  email: "smoke.test@example.com",
  phone: "217-555-0199",
  budget: 3200,
  emergencyIssues: "None",
  requestedJobs: "Interior repaint",
  date: "2026-05-05",
  jobStatus: "Prospecting/Negotiating",
  declineReason: "",
  declineOtherReason: "",
  notes: "Secure audit smoke test record.",
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
  consultationNotes: "Smoke consultation request.",
  consultationStatus: "Requested",
};

const publicSmokeRecord = {
  id: publicSmokeRecordId,
  source: "public-estimate",
  client: {
    ...baseClient,
  },
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
    firstName: "Smoke",
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
  projectSummary: "Minimal quote payload for secure integration testing.",
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
      taskName: "Paint interior walls",
      quantity: 220,
      unitLabel: "sq ft",
      lowLabor: 480,
      highLabor: 620,
      lowMaterials: 190,
      highMaterials: 285,
      lowTotal: 670,
      highTotal: 905,
      laborHours: 9,
      materials: [],
    },
  ],
  totals: {
    subtotalLow: 670,
    subtotalHigh: 905,
    markupLow: 94,
    markupHigh: 199,
    taxLow: 61,
    taxHigh: 88,
    travelFee: 95,
    totalLow: 920,
    totalHigh: 1287,
    laborHours: 9,
  },
  generatedAt: new Date(timestamp).toISOString(),
};

const smokePdfDataUrl = "data:application/pdf;base64,JVBERi0xLjQKJUZha2UgUERG";

const run = async () => {
  const publicJar = createCookieJar();
  const staffJar = createCookieJar();
  const adminJar = createCookieJar();

  const publicBootstrap = await requestJson("/api/bootstrap", {}, publicJar);
  assert(publicBootstrap.ok, "Public bootstrap request failed.");
  assert(publicBootstrap.payload.sessionRole === "public", "Expected public bootstrap session role.");
  assert(publicBootstrap.payload.hasQuoteSession === false, "Public bootstrap should not unlock quote access.");
  assert(
    Array.isArray(publicBootstrap.payload.appState.historicalJobs) &&
      publicBootstrap.payload.appState.historicalJobs.length > 0 &&
      publicBootstrap.payload.appState.historicalJobs.every((job) => job.clientName === "Prior client"),
    "Public bootstrap should only expose redacted historical jobs.",
  );
  log("PASS public bootstrap is locked down and exposes only redacted history.");

  const publicQuoteSave = await requestJson(
    "/api/quotes/save",
    {
      method: "POST",
      body: {
        record: publicSmokeRecord,
        quote: smokeQuote,
      },
    },
    publicJar,
  );
  assert(publicQuoteSave.ok, "Public estimate request save should succeed.");
  assert(
    /Estimate request captured|Quote saved and synced/i.test(String(publicQuoteSave.payload.message || "")),
    "Expected the public estimate request save success message.",
  );
  log("PASS public estimate requests save into the CRM.");

  const staffLogin = await requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        role: "staff",
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
      },
    },
    staffJar,
  );
  assert(staffLogin.ok, "Staff login failed.");
  assert(staffLogin.payload.sessionRole === "staff", "Expected staff session after login.");
  log("PASS staff login succeeds.");

  const staffBootstrap = await requestJson("/api/bootstrap", {}, staffJar);
  assert(staffBootstrap.ok, "Staff bootstrap request failed.");
  assert(staffBootstrap.payload.hasQuoteSession === true, "Staff bootstrap should unlock quote access.");
  assert(staffBootstrap.payload.hasAdminSession === false, "Staff bootstrap should not unlock admin access.");
  assert(
    staffBootstrap.payload.appState.historicalJobs.every((job) => job.clientName === "Prior client"),
    "Staff bootstrap should redact historical client names.",
  );
  log("PASS staff bootstrap unlocks quote access with redacted history.");

  const staffAdminDashboard = await requestJson("/api/admin/dashboard", {}, staffJar);
  assert(staffAdminDashboard.status === 401, "Staff session should not access the admin dashboard.");
  log("PASS staff session cannot access the admin dashboard.");

  const adminLogin = await requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        role: "admin",
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    },
    adminJar,
  );
  assert(adminLogin.ok, "Admin login failed.");
  log("PASS admin login succeeds.");

  const currentSettings = adminLogin.payload.appState.settings;
  const settingsUpdate = await requestJson(
    "/api/admin/settings",
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
    adminJar,
  );
  assert(settingsUpdate.ok, "Admin settings update for mock integrations failed.");
  log("PASS admin settings updated with mock integration endpoints.");

  for (const kind of ["ai", "email", "google-sheets"]) {
    const result = await requestJson(
      "/api/admin/integrations/test",
      {
        method: "POST",
        body: { kind },
      },
      adminJar,
    );
    assert(result.ok, `Integration test request failed for ${kind}.`);
    assert(result.payload.status === "success", `Expected success for ${kind} integration test.`);
    log(`PASS ${kind} integration health check succeeded.`);
  }

  const aiScope = await requestJson(
    "/api/ai/scope-plan",
    {
      method: "POST",
      body: {
        prompt: "Mock scope request",
        imageDataUrls: [],
        schemaName: "mock_scope_plan",
        schema: {},
        webhookPayload: {
          clientIntake: staffSmokeRecord.client,
          currentSelections: smokeQuote.selections,
        },
      },
    },
    staffJar,
  );
  assert(aiScope.ok, "Staff AI scope request failed.");
  assert(aiScope.payload.projectTitle === "Mock AI Scope Plan", "AI webhook did not return the mock scope plan.");
  log("PASS staff AI scope request succeeded through the webhook.");

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
  assert(quoteEmail.ok, "Staff quote email request failed.");
  assert(
    String(quoteEmail.payload.message || "").includes("Mock quote email accepted"),
    "Mock email webhook response was not returned.",
  );
  log("PASS staff quote email request succeeded through the webhook.");

  const quoteSave = await requestJson(
    "/api/quotes/save",
    {
      method: "POST",
      body: {
        record: staffSmokeRecord,
        quote: smokeQuote,
      },
    },
    staffJar,
  );
  assert(quoteSave.ok, "Staff quote save request failed.");
  assert(quoteSave.payload.googleSyncStatus === "success", "Expected Google sync success from the mock webhook.");
  log("PASS staff quote save succeeded and hit the Google sync webhook.");

  const consultationConfirm = await requestJson(
    `/api/admin/records/${publicSmokeRecordId}`,
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
  assert(consultationConfirm.ok, "Admin consultation update failed.");
  assert(
    String(consultationConfirm.payload.message || "").includes("Mock consultation confirmation accepted"),
    "Expected the consultation confirmation webhook response.",
  );
  log("PASS admin consultation confirmation triggered the email webhook.");

  log(`PUBLIC_SMOKE_RECORD_ID ${publicSmokeRecordId}`);
  log(`STAFF_SMOKE_RECORD_ID ${staffSmokeRecordId}`);
  log("All secure audit smoke checks passed.");
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
