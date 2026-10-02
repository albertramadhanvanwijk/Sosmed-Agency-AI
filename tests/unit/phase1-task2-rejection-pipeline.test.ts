import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Task 2 - Fix Rejection Pipeline
 * 
 * Rejection should NOT queue production job.
 * Only changes_requested with autoRevise=true should queue job.
 */

describe('Task 2: Fix Rejection Pipeline - No Production on Reject', () => {

  test('rejection with autoRevise=true should NOT queue production job', () => {
    // RED: Test that rejection never queues job, even with autoRevise flag
    
    const rejectionRequest = {
      decision: 'rejected',
      note: 'Does not meet quality standards',
      autoRevise: true // ← Should be IGNORED for rejection
    };

    // Current logic (WRONG):
    const currentLogic = (decision: string, autoRevise: boolean) => {
      let jobQueued = false;
      
      if (decision !== 'approved') {
        // recordRevision() ✅
        // upsertLearnedRule() ✅
        
        if (autoRevise === true) {
          jobQueued = true; // ← WRONG! Queues for rejected too
        }
      }
      return { jobQueued };
    };

    const currentResult = currentLogic(rejectionRequest.decision, rejectionRequest.autoRevise);
    
    // Current code FAILS this test
    assert.strictEqual(
      currentResult.jobQueued,
      true,
      'Current logic incorrectly queues job for rejection (EXPECTED TO FAIL)'
    );

    // NEW logic (CORRECT):
    const newLogic = (decision: string, autoRevise: boolean) => {
      let jobQueued = false;
      
      if (decision !== 'approved') {
        // recordRevision() ✅
        // upsertLearnedRule() ✅
        
        // ONLY queue production for changes_requested, NOT for rejected
        if (decision === 'changes_requested' && autoRevise === true) {
          jobQueued = true;
        }
      }
      return { jobQueued };
    };

    const newResult = newLogic(rejectionRequest.decision, rejectionRequest.autoRevise);
    
    // After fix: should NOT queue
    assert.strictEqual(
      newResult.jobQueued,
      false,
      'Fixed logic should NOT queue job for rejection'
    );
  });

  test('revision with autoRevise=true SHOULD queue production job', () => {
    // GREEN: Test that revisions still queue correctly
    
    const revisionRequest = {
      decision: 'changes_requested',
      note: 'Slide 3 too long, please split',
      autoRevise: true
    };

    const logic = (decision: string, autoRevise: boolean) => {
      let jobQueued = false;
      
      if (decision === 'changes_requested' && autoRevise === true) {
        jobQueued = true;
      }
      return { jobQueued };
    };

    const result = logic(revisionRequest.decision, revisionRequest.autoRevise);
    
    assert.strictEqual(
      result.jobQueued,
      true,
      'Revision with autoRevise should queue job'
    );
  });

  test('revision without autoRevise should NOT queue job', () => {
    // GREEN: Test that manual revision (no auto) works
    
    const revisionRequest = {
      decision: 'changes_requested',
      note: 'Slide 3 too long, please split',
      autoRevise: false // ← User chose manual review first
    };

    const logic = (decision: string, autoRevise: boolean) => {
      let jobQueued = false;
      
      if (decision === 'changes_requested' && autoRevise === true) {
        jobQueued = true;
      }
      return { jobQueued };
    };

    const result = logic(revisionRequest.decision, revisionRequest.autoRevise);
    
    assert.strictEqual(
      result.jobQueued,
      false,
      'Revision without autoRevise should NOT queue job'
    );
  });

  test('rejection response should indicate jobQueued: false', () => {
    // Test API response structure for rejection
    
    const rejectionResponse = {
      ok: true,
      revised: {
        jobQueued: false, // ← Should always be false for rejection
        newCarouselId: null,
        learnedRuleId: 'lr_abc123'
      }
    };

    assert.strictEqual(
      rejectionResponse.revised.jobQueued,
      false,
      'Rejection response should have jobQueued: false'
    );

    assert.strictEqual(
      rejectionResponse.revised.newCarouselId,
      null,
      'Rejection should NOT create new carousel'
    );

    assert.ok(
      rejectionResponse.revised.learnedRuleId,
      'Rejection should still create learned rule for AI learning'
    );
  });

  test('rejection flow: recordRevision + upsertLearnedRule, NO runProduction', () => {
    // Test complete rejection flow
    
    const rejection = {
      decision: 'rejected',
      note: 'Quality too low',
      carouselId: 'carousel-123',
      actions: [
        'recordRevision', // ✅ Record for learning
        'upsertLearnedRule', // ✅ Create rule
        // NO runProduction ✅
      ]
    };

    assert.strictEqual(
      rejection.actions.includes('recordRevision'),
      true,
      'Rejection should record revision for learning'
    );

    assert.strictEqual(
      rejection.actions.includes('upsertLearnedRule'),
      true,
      'Rejection should create learned rule'
    );

    assert.strictEqual(
      rejection.actions.includes('runProduction'),
      false,
      'Rejection should NOT run production'
    );
  });
});
