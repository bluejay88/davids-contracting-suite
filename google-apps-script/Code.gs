const CRM_SHEET = "CRM";
const QUOTES_SHEET = "Quotes";

function doGet() {
  return jsonResponse({
    ok: true,
    message: "David's Contracting Apps Script is online.",
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const submittedAt = body.submittedAt || new Date().toISOString();
    const type = body.type || "crm";
    const payload = body.payload || {};

    if (type === "health-check") {
      return jsonResponse({
        ok: true,
        type: "health-check",
        message: "David's Contracting Google Sheets sync is reachable.",
      });
    }

    if (type === "quote") {
      appendCrmRecord(payload.record, submittedAt);
      appendQuote(payload.record, payload.quote, submittedAt);
      return jsonResponse({ ok: true, type: "quote" });
    }

    appendCrmRecord(payload, submittedAt);
    return jsonResponse({ ok: true, type: "crm" });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error),
    });
  }
}

function appendCrmRecord(record, submittedAt) {
  const sheet = getOrCreateSheet(CRM_SHEET, [
    "submittedAt",
    "recordId",
    "firstName",
    "lastName",
    "address",
    "city",
    "state",
    "zip",
    "email",
    "phone",
    "budget",
    "requestedJobs",
    "emergencyIssues",
    "jobStatus",
    "paymentCollected",
    "paymentAmount",
    "paymentDue",
    "invoiceStatus",
    "assignedRep",
    "aidSuggestions",
    "notes",
    "documentation",
  ]);

  const client = record.client || {};
  sheet.appendRow([
    submittedAt,
    record.id || "",
    client.firstName || "",
    client.lastName || "",
    client.address || "",
    client.city || "",
    client.state || "",
    client.zip || "",
    client.email || "",
    client.phone || "",
    client.budget || "",
    client.requestedJobs || "",
    client.emergencyIssues || "",
    client.jobStatus || "",
    client.paymentCollected || false,
    client.paymentAmount || 0,
    record.paymentDue || 0,
    record.invoiceStatus || "",
    client.assignedRep || "",
    (client.aidSuggestions || []).join(" | "),
    client.notes || "",
    (record.documentation || []).join(" | "),
  ]);
}

function appendQuote(record, quote, submittedAt) {
  const sheet = getOrCreateSheet(QUOTES_SHEET, [
    "submittedAt",
    "recordId",
    "quoteId",
    "clientName",
    "projectTitle",
    "projectSummary",
    "categories",
    "totalLow",
    "totalHigh",
    "subtotalLow",
    "subtotalHigh",
    "laborHours",
    "lineItemCount",
    "lineItemsJson",
  ]);

  const client = record.client || {};
  const clientName = [client.firstName || "", client.lastName || ""].join(" ").trim();
  sheet.appendRow([
    submittedAt,
    record.id || "",
    quote.id || "",
    clientName,
    quote.projectTitle || "",
    quote.projectSummary || "",
    (quote.categories || []).join(" | "),
    quote.totals ? quote.totals.totalLow : "",
    quote.totals ? quote.totals.totalHigh : "",
    quote.totals ? quote.totals.subtotalLow : "",
    quote.totals ? quote.totals.subtotalHigh : "",
    quote.totals ? quote.totals.laborHours : "",
    quote.breakdown ? quote.breakdown.length : 0,
    JSON.stringify(quote.breakdown || []),
  ]);
}

function getOrCreateSheet(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
