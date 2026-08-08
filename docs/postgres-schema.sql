-- David's Contracting Suite
-- Scalable relational starter schema for CRM, estimating, AI/AR capture, and operations.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "vector";

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_area_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','estimator','ops','accounting','crew','readonly')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists org_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  company_phone text,
  company_email text,
  default_quote_validity_days integer not null default 14,
  low_markup_pct numeric(8,4) not null default 0.14,
  high_markup_pct numeric(8,4) not null default 0.22,
  tax_pct numeric(8,4) not null default 0.08,
  travel_fee_cents integer not null default 9500,
  default_contingency_pct numeric(8,4) not null default 0.05,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  preferred_contact_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_org_name_idx on contacts (organization_id, last_name, first_name);

create table if not exists contact_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  consent_email boolean not null default false,
  consent_sms boolean not null default false,
  consent_marketing boolean not null default false,
  captured_at timestamptz not null default now(),
  source text not null default 'web'
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  street_1 text not null,
  street_2 text,
  city text not null,
  state text not null,
  zip text not null,
  property_type text,
  year_built integer,
  stories integer,
  occupancy_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  source text not null check (source in ('staff-estimate','public-estimate','phone','referral','website','other')),
  title text,
  requested_jobs text,
  emergency_issues text,
  notes text,
  budget_cents integer,
  status text not null check (status in ('prospecting','negotiating','in_progress','declined','completed')),
  decline_reason text,
  assigned_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_org_status_idx on opportunities (organization_id, status, created_at desc);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  kind text not null check (kind in ('consultation','site_visit','follow_up','job_visit')),
  status text not null check (status in ('requested','confirmed','completed','declined','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  assigned_user_id uuid references users(id),
  priority text not null check (priority in ('low','medium','high')),
  due_at timestamptz not null,
  note text not null,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  current_version_id uuid,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estimate_versions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  version_number integer not null,
  title text not null,
  summary text,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','superseded')),
  total_low_cents integer not null default 0,
  total_high_cents integer not null default 0,
  labor_hours numeric(10,2) not null default 0,
  assumptions jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  ai_confidence_note text,
  generated_at timestamptz not null default now(),
  unique (estimate_id, version_number)
);

create table if not exists estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_version_id uuid not null references estimate_versions(id) on delete cascade,
  task_code text not null,
  trade_category text not null,
  name text not null,
  quantity numeric(12,2) not null default 0,
  unit_label text not null,
  scope_note text,
  condition_multiplier numeric(8,4) not null default 1,
  complexity_multiplier numeric(8,4) not null default 1,
  low_labor_cents integer not null default 0,
  high_labor_cents integer not null default 0,
  low_material_cents integer not null default 0,
  high_material_cents integer not null default 0,
  labor_hours numeric(10,2) not null default 0
);

create table if not exists estimate_material_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_line_item_id uuid not null references estimate_line_items(id) on delete cascade,
  material_name text not null,
  supplier_name text,
  supplier_sku text,
  quantity numeric(12,2) not null default 0,
  unit text not null,
  low_total_cents integer not null default 0,
  high_total_cents integer not null default 0,
  source_note text
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  estimate_version_id uuid references estimate_versions(id),
  status text not null check (status in ('open','partially_paid','paid','void')),
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_cents integer not null,
  method text,
  paid_at timestamptz not null default now(),
  reference_code text
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  uploaded_by uuid references users(id),
  kind text not null check (kind in ('photo','audio','video','pdf','scan','thumbnail','ocr','other')),
  mime_type text not null,
  file_name text not null,
  storage_key text not null,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_org_opp_idx on assets (organization_id, opportunity_id, created_at desc);

create table if not exists scan_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  capture_mode text not null check (capture_mode in ('photo_walk','ar_room_scan','lidar','manual')),
  status text not null default 'captured' check (status in ('captured','processing','processed','failed')),
  confidence_score numeric(5,2),
  created_at timestamptz not null default now()
);

create table if not exists surface_measurements (
  id uuid primary key default gen_random_uuid(),
  scan_session_id uuid not null references scan_sessions(id) on delete cascade,
  room_name text,
  surface_type text not null,
  quantity numeric(12,2) not null,
  unit text not null,
  confidence_score numeric(5,2),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  estimate_version_id uuid references estimate_versions(id) on delete cascade,
  job_type text not null check (job_type in ('scope_plan','aid_programs','material_plan','audio_transcription','scan_analysis','vision_annotation')),
  provider text not null,
  model text,
  status text not null check (status in ('queued','running','completed','failed')),
  prompt_hash text,
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  ai_job_id uuid not null references ai_jobs(id) on delete cascade,
  artifact_type text not null,
  confidence_note text,
  citations jsonb not null default '[]'::jsonb,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  actor_user_id uuid references users(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists activity_events_org_type_idx on activity_events (organization_id, event_type, occurred_at desc);

create table if not exists legacy_id_map (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'json-app-state',
  legacy_type text not null,
  legacy_id text not null,
  new_table_name text not null,
  new_record_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_system, legacy_type, legacy_id)
);
