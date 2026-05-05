const parseJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const integrationResult = (key, status, message, detail) => ({
  key,
  status,
  message,
  checkedAt: new Date().toISOString(),
  ...(detail ? { detail } : {}),
});

export const pushRecordToGoogleSheets = async (settings, record, quote) => {
  if (!settings.googleAppsScriptUrl?.trim()) {
    return {
      status: "skipped",
      message: "Google Sheets sync is not configured.",
    };
  }

  const response = await fetch(settings.googleAppsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: quote ? "quote" : "crm",
      submittedAt: new Date().toISOString(),
      payload: quote ? { record, quote } : record,
    }),
  });

  if (!response.ok) {
    const payload = await parseJsonResponse(response);
    throw new Error(
      payload?.message || `Google Sheets sync failed with status ${response.status}.`,
    );
  }

  await parseJsonResponse(response);
  return {
    status: "success",
    message: "Quote saved and synced to the Google Sheets workspace.",
  };
};

export const sendQuoteEmail = async (settings, payload) => {
  if (!settings.emailWebhookUrl?.trim()) {
    throw new Error("Email webhook is not configured in Admin Settings.");
  }

  const response = await fetch(settings.emailWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      submittedAt: new Date().toISOString(),
      to: payload.client.email,
      cc: settings.repProfile.email,
      replyTo: settings.repProfile.email,
      repProfile: settings.repProfile,
      client: payload.client,
      quote: payload.quote,
      pdfDataUrl: payload.pdfDataUrl,
      filename: payload.filename,
    }),
  });

  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      errorPayload?.message || `Email delivery failed with status ${response.status}.`,
    );
  }

  const result = await parseJsonResponse(response);
  return {
    message:
      result?.message || `Quote emailed to ${payload.client.email} and copied to ${settings.repProfile.email}.`,
  };
};

export const sendConsultationConfirmation = async (settings, record, quote) => {
  if (!settings.emailWebhookUrl?.trim()) {
    return {
      status: "skipped",
      message: "Consultation confirmation email is not configured.",
    };
  }

  if (!record?.client?.consultationRequested || !record?.client?.email || !record?.client?.consentEmailContact) {
    return {
      status: "skipped",
      message: "Consultation confirmation email was not applicable for this lead.",
    };
  }

  const response = await fetch(settings.emailWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      consultationConfirmation: true,
      submittedAt: new Date().toISOString(),
      to: record.client.email,
      cc: settings.repProfile.email,
      replyTo: settings.repProfile.email,
      repProfile: settings.repProfile,
      client: record.client,
      consultation: {
        date: record.client.consultationDate,
        time: record.client.consultationTime,
        notes: record.client.consultationNotes,
        status: record.client.consultationStatus,
      },
      quote: quote || null,
    }),
  });

  if (!response.ok) {
    const errorPayload = await parseJsonResponse(response);
    throw new Error(
      errorPayload?.message || `Consultation confirmation failed with status ${response.status}.`,
    );
  }

  const result = await parseJsonResponse(response);
  return {
    status: "success",
    message:
      result?.message || `Consultation confirmation sent to ${record.client.email}.`,
  };
};

export const testGoogleSheetsConnection = async (settings) => {
  if (!settings.googleAppsScriptUrl?.trim()) {
    return integrationResult(
      "google-sheets",
      "failed",
      "Google Apps Script URL is not configured in Admin Settings.",
    );
  }

  try {
    const response = await fetch(settings.googleAppsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "health-check",
        submittedAt: new Date().toISOString(),
        payload: {
          source: "admin-dashboard",
          serviceAreaZip: settings.serviceAreaZip,
        },
      }),
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok || payload?.ok === false) {
      throw new Error(
        payload?.message || payload?.error || `Google Sheets health check failed with status ${response.status}.`,
      );
    }

    return integrationResult(
      "google-sheets",
      "success",
      payload?.message || "Google Sheets sync endpoint responded to the health check.",
    );
  } catch (error) {
    return integrationResult(
      "google-sheets",
      "failed",
      error instanceof Error ? error.message : "Google Sheets health check failed.",
    );
  }
};

export const testEmailWebhook = async (settings) => {
  if (!settings.emailWebhookUrl?.trim()) {
    return integrationResult(
      "email",
      "failed",
      "Email webhook URL is not configured in Admin Settings.",
    );
  }

  try {
    const response = await fetch(settings.emailWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        healthCheck: true,
        submittedAt: new Date().toISOString(),
        channel: "davids-contracting-quote-email",
        repProfile: settings.repProfile,
      }),
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok || payload?.ok === false) {
      throw new Error(
        payload?.message || payload?.error || `Email webhook health check failed with status ${response.status}.`,
      );
    }

    return integrationResult(
      "email",
      "success",
      payload?.message || "Email webhook responded to the health check.",
    );
  } catch (error) {
    return integrationResult(
      "email",
      "failed",
      error instanceof Error ? error.message : "Email webhook health check failed.",
    );
  }
};
