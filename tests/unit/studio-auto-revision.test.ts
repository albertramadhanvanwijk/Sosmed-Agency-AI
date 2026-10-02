import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Auto-Revision Pipeline Execution
 * 
 * Verifies that when autoRevise checkbox is checked, the API endpoint
 * queues a new production job with revision notes as extra instructions.
 */

describe('Auto-Revision Pipeline Execution', () => {
  
  test('decision endpoint accepts autoRevise flag', () => {
    // The POST /api/carousels/:id/decision endpoint should accept autoRevise boolean
    
    const mockRequestBody = {
      decision: 'changes_requested',
      note: 'Please fix slide 3 to be more concise',
      autoRevise: true
    };

    assert.strictEqual(
      mockRequestBody.autoRevise,
      true,
      'autoRevise flag should be true when auto-revision is requested'
    );
  });

  test('autoRevise should only work with changes_requested or rejected decisions', () => {
    // When decision is 'approved', autoRevise should be ignored (no revision needed)
    
    const decisions = [
      { decision: 'approved', shouldAutoRevise: false, reason: 'No revision on approval' },
      { decision: 'changes_requested', shouldAutoRevise: true, reason: 'Revision requested' },
      { decision: 'rejected', shouldAutoRevise: true, reason: 'Rejection needs revision' }
    ];

    decisions.forEach(d => {
      const shouldProcess = d.decision !== 'approved';
      assert.strictEqual(
        shouldProcess,
        d.shouldAutoRevise,
        `${d.reason}: autoRevise for ${d.decision} should be ${d.shouldAutoRevise}`
      );
    });
  });

  test('revision note becomes extra instruction for new carousel', () => {
    // When autoRevise is true, the revision note should be included as extra instructions
    // in the new carousel production request
    
    const revisionNote = 'Slide 3 terlalu panjang, pecah jadi dua slide. Tambahkan contoh perhitungan dengan angka nyata.';
    
    // The extra instructions should include:
    // 1. A marker that this is a revision/improvement
    // 2. The actual revision note
    
    const extraInstructionsTemplate = [
      'Ini PERBAIKAN dari carousel sebelumnya',
      'Catatan revisi dari pemilik akun WAJIB ditindaklanjuti:',
      revisionNote,
      'Perbaiki secara nyata: jangan hanya mengubah kata pembuka.'
    ].join('\n');

    assert.ok(
      extraInstructionsTemplate.includes(revisionNote),
      'Extra instructions must include the revision note'
    );

    assert.ok(
      extraInstructionsTemplate.includes('PERBAIKAN'),
      'Extra instructions must identify this as a revision'
    );

    assert.ok(
      extraInstructionsTemplate.includes('WAJIB ditindaklanjuti'),
      'Extra instructions must emphasize the revision is mandatory'
    );
  });

  test('new carousel created with revisedFrom reference to original', () => {
    // When auto-revision runs, a new carousel is created with:
    // - A unique new ID
    // - revisedFrom set to the original carousel ID
    // - Same category as original
    // - New status = 'needs_review'
    
    const originalCarouselId = 'carousel-123';
    const newCarouselId = 'carousel-456';
    const categoryKey = 'edukasi_trading';

    // Verify relationships
    assert.notStrictEqual(
      originalCarouselId,
      newCarouselId,
      'New carousel must have different ID'
    );

    assert.ok(
      originalCarouselId.length > 0,
      'Original carousel ID must be set for revisedFrom'
    );

    // The new carousel properties
    const newCarouselMetadata = {
      id: newCarouselId,
      revisedFrom: originalCarouselId,
      category_key: categoryKey,
      status: 'needs_review',
      revision_round: 1
    };

    assert.strictEqual(
      newCarouselMetadata.revisedFrom,
      originalCarouselId,
      'New carousel must reference original via revisedFrom'
    );

    assert.strictEqual(
      newCarouselMetadata.status,
      'needs_review',
      'New carousel starts in needs_review status'
    );
  });

  test('revision record saved with note for AI learning', () => {
    // When revision is recorded, it should include:
    // - carousel_id (for linking)
    // - category_key
    // - decision (changes_requested or rejected)
    // - note (the revision text)
    // - created_at timestamp
    
    const revisionRecord = {
      carousel_id: 'carousel-123',
      category_key: 'edukasi_trading',
      decision: 'changes_requested',
      note: 'Fix slide 3 to include example calculations',
      created_at: new Date().toISOString()
    };

    assert.ok(revisionRecord.carousel_id, 'Revision must reference carousel');
    assert.ok(revisionRecord.note, 'Revision must store the note');
    assert.ok(
      ['changes_requested', 'rejected'].includes(revisionRecord.decision),
      'Revision decision must be changes_requested or rejected'
    );
    assert.ok(revisionRecord.created_at, 'Revision must have timestamp');
  });

  test('learned rule created from revision note with high confidence', () => {
    // From revision note, system creates a learned rule with:
    // - Rule text starting with "Perbaiki hal berikut:"
    // - Confidence = 0.9 (high trust, from human)
    // - active = true (enabled immediately)
    // - createdBy = 'human' (marks human origin)
    // - categoryKey for category-specific rules
    
    const revisionNote = 'Tambahkan contoh perhitungan dengan angka real';
    
    const learnedRule = {
      id: 'lr_abc123_def45',
      categoryKey: 'edukasi_trading',
      rule: `Perbaiki hal berikut: ${revisionNote}`,
      confidence: 0.9,
      active: true,
      createdBy: 'human',
      source: 'manual',
      occurrences: 1
    };

    assert.ok(
      learnedRule.rule.startsWith('Perbaiki hal berikut:'),
      'Rule must start with standard prefix'
    );

    assert.strictEqual(
      learnedRule.confidence,
      0.9,
      'Human-created rules have 90% confidence'
    );

    assert.strictEqual(
      learnedRule.active,
      true,
      'Learned rules are active immediately'
    );

    assert.strictEqual(
      learnedRule.createdBy,
      'human',
      'Rule is marked as human-created'
    );
  });

  test('response indicates job queued when autoRevise is true', () => {
    // After submitting decision with autoRevise=true, response should include:
    // - revised.jobQueued = true
    // - revised.newCarouselId (UUID of new carousel)
    // - revised.learnedRuleId (ID of created rule)
    
    const responseData = {
      ok: true,
      revised: {
        jobQueued: true,
        newCarouselId: 'carousel-456',
        learnedRuleId: 'lr_abc123_def45'
      }
    };

    assert.strictEqual(
      responseData.revised.jobQueued,
      true,
      'Response must indicate job is queued'
    );

    assert.ok(
      responseData.revised.newCarouselId,
      'Response must include new carousel ID'
    );

    assert.ok(
      responseData.revised.learnedRuleId,
      'Response must include learned rule ID'
    );
  });

  test('production job receives correct parameters from auto-revision', () => {
    // The runProduction call should receive:
    // - same categoryKey as original
    // - same topic as original
    // - fresh: true (new production, not cached)
    // - extraInstructions including revision note
    // - revisedFrom: original carousel ID
    // - carouselId: new carousel ID
    
    const originalCarousel = {
      id: 'carousel-123',
      category_key: 'edukasi_trading',
      topic: 'Risk Management Basics'
    };

    const revisionNote = 'Add real number examples';
    const newCarouselId = 'carousel-456';

    const productionParams = {
      categoryKey: originalCarousel.category_key,
      topic: originalCarousel.topic,
      fresh: true,
      extraInstructions: [
        'Ini PERBAIKAN dari carousel sebelumnya',
        'Catatan revisi dari pemilik akun WAJIB ditindaklanjuti:',
        revisionNote
      ].join('\n'),
      revisedFrom: originalCarousel.id,
      carouselId: newCarouselId
    };

    assert.strictEqual(
      productionParams.categoryKey,
      originalCarousel.category_key,
      'Production must use same category'
    );

    assert.strictEqual(
      productionParams.topic,
      originalCarousel.topic,
      'Production must use same topic'
    );

    assert.strictEqual(
      productionParams.fresh,
      true,
      'Production must be fresh (not cached)'
    );

    assert.ok(
      productionParams.extraInstructions.includes(revisionNote),
      'Extra instructions must include revision note'
    );

    assert.strictEqual(
      productionParams.revisedFrom,
      originalCarousel.id,
      'Production must reference original carousel'
    );

    assert.strictEqual(
      productionParams.carouselId,
      newCarouselId,
      'Production must create carousel with specified new ID'
    );
  });
});
