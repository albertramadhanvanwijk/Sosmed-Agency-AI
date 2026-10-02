# SDD ledger — plan: docs/superpowers/plans/2026-10-03-phase1-critical-fixes.md

## Plan Overview
Phase 1: 3 critical business logic fixes untuk Studio
- Task 1: Fix rejection form - remove revision requirements
- Task 2: Fix rejection pipeline - don't queue production
- Task 3: Implement revision limit - max 3 rounds safety

## Pre-flight Scan
- Spec: docs/superpowers/specs/IMPROVEMENTS-PHASE2.md (Items 2, 3, 5)
- No shared state between tasks
- All tasks modify: ui-js.ts, server.ts, ui-css.ts
- Database: No schema changes needed (revision_round exists)

## Task Progress

### Task 1: Fix Rejection Form - Remove Revision Requirements
✅ **COMPLETE** (commit 6cdc125)

Tests: 5/5 pass
- Rejection without notes accepted by server
- Rejection uses simple dialog (not form)
- Rejection note is optional but stored if provided
- Revision request MUST have notes, rejection MAY have notes
- UI buttons trigger appropriate dialog/form

Changes:
- server.ts line 731-734: Updated validation to allow empty notes for rejection
- ui-js.ts: Created openRejectDialog() function for rejection confirmation
- ui-js.ts line 299, 467: Updated button handlers to call openRejectDialog for rejection

---

### Task 2: Fix Rejection Pipeline - Don't Queue Production

**Status:** Starting

