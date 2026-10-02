# Skema Database — PropDesk AI

| Field | Isi |
|---|---|
| Versi | 1.0 |
| Tanggal | 2 Oktober 2026 |
| Target | PostgreSQL 16+ dengan Prisma ORM |
| Dokumen terkait | `docs/PRD-PropDesk-AI.md` |

---

## 0. Konvensi

1. **Kunci primer:** `uuid` (v7 bila tersedia, agar urut waktu dan ramah index). Semua foreign key bertipe `uuid`.
2. **Waktu:** semua kolom waktu `timestamptz`, disimpan UTC, ditampilkan dalam timezone klien. `created_at` wajib ada di semua tabel; `updated_at` pada tabel yang dapat berubah.
3. **Uang & biaya:** `numeric(12,6)`, bukan floating point.
4. **Penghapusan lunak:** `deleted_at timestamptz null` untuk entitas bernilai audit (client, carousel, post, knowledge, template, social account). Hard delete hanya untuk tabel sementara seperti `office_presence` dan `job_dead_letters`.
5. **Tenant:** semua tabel operasional memiliki `org_id`; semua tabel konten memiliki `client_id`. Setiap query aplikasi wajib difilter tenant melalui helper terpusat; dilarang query mentah tanpa filter tenant.
6. **JSONB:** dipakai untuk data spesifikasi yang skemanya dikelola aplikasi (slide spec, brand token, schema template, payload mentah). Setiap JSONB wajib divalidasi schema di application layer.
7. **Riwayat versi** disimpan eksplisit dan tidak pernah ditimpa: `template_versions`, `carousel_versions`, `brand_kit_versions`.
8. **Enum** diimplementasikan sebagai tabel referensi untuk nilai yang berpengaruh pada perilaku (`compliance_rules`, `disclaimers`), dan sebagai tipe enum native untuk nilai taksonomi yang stabil (status, role). Lampiran A PRD memuat daftar nilai.
9. **Index:** setiap foreign key punya index. Kolom pencarian/filter (`status`, `scheduled_at`, `org_id+client_id`) punya index komposit sesuai pola query aktual.
10. **Penamaan:** tabel `snake_case` jamak, kolom `snake_case` tunggal, index `idx_<tabel>_<kolom>`, unique `uq_<tabel>_<kolom>`.

---

## 1. Diagram Relasi (ringkas)

```
orgs ──┬── users ── memberships
       ├── clients ──┬── brand_kits ── brand_assets
       │             ├── content_plans ── plan_items
       │             ├── briefs ── carousels ──┬── slides
       │             │                        ├── carousel_versions
       │             │                        ├── captions
       │             │                        ├── compliance_checks
       │             │                        └── carousel_assets ── assets
       │             ├── posts ──┬── post_variants ── publish_attempts
       │             │           └── metrics_snapshots
       │             ├── knowledge_items
       │             ├── social_accounts
       │             ├── disclaimers
       │             └── cost_ledger
       ├── categories ── templates ── template_versions
       ├── agent_definitions
       ├── pipeline_runs ── pipeline_steps ── agent_runs ── agent_messages
       ├── render_jobs
       ├── compliance_rules ── compliance_checks
       ├── approvals ── approval_comments
       ├── kpi_daily · agent_performance_daily
       ├── integrations · notifications · audit_logs · job_dead_letters
       └── office_layouts · office_presence
```

---

## 2. DDL Lengkap

### 2.1 Ekstensi

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- pencarian teks pada caption & knowledge
```

### 2.2 Tenancy & Identitas

```sql
CREATE TYPE membership_role AS ENUM ('owner','admin','editor','reviewer','viewer','client_viewer');

CREATE TABLE orgs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  plan            text NOT NULL DEFAULT 'internal',
  locale          text NOT NULL DEFAULT 'id-ID',
  timezone        text NOT NULL DEFAULT 'Asia/Jakarta',
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider   text NOT NULL,                -- 'clerk' | 'nextauth' | 'local'
  auth_subject    text NOT NULL,                -- id dari provider
  email           text NOT NULL,
  display_name    text NOT NULL,
  avatar_url      text,
  locale          text NOT NULL DEFAULT 'id-ID',
  timezone        text NOT NULL DEFAULT 'Asia/Jakarta',
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_auth UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            membership_role NOT NULL DEFAULT 'viewer',
  -- pembatasan akses ke klien tertentu; NULL artinya semua klien dalam org
  client_scope    uuid[],
  is_active       boolean NOT NULL DEFAULT true,
  invited_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_memberships UNIQUE (org_id, user_id)
);
CREATE INDEX idx_memberships_user ON memberships(user_id) WHERE is_active;

-- Token akses program; hanya hash yang disimpan
CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label           text NOT NULL,
  key_prefix      text NOT NULL,                -- tampil di UI, mis. 'pd_live_a1b2'
  key_hash        text NOT NULL,                -- argon2/bcrypt hash; TIDAK pernah plaintext
  scopes          text[] NOT NULL DEFAULT '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_api_keys_hash UNIQUE (key_hash)
);
CREATE INDEX idx_api_keys_org ON api_keys(org_id) WHERE revoked_at IS NULL;
```

### 2.3 Brand & Taksonomi

```sql
-- kategori konten (seed awal: 5 kategori PRD)
CREATE TABLE categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key             text NOT NULL,                -- 'edukasi_trading', 'edukasi_propfirm', dst
  name            text NOT NULL,
  description     text,
  risk_level      text NOT NULL DEFAULT 'low',  -- 'low'|'medium'|'high'
  requires_sources boolean NOT NULL DEFAULT false, -- wajib source_ref untuk klaim angka
  requires_as_of  boolean NOT NULL DEFAULT false,  -- wajib timestamp untuk konten berita
  allows_bulk_approve boolean NOT NULL DEFAULT true, -- false untuk outlook/signal
  default_frequency_per_week integer NOT NULL DEFAULT 1,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_key UNIQUE (org_id, key)
);
CREATE INDEX idx_categories_org_active ON categories(org_id) WHERE active;

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  locale          text NOT NULL DEFAULT 'id-ID',
  timezone        text NOT NULL DEFAULT 'Asia/Jakarta',
  tone_of_voice   text,
  target_audience text,
  approver_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- kategori yang diaktifkan untuk klien ini
  active_category_ids uuid[],
  min_gap_hours_between_posts integer NOT NULL DEFAULT 6,
  monthly_cost_limit numeric(12,6),
  cost_alert_threshold_pct integer NOT NULL DEFAULT 80,
  is_affiliate_disclosed boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active', -- 'active'|'paused'|'archived'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_clients_slug UNIQUE (org_id, slug)
);
CREATE INDEX idx_clients_org ON clients(org_id) WHERE deleted_at IS NULL;

-- Brand kit dengan versi eksplisit; token visual hidup di brand_kits, riwayat di brand_kit_versions
CREATE TABLE brand_kits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  tokens          jsonb NOT NULL,   -- {colors:{...}, fonts:{...}, spacing:{...}, radius:{...}}
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_brand_kits_name UNIQUE (client_id, name)
);
CREATE INDEX idx_brand_kits_client ON brand_kits(client_id) WHERE is_active AND deleted_at IS NULL;

CREATE TABLE brand_kit_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  brand_kit_id    uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  tokens          jsonb NOT NULL,
  change_note     text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_brand_kit_versions UNIQUE (brand_kit_id, version)
);

CREATE TABLE brand_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  brand_kit_id    uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  kind            text NOT NULL,   -- 'logo'|'font'|'icon'|'pattern'|'photo'
  label           text NOT NULL,
  file_asset_id   uuid,            -- FK ke assets, ditambahkan setelah assets dibuat
  font_family     text,
  license_note    text,            -- WAJIB untuk font: lisensi harus dicatat
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_brand_assets_kit ON brand_assets(brand_kit_id) WHERE deleted_at IS NULL;

CREATE TABLE disclaimers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE, -- NULL = berlaku semua klien org
  key             text NOT NULL,
  category_key    text,            -- NULL = semua kategori
  platform        text,            -- NULL = semua platform
  locale          text NOT NULL DEFAULT 'id-ID',
  text            text NOT NULL,
  is_mandatory    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_disclaimers_key UNIQUE (org_id, client_id, key, locale)
);
```

### 2.4 Template

```sql
CREATE TABLE templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  name            text NOT NULL,
  description     text,
  category_key    text,                    -- template utama untuk kategori mana
  supported_roles text[] NOT NULL DEFAULT '{}', -- role slide yang cocok: {hook,body,...}
  supported_ratios text[] NOT NULL DEFAULT '{ig_portrait}',
  current_version integer NOT NULL DEFAULT 1,
  is_system       boolean NOT NULL DEFAULT false, -- template bawaan platform
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_templates_slug UNIQUE (org_id, slug)
);
CREATE INDEX idx_templates_category ON templates(org_id, category_key) WHERE is_active AND deleted_at IS NULL;

CREATE TABLE template_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  html            text NOT NULL,           -- berisi slot {{headline}} dll; TIDAK menerima HTML dari LLM
  css             text NOT NULL,
  schema_json     jsonb NOT NULL,          -- deklarasi slot: wajib/opsional, max_len, varian
  thumbnail_asset_id uuid,
  changelog       text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_template_versions UNIQUE (template_id, version)
);
CREATE INDEX idx_template_versions_template ON template_versions(template_id, version DESC);
```

### 2.5 Perencanaan & Brief

```sql
CREATE TABLE content_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'draft', -- 'draft'|'active'|'archived'
  strategy_note   text,                     -- ringkasan dari Strategist Agent
  generated_by_run uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_content_plans_period CHECK (period_end >= period_start)
);
CREATE INDEX idx_content_plans_client ON content_plans(client_id, period_start DESC);

CREATE TABLE plan_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  content_plan_id uuid NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  planned_date    date NOT NULL,
  category_key    text NOT NULL,
  angle           text,
  objective       text,                     -- 'save'|'reach'|'trust'|'educate'
  priority        integer NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'planned', -- 'planned'|'briefed'|'done'|'skipped'
  brief_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_items_plan ON plan_items(content_plan_id, planned_date);
CREATE INDEX idx_plan_items_date ON plan_items(org_id, planned_date);

CREATE TABLE briefs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_item_id    uuid REFERENCES plan_items(id) ON DELETE SET NULL,
  category_key    text NOT NULL,
  title           text NOT NULL,
  angle           text NOT NULL,
  key_messages    text[] NOT NULL DEFAULT '{}',
  target_audience text,
  objective       text,
  slide_count_target integer NOT NULL DEFAULT 8,
  toc_format      text NOT NULL DEFAULT 'image_carousel',
  language        text NOT NULL DEFAULT 'id-ID',
  sources_hint    text[],
  status          text NOT NULL DEFAULT 'draft', -- 'draft'|'approved'|'converted'|'cancelled'
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_briefs_client_status ON briefs(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_briefs_category ON briefs(org_id, category_key);
```

### 2.6 Produksi Carousel

```sql
CREATE TABLE carousels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brief_id        uuid REFERENCES briefs(id) ON DELETE SET NULL,
  category_key    text NOT NULL,
  title           text NOT NULL,
  slug            text NOT NULL,
  status          text NOT NULL DEFAULT 'briefed',
  -- status: briefed|researching|drafting|designing|rendering|needs_review|
  --         changes_requested|approved|scheduled|published|failed|archived
  current_version integer NOT NULL DEFAULT 1,
  brand_kit_id    uuid REFERENCES brand_kits(id) ON DELETE SET NULL,
  template_slug   text,
  as_of           timestamptz,              -- timestamp data untuk konten berita
  risk_level      text NOT NULL DEFAULT 'low',
  compliance_state text NOT NULL DEFAULT 'pending', -- 'pending'|'pass'|'warn'|'fail'
  assigned_agent  text,                     -- agen yang sedang memegang
  sla_due_at      timestamptz,
  approved_at     timestamptz,
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_carousels_slug UNIQUE (org_id, slug)
);
CREATE INDEX idx_carousels_client_status ON carousels(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_carousels_org_status ON carousels(org_id, status, updated_at DESC);
CREATE INDEX idx_carousels_review ON carousels(org_id, sla_due_at) WHERE status = 'needs_review';

-- Sumber kebenaran isi carousel. Satu baris per slide, JSONB untuk data visual.
CREATE TABLE slides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  position        integer NOT NULL,
  role            text NOT NULL,   -- hook|body|example|checklist|recap|cta|disclaimer
  template_key    text,
  headline        text,
  body            text,
  bullets         text[] NOT NULL DEFAULT '{}',
  emphasis        text[] NOT NULL DEFAULT '{}',
  visual_spec     jsonb NOT NULL DEFAULT '{"type":"none"}'::jsonb,
  -- visual_spec: {type: none|abstract_bg|chart_snapshot|table|stat_tile, ...detail}
  source_refs     text[] NOT NULL DEFAULT '{}', -- menunjuk fact_sheet entry
  word_count      integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_slides_position UNIQUE (carousel_id, position),
  CONSTRAINT ck_slides_position CHECK (position >= 1)
);
CREATE INDEX idx_slides_carousel ON slides(carousel_id, position);

-- Snapshot lengkap carousel per versi; dipakai untuk membuktikan apa yang disetujui
CREATE TABLE carousel_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  slide_spec      jsonb NOT NULL,          -- snapshot seluruh slides
  caption_set     jsonb,                   -- snapshot caption saat versi ini dibuat
  brand_kit_version integer,
  template_versions jsonb,                 -- {slug: version}
  content_hash    text NOT NULL,           -- hash kanonik; dipakai deteksi perubahan setelah approval
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_carousel_versions UNIQUE (carousel_id, version)
);
CREATE INDEX idx_carousel_versions_hash ON carousel_versions(carousel_id, content_hash);

CREATE TABLE captions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  variant_index   integer NOT NULL DEFAULT 1,
  hook            text,
  body            text NOT NULL,
  hashtags        text[] NOT NULL DEFAULT '{}',
  cta             text,
  char_count      integer,
  is_selected     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_captions_variant UNIQUE (carousel_id, platform, variant_index)
);
CREATE INDEX idx_captions_carousel ON captions(carousel_id, platform);
CREATE INDEX idx_captions_body_trgm ON captions USING gin (body gin_trgm_ops);
```

### 2.7 Agen & Orkestrasi

```sql
CREATE TABLE agent_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES orgs(id) ON DELETE CASCADE, -- NULL = definisi sistem global
  key             text NOT NULL,       -- 'strategist','research','copywriter','composer',
                                       -- 'renderer','compliance','brand_guardian','scheduler','analyst'
  name            text NOT NULL,
  description     text,
  zone            text NOT NULL,       -- office_zone
  model_class     text NOT NULL DEFAULT 'medium', -- 'low'|'medium'|'high'|'none'
  system_prompt   text,
  prompt_version  integer NOT NULL DEFAULT 1,
  input_schema    jsonb,
  output_schema   jsonb,
  allowed_tools   text[] NOT NULL DEFAULT '{}',
  max_tokens_per_run integer,
  max_cost_per_run numeric(12,6),
  max_retries     integer NOT NULL DEFAULT 2,
  is_blocking     boolean NOT NULL DEFAULT false, -- true untuk compliance & brand guardian
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_definitions UNIQUE (org_id, key, prompt_version)
);
CREATE INDEX idx_agent_definitions_key ON agent_definitions(key) WHERE is_active;

-- Satu eksekusi pipeline untuk satu carousel (atau satu job terjadwal)
CREATE TABLE pipeline_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid REFERENCES carousels(id) ON DELETE CASCADE,
  trigger_type    text NOT NULL,       -- 'manual'|'scheduled'|'retry'|'api'
  triggered_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|blocked|cancelled
  current_step    text,
  total_cost      numeric(12,6) NOT NULL DEFAULT 0,
  total_tokens    integer NOT NULL DEFAULT 0,
  started_at      timestamptz,
  finished_at     timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_runs_carousel ON pipeline_runs(carousel_id, created_at DESC);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(org_id, status) WHERE status IN ('queued','running','blocked');

CREATE TABLE pipeline_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  pipeline_run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_key        text NOT NULL,       -- 'research','write','compose','render','compliance',...
  sequence        integer NOT NULL,
  agent_key       text,
  status          text NOT NULL DEFAULT 'pending', -- pending|running|succeeded|failed|skipped|blocked
  attempt         integer NOT NULL DEFAULT 1,
  input_ref       jsonb,
  output_ref      jsonb,
  duration_ms     integer,
  cost            numeric(12,6) NOT NULL DEFAULT 0,
  error_message   text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pipeline_steps_seq UNIQUE (pipeline_run_id, sequence)
);
CREATE INDEX idx_pipeline_steps_run ON pipeline_steps(pipeline_run_id, sequence);

CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_key       text NOT NULL,
  agent_definition_id uuid REFERENCES agent_definitions(id) ON DELETE SET NULL,
  pipeline_step_id uuid REFERENCES pipeline_steps(id) ON DELETE CASCADE,
  carousel_id     uuid REFERENCES carousels(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|awaiting_human|cancelled
  model_name      text,
  prompt_version  integer,
  input_summary   text,                -- ringkas, TANPA rahasia
  input_hash      text,                -- untuk cache & idempotensi
  output_json     jsonb,
  output_text     text,
  validation_state text,               -- 'valid'|'repaired'|'invalid'
  repair_attempts integer NOT NULL DEFAULT 0,
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  cost            numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms      integer,
  cache_hit       boolean NOT NULL DEFAULT false,
  error_code      text,
  error_message   text,
  escalated_to    uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Kantor Virtual membaca dari sini; index dibuat untuk pola query board
CREATE INDEX idx_agent_runs_status ON agent_runs(org_id, status, created_at DESC);
CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_key, created_at DESC);
CREATE INDEX idx_agent_runs_carousel ON agent_runs(carousel_id, created_at DESC);
CREATE INDEX idx_agent_runs_cache ON agent_runs(agent_key, input_hash) WHERE status = 'succeeded';
CREATE INDEX idx_agent_runs_human ON agent_runs(org_id, created_at DESC) WHERE status = 'awaiting_human';

CREATE TABLE agent_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_run_id    uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence        integer NOT NULL,
  role            text NOT NULL,        -- 'system'|'user'|'assistant'|'tool'
  content         text,
  tool_name       text,
  tool_payload    jsonb,
  redacted        boolean NOT NULL DEFAULT false, -- true bila isi mengandung data sensitif yang diganti
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_messages_seq UNIQUE (agent_run_id, sequence)
);
CREATE INDEX idx_agent_messages_run ON agent_messages(agent_run_id, sequence);
```

### 2.8 Render & Aset

```sql
CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  kind            text NOT NULL,   -- slide_png|carousel_pdf|zip|chart_snapshot|logo|font|texture|upload
  source          text NOT NULL DEFAULT 'rendered', -- rendered|ai_generated|uploaded|licenced
  storage_key     text NOT NULL,
  mime_type       text NOT NULL,
  byte_size       bigint NOT NULL,
  width           integer,
  height          integer,
  checksum        text NOT NULL,
  ai_prompt       text,            -- hanya untuk source='ai_generated'; audit penggunaan AI
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_assets_storage UNIQUE (storage_key)
);
CREATE INDEX idx_assets_org_kind ON assets(org_id, kind, created_at DESC);
CREATE INDEX idx_assets_client ON assets(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_checksum ON assets(checksum); -- deteksi duplikat aset

ALTER TABLE brand_assets
  ADD CONSTRAINT fk_brand_assets_file FOREIGN KEY (file_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE template_versions
  ADD CONSTRAINT fk_template_versions_thumb FOREIGN KEY (thumbnail_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

CREATE TABLE render_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  carousel_version integer,
  ratio_profile   text NOT NULL,   -- ig_portrait|square|story|linkedin_pdf|pinterest
  scope           text NOT NULL DEFAULT 'full', -- 'full'|'single_slide'
  slide_positions integer[],        -- terisi bila scope='single_slide'
  status          text NOT NULL DEFAULT 'queued', -- queued|rendering|succeeded|failed
  attempt         integer NOT NULL DEFAULT 1,
  duration_ms     integer,
  overflow_slides integer[],        -- posisi slide yang teksnya meluap (penyebab kegagalan)
  error_message   text,
  worker_id       text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_render_jobs_carousel ON render_jobs(carousel_id, created_at DESC);
CREATE INDEX idx_render_jobs_queue ON render_jobs(status, created_at) WHERE status IN ('queued','rendering');

CREATE TABLE carousel_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  render_job_id   uuid REFERENCES render_jobs(id) ON DELETE SET NULL,
  asset_id        uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  slide_position  integer,          -- NULL untuk PDF/ZIP
  ratio_profile   text NOT NULL,
  is_current      boolean NOT NULL DEFAULT true, -- false bila sudah digantikan render lebih baru
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_carousel_assets_current ON carousel_assets(carousel_id, ratio_profile) WHERE is_current;
CREATE INDEX idx_carousel_assets_asset ON carousel_assets(asset_id);

-- Fakta pasar/berita yang dipakai konten berita & outlook; sumber kebenaran klaim angka
CREATE TABLE market_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid REFERENCES carousels(id) ON DELETE CASCADE,
  symbol          text,
  event_type      text,             -- 'price'|'news'|'economic_calendar'|'sentiment'
  headline        text NOT NULL,
  data            jsonb NOT NULL,
  source_name     text NOT NULL,
  source_url      text,
  as_of           timestamptz NOT NULL,
  confidence      text NOT NULL DEFAULT 'medium', -- 'low'|'medium'|'high'
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_snapshots_carousel ON market_snapshots(carousel_id, as_of DESC);
CREATE INDEX idx_market_snapshots_symbol ON market_snapshots(symbol, as_of DESC);
```

### 2.9 Kepatuhan & Persetujuan

```sql
CREATE TABLE compliance_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES orgs(id) ON DELETE CASCADE, -- NULL = aturan sistem global
  key             text NOT NULL,
  name            text NOT NULL,
  description     text,
  layer           text NOT NULL,   -- 'L1_structure'|'L2_banned_phrase'|'L3_claim_source'|'L4_framing'|'L5_brand'
  severity        text NOT NULL DEFAULT 'block', -- 'block'|'warn'|'info'
  -- Tipe pemeriksaan: pattern_present|pattern_absent|regex_forbidden|max_words|min_slides|
  --                   require_source|contrast_check|font_check|llm_assess
  check_type      text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  applies_to_categories text[],
  applies_to_platforms  text[],
  locale          text NOT NULL DEFAULT 'id-ID',
  is_active       boolean NOT NULL DEFAULT true,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_compliance_rules UNIQUE (org_id, key, version)
);
CREATE INDEX idx_compliance_rules_active ON compliance_rules(layer, severity) WHERE is_active;

CREATE TABLE compliance_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  carousel_version integer,
  rule_id         uuid REFERENCES compliance_rules(id) ON DELETE SET NULL,
  subject_type    text NOT NULL DEFAULT 'carousel', -- 'carousel'|'slide'|'caption'|'asset'
  subject_ref     text,             -- mis. 'slide:4' atau 'caption:instagram:1'
  result          text NOT NULL,    -- 'pass'|'fail'|'warn'|'skipped'
  severity        text NOT NULL,
  evidence        text,             -- kutipan teks yang memicu temuan
  matched_text    text,
  suggestion      text,             -- saran perbaikan untuk manusia/agen
  decided_by      text NOT NULL DEFAULT 'rule_engine', -- 'rule_engine'|'llm'|'human'
  overridden_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  override_reason text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_checks_carousel ON compliance_checks(carousel_id, carousel_version, result);
CREATE INDEX idx_compliance_checks_fail ON compliance_checks(org_id, created_at DESC) WHERE result = 'fail';
-- Kunci idempotensi agar pemeriksaan yang sama tidak disimpan berkali-kali
CREATE UNIQUE INDEX uq_compliance_checks_dedupe
  ON compliance_checks(carousel_id, carousel_version, rule_id, subject_type, coalesce(subject_ref,''));

CREATE TABLE approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  subject_type    text NOT NULL,   -- 'carousel'|'post'|'brief'
  subject_id      uuid NOT NULL,
  carousel_version integer,
  subject_hash    text,            -- hash isi yang disetujui
  status          text NOT NULL DEFAULT 'pending',
  -- pending|approved|rejected|changes_requested|expired
  requested_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  acted_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  acted_at        timestamptz,
  reason          text,
  due_at          timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_pending ON approvals(org_id, requested_at) WHERE status = 'pending';
CREATE INDEX idx_approvals_subject ON approvals(subject_type, subject_id, created_at DESC);

CREATE TABLE approval_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  approval_id     uuid NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  slide_position  integer,          -- komentar menempel pada slide; NULL = umum
  body            text NOT NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_comments_approval ON approval_comments(approval_id, created_at);
```

### 2.10 Distribusi & Metrik

```sql
CREATE TABLE social_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  account_handle  text NOT NULL,
  account_ref     text,             -- id akun di platform
  access_token_encrypted  bytea,    -- disimpan terenkripsi; kunci di KMS/env
  refresh_token_encrypted bytea,
  token_expires_at timestamptz,
  scopes          text[],
  health_status   text NOT NULL DEFAULT 'unknown', -- 'healthy'|'degraded'|'expired'|'revoked'|'unknown'
  last_checked_at timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  connected_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_social_accounts UNIQUE (client_id, platform, account_handle)
);
CREATE INDEX idx_social_accounts_health ON social_accounts(org_id, health_status) WHERE is_active;

CREATE TABLE posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  carousel_id     uuid NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  carousel_version integer NOT NULL,
  title           text,
  status          text NOT NULL DEFAULT 'draft',
  -- draft|needs_review|approved|scheduled|queued|publishing|published|partially_failed|failed|cancelled
  publish_mode    text NOT NULL DEFAULT 'manual_export', -- 'manual_export'|'auto'
  scheduled_at    timestamptz,
  timezone        text NOT NULL DEFAULT 'Asia/Jakarta',
  published_at    timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_posts_client_status ON posts(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_schedule ON posts(scheduled_at) WHERE status IN ('scheduled','queued');

CREATE TABLE post_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  post_id         uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform        text NOT NULL,
  caption_id      uuid REFERENCES captions(id) ON DELETE SET NULL,
  caption_override text,
  hashtags        text[] NOT NULL DEFAULT '{}',
  asset_ids       uuid[] NOT NULL DEFAULT '{}', -- urutan slide yang diunggah
  ratio_profile   text NOT NULL DEFAULT 'ig_portrait',
  external_post_id text,
  external_url    text,
  status          text NOT NULL DEFAULT 'pending', -- pending|uploaded|published|failed
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_post_variants UNIQUE (post_id, platform, social_account_id)
);
CREATE INDEX idx_post_variants_status ON post_variants(post_id, status);

CREATE TABLE publish_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  post_variant_id uuid NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
  attempt         integer NOT NULL DEFAULT 1,
  status          text NOT NULL,   -- 'succeeded'|'failed'|'rate_limited'
  http_status     integer,
  error_code      text,
  error_message   text,
  request_id      text,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_publish_attempts_variant ON publish_attempts(post_variant_id, attempt DESC);

CREATE TABLE metrics_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  post_variant_id uuid NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  age_hours       integer NOT NULL,  -- usia post saat snapshot diambil (24h/72h/7d) → metrik sebanding
  impressions     integer NOT NULL DEFAULT 0,
  reach           integer NOT NULL DEFAULT 0,
  likes           integer NOT NULL DEFAULT 0,
  comments        integer NOT NULL DEFAULT 0,
  shares          integer NOT NULL DEFAULT 0,
  saves           integer NOT NULL DEFAULT 0,
  follows_gained  integer NOT NULL DEFAULT 0,
  profile_visits  integer NOT NULL DEFAULT 0,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_metrics_snapshot UNIQUE (post_variant_id, age_hours)
);
CREATE INDEX idx_metrics_snapshots_client ON metrics_snapshots(client_id, captured_at DESC);

-- Agregat harian untuk dashboard (dihitung ulang oleh job, bukan sumber kebenaran)
CREATE TABLE kpi_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date            date NOT NULL,
  posts_published integer NOT NULL DEFAULT 0,
  carousels_created integer NOT NULL DEFAULT 0,
  avg_review_minutes numeric(8,2),
  compliance_first_pass_rate numeric(5,4),
  autonomy_rate   numeric(5,4),
  human_override_rate numeric(5,4),
  total_cost      numeric(12,6) NOT NULL DEFAULT 0,
  avg_save_rate   numeric(8,6),
  avg_engagement_rate numeric(8,6),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_kpi_daily UNIQUE (client_id, date)
);
CREATE INDEX idx_kpi_daily_org_date ON kpi_daily(org_id, date DESC);

CREATE TABLE agent_performance_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_key       text NOT NULL,
  date            date NOT NULL,
  runs            integer NOT NULL DEFAULT 0,
  successes       integer NOT NULL DEFAULT 0,
  failures        integer NOT NULL DEFAULT 0,
  schema_repairs  integer NOT NULL DEFAULT 0,
  escalated       integer NOT NULL DEFAULT 0,
  cache_hits      integer NOT NULL DEFAULT 0,
  avg_latency_ms  integer,
  total_cost      numeric(12,6) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_perf UNIQUE (org_id, agent_key, date)
);
CREATE INDEX idx_agent_perf_date ON agent_performance_daily(org_id, date DESC);

CREATE TABLE cost_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  carousel_id     uuid REFERENCES carousels(id) ON DELETE SET NULL,
  agent_run_id    uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  category        text NOT NULL,   -- 'llm'|'render'|'storage'|'api'
  provider        text,
  model_name      text,
  units           numeric(12,4),   -- token atau jumlah render
  unit_cost       numeric(12,8),
  amount          numeric(12,6) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_ledger_org_time ON cost_ledger(org_id, occurred_at DESC);
CREATE INDEX idx_cost_ledger_carousel ON cost_ledger(carousel_id);
CREATE INDEX idx_cost_ledger_client_month ON cost_ledger(client_id, occurred_at);
```

### 2.11 Knowledge Base

```sql
CREATE TABLE knowledge_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE, -- NULL = seluruh org
  kind            text NOT NULL,
  -- 'hook_bank'|'lexicon'|'banned_phrase'|'glossary'|'winning_template'|'competitor_note'|'post_mortem'
  category_key    text,
  title           text NOT NULL,
  content         text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  -- embedding hanya bila ekstensi pgvector diaktifkan. Baris ini bergantung pada
  -- pgvector; tanpa ekstensi tersebut, hapus kolom ini dan gunakan pencarian
  -- teks berbasis trigram (sudah tersedia di bawah).
  embedding       vector(1536),
  usage_count     integer NOT NULL DEFAULT 0,
  performance_score numeric(8,4),
  status          text NOT NULL DEFAULT 'active', -- 'draft'|'proposed'|'active'|'retired'
  source          text NOT NULL DEFAULT 'human',  -- 'human'|'agent'|'imported', 'agent' butuh konfirmasi
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_knowledge_kind ON knowledge_items(org_id, kind, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_knowledge_client ON knowledge_items(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_knowledge_content_trgm ON knowledge_items USING gin (content gin_trgm_ops);
CREATE INDEX idx_knowledge_tags ON knowledge_items USING gin (tags);
-- Bila pgvector diaktifkan:
-- CREATE INDEX idx_knowledge_embedding ON knowledge_items USING hnsw (embedding vector_cosine_ops);
```

### 2.12 Integrasi, Notifikasi, Audit

```sql
CREATE TABLE integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider        text NOT NULL,   -- 'rss','news_api','economic_calendar','llm','storage','analytics'
  label           text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb, -- tanpa rahasia
  secret_ref      text,            -- referensi ke secret manager, bukan nilai rahasia
  status          text NOT NULL DEFAULT 'disconnected', -- 'connected'|'error'|'disconnected'
  last_check_at   timestamptz,
  last_error      text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_integrations UNIQUE (org_id, provider, label)
);

CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL,   -- 'review_pending'|'approved'|'rejected'|'render_failed'|
                                   -- 'publish_failed'|'budget_warning'|'market_event'|'digest'
  severity        text NOT NULL DEFAULT 'info',
  title           text NOT NULL,
  body            text,
  link_path       text,
  subject_type    text,
  subject_id      uuid,
  read_at         timestamptz,
  delivered_email_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES orgs(id) ON DELETE CASCADE,
  actor_type      text NOT NULL,   -- 'user'|'system'|'agent'
  actor_id        uuid,
  actor_label     text,            -- untuk agen/system yang tidak punya user id
  action          text NOT NULL,   -- 'carousel.status_changed','approval.approved','template.updated',...
  subject_type    text NOT NULL,
  subject_id      uuid,
  before_value    jsonb,
  after_value     jsonb,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_org_time ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_subject ON audit_logs(subject_type, subject_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id, created_at DESC);

CREATE TABLE job_dead_letters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES orgs(id) ON DELETE CASCADE,
  job_type        text NOT NULL,
  queue_name      text NOT NULL,
  payload         jsonb NOT NULL,
  attempts        integer NOT NULL,
  last_error      text,
  failed_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_dead_letters_open ON job_dead_letters(failed_at DESC) WHERE resolved_at IS NULL;
```

### 2.13 Virtual Agent Office

```sql
CREATE TABLE office_layouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  theme           text NOT NULL DEFAULT 'iso_flat', -- 'iso_flat'|'iso_pixel'
  tilemap         jsonb NOT NULL,   -- definisi grid, sprite, dekorasi
  agent_positions jsonb NOT NULL,   -- {agent_key: {x, y, zone, sprite}}
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_office_layouts_active ON office_layouts(org_id) WHERE is_active;

-- Tabel sementara untuk kehadiran/animasi; boleh dihapus (tidak bernilai audit)
CREATE TABLE office_presence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_key       text NOT NULL,
  zone            text NOT NULL,
  position_x      numeric(8,2) NOT NULL,
  position_y      numeric(8,2) NOT NULL,
  facing          text NOT NULL DEFAULT 'south',
  state           text NOT NULL DEFAULT 'idle',
  speech_bubble   text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_office_presence_org ON office_presence(org_id, agent_key);
```

---

## 3. View & Materialized View

```sql
-- Antrean review: sumber data Command Center & Approvals Inbox
CREATE VIEW v_review_queue AS
SELECT
  c.id AS carousel_id, c.org_id, c.client_id, cl.name AS client_name,
  c.category_key, c.title, c.risk_level, c.compliance_state,
  c.sla_due_at, c.updated_at,
  (SELECT count(*) FROM slides s WHERE s.carousel_id = c.id) AS slide_count,
  (SELECT count(*) FROM compliance_checks cc
     WHERE cc.carousel_id = c.id AND cc.result = 'fail') AS blocking_findings,
  a.id AS approval_id, a.requested_at
FROM carousels c
JOIN clients cl ON cl.id = c.client_id
LEFT JOIN approvals a ON a.subject_type = 'carousel' AND a.subject_id = c.id AND a.status = 'pending'
WHERE c.status = 'needs_review' AND c.deleted_at IS NULL;

-- Performa template per periode (leaderboard).
-- PENTING: agregasi metrik dilakukan di subquery terpisah agar tidak terjadi
-- perkalian baris (fan-out) antara slide dan post_variant, yang akan membuat
-- avg/sum menjadi salah. Satu post dihitung sekali per template walaupun
-- template dipakai di beberapa slide.
CREATE MATERIALIZED VIEW mv_template_performance AS
WITH post_metric AS (
  -- satu baris per post_variant: metrik pada usia 72 jam (metrik sebanding)
  SELECT
    pv.post_id,
    pv.id AS post_variant_id,
    m.saves,
    m.reach
  FROM post_variants pv
  JOIN metrics_snapshots m ON m.post_variant_id = pv.id AND m.age_hours = 72
),
post_template AS (
  -- satu baris per (post, template): template unik yang benar-benar dipakai
  SELECT DISTINCT
    p.id AS post_id,
    s.template_key AS template_slug,
    c.category_key
  FROM posts p
  JOIN carousels c ON c.id = p.carousel_id
  JOIN slides s ON s.carousel_id = c.id
  WHERE s.template_key IS NOT NULL AND p.deleted_at IS NULL
)
SELECT
  t.id AS template_id,
  t.slug,
  t.category_key,
  count(DISTINCT pt.post_id) AS posts,
  avg(pm.saves) AS avg_saves,
  avg(pm.reach) AS avg_reach,
  CASE WHEN sum(pm.reach) > 0 THEN sum(pm.saves)::numeric / sum(pm.reach) ELSE NULL END AS save_rate
FROM templates t
JOIN post_template pt ON pt.template_slug = t.slug
JOIN post_metric pm ON pm.post_id = pt.post_id
GROUP BY t.id, t.slug, t.category_key;
CREATE UNIQUE INDEX idx_mv_template_performance ON mv_template_performance(template_id);

-- Biaya per carousel (dipakai cost meter dan analytics).
-- Subquery, bukan JOIN ganda: menggabungkan cost_ledger dan carousel_assets
-- dalam satu GROUP BY akan menggandakan sum(amount).
CREATE VIEW v_cost_per_carousel AS
SELECT
  c.id AS carousel_id,
  c.org_id,
  c.client_id,
  c.title,
  c.category_key,
  coalesce(cost.total_cost, 0) AS total_cost,
  coalesce(cost.runs, 0) AS runs,
  coalesce(rendered.rendered_assets, 0) AS rendered_assets
FROM carousels c
LEFT JOIN (
  SELECT carousel_id, sum(amount) AS total_cost, count(DISTINCT agent_run_id) AS runs
  FROM cost_ledger
  WHERE carousel_id IS NOT NULL
  GROUP BY carousel_id
) cost ON cost.carousel_id = c.id
LEFT JOIN (
  SELECT ca.carousel_id, count(DISTINCT a.id) AS rendered_assets
  FROM carousel_assets ca
  JOIN assets a ON a.id = ca.asset_id
  WHERE ca.is_current
  GROUP BY ca.carousel_id
) rendered ON rendered.carousel_id = c.id
WHERE c.deleted_at IS NULL;
```

Catatan: `mv_template_performance` perlu refresh berkala (mis. harian) dan tidak boleh dipakai untuk angka real-time. Karena `save_rate` bergantung pada data metrik yang datang terlambat, angka pada view ini sengaja hanya memakai snapshot usia 72 jam.

---

## 4. Aturan Integritas & Trigger

```sql
-- Timestamp otomatis
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs','users','memberships','categories','clients','brand_kits','templates',
    'content_plans','plan_items','briefs','carousels','slides','captions',
    'agent_definitions','pipeline_runs','pipeline_steps','agent_runs','render_jobs',
    'compliance_rules','approvals','social_accounts','posts','post_variants',
    'kpi_daily','agent_performance_daily','knowledge_items','integrations','office_layouts'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END $$;
```

**Aturan yang ditegakkan di application layer (bukan trigger), dengan alasan:**

1. **Perubahan isi setelah approval membatalkan approval.** Saat `slides` atau `captions` berubah pada carousel berstatus `approved`/`scheduled`, service menghitung ulang `content_hash`; bila berbeda dari `approvals.subject_hash`, approval lama di-`expired` dan status kembali ke `needs_review` (FR-6.7). Ini logika bisnis, bukan constraint.
2. **Compliance blocking sebagai gerbang.** Transisi ke `approved` ditolak bila ada `compliance_checks.result='fail'` dengan severity `block` pada versi terbaru yang belum di-override. Diperiksa di service sebelum update status, agar pesan galat bisa menjelaskan temuan.
3. **Transisi status tervalidasi.** Tabel transisi yang diizinkan hidup di kode (state machine), bukan di database, agar mudah dikembangkan dan diuji.
4. **Snapshot versi.** Setiap perubahan isi membuat baris baru di `carousel_versions`; baris lama tidak pernah diubah.
5. **Immutability aset.** Baris `assets` tidak di-update setelah dibuat; render ulang menghasilkan baris baru dan menggeser `carousel_assets.is_current`.

**Constraint yang ditegakkan di database (karena murni integritas data):**

- `uq_slides_position`, `ck_slides_position` — urutan slide konsisten.
- `uq_carousel_versions` — nomor versi tidak boleh tabrakan.
- `uq_metrics_snapshot` — satu snapshot per post per usia.
- `uq_compliance_checks_dedupe` — mencegah temuan ganda identik.
- `uq_brand_kit_versions`, `uq_template_versions` — riwayat versi utuh.

---

## 5. Strategi Index per Pola Query

| Pola query nyata | Index pendukung |
|---|---|
| Kanban: daftar carousel per status & klien | `idx_carousels_client_status`, `idx_carousels_org_status` |
| Approvals Inbox: item menunggu review | `idx_approvals_pending`, `idx_carousels_review` |
| Kantor Virtual: status agen aktif | `idx_agent_runs_status`, `idx_agent_runs_human` |
| Detail carousel: semua langkah pipeline | `idx_pipeline_steps_run`, `idx_agent_runs_carousel` |
| Idempotensi & cache agen | `idx_agent_runs_cache` |
| Preview studio: slide per carousel | `idx_slides_carousel` |
| Aset terender terkini | `idx_carousel_assets_current` |
| Deteksi duplikat konten | `idx_captions_body_trgm`, `idx_knowledge_content_trgm`, `idx_assets_checksum` |
| Scheduler: post yang harus terbit | `idx_posts_schedule` |
| Metrik dashboard | `idx_metrics_snapshots_client`, `idx_kpi_daily_org_date` |
| Biaya & anggaran | `idx_cost_ledger_org_time`, `idx_cost_ledger_client_month` |
| Kepatuhan: temuan yang memblokir | `idx_compliance_checks_fail` |
| Audit & investigasi insiden | `idx_audit_logs_subject`, `idx_audit_logs_actor` |
| Kesehatan token sosial media | `idx_social_accounts_health` |

---

## 6. Catatan Implementasi & Skala

1. **Row Level Security (RLS).** Bila produk dijual sebagai SaaS, aktifkan RLS pada semua tabel ber-`org_id` dan set `app.current_org` per transaksi. Sebelum itu, tegakkan lewat helper terpusat di aplikasi dan **wajib** ada test otomatis "cross-tenant leak" (NFR-4).
2. **Partisi.** Tabel yang paling cepat tumbuh adalah `agent_messages`, `audit_logs`, `metrics_snapshots`, `cost_ledger`, dan `agent_runs`. Siapkan partisi bulanan berbasis `created_at` sejak awal pada `agent_messages` dan `audit_logs`; tabel lain bisa menyusul ketika melewati puluhan juta baris.
3. **Retensi.** `audit_logs` dan `assets` disimpan ≥ 24 bulan (NFR-10). `agent_messages` boleh dikompresi atau diarsipkan setelah 90 hari, dengan isi sensitif di-`redact`.
4. **Queue bukan sumber kebenaran.** Kehilangan isi Redis tidak boleh menghilangkan data. Setiap job harus bisa dibangun ulang dari baris `pipeline_steps`/`render_jobs` berstatus `pending`/`queued`.
5. **Encoding & font.** Render worker harus menyertakan font yang dipakai brand kit di dalam image; jangan bergantung pada font sistem.
6. **Zona waktu.** Simpan UTC, konversi di tepi aplikasi. Bug jadwal yang paling umum berasal dari konversi berulang, bukan dari penyimpanan.
7. **Idempotensi render.** Kunci idempotensi = hash(`carousel_version` + `ratio_profile` + `scope` + `slide_positions`). Render ulang dengan kunci sama mengembalikan aset yang ada.
8. **Seed data wajib** pada migrasi awal: 5 `categories`, 8 `templates` + versinya, `agent_definitions` untuk 9 agen, `compliance_rules` L1–L3, dan `disclaimers` standar (PRD §13.4).
9. **Poin keputusan yang belum final** (lihat Q-1 s/d Q-7 pada PRD §20) memengaruhi kolom berikut: `posts.publish_mode` (Q-1), `disclaimers` + `clients.is_affiliate_disclosed` (Q-2), `integrations` + `market_snapshots` (Q-3), kolom `locale` di seluruh tabel (Q-4), `clients.monthly_cost_limit` + `agent_definitions.max_cost_per_run` (Q-5), `brand_assets.license_note` (Q-6), dan `api_keys` + `cost_ledger` (Q-7). Semua kolomnya sudah disiapkan, sehingga jawaban atas pertanyaan tersebut tidak memerlukan migrasi struktural.
