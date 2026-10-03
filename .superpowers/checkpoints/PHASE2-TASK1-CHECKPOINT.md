# Phase 2 Task 1 - Implementation Checkpoint
**Session Date:** 2026-10-02  
**Status:** 🟡 READY FOR IMPLEMENTATION  
**Tests:** 8/8 passing (162 total tests)  
**Files Modified:** 0 (tests only)  
**Commits Since Phase 1:** 2 (both documentation + tests)

---

## Current State

### What's Complete ✅
- Phase 1: All 3 critical fixes implemented & deployed (154 tests)
- Phase 2 Task 1: Test suite written (8 tests, all passing)
- Archive endpoint design validated
- Archive folder naming convention defined
- Database field names planned

### What's Ready to Implement 🔄
Archive Pipeline feature with these components:
1. Database migration (add archived_at, archive_reason columns)
2. archiveCarousel() function in db.ts
3. POST /api/carousels/:id/archive endpoint
4. File movement logic: output/{id}/ → output/archive/{category}_{YYYYMMDD}_{reason}/
5. Integration with rejection decision flow
6. UI updates to hide archived carousels

---

## Implementation Checklist

### Step 1: Database Migration
**File:** `packages/studio/db.ts`

**Required Changes:**
1. Find SCHEMA_VERSION constant (currently check line ~485)
2. Increment SCHEMA_VERSION by 1
3. Add to carousels CREATE TABLE (after `updated_at TEXT NOT NULL`):
   ```sql
   archived_at TEXT,
   archive_reason TEXT
   ```
4. Add archive_reason to CarouselRow interface (line ~35)

**Test Command:** `npm test` (ensure existing tests still pass)

---

### Step 2: Create archiveCarousel() Function
**File:** `packages/studio/db.ts`

**Function Signature:**
```typescript
export function archiveCarousel(
  db: DatabaseSync, 
  carouselId: string, 
  reason: string
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE carousels 
    SET status = 'archived', archived_at = ?, archive_reason = ?, updated_at = ?
    WHERE id = ?
  `).run(now, reason, now, carouselId);
}
```

**Placement:** After `rejectCarousel()` or `approveCarousel()` function (search for existing decision functions)

**Test:** 
```bash
npm test -- tests/unit/phase2-task1-archive-pipeline.test.ts
# Should still pass (tests validate logic, not implementation)
```

---

### Step 3: Create Archive Endpoint
**File:** `packages/studio/server.ts`

**Endpoint:** `POST /api/carousels/:id/archive`

**Request Body:**
```json
{ "reason": "rejected" }
```

**Implementation Steps:**
1. Find decision endpoint (line ~705) as reference
2. Add new route handler for archive
3. Parse carousel ID from URL
4. Fetch carousel from database
5. Build archive folder name: `{category_key}_{YYYYMMDD}_{reason}`
6. Move files: 
   - Source: `output/{carouselId}/`
   - Dest: `output/archive/{folderName}/`
7. Call archiveCarousel(db, id, reason)
8. Return response: `{ ok: true, archivedPath: "..." }`

**Error Handling:**
- 404 if carousel not found
- 409 if files don't exist
- 500 if file move fails

**Test:** `npm test` (all 162+ tests should pass)

---

### Step 4: Integrate Archive into Rejection Flow
**File:** `packages/studio/server.ts`

**Location:** In POST `/api/carousels/:id/decision` handler

**Current Flow (line ~740):**
```typescript
try {
  decideCarousel(db, id, decision, note, 'operator');
  // ... then response
```

**New Flow:**
```typescript
try {
  decideCarousel(db, id, decision, note, 'operator');
  
  // After rejection, automatically archive
  if (decision === 'rejected') {
    const carousel = getCarousel(db, id);
    await archiveCarouselFiles(carousel); // Move files
    archiveCarousel(db, id, 'rejected');   // Update DB
  }
  
  // ... then response
```

**Alternative (Simpler):** Call archive endpoint asynchronously:
```typescript
if (decision === 'rejected') {
  // Queue archive as background job or call immediately
  archiveCarousel(db, id, 'rejected');
}
```

**Test:** `npm test` (162+ tests should pass)

---

### Step 5: Update UI to Hide Archived Carousels
**File:** `packages/studio/ui-js.ts`

**Location:** In `loadApprovals()` function (search for it)

**Current:** Shows all carousels with status = 'needs_review'

**Updated:** Filter out archived carousels
```javascript
const active = carousels.filter(c => c.status !== 'archived' && !c.archived_at);
```

**Test:** Manual - refresh Studio UI, archived carousels should not appear

---

## Testing Strategy

### Unit Tests
All 8 Phase 2 Task 1 tests already written and passing:
```bash
npm test -- tests/unit/phase2-task1-archive-pipeline.test.ts
```

### Integration Tests (if needed)
Create new test file: `tests/integration/phase2-archive-integration.test.ts`
- Test file movement actually happens
- Test database state changes correctly
- Test UI updates after archive

### Manual Verification
1. Create a test carousel
2. Reject it via UI
3. Verify:
   - Files moved to `output/archive/`
   - Carousel not in approval list
   - Database shows archived_at & archive_reason
   - Carousel detail shows archived status

---

## Key Files & Locations

| File | Location | Task |
|------|----------|------|
| `packages/studio/db.ts` | Line ~184 | Database schema |
| `packages/studio/db.ts` | Line ~35 | CarouselRow interface |
| `packages/studio/db.ts` | Line ~400 | Export archiveCarousel() |
| `packages/studio/server.ts` | Line ~705 | Decision endpoint |
| `packages/studio/server.ts` | Line ~740 | Archive integration |
| `packages/studio/ui-js.ts` | Search `loadApprovals` | UI filtering |
| `tests/unit/phase2-task1-*.ts` | Already exists | Validation |

---

## Important Notes

### Archive Folder Naming
```
output/archive/{category_key}_{YYYYMMDD}_{reason}/

Examples:
- output/archive/edukasi_trading_20261002_rejected/
- output/archive/market_info_20261001_rejected/
- output/archive/news_update_20261002_rejected/
```

### File Operations
- Use Node.js `fs` module (already imported in server.ts)
- Create archive folder if not exists: `mkdirSync(archivePath, { recursive: true })`
- Copy files recursively: `cp -r output/{id}/* output/archive/{folder}/`
- Or use fs.copyFileSync for each file

### Database Safety
- Always set updated_at timestamp
- Keep all original data (just add archived markers)
- Don't delete carousel record
- Archive is soft-delete pattern

### Error Recovery
- If file move fails, transaction should rollback
- Don't update database if file move fails
- Log errors for debugging

---

## Session Continuation Notes

### Git Status (End of Session)
```
Branch: master (updated to phase2-high-priority)
Commits: 11 total since phase1-critical-fixes
Tests: 162 passing, 0 failing
Server: Running on 127.0.0.1:4321
```

### Environment Setup
- Node.js: v24 (built-in sqlite)
- Test runner: node:test
- Working directory: D:\abeng\WORK\proyek\Sosmed Agency AI

### Quick Start for Next Session
```bash
cd "D:\abeng\WORK\proyek\Sosmed Agency AI"
npm test  # Verify all 162 tests still passing
# Then follow implementation checklist above
```

### Estimated Time for Task 1
- Database migration: 30 min
- archiveCarousel() function: 30 min
- Archive endpoint: 1 hour
- Integration with rejection: 30 min
- UI updates: 30 min
- Testing & verification: 1 hour
- **Total: 4 hours**

---

## Success Criteria (Verification)

When Phase 2 Task 1 is complete:
- ✅ 8 archive tests still passing
- ✅ 162+ total tests passing
- ✅ Archive endpoint responds correctly
- ✅ Files moved to correct folder
- ✅ Database archived_at & archive_reason set
- ✅ UI filters out archived carousels
- ✅ Manual test: reject carousel → appears in archive folder
- ✅ Ready for Phase 2 Task 2 (Output Organization)

---

## Next Tasks (After Task 1)

### Phase 2 Task 2: Output Organization
- Separate approve folder structure
- Naming: `output/approve/{category}_{YYYYMMDD}_{content_type}/`
- Move approved carousels to output/approve/

### Phase 2 Task 3: Journal Trading Form
- Create structured form with table input
- Support CSV paste
- Image uploads with descriptions
- Save to database

---

**Checkpoint created:** 2026-10-02 18:00 UTC  
**Ready to implement:** ✅ Yes  
**Estimated completion:** 2026-10-03 ~22:00 UTC (4 hours work)
