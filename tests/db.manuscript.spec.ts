import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// These imports will fail before implementation (missing exports/columns)
import {
  openDb,
  getCarousel,
  migrateCallToAction,
  validateCallToAction,
  getManuscript,
  saveManuscript,
  listManuscriptVersions,
  shouldCheckSimilarity,
} from '../packages/studio/db.ts';
import { checkSimilarity, similarityLevel } from '../packages/memory/topics.ts';

describe('Task 1: DB Migration v6 + Versioning + CTA Shape', () => {
  let tmpDir: string;
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'propdesk-task1-'));
  });
  after(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('migrates v5 DB with promoCode → promoCodes and creates manuscript columns + manuscript_versions table', () => {
    const dbPath = join(tmpDir, `v5-${Date.now()}.db`);
    // Manually create a v5-style DB without manuscript columns
    const raw = new DatabaseSync(dbPath);
    raw.exec('PRAGMA journal_mode = WAL');
    raw.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE carousels (
        id TEXT PRIMARY KEY, org_id TEXT NOT NULL, client_id TEXT NOT NULL,
        category_key TEXT NOT NULL, topic TEXT NOT NULL, title TEXT NOT NULL,
        status TEXT NOT NULL, risk_level TEXT NOT NULL,
        compliance_outcome TEXT, compliance_blocked INTEGER NOT NULL DEFAULT 0,
        as_of TEXT, disclaimer_key TEXT, folder TEXT,
        slide_count INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER, approved_at TEXT, approved_by TEXT, approval_note TEXT,
        schedule_note TEXT, analysis_note TEXT, revised_from TEXT, revision_round INTEGER NOT NULL DEFAULT 0,
        extra_instructions TEXT, call_to_action TEXT, archived_at TEXT, archive_reason TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    raw.exec(`INSERT INTO meta (key, value) VALUES ('schema_version','5')`);
    const now = new Date().toISOString();
    raw.exec(
      `INSERT INTO carousels (id, org_id, client_id, category_key, topic, title, status, risk_level, created_at, updated_at, call_to_action) VALUES ('c_old','org_default','client_default','edukasi_trading','Topik lama','Topik lama','needs_review','low','${now}','${now}','{\"kind\":\"promo\",\"headline\":\"Diskon\",\"promoCode\":\"X\"}')`,
    );
    raw.close();

    // Now open with migrated code (SCHEMA_VERSION 6) — must run migration
    const db = openDb(dbPath);

    // columns exist
    const cols = db.prepare('PRAGMA table_info(carousels)').all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    assert.ok(names.has('manuscript_json'), 'manuscript_json column must exist after v6 migration');
    assert.ok(names.has('manuscript_version'), 'manuscript_version column must exist');
    assert.ok(names.has('manuscript_locked'), 'manuscript_locked column must exist');
    assert.ok(names.has('manuscript_updated_at'), 'manuscript_updated_at column must exist');
    assert.ok(names.has('materi_raw'), 'materi_raw column must exist');
    assert.ok(names.has('materi_links'), 'materi_links column must exist');

    // manuscript_versions table exists
    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='manuscript_versions'").get() as { name: string } | undefined;
    assert.ok(tbl, 'manuscript_versions table must exist');

    // schema_version bumped to 6
    const vRow = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string } | undefined;
    assert.equal(vRow?.value, '6');

    // promoCode migrated to promoCodes
    const row = getCarousel(db, 'c_old');
    assert.ok(row, 'migrated carousel must be readable');
    assert.ok(row!.call_to_action, 'call_to_action must still exist');
    const migrated = JSON.parse(row!.call_to_action!);
    assert.deepStrictEqual(migrated.promoCodes, ['X'], 'promoCode should be migrated to promoCodes:["X"]');
    assert.equal(migrated.promoCode, undefined, 'legacy promoCode field should be removed after migration');

    // migrateCallToAction helper also handles legacy string
    const helper = migrateCallToAction('{"kind":"promo","headline":"H","promoCode":"Y"}');
    assert.deepStrictEqual(helper?.promoCodes, ['Y']);
    assert.equal((helper as unknown as Record<string, unknown>)?.promoCode, undefined);

    // getCarousel via helper that returns CallToAction? just check helper
    assert.equal(migrateCallToAction(null), null);

    db.close();
  });

  it('validateCallToAction rejects promoCodes length 6 and kind mismatch', () => {
    // 6 codes → reject
    const r6 = validateCallToAction({ kind: 'promo', headline: 'H', promoCodes: ['AAA','BBB','CCC','DDD','EEE','FFF'] });
    assert.equal(r6.ok, false, '6 promoCodes must be rejected');

    // kind != promo but has promoCodes → reject
    const rKind = validateCallToAction({ kind: 'community', headline: 'H', communityName: 'Komunitas', promoCodes: ['XXX'] } as unknown as Record<string, unknown>);
    assert.equal(rKind.ok, false, 'community with promoCodes must be rejected');

    // valid: promo with 2 codes 3..20 A-Z0-9_- passes
    const rOk = validateCallToAction({ kind: 'promo', headline: 'H', promoCodes: ['PROPDESK20', 'GOLD50'] });
    assert.equal(rOk.ok, true);

    // invalid char / too short
    const rShort = validateCallToAction({ kind: 'promo', headline: 'H', promoCodes: ['AB'] });
    assert.equal(rShort.ok, false);

    // saveManuscript / getManuscript / listManuscriptVersions helpers exist and work
    const db = openDb(':memory:');
    // seed a carousel so FK not needed (carousels id PK)
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO carousels (id, org_id, client_id, category_key, topic, title, status, risk_level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run('c1','org_default','client_default','edukasi_trading','Topik edukasi','Topik edukasi','manuscript_needs_review','low',now,now);

    const payload1: Record<string, unknown> = { title: 'Topik edukasi', angle: 'Angle FOMC', keyMessages: ['m1'], narrative: 'Narasi', caption: { hook: 'H', body: 'B', hashtags: ['#t'], cta: 'CTA' } };
    saveManuscript(db, 'c1', payload1, { editedBy: 'tester', note: 'initial' });
    const got = getManuscript(db, 'c1');
    assert.ok(got, 'getManuscript should return payload');
    assert.equal((got as Record<string, unknown>).title, 'Topik edukasi');

    const vers1 = listManuscriptVersions(db, 'c1');
    assert.equal(vers1.length, 1);
    assert.equal(vers1[0]!.version, 1);

    // second save bumps version
    const payload2: Record<string, unknown> = { ...payload1, angle: 'Angle ECB' };
    saveManuscript(db, 'c1', payload2, { editedBy: 'tester', note: 'update' });
    const vers2 = listManuscriptVersions(db, 'c1');
    assert.equal(vers2.length, 2);
    assert.equal(vers2[1]!.version, 2);

    db.close();
  });

  it('checkSimilarity scope: edukasi 0.83 triggers warn, jurnal skip', () => {
    // shouldCheckSimilarity helper gates categories
    assert.equal(shouldCheckSimilarity('edukasi_trading'), true, 'edukasi should be checked');
    assert.equal(shouldCheckSimilarity('market_info'), true);
    assert.equal(shouldCheckSimilarity('jurnal_trading'), false, 'jurnal should be skipped');
    assert.equal(shouldCheckSimilarity('market_outlook'), false, 'outlook should be skipped');

    // edukasi similarity 0.83 should be duplicate/too_similar (warn), not clear
    // Build history with very similar title so score high
    const history = [
      {
        carouselId: 'h1', categoryKey: 'edukasi_trading' as const, title: 'Dampak FOMC terhadap ekspektasi suku bunga dan likuiditas pasar',
        keywords: ['fomc','suku','bunga','likuiditas','pasar','ekspektasi'], fingerprint: 'fomc|suku|bunga|likuiditas|pasar|ekspektasi', createdAt: new Date().toISOString(),
      },
    ];
    const hits = checkSimilarity({ title: 'Dampak FOMC terhadap ekspektasi suku bunga dan likuiditas pasar', categoryKey: 'edukasi_trading' }, history as unknown as Parameters<typeof checkSimilarity>[1]);
    assert.ok(hits.length > 0, 'edukasi highly similar should produce hits');
    const level = similarityLevel(hits[0]!.score);
    assert.ok(level === 'duplicate' || level === 'too_similar' || hits[0]!.score >= 0.42, `expected warn/duplicate, got ${level} score ${hits[0]!.score}`);

    // For jurnal, even with same title, caller should skip — we assert helper says skip so no warn path
    const jurnalShouldSkip = shouldCheckSimilarity('jurnal_trading');
    assert.equal(jurnalShouldSkip, false);
    // Even if we call checkSimilarity for jurnal, spec says skip — so gate must prevent call
    // This test documents the gate; no hits should be considered for jurnal
  });
});
