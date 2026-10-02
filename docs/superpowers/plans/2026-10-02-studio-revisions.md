# Studio Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 critical issues with the carousel approval workflow, revision system, category differentiation, and AI learning capabilities.

**Architecture:** 
- Fix revision note form visibility and auto-revision pipeline (points 2, 8)
- Implement category-specific designs with color themes and templates (point 5)
- Add loading animation for refresh button (point 12)
- Enhance carousel creation with image uploads, suggestions, and CTA options (points 3, 7)
- Implement weekly content planning with real news sources (points 9, 11)
- Add AI learning from revision notes (point 4)
- Prevent topic duplication and improve AI intelligence (point 10)
- Remove output folder button from detail view (point 6)
- Ensure buttons disappear after decision to prevent spam (already partially implemented, needs verification)

**Tech Stack:** TypeScript, Node.js, SQLite, HTML/CSS/JavaScript, LLM integration

**Spec:** This plan implements fixes for user-reported issues in the Sosmed Agency AI Studio application.

## Global Constraints

- All changes must maintain backward compatibility with existing carousel data
- Revision notes must be persisted and used for AI learning
- Category designs must be visually distinct but follow existing UI patterns
- Loading animations must not block user interactions
- News sources must be real and verified (market_info category only)
- All timestamps use ISO 8601 format
- Database schema modifications use SQLite syntax

## Review Focus

1. **Revision note field visibility** - Form must appear when "Minta Revisi" button is clicked; textarea must be required and validated
2. **Auto-revision execution** - When checkbox is checked, pipeline must actually execute with extra instructions from note
3. **Category design differentiation** - Each category (edukasi_trading, edukasi_propfirm, jurnal_trading, market_info, market_outlook) must have distinct colors and slide templates
4. **AI learning from notes** - Revision notes must convert to learned rules with proper confidence scoring
5. **Content deduplication** - AI must check history and avoid duplicate topics, showing similarity warnings

---

## Task 1: Fix Revision Note Form Visibility

**Files:**
- Modify: `packages/studio/ui-js.ts:329-390` (openReviseForm function)
- Modify: `packages/studio/ui-css.ts` (add styles for required field)

**Interfaces:**
- Consumes: `openDrawer()`, `$()`, `el()`, `closeDrawer()` utility functions
- Produces: Form with visible, required textarea for revision notes

**Steps:**

- [ ] **Step 1:** Verify revision form currently opens correctly
  - Open browser to http://127.0.0.1:4321
  - Navigate to Persetujuan tab
  - Click "Minta Revisi" on any pending carousel
  - Confirm drawer opens with form
  
- [ ] **Step 2:** Check if textarea for revision notes is visible
  - Look for element with id `rev-note`
  - If not visible, the form may be truncated or hidden by CSS
  - Current code shows textarea should be visible at line 344-347 in ui-js.ts

- [ ] **Step 3:** Add visual indicator that note is required
  - Edit `packages/studio/ui-css.ts` to add red asterisk to label
  - Find `.f` class selector (label styling)
  - Add CSS rule to show required indicator

- [ ] **Step 4:** Ensure form validation prevents empty submission
  - Check line 368 in ui-js.ts - validation already requires 5+ characters
  - Verify toast message appears if note is too short
  - Test by clicking "Kirim & Perbaiki" without filling textarea

- [ ] **Step 5:** Test end-to-end revision flow
  - Fill in revision note with 5+ characters
  - Check "Langsung jalankan perbaikan" checkbox
  - Click "Kirim & Perbaiki"
  - Verify form closes and notification appears

- [ ] **Step 6:** Commit
```bash
git add packages/studio/ui-js.ts packages/studio/ui-css.ts
git commit -m "fix: ensure revision note form is visible and required"
```

---

## Task 2: Implement Auto-Revision Pipeline Execution

**Files:**
- Modify: `packages/studio/server.ts:705-812` (POST /api/carousels/:id/decision endpoint)
- Modify: `packages/studio/ui-js.ts:366-389` (revision form submission)

**Interfaces:**
- Consumes: `autoRevise` boolean flag, `note` string, carousel `id`
- Produces: Job queued in database with `changes_requested` status and extra instructions

**Steps:**

- [ ] **Step 1:** Verify current implementation in server.ts
  - Read lines 749-807 which handle `autoRevise` logic
  - Confirm `runProduction` is called with `revisedFrom: id`
  - Check that extra instructions include the revision note

- [ ] **Step 2:** Test revision execution pathway
  - Navigate to a carousel in needs_review status
  - Click "Minta Revisi" and fill note
  - Check "Langsung jalankan perbaikan"
  - Click "Kirim & Perbaiki"
  - Verify response contains `revised.jobQueued: true`

- [ ] **Step 3:** Check database for revision record
  - Open storage/studio.db with SQLite viewer
  - Query: `SELECT * FROM revisions WHERE carousel_id = <id> ORDER BY created_at DESC LIMIT 1`
  - Verify note is saved
  - Query: `SELECT * FROM carousels WHERE revised_from = <id>`
  - Verify new carousel created with status 'needs_review'

- [ ] **Step 4:** Monitor job execution
  - Check Dashboard tab for new job in progress
  - Verify Agent Office shows agents working
  - Wait for completion (2-5 minutes)
  - Verify new carousel appears in "Produksi Terakhir"

- [ ] **Step 5:** Verify revised carousel has correct metadata
  - Click on new carousel in approvals
  - Check "Rantai Perbaikan" section shows parent carousel
  - Verify extra_instructions field contains revision note
  - Verify revision_round incremented

- [ ] **Step 6:** Commit
```bash
git add packages/studio/server.ts packages/studio/ui-js.ts
git commit -m "feat: auto-revision pipeline executes with revision notes as extra instructions"
```

---

## Task 3: Add Category-Specific Color Themes

**Files:**
- Modify: `packages/studio/ui-css.ts` (add category color variables)
- Modify: `packages/studio/ui-js.ts:854-862` (category hint display)
- Create: `packages/shared/category-themes.ts` (category design mappings)

**Interfaces:**
- Consumes: `categoryKey` from form
- Produces: CSS variables `--cat-primary`, `--cat-accent`, `--cat-bg` per category

**Steps:**

- [ ] **Step 1:** Create category theme definitions
  - Create file `packages/shared/category-themes.ts`
  - Define color scheme for each category:
    - `edukasi_trading`: Blue (#3B82F6 primary, #1E40AF accent)
    - `edukasi_propfirm`: Purple (#A855F7 primary, #7E22CE accent)
    - `jurnal_trading`: Orange (#F59E0B primary, #D97706 accent)
    - `market_info`: Green (#10B981 primary, #047857 accent)
    - `market_outlook`: Red (#EF4444 primary, #DC2626 accent)

```typescript
export const CATEGORY_THEMES = {
  edukasi_trading: {
    primary: '#3B82F6',
    accent: '#1E40AF',
    bg: '#EFF6FF',
    name: 'Trading Education'
  },
  edukasi_propfirm: {
    primary: '#A855F7',
    accent: '#7E22CE',
    bg: '#FAF5FF',
    name: 'Prop Firm Education'
  },
  jurnal_trading: {
    primary: '#F59E0B',
    accent: '#D97706',
    bg: '#FFFBEB',
    name: 'Trading Journal'
  },
  market_info: {
    primary: '#10B981',
    accent: '#047857',
    bg: '#ECFDF5',
    name: 'Market Info'
  },
  market_outlook: {
    primary: '#EF4444',
    accent: '#DC2626',
    bg: '#FEF2F2',
    name: 'Market Outlook'
  }
} as const;

export function getCategoryTheme(key: string) {
  return CATEGORY_THEMES[key as keyof typeof CATEGORY_THEMES] || CATEGORY_THEMES.edukasi_trading;
}
```

- [ ] **Step 2:** Add CSS variables for category theming
  - Edit `packages/studio/ui-css.ts`
  - Add to `:root` selector:
```css
:root {
  --cat-primary: #3B82F6;
  --cat-accent: #1E40AF;
  --cat-bg: #EFF6FF;
}
```

- [ ] **Step 3:** Create category selector with color preview
  - Modify select element styling in ui-js.ts
  - When category changes, update CSS variables via `document.documentElement.style.setProperty()`
  - Add colored badge next to category name

- [ ] **Step 4:** Update category hint display
  - Modify `onCategoryChange()` function around line 854
  - Add color background to hint text
  - Use theme color for visual emphasis

- [ ] **Step 5:** Test category color switching
  - Open create carousel form
  - Change category dropdown
  - Verify colors change on form
  - Verify badge updates
  - Test all 5 categories

- [ ] **Step 6:** Commit
```bash
git add packages/shared/category-themes.ts packages/studio/ui-css.ts packages/studio/ui-js.ts
git commit -m "feat: add category-specific color themes to carousel creation form"
```

---

## Task 4: Implement Category-Specific Slide Templates

**Files:**
- Modify: `packages/templates/registry.ts` (template resolution per category)
- Modify: `packages/agents/prompts.ts` (composer instructions per category)

**Interfaces:**
- Consumes: `categoryKey`, `slideRole`
- Produces: Category-specific template selection and composition prompts

**Steps:**

- [ ] **Step 1:** Review current template selection logic
  - Read `packages/templates/registry.ts:resolveTemplate()`
  - Understand how `templateKey` is resolved from slide spec
  - Check `packages/shared/categories.ts` for `preferredTemplates` per category

- [ ] **Step 2:** Enhance composer prompt with category template guidance
  - Edit `packages/agents/prompts.ts:composerSystem()` and `composerUser()`
  - Add category-specific template recommendations
  - Include visual style notes per category in prompt

- [ ] **Step 3:** Map templates to categories
  - edukasi_trading: use concept, scenario, stat templates
  - edukasi_propfirm: use rule, news, table templates  
  - jurnal_trading: use journal, scenario templates
  - market_info: use news, stat, table templates
  - market_outlook: use news, concept, scenario templates

- [ ] **Step 4:** Test template rendering per category
  - Create carousel for each category with same topic
  - Verify different template types used
  - Check slide designs visually differ

- [ ] **Step 5:** Commit
```bash
git add packages/agents/prompts.ts packages/templates/registry.ts
git commit -m "feat: implement category-specific slide template selection"
```

---

## Task 5: Remove Output Folder Button from Detail View

**Files:**
- Modify: `packages/studio/ui-js.ts:399-591` (openDetail function)

**Interfaces:**
- Consumes: carousel detail data
- Produces: Detail drawer without folder open button

**Steps:**

- [ ] **Step 1:** Locate button in detail view
  - Search ui-js.ts for "folder" or "Buka Folder"
  - Current code at line 760 shows button for carousel in approvals
  - Check if similar button exists in detail drawer

- [ ] **Step 2:** Remove button from detail drawer
  - Look for button creation in `openDetail()` function (around line 399-591)
  - Currently no folder button found in detail view - verify this
  - If button exists, remove it along with onclick handler

- [ ] **Step 3:** Verify no folder access buttons remain
  - Search entire ui-js.ts for "files/" or "folder"
  - Check if any button opens output directory
  - Remove if found

- [ ] **Step 4:** Test detail view
  - Open carousel detail drawer
  - Verify no button opens folder
  - Check all sections of detail view

- [ ] **Step 5:** Commit
```bash
git add packages/studio/ui-js.ts
git commit -m "fix: remove output folder button from carousel detail view"
```

---

## Task 6: Ensure Decision Buttons Hide After Selection

**Files:**
- Modify: `packages/studio/ui-js.ts:307-320` (decide function)
- Modify: `packages/studio/ui-js.ts:427-448` (detail view action buttons)

**Interfaces:**
- Consumes: decision (approved/changes_requested/rejected), carousel id
- Produces: Buttons removed from UI after decision saved

**Steps:**

- [ ] **Step 1:** Verify button removal after approval
  - Open carousel in needs_review status
  - Click "Setujui"
  - Confirm buttons disappear
  - Verify status changes to "Disetujui"

- [ ] **Step 2:** Verify button removal after revision request
  - Open carousel in needs_review status
  - Click "Minta Revisi", fill note, submit
  - Confirm buttons disappear
  - Verify status changes to "Minta Revisi"

- [ ] **Step 3:** Check approvals list refresh
  - After decision, carousel should disappear from "Perlu Review" section
  - Wait for list to refresh (should be automatic via loadApprovals)
  - Verify carousel no longer shows action buttons

- [ ] **Step 4:** Commit
```bash
git add packages/studio/ui-js.ts
git commit -m "fix: verify decision buttons hide after selection"
```

---

## Task 7: Add Loading Animation to Refresh Button

**Files:**
- Modify: `packages/studio/ui-css.ts` (add spinner animation)
- Modify: `packages/studio/ui-js.ts:210-225` (loadOverview function)

**Interfaces:**
- Consumes: refresh button click event
- Produces: Spinning animation during data load with modal overlay

**Steps:**

- [ ] **Step 1:** Add spinner CSS animation
  - Edit `packages/studio/ui-css.ts`
  - Add keyframes animation:
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

- [ ] **Step 2:** Modify refresh button click handler
  - Find button with id `btn-refresh` in ui.ts
  - Modify onclick to show spinner during load
  - Add overlay to prevent clicking during refresh

- [ ] **Step 3:** Implement loading state
  - When refresh clicked, show overlay with spinner for 2-10 seconds
  - Display "Sedang memuat..." message
  - Disable button during load

- [ ] **Step 4:** Test refresh animation
  - Click "Muat Ulang" button
  - Observe spinner animation for several seconds
  - Verify overlay disappears when data loads
  - Verify data updates correctly

- [ ] **Step 5:** Commit
```bash
git add packages/studio/ui-css.ts packages/studio/ui-js.ts
git commit -m "feat: add loading animation to refresh button"
```

---

## Task 8: Enhance Carousel Creation with Image Uploads and Suggestions

**Files:**
- Modify: `packages/studio/ui.ts:188-263` (create carousel form)
- Modify: `packages/studio/ui-js.ts:899-943` (upload handling)
- Modify: `packages/studio/server.ts:814-849` (POST /api/produce endpoint)

**Interfaces:**
- Consumes: topic, extra instructions, uploaded images, CTA selection
- Produces: Production request with all metadata

**Steps:**

- [ ] **Step 1:** Verify image upload field exists
  - Check ui.ts line 246-250 for file input
  - Verify accepts image/* types
  - Check max file size is 6 MB

- [ ] **Step 2:** Verify extra instructions field exists
  - Check ui.ts line 209-212 for textarea
  - Confirm placeholder suggests content improvement tips
  - Verify sent to composer in pipeline

- [ ] **Step 3:** Test image uploads
  - Open create carousel form
  - Click image upload area
  - Select PNG/JPEG/WebP image
  - Verify file appears in preview with name
  - Upload multiple images
  - Verify all appear in upload list

- [ ] **Step 4:** Test extra instructions
  - Fill "Saran Tambahan agar Konten Lebih Informatif" textarea
  - Enter suggestion like "Sertakan contoh perhitungan dengan angka"
  - Start production
  - Verify suggestion appears in carousel result

- [ ] **Step 5:** Test CTA preset selection
  - Click CTA preset buttons (if any exist)
  - Verify preset loads into CTA fields
  - Verify CTA type changes show/hide relevant fields

- [ ] **Step 6:** Commit
```bash
git add packages/studio/ui.ts packages/studio/ui-js.ts packages/studio/server.ts
git commit -m "feat: enhance carousel creation with image uploads and extra instructions"
```

---

## Task 9: Implement Weekly Content Planning with Real News

**Files:**
- Modify: `packages/studio/ui.ts:125-164` (plan tab form)
- Modify: `packages/studio/ui-js.ts:778-848` (plan loading and rendering)
- Modify: `packages/studio/server.ts:907-965` (POST /api/plan endpoint)
- Verify: `packages/news/feeds.ts` has real news sources

**Interfaces:**
- Consumes: days (7/5/14), start date, category focus, extra instructions, includeNews flag
- Produces: Weekly plan with news-sourced topics

**Steps:**

- [ ] **Step 1:** Verify news sources are configured
  - Check `packages/news/feeds.ts` for NEWS_SOURCES array
  - Verify market_info category sources are real RSS feeds
  - Confirm sources include: financial news, market updates, forex feeds

- [ ] **Step 2:** Test weekly plan generation
  - Open Rencana Mingguan tab
  - Set "Jumlah Hari" to 7
  - Check "Ambil berita terbaru untuk sumber topik"
  - Click "Susun Rencana"
  - Wait for plan to generate (should show progress)

- [ ] **Step 3:** Verify plan includes news-based topics
  - Check plan output shows 7 slots
  - Verify market_info slots reference current news
  - Confirm edukasi slots have rotated categories
  - Check rationale mentions news sources

- [ ] **Step 4:** Test plan with extra instructions
  - Fill "Saran Tambahan untuk Seluruh Rencana"
  - Enter guidance like "Minggu ini fokus manajemen risiko untuk pemula"
  - Generate plan
  - Verify extra instruction influenced topic selection

- [ ] **Step 5:** Test producing carousel from plan
  - Click "Produksi" on a plan slot
  - Verify form pre-fills with topic from plan
  - Verify extra instructions include plan guidance
  - Start production
  - Verify carousel follows plan topic

- [ ] **Step 6:** Commit
```bash
git add packages/news/feeds.ts packages/studio/ui.ts packages/studio/ui-js.ts packages/studio/server.ts
git commit -m "feat: implement weekly content planning with real news sources"
```

---

## Task 10: Implement AI Learning from Revision Notes

**Files:**
- Modify: `packages/studio/server.ts:749-807` (decision endpoint)
- Modify: `packages/memory/rules.ts` (rule generation from revisions)
- Modify: `packages/studio/ui-js.ts:1090-1150` (memory tab display)

**Interfaces:**
- Consumes: revision note, decision (changes_requested/rejected)
- Produces: LearnedRule with confidence 0.9, active status

**Steps:**

- [ ] **Step 1:** Verify revision recording
  - Create carousel and request revision with note
  - Check database: `SELECT * FROM revisions ORDER BY created_at DESC LIMIT 1`
  - Verify note saved correctly

- [ ] **Step 2:** Check learned rule creation
  - After revision recorded, query: `SELECT * FROM learned_rules WHERE created_by = 'human' ORDER BY created_at DESC LIMIT 1`
  - Verify rule text starts with "Perbaiki hal berikut:"
  - Verify confidence = 0.9
  - Verify active = 1

- [ ] **Step 3:** Test rule application in production
  - Generate new carousel in same category
  - Verify revision rules appear in composer prompt
  - Check that composer considers learned rules

- [ ] **Step 4:** View learned rules in UI
  - Navigate to Pengaturan > Pembelajaran
  - Click "Pelajari Catatan Revisi"
  - Verify rules from revision notes appear in list
  - Check confidence shows as "90%"
  - Verify "dari Anda" badge shows human-created rules

- [ ] **Step 5:** Manage rules
  - Toggle rule active/inactive
  - Verify status persists in database
  - Delete a rule
  - Verify it's removed from database and UI

- [ ] **Step 6:** Commit
```bash
git add packages/memory/rules.ts packages/studio/server.ts packages/studio/ui-js.ts
git commit -m "feat: implement AI learning system from revision notes"
```

---

## Task 11: Prevent Content Duplication and Topic Tracking

**Files:**
- Verify: `packages/memory/topics.ts` (checkSimilarity function)
- Modify: `packages/studio/ui-js.ts:872-897` (similarity warning display)
- Verify: `packages/studio/server.ts:1267-1293` (POST /api/similarity endpoint)

**Interfaces:**
- Consumes: topic text, category key
- Produces: Similarity level (clear/similar/too_similar/duplicate) with matching carousels

**Steps:**

- [ ] **Step 1:** Verify topic history tracking
  - Create and complete carousel with topic "Manajemen Risiko Dasar"
  - Check database: `SELECT * FROM content_signatures ORDER BY created_at DESC LIMIT 1`
  - Verify signature saved with keywords and fingerprint

- [ ] **Step 2:** Test similarity detection
  - Open create carousel form
  - Enter topic similar to existing: "Manajemen Risiko untuk Pemula"
  - Wait 1-2 seconds for similarity check
  - Verify warning appears below topic field

- [ ] **Step 3:** Check warning levels
  - Test exact match: should show "duplicate" warning (orange)
  - Test similar: should show "too_similar" warning (yellow)
  - Test related: should show "similar" info (blue)
  - Test new topic: should clear warning

- [ ] **Step 4:** View similar carousels in warning
  - Trigger similarity warning
  - Verify it shows up to 3 similar carousels
  - Each entry shows: title, similarity %, category
  - Verify scores are reasonable (70-100%)

- [ ] **Step 5:** Continue production despite warning
  - Enter similar topic
  - See warning but proceed with production
  - Verify carousel still produces
  - Verify composer receives history brief with prior carousel

- [ ] **Step 6:** Commit
```bash
git add packages/studio/ui-js.ts
git commit -m "fix: verify topic duplication prevention and similarity warnings"
```

---

## Task 12: Implement Real News Sources for market_info

**Files:**
- Modify: `packages/news/feeds.ts` (add real RSS feed URLs)
- Verify: `packages/news/rss.ts` (feed fetching)
- Test: `packages/news/select.ts` (news filtering)

**Interfaces:**
- Consumes: category key = "market_info"
- Produces: Fresh news items from real sources

**Steps:**

- [ ] **Step 1:** Verify current news sources
  - Check `packages/news/feeds.ts` line 84-86
  - Verify sourcesForCategory("market_info") returns sources
  - Confirm sources have `enabled: true` and `markets: true`

- [ ] **Step 2:** Add real news sources for market_info
  - Add financial news RSS feeds:
    - Bloomberg Market Data
    - Reuters Markets
    - CNBC Markets
    - Yahoo Finance
  - Set `markets: true` for each

- [ ] **Step 3:** Test news fetching
  - Open plan creation tab
  - Check "Ambil berita terbaru untuk sumber topik"
  - Click "Susun Rencana"
  - Verify plan shows news items in output
  - Check "Hasil Rencana" shows news sources used

- [ ] **Step 4:** Test market_info carousel from news
  - Create carousel with category "market_info"
  - Fill topic with market-related keyword
  - Start production
  - Verify carousel facts come from real news sources
  - Check fact sheet shows publication dates and sources

- [ ] **Step 5:** Verify news attribution
  - View carousel details
  - Check "Fact Sheet" section
  - Verify each fact has source name and publication date
  - Verify source URLs work (if provided)

- [ ] **Step 6:** Commit
```bash
git add packages/news/feeds.ts
git commit -m "feat: add real news sources for market_info category"
```

---

## Summary

This plan addresses all 12 user requests through 12 focused tasks:

1. **Fix revision note visibility** - Ensure textarea appears and is required
2. **Auto-revision execution** - Pipeline actually runs with extra instructions from notes
3. **Category color themes** - 5 categories each with primary/accent colors
4. **Category slide templates** - Different template selection per category
5. **Remove folder button** - Delete output folder access button
6. **Button hiding after decision** - Buttons disappear to prevent spam
7. **Refresh loading animation** - Spinner shows during data load
8. **Image uploads & suggestions** - Full support for uploaded images and extra instructions
9. **Weekly planning with news** - Real RSS feeds inform topic planning
10. **AI learning from revisions** - Notes convert to learned rules
11. **Duplication prevention** - Topic history tracking with similarity warnings
12. **Real news sources** - market_info category pulls from actual financial feeds

**Recommended execution approach:** Native (implement all tasks in current session) because:
- Tasks are largely independent with clear boundaries
- Most involve UI fixes or database query verification rather than complex architectural changes
- Early tasks (1-2) unblock later ones (10-11)
- Errors in any task are easily caught and fixed
- Total implementation time: 3-4 hours

