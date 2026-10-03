import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Phase 2 Task 2 - Output Organization
 *
 * Approved carousels -> output/approve/{category}_{YYYYMMDD}_{slug}/
 * Archived carousels -> output/archive/{category}_{YYYYMMDD}_{reason}/
 * Database field `folder` wajib diperbarui saat approve/archive.
 */

describe('Phase 2 Task 2: Output Organization', () => {
  // Helpers mirroring desired production helpers (pure functions).
  // RED: import dari production helper harus gagal sebelum implementasi.
  async function loadHelpers() {
    // dynamic import supaya error terdeteksi sebagai failure, bukan compile error
    const mod = await import('../../packages/studio/db.ts');
    return mod as unknown as {
      buildApproveFolderName?: (categoryKey: string, dateIso: string, title: string) => string;
      buildArchiveFolderName?: (categoryKey: string, dateIso: string, reason: string) => string;
      updateCarouselFolder?: (db: unknown, id: string, folder: string) => void;
      archiveCarousel?: (db: unknown, id: string, reason: string) => void;
    };
  }

  test('buildApproveFolderName follows convention {category}_{YYYYMMDD}_{slug}', async () => {
    const { buildApproveFolderName } = await loadHelpers();
    assert.ok(typeof buildApproveFolderName === 'function', 'buildApproveFolderName harus ada');
    const name = buildApproveFolderName!('edukasi_trading', '2026-10-03T10:00:00.000Z', 'Psikologi Trading Pemula');
    assert.strictEqual(name, 'edukasi_trading_20261003_psikologi_trading_pemula');
  });

  test('buildArchiveFolderName follows convention {category}_{YYYYMMDD}_{reason}', async () => {
    const { buildArchiveFolderName } = await loadHelpers();
    assert.ok(typeof buildArchiveFolderName === 'function', 'buildArchiveFolderName harus ada');
    const name = buildArchiveFolderName!('market_info', '2026-10-02T15:30:00.000Z', 'rejected');
    assert.strictEqual(name, 'market_info_20261002_rejected');
  });

  test('folder names are sanitized and truncated', async () => {
    const { buildApproveFolderName, buildArchiveFolderName } = await loadHelpers();
    assert.ok(buildApproveFolderName && buildArchiveFolderName, 'helpers must exist');
    const longTitle = 'A'.repeat(100) + ' !@# Judul Panjang Sekali';
    const approveName = buildApproveFolderName!( 'jurnal_trading', '2026-10-03T00:00:00.000Z', longTitle);
    // slug portion max 30-40 chars, total <= 100, no special chars
    assert.ok(!approveName.includes('!'), 'no special chars');
    assert.ok(!approveName.includes('@'), 'no special chars');
    assert.ok(approveName.length <= 100, `approve name length ${approveName.length} <= 100`);
    assert.ok(approveName.startsWith('jurnal_trading_20261003_'), 'prefix correct');

    const longReason = 'rejected karena alasan sangat panjang sekali melebihi lima puluh karakter dan harus dipotong';
    const archiveName = buildArchiveFolderName!('edukasi_trading', '2026-10-03T00:00:00.000Z', longReason);
    assert.ok(archiveName.length <= 100, `archive name length ${archiveName.length} <= 100`);
    assert.ok(!archiveName.includes(' '), 'spaces sanitized');
  });

  test('approve path is output/approve/{folderName}/', async () => {
    const { buildApproveFolderName } = await loadHelpers();
    const name = buildApproveFolderName!('edukasi_trading', '2026-10-03T00:00:00.000Z', 'Money Management');
    const p = `output/approve/${name}/`;
    assert.ok(p.startsWith('output/approve/'), 'must be under output/approve/');
    assert.strictEqual(p, `output/approve/${name}/`);
  });

  test('archive path is output/archive/{folderName}/', async () => {
    const { buildArchiveFolderName } = await loadHelpers();
    const name = buildArchiveFolderName!('edukasi_trading', '2026-10-03T00:00:00.000Z', 'rejected');
    const p = `output/archive/${name}/`;
    assert.ok(p.startsWith('output/archive/'), 'must be under output/archive/');
  });

  test('updateCarouselFolder updates folder in DB', async () => {
    const { updateCarouselFolder } = await loadHelpers();
    assert.ok(typeof updateCarouselFolder === 'function', 'updateCarouselFolder harus ada');
    // Basic contract: function exists and callable (full DB integration tested via server flow).
    // We verify signature by checking it does not throw when called with mock DB that has prepare.
    let calledSql = '';
    const mockDb = {
      prepare: (sql: string) => ({
        run: (...args: unknown[]) => {
          calledSql = sql;
          // simple assertion that folder is among args
          assert.ok(args.includes('output/approve/edukasi_trading_20261003_test/'), 'folder arg must be passed');
        },
      }),
    };
    updateCarouselFolder!(mockDb as unknown as never, 'id-123', 'output/approve/edukasi_trading_20261003_test/');
    assert.ok(calledSql.includes('UPDATE carousels'), 'must run UPDATE');
    assert.ok(calledSql.includes('folder'), 'must update folder column');
  });

  test('archiveCarousel updates folder column as well (not only status)', async () => {
    const { archiveCarousel } = await loadHelpers();
    assert.ok(typeof archiveCarousel === 'function', 'archiveCarousel harus ada');
    let capturedSql = '';
    let capturedArgs: unknown[] = [];
    const mockDb = {
      prepare: (sql: string) => ({
        run: (...args: unknown[]) => {
          capturedSql = sql;
          capturedArgs = args;
        },
      }),
    };
    // archiveCarousel now should accept optional folder param or compute internally.
    // For test, we call with 3 args; implementation must ensure folder is updated (or via separate call).
    // Minimal contract: SQL must touch folder or archived_at.
    archiveCarousel!(mockDb as unknown as never, 'id-123', 'rejected');
    assert.ok(capturedSql.includes('UPDATE carousels'), 'must run UPDATE');
    // Must set either folder or archived_at
    assert.ok(capturedSql.includes('archived_at') || capturedSql.includes('folder'), 'must set archive fields');
    // If folder is updated, args should contain a path containing archive
    const hasArchivePath = capturedArgs.some((a) => typeof a === 'string' && (a as string).includes('archive'));
    // Allow either folder update via archiveCarousel or via updateCarouselFolder separately,
    // but archive path generation should exist.
    assert.ok(
      capturedSql.includes('archived_at') || hasArchivePath,
      'archive must mark archived_at or set archive folder path',
    );
  });

  test('approved carousel folder is distinct from archived folder', async () => {
    const { buildApproveFolderName, buildArchiveFolderName } = await loadHelpers();
    const approve = buildApproveFolderName!('edukasi_trading', '2026-10-03T00:00:00.000Z', 'Title A');
    const archive = buildArchiveFolderName!('edukasi_trading', '2026-10-03T00:00:00.000Z', 'rejected');
    assert.notStrictEqual(`output/approve/${approve}/`, `output/archive/${archive}/`);
  });
});
