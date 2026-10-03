/**
 * Basis data Studio.
 *
 * Memakai `node:sqlite` bawaan Node 24, sehingga proyek tidak memerlukan
 * server basis data terpisah untuk dijalankan. Skema di sini adalah versi
 * operasional dari `docs/SKEMA-DATABASE.md` (PostgreSQL) dengan bentuk yang
 * sama: setiap tabel operasional memiliki `org_id`, setiap tabel konten
 * memiliki `client_id`. Dengan begitu, memindahkan ke PostgreSQL untuk versi
 * multi-klien nanti hanya perlu penyesuaian tipe, bukan perancangan ulang.
 *
 * Catatan penting: tabel `approvals` dan `audit_log` di sini bukan hiasan.
 * Keduanya yang membuat klaim "tidak ada publikasi tanpa persetujuan manusia"
 * dapat dibuktikan, bukan hanya dijanjikan.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CategoryKey } from '../shared/types.ts';
import { isCategoryKey } from '../shared/categories.ts';
import type { LearnedRule } from '../shared/types.ts';

/** Status carousel di sepanjang alur produksi. */
export type CarouselStatus =
  | 'briefed'
  | 'researching'
  | 'drafting'
  | 'designing'
  | 'needs_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'failed';

/** Baris carousel. */
export interface CarouselRow {
  id: string;
  org_id: string;
  client_id: string;
  category_key: string;
  topic: string;
  title: string;
  status: CarouselStatus;
  risk_level: string;
  compliance_outcome: string | null;
  compliance_blocked: number;
  as_of: string | null;
  disclaimer_key: string | null;
  folder: string | null;
  slide_count: number;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_note: string | null;
  schedule_note: string | null;
  analysis_note: string | null;
  /** Id carousel yang sedang diperbaiki; null bila produksi asli. */
  revised_from: string | null;
  /** Berapa kali carousel ini sudah melewati perbaikan. */
  revision_round: number;
  /** Permintaan tambahan dari pengguna saat produksi. */
  extra_instructions: string | null;
  /** Waktu carousel diarsipkan. */
  archived_at: string | null;
  /** Alasan carousel diarsipkan. */
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Baris slide. */
export interface SlideRow {
  id: string;
  carousel_id: string;
  position: number;
  role: string;
  template_key: string | null;
  headline: string;
  body: string | null;
  bullets: string;
  emphasis: string;
  visual: string;
  source_refs: string;
  word_count: number;
}

/** Baris temuan kepatuhan. */
export interface FindingRow {
  id: string;
  carousel_id: string;
  rule_key: string;
  rule_name: string;
  layer: string;
  severity: string;
  result: string;
  subject_ref: string;
  evidence: string | null;
  suggestion: string | null;
  decided_by: string;
}

/** Baris jejak langkah agen. */
export interface AgentRunRow {
  id: string;
  carousel_id: string;
  step_key: string;
  agent_key: string;
  status: string;
  model: string | null;
  started_at: string;
  duration_ms: number | null;
  note: string | null;
  error: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  cached: number;
}

/** Baris pekerjaan produksi yang sedang berjalan. */
export interface JobRow {
  id: string;
  carousel_id: string;
  category_key: string;
  topic: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  current_step: string | null;
  progress: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

/** Baris item pengetahuan. */
export interface KnowledgeRow {
  id: string;
  kind: string;
  category_key: string | null;
  title: string;
  content: string;
  tags: string;
  usage_count: number;
  status: string;
  created_at: string;
}

const ORG_ID = 'org_default';
const CLIENT_ID = 'client_default';
const SCHEMA_VERSION = 4;

/**
 * Menghapus data contoh dari basis data.
 *
 * Data contoh berguna saat basis data masih kosong, tetapi setelah ada produksi
 * nyata data itu justru menyesatkan: dashboard akan menampilkan "kepatuhan
 * lolos" untuk carousel yang tidak pernah dirender. Karena itu data contoh
 * dihapus begitu produksi nyata pertama diimpor.
 *
 * Hanya baris yang id-nya berawalan `demo_` yang dihapus.
 */
export function removeDemoData(db: DatabaseSync): { removed: number } {
  const rows = db.prepare("SELECT id FROM carousels WHERE id LIKE 'demo_%'").all() as unknown as { id: string }[];
  if (rows.length === 0) return { removed: 0 };

  const del = db.prepare('DELETE FROM carousels WHERE id = ?');
  for (const r of rows) del.run(r.id);

  // Item pengetahuan contoh juga dilepas agar knowledge base hanya memuat
  // aset yang benar-benar berasal dari pekerjaan sendiri.
  db.prepare("DELETE FROM knowledge_items WHERE id LIKE 'kb_demo_%'").run();

  audit(db, 'system', 'studio.demo_removed', 'studio', null, { removed: rows.length });
  return { removed: rows.length };
}

/** Membuka (dan bila perlu membuat) basis data Studio. */
export function openDb(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  // SQLite tidak menegakkan foreign key secara bawaan.
  db.exec('PRAGMA foreign_keys = ON');
  // WAL membuat pembacaan tidak terblokir saat job produksi menulis.
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      brand_tokens TEXT NOT NULL,
      disclaimers TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS carousels (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      compliance_outcome TEXT,
      compliance_blocked INTEGER NOT NULL DEFAULT 0,
      as_of TEXT,
      disclaimer_key TEXT,
      folder TEXT,
      slide_count INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      approved_at TEXT,
      approved_by TEXT,
      approval_note TEXT,
      schedule_note TEXT,
      analysis_note TEXT,
      -- Menandai carousel yang lahir dari perbaikan carousel sebelumnya.
      revised_from TEXT,
      -- Jumlah percobaan produksi; dipakai untuk menampilkan riwayat perbaikan.
      revision_round INTEGER NOT NULL DEFAULT 0,
      -- Ringkasan permintaan tambahan pengguna, untuk ditampilkan di detail.
      extra_instructions TEXT,
      -- Archive management fields
      archived_at TEXT,
      archive_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_carousels_status ON carousels(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_carousels_category ON carousels(category_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      role TEXT NOT NULL,
      template_key TEXT,
      headline TEXT NOT NULL,
      body TEXT,
      bullets TEXT NOT NULL DEFAULT '[]',
      emphasis TEXT NOT NULL DEFAULT '[]',
      visual TEXT NOT NULL DEFAULT '{"type":"none"}',
      source_refs TEXT NOT NULL DEFAULT '[]',
      word_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (carousel_id, position)
    );

    CREATE TABLE IF NOT EXISTS captions (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      hook TEXT,
      body TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '[]',
      cta TEXT
    );

    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      ref TEXT NOT NULL,
      claim TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT,
      as_of TEXT NOT NULL,
      confidence TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compliance_findings (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      rule_key TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      layer TEXT NOT NULL,
      severity TEXT NOT NULL,
      result TEXT NOT NULL,
      subject_ref TEXT NOT NULL,
      evidence TEXT,
      suggestion TEXT,
      decided_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_findings_carousel ON compliance_findings(carousel_id, result);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      step_key TEXT NOT NULL,
      agent_key TEXT NOT NULL,
      status TEXT NOT NULL,
      model TEXT,
      started_at TEXT NOT NULL,
      duration_ms INTEGER,
      note TEXT,
      error TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      cached INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_carousel ON agent_runs(carousel_id, started_at);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step TEXT,
      progress REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      category_key TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject_type, subject_id, created_at DESC);

    -- ---------------------------------------------------------------------
    -- Aturan hasil pembelajaran dari revisi manusia.
    -- Inilah yang membuat agen tidak mengulangi kesalahan yang sama.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS learned_rules (
      id TEXT PRIMARY KEY,
      category_key TEXT,
      rule TEXT NOT NULL,
      rationale TEXT NOT NULL,
      occurrences INTEGER NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 0.35,
      created_by TEXT NOT NULL DEFAULT 'agent',
      source TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_learned_rules_active ON learned_rules(active, confidence DESC);

    -- ---------------------------------------------------------------------
    -- Riwayat revisi: catatan manusia atas setiap keputusan.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      title TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revisions_carousel ON revisions(carousel_id, created_at DESC);

    -- ---------------------------------------------------------------------
    -- Sidik jari isi setiap carousel, untuk mencegah pembahasan berulang.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS content_signatures (
      carousel_id TEXT PRIMARY KEY,
      category_key TEXT NOT NULL,
      title TEXT NOT NULL,
      keywords TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signatures_category ON content_signatures(category_key, created_at DESC);

    -- ---------------------------------------------------------------------
    -- Rencana konten mingguan beserta slotnya.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS weekly_plans (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      strategy_note TEXT NOT NULL,
      warnings TEXT NOT NULL DEFAULT '[]',
      slots TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_period ON weekly_plans(period_start DESC);

    -- ---------------------------------------------------------------------
    -- Konfigurasi merek: logo dan merek teks yang dipasang pada slide.
    -- Disimpan terpisah dari tabel clients agar mudah diubah dari antarmuka.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS brand_config (
      id TEXT PRIMARY KEY,
      logo_label TEXT,
      logo_position TEXT NOT NULL DEFAULT 'top-right',
      logo_height INTEGER NOT NULL DEFAULT 64,
      logo_data_uri TEXT,
      logo_alt TEXT,
      mark_short_name TEXT,
      mark_tagline TEXT,
      mark_badge TEXT,
      updated_at TEXT NOT NULL
    );

    -- ---------------------------------------------------------------------
    -- Ajakan bertindak yang dapat dipilih saat produksi.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS cta_presets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      headline TEXT NOT NULL,
      detail TEXT,
      promo_code TEXT,
      valid_until TEXT,
      community_name TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- ---------------------------------------------------------------------
    -- Gambar yang diunggah pengguna untuk disisipkan ke slide.
    -- Disimpan sebagai data URI supaya render tetap mandiri.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS uploaded_images (
      id TEXT PRIMARY KEY,
      carousel_id TEXT,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      data_uri TEXT NOT NULL,
      slide_position INTEGER,
      caption TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_uploads_carousel ON uploaded_images(carousel_id, created_at);

    -- ---------------------------------------------------------------------
    -- Sumber berita yang dipakai, agar asal setiap klaim dapat ditelusuri.
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS news_usage (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_name TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      published_at TEXT,
      trust TEXT NOT NULL,
      used_as TEXT NOT NULL DEFAULT 'fact',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_news_usage_carousel ON news_usage(carousel_id);

    -- ---------------------------------------------------------------------
    -- Data terstruktur untuk kategori jurnal_trading (Item 9)
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS jurnal_trading_data (
      carousel_id TEXT PRIMARY KEY REFERENCES carousels(id) ON DELETE CASCADE,
      pair TEXT NOT NULL,
      timeframe TEXT,
      trade_table TEXT NOT NULL DEFAULT '[]',
      direction_desc TEXT NOT NULL DEFAULT '',
      direction_image_id TEXT,
      execution_desc TEXT NOT NULL DEFAULT '',
      execution_image_id TEXT,
      mark_desc TEXT NOT NULL DEFAULT '',
      mark_image_id TEXT,
      performance_image_id TEXT,
      pair_image_id TEXT,
      general_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jurnal_pair ON jurnal_trading_data(pair);

    -- ---------------------------------------------------------------------
    -- Data terstruktur untuk kategori market_outlook (Item 8)
    -- ---------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS market_outlook_data (
      carousel_id TEXT PRIMARY KEY REFERENCES carousels(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      timeframe TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      ctas TEXT NOT NULL DEFAULT '[]',
      general_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outlook_timeframe ON market_outlook_data(timeframe);

    CREATE TABLE IF NOT EXISTS market_outlook_images (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      image_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outlook_images_carousel ON market_outlook_images(carousel_id, sort_order);

    CREATE TABLE IF NOT EXISTS carousel_ctas (
      id TEXT PRIMARY KEY,
      carousel_id TEXT NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      headline TEXT NOT NULL,
      detail TEXT,
      promo_code TEXT,
      valid_until TEXT,
      community_name TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ctas_carousel ON carousel_ctas(carousel_id, sort_order);
  `);

  // Migrasi skema bertahap (backward-compatible untuk DB yang sudah ada)
  try {
    const vRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    const cur = vRow ? Number(vRow.value) : 0;
    if (cur < 2) {
      try { db.exec('ALTER TABLE carousels ADD COLUMN archived_at TEXT'); } catch { /* kolom sudah ada */ }
      try { db.exec('ALTER TABLE carousels ADD COLUMN archive_reason TEXT'); } catch { /* kolom sudah ada */ }
    }
    if (cur < 3) {
      // Pastikan kolom-kolom baru jurnal_trading_data ada bila DB lama sudah punya tabel versi minimal
      try {
        const cols = db.prepare("PRAGMA table_info(jurnal_trading_data)").all() as { name: string }[];
        const names = new Set(cols.map((c) => c.name));
        const adds: Record<string, string> = {
          timeframe: 'ALTER TABLE jurnal_trading_data ADD COLUMN timeframe TEXT',
          direction_image_id: 'ALTER TABLE jurnal_trading_data ADD COLUMN direction_image_id TEXT',
          execution_image_id: 'ALTER TABLE jurnal_trading_data ADD COLUMN execution_image_id TEXT',
          mark_image_id: 'ALTER TABLE jurnal_trading_data ADD COLUMN mark_image_id TEXT',
          performance_image_id: 'ALTER TABLE jurnal_trading_data ADD COLUMN performance_image_id TEXT',
          general_notes: 'ALTER TABLE jurnal_trading_data ADD COLUMN general_notes TEXT',
        };
        for (const [col, sql] of Object.entries(adds)) {
          if (!names.has(col)) { try { db.exec(sql); } catch { /* ignore */ } }
        }
      } catch { /* tabel belum ada — akan dibuat oleh CREATE IF NOT EXISTS */ }
    }
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  } catch { /* jangan blokir openDb karena migrasi gagal */ }

  // Klien bawaan. Token merek disimpan sebagai JSON agar dapat diubah dari UI.
  const clientCount = db.prepare('SELECT count(*) AS n FROM clients').get() as { n: number };
  if (clientCount.n === 0) {
    db.prepare(
      'INSERT INTO clients (id, org_id, name, brand_tokens, disclaimers, created_at) VALUES (?,?,?,?,?,?)',
    ).run(
      CLIENT_ID,
      ORG_ID,
      'PropDesk',
      JSON.stringify({}),
      JSON.stringify({}),
      new Date().toISOString(),
    );
  }

  return db;
}

/** Jalur basis data bawaan. */
export function defaultDbPath(root: string): string {
  return join(root, 'storage', 'studio.db');
}

// ---------------------------------------------------------------------------
// Repositori
// ---------------------------------------------------------------------------

/** Identitas default untuk pemakaian satu pengguna. */
export const DEFAULT_ORG = ORG_ID;
export const DEFAULT_CLIENT = CLIENT_ID;

/** Pembantu: menjalankan transaksi. */
function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Menyimpan hasil produksi ke basis data. */
export function saveProduction(
  db: DatabaseSync,
  input: {
    carouselId: string;
    categoryKey: string;
    topic: string;
    title: string;
    riskLevel: string;
    asOf: string;
    disclaimerKey: string;
    folder: string;
    slides: {
      position: number;
      role: string;
      templateKey?: string;
      headline: string;
      body: string | null;
      bullets: string[];
      emphasis: string[];
      visual: unknown;
      sourceRefs: string[];
      wordCount: number;
    }[];
    caption: { platform: string; hook: string; body: string; hashtags: string[]; cta: string } | null;
    facts: { ref: string; claim: string; sourceName: string; asOf: string; confidence: string }[];
    findings: {
      ruleKey: string;
      ruleName: string;
      layer: string;
      severity: string;
      result: string;
      subjectRef: string;
      evidence?: string;
      suggestion?: string;
      decidedBy: string;
    }[];
    complianceOutcome: string;
    complianceBlocked: boolean;
    agentRuns: {
      stepKey: string;
      agentKey: string;
      status: string;
      model?: string;
      startedAt: string;
      durationMs: number;
      note: string;
      error?: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      cached: boolean;
    }[];
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    /** Opsional: diisi null bila tidak diketahui. */
    durationMs?: number;
    scheduleNote?: string;
    analysisNote?: string;
  },
): void {
  const now = new Date().toISOString();

  tx(db, () => {
    db.prepare(
      `INSERT INTO carousels (
        id, org_id, client_id, category_key, topic, title, status, risk_level,
        compliance_outcome, compliance_blocked, as_of, disclaimer_key, folder,
        slide_count, cost_usd, tokens_in, tokens_out, duration_ms,
        schedule_note, analysis_note, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      input.carouselId,
      ORG_ID,
      CLIENT_ID,
      input.categoryKey,
      input.topic,
      input.title,
      // Hasil produksi selalu masuk ke antrean review. Tidak ada jalur
      // otomatis menuju status approved — ini gerbang manusia (ADR-02).
      input.complianceBlocked ? 'failed' : 'needs_review',
      input.riskLevel,
      input.complianceOutcome,
      input.complianceBlocked ? 1 : 0,
      input.asOf,
      input.disclaimerKey,
      input.folder,
      input.slides.length,
      input.costUsd,
      input.tokensIn,
      input.tokensOut,
      // `node:sqlite` menolak nilai undefined, jadi nilai opsional harus
      // dinormalkan menjadi null di satu tempat ini.
      input.durationMs ?? null,
      input.scheduleNote ?? null,
      input.analysisNote ?? null,
      now,
      now,
    );

    const insSlide = db.prepare(
      `INSERT INTO slides (id, carousel_id, position, role, template_key, headline, body, bullets, emphasis, visual, source_refs, word_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const s of input.slides) {
      insSlide.run(
        `${input.carouselId}-s${s.position}`,
        input.carouselId,
        s.position,
        s.role,
        s.templateKey ?? null,
        s.headline,
        s.body,
        JSON.stringify(s.bullets),
        JSON.stringify(s.emphasis),
        JSON.stringify(s.visual),
        JSON.stringify(s.sourceRefs),
        s.wordCount,
      );
    }

    if (input.caption) {
      db.prepare(
        'INSERT INTO captions (id, carousel_id, platform, hook, body, hashtags, cta) VALUES (?,?,?,?,?,?,?)',
      ).run(
        `${input.carouselId}-cap`,
        input.carouselId,
        input.caption.platform,
        input.caption.hook,
        input.caption.body,
        JSON.stringify(input.caption.hashtags),
        input.caption.cta,
      );
    }

    const insFact = db.prepare(
      'INSERT INTO facts (id, carousel_id, ref, claim, source_name, source_url, as_of, confidence) VALUES (?,?,?,?,?,?,?,?)',
    );
    for (const f of input.facts) {
      insFact.run(`${input.carouselId}-${f.ref}`, input.carouselId, f.ref, f.claim, f.sourceName, null, f.asOf, f.confidence);
    }

    const insFinding = db.prepare(
      `INSERT INTO compliance_findings (id, carousel_id, rule_key, rule_name, layer, severity, result, subject_ref, evidence, suggestion, decided_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const [i, f] of input.findings.entries()) {
      insFinding.run(
        `${input.carouselId}-f${i}`,
        input.carouselId,
        f.ruleKey,
        f.ruleName,
        f.layer,
        f.severity,
        f.result,
        f.subjectRef,
        f.evidence ?? null,
        f.suggestion ?? null,
        f.decidedBy,
        now,
      );
    }

    const insRun = db.prepare(
      `INSERT INTO agent_runs (id, carousel_id, step_key, agent_key, status, model, started_at, duration_ms, note, error, tokens_in, tokens_out, cost_usd, cached)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const [i, r] of input.agentRuns.entries()) {
      insRun.run(
        `${input.carouselId}-r${i}`,
        input.carouselId,
        r.stepKey,
        r.agentKey,
        r.status,
        r.model ?? null,
        r.startedAt,
        r.durationMs,
        r.note,
        r.error ?? null,
        r.tokensIn,
        r.tokensOut,
        r.costUsd,
        r.cached ? 1 : 0,
      );
    }
  });

  audit(db, 'system', 'carousel.produced', 'carousel', input.carouselId, {
    category: input.categoryKey,
    outcome: input.complianceOutcome,
    blocked: input.complianceBlocked,
    slides: input.slides.length,
  });
}

/** Mencatat tindakan ke jejak audit. */
export function audit(
  db: DatabaseSync,
  actor: string,
  action: string,
  subjectType: string,
  subjectId: string | null,
  detail?: unknown,
): void {
  db.prepare(
    'INSERT INTO audit_log (id, org_id, actor, action, subject_type, subject_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).run(
    `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ORG_ID,
    actor,
    action,
    subjectType,
    subjectId,
    detail ? JSON.stringify(detail) : null,
    new Date().toISOString(),
  );
}

/** Mengambil daftar carousel dengan penyaring opsional. */
export function listCarousels(
  db: DatabaseSync,
  filter: { status?: string; category?: string; limit?: number } = {},
): CarouselRow[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status) {
    // Status "kurang dari approved" untuk papan pipeline.
    if (filter.status === 'in_progress') {
      clauses.push("status IN ('briefed','researching','drafting','designing','needs_review','changes_requested')");
    } else {
      clauses.push('status = ?');
      params.push(filter.status);
    }
  }
  if (filter.category) {
    clauses.push('category_key = ?');
    params.push(filter.category);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);
  return db
    .prepare(`SELECT * FROM carousels ${where} ORDER BY updated_at DESC LIMIT ?`)
    .all(...params) as unknown as CarouselRow[];
}

/** Mengambil satu carousel. */
export function getCarousel(db: DatabaseSync, id: string): CarouselRow | null {
  const row = db.prepare('SELECT * FROM carousels WHERE id = ?').get(id) as unknown as CarouselRow | undefined;
  return row ?? null;
}

/** Mengambil slide sebuah carousel, terurut. */
export function getSlides(db: DatabaseSync, carouselId: string): SlideRow[] {
  return db
    .prepare('SELECT * FROM slides WHERE carousel_id = ? ORDER BY position')
    .all(carouselId) as unknown as SlideRow[];
}

/** Mengambil temuan kepatuhan sebuah carousel. */
export function getFindings(db: DatabaseSync, carouselId: string): FindingRow[] {
  return db
    .prepare('SELECT * FROM compliance_findings WHERE carousel_id = ? ORDER BY result, subject_ref')
    .all(carouselId) as unknown as FindingRow[];
}

/** Mengambil jejak langkah agen sebuah carousel. */
export function getAgentRuns(db: DatabaseSync, carouselId: string): AgentRunRow[] {
  return db
    .prepare('SELECT * FROM agent_runs WHERE carousel_id = ? ORDER BY started_at, rowid')
    .all(carouselId) as unknown as AgentRunRow[];
}

/** Mengambil caption sebuah carousel. */
export function getCaptions(db: DatabaseSync, carouselId: string): { platform: string; hook: string; body: string; hashtags: string; cta: string }[] {
  return db
    .prepare('SELECT platform, hook, body, hashtags, cta FROM captions WHERE carousel_id = ?')
    .all(carouselId) as unknown as { platform: string; hook: string; body: string; hashtags: string; cta: string }[];
}

/** Mengambil fact sheet sebuah carousel. */
export function getFacts(db: DatabaseSync, carouselId: string) {
  return db
    .prepare('SELECT ref, claim, source_name, as_of, confidence FROM facts WHERE carousel_id = ? ORDER BY ref')
    .all(carouselId) as unknown as { ref: string; claim: string; source_name: string; as_of: string; confidence: string }[];
}

/** Menyimpan keputusan manusia atas sebuah carousel. */
export function decideCarousel(
  db: DatabaseSync,
  id: string,
  decision: 'approved' | 'changes_requested' | 'rejected',
  note: string,
  actor = 'operator',
): void {
  const now = new Date().toISOString();

  // Pengaman penting: carousel yang masih diblokir kepatuhan tidak boleh
  // disetujui. Aturan ini ditegakkan di sini, bukan hanya di antarmuka, supaya
  // tidak dapat dilewati lewat pemanggilan API langsung.
  if (decision === 'approved') {
    const row = getCarousel(db, id);
    if (!row) throw new Error('Carousel tidak ditemukan.');
    if (row.compliance_blocked === 1) {
      throw new Error(
        'Carousel ini diblokir oleh pemeriksaan kepatuhan dan tidak dapat disetujui. Perbaiki temuan bertanda BLOKIR lebih dulu.',
      );
    }
    const blocking = db
      .prepare("SELECT count(*) AS n FROM compliance_findings WHERE carousel_id = ? AND result = 'fail' AND severity = 'block'")
      .get(id) as { n: number };
    if (blocking.n > 0) {
      throw new Error(
        `Masih ada ${blocking.n} temuan kepatuhan yang memblokir. Carousel tidak dapat disetujui sebelum diperbaiki.`,
      );
    }
  }

  db.prepare(
    'UPDATE carousels SET status = ?, approved_at = ?, approved_by = ?, approval_note = ?, updated_at = ? WHERE id = ?',
  ).run(decision, decision === 'approved' ? now : null, decision === 'approved' ? actor : null, note, now, id);

  audit(db, actor, `carousel.${decision}`, 'carousel', id, { note });
}

/** Archive a carousel by moving it to archive status and recording timestamp. */
export function archiveCarousel(
  db: DatabaseSync,
  carouselId: string,
  reason: string,
): void {
  const now = new Date().toISOString();
  const safeReason = reason.trim().slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_') || 'archived';
  let row: { category_key: string } | undefined;
  try {
    const stmt = db.prepare('SELECT category_key FROM carousels WHERE id = ?') as unknown as {
      get?: (id: string) => { category_key: string } | undefined;
    };
    if (typeof stmt.get === 'function') row = stmt.get(carouselId);
  } catch {
    row = undefined;
  }
  const dateStr = now.split('T')[0].replace(/-/g, '');
  const sanitized = safeReason.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'archived';
  const truncated = sanitized.slice(0, 50);
  const folder = row?.category_key ? `output/archive/${row.category_key}_${dateStr}_${truncated}/` : null;
  if (folder) {
    db.prepare(
      'UPDATE carousels SET status = ?, archived_at = ?, archive_reason = ?, folder = ?, updated_at = ? WHERE id = ?'
    ).run('archived', now, safeReason, folder, now, carouselId);
  } else {
    db.prepare(
      'UPDATE carousels SET status = ?, archived_at = ?, archive_reason = ?, updated_at = ? WHERE id = ?'
    ).run('archived', now, safeReason, now, carouselId);
  }
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const underscored = normalized.replace(/[^a-z0-9]+/g, '_');
  const collapsed = underscored.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return collapsed;
}

export function buildApproveFolderName(categoryKey: string, dateIso: string, title: string): string {
  const dateStr = dateIso.split('T')[0].replace(/-/g, '');
  const slug = slugify(title).slice(0, 40).replace(/_$/g, '') || 'content';
  const raw = `${categoryKey}_${dateStr}_${slug}`;
  return raw.length <= 100 ? raw : raw.slice(0, 100).replace(/_+$/g, '');
}

export function buildArchiveFolderName(categoryKey: string, dateIso: string, reason: string): string {
  const dateStr = dateIso.split('T')[0].replace(/-/g, '');
  const safe = reason.trim().slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_') || 'archived';
  const sanitized = safe.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'archived';
  const truncated = sanitized.slice(0, 50);
  const raw = `${categoryKey}_${dateStr}_${truncated}`;
  return raw.length <= 100 ? raw : raw.slice(0, 100).replace(/_+$/g, '');
}

export function updateCarouselFolder(db: DatabaseSync, id: string, folder: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE carousels SET folder = ?, updated_at = ? WHERE id = ?').run(folder, now, id);
}

// ---------------------------------------------------------------------------
// Jurnal Trading helpers (Item 9)
// ---------------------------------------------------------------------------

export interface JurnalTradeRow {
  pairs: string;
  direction: string;
  session: string;
  riskPct: string;
  rr: string;
  confluence: string;
  pnl: string;
  result: string;
}

export interface JurnalTradingPayload {
  pair: string;
  timeframe?: string | null;
  tradeTable: JurnalTradeRow[];
  directionDesc: string;
  directionImageId?: string | null;
  executionDesc: string;
  executionImageId?: string | null;
  markDesc: string;
  markImageId?: string | null;
  performanceImageId?: string | null;
  pairImageId?: string | null;
  generalNotes?: string | null;
}

export function validateJurnalTradingPayload(p: unknown): { ok: boolean; error?: string } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'Payload harus objek.' };
  const o = p as Record<string, unknown>;
  if (typeof o.pair !== 'string' || !o.pair.trim()) return { ok: false, error: 'pair wajib diisi.' };
  if (!Array.isArray(o.tradeTable)) return { ok: false, error: 'tradeTable harus array.' };
  for (const r of o.tradeTable as unknown[]) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'Baris trade tidak valid.' };
    const row = r as Record<string, unknown>;
    for (const k of ['pairs', 'direction', 'session', 'riskPct', 'rr', 'confluence', 'pnl', 'result']) {
      if (typeof row[k] !== 'string') return { ok: false, error: `Field ${k} harus string.` };
    }
  }
  for (const k of ['directionDesc', 'executionDesc', 'markDesc']) {
    if (typeof o[k] !== 'string') return { ok: false, error: `${k} harus string.` };
  }
  for (const k of ['directionImageId', 'executionImageId', 'markImageId', 'performanceImageId', 'pairImageId', 'timeframe', 'generalNotes']) {
    if (o[k] !== undefined && o[k] !== null && typeof o[k] !== 'string') return { ok: false, error: `${k} harus string atau null.` };
  }
  return { ok: true };
}

export function buildJurnalExtraInstructions(payload: JurnalTradingPayload): string {
  const rows = payload.tradeTable
    .map((r) => `- ${r.pairs} | ${r.direction} | ${r.session} | Risk ${r.riskPct} | RR ${r.rr} | Confluence: ${r.confluence} | PnL ${r.pnl} (${r.result})`)
    .join('\n');
  const lines: string[] = [];
  lines.push(`Kategori: jurnal_trading — Pair utama: ${payload.pair}.`);
  if (payload.timeframe) lines.push(`Timeframe: ${payload.timeframe}.`);
  lines.push('Instruksi wajib: susun 7 slide dengan peran yang benar; jangan karang angka/claim tanpa sumber.');
  lines.push('Tabel trade (sumber kebenaran, tampilkan apa adanya, jangan ringkas angkanya):');
  lines.push(rows || '- (tidak ada baris trade)');
  lines.push('');
  lines.push(`Deskripsi Direction: ${payload.directionDesc}`);
  lines.push(`Deskripsi Execution: ${payload.executionDesc}`);
  lines.push(`Deskripsi Mark/Setup: ${payload.markDesc}`);
  if (payload.generalNotes) lines.push(`Catatan umum: ${payload.generalNotes}`);
  lines.push('Aturan: jaga akurasi pair, direction, PnL; CTA di akhir; disclaimer sesuai riskLevel.');
  return lines.join('\n');
}

export function saveJurnalTradingData(db: DatabaseSync, carouselId: string, payload: JurnalTradingPayload): void {
  const now = new Date().toISOString();
  const v = validateJurnalTradingPayload(payload);
  if (!v.ok) throw new Error(v.error);
  db.prepare(
    `INSERT INTO jurnal_trading_data (carousel_id, pair, timeframe, trade_table, direction_desc, direction_image_id, execution_desc, execution_image_id, mark_desc, mark_image_id, performance_image_id, pair_image_id, general_notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(carousel_id) DO UPDATE SET pair=excluded.pair, timeframe=excluded.timeframe, trade_table=excluded.trade_table, direction_desc=excluded.direction_desc, direction_image_id=excluded.direction_image_id, execution_desc=excluded.execution_desc, execution_image_id=excluded.execution_image_id, mark_desc=excluded.mark_desc, mark_image_id=excluded.mark_image_id, performance_image_id=excluded.performance_image_id, pair_image_id=excluded.pair_image_id, general_notes=excluded.general_notes, updated_at=excluded.updated_at`
  ).run(
    carouselId,
    payload.pair,
    payload.timeframe ?? null,
    JSON.stringify(payload.tradeTable),
    payload.directionDesc,
    payload.directionImageId ?? null,
    payload.executionDesc,
    payload.executionImageId ?? null,
    payload.markDesc,
    payload.markImageId ?? null,
    payload.performanceImageId ?? null,
    payload.pairImageId ?? null,
    payload.generalNotes ?? null,
    now,
    now,
  );
}

export function getJurnalTradingData(db: DatabaseSync, carouselId: string): JurnalTradingPayload | null {
  const row = db
    .prepare(
      'SELECT pair, timeframe, trade_table, direction_desc, direction_image_id, execution_desc, execution_image_id, mark_desc, mark_image_id, performance_image_id, pair_image_id, general_notes FROM jurnal_trading_data WHERE carousel_id = ?'
    )
    .get(carouselId) as
    | {
        pair: string;
        timeframe: string | null;
        trade_table: string;
        direction_desc: string;
        direction_image_id: string | null;
        execution_desc: string;
        execution_image_id: string | null;
        mark_desc: string;
        mark_image_id: string | null;
        performance_image_id: string | null;
        pair_image_id: string | null;
        general_notes: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    pair: row.pair,
    timeframe: row.timeframe,
    tradeTable: JSON.parse(row.trade_table) as JurnalTradeRow[],
    directionDesc: row.direction_desc,
    directionImageId: row.direction_image_id,
    executionDesc: row.execution_desc,
    executionImageId: row.execution_image_id,
    markDesc: row.mark_desc,
    markImageId: row.mark_image_id,
    performanceImageId: row.performance_image_id,
    pairImageId: row.pair_image_id,
    generalNotes: row.general_notes,
  };
}

// ---------------------------------------------------------------------------
// Market Outlook helpers (Item 8)
// ---------------------------------------------------------------------------

export interface MarketOutlookImageEntry {
  imageId: string;
  description: string;
  sortOrder: number;
}

export interface MarketOutlookCtaEntry {
  kind: string;
  headline: string;
  detail?: string | null;
  promoCode?: string | null;
  validUntil?: string | null;
  communityName?: string | null;
  sortOrder?: number;
}

export interface MarketOutlookPayload {
  title: string;
  timeframe?: string | null;
  images: MarketOutlookImageEntry[];
  ctas: MarketOutlookCtaEntry[];
  generalNotes?: string | null;
}

export function validateMarketOutlookPayload(p: unknown): { ok: boolean; error?: string } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'Payload harus objek.' };
  const o = p as Record<string, unknown>;
  if (typeof o.title !== 'string' || !o.title.trim()) return { ok: false, error: 'title wajib diisi.' };
  if (o.timeframe !== undefined && o.timeframe !== null && typeof o.timeframe !== 'string') return { ok: false, error: 'timeframe harus string atau null.' };
  if (!Array.isArray(o.images)) return { ok: false, error: 'images harus array.' };
  for (const im of o.images as unknown[]) {
    if (!im || typeof im !== 'object') return { ok: false, error: 'Image entry tidak valid.' };
    const r = im as Record<string, unknown>;
    if (typeof r.imageId !== 'string' || !r.imageId.trim()) return { ok: false, error: 'imageId wajib string.' };
    if (typeof r.description !== 'string') return { ok: false, error: 'description harus string.' };
    if (typeof r.sortOrder !== 'number') return { ok: false, error: 'sortOrder harus number.' };
  }
  if (o.ctas !== undefined && o.ctas !== null) {
    if (!Array.isArray(o.ctas)) return { ok: false, error: 'ctas harus array.' };
    for (const c of o.ctas as unknown[]) {
      if (!c || typeof c !== 'object') return { ok: false, error: 'CTA tidak valid.' };
      const r = c as Record<string, unknown>;
      if (typeof r.kind !== 'string' || !r.kind.trim()) return { ok: false, error: 'cta kind wajib string.' };
      if (typeof r.headline !== 'string' || !r.headline.trim()) return { ok: false, error: 'cta headline wajib string.' };
    }
  }
  if (o.generalNotes !== undefined && o.generalNotes !== null && typeof o.generalNotes !== 'string') return { ok: false, error: 'generalNotes harus string atau null.' };
  return { ok: true };
}

export function buildMarketOutlookExtraInstructions(payload: MarketOutlookPayload): string {
  const lines: string[] = [];
  lines.push(`Kategori: market_outlook — Judul: ${payload.title}.`);
  if (payload.timeframe) lines.push(`Timeframe: ${payload.timeframe}.`);
  lines.push('Instruksi wajib: susun 7 slide skenario (hook, konteks, skenario A, skenario B, risiko, recap, disclaimer). Bingkai sebagai skenario, bukan ajakan transaksi.');
  if (payload.images.length > 0) {
    lines.push('Galeri chart (urutan penting):');
    payload.images
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((im, i) => lines.push(`  ${i + 1}. [${im.imageId}] ${im.description}`));
  } else {
    lines.push('Galeri chart: (tidak ada upload — pakai analisis tekstual).');
  }
  if (payload.ctas.length > 0) {
    lines.push('CTA:');
    payload.ctas.forEach((c) => lines.push(`  - ${c.kind}: ${c.headline}${c.detail ? ` — ${c.detail}` : ''}${c.promoCode ? ` [kode: ${c.promoCode}]` : ''}`));
  }
  if (payload.generalNotes) lines.push(`Catatan umum: ${payload.generalNotes}`);
  lines.push('Aturan: sebutkan tingkat invalidasi & manajemen risiko; disclaimer skenario wajib di akhir.');
  return lines.join('\n');
}

export function saveMarketOutlookData(db: DatabaseSync, carouselId: string, payload: MarketOutlookPayload): void {
  const v = validateMarketOutlookPayload(payload);
  if (!v.ok) throw new Error(v.error);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO market_outlook_data (carousel_id, title, timeframe, images, ctas, general_notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(carousel_id) DO UPDATE SET title=excluded.title, timeframe=excluded.timeframe, images=excluded.images, ctas=excluded.ctas, general_notes=excluded.general_notes, updated_at=excluded.updated_at`
  ).run(carouselId, payload.title, payload.timeframe ?? null, JSON.stringify(payload.images), JSON.stringify(payload.ctas), payload.generalNotes ?? null, now, now);
  // Sync child tables (best-effort)
  try {
    db.prepare('DELETE FROM market_outlook_images WHERE carousel_id = ?').run(carouselId);
    const insImg = db.prepare('INSERT INTO market_outlook_images (id, carousel_id, image_id, description, sort_order, created_at) VALUES (?,?,?,?,?,?)');
    for (const im of payload.images) {
      insImg.run(`${carouselId}_img_${im.sortOrder}_${Math.random().toString(36).slice(2, 6)}`, carouselId, im.imageId, im.description, im.sortOrder, now);
    }
  } catch { /* ignore child sync errors */ }
  try {
    db.prepare('DELETE FROM carousel_ctas WHERE carousel_id = ?').run(carouselId);
    const insCta = db.prepare('INSERT INTO carousel_ctas (id, carousel_id, kind, headline, detail, promo_code, valid_until, community_name, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (let i = 0; i < payload.ctas.length; i++) {
      const c = payload.ctas[i]!;
      insCta.run(`${carouselId}_cta_${i}_${Math.random().toString(36).slice(2, 6)}`, carouselId, c.kind, c.headline, c.detail ?? null, c.promoCode ?? null, c.validUntil ?? null, c.communityName ?? null, c.sortOrder ?? i, now);
    }
  } catch { /* ignore */ }
}

export function getMarketOutlookData(db: DatabaseSync, carouselId: string): MarketOutlookPayload | null {
  const row = db
    .prepare('SELECT title, timeframe, images, ctas, general_notes FROM market_outlook_data WHERE carousel_id = ?')
    .get(carouselId) as
    | { title: string; timeframe: string | null; images: string; ctas: string; general_notes: string | null }
    | undefined;
  if (!row) return null;
  return {
    title: row.title,
    timeframe: row.timeframe,
    images: JSON.parse(row.images) as MarketOutlookImageEntry[],
    ctas: JSON.parse(row.ctas) as MarketOutlookCtaEntry[],
    generalNotes: row.general_notes,
  };
}

/** Ringkasan KPI untuk papan kendali. */
export interface KpiSummary {  totalCarousels: number;
  needsReview: number;
  approved: number;
  blocked: number;
  totalSlides: number;
  totalCostUsd: number;
  billableCalls: number;
  cachedCalls: number;
  avgDurationMs: number;
  complianceFirstPassRate: number;
  byCategory: { category_key: string; n: number; cost: number }[];
}

/** Menghitung KPI dari data yang tersimpan. */
export function getKpi(db: DatabaseSync): KpiSummary {
  const one = (sql: string): number => {
    const row = db.prepare(sql).get() as { n: number } | undefined;
    return row?.n ?? 0;
  };

  const totalCarousels = one('SELECT count(*) AS n FROM carousels');
  const byCategory = db
    .prepare('SELECT category_key, count(*) AS n, coalesce(sum(cost_usd),0) AS cost FROM carousels GROUP BY category_key ORDER BY n DESC')
    .all() as unknown as { category_key: string; n: number; cost: number }[];

  const cost = db
    .prepare('SELECT coalesce(sum(cost_usd),0) AS cost, coalesce(sum(tokens_in),0) AS tin, coalesce(sum(tokens_out),0) AS tout FROM carousels')
    .get() as { cost: number; tin: number; tout: number };

  const durations = db
    .prepare('SELECT coalesce(avg(duration_ms),0) AS avg_ms FROM carousels WHERE duration_ms IS NOT NULL')
    .get() as { avg_ms: number };

  const calls = db
    .prepare('SELECT coalesce(sum(case when cached = 0 then 1 else 0 end),0) AS billable, coalesce(sum(cached),0) AS cached FROM agent_runs')
    .get() as { billable: number; cached: number };

  // Rasio lolos pemeriksaan pada percobaan pertama: carousel yang tidak
  // diblokir kepatuhan dibagi seluruh carousel yang sudah diperiksa.
  const checked = one('SELECT count(*) AS n FROM carousels WHERE compliance_outcome IS NOT NULL');
  const clean = one("SELECT count(*) AS n FROM carousels WHERE compliance_blocked = 0 AND compliance_outcome IS NOT NULL");

  return {
    totalCarousels,
    needsReview: one("SELECT count(*) AS n FROM carousels WHERE status = 'needs_review'"),
    approved: one("SELECT count(*) AS n FROM carousels WHERE status = 'approved'"),
    blocked: one('SELECT count(*) AS n FROM carousels WHERE compliance_blocked = 1'),
    totalSlides: one('SELECT count(*) AS n FROM slides'),
    totalCostUsd: cost.cost,
    billableCalls: calls.billable,
    cachedCalls: calls.cached,
    avgDurationMs: durations.avg_ms,
    complianceFirstPassRate: checked > 0 ? clean / checked : 1,
    byCategory,
  };
}

/** Status setiap agen, dipakai oleh Virtual Agent Office. */
export interface AgentStatus {
  agentKey: string;
  zone: string;
  status: 'idle' | 'working' | 'awaiting_human' | 'failed' | 'done';
  task: string | null;
  stepKey: string | null;
  carouselId: string | null;
  carouselTitle: string | null;
  startedAt: string | null;
  durationMs: number | null;
  model: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  cached: boolean;
  error: string | null;
  /** Berapa banyak temuan kepatuhan pada carousel yang sedang ditangani. */
  findings: number;
}

/** Peta agen ke zona kantor. */
export const AGENT_ZONES: Record<string, string> = {
  strategist: 'brief_room',
  research: 'research_lab',
  copywriter: 'writing_desk',
  composer: 'design_studio',
  renderer: 'design_studio',
  compliance: 'review_room',
  compliance_advisor: 'review_room',
  scheduler: 'publish_desk',
  analyst: 'library',
};

/** Nama tampilan setiap agen. */
export const AGENT_NAMES: Record<string, string> = {
  strategist: 'Strategist',
  research: 'Research & Market',
  copywriter: 'Copywriter',
  composer: 'Carousel Composer',
  renderer: 'Visual Renderer',
  compliance: 'Compliance Reviewer',
  compliance_advisor: 'Peninjau Nuansa',
  scheduler: 'Scheduler',
  analyst: 'Analyst',
};

/** Urutan tampilan agen. */
export const AGENT_ORDER = [
  'strategist',
  'research',
  'copywriter',
  'composer',
  'renderer',
  'compliance',
  'compliance_advisor',
  'scheduler',
  'analyst',
];

/**
 * Menghitung status setiap agen.
 *
 * Sumber datanya nyata: pekerjaan yang sedang berjalan (`jobs`) dan langkah
 * terakhir pada `agent_runs`. Tidak ada status yang dikarang. Bila sebuah agen
 * tidak memiliki catatan, statusnya `idle` — dan kantor menampilkannya apa
 * adanya, bukan animasi hiasan (ADR-04).
 */
export function getAgentStatuses(db: DatabaseSync): AgentStatus[] {
  const runningJobs = db
    .prepare("SELECT id, carousel_id, category_key, topic, current_step, status FROM jobs WHERE status IN ('queued','running') ORDER BY created_at DESC")
    .all() as unknown as { id: string; carousel_id: string; category_key: string; topic: string; current_step: string | null; status: string }[];

  // Langkah terbaru untuk setiap agen.
  const latest = db
    .prepare(
      `SELECT r.*, c.title AS carousel_title, c.status AS carousel_status
       FROM agent_runs r
       JOIN carousels c ON c.id = r.carousel_id
       WHERE r.rowid IN (SELECT max(rowid) FROM agent_runs GROUP BY agent_key)
      `,
    )
    .all() as unknown as (AgentRunRow & { carousel_title: string; carousel_status: string })[];

  const latestByAgent = new Map(latest.map((r) => [r.agent_key, r]));

  // Temuan kepatuhan per carousel, untuk ditampilkan di ruang peninjauan.
  const findingCounts = new Map(
    (
      db
        .prepare("SELECT carousel_id, count(*) AS n FROM compliance_findings WHERE result != 'pass' GROUP BY carousel_id")
        .all() as unknown as { carousel_id: string; n: number }[]
    ).map((r) => [r.carousel_id, r.n]),
  );

  const runningCarouselId = runningJobs[0]?.carousel_id ?? null;
  const currentStep = runningJobs[0]?.current_step ?? null;

  return AGENT_ORDER.map((agentKey) => {
    const zone = AGENT_ZONES[agentKey] ?? 'library';

    // Agen yang sedang bekerja: job berjalan dan langkah aktifnya milik agen ini.
    if (runningCarouselId && currentStep && stepBelongsToAgent(currentStep, agentKey)) {
      return {
        agentKey,
        zone,
        status: 'working',
        task: runningJobs[0]!.topic,
        stepKey: currentStep,
        carouselId: runningCarouselId,
        carouselTitle: runningJobs[0]!.topic,
        startedAt: new Date().toISOString(),
        durationMs: null,
        model: null,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cached: false,
        error: null,
        findings: findingCounts.get(runningCarouselId) ?? 0,
      };
    }

    const last = latestByAgent.get(agentKey);
    if (!last) {
      return {
        agentKey,
        zone,
        status: 'idle',
        task: null,
        stepKey: null,
        carouselId: null,
        carouselTitle: null,
        startedAt: null,
        durationMs: null,
        model: null,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cached: false,
        error: null,
        findings: 0,
      };
    }

    const status: AgentStatus['status'] =
      last.status === 'failed'
        ? 'failed'
        : last.status === 'succeeded'
          ? last.carousel_status === 'needs_review'
            ? 'done'
            : 'done'
          : 'idle';

    return {
      agentKey,
      zone,
      status,
      task: last.note,
      stepKey: last.step_key,
      carouselId: last.carousel_id,
      carouselTitle: last.carousel_title,
      startedAt: last.started_at,
      durationMs: last.duration_ms,
      model: last.model,
      costUsd: last.cost_usd,
      tokensIn: last.tokens_in,
      tokensOut: last.tokens_out,
      cached: last.cached === 1,
      error: last.error,
      findings: findingCounts.get(last.carousel_id) ?? 0,
    };
  });
}

/** Benar bila langkah pipeline dikerjakan agen tertentu. */
function stepBelongsToAgent(stepKey: string, agentKey: string): boolean {
  const map: Record<string, string[]> = {
    brief: ['strategist'],
    research: ['research'],
    caption: ['copywriter'],
    compose: ['composer'],
    render: ['renderer'],
    compliance_rules: ['compliance'],
    compliance_advisor: ['compliance_advisor'],
    schedule: ['scheduler'],
    analyze: ['analyst'],
  };
  return (map[stepKey] ?? []).includes(agentKey);
}

/** Membuat job baru. */
export function createJob(
  db: DatabaseSync,
  job: { id: string; carouselId: string; categoryKey: string; topic: string },
): void {
  db.prepare(
    'INSERT INTO jobs (id, carousel_id, category_key, topic, status, current_step, progress, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).run(job.id, job.carouselId, job.categoryKey, job.topic, 'queued', null, 0, new Date().toISOString());
}

/** Memperbarui kemajuan job. */
export function updateJob(
  db: DatabaseSync,
  id: string,
  patch: { status?: string; currentStep?: string | null; progress?: number; error?: string | null },
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.currentStep !== undefined) {
    sets.push('current_step = ?');
    params.push(patch.currentStep);
  }
  if (patch.progress !== undefined) {
    sets.push('progress = ?');
    params.push(patch.progress);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    params.push(patch.error);
  }
  if (patch.status === 'done' || patch.status === 'failed') {
    sets.push('finished_at = ?');
    params.push(new Date().toISOString());
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

/** Job yang masih berjalan. */
export function getActiveJobs(db: DatabaseSync): JobRow[] {
  return db
    .prepare("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY created_at")
    .all() as unknown as JobRow[];
}

/** Riwayat job terakhir. */
export function getRecentJobs(db: DatabaseSync, limit = 20): JobRow[] {
  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit) as unknown as JobRow[];
}

/** Menambahkan item pengetahuan. */
export function addKnowledge(
  db: DatabaseSync,
  item: { kind: string; categoryKey: string | null; title: string; content: string; tags: string[] },
): string {
  const id = `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(
    'INSERT INTO knowledge_items (id, kind, category_key, title, content, tags, usage_count, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(id, item.kind, item.categoryKey, item.title, item.content, JSON.stringify(item.tags), 0, 'active', new Date().toISOString());
  return id;
}

/** Daftar item pengetahuan. */
export function listKnowledge(db: DatabaseSync, kind?: string): KnowledgeRow[] {
  return (
    kind
      ? db.prepare('SELECT * FROM knowledge_items WHERE kind = ? ORDER BY created_at DESC').all(kind)
      : db.prepare('SELECT * FROM knowledge_items ORDER BY created_at DESC').all()
  ) as unknown as KnowledgeRow[];
}

// ---------------------------------------------------------------------------
// Memori: aturan pembelajaran, revisi, dan sidik jari konten
// ---------------------------------------------------------------------------

/** Menyimpan catatan revisi manusia. */
export function recordRevision(
  db: DatabaseSync,
  input: { carouselId: string; categoryKey: string; title: string; decision: 'changes_requested' | 'rejected'; note: string },
): string {
  const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    'INSERT INTO revisions (id, carousel_id, category_key, title, decision, note, created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(id, input.carouselId, input.categoryKey, input.title, input.decision, input.note, new Date().toISOString());
  return id;
}

/** Mengambil catatan revisi, terbaru lebih dulu. */
export function listRevisions(db: DatabaseSync, limit = 100): {
  carouselId: string;
  categoryKey: string;
  title: string;
  decision: 'changes_requested' | 'rejected';
  note: string;
  createdAt: string;
}[] {
  return (
    db
      .prepare('SELECT carousel_id, category_key, title, decision, note, created_at FROM revisions ORDER BY created_at DESC LIMIT ?')
      .all(limit) as unknown as {
      carousel_id: string;
      category_key: string;
      title: string;
      decision: string;
      note: string;
      created_at: string;
    }[]
  ).map((r) => ({
    carouselId: r.carousel_id,
    categoryKey: r.category_key,
    title: r.title,
    decision: r.decision === 'rejected' ? 'rejected' : 'changes_requested',
    note: r.note,
    createdAt: r.created_at,
  }));
}

/** Menyimpan atau memperbarui aturan hasil pembelajaran. */
export function upsertLearnedRule(
  db: DatabaseSync,
  rule: { id: string; categoryKey: string | null; rule: string; rationale: string; occurrences: number; confidence: number; createdBy: 'human' | 'agent'; source?: string; createdAt: string; lastSeenAt: string; active: boolean },
): void {
  db.prepare(
    `INSERT INTO learned_rules (id, category_key, rule, rationale, occurrences, confidence, created_by, source, created_at, last_seen_at, active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       category_key = excluded.category_key,
       rule = excluded.rule,
       rationale = excluded.rationale,
       occurrences = excluded.occurrences,
       confidence = excluded.confidence,
       last_seen_at = excluded.last_seen_at,
       active = excluded.active`,
  ).run(
    rule.id,
    rule.categoryKey,
    rule.rule,
    rule.rationale,
    rule.occurrences,
    rule.confidence,
    rule.createdBy,
    rule.source ?? null,
    rule.createdAt,
    rule.lastSeenAt,
    rule.active ? 1 : 0,
  );
}

/** Mengambil seluruh aturan pembelajaran. */
export function listLearnedRules(db: DatabaseSync, onlyActive = false): LearnedRule[] {
  const sql = onlyActive
    ? 'SELECT * FROM learned_rules WHERE active = 1 ORDER BY confidence DESC, occurrences DESC'
    : 'SELECT * FROM learned_rules ORDER BY active DESC, confidence DESC, occurrences DESC';
  return (db.prepare(sql).all() as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    // Kunci kategori bertipe teks di basis data; nilai yang tidak dikenal
    // dikembalikan sebagai null (berlaku umum) alih-alih dibuang.
    categoryKey:
      r.category_key !== null && isCategoryKey(String(r.category_key))
        ? (String(r.category_key) as CategoryKey)
        : null,
    rule: String(r.rule),
    rationale: String(r.rationale),
    occurrences: Number(r.occurrences),
    confidence: Number(r.confidence),
    createdBy: r.created_by === 'human' ? 'human' : 'agent',
    createdAt: String(r.created_at),
    lastSeenAt: String(r.last_seen_at),
    active: Number(r.active) === 1,
  }));
}

/** Mengaktifkan atau menonaktifkan sebuah aturan. */
export function setLearnedRuleActive(db: DatabaseSync, id: string, active: boolean): void {
  db.prepare('UPDATE learned_rules SET active = ?, last_seen_at = ? WHERE id = ?').run(
    active ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

/** Menghapus sebuah aturan pembelajaran. */
export function deleteLearnedRule(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM learned_rules WHERE id = ?').run(id);
}

/** Menyimpan sidik jari isi sebuah carousel. */
export function saveSignature(
  db: DatabaseSync,
  sig: { carouselId: string; categoryKey: string; title: string; keywords: string[]; fingerprint: string },
): void {
  db.prepare(
    `INSERT INTO content_signatures (carousel_id, category_key, title, keywords, fingerprint, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(carousel_id) DO UPDATE SET title = excluded.title, keywords = excluded.keywords, fingerprint = excluded.fingerprint`,
  ).run(sig.carouselId, sig.categoryKey, sig.title, JSON.stringify(sig.keywords), sig.fingerprint, new Date().toISOString());
}

/** Mengambil seluruh sidik jari konten. */
export function listSignatures(db: DatabaseSync, limit = 500): {
  carouselId: string;
  categoryKey: string;
  title: string;
  keywords: string[];
  fingerprint: string;
  createdAt: string;
}[] {
  return (
    db
      .prepare('SELECT * FROM content_signatures ORDER BY created_at DESC LIMIT ?')
      .all(limit) as unknown as Record<string, unknown>[]
  ).map((r) => ({
    carouselId: String(r.carousel_id),
    categoryKey: String(r.category_key),
    title: String(r.title),
    keywords: safeJsonArray(String(r.keywords)),
    fingerprint: String(r.fingerprint),
    createdAt: String(r.created_at),
  }));
}

/** Membaca larik JSON dengan aman. */
function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Rencana mingguan
// ---------------------------------------------------------------------------

/** Menyimpan rencana konten mingguan. */
export function saveWeeklyPlan(
  db: DatabaseSync,
  plan: { id: string; periodStart: string; periodEnd: string; strategyNote: string; warnings: string[]; slots: unknown[]; createdAt: string },
): void {
  db.prepare(
    'INSERT OR REPLACE INTO weekly_plans (id, period_start, period_end, strategy_note, warnings, slots, created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    plan.id,
    plan.periodStart,
    plan.periodEnd,
    plan.strategyNote,
    JSON.stringify(plan.warnings),
    JSON.stringify(plan.slots),
    plan.createdAt,
  );
}

/** Mengambil rencana terbaru. */
export function latestWeeklyPlan(db: DatabaseSync): {
  id: string;
  periodStart: string;
  periodEnd: string;
  strategyNote: string;
  warnings: string[];
  slots: unknown[];
  createdAt: string;
} | null {
  const row = db.prepare('SELECT * FROM weekly_plans ORDER BY created_at DESC LIMIT 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  let slots: unknown[] = [];
  try {
    const parsed = JSON.parse(String(row.slots)) as unknown;
    if (Array.isArray(parsed)) slots = parsed;
  } catch {
    slots = [];
  }
  return {
    id: String(row.id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    strategyNote: String(row.strategy_note),
    warnings: safeJsonArray(String(row.warnings)),
    slots,
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Konfigurasi merek: logo dan merek teks
// ---------------------------------------------------------------------------

/** Menyimpan konfigurasi merek. */
export function saveBrandConfig(
  db: DatabaseSync,
  cfg: {
    logoLabel?: string | null;
    logoPosition: string;
    logoHeight: number;
    logoDataUri?: string | null;
    logoAlt?: string | null;
    markShortName?: string | null;
    markTagline?: string | null;
    markBadge?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO brand_config (id, logo_label, logo_position, logo_height, logo_data_uri, logo_alt, mark_short_name, mark_tagline, mark_badge, updated_at)
     VALUES ('default',?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       logo_label = excluded.logo_label,
       logo_position = excluded.logo_position,
       logo_height = excluded.logo_height,
       logo_data_uri = excluded.logo_data_uri,
       logo_alt = excluded.logo_alt,
       mark_short_name = excluded.mark_short_name,
       mark_tagline = excluded.mark_tagline,
       mark_badge = excluded.mark_badge,
       updated_at = excluded.updated_at`,
  ).run(
    cfg.logoLabel ?? null,
    cfg.logoPosition,
    cfg.logoHeight,
    cfg.logoDataUri ?? null,
    cfg.logoAlt ?? null,
    cfg.markShortName ?? null,
    cfg.markTagline ?? null,
    cfg.markBadge ?? null,
    new Date().toISOString(),
  );
}

/** Mengambil konfigurasi merek. */
export function getBrandConfig(db: DatabaseSync): {
  logoLabel: string | null;
  logoPosition: string;
  logoHeight: number;
  logoDataUri: string | null;
  logoAlt: string | null;
  markShortName: string | null;
  markTagline: string | null;
  markBadge: string | null;
} | null {
  const row = db.prepare("SELECT * FROM brand_config WHERE id = 'default'").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    logoLabel: row.logo_label === null ? null : String(row.logo_label),
    logoPosition: String(row.logo_position),
    logoHeight: Number(row.logo_height),
    logoDataUri: row.logo_data_uri === null ? null : String(row.logo_data_uri),
    logoAlt: row.logo_alt === null ? null : String(row.logo_alt),
    markShortName: row.mark_short_name === null ? null : String(row.mark_short_name),
    markTagline: row.mark_tagline === null ? null : String(row.mark_tagline),
    markBadge: row.mark_badge === null ? null : String(row.mark_badge),
  };
}

// ---------------------------------------------------------------------------
// Preset ajakan bertindak
// ---------------------------------------------------------------------------

/** Menyimpan preset ajakan bertindak. */
export function saveCtaPreset(
  db: DatabaseSync,
  preset: {
    id: string;
    label: string;
    kind: string;
    headline: string;
    detail?: string | null;
    promoCode?: string | null;
    validUntil?: string | null;
    communityName?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO cta_presets (id, label, kind, headline, detail, promo_code, valid_until, community_name, is_default, created_at)
     VALUES (?,?,?,?,?,?,?,?,0,?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label, kind = excluded.kind, headline = excluded.headline,
       detail = excluded.detail, promo_code = excluded.promo_code,
       valid_until = excluded.valid_until, community_name = excluded.community_name`,
  ).run(
    preset.id,
    preset.label,
    preset.kind,
    preset.headline,
    preset.detail ?? null,
    preset.promoCode ?? null,
    preset.validUntil ?? null,
    preset.communityName ?? null,
    new Date().toISOString(),
  );
}

/** Mengambil preset ajakan bertindak. */
export function listCtaPresets(db: DatabaseSync): {
  id: string;
  label: string;
  kind: string;
  headline: string;
  detail: string | null;
  promoCode: string | null;
  validUntil: string | null;
  communityName: string | null;
}[] {
  return (db.prepare('SELECT * FROM cta_presets ORDER BY created_at').all() as unknown as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      label: String(r.label),
      kind: String(r.kind),
      headline: String(r.headline),
      detail: r.detail === null ? null : String(r.detail),
      promoCode: r.promo_code === null ? null : String(r.promo_code),
      validUntil: r.valid_until === null ? null : String(r.valid_until),
      communityName: r.community_name === null ? null : String(r.community_name),
    }),
  );
}

/** Menghapus preset ajakan bertindak. */
export function deleteCtaPreset(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM cta_presets WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Gambar yang diunggah
// ---------------------------------------------------------------------------

/** Menyimpan gambar unggahan sebagai data URI. */
export function saveUploadedImage(
  db: DatabaseSync,
  img: { carouselId?: string; originalName: string; mimeType: string; byteSize: number; dataUri: string; slidePosition?: number; caption?: string },
): string {
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    'INSERT INTO uploaded_images (id, carousel_id, original_name, mime_type, byte_size, data_uri, slide_position, caption, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    img.carouselId ?? null,
    img.originalName,
    img.mimeType,
    img.byteSize,
    img.dataUri,
    img.slidePosition ?? null,
    img.caption ?? null,
    new Date().toISOString(),
  );
  return id;
}

/** Mengambil gambar yang belum dipakai atau yang terikat pada carousel tertentu. */
export function listUploadedImages(db: DatabaseSync, carouselId?: string): {
  id: string;
  carouselId: string | null;
  originalName: string;
  mimeType: string;
  byteSize: number;
  dataUri: string;
  slidePosition: number | null;
  caption: string | null;
  createdAt: string;
}[] {
  const rows = carouselId
    ? db.prepare('SELECT * FROM uploaded_images WHERE carousel_id = ? ORDER BY created_at').all(carouselId)
    : db.prepare('SELECT * FROM uploaded_images ORDER BY created_at DESC LIMIT 50').all();
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    carouselId: r.carousel_id === null ? null : String(r.carousel_id),
    originalName: String(r.original_name),
    mimeType: String(r.mime_type),
    byteSize: Number(r.byte_size),
    dataUri: String(r.data_uri),
    slidePosition: r.slide_position === null ? null : Number(r.slide_position),
    caption: r.caption === null ? null : String(r.caption),
    createdAt: String(r.created_at),
  }));
}

/** Menghapus gambar unggahan. */
export function deleteUploadedImage(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM uploaded_images WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Penggunaan berita
// ---------------------------------------------------------------------------

/** Mencatat berita yang dipakai pada sebuah carousel. */
export function recordNewsUsage(
  db: DatabaseSync,
  rows: { carouselId: string; sourceKey: string; sourceName: string; title: string; url?: string; publishedAt?: string | null; trust: string; usedAs: string }[],
): void {
  const stmt = db.prepare(
    'INSERT INTO news_usage (id, carousel_id, source_key, source_name, title, url, published_at, trust, used_as, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  for (const [i, r] of rows.entries()) {
    stmt.run(
      `nu_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      r.carouselId,
      r.sourceKey,
      r.sourceName,
      r.title,
      r.url ?? null,
      r.publishedAt ?? null,
      r.trust,
      r.usedAs,
      new Date().toISOString(),
    );
  }
}

/** Mengambil berita yang dipakai sebuah carousel. */
export function getNewsUsage(db: DatabaseSync, carouselId: string) {
  return (
    db.prepare('SELECT source_name, title, url, published_at, trust, used_as FROM news_usage WHERE carousel_id = ? ORDER BY rowid').all(carouselId) as unknown as Record<string, unknown>[]
  ).map((r) => ({
    sourceName: String(r.source_name),
    title: String(r.title),
    url: r.url === null ? null : String(r.url),
    publishedAt: r.published_at === null ? null : String(r.published_at),
    trust: String(r.trust),
    usedAs: String(r.used_as),
  }));
}

/** Jejak audit terakhir. */
export function recentAudit(db: DatabaseSync, limit = 30) {
  return db
    .prepare('SELECT actor, action, subject_type, subject_id, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as {
    actor: string;
    action: string;
    subject_type: string;
    subject_id: string | null;
    detail: string | null;
    created_at: string;
  }[];
}

/** Mengisi basis data dengan data contoh agar Studio dapat dilihat tanpa produksi. */
export function seedDemoIfEmpty(db: DatabaseSync): void {
  const count = db.prepare('SELECT count(*) AS n FROM carousels').get() as { n: number };
  if (count.n > 0) return;

  const categories = ['edukasi_trading', 'edukasi_propfirm', 'jurnal_trading', 'market_info', 'market_outlook'];
  const samples: { cat: string; topic: string; status: string; outcome: string; blocked: number }[] = [
    { cat: 'edukasi_propfirm', topic: 'Perbedaan static dan trailing drawdown', status: 'needs_review', outcome: 'warn', blocked: 0 },
    { cat: 'edukasi_trading', topic: 'Membaca struktur pasar dengan higher high dan lower low', status: 'approved', outcome: 'pass', blocked: 0 },
    { cat: 'market_info', topic: 'Dampak rilis data inflasi pada ekspektasi suku bunga', status: 'needs_review', outcome: 'warn', blocked: 0 },
    { cat: 'market_outlook', topic: 'Skenario indeks dolar pekan depan', status: 'failed', outcome: 'block', blocked: 1 },
    { cat: 'jurnal_trading', topic: 'Evaluasi satu posisi kalah yang layak dicatat', status: 'approved', outcome: 'pass', blocked: 0 },
    { cat: 'edukasi_trading', topic: 'Menentukan ukuran posisi berdasarkan risiko tetap', status: 'changes_requested', outcome: 'warn', blocked: 0 },
  ];
  const now = new Date();
  for (const [i, s] of samples.entries()) {
    const id = `demo_${i}`;
    const created = new Date(now.getTime() - i * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO carousels (id, org_id, client_id, category_key, topic, title, status, risk_level,
        compliance_outcome, compliance_blocked, as_of, disclaimer_key, folder, slide_count,
        cost_usd, tokens_in, tokens_out, duration_ms, schedule_note, analysis_note, created_at, updated_at,
        approved_at, approved_by, approval_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      ORG_ID,
      CLIENT_ID,
      s.cat,
      s.topic,
      s.topic.slice(0, 48),
      s.status,
      s.cat === 'market_outlook' ? 'high' : 'medium',
      s.outcome,
      s.blocked,
      created,
      s.cat === 'market_outlook' ? 'outlook_signal' : 'default_finansial',
      null,
      7,
      0.0018 + i * 0.0004,
      4200 + i * 300,
      380 + i * 40,
      210_000 - i * 12_000,
      '19.00-21.00 WIB',
      'Struktur sudah sesuai kerangka kategori.',
      created,
      created,
      s.status === 'approved' ? created : null,
      s.status === 'approved' ? 'operator' : null,
      s.status === 'approved' ? 'Sudah diperiksa, tidak ada klaim berisiko.' : null,
    );

    for (let p = 1; p <= 7; p += 1) {
      db.prepare(
        'INSERT INTO slides (id, carousel_id, position, role, template_key, headline, body, bullets, emphasis, visual, source_refs, word_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        `${id}-s${p}`,
        id,
        p,
        p === 1 ? 'hook' : p === 7 ? 'disclaimer' : p === 5 ? 'checklist' : 'body',
        'concept-one-idea',
        `Slide contoh ${p} untuk ${s.cat}`,
        'Isi contoh untuk pratinjau antarmuka Studio.',
        '[]',
        '[]',
        '{"type":"none"}',
        '[]',
        9,
      );
    }

    const findings: [string, string, string, string, string][] =
      s.blocked === 1
        ? [
            ['L2.guaranteed_profit', 'Klaim keuntungan pasti', 'block', 'fail', 'slide:2'],
            ['L1.requires_as_of', 'Penanda waktu data wajib', 'block', 'fail', 'carousel'],
          ]
        : s.outcome === 'warn'
          ? [['L4.nuance_1', 'Penilaian nuansa oleh model', 'warn', 'warn', 'slide:3']]
          : [];
    for (const [ri, f] of findings.entries()) {
      db.prepare(
        'INSERT INTO compliance_findings (id, carousel_id, rule_key, rule_name, layer, severity, result, subject_ref, evidence, suggestion, decided_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        `${id}-f${ri}`,
        id,
        f[0],
        f[1],
        f[2] === 'block' ? 'L1_structure' : 'L4_framing',
        f[2],
        f[3],
        f[4],
        'Contoh temuan untuk pratinjau antarmuka.',
        'Perbaiki teks slide ini.',
        f[2] === 'block' ? 'rule_engine' : 'llm',
        created,
      );
    }

    for (const [ri, agent] of ['strategist', 'research', 'copywriter', 'composer', 'renderer', 'compliance', 'scheduler', 'analyst'].entries()) {
      db.prepare(
        'INSERT INTO agent_runs (id, carousel_id, step_key, agent_key, status, model, started_at, duration_ms, note, error, tokens_in, tokens_out, cost_usd, cached) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        `${id}-r${ri}`,
        id,
        ['brief', 'research', 'caption', 'compose', 'render', 'compliance_rules', 'schedule', 'analyze'][ri]!,
        agent,
        'succeeded',
        agent === 'research' || agent === 'copywriter' || agent === 'composer' ? 'gemini/gemini-3.5-flash-lite' : 'My_Agents',
        created,
        6000 + ri * 800,
        'Selesai (data contoh).',
        null,
        500 + ri * 40,
        60 + ri * 8,
        0.0003,
        ri % 3 === 0 ? 1 : 0,
      );
    }

    db.prepare('INSERT INTO captions (id, carousel_id, platform, hook, body, hashtags, cta) VALUES (?,?,?,?,?,?,?)').run(
      `${id}-cap`,
      id,
      'instagram',
      'Contoh kalimat pembuka untuk pratinjau.',
      'Isi caption contoh.\nBaris kedua contoh.',
      '["#EdukasiTrading","#ManajemenRisiko"]',
      'Simpan carousel ini.',
    );
  }

  // Pengetahuan contoh: menunjukkan bentuk akumulasi aset pemenang.
  const knowledge: [string, string, string, string[]][] = [
    ['hook_bank', 'Hooks yang berhasil menarik simpan', 'Salah pilih aturan drawdown bisa langsung menghapus akun evaluasi Anda.', ['propfirm', 'drawdown']],
    ['banned_phrase', 'Frasa terlarang', 'pasti profit, dijamin payout, bebas risiko, profit konsisten', ['kepatuhan']],
    ['winning_template', 'Template dengan simpan tertinggi', 'propfirm-rules-table — tabel perbandingan aturan menghasilkan simpan paling banyak.', ['template']],
    ['lexicon', 'Pilihan kata khas merek', 'Gunakan "evaluasi" bukan "ujian", "batas risiko" bukan "stop loss" saat menjelaskan aturan.', ['gaya bahasa']],
    ['glossary', 'Glosarium istilah', 'Drawdown: penurunan ekuitas dari titik tertinggi. Trailing: batas yang mengikuti ekuitas tertinggi.', ['istilah']],
  ];
  for (const [kind, title, content, tags] of knowledge) {
    addKnowledge(db, { kind, categoryKey: null, title, content, tags });
  }

  audit(db, 'system', 'studio.seeded', 'studio', null, { carousels: samples.length });
}
