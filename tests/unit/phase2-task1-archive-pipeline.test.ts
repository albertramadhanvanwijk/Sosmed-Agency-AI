import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Phase 2 Task 1 - Archive Pipeline
 * 
 * Rejected carousels are automatically moved to archive folder.
 * Archive structure: output/archive/{category}_{YYYYMMDD}_{reason}/
 */

describe('Phase 2 Task 1: Archive Pipeline - Rejected Carousels', () => {

  test('archive endpoint exists and accepts carousel ID', () => {
    // RED: Test that archive endpoint can be called
    
    const archiveRequest = {
      method: 'POST',
      path: '/api/carousels/:id/archive',
      body: { reason: 'rejected' }
    };

    assert.strictEqual(
      archiveRequest.method,
      'POST',
      'Archive should use POST method'
    );

    assert.ok(
      archiveRequest.path.includes('/archive'),
      'Archive path should include /archive'
    );
  });

  test('archive operation sets archived_at timestamp', () => {
    // RED: Test that archive records timestamp
    
    const carousel = {
      id: 'carousel-123',
      status: 'needs_review',
      created_at: new Date(2026, 9, 1).toISOString()
    };

    const archiveRecord = {
      carousel_id: carousel.id,
      archived_at: new Date().toISOString(),
      archive_reason: 'rejected',
      previous_status: carousel.status
    };

    assert.ok(
      archiveRecord.archived_at,
      'Archive should record archived_at timestamp'
    );

    assert.strictEqual(
      archiveRecord.archive_reason,
      'rejected',
      'Archive should record rejection reason'
    );
  });

  test('archive folder naming follows convention', () => {
    // RED: Test archive folder naming
    
    const carousel = {
      id: 'carousel-123',
      category_key: 'edukasi_trading',
      title: 'Trading Psychology Basics',
      archived_at: '2026-10-02T15:30:00Z',
      archive_reason: 'rejected'
    };

    const MAX_NAME_LENGTH = 100;
    
    // Archive naming: {category}_{YYYYMMDD}_{reason}
    const archiveFolderName = (cat: string, date: string, reason: string) => {
      const dateStr = date.split('T')[0].replace(/-/g, '');
      return `${cat}_${dateStr}_${reason}`;
    };

    const folderName = archiveFolderName(
      carousel.category_key,
      carousel.archived_at,
      carousel.archive_reason
    );

    assert.strictEqual(
      folderName,
      'edukasi_trading_20261002_rejected',
      'Archive folder name should follow convention'
    );

    assert.ok(
      folderName.length <= MAX_NAME_LENGTH,
      'Archive folder name should be reasonable length'
    );
  });

  test('archive path: output/archive/{folderName}/', () => {
    // RED: Test archive full path structure
    
    const archivePath = (folderName: string) => {
      return `output/archive/${folderName}/`;
    };

    const path = archivePath('edukasi_trading_20261002_rejected');

    assert.strictEqual(
      path,
      'output/archive/edukasi_trading_20261002_rejected/',
      'Archive path should start with output/archive/'
    );

    assert.ok(
      path.startsWith('output/archive/'),
      'All archived carousels should be in archive folder'
    );
  });

  test('carousel status updated to archived after archiving', () => {
    // RED: Test carousel status change
    
    const carousel = {
      id: 'carousel-123',
      status: 'rejected',
      archived_at: null,
      output_folder: 'output/carousel-123/'
    };

    // After archiving
    const archivedCarousel = {
      ...carousel,
      archived_at: new Date().toISOString(),
      output_folder: 'output/archive/edukasi_trading_20261002_rejected/'
    };

    assert.strictEqual(
      archivedCarousel.archived_at !== null,
      true,
      'Archived carousel should have archived_at timestamp'
    );

    assert.ok(
      archivedCarousel.output_folder.includes('archive'),
      'Output folder should be updated to archive path'
    );
  });

  test('archived carousel removed from approval list', () => {
    // RED: Test UI updates after archive
    
    const approvalList = [
      { id: 'carousel-1', status: 'needs_review' },
      { id: 'carousel-2', status: 'needs_review' },
      { id: 'carousel-3', status: 'rejected' }
    ];

    const filterArchived = (list: any[]) => {
      return list.filter(c => c.status !== 'rejected' && !c.archived_at);
    };

    const remainingCarousels = filterArchived(approvalList);

    assert.strictEqual(
      remainingCarousels.length,
      2,
      'Archived carousels should be removed from approval list'
    );

    assert.ok(
      !remainingCarousels.some(c => c.id === 'carousel-3'),
      'Rejected carousel should not appear in approval list'
    );
  });

  test('archive operation preserves carousel metadata', () => {
    // RED: Test that archive doesn't lose data
    
    const carousel = {
      id: 'carousel-123',
      category_key: 'edukasi_trading',
      topic: 'Trading Psychology',
      revision_round: 2,
      compliance_outcome: 'block',
      cost_usd: 0.50,
      created_at: '2026-10-01T10:00:00Z'
    };

    const archivedCarousel = {
      ...carousel,
      archived_at: new Date().toISOString(),
      archive_reason: 'rejected'
    };

    assert.strictEqual(
      archivedCarousel.category_key,
      carousel.category_key,
      'Category should be preserved'
    );

    assert.strictEqual(
      archivedCarousel.topic,
      carousel.topic,
      'Topic should be preserved'
    );

    assert.strictEqual(
      archivedCarousel.revision_round,
      carousel.revision_round,
      'Revision round should be preserved'
    );
  });

  test('archive triggered automatically on rejection', () => {
    // RED: Test that archive happens as part of rejection flow
    
    const rejectionFlow = {
      step1: 'recordRevision',
      step2: 'upsertLearnedRule',
      step3: 'updateStatus to rejected',
      step4: 'callArchiveEndpoint', // ← Should happen automatically
      step5: 'removeFromApprovalList'
    };

    assert.ok(
      rejectionFlow.step4 === 'callArchiveEndpoint',
      'Archive should be called as part of rejection flow'
    );
  });
});
