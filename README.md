# David's Contracting Suite

Internal quoting, CRM, and operations workspace for David's Contracting.

## What is included

- Branded landing page using the provided David's Contracting logo
- Multi-trade quote builder for:
  - Painting
  - Flooring
  - Roofing
  - General Labor Handiwork
  - Electrical / HVAC
- Low estimate and high estimate pricing on every quote
- 25+ a la carte handiwork tasks that can be mixed into a single quote
- Client intake fields for CRM capture
- Speech-to-quote with both browser speech recognition and optional AI audio transcription
- AI scope autofill that cross-references intake, speech, uploaded images, selected trades, and historical jobs
- AI assistance-program research for Decatur, IL homeowner repair aid
- AI local material planning and supplier recommendations
- Admin login and CRM dashboard
- KPI charts, reminders, invoice visibility, crew/payroll panel, materials watch, and documentation list
- PDF quote export with branding and rep contact information
- Google Sheets / Google Drive sync hook through Apps Script

## Local run

```bash
npm install
npm run dev
```

This starts:
- Vite on `http://127.0.0.1:4173`
- The secure local API on `http://127.0.0.1:4174`

Production build:

```bash
npm run build
npm run preview
```

`npm run preview` serves the built frontend and the secure API together from one local Node server.

## Verification scripts

```bash
npm run test:secure-smoke
npm run test:netlify-smoke
```

- `test:secure-smoke` verifies the local Node server runtime.
- `test:netlify-smoke` verifies the Netlify function runtime using the same API contract.
- Both smoke tests can point at a custom mock integration server with `MOCK_BASE_URL=http://127.0.0.1:4310`.

## Default admin login

- Email: `owner@davidscontracting.local`
- Password: `BuiltOnPurpose30!`

The starter password now lives server-side only. The browser bundle does not ship with the admin password anymore.

Update both from the Admin Settings panel after first launch.

## Google Sheets / Drive setup

1. Create a Google Sheet in the target Drive account.
2. Open Extensions -> Apps Script.
3. Paste in [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
4. Deploy the script as a Web App with access allowed to anyone with the link.
5. Copy the deployed URL into the app's `Google Apps Script URL` field inside Admin Settings.

Setup details are documented in [`google-apps-script/README.md`](./google-apps-script/README.md).

## Notes on AI-assisted features

The app now supports three AI modes from Admin Settings:

- `Heuristic fallback`
  - No external API required
  - Uses local scope matching, historical job comparison, curated aid-program data, and catalog-based material planning
- `OpenAI direct`
  - Uses the local secure server as an OpenAI proxy for:
    - AI audio transcription
    - AI scope autofill from text + images
    - AI assistance-program refresh
    - AI local material research
- `Webhook`
  - Sends the same actions to your own backend endpoint
  - Best option for production if you want your own orchestration, logging, or external integrations

### Recommended production setup

The included local server already moves secrets and CRM persistence off the browser. For a full production deployment, the next step is to host that server or replace it with your preferred backend stack and move these integrations with it:

- Gmail/SMTP/transactional email sending
- Google Drive file uploads
- Any live internet search or price-refresh logic
- Stronger user management and role-based access
- Encrypted at-rest storage for customer PII

### AI webhook contract

If you use webhook mode, the app posts JSON to the configured `AI Webhook URL` with an `action` field:

- `scope-plan`
- `aid-programs`
- `material-plan`
- `transcribe-audio`

The backend should return JSON matching the requested action. A formal starter contract is documented in [`docs/ai-webhook-contract.md`](./docs/ai-webhook-contract.md).

## Notes on email delivery

- The app generates and downloads a branded quote PDF.
- If `Email Webhook URL` is configured in Admin Settings, the app will send the homeowner quote through the secure server and include the generated PDF payload.
- If email webhook delivery is not configured, the app falls back to the browser share sheet or a `mailto:` draft flow.

## Current architecture

- Public landing page and quote builder load from sanitized server bootstrap data.
- Public quote-builder history keeps the job context but redacts past client names.
- CRM records, reminders, admin settings, and AI/API secrets live in `server-data/app-state.json` behind the local Node server.
- Admin login uses an `HttpOnly` session cookie.
- Mutating API routes accept same-origin requests only, and admin login has basic local rate limiting.
- Quote saves can sync to Google Sheets through the server-side Apps Script webhook.
- Quote save/export/email actions require at least one scoped task so empty quotes cannot be stored or sent.

## Netlify deployment

This repo is now set up for two backends:

- Local Node backend:
  - `server/index.mjs`
  - file-backed persistence in `server-data/app-state.json`
- Netlify backend:
  - `netlify/functions/api.mjs`
  - persistent state in Netlify Blobs when deployed on Netlify
  - local fallback file `server-data/netlify-app-state.json` when you run the Netlify smoke test outside Netlify

Supporting files:

- `netlify.toml`
- `netlify/functions/_shared/state.mjs`

### Netlify behavior

- The frontend still calls `/api/...`.
- Netlify rewrites `/api/*` to the `api` serverless function.
- The Netlify function keeps the same admin/staff/public API contract as the local server.
- Auth on Netlify uses signed `HttpOnly` cookies instead of in-memory sessions.
- CRM records, reminders, and historical jobs are persisted in Netlify Blobs.

### After connecting the site in Netlify

Set these build settings:

- Build command: `npm run build`
- Publish directory: `dist`

Optional production secrets and endpoints can still be managed from the Admin Settings dashboard, but these environment variables are recommended if you want stronger operational control:

- `DC_SESSION_SECRET`
- `OPENAI_API_KEY`
- `AI_WEBHOOK_URL`
- `EMAIL_WEBHOOK_URL`
- `GOOGLE_APPS_SCRIPT_URL`

### Git and deployment hygiene

- `server-data/` is gitignored so local CRM/customer data does not get pushed to GitHub.
- `.netlify/`, build artifacts, logs, and incremental TypeScript files are also ignored.
