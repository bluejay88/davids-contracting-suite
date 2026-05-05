# AI Webhook Contract

Use this if you want to move the AI features off the browser and into your own secure backend.

## Request shape

Every request is a JSON `POST` with this envelope:

```json
{
  "action": "scope-plan",
  "payload": {},
  "context": {
    "company": "David's Contracting",
    "serviceAreaZip": "62526"
  }
}
```

## Supported actions

### `scope-plan`

Purpose:
- Build an AI scope/autofill plan from intake data, speech text, images, current selections, suppliers, and historical jobs.

Expected response:

```json
{
  "projectTitle": "Kitchen floor stabilization + fixture updates",
  "projectSummary": "Short contractor-ready scope summary",
  "suggestedRequestedJobs": "LVP flooring install, subfloor patch, faucet replacement",
  "suggestedEmergencyIssues": "Soft kitchen floor near sink",
  "suggestedNotes": "Extra contractor notes",
  "categories": ["flooring", "handiwork"],
  "taskSuggestions": [
    {
      "taskId": "floor-lvp",
      "quantity": 240,
      "conditionMultiplier": 1.1,
      "complexityMultiplier": 1.08,
      "scopeNote": "Kitchen and breakfast nook",
      "rationale": "Reason for the suggestion"
    }
  ],
  "followUpQuestions": ["Question 1"],
  "riskFlags": ["Risk 1"],
  "similarJobIds": ["job-2026-002"],
  "confidenceNote": "What the AI feels confident about",
  "programs": [],
  "materials": []
}
```

### `aid-programs`

Purpose:
- Research current local/state/federal assistance programs relevant to the homeowner and job type.

Expected response:

```json
[
  {
    "name": "Example Program",
    "provider": "Example Agency",
    "focus": "Roofing or emergency repair",
    "eligibilityHint": "Income-qualified owner-occupants",
    "url": "https://example.org/program",
    "reasoning": "Why this program matches the job",
    "source": "live-search"
  }
]
```

### `material-plan`

Purpose:
- Research local materials and price ranges based on the current quote scope.

Expected response:

```json
[
  {
    "name": "Interior wall paint",
    "taskId": "paint-interior-walls",
    "quantity": 7,
    "unit": "gallon",
    "supplierId": "sherwin-retail",
    "supplierName": "Sherwin-Williams Paint Store",
    "estimatedLow": 245,
    "estimatedHigh": 420,
    "sourceNote": "Local retail search",
    "reasoning": "Why this material is included"
  }
]
```

### `transcribe-audio`

Purpose:
- Convert captured audio into text.

The app sends:
- `mimeType`
- `fileName`
- `audioDataUrl`

Expected response:

```json
{
  "transcript": "Transcribed speech goes here."
}
```

## Recommended backend behavior

- Validate all inbound data
- Strip or resize images before sending them to a model
- Use structured JSON responses
- Store secrets server-side only
- Log failures with action names so troubleshooting is easier
