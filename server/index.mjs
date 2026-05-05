import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
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
} from "./state.mjs";
import {
  pushRecordToGoogleSheets,
  sendConsultationConfirmation,
  sendQuoteEmail,
  testEmailWebhook,
  testGoogleSheetsConnection,
} from "./integrations.mjs";
import {
  resolveAidPrograms,
  resolveAudioTranscription,
  resolveMaterialPlan,
  resolveScopePlan,
  testAiProvider,
} from "./ai-proxy.mjs";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serverDir, "..");
const distDir = path.join(rootDir, "dist");
const isDev = process.argv.includes("--dev");
const port = Number(process.env.PORT || (isDev ? 4174 : 4173));
const sessionCookieName = "davids_contracting_session";
const sessions = new Map();
const failedLoginAttempts = new Map();
const sessionTtlMs = 1000 * 60 * 60 * 12;
const loginWindowMs = 1000 * 60 * 15;
const loginLockoutMs = 1000 * 60 * 15;
const maxFailedLogins = 5;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
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

const sendJson = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request) =>
  new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error("Request body exceeded the 20MB safety limit."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Request body was not valid JSON."));
      }
    });
    request.on("error", reject);
  });

const makeSessionCookie = (sessionId, clear = false) =>
  `${sessionCookieName}=${clear ? "" : encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 43200}`;

const getClientAddress = (request) => request.socket.remoteAddress || "unknown";

const clearExpiredSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastSeenAt > sessionTtlMs) {
      sessions.delete(sessionId);
    }
  }
};

const clearExpiredLoginAttempts = () => {
  const now = Date.now();
  for (const [clientAddress, attempt] of failedLoginAttempts.entries()) {
    if (attempt.lockedUntil <= now && now - attempt.firstFailedAt > loginWindowMs) {
      failedLoginAttempts.delete(clientAddress);
    }
  }
};

const isTrustedOrigin = (request) => {
  const originHeader = request.headers.origin;
  if (!originHeader) {
    return true;
  }

  try {
    return new URL(originHeader).host === request.headers.host;
  } catch {
    return false;
  }
};

const requireSameOrigin = (request, response) => {
  if (!isTrustedOrigin(request)) {
    sendJson(response, 403, {
      message: "Cross-origin requests are not allowed for this route.",
    });
    return false;
  }

  return true;
};

const getLoginAttemptState = (clientAddress) => {
  clearExpiredLoginAttempts();
  const attempt = failedLoginAttempts.get(clientAddress);
  if (!attempt) {
    return null;
  }

  if (attempt.lockedUntil > Date.now()) {
    return attempt;
  }

  if (Date.now() - attempt.firstFailedAt > loginWindowMs) {
    failedLoginAttempts.delete(clientAddress);
    return null;
  }

  return attempt;
};

const registerFailedLoginAttempt = (clientAddress) => {
  const now = Date.now();
  const currentAttempt = getLoginAttemptState(clientAddress);
  const nextAttempt = currentAttempt
    ? {
        ...currentAttempt,
        count: currentAttempt.count + 1,
        lockedUntil:
          currentAttempt.count + 1 >= maxFailedLogins ? now + loginLockoutMs : currentAttempt.lockedUntil,
      }
    : {
        count: 1,
        firstFailedAt: now,
        lockedUntil: 0,
      };

  failedLoginAttempts.set(clientAddress, nextAttempt);
  return nextAttempt;
};

const clearFailedLoginAttempts = (clientAddress) => {
  failedLoginAttempts.delete(clientAddress);
};

const getSessionId = (request) => {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[sessionCookieName] || null;
};

const getSession = (request) => {
  clearExpiredSessions();
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  session.lastSeenAt = Date.now();
  sessions.set(sessionId, session);
  return session;
};

const getSessionRole = (request) => getSession(request)?.role || "public";

const hasQuoteSession = (request) => {
  const role = getSessionRole(request);
  return role === "staff" || role === "admin";
};

const hasAdminSession = (request) => getSessionRole(request) === "admin";

const requireQuoteAuth = (request, response) => {
  if (!hasQuoteSession(request)) {
    sendJson(response, 401, {
      message: "Contractor or estimator login is required for this route.",
    });
    return false;
  }

  return true;
};

const requireAdminAuth = (request, response) => {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, {
      message: "Admin authentication is required for this route.",
    });
    return false;
  }

  return true;
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

const serveStaticAsset = async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url || "/", `http://${request.headers.host}`).pathname);
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.resolve(distDir, `.${normalizedPath}`);

  if (!resolvedPath.startsWith(distDir)) {
    sendJson(response, 400, { message: "Invalid asset path." });
    return;
  }

  const fallbackPath = path.join(distDir, "index.html");

  try {
    const fileStat = await stat(resolvedPath);
    if (fileStat.isFile()) {
      const file = await readFile(resolvedPath);
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(resolvedPath)] || "application/octet-stream",
      });
      response.end(file);
      return;
    }
  } catch {
    // Fall through to SPA index.
  }

  if (!existsSync(fallbackPath)) {
    sendJson(response, 503, {
      message: "Production bundle not found. Run `npm run build` first.",
    });
    return;
  }

  const html = await readFile(fallbackPath);
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html);
};

const handleBootstrap = async (request, response) => {
  const persistedState = await readPersistedState();
  const sessionRole = getSessionRole(request);

  sendJson(response, 200, {
    sessionRole,
    hasQuoteSession: sessionRole === "staff" || sessionRole === "admin",
    hasAdminSession: sessionRole === "admin",
    adminEmailHint: persistedState.appState.settings.adminEmail,
    staffEmailHint: persistedState.appState.settings.staffEmail,
    appState: buildStateForRole(persistedState, sessionRole),
  });
};

const handleLogin = async (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const role = body.role === "staff" || body.role === "admin" ? body.role : null;
  if (!role) {
    sendJson(response, 400, {
      message: "Login requests must specify either staff or admin access.",
    });
    return;
  }

  const persistedState = await readPersistedState();
  const clientAddress = getClientAddress(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const attemptState = getLoginAttemptState(clientAddress);

  if (attemptState?.lockedUntil > Date.now()) {
    sendJson(response, 429, {
      message: "Too many failed login attempts. Please wait a few minutes and try again.",
    });
    return;
  }

  const expectedEmail =
    role === "admin"
      ? persistedState.appState.settings.adminEmail.trim().toLowerCase()
      : persistedState.appState.settings.staffEmail.trim().toLowerCase();
  const passwordMatches =
    role === "admin"
      ? verifyAdminPassword(persistedState, password)
      : verifyStaffPassword(persistedState, password);

  if (email !== expectedEmail || !passwordMatches) {
    registerFailedLoginAttempt(clientAddress);
    sendJson(response, 401, {
      message:
        role === "admin"
          ? "Credentials did not match the admin profile saved on the server."
          : "Credentials did not match the contractor / estimator profile saved on the server.",
    });
    return;
  }

  clearFailedLoginAttempts(clientAddress);
  const sessionId = randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    email,
    role,
  });

  sendJson(
    response,
    200,
    {
      sessionRole: role,
      appState: buildStateForRole(persistedState, role),
      message: role === "admin" ? "Admin login successful." : "Contractor workspace unlocked.",
    },
    {
      "Set-Cookie": makeSessionCookie(sessionId),
    },
  );
};

const handleLogout = (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  const sessionId = getSessionId(request);
  if (sessionId) {
    sessions.delete(sessionId);
  }

  sendJson(
    response,
    200,
    {
      message: "Secure session closed.",
    },
    {
      "Set-Cookie": makeSessionCookie("", true),
    },
  );
};

const handleSaveQuote = async (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const record = body.record;
  const quote = body.quote;

  if (!record || !quote) {
    sendJson(response, 400, {
      message: "Quote save requests need both a record and a quote payload.",
    });
    return;
  }

  if (
    !Array.isArray(quote.selections) ||
    !quote.selections.length ||
    !Array.isArray(quote.breakdown) ||
    !quote.breakdown.length
  ) {
    sendJson(response, 400, {
      message: "Add at least one scoped task before saving a quote.",
    });
    return;
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

  sendJson(response, 200, {
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
    appState: buildStateForRole(nextState, getSessionRole(request)),
  });
};

const handleDashboard = async (request, response) => {
  if (!requireAdminAuth(request, response)) {
    return;
  }

  const persistedState = await readPersistedState();
  sendJson(response, 200, {
    appState: buildAdminState(persistedState),
  });
};

const handleSettingsUpdate = async (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  if (!requireAdminAuth(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const nextState = await updateAppSettings(body.settings || {});
  sendJson(response, 200, {
    appState: buildAdminState(nextState),
    message: "Admin settings updated on the secure server.",
  });
};

const handleRecordUpdate = async (request, response, recordId) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  if (!requireAdminAuth(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const nextState = await updateCrmRecord(recordId, body.patch || {});

  if (!nextState.updatedRecord) {
    sendJson(response, 404, {
      message: "CRM record not found.",
    });
    return;
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

  sendJson(response, 200, {
    appState: buildAdminState(nextState.persistedState),
    message:
      consultationStatus.status === "success"
        ? `CRM record updated. ${consultationStatus.message}`
        : consultationStatus.status === "failed"
          ? `CRM record updated. ${consultationStatus.message}`
          : "CRM record updated.",
  });
};

const handleIntegrationTest = async (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  if (!requireAdminAuth(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const persistedState = await readPersistedState();
  const kind = body.kind;

  if (kind === "ai") {
    const result = await testAiProvider(persistedState.appState.settings, persistedState.secrets);
    sendJson(response, 200, result);
    return;
  }

  if (kind === "email") {
    const result = await testEmailWebhook(persistedState.appState.settings);
    sendJson(response, 200, result);
    return;
  }

  if (kind === "google-sheets") {
    const result = await testGoogleSheetsConnection(persistedState.appState.settings);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 400, {
    message: "Integration tests support ai, email, and google-sheets only.",
  });
};

const handleQuoteEmail = async (request, response) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const persistedState = await readPersistedState();

  if (!body.client?.email) {
    sendJson(response, 400, {
      message: "A client email address is required to send the quote.",
    });
    return;
  }

  if (!body.quote?.projectTitle || !Array.isArray(body.quote?.breakdown) || !body.quote.breakdown.length) {
    sendJson(response, 400, {
      message: "Add at least one scoped task before emailing a quote.",
    });
    return;
  }

  if (typeof body.pdfDataUrl !== "string" || !body.pdfDataUrl.startsWith("data:application/pdf")) {
    sendJson(response, 400, {
      message: "A generated PDF payload is required before sending a quote email.",
    });
    return;
  }

  const result = await sendQuoteEmail(persistedState.appState.settings, body);
  sendJson(response, 200, result);
};

const handleAiRequest = async (request, response, resolver) => {
  if (!requireSameOrigin(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  const persistedState = await readPersistedState();
  const result = await resolver(persistedState.appState.settings, persistedState.secrets, body);
  sendJson(response, 200, result);
};

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { message: "Missing request URL." });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      await handleBootstrap(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/admin/dashboard") {
      await handleDashboard(request, response);
      return;
    }

    if (request.method === "PUT" && pathname === "/api/admin/settings") {
      await handleSettingsUpdate(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/admin/integrations/test") {
      await handleIntegrationTest(request, response);
      return;
    }

    if (request.method === "PATCH" && pathname.startsWith("/api/admin/records/")) {
      const recordId = pathname.slice("/api/admin/records/".length);
      await handleRecordUpdate(request, response, recordId);
      return;
    }

    if (request.method === "POST" && pathname === "/api/quotes/save") {
      await handleSaveQuote(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/quotes/email") {
      await handleQuoteEmail(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/scope-plan") {
      await handleAiRequest(request, response, resolveScopePlan);
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/aid-programs") {
      await handleAiRequest(request, response, resolveAidPrograms);
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/material-plan") {
      await handleAiRequest(request, response, resolveMaterialPlan);
      return;
    }

    if (request.method === "POST" && pathname === "/api/ai/transcribe-audio") {
      await handleAiRequest(request, response, resolveAudioTranscription);
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(response, 404, {
        message: `No API route matched ${pathname}.`,
      });
      return;
    }

    if (isDev) {
      sendJson(response, 404, {
        message: "Static assets are served by Vite in dev mode.",
      });
      return;
    }

    await serveStaticAsset(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendJson(response, 500, {
      message,
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(
    `[davids-contracting-api] listening on http://0.0.0.0:${port}${isDev ? " (dev api only)" : ""}`,
  );
});
