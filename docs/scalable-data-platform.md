# Scalable Data Platform Blueprint

## Current limitation

The current application persists most business state as one large document and rewrites that document on save and update paths. That is fast to prototype, but it becomes brittle once the business has:

- multiple users
- many quotes per client
- real revision history
- large media uploads
- AI artifacts with provenance
- invoices, payments, and activity trails

## Target operational stack

- `PostgreSQL` as the source of truth for CRM, opportunities, scheduling, estimating, job execution, and finance
- `PostGIS` for service areas, route geometry, and property-level spatial workflows
- `S3-compatible object storage` for photos, audio, PDFs, AR/scan bundles, OCR sidecars, and thumbnails
- `pgvector` for semantic retrieval across historical jobs, transcripts, OCR text, and AI summaries
- `queue workers` for async AI, OCR, transcription, scan processing, and outbound integration jobs
- `analytics warehouse` for immutable business events and long-horizon owner reporting

## Core domain split

### CRM domain

- organizations
- users
- memberships
- contacts
- properties
- opportunities
- contact consents
- communications
- follow-up tasks

### Scheduling + operations domain

- appointments
- availability rules
- blackout dates
- crew assignments
- work orders
- route windows

### Estimating domain

- estimate requests
- estimates
- estimate versions
- estimate line items
- estimate material lines
- estimate outputs
- payment milestones

### Delivery + finance domain

- projects
- invoices
- invoice line items
- payments
- payment allocations
- change orders

### Media + AI domain

- assets
- asset links
- transcripts
- annotations
- scan sessions
- scan rooms
- measurements
- ai jobs
- ai artifacts
- ai citations

## Recommended lifecycle

1. A public visitor or staff member creates an `opportunity`.
2. The system links that opportunity to a `contact` and `property`.
3. Capture artifacts flow into `assets`, `scan_sessions`, and `transcripts`.
4. AI runs create `ai_jobs` and `ai_artifacts` tied to the opportunity or estimate version.
5. Estimates become append-only `estimate_versions`.
6. Won work converts to a `project`, then to `invoices` and `payments`.
7. Every meaningful change emits an immutable `activity_event`.

## Multi-tenant guidance

- shared database, tenant-scoped tables
- row-level security keyed by `organization_id`
- role-based membership model: owner, admin, estimator, ops, accounting, crew, readonly
- secrets kept outside app settings
- signed, short-lived URLs for media access
- explicit retention policy for audio, photos, and scans

## Migration path from the current app

1. Add schema versioning to persisted state and define SQL ids plus legacy id mapping.
2. Import the current JSON/blob state into normalized SQL tables.
3. Build a compatibility layer that can still hydrate the current frontend shape from SQL.
4. Dual-write quote saves and record updates while validating parity.
5. Move reporting, search, and reminders to SQL-backed projections.
6. Retire whole-document persistence after reconciliation.

## Immediate engineering priorities

- move away from whole-object mutation contracts
- add append-only quote revisions
- add a first-class appointment model
- add asset records instead of filename-only documentation
- add AI artifact records with provider, model, citations, and confidence
- add immutable business events for analytics
