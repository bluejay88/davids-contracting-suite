import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildAdminState,
  buildPublicState,
  buildQuoteState,
  readPersistedState,
  saveQuoteRecord,
  updateAppSettings,
  updateCrmRecord,
  verifyAdminPassword,
  verifyStaffPassword,
} from "./_shared/state.mjs";
import {
  pushRecordToGoogleSheets,
  sendConsultationConfirmation,
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

const sessionCookieName = "davids_contracting_session";
const sessionTtlMs = 1000 * 60 * 60 * 12;

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
      ...headers,
    },
  });

const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
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
  `${sessionCookieName}=${clear ? "" : encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 43200}`;

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

const buildStateForRole = (persistedState, role) => {
  if (role === "admin") {
    return buildAdminState(persistedState);
  }

  if (role === "staff") {
    return buildQuoteState(persistedState);
  }

  return buildPublicState(persistedState);
};

const handleBootstrap = async (request, persistedState) => {
  const sessionRole = getSessionRole(request, persistedState);

  return jsonResponse({
    sessionRole,
    hasQuoteSession: sessionRole === "staff" || sessionRole === "admin",
    hasAdminSession: sessionRole === "admin",
    adminEmailHint: persistedState.appState.settings.adminEmail,
    staffEmailHint: persistedState.appState.settings.staffEmail,
    appState: buildStateForRole(persistedState, sessionRole),
  });
};

const handleLogin = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const body = await parseJsonBody(request);
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
  const expectedEmail =
    role === "admin"
      ? persistedState.appState.settings.adminEmail.trim().toLowerCase()
      : persistedState.appState.settings.staffEmail.trim().toLowerCase();
  const passwordMatches =
    role === "admin"
      ? verifyAdminPassword(persistedState, password)
      : verifyStaffPassword(persistedState, password);

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
      appState: buildStateForRole(persistedState, role),
      message: role === "admin" ? "Admin login successful." : "Contractor workspace unlocked.",
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

const handleSaveQuote = async (request, persistedState) => {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const body = await parseJsonBody(request);
  const record = body.record;
  const quote = body.quote;

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

  const body = await parseJsonBody(request);
  return jsonResponse(await resolver(persistedState.appState.settings, persistedState.secrets, body));
};

export default async (request) => {
  try {
    const persistedState = await readPersistedState();
    const pathname = getRequestPath(request.url);

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      return handleBootstrap(request, persistedState);
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      return handleLogin(request, persistedState);
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
      500,
    );
  }
};
