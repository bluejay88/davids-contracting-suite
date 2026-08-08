import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import {
  createSeedAppState,
  starterAdminPassword,
  starterStaffPassword,
} from "../../../server/default-state.mjs";

const functionDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(functionDir, "../../..");
const localDataDir = path.join(rootDir, "server-data");
const localStateFile = path.join(localDataDir, "netlify-app-state.json");
const storeName = "davids-contracting-runtime";
const stateKey = "app-state.json";
const seedAppState = createSeedAppState();
const CURRENT_STATE_SCHEMA_VERSION = 8;
const resumeStoreName = "davids-contracting-private-resumes";

const clone = (value) => JSON.parse(JSON.stringify(value));

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const normalizeString = (value, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const normalizeRequiredString = (value, fallback = "") => {
  const normalized = normalizeString(value, fallback);
  return normalized.length > 0 ? normalized : fallback;
};

const defaultAvailabilitySchedule = clone(seedAppState.settings.availabilitySchedule);
const defaultClientShape = clone(seedAppState.crmRecords[0].client);

const derivePasswordHash = (password, salt) =>
  pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");

const verifyPasswordHash = (password, passwordSalt, passwordHash) => {
  if (!passwordSalt || !passwordHash) {
    return false;
  }

  const candidateHash = Buffer.from(derivePasswordHash(password, passwordSalt), "hex");
  const storedHash = Buffer.from(passwordHash, "hex");

  if (candidateHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, storedHash);
};

const createPasswordSecret = (password) => {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = derivePasswordHash(password, passwordSalt);
  return { passwordSalt, passwordHash };
};

const normalizeAvailabilitySchedule = (candidate, fallback) => {
  const nextSchedule = Array.isArray(candidate) ? candidate : fallback;
  return nextSchedule.map((slot, index) => {
    const defaultSlot = fallback[index] || fallback[0];
    return {
      day: defaultSlot.day,
      enabled: typeof slot?.enabled === "boolean" ? slot.enabled : defaultSlot.enabled,
      start: normalizeRequiredString(slot?.start, defaultSlot.start),
      end: normalizeRequiredString(slot?.end, defaultSlot.end),
    };
  });
};

const normalizeSettingsInput = (currentSettings, nextSettings) => {
  const candidate = nextSettings && typeof nextSettings === "object" ? nextSettings : {};
  const repProfile =
    candidate.repProfile && typeof candidate.repProfile === "object" ? candidate.repProfile : {};
  const aiProvider =
    candidate.aiProvider === "heuristic" ||
    candidate.aiProvider === "openai-direct" ||
    candidate.aiProvider === "anthropic-direct" ||
    candidate.aiProvider === "webhook"
      ? candidate.aiProvider
      : currentSettings.aiProvider;

  return {
    ...currentSettings,
    repProfile: {
      ...currentSettings.repProfile,
      repName: normalizeRequiredString(repProfile.repName, currentSettings.repProfile.repName),
      companyName: normalizeRequiredString(repProfile.companyName, currentSettings.repProfile.companyName),
      phone: normalizeString(repProfile.phone, currentSettings.repProfile.phone),
      email: normalizeString(repProfile.email, currentSettings.repProfile.email),
      title: normalizeRequiredString(repProfile.title, currentSettings.repProfile.title),
    },
    adminEmail: normalizeRequiredString(candidate.adminEmail, currentSettings.adminEmail).toLowerCase(),
    adminPassword: "",
    staffEmail: normalizeRequiredString(candidate.staffEmail, currentSettings.staffEmail).toLowerCase(),
    staffPassword: "",
    serviceAreaZip: normalizeRequiredString(candidate.serviceAreaZip, currentSettings.serviceAreaZip),
    aiProvider,
    automationEnabled: candidate.automationEnabled === true,
    googleAppsScriptUrl: normalizeString(candidate.googleAppsScriptUrl, currentSettings.googleAppsScriptUrl),
    aiWebhookUrl: normalizeString(candidate.aiWebhookUrl, currentSettings.aiWebhookUrl),
    emailWebhookUrl: normalizeString(candidate.emailWebhookUrl, currentSettings.emailWebhookUrl),
    openAiApiKey: "",
    anthropicApiKey: "",
    openAiModel: normalizeRequiredString(candidate.openAiModel, currentSettings.openAiModel),
    anthropicModel: normalizeRequiredString(candidate.anthropicModel, currentSettings.anthropicModel),
    openAiSearchModel: normalizeRequiredString(candidate.openAiSearchModel, currentSettings.openAiSearchModel),
    openAiTranscriptionModel: normalizeRequiredString(
      candidate.openAiTranscriptionModel,
      currentSettings.openAiTranscriptionModel,
    ),
    lowMarkupPct: isFiniteNumber(candidate.lowMarkupPct) ? candidate.lowMarkupPct : currentSettings.lowMarkupPct,
    highMarkupPct: isFiniteNumber(candidate.highMarkupPct) ? candidate.highMarkupPct : currentSettings.highMarkupPct,
    taxPct: isFiniteNumber(candidate.taxPct) ? candidate.taxPct : currentSettings.taxPct,
    travelFee: isFiniteNumber(candidate.travelFee) ? candidate.travelFee : currentSettings.travelFee,
    defaultQuoteValidityDays: isFiniteNumber(candidate.defaultQuoteValidityDays)
      ? candidate.defaultQuoteValidityDays
      : currentSettings.defaultQuoteValidityDays,
    standardDepositPct: isFiniteNumber(candidate.standardDepositPct)
      ? candidate.standardDepositPct
      : currentSettings.standardDepositPct,
    largeJobDepositPct: isFiniteNumber(candidate.largeJobDepositPct)
      ? candidate.largeJobDepositPct
      : currentSettings.largeJobDepositPct,
    largeJobThreshold: isFiniteNumber(candidate.largeJobThreshold)
      ? candidate.largeJobThreshold
      : currentSettings.largeJobThreshold,
    defaultContingencyPct: isFiniteNumber(candidate.defaultContingencyPct)
      ? candidate.defaultContingencyPct
      : currentSettings.defaultContingencyPct,
    availabilitySchedule: normalizeAvailabilitySchedule(
      candidate.availabilitySchedule,
      currentSettings.availabilitySchedule || defaultAvailabilitySchedule,
    ),
    consultationBlackoutDates: Array.isArray(candidate.consultationBlackoutDates)
      ? candidate.consultationBlackoutDates.map((value) => normalizeString(value)).filter(Boolean)
      : currentSettings.consultationBlackoutDates,
  };
};

const sanitizeSettings = (settings, secrets, includeIntegrationUrls) => ({
  ...settings,
  adminPassword: "",
  staffPassword: "",
  openAiApiKey: "",
  anthropicApiKey: "",
  aiWebhookUrl: includeIntegrationUrls ? settings.aiWebhookUrl : "",
  emailWebhookUrl: includeIntegrationUrls ? settings.emailWebhookUrl : "",
  googleAppsScriptUrl: includeIntegrationUrls ? settings.googleAppsScriptUrl : "",
  hasAdminPassword: Boolean(secrets.adminPasswordHash),
  hasStaffPassword: Boolean(secrets.staffPasswordHash),
  hasOpenAiApiKey: Boolean(secrets.openAiApiKey?.trim()),
  hasAiGateway: Boolean(process.env.OPENAI_BASE_URL?.trim()),
  hasAnthropicApiKey: Boolean(secrets.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
  hasAiWebhook: Boolean(settings.aiWebhookUrl?.trim()),
  hasEmailWebhook: Boolean(settings.emailWebhookUrl?.trim()),
  hasGoogleSheetsSync: Boolean(settings.googleAppsScriptUrl?.trim()),
});

const createInitialPersistedState = () => {
  const appState = createSeedAppState();
  const adminSecret = createPasswordSecret(starterAdminPassword);
  const staffSecret = createPasswordSecret(starterStaffPassword);

  return {
    schemaVersion: CURRENT_STATE_SCHEMA_VERSION,
    appState,
    secrets: {
      adminPasswordSalt: adminSecret.passwordSalt,
      adminPasswordHash: adminSecret.passwordHash,
      staffPasswordSalt: staffSecret.passwordSalt,
      staffPasswordHash: staffSecret.passwordHash,
      openAiApiKey: "",
      anthropicApiKey: "",
    },
  };
};

const applyEnvironmentOverrides = (persistedState) => {
  const nextState = clone(persistedState);

  if (process.env.AI_WEBHOOK_URL?.trim()) {
    nextState.appState.settings.aiWebhookUrl = process.env.AI_WEBHOOK_URL.trim();
  }

  if (process.env.EMAIL_WEBHOOK_URL?.trim()) {
    nextState.appState.settings.emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL.trim();
  }

  if (process.env.GOOGLE_APPS_SCRIPT_URL?.trim()) {
    nextState.appState.settings.googleAppsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL.trim();
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    nextState.secrets.openAiApiKey = process.env.OPENAI_API_KEY.trim();
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) nextState.secrets.anthropicApiKey = process.env.ANTHROPIC_API_KEY.trim();

  return nextState;
};

const migrateState = (rawState) => {
  const fallbackState = createInitialPersistedState();
  const nextAppState = rawState?.appState
    ? clone(rawState.appState)
    : rawState?.settings && rawState?.crmRecords
      ? clone(rawState)
      : clone(fallbackState.appState);

  nextAppState.settings = {
    ...clone(seedAppState.settings),
    ...(nextAppState.settings || {}),
    repProfile: {
      ...clone(seedAppState.settings.repProfile),
      ...(nextAppState.settings?.repProfile || {}),
    },
    adminPassword: "",
    staffPassword: "",
    openAiApiKey: "",
    anthropicApiKey: "",
  };
  if (nextAppState.settings.repProfile.email?.trim().toLowerCase() === "student.jayla1985@gmail.com") {
    nextAppState.settings.repProfile.email = "Davidscontracting49@gmail.com";
  }
  nextAppState.crmRecords = Array.isArray(nextAppState.crmRecords) ? nextAppState.crmRecords : [];
  nextAppState.reminders = Array.isArray(nextAppState.reminders) ? nextAppState.reminders : [];
  nextAppState.historicalJobs = Array.isArray(nextAppState.historicalJobs) ? nextAppState.historicalJobs : [];
  nextAppState.applicants = Array.isArray(nextAppState.applicants) ? nextAppState.applicants : clone(seedAppState.applicants);
  nextAppState.jobOpenings = Array.isArray(nextAppState.jobOpenings) ? nextAppState.jobOpenings : clone(seedAppState.jobOpenings);
  nextAppState.projects = Array.isArray(nextAppState.projects) ? nextAppState.projects : clone(seedAppState.projects);
  nextAppState.employees = Array.isArray(nextAppState.employees) ? nextAppState.employees : clone(seedAppState.employees);
  nextAppState.employees = nextAppState.employees.map((employee) => ({
    ...employee,
    payFrequency: ["Daily", "Weekly", "Biweekly", "Semimonthly", "Monthly", "Per Project", "Contracted", "Hourly", "Commission", "Other"].includes(employee?.payFrequency) ? employee.payFrequency : "Weekly",
    paymentMethod: ["Cash", "Check", "Direct Deposit", "PayPal", "Cash App", "Venmo", "Zelle", "ACH", "Prepaid Card", "Other"].includes(employee?.paymentMethod) ? employee.paymentMethod : "Cash",
    paymentHandle: typeof employee?.paymentHandle === "string" ? employee.paymentHandle.slice(0, 120) : "",
  }));
  nextAppState.materials = Array.isArray(nextAppState.materials) ? nextAppState.materials : clone(seedAppState.materials);
  nextAppState.aiReviews = Array.isArray(nextAppState.aiReviews) ? nextAppState.aiReviews : clone(seedAppState.aiReviews);
  nextAppState.contactLeads = Array.isArray(nextAppState.contactLeads) ? nextAppState.contactLeads : [];
  nextAppState.financingInquiries = Array.isArray(nextAppState.financingInquiries) ? nextAppState.financingInquiries : [];
  nextAppState.analyticsEvents = Array.isArray(nextAppState.analyticsEvents) ? nextAppState.analyticsEvents : [];
  nextAppState.galleryProjects = Array.isArray(nextAppState.galleryProjects) ? nextAppState.galleryProjects : [];
  nextAppState.podcastEpisodes = Array.isArray(nextAppState.podcastEpisodes) ? nextAppState.podcastEpisodes : [];
  nextAppState.podcastEvents = Array.isArray(nextAppState.podcastEvents) ? nextAppState.podcastEvents : [];
  if ((Number(rawState?.schemaVersion) || 0) < 5 && nextAppState.galleryProjects.length === 0) nextAppState.galleryProjects = clone(seedAppState.galleryProjects);
  if ((Number(rawState?.schemaVersion) || 0) < 8) {
    const requiredIds = new Set(["gallery-training-deconstruction", "gallery-safety-lead-testing", "gallery-training-ceiling-panels"]);
    const additions = seedAppState.galleryProjects.filter((project) => requiredIds.has(project.id) && !nextAppState.galleryProjects.some((current) => current.id === project.id));
    nextAppState.galleryProjects.push(...clone(additions));
  }
  nextAppState.crmRecords = nextAppState.crmRecords.map((record) => ({
    ...record,
    source: record?.source === "public-estimate" ? "public-estimate" : "staff-estimate",
    client: {
      ...clone(defaultClientShape),
      ...(record?.client || {}),
    },
  }));

  const rawSecrets = rawState?.secrets && typeof rawState.secrets === "object" ? rawState.secrets : {};
  const adminPasswordSource =
    normalizeString(rawState?.appState?.settings?.adminPassword || rawState?.settings?.adminPassword) ||
    starterAdminPassword;
  const staffPasswordSource =
    normalizeString(rawState?.appState?.settings?.staffPassword || rawState?.settings?.staffPassword) ||
    starterStaffPassword;

  const adminSecret =
    rawSecrets.adminPasswordHash && rawSecrets.adminPasswordSalt
      ? {
          adminPasswordHash: rawSecrets.adminPasswordHash,
          adminPasswordSalt: rawSecrets.adminPasswordSalt,
        }
      : rawSecrets.passwordHash && rawSecrets.passwordSalt
        ? {
            adminPasswordHash: rawSecrets.passwordHash,
            adminPasswordSalt: rawSecrets.passwordSalt,
          }
        : (() => {
            const created = createPasswordSecret(adminPasswordSource);
            return {
              adminPasswordHash: created.passwordHash,
              adminPasswordSalt: created.passwordSalt,
            };
          })();

  const staffSecret =
    rawSecrets.staffPasswordHash && rawSecrets.staffPasswordSalt
      ? {
          staffPasswordHash: rawSecrets.staffPasswordHash,
          staffPasswordSalt: rawSecrets.staffPasswordSalt,
        }
      : (() => {
          const created = createPasswordSecret(staffPasswordSource);
          return {
            staffPasswordHash: created.passwordHash,
            staffPasswordSalt: created.passwordSalt,
          };
        })();

  return {
    schemaVersion: CURRENT_STATE_SCHEMA_VERSION,
    appState: nextAppState,
    secrets: {
      ...adminSecret,
      ...staffSecret,
      openAiApiKey: normalizeString(rawSecrets.openAiApiKey || rawState?.settings?.openAiApiKey),
      anthropicApiKey: normalizeString(rawSecrets.anthropicApiKey || rawState?.settings?.anthropicApiKey),
    },
  };
};

const buildReminderFromRecord = (record) => ({
  id: `rem-${record.id}`,
  clientName: `${record.client.firstName} ${record.client.lastName}`,
  note:
    record.client.jobStatus === "Prospecting/Negotiating"
      ? "Follow up on estimate, scope revisions, and funding options."
      : record.client.jobStatus === "In-Progress"
        ? "Check progress, materials, and payment schedule."
        : "Touch base for close-out, review, or referral request.",
  dueDate: record.nextFollowUpAt,
  priority: record.client.jobStatus === "Prospecting/Negotiating" ? "High" : "Medium",
});

const buildHistoricalJobFromRecord = (record, quote) => ({
  id: `hist-${record.id}`,
  clientName: `${record.client.firstName} ${record.client.lastName}`,
  projectTitle: quote.projectTitle,
  categories: quote.categories,
  notes: quote.projectSummary,
  quoteTotal: quote.totals.totalHigh,
  status: record.client.jobStatus,
  generatedAt: quote.generatedAt,
});

const upsertById = (items, nextItem) => [nextItem, ...items.filter((item) => item.id !== nextItem.id)];

const useNetlifyBlobs = Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);

const readLocalState = async () => {
  await mkdir(localDataDir, { recursive: true });
  if (!existsSync(localStateFile)) {
    await writeFile(localStateFile, JSON.stringify(createInitialPersistedState(), null, 2), "utf8");
  }

  const raw = await readFile(localStateFile, "utf8");
  const parsed = JSON.parse(raw);
  const migrated = migrateState(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
    await writeFile(localStateFile, JSON.stringify(migrated, null, 2), "utf8");
  }
  return migrated;
};

const writeLocalState = async (persistedState) => {
  await mkdir(localDataDir, { recursive: true });
  await writeFile(localStateFile, JSON.stringify(persistedState, null, 2), "utf8");
};

const readBlobState = async () => {
  const store = getStore({ name: storeName, consistency: "strong" });
  const raw = await store.get(stateKey);
  if (!raw) {
    const initial = createInitialPersistedState();
    await store.set(stateKey, JSON.stringify(initial));
    return initial;
  }

  const parsed = JSON.parse(raw);
  const migrated = migrateState(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
    await store.set(stateKey, JSON.stringify(migrated));
  }
  return migrated;
};

const writeBlobState = async (persistedState) => {
  const store = getStore({ name: storeName, consistency: "strong" });
  await store.set(stateKey, JSON.stringify(persistedState));
};

const readPersistedStateBase = async () => (useNetlifyBlobs ? readBlobState() : readLocalState());

export const readPersistedState = async () => applyEnvironmentOverrides(await readPersistedStateBase());

export const writePersistedState = async (persistedState) =>
  useNetlifyBlobs ? writeBlobState(persistedState) : writeLocalState(persistedState);

export const verifyAdminPassword = (persistedState, password) =>
  verifyPasswordHash(
    password,
    persistedState.secrets.adminPasswordSalt,
    persistedState.secrets.adminPasswordHash,
  );

export const verifyStaffPassword = (persistedState, password) =>
  verifyPasswordHash(
    password,
    persistedState.secrets.staffPasswordSalt,
    persistedState.secrets.staffPasswordHash,
  );

const sanitizeGalleryProject = (item) => {
  const { address: _privateAddress, ...publicProject } = clone(item);
  return publicProject;
};

export const buildPublicState = (persistedState) => ({
  settings: sanitizeSettings(persistedState.appState.settings, persistedState.secrets, false),
  crmRecords: [],
  reminders: [],
  historicalJobs: persistedState.appState.historicalJobs.map((job) => ({
    ...clone(job),
    clientName: "Prior client",
  })),
  applicants: [],
  jobOpenings: [],
  projects: [],
  employees: [],
  materials: [],
  aiReviews: [],
  contactLeads: [],
  financingInquiries: [],
  analyticsEvents: [],
  galleryProjects: persistedState.appState.galleryProjects.filter((item) => item.published).map(sanitizeGalleryProject),
  podcastEpisodes: persistedState.appState.podcastEpisodes.filter((item) => item.status === "Published" || item.status === "Scheduled"),
  podcastEvents: persistedState.appState.podcastEvents.filter((item) => item.published),
});

export const buildQuoteState = (persistedState, staffEmail = "") => {
  const employee = persistedState.appState.employees.find((item) => normalizeString(item.email).toLowerCase() === normalizeString(staffEmail).toLowerCase() && item.status === "Active");
  const assignedIds = new Set(employee?.assignedProjectIds || []);
  const projects = employee ? persistedState.appState.projects.filter((project) => assignedIds.has(project.id) || project.employeeIds?.includes(employee.id)).map((project) => ({ ...clone(project), activity: (project.activity || []).filter((item) => item.kind !== "Private Owner Note") })) : [];
  const safeEmployee = employee ? { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, title: employee.title, email: employee.email, skills: employee.skills, availability: employee.availability, weeklyCapacityHours: employee.weeklyCapacityHours, assignedProjectIds: employee.assignedProjectIds } : null;
  return {
  settings: sanitizeSettings(persistedState.appState.settings, persistedState.secrets, false),
  crmRecords: [],
  reminders: [],
  historicalJobs: persistedState.appState.historicalJobs.map((job) => ({
    ...clone(job),
    clientName: "Prior client",
  })),
  applicants: [],
  jobOpenings: [],
  projects,
  employees: safeEmployee ? [safeEmployee] : [],
  materials: [],
  aiReviews: [],
  contactLeads: [],
  financingInquiries: [],
  analyticsEvents: [],
  galleryProjects: persistedState.appState.galleryProjects.filter((item) => item.published).map(sanitizeGalleryProject),
  podcastEpisodes: persistedState.appState.podcastEpisodes.filter((item) => item.status === "Published" || item.status === "Scheduled"),
  podcastEvents: persistedState.appState.podcastEvents.filter((item) => item.published),
};
};

export const buildAdminState = (persistedState) => ({
  ...clone(persistedState.appState),
  settings: sanitizeSettings(persistedState.appState.settings, persistedState.secrets, true),
});

export const saveQuoteRecord = async (record, quote) => {
  const persistedState = await readPersistedState();
  persistedState.appState.crmRecords = upsertById(persistedState.appState.crmRecords, record);
  persistedState.appState.historicalJobs = upsertById(
    persistedState.appState.historicalJobs,
    buildHistoricalJobFromRecord(record, quote),
  );
  persistedState.appState.reminders = upsertById(
    persistedState.appState.reminders,
    buildReminderFromRecord(record),
  );
  await writePersistedState(persistedState);
  return persistedState;
};

export const updateAppSettings = async (nextSettings) => {
  const persistedState = await readPersistedState();
  const trimmedAdminPassword = normalizeString(nextSettings?.adminPassword);
  const trimmedStaffPassword = normalizeString(nextSettings?.staffPassword);
  const trimmedOpenAiApiKey = normalizeString(nextSettings?.openAiApiKey);
  const trimmedAnthropicApiKey = normalizeString(nextSettings?.anthropicApiKey);

  persistedState.appState.settings = normalizeSettingsInput(persistedState.appState.settings, nextSettings);

  if (trimmedAdminPassword) {
    const created = createPasswordSecret(trimmedAdminPassword);
    persistedState.secrets.adminPasswordHash = created.passwordHash;
    persistedState.secrets.adminPasswordSalt = created.passwordSalt;
  }

  if (trimmedStaffPassword) {
    const created = createPasswordSecret(trimmedStaffPassword);
    persistedState.secrets.staffPasswordHash = created.passwordHash;
    persistedState.secrets.staffPasswordSalt = created.passwordSalt;
  }

  if (trimmedOpenAiApiKey) {
    persistedState.secrets.openAiApiKey = trimmedOpenAiApiKey;
  }
  if (trimmedAnthropicApiKey) persistedState.secrets.anthropicApiKey = trimmedAnthropicApiKey;

  await writePersistedState(persistedState);
  return persistedState;
};

export const updateOperationsState = async (patch = {}) => {
  const persistedState = await readPersistedState();
  const allowedCollections = ["applicants", "jobOpenings", "projects", "employees", "materials", "aiReviews", "contactLeads", "financingInquiries", "analyticsEvents", "galleryProjects", "podcastEpisodes", "podcastEvents"];

  for (const key of allowedCollections) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      if (!Array.isArray(patch[key])) {
        throw Object.assign(new Error(`${key} must be an array.`), { status: 400 });
      }
      if (patch[key].length > 5000) {
        throw Object.assign(new Error(`${key} cannot contain more than 5,000 records per import.`), { status: 400 });
      }
      const ids = new Set();
      for (const item of patch[key]) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || item.id.length > 128) {
          throw Object.assign(new Error(`${key} contains a record with an invalid id.`), { status: 400 });
        }
        if (ids.has(item.id)) {
          throw Object.assign(new Error(`${key} contains duplicate id ${item.id}.`), { status: 400 });
        }
        ids.add(item.id);
        if (key === "employees") {
          const validFrequencies = ["Daily", "Weekly", "Biweekly", "Semimonthly", "Monthly", "Per Project", "Contracted", "Hourly", "Commission", "Other"];
          const validMethods = ["Cash", "Check", "Direct Deposit", "PayPal", "Cash App", "Venmo", "Zelle", "ACH", "Prepaid Card", "Other"];
          if (!normalizeString(item.firstName) || !normalizeString(item.lastName) || !normalizeString(item.title) || item.firstName.length > 80 || item.lastName.length > 80 || item.title.length > 120) throw Object.assign(new Error("Each employee requires a valid first name, last name, and role/title."), { status: 400 });
          if (!isFiniteNumber(item.hourlyRate) || item.hourlyRate < 0 || item.hourlyRate > 10000) throw Object.assign(new Error("Employee pay rate is outside the allowed range."), { status: 400 });
          if (!validFrequencies.includes(item.payFrequency) || !validMethods.includes(item.paymentMethod)) throw Object.assign(new Error("Employee pay frequency or payment method is invalid."), { status: 400 });
          if (item.paymentMethod !== "Cash" && (!normalizeString(item.paymentHandle) || item.paymentHandle.length > 120)) throw Object.assign(new Error("A safe payout alias or account label is required for non-cash payment methods."), { status: 400 });
          if (/\d{9,}/.test(normalizeString(item.paymentHandle))) throw Object.assign(new Error("Do not store bank, routing, card, or other full financial account numbers in employee records."), { status: 400 });
        }
      }
      persistedState.appState[key] = clone(patch[key]);
    }
  }

  await writePersistedState(persistedState);
  return persistedState;
};

/** Append-only project documentation. Existing entries are never accepted from this route for mutation/removal. */
export const appendProjectActivity = async (projectId, entry) => {
  const persistedState = await readPersistedState();
  const project = persistedState.appState.projects.find((item) => item.id === projectId);
  if (!project) throw Object.assign(new Error("Project not found."), { status: 404 });
  project.activity = [entry, ...(Array.isArray(project.activity) ? project.activity : [])].slice(0, 2000);
  project.updatedAt = entry.createdAt;
  persistedState.appState.ownerNotifications = [
    { id: `notice-${entry.id}`, projectId, title: `${entry.authorRole} documentation added`, detail: entry.body.slice(0, 280), severity: entry.attachments.length ? "Review" : "Info", createdAt: entry.createdAt, readAt: "", source: "Field documentation" },
    ...(persistedState.appState.ownerNotifications || []),
  ].slice(0, 5000);
  await writePersistedState(persistedState);
  return persistedState;
};

export const updateCrmRecord = async (recordId, patch) => {
  const persistedState = await readPersistedState();
  let previousRecord = null;
  let updatedRecord = null;

  persistedState.appState.crmRecords = persistedState.appState.crmRecords.map((record) => {
    if (record.id !== recordId) {
      return record;
    }

    previousRecord = clone(record);
    updatedRecord = {
      ...record,
      ...patch,
      client: patch.client ? { ...record.client, ...patch.client } : record.client,
      quoteHistory: patch.quoteHistory ?? record.quoteHistory,
      documentation: patch.documentation ?? record.documentation,
    };
    return updatedRecord;
  });

  if (updatedRecord) {
    const referenceQuote = updatedRecord.quoteHistory?.[0];
    if (referenceQuote) {
      persistedState.appState.historicalJobs = upsertById(
        persistedState.appState.historicalJobs,
        buildHistoricalJobFromRecord(updatedRecord, referenceQuote),
      );
    }

    persistedState.appState.reminders = upsertById(
      persistedState.appState.reminders,
      buildReminderFromRecord(updatedRecord),
    );
  }

  await writePersistedState(persistedState);
  return {
    persistedState,
    previousRecord,
    updatedRecord,
  };
};

export const savePublicIntake = async (collection, record, relatedReview = null) => {
  const allowed = new Set(["contactLeads", "financingInquiries", "analyticsEvents", "applicants"]);
  if (!allowed.has(collection)) throw Object.assign(new Error("Unsupported public intake collection."), { status: 400 });
  const persistedState = await readPersistedState();
  persistedState.appState[collection] = upsertById(persistedState.appState[collection], clone(record)).slice(0, collection === "analyticsEvents" ? 20_000 : 5_000);
  if (relatedReview) persistedState.appState.aiReviews = upsertById(persistedState.appState.aiReviews, clone(relatedReview));
  await writePersistedState(persistedState);
  return persistedState;
};

export const storeApplicantResume = async ({ data, extension }) => {
  const storageKey = `${randomBytes(20).toString("hex")}.${extension}`;
  if (useNetlifyBlobs) {
    const store = getStore({ name: resumeStoreName, consistency: "strong" });
    await store.set(storageKey, data);
  } else {
    const uploadsDir = path.join(localDataDir, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, storageKey), data);
  }
  return storageKey;
};
