# Phase 2 Implementation Plan - High Priority Features

**Date:** 2026-10-02
**Priority:** HIGH - Feature Enhancement
**Estimated Time:** 16-20 hours
**Risk Level:** Medium (database schema + file operations)

---

## Goals

Implement 3 high-priority features:
1. **Item 4:** Archive Pipeline - Move rejected carousels to archive folder
2. **Item 7:** Output Organization - Separate approve vs archive folders with naming
3. **Item 9:** Journal Trading Form - Structured manual input for trading journals

**Success Criteria:**
- ✅ Rejected carousels automatically archived
- ✅ Approved carousels moved to `output/approve/` with category_date naming
- ✅ Archived carousels in `output/archive/` with rejection marker
- ✅ Journal trading form collects all required fields
- ✅ All tests passing (150+ new tests)
- ✅ No regression in Phase 1 functionality

---

## Task 1: Archive Pipeline - Rejected Carousels

**Files to Create/Modify:**
- `packages/studio/db.ts` - archiveCarousel() function
- `packages/studio/server.ts` - POST /api/carousels/:id/archive endpoint
- `packages/studio/ui-js.ts` - Call archive after rejection

**Database Changes:**
- Add `archived_at TIMESTAMP` column to carousels table
- Add `archive_reason TEXT` column (rejected, etc)

**Implementation:**
1. After rejection decision saved, call archive endpoint
2. Move output folder: `output/{id}/` → `output/archive/{categoryKey}_{YYYYMMDD}_{reason}/`
3. Update carousel status to 'archived', set archived_at
4. Remove from approval list UI

**Tests:**
- Archive endpoint moves files correctly
- Database records archived_at timestamp
- UI removes archived carousel from list
- Archive folder structure correct

---

## Task 2: Output Organization - Folder Structure

**Files to Modify:**
- `packages/studio/server.ts` - Move files on approve/reject
- `packages/studio/db.ts` - Update carousel output_folder path

**Implementation:**

```
output/
├── approve/
│   ├── edukasi_trading_20261002_content1/
│   ├── edukasi_trading_20261002_content2/
│   ├── market_info_20261002_content1/
├── archive/
│   ├── edukasi_trading_20261002_rejected/
│   ├── market_outlook_20261001_rejected/
```

**Naming Convention:**
- Approved: `{category}_{YYYYMMDD}_{content_type}{counter}`
- Archived: `{category}_{YYYYMMDD}_{reason}`

**Implementation:**
1. On carousel approve: Move from `output/{id}/` → `output/approve/{name}/`
2. On carousel reject: Move from `output/{id}/` → `output/archive/{name}_rejected/`
3. Update database: carousel.output_folder stores new path
4. UI can show folder location

**Tests:**
- Approved carousel files moved to approve folder
- Archived carousel files moved to archive folder
- Naming follows convention
- Database paths updated correctly

---

## Task 3: Journal Trading Form - Structured Input

**Files to Create/Modify:**
- `packages/studio/ui.ts` - Add journal form section
- `packages/studio/ui-js.ts` - Table input, image management
- `packages/studio/server.ts` - Save journal data
- `packages/studio/db.ts` - Create journal_trading_data table

**Database Schema:**
```sql
CREATE TABLE journal_trading_data (
  carousel_id TEXT PRIMARY KEY,
  pair TEXT,
  direction_description TEXT,
  execution_description TEXT,
  mark_description TEXT,
  trade_table JSON,  -- Array of trade rows
  created_at TIMESTAMP
);
```

**Form Structure:**

```
Slide 1: Hook
  Input: Pair (EUR/USD, etc)
  Auto-generate: "Journal Trade - {Pair}"

Slide 2: Trade Table
  Spreadsheet-like input:
    - Pairs, Direction, Session, %Risk, RR Ratio
    - Confluence, PnL, Profit/Loss
  Support CSV paste

Slide 3: Direction Chart & Description
  - Upload chart image
  - Textarea for description

Slide 4: Execution Chart & Description
  - Upload chart image
  - Textarea for description

Slide 5: Trade Mark & Description
  - Upload mark image
  - Textarea for description

Slide 6: Performance Stats
  - Upload performance chart/image

Slide 7: CTA
  - Standard CTA (Link/Promo/Community)
```

**Implementation:**
1. Create form UI with sections
2. Table input: Spreadsheet-like interface with CSV paste
3. Image uploads: Multiple images with descriptions
4. Save structured data to database
5. Composer receives structured brief

**Tests:**
- Form accepts all required fields
- Table supports CSV paste
- Images uploaded and stored
- Structured data saved correctly
- Composer receives complete brief

---

## Execution Sequence

**Phase 2a (Task 1 - Archive Pipeline):**
- Write tests for archive endpoint
- Create archiveCarousel() function
- Implement POST /api/carousels/:id/archive
- Update UI to call archive after rejection

**Phase 2b (Task 2 - Output Organization):**
- Write tests for folder structure
- Modify approve/reject flows to move files
- Update database paths
- Verify naming convention

**Phase 2c (Task 3 - Journal Trading Form):**
- Write tests for journal form fields
- Create form UI sections
- Implement table input with CSV paste
- Test structured data storage

---

## Risk Mitigation

**File Operations Risk:**
- Test all file moves on staging first
- Verify no data loss on transitions
- Rollback plan: Keep original files for 48 hours

**Database Risk:**
- Use migrations for schema changes
- Test with existing carousels
- Backup before schema changes

**UI Risk:**
- Test form with all field combinations
- Verify paste operations don't break
- Preview before upload/save

---

## Success Metrics

- ✅ 150+ new tests passing (0 failures)
- ✅ Archive folder structure correct
- ✅ Output files organized as specified
- ✅ Journal form accepts all inputs
- ✅ No regression in Phase 1 functionality
- ✅ Database migrations successful

---

**Next Step:** Create Phase 2 execution plan and start Task 1 (Archive Pipeline)

