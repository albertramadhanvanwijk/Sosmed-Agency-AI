# Studio Improvements - Phase 2 Specification

**Document Date:** 2026-10-03
**Status:** Specification for Implementation
**Priority:** Critical UX/Feature Improvements

---

## Overview

12 improvement items untuk optimize Studio UI/UX dan fix business logic issues related to rejection workflow, category designs, output management, dan form handling.

---

## Item 1: Agent Office Layout - Center/Full Width

**Issue:** Agent Office tidak ditampilkan di tengah atau full layout

**Current:** Dashboard Agent Office section tidak optimal dalam layout grid

**Desired:** 
- Agent Office card centered pada screen dengan proper spacing
- Responsive full-width pada mobile
- Clear visual hierarchy

**Files:** packages/studio/ui-js.ts, packages/studio/ui-css.ts
**Impact:** Visual/Layout only, no business logic change

---

## Item 2: Rejection Flow - No Revision Notes Required

**Issue:** Saat tolak Carousel, muncul form catatan untuk memperbaiki (seharusnya tolak langsung)

**Current Behavior:**
```
User clicks "Ditolak" → openReviseForm appears → asks for catatan revisi
```

**Desired Behavior:**
```
User clicks "Ditolak" → Direct rejection WITHOUT revision form
OR
User clicks "Ditolak" → Simple confirmation dialog, catatan OPTIONAL (not required)
```

**Root Cause:** openReviseForm used for both "Minta Revisi" and "Ditolak" decisions

**Solution:** 
- Create separate rejection flow (no form or minimal confirmation)
- Validation pada line 731 memerlukan note untuk rejected juga - perlu disesuaikan
- Catatan untuk rejected OPTIONAL (bukan WAJIB)

**Files:** 
- packages/studio/ui-js.ts (openReviseForm, decide function)
- packages/studio/server.ts (line 731 validation)

---

## Item 3: Rejection Should Not Queue Revision Pipeline

**Issue:** Saat reject, pipeline diminta revisi (seharusnya hanya archive)

**Current Behavior:**
```
decision === 'rejected' → decision endpoint:
  1. recordRevision() - OK, untuk learning
  2. upsertLearnedRule() - OK, untuk AI
  3. if (autoRevise) runProduction() - WRONG! Ini execute production baru
```

**Desired Behavior:**
```
decision === 'rejected' → HANYA:
  1. recordRevision untuk learning
  2. upsertLearnedRule untuk AI
  3. Archive carousel (move to archive)
  4. NO production queued
```

**Root Cause:** server.ts line 782 checks `if (body.autoRevise === true)` untuk BOTH rejected dan changes_requested

**Solution:**
```typescript
// Current (wrong):
if (decision !== 'approved') {
  recordRevision(...);
  upsertLearnedRule(...);
  if (body.autoRevise === true) {  // ← executes for rejected too!
    runProduction(...);
  }
}

// Fixed (correct):
if (decision !== 'approved') {
  recordRevision(...);
  upsertLearnedRule(...);
  if (decision === 'changes_requested' && body.autoRevise === true) {  // ← only for revisions
    runProduction(...);
  }
}
```

**Files:** packages/studio/server.ts (lines 749-807)

---

## Item 4: Rejected Carousel → Archive Pipeline

**Issue:** Carousel yang di-reject tidak punya destinasi (seharusnya archive)

**Desired:** 
- New pipeline: archive
- Create folder: `output/archive/`
- Update carousel status: `status = 'archived'`
- Move carousel output files ke `output/archive/`

**Implementation:**
1. Database: Add `archived_at` timestamp column ke carousels table
2. Archive endpoint: POST `/api/carousels/:id/archive`
3. Archive logic:
   - Set status = 'archived', archived_at = NOW
   - Move output folder: `output/carousel-id/` → `output/archive/carousel-id_rejected_YYYYMMDD/`
   - Update UI to remove carousel from list

**Files:**
- packages/studio/server.ts (new archive endpoint)
- packages/studio/db.ts (archiveCarousel function)
- packages/studio/ui-js.ts (call archive after rejection)

---

## Item 5: Multiple Revision Safety - Prevent Infinite Loops

**Issue:** Saat minta revisi ke-2, malah ke-tolak. Pastikan aman jika minta revisi berkali-kali

**Current Risk:**
- revision_round increment di setiap revisi
- Tidak ada max limit pada revisi - bisa infinite loop
- Possible: Revisi ke-1 OK → Revisi ke-2 error → malah rejected

**Desired:**
```
1. Max revision rounds: 3 (configurable)
2. Jika revision_round >= 3 dan status still needs_review:
   - Show warning: "Sudah 3x revisi. Sebaiknya reject atau approve?"
   - Disable "Minta Revisi" button
   - Force "Approve" atau "Reject" only
3. Track revision history per carousel:
   - Show: "Revisi 1/3, Revisi 2/3, Revisi 3/3"
4. Prevent "Tolak" → "Tolak Revisi" chain
```

**Implementation:**
1. Add `max_revisions = 3` to config
2. Check `revision_round < max_revisions` before allowing "Minta Revisi"
3. Show UI warning when approaching limit
4. Once rejected, carousel locked (no more actions)

**Files:**
- packages/studio/server.ts (check revision_round limit)
- packages/studio/ui-js.ts (disable buttons based on revision_round)
- packages/studio/ui-css.ts (styling for warnings)

---

## Item 6: Category Theme Designs - Visual Differentiation

**Issue:** Desain tema masing-masing kategori sama, ingin berbeda

**Current:** Only colors different (--cat-primary, --cat-accent, --cat-bg)

**Desired:** Visual theme differentiation:

| Kategori | Primary | Accent | BG | Border Style | Icon | Pattern |
|----------|---------|--------|----|--------------|----|---------|
| edukasi_trading | #3B82F6 | #1E40AF | #EFF6FF | Solid | 📚 | Grid pattern |
| edukasi_propfirm | #A855F7 | #7E22CE | #FAF5FF | Dashed | 🏢 | Diagonal lines |
| jurnal_trading | #F59E0B | #D97706 | #FFFBEB | Double | 📊 | Dots |
| market_info | #10B981 | #047857 | #ECFDF5 | Dotted | 📰 | Waves |
| market_outlook | #EF4444 | #DC2626 | #FEF2F2 | Gradient | 🎯 | Arrows |

**Implementation:**
1. Add to category-themes.ts:
   - borderStyle (solid/dashed/double/dotted/gradient)
   - icon (emoji or icon name)
   - pattern (CSS pattern or SVG)
2. Update CSS untuk apply patterns
3. Update form to show distinct visual per category

**Files:**
- packages/shared/category-themes.ts
- packages/studio/ui-css.ts (add pattern classes)
- packages/studio/ui-js.ts (apply theme styling)

---

## Item 7: Output Management - Organize by Status

**Issue:** Output tidak terorganisir. Ingin separate folder untuk approve vs archive

**Desired Structure:**
```
output/
  ├── approve/
  │   ├── edukasi_trading_20261003_content1/
  │   ├── edukasi_trading_20261003_content2/
  │   ├── market_info_20261003_content1/
  │   └── ...
  ├── archive/
  │   ├── jurnal_trading_20261002_rejected/
  │   ├── market_outlook_20261001_rejected/
  │   └── ...
  └── processing/
      ├── [temp files during generation]
```

**Naming Convention:**
- Approved: `{category}_{YYYYMMDD}_{content_type}{counter}`
- Archived: `{category}_{YYYYMMDD}_{reason}`

**Implementation:**
1. Update POST /api/carousels/:id/decision endpoint:
   - On approve: Move to `output/approve/{name}/`
   - On reject: Move to `output/archive/{name}_rejected/`
2. Database migration: Add `output_folder` column
3. Update UI to show folder location

**Files:**
- packages/studio/server.ts (move files)
- packages/studio/db.ts (update carousel record)

---

## Item 8: Market Outlook Category - Image Upload + Description Form

**Issue:** Market Outlook form butuh support multiple images dengan description

**Desired:**
```
Form Fields:
1. Outlook Title
2. Timeframe (H1, H4, D1, W1, MN)
3. Image Gallery (add multiple images):
   - Upload image (chart/analysis)
   - Description per image (textarea)
   - Order (drag to reorder)
4. CTA Setup:
   - CTA Type: [Link, Promo Code, Join Community]
   - Multiple CTA support (array of CTAs)
   - Promo Codes: [Add many codes if type=Promo]
5. General Notes (optional markdown)
```

**Database:**
- Add `market_outlook_images` table:
  - carousel_id, image_url, description, sort_order, created_at
- Add `carousel_ctas` table:
  - carousel_id, type, url/code, label, sort_order

**Implementation:**
1. UI: Create market_outlook specific form in ui.ts
2. Upload: Handle multiple image upload, store in output folder
3. Gallery: Implement image gallery with drag-reorder
4. CTA: Multiple CTA selection with code management

**Files:**
- packages/studio/ui.ts (market outlook form section)
- packages/studio/ui-js.ts (gallery logic, drag-drop)
- packages/studio/server.ts (handle image uploads)
- packages/studio/db.ts (market_outlook_images schema)

---

## Item 9: Jurnal Trading Category - Structured Manual Input

**Issue:** Jurnal trading perlu form terstruktur untuk input manual

**Desired Form Structure:**
```
Slide 1: Hook
  - Input: Pair (EUR/USD, etc)
  - Auto-generate: "Journal Trade - {Pair}"

Slide 2: Trade Table (Manual Input)
  - Fields: Pairs, Direction, Session, %Risk, RR Ratio, 
            Confluence, PnL, Profit/Loss
  - Input: Spreadsheet-like table input
  - Copy-paste: Support CSV paste

Slide 3: Chart Direction & Description
  - Upload: Chart image (direction)
  - Input: Description (textarea)

Slide 4: Chart Execution & Description
  - Upload: Chart image (execution)
  - Input: Description (textarea)

Slide 5: Trade Mark Execution & Description
  - Upload: Mark image (execution marks)
  - Input: Description (textarea)

Slide 6: Performance Stats
  - Upload: Performance chart/image

Slide 7: CTA
  - Standard CTA (Link/Promo/Community)
```

**Database:**
- Add `jurnal_trading_data` table:
  - carousel_id, pair, direction_chart, execution_chart, mark_chart,
    trade_table (JSON), descriptions (JSON)

**Implementation:**
1. Create journal-specific form in ui.ts
2. Table input: Spreadsheet-like interface with CSV paste support
3. Image uploads: Multi-image with descriptions
4. Generate slide spec from structured input

**Files:**
- packages/studio/ui.ts (journal form)
- packages/studio/ui-js.ts (table input, image management)
- packages/studio/server.ts (save journal data)
- packages/agents/prompts.ts (composer instruction for journal format)

---

## Item 10: Weekly Plan - Include Copywriter Output

**Issue:** Rencana mingguan hanya structure, tidak include copywriter details

**Desired:**
```
Weekly Plan Output:
1. Slot structure: Day, Category, Topic
2. Copywriter details: Full content brief
3. Skip AI generation: Just design if copy matches

Flow:
1. User creates weekly plan
2. Plan shows slots with copywriter details:
   - Hook: [text]
   - Body: [text]
   - CTA: [text]
3. User reviews copy
4. If approved: Generate design only (skip copywriter agent)
5. If rejected: Re-run copywriter for that slot
```

**Implementation:**
1. Planner: Run copywriter for all slots (not just structure)
2. UI: Display copywriter output in plan view
3. Approval: Add "Approve Copy" / "Regenerate Copy" buttons
4. Pipeline: When approved, skip copywriter step (run from renderer)

**Files:**
- packages/planner/weekly.ts (run copywriter)
- packages/studio/ui.ts (plan display with copy)
- packages/studio/ui-js.ts (plan review flow)
- packages/agents/pipeline.ts (conditional steps)

---

## Item 11: Category Descriptions & Business Logic

**Issue:** Need clear description of each category's purpose for guidance

**Desired - Category Definitions:**

### Edukasi Trading
**Purpose:** Pembelajaran tentang trading (konsep, psikologi, money management)
**Content Focus:**
- Bagaimana cara trading yang benar
- Psikologi trading (fear, greed, discipline)
- Money management & risk management
- Trading psychology basics
**Slide Structure:** Hook + Concept slides + Psychology slides + CTA
**Visual:** Educational, clean, text-heavy
**Target Audience:** Trading beginners/intermediate

### Edukasi Propfirm
**Purpose:** Edukasi tentang broker proprietary (rules, features, opportunities)
**Content Focus:**
- Apa itu proprietary firm
- Rules & regulations propfirm
- Keuntungan vs resiko
- Trading conditions & requirements
**Slide Structure:** Hook + Rule/Feature slides + Opportunity slides + CTA
**Visual:** Professional, corporate
**Target Audience:** Aspiring propfirm traders

### Jurnal Trading
**Purpose:** Report trading harian/mingguan (personal trading journal)
**Content Focus:**
- Trade-by-trade analysis
- Chart analysis & setup
- Entry/exit rationale
- Performance stats
**Slide Structure:** Hook + Trade Table + Chart Analysis + Stats + CTA
**Visual:** Data-heavy, analytical, chart-focused
**Manual Input:** Yes - user inputs trades, charts, descriptions
**Target Audience:** Trading community, performance tracking

### Market Info
**Purpose:** Real-time market news & impact analysis
**Content Focus:**
- Breaking financial news
- Impact pada Forex/Indices/Crypto
- Penjelasan news dan dampaknya terhadap market
- Market data & statistics
**Slide Structure:** Hook + News Explanation + Impact Analysis + Data + CTA
**News Source:** Real RSS feeds (Reuters, Bloomberg, CNBC, Yahoo Finance)
**Visual:** News-style, data-driven
**Target Audience:** Active traders, market participants

### Market Outlook
**Purpose:** Market direction analysis & predictions
**Content Focus:**
- Technical analysis & market direction
- Chart-based predictions
- Scenario analysis
- Support/resistance levels
**Slide Structure:** Hook + Chart Analysis + Outlook + Scenarios + CTA
**Manual Input:** Can be AI-generated OR user uploads charts with descriptions
**Visual:** Chart-heavy, analytical, technical
**Target Audience:** Technical traders, analysis enthusiasts

---

## Item 12: Slide Preview - Clickable Zoom Images

**Issue:** Slide preview images tidak bisa di-zoom/inspect

**Desired:**
```
Features:
1. Click image → Modal popup dengan image full-size
2. Zoom in/out: Mouse wheel atau +/- buttons
3. Pan: Drag to move around zoomed image
4. Download: Save image option
5. Keyboard: ESC to close, Arrow keys to navigate slides
6. Thumbnail strip: Show all slides, click to switch
7. Info overlay: Show slide type, dimensions, file size
```

**Implementation:**
1. Add modal component for image viewer
2. Image zoom library (e.g., Panzoom or custom)
3. Keyboard navigation
4. Responsive design (mobile touch support)

**Files:**
- packages/studio/ui.ts (modal for image preview)
- packages/studio/ui-css.ts (modal styling, zoom controls)
- packages/studio/ui-js.ts (zoom logic, keyboard handlers)

---

## Priority & Sequencing

**Phase 1 (Critical - Fix Business Logic):**
1. Item 2: Rejection flow - no revision form
2. Item 3: Rejection - no production pipeline
3. Item 5: Multiple revision safety (max 3)

**Phase 2 (High - Feature Enhancement):**
4. Item 4: Archive pipeline
5. Item 7: Output organization
6. Item 9: Journal trading structured input

**Phase 3 (Medium - UI/UX Improvement):**
7. Item 1: Agent office layout
8. Item 6: Category theme visual differentiation
9. Item 12: Slide preview zoom

**Phase 4 (Lower Priority - Nice-to-Have):**
10. Item 8: Market outlook multi-image form
11. Item 10: Weekly plan with copywriter output
12. Item 11: Category descriptions (documentation)

---

## Summary

**Total Items:** 12 improvements
**Critical Fixes:** 3 (Items 2, 3, 5)
**Features:** 4 (Items 4, 7, 8, 9)
**UX/UI:** 3 (Items 1, 6, 12)
**Documentation:** 2 (Items 10, 11)

**Estimated Effort:** ~80-100 hours development + testing
**Risk Level:** Medium (business logic changes require careful testing)
**Testing:** Comprehensive test coverage needed for rejection & revision flows

---

**Next Step:** Create detailed implementation plan for Phase 1 critical fixes
