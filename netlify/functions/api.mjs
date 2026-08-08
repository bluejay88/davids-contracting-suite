import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  buildAdminState,
  buildPublicState,
  buildQuoteState,
  readPersistedState,
  saveQuoteRecord,
  savePublicIntake,
  storeApplicantResume,
  updateAppSettings,
  updateCrmRecord,
  updateOperationsState,
  appendProjectActivity,
  verifyAdminPassword,
  verifyStaffPassword,
} from "./_shared/state.mjs";
import {
  pushRecordToGoogleSheets,
  sendConsultationConfirmation,
  sendCandidateNotification,
  sendQuoteEmail,
  testEmailWebhook,
  testGoogleSheetsConnection,
} from "../../server/integrations.mjs";
import {
  resolveAidPrograms,
  resolveAudioTranscription,
  resolveMaterialPlan,
  resolveScopePlan,
  testAiProvider,
} from "../../server/ai-proxy.mjs";

const sessionCookieName = "__Host-davids_contracting_session";
const sessionTtlMs = 1000 * 60 * 60 * 12;
const maxJsonBodyBytes = 16 * 1024 * 1024;
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=()",
};

const parseCookies = (cookieHeader) =>
  (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = part.slice(0, separatorIndex);
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      return {
        ...accumulator,
        [key]: value,
      };
    }, {});

const jsonResponse = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders,
      ...headers,
    },
  });

const parseJsonBody = async (request) => {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxJsonBodyBytes) {
    const error = new Error("Request body exceeded the 16MB safety limit.");
    error.status = 413;
    throw error;
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxJsonBodyBytes) {
    const error = new Error("Request body exceeded the 16MB safety limit.");
    error.status = 413;
    throw error;
  }

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error("Request body was not valid JSON.");
    error.status = 400;
    throw error;
  }
};

const getRequestPath = (requestUrl) => {
  const pathname = new URL(requestUrl).pathname;
  const functionPrefix = "/.netlify/functions/api";
  if (pathname.startsWith(functionPrefix)) {
    const suffix = pathname.slice(functionPrefix.length);
    if (!suffix) {
      return "/";
    }

    return suffix.startsWith("/api/") || suffix === "/api" ? suffix : `/api${suffix}`;
  }

  return pathname;
};

const isTrustedOrigin = (request) => {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return true;
  }

  try {
    return new URL(originHeader).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

const requireSameOrigin = (request) => {
  if (!isTrustedOrigin(request)) {
    return jsonResponse(
      {
        message: "Cross-origin requests are not allowed for this route.",
      },
      403,
    );
  }

  return null;
};

const cleanText = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const publicId = (prefix) => `${prefix}-${randomBytes(12).toString("hex")}`;
const requireFields = (body, fields) => { const missing = fields.filter((field) => !cleanText(body[field])); if (missing.length) throw Object.assign(new Error(`Missing required field(s): ${missing.join(", ")}.`), { status: 400 }); };
const parseResume = (body) => {
  const mimeType = cleanText(body.resumeMimeType, 120); const allowed = new Map([["application/pdf", "pdf"], ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]]);
  if (!allowed.has(mimeType)) throw Object.assign(new Error("Resume must be a PDF or DOCX file."), { status: 400 });
  const prefix = `data:${mimeType};base64,`; if (typeof body.resumeDataUrl !== "string" || !body.resumeDataUrl.startsWith(prefix)) throw Object.assign(new Error("Resume upload payload is invalid."), { status: 400 });
  const data = Buffer.from(body.resumeDataUrl.slice(prefix.length), "base64"); if (!data.length || data.length > 6 * 1024 * 1024) throw Object.assign(new Error("Resume must be no larger than 6MB."), { status: 413 });
  const signatureOk = mimeType === "application/pdf" ? data.subarray(0, 5).toString() === "%PDF-" : data[0] === 0x50 && data[1] === 0x4b; if (!signatureOk) throw Object.assign(new Error("Resume file signature does not match its declared type."), { status: 400 });
  return { data, mimeType, extension: allowed.get(mimeType), fileName: cleanText(body.resumeFileName, 180) || `resume.${allowed.get(mimeType)}` };
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
};

const getSessionSecret = (persistedState) =>
  process.env.DC_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  `${persistedState.secrets.adminPasswordHash}:${persistedState.secrets.staffPasswordHash}`;

const signPayload = (secret, payload) => createHmac("sha256", secret).update(payload).digest("hex");

const makeSessionCookie = (cookieValue, clear = false) =>
  `${sessionCookieName}=${clear ? "" : encodeURIComponent(cookieValue)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : 43200}`;

const createSessionToken = (persistedState, role, email) => {
  const payload = {
    role,
    email,
    exp: Date.now() + sessionTtlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(getSessionSecret(persistedState), encodedPayload);
  return `${encodedPayload}.${signature}`;
};

const readSession = (request, persistedState) => {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[sessionCookieName];
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(getSessionSecret(persistedState), encodedPayload);
  const incoming = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload?.role || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

const getSessionRole = (request, persistedState) => readSession(request, persistedState)?.role || "public";

const requireAdminAuth = (request, persistedState) => {
  if (getSessionRole(request, persistedState) !== "admin") {
    return jsonResponse(
      {
        message: "Admin authentication is required for this route.",
      },
      401,
    );
  }

  return null;
};

const requireQuoteAuth = (request, persistedState) => {
  const role = getSessionRole(request, persistedState);
  if (role !== "staff" && role !== "admin") {
    return jsonResponse({ message: "Contractor or estimator login is required for this route." }, 401);
  }
  return null;
};

const buildStateForRole = (persistedState, role, email = "") => {
  if (role === "admin") {
    return buildAdminState(persistedState);
  }

  if (role === "staff") {
    return buildQuoteState(persistedState, email);
  }

  return buildPublicState(persistedState);
};

const handleBootstrap = async (request, persistedState) => {
  const session = readSession(request, persistedState);
  const sessionRole = session?.role || "public";

  return jsonResponse({
    sessionRole,
    hasQuoteSession: sessionRole === "staff" || sessionRole === "admin",
    hasAdminSession: sessionRole === "admin",
    adminEmailHint: "",
    staffEmailHint: "",
    sessionEmail: session?.email || "",
    appState: buildStateForRole(persistedState, sessionRole, session?.email || ""),
  });
};

const handleLogin = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const body = await parseJsonBody(request);
  validatePublicFormSecurity(body, request, "login");
  const role = body.role === "staff" || body.role === "admin" ? body.role : null;
  if (!role) {
    return jsonResponse(
      {
        message: "Login requests must specify either staff or admin access.",
      },
      400,
    );
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const configuredStaffAccounts = [
    { email: String(process.env.DC_CONTRACTOR_EMAIL || "").trim().toLowerCase(), password: process.env.DC_CONTRACTOR_PASSWORD || "", type: "Contractor" },
    { email: String(process.env.DC_ESTIMATOR_EMAIL || "").trim().toLowerCase(), password: process.env.DC_ESTIMATOR_PASSWORD || "", type: "Estimator" },
  ].filter((account) => account.email && account.password);
  const expectedEmail =
    role === "admin"
      ? String(process.env.DC_OWNER_USERNAME || persistedState.appState.settings.adminEmail).trim().toLowerCase()
      : persistedState.appState.settings.staffEmail.trim().toLowerCase();
  const configuredStaffAccount = role === "staff" ? configuredStaffAccounts.find((account) => account.email === email) : null;
  const passwordMatches =
    role === "admin"
      ? process.env.DC_OWNER_PASSWORD
        ? password === process.env.DC_OWNER_PASSWORD
        : verifyAdminPassword(persistedState, password)
      : configuredStaffAccount ? password === configuredStaffAccount.password : verifyStaffPassword(persistedState, password);

  if (role === "staff" && configuredStaffAccount) {
    const employee = persistedState.appState.employees.find((item) => cleanText(item.email, 254).toLowerCase() === email);
    if (!employee || employee.status !== "Active") {
      return jsonResponse({ message: "This workforce account is not active. Contact the Owner." }, 403);
    }
  }

  if (email !== expectedEmail || !passwordMatches) {
    return jsonResponse(
      {
        message:
          role === "admin"
            ? "Credentials did not match the admin profile saved on the server."
            : "Credentials did not match the contractor / estimator profile saved on the server.",
      },
      401,
    );
  }

  const sessionToken = createSessionToken(persistedState, role, email);
  return jsonResponse(
    {
      sessionRole: role,
      sessionEmail: email,
      appState: buildStateForRole(persistedState, role, email),
      message: role === "admin" ? "Admin login successful." : `${configuredStaffAccount?.type || "Contractor / Estimator"} workspace unlocked.`,
    },
    200,
    {
      "Set-Cookie": makeSessionCookie(sessionToken),
    },
  );
};

const handleLogout = async (request) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  return jsonResponse(
    {
      message: "Secure session closed.",
    },
    200,
    {
      "Set-Cookie": makeSessionCookie("", true),
    },
  );
};

const sanitizePublicEstimateRequest = (record, quote) => {
  const client = record?.client && typeof record.client === "object" ? record.client : {};
  requireFields(client, ["firstName", "lastName", "email", "phone", "requestedJobs"]);
  if (!validEmail(cleanText(client.email, 254))) throw Object.assign(new Error("A valid email is required."), { status: 400 });
  if (client.consentEmailContact !== true && client.consentSmsContact !== true) throw Object.assign(new Error("Consent to email or text contact is required."), { status: 400 });

  const selections = Array.isArray(quote?.selections) ? quote.selections.slice(0, 80).map((selection) => ({
    taskId: cleanText(selection?.taskId, 120),
    quantity: Math.min(100000, Math.max(0, Number(selection?.quantity) || 0)),
    scopeNote: cleanText(selection?.scopeNote, 1000),
    conditionMultiplier: Math.min(3, Math.max(.5, Number(selection?.conditionMultiplier) || 1)),
    complexityMultiplier: Math.min(3, Math.max(.5, Number(selection?.complexityMultiplier) || 1)),
  })).filter((selection) => selection.taskId && selection.quantity > 0) : [];
  if (!selections.length) throw Object.assign(new Error("Add at least one valid scoped task before sending an estimate request."), { status: 400 });

  const rawLow = Number(quote?.totals?.totalLow);
  const rawHigh = Number(quote?.totals?.totalHigh);
  if (!Number.isFinite(rawLow) || !Number.isFinite(rawHigh) || rawLow < 0 || rawHigh < rawLow || rawHigh > 10000000) throw Object.assign(new Error("Estimate totals were outside the accepted planning range."), { status: 400 });
  const allowedCategories = new Set(["painting", "flooring", "roofing", "electrical-hvac", "handyman"]);
  const categories = Array.isArray(quote?.categories) ? quote.categories.map((value) => cleanText(value, 40)).filter((value) => allowedCategories.has(value)).slice(0, 5) : [];
  const now = new Date().toISOString();
  const safeMoney = (value) => Math.min(10000000, Math.max(0, Number(value) || 0));
  const breakdown = Array.isArray(quote?.breakdown) ? quote.breakdown.slice(0, 80).map((line) => ({
    taskId: cleanText(line?.taskId, 120), category: allowedCategories.has(line?.category) ? line.category : "handyman", taskName: cleanText(line?.taskName, 180), quantity: Math.min(100000, Math.max(0, Number(line?.quantity) || 0)), unitLabel: cleanText(line?.unitLabel, 80), scopeNote: cleanText(line?.scopeNote, 1000), lowLabor: safeMoney(line?.lowLabor), highLabor: safeMoney(line?.highLabor), lowMaterials: safeMoney(line?.lowMaterials), highMaterials: safeMoney(line?.highMaterials), lowTotal: safeMoney(line?.lowTotal), highTotal: safeMoney(line?.highTotal), laborHours: Math.min(100000, Math.max(0, Number(line?.laborHours) || 0)), customaryIncludes: Array.isArray(line?.customaryIncludes) ? line.customaryIncludes.slice(0, 12).map((value) => cleanText(value, 300)) : [], customaryExcludes: Array.isArray(line?.customaryExcludes) ? line.customaryExcludes.slice(0, 12).map((value) => cleanText(value, 300)) : [], materials: [],
  })).filter((line) => line.taskId && line.quantity > 0) : [];
  const safeQuote = {
    id: publicId("quote"),
    projectTitle: cleanText(quote?.projectTitle, 160) || "Website Estimate Request",
    projectSummary: cleanText(quote?.projectSummary, 4000),
    categories,
    selections,
    breakdown,
    categoryTotals: [], materialRollup: [], assumptions: ["Website planning range requires Owner review and field verification."], exclusions: ["This online planning range is not a contract or final proposal."], paymentSchedule: [], budgetFit: { status: "unknown", varianceLow: 0, varianceHigh: 0, note: "Owner review required." }, healthChecks: [{ severity: "warning", message: "Public planning estimate requires field verification." }], options: {}, validityDays: 14, quoteExpiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), estimatedDays: Math.min(365, Math.max(1, Number(quote?.estimatedDays) || 1)), suggestedCrewSize: Math.min(20, Math.max(1, Number(quote?.suggestedCrewSize) || 1)),
    generatedAt: now,
    totals: { laborLow: 0, laborHigh: 0, materialsLow: 0, materialsHigh: 0, subtotalLow: 0, subtotalHigh: 0, markupLow: 0, markupHigh: 0, contingencyLow: 0, contingencyHigh: 0, taxLow: 0, taxHigh: 0, travelFee: 0, haulAwayFee: 0, permitAllowance: 0, discountLow: 0, discountHigh: 0, totalLow: Math.round(rawLow * 100) / 100, totalHigh: Math.round(rawHigh * 100) / 100, laborHours: breakdown.reduce((sum, line) => sum + line.laborHours, 0) },
    planningEstimate: true,
    priceVerificationStatus: "Owner review required",
  };
  const safeRecord = {
    id: publicId("crm"),
    source: "public-estimate",
    client: {
      firstName: cleanText(client.firstName, 80), lastName: cleanText(client.lastName, 80), address: cleanText(client.address, 180), city: cleanText(client.city, 100), state: cleanText(client.state, 40) || "IL", zip: cleanText(client.zip, 20), email: cleanText(client.email, 254).toLowerCase(), phone: cleanText(client.phone, 40), budget: Math.min(10000000, Math.max(0, Number(client.budget) || 0)), emergencyIssues: cleanText(client.emergencyIssues, 2000), requestedJobs: cleanText(client.requestedJobs, 4000), date: cleanText(client.date, 20), jobStatus: "Prospecting/Negotiating", declineReason: "", declineOtherReason: "", notes: cleanText(client.notes, 4000), paymentCollected: false, paymentAmount: 0, assignedRep: "", aidSuggestions: Array.isArray(client.aidSuggestions) ? client.aidSuggestions.slice(0, 10).map((value) => cleanText(value, 160)) : [], consentEmailContact: client.consentEmailContact === true, consentSmsContact: client.consentSmsContact === true, consentMarketing: client.consentMarketing === true, consultationRequested: client.consultationRequested === true, consultationDate: cleanText(client.consultationDate, 20), consultationTime: cleanText(client.consultationTime, 20), consultationNotes: cleanText(client.consultationNotes, 2000), consultationStatus: client.consultationRequested === true ? "Requested" : "None",
    },
    quoteHistory: [safeQuote], paymentDue: 0, lastContactedAt: "", nextFollowUpAt: now.slice(0, 10), invoiceStatus: "Open", crewLead: "", documentation: [],
  };
  return { record: safeRecord, quote: safeQuote };
};

const handleSaveQuote = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const body = await parseJsonBody(request);
  const sessionRole = getSessionRole(request, persistedState);
  let record = body.record;
  let quote = body.quote;
  if (sessionRole === "public") {
    validatePublicFormSecurity(body, request, "estimate");
    ({ record, quote } = sanitizePublicEstimateRequest(record, quote));
  } else {
    const authError = requireQuoteAuth(request, persistedState);
    if (authError) return authError;
  }

  if (!record || !quote) {
    return jsonResponse(
      {
        message: "Quote save requests need both a record and a quote payload.",
      },
      400,
    );
  }

  if (
    !Array.isArray(quote.selections) ||
    !quote.selections.length ||
    !Array.isArray(quote.breakdown) ||
    !quote.breakdown.length
  ) {
    return jsonResponse(
      {
        message: "Add at least one scoped task before saving a quote.",
      },
      400,
    );
  }

  const nextState = await saveQuoteRecord(record, quote);
  let syncStatus = {
    status: "skipped",
    message: "Quote saved to the secure CRM workspace.",
  };
  let consultationStatus = {
    status: "skipped",
    message: "No consultation confirmation was sent.",
  };

  try {
    syncStatus = await pushRecordToGoogleSheets(nextState.appState.settings, record, quote);
  } catch (error) {
    syncStatus = {
      status: "failed",
      message: error instanceof Error ? error.message : "Google Sheets sync failed.",
    };
  }

  try {
    consultationStatus = await sendConsultationConfirmation(nextState.appState.settings, record, quote);
  } catch (error) {
    consultationStatus = {
      status: "failed",
      message: error instanceof Error ? error.message : "Consultation confirmation failed.",
    };
  }

  return jsonResponse({
    recordId: record.id,
    message:
      syncStatus.status === "success"
        ? consultationStatus.status === "success"
          ? `${syncStatus.message} ${consultationStatus.message}`
          : syncStatus.message
        : syncStatus.status === "failed"
          ? `${record?.source === "public-estimate" ? "Estimate request captured in the CRM." : "Quote saved to the secure CRM workspace."} ${syncStatus.message}${consultationStatus.status === "failed" ? ` ${consultationStatus.message}` : ""}`
          : record?.source === "public-estimate"
            ? consultationStatus.status === "success"
              ? `Estimate request captured in the CRM. ${consultationStatus.message}`
              : "Estimate request captured in the CRM."
            : "Quote saved to the secure CRM workspace.",
    googleSyncStatus: syncStatus.status,
    googleSyncMessage: syncStatus.message,
    appState: buildStateForRole(nextState, getSessionRole(request, persistedState)),
  });
};

const handleDashboard = async (request, persistedState) => {
  const authError = requireAdminAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  return jsonResponse({
    appState: buildAdminState(persistedState),
  });
};

const handleSettingsUpdate = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireAdminAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);
  const nextState = await updateAppSettings(body.settings || {});
  return jsonResponse({
    appState: buildAdminState(nextState),
    message: "Admin settings updated on the secure server.",
  });
};

const handleOperationsUpdate = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireAdminAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);
  const nextState = await updateOperationsState(body.patch || {});
  return jsonResponse({
    appState: buildAdminState(nextState),
    message: "Operational workspace updated on the secure server.",
  });
};

const handleProjectActivity = async (request, persistedState, projectId) => {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const authError = requireAdminAuth(request, persistedState);
  if (authError) return authError;
  const body = await parseJsonBody(request);
  const text = cleanText(body.body, 4000);
  if (!text) return jsonResponse({ message: "A project note is required." }, 400);
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 20).map((item) => ({ id: publicId("attachment"), name: cleanText(item?.name, 180), mediaType: ["image", "video", "document"].includes(item?.mediaType) ? item.mediaType : "document", url: cleanText(item?.url, 2000), uploadedAt: new Date().toISOString() })).filter((item) => item.name && item.url) : [];
  const now = new Date().toISOString();
  const entry = { id: publicId("activity"), projectId, kind: body.kind === "Private Owner Note" ? "Private Owner Note" : "Owner Comment", authorName: persistedState.appState.settings.repProfile.repName, authorRole: "Owner", body: text, attachments, createdAt: now };
  const nextState = await appendProjectActivity(projectId, entry);
  return jsonResponse({ appState: buildAdminState(nextState), activity: entry, message: "Project documentation added." });
};

const handleFieldProjectActivity = async (request, persistedState, projectId) => {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const authError = requireQuoteAuth(request, persistedState);
  if (authError) return authError;
  const session = readSession(request, persistedState);
  const employee = persistedState.appState.employees.find((item) => cleanText(item.email, 254).toLowerCase() === cleanText(session?.email, 254).toLowerCase() && item.status === "Active");
  const project = persistedState.appState.projects.find((item) => item.id === projectId);
  if (!employee || !project || !(employee.assignedProjectIds || []).includes(projectId) && !(project.employeeIds || []).includes(employee.id)) return jsonResponse({ message: "You are not assigned to this project." }, 403);
  const body = await parseJsonBody(request);
  const text = cleanText(body.body, 4000);
  if (!text) return jsonResponse({ message: "A field note is required." }, 400);
  const now = new Date().toISOString();
  const entry = { id: publicId("activity"), projectId, kind: "Field Note", authorName: `${employee.firstName} ${employee.lastName}`.trim(), authorRole: "Contractor", body: text, attachments: [], createdAt: now };
  const nextState = await appendProjectActivity(projectId, entry);
  return jsonResponse({ appState: buildQuoteState(nextState, session.email), activity: entry, message: "Field documentation submitted to the Owner." });
};

const handleRecordUpdate = async (request, persistedState, recordId) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireAdminAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);
  const nextState = await updateCrmRecord(recordId, body.patch || {});

  if (!nextState.updatedRecord) {
    return jsonResponse(
      {
        message: "CRM record not found.",
      },
      404,
    );
  }

  const consultationFieldsChanged =
    nextState.previousRecord?.client?.consultationStatus !== nextState.updatedRecord.client.consultationStatus ||
    nextState.previousRecord?.client?.consultationDate !== nextState.updatedRecord.client.consultationDate ||
    nextState.previousRecord?.client?.consultationTime !== nextState.updatedRecord.client.consultationTime ||
    nextState.previousRecord?.client?.consultationNotes !== nextState.updatedRecord.client.consultationNotes;

  let consultationStatus = {
    status: "skipped",
    message: "Consultation confirmation was not triggered.",
  };

  if (consultationFieldsChanged) {
    try {
      consultationStatus = await sendConsultationConfirmation(
        nextState.persistedState.appState.settings,
        nextState.updatedRecord,
        nextState.updatedRecord.quoteHistory?.[0] || null,
      );
    } catch (error) {
      consultationStatus = {
        status: "failed",
        message: error instanceof Error ? error.message : "Consultation confirmation failed.",
      };
    }
  }

  return jsonResponse({
    appState: buildAdminState(nextState.persistedState),
    message:
      consultationStatus.status === "success"
        ? `CRM record updated. ${consultationStatus.message}`
        : consultationStatus.status === "failed"
          ? `CRM record updated. ${consultationStatus.message}`
          : "CRM record updated.",
  });
};

const handleIntegrationTest = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireAdminAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);
  const kind = body.kind;

  if (kind === "ai") {
    return jsonResponse(await testAiProvider(persistedState.appState.settings, persistedState.secrets));
  }

  if (kind === "email") {
    return jsonResponse(await testEmailWebhook(persistedState.appState.settings));
  }

  if (kind === "google-sheets") {
    return jsonResponse(await testGoogleSheetsConnection(persistedState.appState.settings));
  }

  return jsonResponse(
    {
      message: "Integration tests support ai, email, and google-sheets only.",
    },
    400,
  );
};

const handleQuoteEmail = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireQuoteAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);

  if (!body.client?.email) {
    return jsonResponse(
      {
        message: "A client email address is required to send the quote.",
      },
      400,
    );
  }

  if (!body.quote?.projectTitle || !Array.isArray(body.quote?.breakdown) || !body.quote.breakdown.length) {
    return jsonResponse(
      {
        message: "Add at least one scoped task before emailing a quote.",
      },
      400,
    );
  }

  if (typeof body.pdfDataUrl !== "string" || !body.pdfDataUrl.startsWith("data:application/pdf")) {
    return jsonResponse(
      {
        message: "A generated PDF payload is required before sending a quote email.",
      },
      400,
    );
  }

  return jsonResponse(await sendQuoteEmail(persistedState.appState.settings, body));
};

const handleAiRequest = async (request, persistedState, resolver) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const authError = requireQuoteAuth(request, persistedState);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody(request);
  return jsonResponse(await resolver(persistedState.appState.settings, persistedState.secrets, body));
};

const publicSubmissionWindows = new Map();
const validatePublicFormSecurity = (body, request, kind) => {
  if (cleanText(body.website, 200)) throw Object.assign(new Error("Submission could not be verified."), { status: 400 });
  const startedAt = Number(body.formStartedAt); const age = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || age < 1500 || age > 2 * 60 * 60 * 1000) throw Object.assign(new Error("Please refresh the form and complete the security check again."), { status: 400 });
  const a = Number(body.challengeA); const b = Number(body.challengeB); const answer = Number(body.challengeAnswer);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 2 || b < 2 || a > 8 || b > 8 || answer !== a + b) throw Object.assign(new Error("The security answer is incorrect."), { status: 400 });
  const client = cleanText(request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || "unknown", 100).split(",")[0];
  const key = `${kind}:${client}`; const now = Date.now(); const recent = (publicSubmissionWindows.get(key) || []).filter((stamp) => now - stamp < 15 * 60 * 1000);
  if (recent.length >= 6) throw Object.assign(new Error("Too many submissions. Please wait and try again."), { status: 429 });
  publicSubmissionWindows.set(key, [...recent, now]);
};

const handlePublicIntake = async (request, kind) => {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const body = await parseJsonBody(request); if (kind !== "analytics") validatePublicFormSecurity(body, request, kind); const now = new Date().toISOString();
  if (kind === "contact") {
    requireFields(body, ["firstName", "lastName", "email", "phone", "message"]); if (!validEmail(cleanText(body.email, 254)) || body.consentToContact !== true) throw Object.assign(new Error("A valid email and consent to contact are required."), { status: 400 });
    const record = { id: publicId("lead"), firstName: cleanText(body.firstName, 80), lastName: cleanText(body.lastName, 80), email: cleanText(body.email, 254).toLowerCase(), phone: cleanText(body.phone, 40), preferredContact: ["Email", "Phone", "Text"].includes(body.preferredContact) ? body.preferredContact : "Phone", serviceInterest: Array.isArray(body.serviceInterest) ? body.serviceInterest.slice(0, 10).map((v) => cleanText(v, 80)).filter(Boolean) : [], message: cleanText(body.message, 4000), financingInterest: body.financingInterest === true, consentToContact: true, status: "New", createdAt: now };
    await savePublicIntake("contactLeads", record); return jsonResponse({ message: "Thank you. Your request has been received.", id: record.id }, 201);
  }
  if (kind === "financing") {
    requireFields(body, ["firstName", "lastName", "email", "phone", "projectType", "financingGoals"]); if (!validEmail(cleanText(body.email, 254)) || body.consentToContact !== true) throw Object.assign(new Error("A valid email and consent to contact are required."), { status: 400 }); const amount = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(Number(value), 10000000) : null;
    const record = { id: publicId("finance"), firstName: cleanText(body.firstName, 80), lastName: cleanText(body.lastName, 80), email: cleanText(body.email, 254).toLowerCase(), phone: cleanText(body.phone, 40), projectType: cleanText(body.projectType, 160), estimatedProjectCost: amount(body.estimatedProjectCost), requestedAmount: amount(body.requestedAmount), timeline: cleanText(body.timeline, 160), financingGoals: cleanText(body.financingGoals, 4000), estimateRecordId: cleanText(body.estimateRecordId, 128), consentToContact: true, status: "New", createdAt: now };
    await savePublicIntake("financingInquiries", record); return jsonResponse({ message: "Your financing inquiry has been received for owner review.", id: record.id }, 201);
  }
  const allowedEvents = ["page_view", "page_leave", "cta_click", "service_interest", "financing_resource_click"]; if (!allowedEvents.includes(body.eventType)) throw Object.assign(new Error("Unsupported analytics event."), { status: 400 });
  const record = { id: publicId("event"), anonymousSessionId: cleanText(body.anonymousSessionId, 80), eventType: body.eventType, page: cleanText(body.page, 120), target: cleanText(body.target, 200), durationSeconds: Number.isFinite(Number(body.durationSeconds)) ? Math.max(0, Math.min(86400, Number(body.durationSeconds))) : null, occurredAt: now };
  await savePublicIntake("analyticsEvents", record); return jsonResponse({ message: "Event accepted." }, 202);
};

const handleCareersApply = async (request) => {
  const originError = requireSameOrigin(request); if (originError) return originError; const body = await parseJsonBody(request); validatePublicFormSecurity(body, request, "careers"); requireFields(body, ["firstName", "lastName", "email", "phone"]);
  if (!validEmail(cleanText(body.email, 254)) || body.consentToAiReview !== true) throw Object.assign(new Error("A valid email and consent to application review are required."), { status: 400 }); const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {}; const answers = Object.fromEntries(Object.entries(rawAnswers).slice(0, 30).map(([key, value]) => [cleanText(key, 100), typeof value === "boolean" || typeof value === "number" ? value : cleanText(value, 2000)]).filter(([key]) => key));
  if (Object.keys(answers).filter((key) => cleanText(answers[key], 2000)).length < 10) throw Object.assign(new Error("Please answer at least 10 application questions."), { status: 400 });
  const resume = parseResume(body); const storageKey = await storeApplicantResume(resume); const now = new Date().toISOString(); const skills = Array.isArray(body.skills) ? body.skills.slice(0, 30).map((v) => cleanText(v, 80)).filter(Boolean) : cleanText(body.skills, 1000).split(",").map((v) => v.trim()).filter(Boolean).slice(0, 30); const years = Math.max(0, Math.min(60, Number(body.yearsExperience) || 0)); const answerScore = Math.min(35, Object.keys(answers).filter((key) => cleanText(answers[key], 2000)).length * 2); const skillsScore = Math.min(100, 20 + skills.length * 8 + years * 3); const score = Math.round(Math.min(100, answerScore + skillsScore * .55 + 10));
  const applicant = { id: publicId("applicant"), firstName: cleanText(body.firstName, 80), lastName: cleanText(body.lastName, 80), email: cleanText(body.email, 254).toLowerCase(), phone: cleanText(body.phone, 40), city: cleanText(body.city, 100), state: cleanText(body.state, 40) || "IL", source: "Website", desiredRoles: Array.isArray(body.desiredRoles) ? body.desiredRoles.slice(0, 5).map((v) => cleanText(v, 100)) : [cleanText(body.desiredRole, 100)].filter(Boolean), skills, yearsExperience: years, certifications: Array.isArray(body.certifications) ? body.certifications.slice(0, 20).map((v) => cleanText(v, 120)) : [], availabilityDate: cleanText(body.availabilityDate, 20), employmentPreference: ["Full-time"], stage: "New", assignedTo: "", resumeFileName: resume.fileName, resumeText: cleanText(body.resumeText, 50000), resume: { fileName: resume.fileName, mimeType: resume.mimeType, size: resume.data.length, storageKey }, notes: "", consentToAiReview: true, applicationAnswers: answers, createdAt: now, updatedAt: now };
  const review = { id: publicId("review"), subjectType: "Applicant", subjectId: applicant.id, reviewType: "Job Readiness", status: "Needs Human Review", provider: "explainable-rules", model: "public-application-v1", score, summary: `Preliminary readiness score based on ${skills.length} reported skills, ${years} years of experience, and ${Object.keys(answers).length} questionnaire responses.`, strengths: skills.slice(0, 5), gaps: skills.length ? [] : ["Skills require recruiter validation"], recommendations: ["Complete a structured human interview", "Verify experience, training, certifications, and work eligibility"], evidence: ["Applicant questionnaire", "Applicant-provided resume metadata", "Self-reported skills and experience"], confidence: .62, humanDecision: "Pending", reviewedBy: "", createdAt: now, completedAt: now };
  const savedState = await savePublicIntake("applicants", applicant, review); let notificationStatus = "skipped";
  try { notificationStatus = (await sendCandidateNotification(savedState.appState.settings, applicant, review)).status; } catch { notificationStatus = "failed"; }
  return jsonResponse({ message: "Thank you for submitting your information for consideration. If work becomes available, someone from our office will reach out to you.", applicationId: applicant.id, notificationStatus }, 201);
};

export default async (request) => {
  try {
    const persistedState = await readPersistedState();
    const pathname = getRequestPath(request.url);

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      return handleBootstrap(request, persistedState);
    }
    if (request.method === "GET" && pathname === "/api/gallery") return jsonResponse({ projects: buildPublicState(persistedState).galleryProjects });
    if (request.method === "POST" && pathname === "/api/contact") return await handlePublicIntake(request, "contact");
    if (request.method === "POST" && pathname === "/api/financing") return await handlePublicIntake(request, "financing");
    if (request.method === "POST" && pathname === "/api/analytics") return await handlePublicIntake(request, "analytics");
    if (request.method === "POST" && pathname === "/api/careers/apply") return await handleCareersApply(request);

    if (request.method === "POST" && pathname === "/api/auth/login") {
      return await handleLogin(request, persistedState);
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      return handleLogout(request);
    }

    if (request.method === "GET" && pathname === "/api/admin/dashboard") {
      return handleDashboard(request, persistedState);
    }

    if (request.method === "PUT" && pathname === "/api/admin/settings") {
      return handleSettingsUpdate(request, persistedState);
    }

    if (request.method === "PUT" && pathname === "/api/admin/operations") {
      return handleOperationsUpdate(request, persistedState);
    }
    if (request.method === "POST" && pathname.startsWith("/api/admin/projects/") && pathname.endsWith("/activity")) {
      const projectId = pathname.slice("/api/admin/projects/".length, -"/activity".length);
      return handleProjectActivity(request, persistedState, projectId);
    }
    if (request.method === "POST" && pathname.startsWith("/api/field/projects/") && pathname.endsWith("/activity")) {
      const projectId = pathname.slice("/api/field/projects/".length, -"/activity".length);
      return handleFieldProjectActivity(request, persistedState, projectId);
    }

    if (request.method === "POST" && pathname === "/api/admin/integrations/test") {
      return handleIntegrationTest(request, persistedState);
    }

    if (request.method === "PATCH" && pathname.startsWith("/api/admin/records/")) {
      const recordId = pathname.slice("/api/admin/records/".length);
      return handleRecordUpdate(request, persistedState, recordId);
    }

    if (request.method === "POST" && pathname === "/api/quotes/save") {
      return handleSaveQuote(request, persistedState);
    }

    if (request.method === "POST" && pathname === "/api/quotes/email") {
      return handleQuoteEmail(request, persistedState);
    }

    if (request.method === "POST" && pathname === "/api/ai/scope-plan") {
      return handleAiRequest(request, persistedState, resolveScopePlan);
    }

    if (request.method === "POST" && pathname === "/api/ai/aid-programs") {
      return handleAiRequest(request, persistedState, resolveAidPrograms);
    }

    if (request.method === "POST" && pathname === "/api/ai/material-plan") {
      return handleAiRequest(request, persistedState, resolveMaterialPlan);
    }

    if (request.method === "POST" && pathname === "/api/ai/transcribe-audio") {
      return handleAiRequest(request, persistedState, resolveAudioTranscription);
    }

    return jsonResponse(
      {
        message: `No API route matched ${pathname}.`,
      },
      404,
    );
  } catch (error) {
    return jsonResponse(
      {
        message: error instanceof Error ? error.message : "Netlify API request failed.",
      },
      Number(error?.status) || 500,
    );
  }
};
