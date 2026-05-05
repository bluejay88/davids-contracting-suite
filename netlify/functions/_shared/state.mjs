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
    googleAppsScriptUrl: normalizeString(candidate.googleAppsScriptUrl, currentSettings.googleAppsScriptUrl),
    aiWebhookUrl: normalizeString(candidate.aiWebhookUrl, currentSettings.aiWebhookUrl),
    emailWebhookUrl: normalizeString(candidate.emailWebhookUrl, currentSettings.emailWebhookUrl),
    openAiApiKey: "",
    openAiModel: normalizeRequiredString(candidate.openAiModel, currentSettings.openAiModel),
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
  aiWebhookUrl: includeIntegrationUrls ? settings.aiWebhookUrl : "",
  emailWebhookUrl: includeIntegrationUrls ? settings.emailWebhookUrl : "",
  googleAppsScriptUrl: includeIntegrationUrls ? settings.googleAppsScriptUrl : "",
  hasAdminPassword: Boolean(secrets.adminPasswordHash),
  hasStaffPassword: Boolean(secrets.staffPasswordHash),
  hasOpenAiApiKey: Boolean(secrets.openAiApiKey?.trim()),
  hasAiWebhook: Boolean(settings.aiWebhookUrl?.trim()),
  hasEmailWebhook: Boolean(settings.emailWebhookUrl?.trim()),
  hasGoogleSheetsSync: Boolean(settings.googleAppsScriptUrl?.trim()),
});

const createInitialPersistedState = () => {
  const appState = createSeedAppState();
  const adminSecret = createPasswordSecret(starterAdminPassword);
  const staffSecret = createPasswordSecret(starterStaffPassword);

  return {
    appState,
    secrets: {
      adminPasswordSalt: adminSecret.passwordSalt,
      adminPasswordHash: adminSecret.passwordHash,
      staffPasswordSalt: staffSecret.passwordSalt,
      staffPasswordHash: staffSecret.passwordHash,
      openAiApiKey: "",
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
  };
  nextAppState.crmRecords = Array.isArray(nextAppState.crmRecords) ? nextAppState.crmRecords : [];
  nextAppState.reminders = Array.isArray(nextAppState.reminders) ? nextAppState.reminders : [];
  nextAppState.historicalJobs = Array.isArray(nextAppState.historicalJobs) ? nextAppState.historicalJobs : [];
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
    appState: nextAppState,
    secrets: {
      ...adminSecret,
      ...staffSecret,
      openAiApiKey: normalizeString(rawSecrets.openAiApiKey || rawState?.settings?.openAiApiKey),
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

export const buildPublicState = (persistedState) => ({
  settings: sanitizeSettings(persistedState.appState.settings, persistedState.secrets, false),
  crmRecords: [],
  reminders: [],
  historicalJobs: persistedState.appState.historicalJobs.map((job) => ({
    ...clone(job),
    clientName: "Prior client",
  })),
});

export const buildQuoteState = (persistedState) => ({
  settings: sanitizeSettings(persistedState.appState.settings, persistedState.secrets, false),
  crmRecords: [],
  reminders: [],
  historicalJobs: persistedState.appState.historicalJobs.map((job) => ({
    ...clone(job),
    clientName: "Prior client",
  })),
});

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
