# Phase 1 Implementation Plan - Critical Fixes

**Date:** 2026-10-03
**Priority:** CRITICAL - Must complete before Phase 2
**Estimated Time:** 8-12 hours
**Risk Level:** High (business logic changes)

---

## Goals

Fix 3 critical business logic issues in rejection workflow:
1. **Item 2:** Rejection should NOT show revision form
2. **Item 3:** Rejection should NOT queue production pipeline
3. **Item 5:** Implement max revision limit (prevent infinite loops)

**Success Criteria:**
- ✅ Reject flow works without requiring revision notes
- ✅ Rejected carousels do NOT create new production jobs
- ✅ UI prevents revision after 3 rounds
- ✅ All existing tests still pass
- ✅ New tests cover rejection edge cases

---

## Task 1: Fix Rejection Form - Remove Revision Requirements

**Files to Modify:**
- `packages/studio/ui-js.ts` - openReviseForm, decide functions
- `packages/studio/server.ts` - decision endpoint validation

**Current Problem:**
```
User clicks "Ditolak" button
↓
openReviseForm() called (same form for both reject & revise)
↓
Form shows: "Catatan Anda (wajib diisi)"
↓
Server validation (line 731): if (decision !== 'approved' && note.length < 5) FAIL
↓
User forced to enter revision notes for rejection ← WRONG!
```

**Solution Design:**

1. **UI Changes:**
   - Split: Create separate rejection confirmation dialog
   - Dialog: "Tolak carousel ini?" with confirmation buttons
   - Optional: Small textarea for rejection notes (optional, not required)
   - Keep: Existing revision form for "Minta Revisi" only

2. **Server Changes:**
   - Update validation: `if (decision === 'changes_requested' && note.length < 5) FAIL`
   - Allow: `decision === 'rejected'` with empty note
   - Always record: rejection without forcing note (note can be null/empty)

**Implementation Steps:**

Step 1: Create rejection dialog in ui-js.ts
```javascript
function openRejectDialog(id) {
  // Simple confirmation dialog
  // Optional notes field (not required)
  // Cancel / Confirm buttons
}
```

Step 2: Update decide() function
```javascript
// Current calls openReviseForm for all non-approved
// New: Check decision type:
//   - 'changes_requested' → openReviseForm (require note)
//   - 'rejected' → openRejectDialog (optional note)
//   - 'approved' → direct approval
```

Step 3: Update server validation
```typescript
// Current (line 731):
if (decision !== 'approved' && note.length < 5) fail()

// Fixed:
if (decision === 'changes_requested' && note.length < 5) fail()
if (decision === 'rejected' && note.length > 0 && note.length < 5) fail()
```

**Tests to Write:**
- ✅ Rejection without notes succeeds
- ✅ Rejection with short notes (< 5 chars) succeeds
- ✅ Revision (changes_requested) requires notes
- ✅ Revision with short notes fails
- ✅ Approval succeeds without notes

---

## Task 2: Fix Rejection Pipeline - Don't Queue Production

**Files to Modify:**
- `packages/studio/server.ts` - decision endpoint (lines 749-807)

**Current Problem:**
```
POST /api/carousels/:id/decision
body: { decision: 'rejected', note: '...' }

↓ Server processing:

if (decision !== 'approved') {
  recordRevision() ✅
  upsertLearnedRule() ✅
  
  if (body.autoRevise === true) {    ← PROBLEM!
    runProduction() ✅ FOR CHANGES_REQUESTED
    runProduction() ✅ FOR REJECTED (WRONG!)
  }
}
```

**Issue:** `autoRevise` flag applies to BOTH rejected and changes_requested
- Rejected carousel should NEVER create new production
- Only changes_requested with autoRevise=true should create production

**Solution:**
```typescript
// Current (line 782):
if (body.autoRevise === true) {
  // runs for both 'rejected' and 'changes_requested'
}

// Fixed:
if (decision === 'changes_requested' && body.autoRevise === true) {
  runProduction(...)
}

// For rejected: skip production entirely
```

**Implementation:**
1. Find: Line 782 in server.ts: `if (body.autoRevise === true)`
2. Change to: `if (decision === 'changes_requested' && body.autoRevise === true)`
3. Verify: rejection flow now only does recordRevision + upsertLearnedRule

**Tests to Write:**
- ✅ Rejection with autoRevise=true does NOT queue job
- ✅ Rejection response: revised.jobQueued = false
- ✅ Revision with autoRevise=true DOES queue job
- ✅ Revision response: revised.jobQueued = true
- ✅ Revision without autoRevise does NOT queue job

---

## Task 3: Implement Revision Limit - Max 3 Rounds

**Files to Modify:**
- `packages/studio/server.ts` - decision endpoint
- `packages/studio/ui-js.ts` - button enabling logic
- `packages/studio/ui-css.ts` - warning styling

**Current Problem:**
```
No limit on revision rounds
↓
Possible: Revise 1 → Revise 2 → Revise 3 → Revise 4 → ...
↓
Risk: Infinite loop or circular approval
↓
Need: Max 3 revisions, then must approve/reject
```

**Solution Design:**

1. **Config:** Add MAX_REVISIONS = 3 (configurable)
2. **Logic:**
   - Track: `carousel.revision_round` (incremented each revise)
   - Check: Before allowing revision request
   - Enforce: If revision_round >= 3, show warning & disable "Minta Revisi"
   - Force: Only "Setujui" or "Tolak" available after 3 revisions

3. **UI Behavior:**
   - Revision 1/3: Show "Minta Revisi" button normally
   - Revision 2/3: Show "Minta Revisi" button, add counter badge "2/3"
   - Revision 3/3: Disable "Minta Revisi", show warning: "Sudah 3x revisi. Sebaiknya Setujui atau Tolak?"
   - After rejection: Carousel locked (no more actions)

**Implementation:**

Step 1: Update server validation
```typescript
const MAX_REVISIONS = 3;

if (decision === 'changes_requested') {
  if (row.revision_round >= MAX_REVISIONS) {
    fail(res, 409, `Sudah ${MAX_REVISIONS} kali revisi. Sebaiknya approve atau reject.`);
    return;
  }
}
```

Step 2: Update UI button logic
```javascript
function updateDecisionButtons(carousel) {
  const revisionCount = carousel.revision_round;
  const maxRevisions = 3;
  
  const reviseBtn = $('btn-revise');
  
  if (revisionCount >= maxRevisions) {
    reviseBtn.disabled = true;
    reviseBtn.title = `Sudah ${revisionCount}/${maxRevisions} revisi`;
    
    // Show warning
    showWarning(`Carousel sudah direvisi ${revisionCount} kali. Silakan approve atau reject.`);
  } else {
    reviseBtn.disabled = false;
    if (revisionCount > 0) {
      reviseBtn.textContent = `Minta Revisi (${revisionCount}/${maxRevisions})`;
    }
  }
}
```

Step 3: Add UI styling
```css
.revision-warning {
  background: #FEF3C7;
  border-left: 4px solid #F59E0B;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.revision-warning .icon { font-size: 18px; }
```

**Tests to Write:**
- ✅ First revision allowed (revision_round=0→1)
- ✅ Second revision allowed (revision_round=1→2)
- ✅ Third revision allowed (revision_round=2→3)
- ✅ Fourth revision BLOCKED (revision_round=3)
- ✅ Error message clear when limit reached
- ✅ UI buttons updated correctly per revision count
- ✅ Rejection after revision allowed (separate flow)

---

## Integration Requirements

**Database Changes Needed:**
None - `revision_round` field already exists in carousels table

**API Changes:**
None - existing endpoints, just different validation logic

**UI Changes:**
- Add rejection confirmation dialog
- Update button enabling logic
- Add revision counter badge
- Add warning message styling

**Backward Compatibility:**
- ✅ Existing carousels unaffected
- ✅ Existing approved/rejected carousels unchanged
- ✅ Only affects NEW rejection/revision requests

---

## Test Strategy

**Unit Tests:**
1. Server validation logic (node --test)
2. UI button state changes
3. Revision counter calculation

**Integration Tests:**
1. Complete rejection flow (no notes, no production)
2. Complete revision flow (with notes, produces new carousel)
3. Multiple revisions up to limit
4. Attempt revision beyond limit (blocked)

**Manual Testing:**
1. Reject carousel → should NOT ask for notes
2. Reject carousel → should NOT appear in "Perlu Review" again
3. Revise carousel → should ask for notes
4. Revise 3 times → 4th revise blocked
5. After 3 revisions → only approve/reject available

---

## Rollout Plan

1. **Phase 1a:** Implement & test Task 1 (rejection form)
2. **Phase 1b:** Implement & test Task 2 (rejection pipeline)
3. **Phase 1c:** Implement & test Task 3 (revision limit)
4. **Full Test:** Run complete test suite
5. **Code Review:** Request review before merge
6. **Merge:** When all tests passing + review approved

---

## Success Metrics

- ✅ 100% of tests passing (current 134 + new tests for Phase 1)
- ✅ Rejection flow works without revision notes
- ✅ No production jobs queued for rejections
- ✅ Revision limit enforced at 3 rounds
- ✅ UI clearly shows revision count
- ✅ No regression in existing functionality

---

**Next Step:** Create implementation tasks from this plan

