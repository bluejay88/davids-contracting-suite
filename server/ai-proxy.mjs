const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const integrationResult = (key, status, message, detail) => ({
  key,
  status,
  message,
  checkedAt: new Date().toISOString(),
  ...(detail ? { detail } : {}),
});

const stripMarkdownJson = (text) =>
  text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

const parseJsonResponse = (text) => JSON.parse(stripMarkdownJson(text));

const extractResponsesText = (response) => {
  if (response.output_text) {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
};

const openAiHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

const canUseOpenAiDirect = (settings, secrets) =>
  settings.aiProvider === "openai-direct" && Boolean(secrets.openAiApiKey?.trim());

const canUseWebhook = (settings) =>
  settings.aiProvider === "webhook" && Boolean(settings.aiWebhookUrl?.trim());

const callOpenAiResponsesJson = async (settings, secrets, prompt, images, schemaName, schema) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: openAiHeaders(secrets.openAiApiKey.trim()),
    body: JSON.stringify({
      model: settings.openAiModel,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...images.map((imageUrl) => ({
              type: "input_image",
              image_url: imageUrl,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI responses request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const text = extractResponsesText(payload);
  if (!text) {
    throw new Error("OpenAI responses request returned no text payload.");
  }

  return parseJsonResponse(text);
};

const callOpenAiSearchJson = async (settings, secrets, prompt) => {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: openAiHeaders(secrets.openAiApiKey.trim()),
    body: JSON.stringify({
      model: settings.openAiSearchModel,
      messages: [
        {
          role: "system",
          content:
            "You are a contractor research assistant. Search the web when helpful, and return only valid JSON with no markdown fences.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI search request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI search request returned no content.");
  }

  return parseJsonResponse(text);
};

const callWebhook = async (settings, action, payload) => {
  const response = await fetch(settings.aiWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      payload,
      context: {
        company: settings.repProfile.companyName,
        serviceAreaZip: settings.serviceAreaZip,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI webhook failed with status ${response.status}.`);
  }

  return response.json();
};

const pingOpenAi = async (settings, secrets) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: openAiHeaders(secrets.openAiApiKey.trim()),
    body: JSON.stringify({
      model: settings.openAiModel,
      input: "Reply with OK if the David's Contracting AI health check is working.",
      max_output_tokens: 24,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI health check failed with status ${response.status}.`);
  }

  const payload = await response.json();
  return extractResponsesText(payload) || "OpenAI health check responded without text.";
};

const dataUrlToBlob = (dataUrl, fallbackMimeType) => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Audio upload payload was not a valid data URL.");
  }

  const mimeType = match[1] || fallbackMimeType || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const rawValue = match[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(rawValue, "base64")
    : Buffer.from(decodeURIComponent(rawValue), "utf8");

  return new Blob([buffer], { type: mimeType });
};

export const resolveScopePlan = async (settings, secrets, payload) => {
  if (canUseWebhook(settings)) {
    return callWebhook(settings, "scope-plan", payload.webhookPayload);
  }

  if (!canUseOpenAiDirect(settings, secrets)) {
    throw new Error("AI scope plan is not configured on the server.");
  }

  return callOpenAiResponsesJson(
    settings,
    secrets,
    payload.prompt,
    payload.imageDataUrls ?? [],
    payload.schemaName,
    payload.schema,
  );
};

export const resolveAidPrograms = async (settings, secrets, payload) => {
  if (canUseWebhook(settings)) {
    return callWebhook(settings, "aid-programs", payload.webhookPayload);
  }

  if (!canUseOpenAiDirect(settings, secrets)) {
    throw new Error("AI assistance research is not configured on the server.");
  }

  return callOpenAiSearchJson(settings, secrets, payload.prompt);
};

export const resolveMaterialPlan = async (settings, secrets, payload) => {
  if (canUseWebhook(settings)) {
    return callWebhook(settings, "material-plan", payload.webhookPayload);
  }

  if (!canUseOpenAiDirect(settings, secrets)) {
    throw new Error("AI material research is not configured on the server.");
  }

  return callOpenAiSearchJson(settings, secrets, payload.prompt);
};

export const resolveAudioTranscription = async (settings, secrets, payload) => {
  if (canUseWebhook(settings)) {
    return callWebhook(settings, "transcribe-audio", payload);
  }

  if (!canUseOpenAiDirect(settings, secrets)) {
    throw new Error("AI audio transcription is not configured on the server.");
  }

  const formData = new FormData();
  const audioBlob = dataUrlToBlob(payload.audioDataUrl, payload.mimeType);

  formData.append(
    "file",
    audioBlob,
    payload.fileName || `scope-audio.${payload.mimeType?.split("/")[1] || "webm"}`,
  );
  formData.append("model", settings.openAiTranscriptionModel);

  const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.openAiApiKey.trim()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Audio transcription failed with status ${response.status}.`);
  }

  const result = await response.json();
  if (!result.text) {
    throw new Error("Audio transcription returned no text.");
  }

  return { transcript: result.text };
};

export const testAiProvider = async (settings, secrets) => {
  if (settings.aiProvider === "heuristic") {
    return integrationResult(
      "ai",
      "success",
      "Heuristic AI mode is available locally and does not require external credentials.",
    );
  }

  if (settings.aiProvider === "openai-direct") {
    if (!secrets.openAiApiKey?.trim()) {
      return integrationResult(
        "ai",
        "failed",
        "OpenAI direct mode is selected, but no server-side API key is stored yet.",
      );
    }

    try {
      const detail = await pingOpenAi(settings, secrets);
      return integrationResult(
        "ai",
        "success",
        `OpenAI direct responded successfully using ${settings.openAiModel}.`,
        detail,
      );
    } catch (error) {
      return integrationResult(
        "ai",
        "failed",
        error instanceof Error ? error.message : "OpenAI direct health check failed.",
      );
    }
  }

  if (!settings.aiWebhookUrl?.trim()) {
    return integrationResult(
      "ai",
      "failed",
      "Webhook AI mode is selected, but no AI webhook URL is configured.",
    );
  }

  try {
    const payload = await callWebhook(settings, "health-check", {
      source: "admin-dashboard",
      requestedAt: new Date().toISOString(),
    });
    return integrationResult(
      "ai",
      "success",
      payload?.message || "AI webhook responded to the health check.",
    );
  } catch (error) {
    return integrationResult(
      "ai",
      "failed",
      error instanceof Error ? error.message : "AI webhook health check failed.",
    );
  }
};
