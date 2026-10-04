# Task 3 — API Gate 1 — Manuscripts + Materials + PDF Extract + Jobs Split — Report

**Status:** DONE
**Commit:** cc4674a — `feat(api): Gate1 manuscripts, fetch-link, pdf-extract, bulk 207, jobs split`
**Date:** 2026-10-04

## Scope
- `packages/studio/server.ts` — Gate 1 block inside `handle()`: `validateManuscriptBody` polymorphic (edukasi topic≥5 materiLinks≤3 http(s) / jurnal form1≥1 pair required direction long/short + form2 3 descs ≥10 / outlook title≥8 gallery≥1 description≥10), `createManuscriptFromBody` cheap-path manuscript (edukasi narrative+caption angle FMI/ECB/SMC / jurnal/outlook hookOptions 3), persist carousel `manuscript_needs_review` + `saveManuscript` v1 + `createJob jobType=manuscript`; routes `POST /api/manuscripts →201`, `POST /api/manuscripts/bulk-generate →202/207 {succeeded,skipped} max 20 slice`, `GET /api/manuscripts/:id →{carousel,manuscript,versions,materiRaw,materiLinks}`, `PUT /api/manuscripts/:id →200 v+1 /409 Naskah sudah dikunci when manuscript_locked=1`, `POST .../regenerate note≥5 →202 job manuscript /400 short /409 locked without request-changes`, `POST .../approve selectedHookIndex 0-2 →200 manuscript_approved locked=1 /400 invalid index /409 race when status not manuscript_needs_review|manuscript_changes_requested`, `POST .../request-changes note≥5 →200 manuscript_changes_requested unlocks + recordRevision`; `POST /api/materials/fetch-link →{ok,title,snippet,textSnippet}` with 12s AbortController, rejects file:// and private IP via isPrivateHost (10./192.168./172.16-31./127./::1/0.), returns `{ok:false}` not 500 on fetch failure; `POST /api/uploads/pdf-extract` multipart boundary parse + raw 6MB limit + 5MB/20 pages guard `PDF melebihi 20 halaman` via countPdfPages `/Type /Page[^s]`, fallback extract parenthesized text + pdfjs-dist degrade; `GET /api/jobs →{active,recent}` with `jobType`/`job_type` alias; helpers `isHttpUrl,isPrivateHost,sanitizeText,countPdfPages,extractPdfTextFallback,readRawBody`; `POST /api/produce` kept deprecated; `DB_OVERRIDE` symbol + `activeDbFor(req)` + `buildHttpServer/buildTestServer/createTestServer` factory for test isolation (tmpDbPath openDb + global `__TEST_LLM_FACTORY__/__TEST_MOCK_LLM__`); auto-listen guarded by `if isMain` (fileURLToPath resolve).
- `packages/studio/db.ts` — `JobRow job_type/jobType?`, `SCHEMA_VERSION 6` jobs `job_type TEXT`, `ALTER TABLE jobs ADD COLUMN job_type TEXT` for pre-v6 DBs, `createJob(job,{jobType})` try job_type column then fallback.
- `tests/api.manuscripts.spec.ts` — 10 tests: edukasi POST 201 promo CTA, jurnal form1+form2 201 hookOptions 3, outlook gallery 201, fetch-link private 200 ok:false not 500, pdf-extract 25 pages 400 melebihi 20 halaman, PUT after approve 409 Naskah sudah dikunci, regenerate note 3→400 10→202, bulk 20 with 3 bad 207 17/3, GET /api/jobs job_type, validation 5 cases 400.

## Self-review
- Stable public interface [Yes]: `POST /api/manuscripts`, `GET/PUT /api/manuscripts/:id`, `POST .../regenerate|approve|request-changes`, `POST /api/manuscripts/bulk-generate`, `POST /api/materials/fetch-link`, `POST /api/uploads/pdf-extract`, `GET /api/jobs` with `job_type` alias.
- Verbatim guards [Yes]: `Maksimal 3 link`, `Link harus http(s)`, `Hanya CTA promo boleh multi kode`, `Pair wajib diisi`, `Galeri minimal 1`, `melebihi 20 halaman`, `Naskah sudah dikunci`, note≥5, selectedHookIndex 0-2, bulk 207 `{succeeded,skipped}`.
- Failure modes [Yes]: fetch-link ok:false not 500, private IP/file:// rejected, pdf 5MB/20 pages 400, lock 409 edit/regenerate, bulk partial 207 not 500.
- No console/mark [Yes]: server logs only via handle catch + seed path; no AI marker.
- File placement [Yes]: routes inside existing `handle()` Gate 1 block, db job_type in `packages/studio/db.ts` jobs table.
- Test strength [Yes]: real HTTP via `fetch` on random port, MockLlm factory via buildHttpServer opts, multipart fake PDF 25 pages, negative validation 5 cases.

## Test Summary
- One-line: `tests/api.manuscripts.spec.ts 10/10 PASS`
- `node --experimental-strip-types --test tests/api.manuscripts.spec.ts` — 10/10 pass (~1.5s)
- `node --experimental-strip-types --test tests/db.manuscript.spec.ts tests/pipeline.manuscript.spec.ts --test-concurrency=1` — 7/7 pass no regression

## Concerns
- `isMain` listen guard uses `fileURLToPath(import.meta.url) === resolve(process.argv[1])` — Windows path normalize via resolve covers, but direct `node packages/studio/server.ts` still listens via same handle; test factory callers don't trigger listen.
- `DB_OVERRIDE` isolation covers Gate 1 routes via `activeDbFor(req)`; `runProduction` legacy path still uses global `db` — not exercised by Gate 1 tests, acceptable until Gate 2 task wires produce flows via activeDb.
- `materiRaw` truncate to 8000 + warning field inside 201 response handled via `truncatedWarning` helper inside create handler scope — warning key present only when input exceeded, not on subsequent GET.

## Fix 2026-10-04 — Review findings (Important)
- `server.ts:1959` pdf-extract: wrap `readRawBody(6MB)` in try/catch → 400 `PDF melebihi 5MB.` for 5–6 MB and for >6 MB throw path (was 500 via outer catch).
- `server.ts:1747` bulk: guard original `items.length >20` before slice → 400 `Maksimal 20 item per permintaan bulk.` (was dead code after slice, silently truncated).
- `server.ts:1877` approve: atomic `UPDATE ... WHERE id=? AND status IN ('manuscript_needs_review','manuscript_changes_requested')`, check `changes`; if 0 return 409 `Naskah sudah diproses atau status tidak sesuai.` verbatim (was SELECT then UPDATE race).
- `server.ts:1725` hoisting: move `truncatedWarning` to outer Gate 1 scope so not called before declaration (TDZ risk).
- Verify: `tests/api.manuscripts.spec.ts` still 10/10 pass; `tests/db.manuscript.spec.ts tests/pipeline.manuscript.spec.ts` 7/7 pass; manual verify: `21 items→400`, `5.5MB PDF→400`, `approve×2 second→409` verbatim.
- Commit: `76d8f61 fix(task3): 400 not 500 for PDF limit, bulk 20 guard, atomic approve, hoisting fix`

## Links
- Docs: `.superpowers/sdd/2026-10-04-2gate-wizard-redesign/task-3-brief.md`
- Spec: `docs/superpowers/specs/2026-10-04-2gate-wizard-redesign.md` §§2B,2D,4A,4B,4D,5C
- Plan: `docs/superpowers/plans/2026-10-04-2gate-wizard-redesign.md` Task 3
