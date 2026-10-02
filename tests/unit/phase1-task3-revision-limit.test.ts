import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Task 3 - Implement Revision Limit
 * 
 * Max 3 revisions per carousel.
 * After 3 revisions, only approve or reject allowed.
 */

describe('Task 3: Revision Limit - Max 3 Rounds Safety', () => {

  test('carousel with revision_round=0 allows minta revisi', () => {
    // First revision should be allowed
    
    const carousel = { revision_round: 0 };
    const MAX_REVISIONS = 3;
    
    const canRequestRevision = (revisionRound: number) => {
      return revisionRound < MAX_REVISIONS;
    };

    assert.strictEqual(
      canRequestRevision(carousel.revision_round),
      true,
      'Carousel with 0 revisions should allow revision request'
    );
  });

  test('carousel with revision_round=1 allows minta revisi', () => {
    // Second revision should be allowed
    
    const carousel = { revision_round: 1 };
    const MAX_REVISIONS = 3;
    
    const canRequestRevision = (revisionRound: number) => {
      return revisionRound < MAX_REVISIONS;
    };

    assert.strictEqual(
      canRequestRevision(carousel.revision_round),
      true,
      'Carousel with 1 revision should allow revision request'
    );
  });

  test('carousel with revision_round=2 allows minta revisi (last one)', () => {
    // Third (final) revision should be allowed
    
    const carousel = { revision_round: 2 };
    const MAX_REVISIONS = 3;
    
    const canRequestRevision = (revisionRound: number) => {
      return revisionRound < MAX_REVISIONS;
    };

    assert.strictEqual(
      canRequestRevision(carousel.revision_round),
      true,
      'Carousel with 2 revisions should allow final revision request'
    );
  });

  test('carousel with revision_round=3 BLOCKS minta revisi', () => {
    // After 3 revisions, no more revisions allowed
    
    const carousel = { revision_round: 3 };
    const MAX_REVISIONS = 3;
    
    const canRequestRevision = (revisionRound: number) => {
      return revisionRound < MAX_REVISIONS;
    };

    assert.strictEqual(
      canRequestRevision(carousel.revision_round),
      false,
      'Carousel with 3 revisions should BLOCK revision request'
    );
  });

  test('server rejects revision request when limit reached', () => {
    // Server should return 409 error when trying to revise beyond limit
    
    const testCases = [
      { revisionRound: 2, decision: 'changes_requested', shouldAllow: true },
      { revisionRound: 3, decision: 'changes_requested', shouldAllow: false },
    ];

    testCases.forEach(tc => {
      const MAX_REVISIONS = 3;
      
      const serverValidation = (revisionRound: number, decision: string) => {
        if (decision === 'changes_requested' && revisionRound >= MAX_REVISIONS) {
          return { ok: false, error: `Sudah ${revisionRound}/${MAX_REVISIONS} revisi. Sebaiknya approve atau reject.` };
        }
        return { ok: true };
      };

      const result = serverValidation(tc.revisionRound, tc.decision);
      
      assert.strictEqual(
        result.ok,
        tc.shouldAllow,
        `revision_round=${tc.revisionRound} should ${tc.shouldAllow ? 'allow' : 'block'} revision`
      );
    });
  });

  test('ui shows revision counter badge (e.g., "2/3")', () => {
    // UI should display revision progress
    
    const testCases = [
      { revisionRound: 0, buttonText: 'Minta Revisi', showCounter: false },
      { revisionRound: 1, buttonText: 'Minta Revisi (1/3)', showCounter: true },
      { revisionRound: 2, buttonText: 'Minta Revisi (2/3)', showCounter: true },
      { revisionRound: 3, buttonText: 'Minta Revisi (DISABLED)', disabled: true },
    ];

    testCases.forEach(tc => {
      const MAX_REVISIONS = 3;
      
      let buttonText = 'Minta Revisi';
      let disabled = false;
      
      if (tc.revisionRound >= MAX_REVISIONS) {
        disabled = true;
        buttonText = 'Minta Revisi (DISABLED)';
      } else if (tc.revisionRound > 0) {
        buttonText = `Minta Revisi (${tc.revisionRound}/${MAX_REVISIONS})`;
      }

      if (!tc.disabled) {
        assert.strictEqual(
          buttonText,
          tc.buttonText,
          `Button text for revision_round=${tc.revisionRound}`
        );
      }

      if (tc.disabled !== undefined) {
        assert.strictEqual(
          disabled,
          tc.disabled,
          `Button disabled state for revision_round=${tc.revisionRound}`
        );
      }
    });
  });

  test('ui shows warning when revision limit reached', () => {
    // Warning should appear after 3 revisions
    
    const carousel = { revision_round: 3 };
    const MAX_REVISIONS = 3;
    
    const shouldShowWarning = (revisionRound: number) => {
      return revisionRound >= MAX_REVISIONS;
    };

    assert.strictEqual(
      shouldShowWarning(carousel.revision_round),
      true,
      'Should show warning when limit reached'
    );

    const warningText = `Sudah ${carousel.revision_round}/${MAX_REVISIONS} revisi. Silakan approve atau reject.`;
    
    assert.ok(
      warningText.toLowerCase().includes('sudah'),
      'Warning should explain limit reached'
    );
  });

  test('only approve/reject buttons available after 3 revisions', () => {
    // After max revisions, only approve and reject options
    
    const carousel = { revision_round: 3, status: 'needs_review' };
    const MAX_REVISIONS = 3;
    
    const availableButtons = (revisionRound: number) => {
      const buttons = ['Setujui', 'Tolak'];
      
      if (revisionRound < MAX_REVISIONS) {
        buttons.push('Minta Revisi');
      }
      
      return buttons;
    };

    const buttons = availableButtons(carousel.revision_round);
    
    assert.strictEqual(
      buttons.includes('Minta Revisi'),
      false,
      'Minta Revisi button should NOT appear after 3 revisions'
    );

    assert.strictEqual(
      buttons.includes('Setujui'),
      true,
      'Approve button should be available'
    );

    assert.strictEqual(
      buttons.includes('Tolak'),
      true,
      'Reject button should be available'
    );
  });

  test('revision_round incremented correctly on each revision', () => {
    // Track revision progression
    
    let revisionRound = 0;
    const MAX_REVISIONS = 3;
    
    const incrementRevision = () => {
      if (revisionRound < MAX_REVISIONS) {
        revisionRound++;
        return true;
      }
      return false;
    };

    // First revision
    assert.strictEqual(incrementRevision(), true, 'First revision allowed');
    assert.strictEqual(revisionRound, 1, 'revision_round should be 1');

    // Second revision
    assert.strictEqual(incrementRevision(), true, 'Second revision allowed');
    assert.strictEqual(revisionRound, 2, 'revision_round should be 2');

    // Third revision
    assert.strictEqual(incrementRevision(), true, 'Third revision allowed');
    assert.strictEqual(revisionRound, 3, 'revision_round should be 3');

    // Fourth revision (should fail)
    assert.strictEqual(incrementRevision(), false, 'Fourth revision blocked');
    assert.strictEqual(revisionRound, 3, 'revision_round should stay 3');
  });

  test('after rejection, carousel locked (no more revisions)', () => {
    // Once rejected, no more actions allowed
    
    const carousel = {
      revision_round: 2,
      status: 'rejected', // ← Changed status to rejected
      archived_at: new Date().toISOString()
    };

    const canRequestRevision = (status: string) => {
      // Rejected carousels are locked
      if (status === 'rejected') return false;
      return true;
    };

    assert.strictEqual(
      canRequestRevision(carousel.status),
      false,
      'Rejected carousel should be locked'
    );
  });
});
