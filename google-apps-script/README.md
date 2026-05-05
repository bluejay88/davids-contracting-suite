# Google Apps Script CRM Sync

This folder gives you a lightweight Google Sheets backend for the app.

## What it does

- Creates a `CRM` sheet for client/job records
- Creates a `Quotes` sheet for quote snapshots
- Accepts `POST` requests from the app
- Returns simple JSON responses

## Setup

1. Create a Google Sheet in the Drive account you want to use as the CRM database.
2. Open `Extensions -> Apps Script`.
3. Replace the default script contents with [`Code.gs`](./Code.gs).
4. Save the script.
5. Deploy:
   - `Deploy -> New deployment`
   - Type: `Web app`
   - Execute as: `Me`
   - Who has access: `Anyone with the link`
6. Copy the web app URL.
7. In the web app admin dashboard, paste that URL into `Google Apps Script URL`.

## Expected payloads

The app sends JSON like:

```json
{
  "type": "quote",
  "submittedAt": "2026-05-04T23:00:00.000Z",
  "payload": {
    "record": {},
    "quote": {}
  }
}
```

or:

```json
{
  "type": "crm",
  "submittedAt": "2026-05-04T23:00:00.000Z",
  "payload": {}
}
```

## Recommended next upgrade

Once this is working, the natural next step is adding:

- `doGet()` list/filter endpoints so the app can pull data back from Sheets
- Google Drive folder uploads for quote PDFs and job photos
- Gmail or Google Workspace email delivery for sending PDFs directly
