# 2-Gate Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-form 9-step pipeline with 2-gate Lean Split (manuscript Gate 1 → locked → design Gate 2) via 3 wizard per kategori, CTA promo multi grid, and chart_snapshot visual fix, with bulk harian/borong in Rencana Mingguan.

**Architecture:** Keep single `carousels` table + JSON columns (SCHEMA_VERSION 6) with `manuscript_versions` for lock/versioning; split `produceCarousel` into `produceManuscript()` (cheap, persona-aware) and `produceDesignFromManuscript(carouselId)` (expensive, visual-enforced); expose polymorphic `POST /api/manuscripts` and `POST /api/designs/*` with 207 partial bulk; replace `f-*` form with hash-switched wizards in one `create` tab; single template engine guarantees preview === PNG.

**Tech Stack:** TypeScript (Node 24 `node:sqlite`), Chromium render, 9Router LLM via `LlmClient`, `pdfjs-dist` (or `pdf-parse`) for PDF extract, Playwright E2E

**Spec:** `docs/superpowers/specs/2026-10-04-2gate-wizard-redesign.md`

## Global Constraints

- SCHEMA_VERSION 6 — add `manuscript_json TEXT, manuscript_version INTEGER DEFAULT 0, manuscript_locked INTEGER DEFAULT 0, manuscript_updated_at TEXT, materi_raw TEXT, materi_links TEXT` + `manuscript_versions` table + migrate `call_to_action.promoCode` → `promoCodes: string[]` verbatim.
- Status extend: `CarouselStatus = 'manuscript_needs_review' | 'manuscript_approved' | 'designing' | 'needs_review' | 'ready_to_publish' | 'manuscript_changes_requested' | 'design_changes_requested' | 'failed' | 'archived' | 'rejected'` — reuse `needs_review` for Gate 2, verbatim sequence `manuscript_needs_review → manuscript_approved (LOCK) → designing → needs_review → ready_to_publish`.
- `1 konten = 1 CTA`, only `kind==='promo'` may carry `promoCodes: string[1..5]` each `3..20` chars `A-Z0-9_-`; else 400; template `cta-action` renders `promoCodes.map()` grid `repeat(auto-fit, minmax(120px,1fr))` in 1 slide CTA.
- Wizard B hash-switch in single `create` tab — delete `f-cat/f-topic/f-extra/f-cta-*` handlers; categories locked per wizard (`edukasi_trading|edukasi_propfirm|market_info` / `jurnal_trading` / `market_outlook`).
- Limits verbatim: `materiRaw ≤8000` chars truncate+warning, `materiLinks ≤3` http(s), PDF ≤5 MB / ≤20 pages, image ≤6 MB, bulk ≤20/request, `GET /api/jobs` split `job_type:'manuscript'|'design'`, `checkSimilarity` only Edukasi/Info skip Jurnal/Outlook.
- Persona Deep verbatim: Edukasi & Market Info full (Strategist+Research+Composer, mention `FOMC/ECB/BOE`, `SMC/Liquidity/Order Flow`, `objektif/dingin/profesional`, angka presisi); Jurnal & Outlook hook-only; Composer enforce `angka → table/stat_tile/chart_snapshot` not `none`.
- `ready_to_publish` is terminal manual-upload — no auto-publish, no `published` status, no webhook.
- `manuscript_locked=1` after Gate 1 approve — `PUT /api/manuscripts/:id` and `POST .../regenerate` without `request-changes` → `409` Indonesian message verbatim.
- Visual fix verbatim: `Slide.visual {type:'chart_snapshot', chartAssetRef: uploadedImages.dataUri}` + template `<img src>` — preview HTML and PNG share one engine.

## Review Focus

- Link/PDF fetch timeout or 404 swallowed as `{ok:false}` — wizard still submits but Research loses fakta; expect `manuscript_needs_review` with warning `"1 dari 3 link gagal"` not block.
- `promoCodes` grid with 5×20-char codes overflows 1080px CTA slide — expect CSS `word-break:break-all` and `auto-fit` grid pins without truncation, verified in PNG not HTML.
- Outlook `gallery` delete/reorder mid-upload leaves orphan `uploaded_images` and `sortOrder` gaps — expect `produceDesignFromManuscript` ignores missing `imageId` (fallback `visual.type='none'` + warning, no crash) and re-normalizes `sortOrder`.
- Bulk 20 with mixed `manuscript_needs_review`/`manuscript_approved` — second approver hits race `UPDATE ... WHERE status='manuscript_needs_review'` affected 0 — expect `207` partial `{succeeded, skipped:{reason}}` not rollback of 17.
- Carousel `v5` row with `call_to_action:{"promoCode":"X"}` after v6 migration — expect `getCarousel` returns `promoCodes:["X"]` and `cta-action` renders 1 kartu grid without data loss.

---

## File Structure

```
packages/shared/types.ts              # CarouselStatus extend, CallToAction.promoCodes, Manuscript* polymorphic types
packages/studio/db.ts                 # SCHEMA_VERSION 6 migration, manuscript_versions, helpers get/put manuscript, cta migrate
packages/agents/prompts.ts            # strategistSystem persona paragraph, researchSystem angka/Source rule, composerSystem visual-enforce + composerExtras promoCodes
packages/agents/pipeline.ts           # split: produceManuscript() + produceDesignFromManuscript() + produceCarousel() wrapper for legacy, visual mapping chart_snapshot=dataUri
packages/studio/server.ts             # deprecated POST /api/produce → delegate; new /api/manuscripts/*, /api/designs/*, /api/materials/fetch-link, /api/uploads/pdf-extract, jobs.job_type, bulk 207, 409 guards
packages/templates/cta-action.ts      # promoCodes[] grid render, fallback headline/body when ctx.callToAction missing
packages/templates/registry.ts        # chart_snapshot → <img src="dataUri"> (remove placeholder)
packages/studio/ui.ts                 # delete Buat Carousel single form, add 3 wizard shells in create tab
packages/studio/ui-js.ts              # delete f-* handlers, add 3 wizard handlers + Gate1 preview (edit/regenerate/approve 3 hooks) + Gate2 generate/decision + bulk Rencana Mingguan + jobs 2-badge polling + fetch-link/pdf-extract
packages/studio/ui-css.ts             # wizard steps, repeatable rows, promo grid, gallery sort handle, version dropdown, counter colors
tests/db.manuscript.spec.ts            # unit for migration, validation, lock, promoCodes, similarity scope (new)
tests/pipeline.manuscript.spec.ts      # unit for produceManuscript/Design split, persona injection, visual mapping (new)
tests/api.manuscripts.spec.ts         # integration SQLite memory + mock LlmClient for /api/manuscripts, /api/designs, fetch-link, pdf-extract
```

## Task 1: DB Migration v6 + Versioning + CTA Shape

**Files:**
- Modify: `packages/shared/types.ts`
- Modify: `packages/studio/db.ts`
- Test: `tests/db.manuscript.spec.ts` (new)

**Interfaces:**
- Consumes: existing `openDb`, `CarouselStatus`, `CallToAction`, `saveProduction`
- Produces: `SCHEMA_VERSION = 6`, `CarouselStatus` extend, `CallToAction {promoCodes?: string[]}`, `manuscript_versions` table, helpers `getManuscript(db,id): ManuscriptPayload|null`, `saveManuscript(db,id, payload)`, `listManuscriptVersions(db,carouselId)`, `migrateCallToAction(raw:string|null): CallToAction|null` for later tasks

- [ ] **Step 1: Write failing test for migration and promoCodes shape**

```ts
// tests/db.manuscript.spec.ts
import { describe,it,expect,beforeEach } from 'node:test'
import { openDb, getCarousel } from '../packages/studio/db.ts'
// assert: DB v5 file with call_to_action='{"kind":"promo","promoCode":"X"}' after openDb with SCHEMA_VERSION 6 has promoCodes:["X"] and manuscript_json columns exist
// assert: validate promoCodes length 6 → should be rejected (test helper validateCallToAction)
// assert: checkSimilarity scope: edukasi 0.83 triggers warn, jurnal skip
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.manuscript.spec.ts` (or `node --test tests/db.manuscript.spec.ts`)
Expected: FAIL — `manuscript_json column does not exist`, `promoCodes` undefined

- [ ] **Step 3: Implement migration in `packages/studio/db.ts` and type extend in `packages/shared/types.ts`**

In `types.ts`: extend `CarouselStatus` union with `manuscript_needs_review|manuscript_approved|manuscript_changes_requested|design_changes_requested|ready_to_publish`; change `CallToAction` `promoCode?: string` → `promoCodes?: string[]` (keep `promoCode` optional for read-migrate).

In `db.ts`: bump `SCHEMA_VERSION` 5→6; in `openDb` migration block `if cur < 6` add columns `manuscript_json, manuscript_version, manuscript_locked, manuscript_updated_at, materi_raw, materi_links`; `CREATE TABLE manuscript_versions`; migrate existing `call_to_action` rows: `JSON.parse → if promoCode && !promoCodes → promoCodes=[promoCode] delete promoCode → UPDATE`; add helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/db.manuscript.spec.ts`
Expected: PASS — columns exist, promoCode→promoCodes migrated, helpers return

- [ ] **Step 5: Commit**

```bash
git add packages/shared/types.ts packages/studio/db.ts tests/db.manuscript.spec.ts
git commit -m "feat(db): SCHEMA_VERSION 6 manuscript columns, versions, promoCodes migration"
```

---

## Task 2: Pipeline Split — produceManuscript + produceDesignFromManuscript + Persona Deep + Visual Fix

**Files:**
- Modify: `packages/agents/prompts.ts`
- Modify: `packages/agents/pipeline.ts`
- Test: `tests/pipeline.manuscript.spec.ts` (new)

**Interfaces:**
- Consumes: `CallToAction{promoCodes}`, `historyBrief`, `learnedRules`, `LlmClient.callJson`, `getManuscript` from Task 1, `UploadedImage`
- Produces: `produceManuscript(req: ManuscriptRequest, llm) => {carouselId, manuscript: ManuscriptPayload, cost}`, `produceDesignFromManuscript(carouselId, {ratios}, llm) => ProductionResult` (reads locked manuscript + maps `chart_snapshot.chartAssetRef = dataUri`), `strategistSystem` persona paragraph verifier `hasPersonaDeep(categoryKey)`

- [ ] **Step 1: Write failing test for split and visual mapping**

```ts
// tests/pipeline.manuscript.spec.ts
// mock LlmClient that returns fixture: strategist {angle:"...FOMC...", keyMessages:["..."]}, hookOptions 3
// edukasi produceManuscript → manuscript.caption present, narrative contains persona phrase, cost.manuscript
// jurnal produceManuscript → hookOptions.length===3, no narrative, hook contains persona phrase
// produceDesignFromManuscript(jurnalId) with 2 uploadedImages dataUri → slides[2].visual.type==='chart_snapshot' && chartAssetRef startsWith 'data:'
// produceDesignFromManuscript with missing imageId → slide fallback type 'none' not throw
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pipeline.manuscript.spec.ts`
Expected: FAIL — `produceManuscript is not defined`

- [ ] **Step 3: Implement prompts persona and pipeline split in `prompts.ts` + `pipeline.ts`**

In `prompts.ts`: append Senior Strategist paragraph to `strategistSystem` gated by category (`edukasi_trading|edukasi_propfirm|market_info` full, `jurnal_trading|market_outlook` hook-only injection in a new `hookGeneratorSystem`); tighten `researchSystem` angka/source; add visual-enforce line to `composerSystem` + update `composerExtras` to render `promoCodes` array.

In `pipeline.ts`: extract `produceManuscript` (strategist→research→narrative→copywriter OR hookGenerator for jurnal/outlook, save manuscript_json, status `manuscript_needs_review`, no render); implement `produceDesignFromManuscript` (load locked manuscript via `getManuscript`, build `UploadedImage` dataUri map, for each slide set `visual.chart_snapshot.chartAssetRef = dataUri`, enforce `angka→table/stat_tile`, then compliance→render); keep `produceCarousel` as legacy wrapper calling both sequentially for backward compat.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pipeline.manuscript.spec.ts`
Expected: PASS — split fns exist, persona phrase present, visual dataUri mapped

- [ ] **Step 5: Commit**

```bash
git add packages/agents/prompts.ts packages/agents/pipeline.ts tests/pipeline.manuscript.spec.ts
git commit -m "feat(pipeline): split manuscript/design, persona deep, chart_snapshot dataUri"
```

---

## Task 3: API Gate 1 — Manuscripts + Materials + PDF Extract + Jobs Split

**Files:**
- Modify: `packages/studio/server.ts`
- Test: `tests/api.manuscripts.spec.ts` (new, SQLite :memory: + mock LlmClient)

**Interfaces:**
- Consumes: `produceManuscript`, `getManuscript`, `saveManuscript`, `openDb(':memory:')`, `LlmClient` mock
- Produces: `POST /api/manuscripts` polymorphic 201, `GET /api/manuscripts/:id`, `PUT /api/manuscripts/:id` (409 if locked), `POST .../regenerate` (note≥5), `POST .../approve` (selectedHookIndex 0-2), `POST .../request-changes`, `POST /api/manuscripts/bulk-generate {slotIds|items}` → 202/207, `POST /api/materials/fetch-link {url}` → `{ok,title,snippet}`, `POST /api/uploads/pdf-extract` multipart → `{text,pages,truncated}`, `GET /api/jobs` with `job_type`

- [ ] **Step 1: Write failing test for Gate 1 endpoints**

```ts
// tests/api.manuscripts.spec.ts (integration, spawn server on random port or call handlers directly)
// edukasi POST /api/manuscripts {topic:"Dampak FOMC...", materiLinks:["https://example.com"], callToAction:{kind:"promo", headline:"Diskon", promoCodes:["A","B"]}} → 201 status manuscript_needs_review
// jurnal minimal form1+form2 → 201 hookOptions 3
// outlook gallery 1 → 201
// POST fetch-link with http:// timeout → {ok:false} not 500, wizard still can submit
// POST pdf-extract with 25 pages → 400 "melebihi 20 halaman"
// PUT after approve → 409 "Naskah sudah dikunci"
// POST regenerate note 3 chars → 400, note 10 chars → 202
// bulk-generate 20 with 3 bad → 207 {succeeded:17, skipped:3}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/api.manuscripts.spec.ts`
Expected: FAIL — `404 POST /api/manuscripts`

- [ ] **Step 3: Implement Gate 1 routes in `packages/studio/server.ts`**

Add job_type to `jobs` table (`ALTER TABLE jobs ADD COLUMN job_type TEXT` in v6 migration or create `manuscript_jobs`); implement `POST /api/manuscripts` polymorphic validator per kategori (topic≥5, materiLinks≤3 http(s), materiRaw≤8000 truncate, jurnal pair required, outlook gallery≥1); implement `materials/fetch-link` with `fetch` 12s timeout, HTML sanitization, reject `file://`/private IP, return `{ok:false}` not 500 on external failure; implement `pdf-extract` via `pdfjs-dist` (no native dep) with 5MB/20pages guards, `{text,pages,truncated}`; implement `GET/PUT/regenerate/approve/request-changes` with lock guard `manuscript_locked===1 → 409`; implement `bulk-generate` loop with `207` partial `{succeeded:[], skipped:[{id,reason}]}`; extend `GET /api/jobs` to return `jobType`; keep backward compat `POST /api/produce` as deprecated delegate to `produceCarousel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/api.manuscripts.spec.ts`
Expected: PASS — all Gate 1 routes return expected codes

- [ ] **Step 5: Commit**

```bash
git add packages/studio/server.ts packages/studio/db.ts tests/api.manuscripts.spec.ts
git commit -m "feat(api): Gate1 manuscripts, fetch-link, pdf-extract, bulk 207, jobs split"
```

---

## Task 4: API Gate 2 — Designs + Lock/Compliance Guards + Extend GET

**Files:**
- Modify: `packages/studio/server.ts`
- Modify: `packages/studio/db.ts` (optional helper `isManuscriptLocked`)
- Test: `tests/api.designs.spec.ts` (new)

**Interfaces:**
- Consumes: `produceDesignFromManuscript`, `getManuscript`, `decideCarousel` guard, `manuscript_locked` from Task 1/3
- Produces: `POST /api/designs/:id/generate` 202/409, `POST /api/designs/bulk-generate` 202/207, `POST /api/carousels/:id/decision` Gate2 mapping `approved→ready_to_publish`, `changes_requested→design_changes_requested` (manuscript stays locked), `POST /api/designs/bulk-decision` 207, `GET /api/carousels/:id` extended `+ manuscript, manuscriptVersion, manuscriptLocked, materiRaw`

- [ ] **Step 1: Write failing test for Gate 2 and guards**

```ts
// tests/api.designs.spec.ts
// POST /api/designs/:id/generate before manuscript_approved → 409 "Selesaikan Gate 1 dulu"
// after approve → 202 designing, GET /api/carousels/:id shows manuscript field
// design regen after Gate2 changes_requested keeps manuscript_locked=1 (manuscript not changed)
// POST /api/carousels/:id/decision approved with blocked=1 → 409 "Diblokir kepatuhan"
// bulk-decision 10 with mix status → 207 partial
// GET /preview/:id/:pos for design slide contains <img src="data:"> for chart_snapshot
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/api.designs.spec.ts`
Expected: FAIL — `404 POST /api/designs/:id/generate`

- [ ] **Step 3: Implement Gate 2 routes and guards in `server.ts`**

Implement `POST /api/designs/:id/generate` — check `manuscript_locked===1` else 409, call `produceDesignFromManuscript` with `ratios`, set `status='designing'` then `needs_review`; implement `bulk-generate` filter only `manuscript_approved`; implement `bulk-decision` with same guard as single; extend `POST /api/carousels/:id/decision` to map: `approved` from `needs_review` → `ready_to_publish` (no auto-publish), `changes_requested` from `needs_review` → `design_changes_requested` (manuscript_locked stays 1, design-only regen), keep `rejected→archived`; extend `GET /api/carousels/:id` response with manuscript fields; fix `previewSlide` to embed `dataUri` for `chart_snapshot`; reuse `Compliance` block guard `409 "Carousel diblokir kepatuhan"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/api.designs.spec.ts`
Expected: PASS — Gate 2 flows and guards behave

- [ ] **Step 5: Commit**

```bash
git add packages/studio/server.ts tests/api.designs.spec.ts
git commit -m "feat(api): Gate2 designs, lock/compliance guards, ready_to_publish"
```

---

## Task 5: UI Wizards — 3 Category Forms + CTA Promo Grid + Gallery

**Files:**
- Modify: `packages/studio/ui.ts`
- Modify: `packages/studio/ui-js.ts` (delete f-* handlers, add wizards)
- Modify: `packages/studio/ui-css.ts`
- Modify: `packages/templates/cta-action.ts`
- Modify: `packages/templates/registry.ts` (chart_snapshot img)
- Test: manual Playwright `tests/e2e/wizard.spec.ts` (new, mock API)

**Interfaces:**
- Consumes: `POST /api/manuscripts` polymorphic, `POST /api/materials/fetch-link`, `POST /api/uploads/pdf-extract`, `STUDIO_JS` hash router
- Produces: hash routes `#create-edukasi|jurnal|outlook` with per-wizard validation, repeatable `materiLinks` max3, PDF extract, Jurnal table repeatable+CSV import, Outlook gallery `+Tambah` with `↑↓` sort, CTA `+Tambah Kode Promo` grid preview `promoCodes.map()`

- [ ] **Step 1: Write failing E2E test for wizards**

```ts
// tests/e2e/wizard.spec.ts (Playwright, mock POST /api/manuscripts → 201)
// edukasi: select kategori, type topic, paste 500 words, add 2 links, pick promo + 1 extra kode, submit → fetch called, success toast
// jurnal: add 2 table rows, fill 3 descs + mock upload thumb, hookOptions radio 3 present
// outlook: add 4 gallery items + reorder ↑↓, submit
// CTA grid: promo 3 codes → grid 3 cards, kind=community with promoCodes → 400 error toast
// validation: empty topic submit → field red, submit blocked
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/wizard.spec.ts`
Expected: FAIL — wizard elements not found (old form still present)

- [ ] **Step 3: Implement wizards and template fixes**

In `ui.ts`: delete single `Buat Carousel` form HTML; add 3 wizard shells inside `create` tab: `create-edukasi` (kategori select, topic input, materi textarea+counter, links repeatable with Fetch button+snippet preview, PDF file input, image thumbs), `create-jurnal` (2-step: table with +Tambah/CSV import, 4 groups description+upload), `create-outlook` (title/timeframe/notes, gallery repeatable with ↑↓/Hapus), CTA block with kind select→ promo detail shows `+Tambah Kode Promo` grid preview.

In `ui-js.ts`: delete handlers `f-cat/f-topic/f-extra/f-cta-kind/f-cta-head/f-cta-detail/f-cta-code/f-cta-valid/f-cta-comm`; add `create-edukasi/jurnal/outlook` handlers with per-wizard validation (topic≥5, materiLinks≤3, pair required, gallery≥1, promoCodes 1..5×3..20 A-Z0-9_-); implement `fetch-link` Fetch button and `pdf-extract` file change handler (progress+truncate warning).

In `cta-action.ts`: replace single `promoCode` render with `promoCodes.map(p=>`<div class="cta-code">${esc(p)}</div>`).join('')` grid wrapper `display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))`.

In `registry.ts`: `chart_snapshot` case render `<img src="${esc(chartAssetRef)}" alt="${esc(altText)}" style="width:100%;height:100%;object-fit:cover">` (remove placeholder).

In `ui-css.ts`: add `.wizard-step`, `.repeatable-row`, `.promo-grid`, `.gallery-handle`, `.version-dropdown`, counter red when >8000.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/wizard.spec.ts`
Expected: PASS — wizards render, submit mocks succeed, grid 3 cards visible

- [ ] **Step 5: Commit**

```bash
git add packages/studio/ui.ts packages/studio/ui-js.ts packages/studio/ui-css.ts packages/templates/cta-action.ts packages/templates/registry.ts tests/e2e/wizard.spec.ts
git commit -m "feat(ui): 3 wizards edukasi/jurnal/outlook, promo grid, chart_snapshot img"
```

---

## Task 6: UI Gate 1 Preview + Bulk Rencana Mingguan + Jobs 2-Badge

**Files:**
- Modify: `packages/studio/ui-js.ts`
- Modify: `packages/studio/ui.ts` (plan slot checkboxes + badges)
- Modify: `packages/studio/ui-css.ts` (badge still needed)
- Test: `tests/e2e/gate.spec.ts` (new, mock manuscript→design flow)

**Interfaces:**
- Consumes: `GET /api/manuscripts/:id`, `PUT /api/manuscripts/:id`, `POST .../regenerate|approve|request-changes`, `POST /api/manuscripts/bulk-generate|bulk-approve`, `POST /api/designs/*`, `GET /api/jobs` with job_type from Task 3/4
- Produces: Gate 1 preview card in-wizard Step 2 (Edit Manual, Regenerate+note modal, Approve with selectedHookIndex 0-2, version history dropdown view-only), Rencana Mingguan slot checkboxes + `manuscriptStatus/designStatus` badges synced via `carouselId`, bulk buttons harian/borong, jobs polling 2 badges (Gate1 yellow, Gate2 blue)

- [ ] **Step 1: Write failing E2E test for Gate flow and bulk**

```ts
// tests/e2e/gate.spec.ts (mock all /api/manuscripts|designs|jobs)
// Gate1: submit edukasi → card manuscript_needs_review appears with Edit|Regenerate|Approve; Approve without selectedHookIndex for edukasi → 200, for jurnal with index 1 → locked=1, Lanjut ke Design button appears
// Edit click → textarea editable, save → version v2
// Regenerate modal note 3 chars → 400 toast, 10 chars → 202
// Bulk: check 5 slots → Generate Naskah Terpilih → 207 toast "5 berhasil" (mock), badges update
// Lock: after approve, Edit button disabled + PUT 409 toast
// Jobs: GET /api/jobs returns manuscript + design jobs → 2 badges rendered
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/gate.spec.ts`
Expected: FAIL — Gate 1 preview card not found, bulk buttons missing

- [ ] **Step 3: Implement Gate 1 preview + bulk + jobs polling in `ui-js.ts`**

Implement `renderManuscriptPreview(manuscript, versions)` in-wizard Step 2: show `angle/keyMessages/narrative/caption` for edukasi or `hookOptions` 3 radios for jurnal/outlook; buttons Edit (opens textarea → `PUT`), Regenerate (modal note≥5 → `POST .../regenerate`), Approve (for jurnal/outlook require `selectedHookIndex`, then `POST .../approve` → `locked=1` → show `Lanjut ke Design`); version dropdown view-only + restore via `PUT` with `Restore v2`.

Implement Rencana Mingguan bulk: add checkbox per slot + badges `manuscriptStatus/designStatus` (sync from `slots[].carouselId` lookup), buttons `Generate Naskah Terpilih`, `Approve Naskah Terpilih`, `Generate Design Terpilih`, `Approve Design Terpilih` calling bulk endpoints with `207` partial toast `"17 berhasil, 3 dilewati — lihat detail"`.

Implement jobs polling: `GET /api/jobs` split by `job_type` → render 2 badges separately, polling interval same as existing.

Update `ui.ts` plan slot HTML to include checkboxes and badge containers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/gate.spec.ts`
Expected: PASS — Gate flow, bulk, lock, jobs badges all behave

- [ ] **Step 5: Commit**

```bash
git add packages/studio/ui.ts packages/studio/ui-js.ts tests/e2e/gate.spec.ts
git commit -m "feat(ui): Gate1 preview, bulk harian/borong, jobs 2-badge"
```

---

## Task 7: Verification Hardening — Visual PNG, Regression, Smoke

**Files:**
- Create: `tests/e2e/visual.spec.ts` (new, Playwright screenshot)
- Modify: `packages/studio/server.ts` (ensure preview→PNG parity path tested)
- Test: full suite `npm test` + `npx playwright test`

**Interfaces:**
- Consumes: all prior tasks
- Produces: proof that `chart_snapshot` verified in PNG output not just HTML, migrated `v5` carousel still renders 200, premium suite green before merge

- [ ] **Step 1: Write failing visual regression test**

```ts
// tests/e2e/visual.spec.ts
// generate jurnal with 4 images (mock dataUri 1x1 png), call POST /api/designs/:id/generate, fetch PNG via GET /files/:path, assert PNG buffer contains image data (not placeholder)
// outlook 5 gallery → slide count 7 (1+5+1) and each gallery slide preview contains <img src="data:">
// CTA promo 3 codes → preview HTML contains 3 .cta-code elements, width check grid
// regression: GET /api/carousels/:id for v5 fixture returns 200 and previewSlide 200
```

- [ ] **Step 2: Run test to verify it fails (before PNG parity is confirmed)**

Run: `npx playwright test tests/e2e/visual.spec.ts`
Expected: FAIL — PNG buffer equals placeholder or missing <img>

- [ ] **Step 3: Fix parity gaps in `server.ts` previewSlide if needed**

Ensure `previewSlide` reads `spec.slides[].visual.chartAssetRef` from DB/folder and `buildHtml` path identical to `renderCarousel` image embed; no extra fix if Task 2/4 already passed — this step is verification guard.

- [ ] **Step 4: Run full verification suite**

Run: `npm test` (unit+api) and `npx playwright test` (wizard+gate+visual)
Expected: PASS — all 3 suites green; manual QA checklist (spec 5E 10 items) handed to owner for tick before merge; one 9Router smoke `edukasi_trading` real LLM run produces persona phrase + angka presisi

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/visual.spec.ts packages/studio/server.ts
git commit -m "test: visual PNG verification, regression, smoke gate"
```

---

## Self-Review

**Spec coverage:** 1A state machine→Task1+4, 1B columns+promoCodes→Task1, 1B.3 upload reuse→Task2+3, 1C versioning/lock→Task1+3, 1D plan link→Task6, 1E revisions scope→Task4, 2A split→Task2, 2B Gate1 API→Task3, Gate2→Task4, 2C visual fix→Task2+4+5, 2D jobs split→Task3, 2E limits→Task3, 3A navigation→Task5, 3B/C/D wizards→Task5, 3E CTA multi→Task1+5, 3F Gate1 preview→Task6, 3G bulk→Task6, 3H visual→Task5, 4 all guards→Task3+4+6, 5 testing pyramid→Task1-7 — no gaps.

**Step scan:** each test step names exact file and assertions with spec exact values (8000, 3, 5MB/20 hal, promoCodes 1..5×3..20, hookOptions 3, gallery≥1, 409/207 codes, Indonesian messages verbatim); code steps pin exact file, signature, values; no TBD/edge-hand-waving.

**Type consistency:** `CarouselStatus` extend same across tasks 1-4, `CallToAction.promoCodes` same shape tasks 1/2/5, `ManuscriptPayload` polymorphic same between pipeline task2 and api task3, `job_type` literal `'manuscript'|'design'` consistent 3/4/6.

**Review Focus:** each of 5 lines has owning task test: link/PDF fail-open→Task3, promo grid overflow PNG→Task7, gallery orphan→Task2, bulk race 207→Task3/4, v5 promoCode migrate→Task1.

**Proportion:** spec ~900 lines, plan ~350 lines code+tests — not transcript, signatures+assertions only, bodies omitted where test+signature determine.

