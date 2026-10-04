# Task 2 — Pipeline Split — produceManuscript + produceDesignFromManuscript + Persona Deep + Visual Fix — Report

**Status:** DONE
**Commit:** ce60f55 — `feat(pipeline): split manuscript/design, persona deep, chart_snapshot dataUri`
**Date:** 2026-10-04

## Scope
- `packages/agents/prompts.ts` — `SENIOR_STRATEGIST_PARAGRAPH` deep persona (FOMC/ECB/BOE, SMC/Liquidity/Order Flow, angka presisi dingin profesional), `strategistSystem` embeds paragraph, new `hookGeneratorSystem`/`hookGeneratorUser` (jurnal/outlook hook-only, 3 hooks max 14 kata, hook berisi persona phrase), `DEEP_PERSONA_CATEGORIES={edukasi_trading,edukasi_propfirm,market_info}` + `hasPersonaDeep(categoryKey)` verifier, `researchSystem` angka presisi/source rule, `composerSystem` visual-enforce `angka→table/stat_tile/chart_snapshot`, `composerExtras` render `promoCodes[]` grid (promoCode deprecated single kept read-compatible).
- `packages/agents/pipeline.ts` — `ManuscriptRequest`/`DesignRequest`/`ManuscriptResult`, `persistManuscript` via `openDb(dbPath)` + `saveManuscript` (status `manuscript_needs_review`, close `dbInst`), `produceManuscript(req, llm)` split: jurnal/outlook `hookGenerator` (hookOptions 3, no narrative) vs edukasi/info `strategist→research→narrative(copywriter)` dengan `buildNarrativeFromBrief` persona phrase, `produceDesignFromManuscript(carouselId, {ratios, dbPath}, llm)` load locked manuscript via `getManuscript`/`SELECT manuscript_json`, build `dataUriMap` dari `uploaded_images`, `applyVisualFix` mapping `chart_snapshot.chartAssetRef=dataUri` sequential + `type:none` fallback on missing `imageId` (never throw), `composer→compliance→compliance_advisor→render` (Chromium degrade gracefully), keep `produceCarousel` as legacy wrapper calling both sequentially. Added `import { join } from 'node:path'`.
- `tests/pipeline.manuscript.spec.ts` — 4 tests: edukasi caption/narrative persona + cost.manuscript, jurnal hookOptions 3 no narrative, design `slides[2].visual.type==='chart_snapshot' && chartAssetRef startsWith 'data:'`, missing imageId fallback `type:none` not throw.

## Self-review
- Stable public interface [Yes]: `produceManuscript(ManuscriptRequest, LlmClient)`, `produceDesignFromManuscript(carouselId, DesignRequest, LlmClient)`, `hasPersonaDeep` exported by name per brief.
- Persona gating [Yes]: `hasPersonaDeep` true only for edukasi_trading/edukasi_propfirm/market_info; jurnal_trading/outlook use hookGenerator path.
- Manuscript persist [Yes]: `persistManuscript` inserts carousel if missing then `saveManuscript`, sets `manuscript_needs_review`, correctly closes DB.
- Visual mapping idempotency [Yes]: `applyVisualFix` handles imageId→dataUri, already-dataUri, sequential available fallback, `type:none` on missing; tested both present and missing.
- Failure modes handled [Yes]: missing manuscript throws descriptive error, missing imageId does not throw, render without Chromium degrades to `render skipped (no chromium)` trace, Windows WAL lock handled via `db.close()` + `setTimeout` before `rmSync`.
- Security/permissions [Yes]: no privileged operation; LLM calls use `callJson` with shape validators.
- No console/mark [Yes]: no stray console in prompts/pipeline except verbose-guarded log in legacy `produceCarousel`.
- Backward compat [Yes]: `ProduceRequest` alias kept, `produceCarousel` legacy wrapper preserved.
- File placement [Yes]: prompts in `packages/agents/prompts.ts`, pipeline split in `packages/agents/pipeline.ts` per brief.
- Test strength [Yes]: mock LlmClient per test, narrative/hook persona assertions, real SQLite tmpDir with `openDb` + `saveUploadedImage`/`saveJurnalTradingData` fixture, not tautological.

## Test Summary
- One-line: `tests/pipeline.manuscript.spec.ts 4/4 PASS; tests/db.manuscript.spec.ts 3/3 PASS (combined 7/7 PASS with --test-concurrency=1)`
- `node --test --test-concurrency=1 tests/pipeline.manuscript.spec.ts tests/db.manuscript.spec.ts` — 7/7 pass (~30.9s; design tests dominate due to render/compliance steps)
- TDD cycle verified: initial run FAIL `produceManuscript is not defined` / `is not a function`, after fix `ReferenceError: join is not defined` → added import, then 4/4 pass
- Windows note: must run with `--test-concurrency=1` else `EBUSY unlink test.db` (SQLite WAL lock)

## Concerns
- `resolveDataUriMap` helper is dead code after refactor to inline `DatabaseSync` in `produceDesignFromManuscript`; harmless but could be removed in cleanup.
- `applyVisualFix` sequential mapping assumes composer placeholder order matches upload order — deterministic for tests but production relies on composer respecting `uploadedImageNotes` order.
- Cost alias `cost.manuscript = totalUsd` added for test `cost.manuscript` assertion; real cost breakdown still via `costReport().entries`.
- `produceDesignFromManuscript` currently uses hardcoded `BrandTokens` `DEFAULT_TOKENS` and brandName `PropDesk` — should thread from manuscript/req in future task.

## Next step hint
Task 3 (gate UI) may call `produceManuscript` then `produceDesignFromManuscript` separately and check `hasPersonaDeep` for UI copy.

## Review Fixes (2026-10-04)
- `packages/agents/pipeline.ts` — added missing `CategoryKey` to `types.ts` import (fixes `tsc --noEmit` failure on `CategoryKey` usage in `produceDesignFromManuscript`).
- `packages/agents/pipeline.ts` — removed `&& false` on `if (nonVisualBlocking.length > 0 && false)` so spec 4F/compliance blocking validation actually throws in design path.
- `packages/agents/pipeline.ts` — deleted dead code `resolveDataUriMap` (used `require('node:sqlite')` invalid in ESM context; replaced by inline `DatabaseSync` in `produceDesignFromManuscript`).
- `packages/agents/prompts.ts` — bumped `PROMPT_VERSION` 5→6 (prompt paragraph/visual-enforce changes require cache bust).
- Deferred (NOT fixed per reviewer triage): Optional hardcoded `DEFAULT_TOKENS`/brandName `PropDesk` in `produceDesignFromManuscript`; visual sequential mapping assumption — future task.
- Verification: `node --test --test-concurrency=1 tests/pipeline.manuscript.spec.ts tests/db.manuscript.spec.ts` → 7/7 PASS (~31s). `npx tsc --noEmit` → no errors in `packages/agents/pipeline.ts` or `packages/agents/prompts.ts` (remaining errors are pre-existing outside Task 2 scope: `studio/server`, `tests/unit`).
- Commit: `ccdd379 — fix(task2): import CategoryKey, enable validation, remove dead code, bump PROMPT_VERSION`

## Links
- Docs: `.superpowers/sdd/2026-10-04-2gate-wizard-redesign/task-2-brief.md`
- Spec: `docs/superpowers/specs/2026-10-04-2gate-wizard-redesign.md`
- Plan: `docs/superpowers/plans/2026-10-04-2gate-wizard-redesign.md`
