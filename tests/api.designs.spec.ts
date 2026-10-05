import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

class MockLlm {
  costReport() {
    return { entries: [], totalUsd: 0.002, totalTokensIn: 10, totalTokensOut: 20, billableCalls: 1, savedLatencyMs: 0 } as unknown as { entries: unknown[]; totalUsd: number; totalTokensIn: number; totalTokensOut: number; billableCalls: number; savedLatencyMs: number };
  }
  async callJson<T>(opts: { agentKey: string; system: string; user: string }, _shape?: (v: unknown) => string | null): Promise<{ value: T; response: unknown }> {
    if (opts.agentKey === 'strategist') return { value: { angle: 'Analisis FOMC dan ECB dingin profesional', keyMessages: ['FOMC 25bps', 'Likuiditas SMC'], title: 'Dampak FOMC' } as unknown as T, response: {} };
    if (opts.agentKey === 'research') return { value: { entries: [{ id: 'f1', claim: 'FOMC naik', sourceName: 'Umum', asOf: new Date().toISOString(), confidence: 'medium' }, { id: 'f2', claim: 'ECB tetap', sourceName: 'Umum', asOf: new Date().toISOString(), confidence: 'medium' }], limitations: '' } as unknown as T, response: {} };
    if (opts.agentKey === 'copywriter') return { value: { hook: 'FOMC mengguncang', body: 'Narasi dingin', hashtags: ['#FOMC'], cta: 'Simpan' } as unknown as T, response: {} };
    if (opts.agentKey === 'hookGenerator') return { value: { hookOptions: ['Hook FOMC dingin profesional 1', 'Hook ECB SMC Liquidity 2', 'Hook BOE Order Flow 3'], title: 'EURUSD Long' } as unknown as T, response: {} };
    if (opts.agentKey === 'composer') return { value: { slides: [
      { position: 1, role: 'hook', headline: 'Hook Slide', body: null, bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
      { position: 2, role: 'body', headline: 'Chart Slide', body: 'Isi dengan angka', bullets: [], emphasis: [], visual: { type: 'chart_snapshot', chartAssetRef: 'placeholder' }, sourceRefs: [] },
      { position: 3, role: 'cta', headline: 'CTA', body: 'Join', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
      { position: 4, role: 'disclaimer', headline: 'Disclaimer', body: 'Disclaimer text', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
    ] } as unknown as T, response: {} };
    if (opts.agentKey === 'compliance_advisor') return { value: { findings: [] } as unknown as T, response: {} };
    if (opts.agentKey === 'analyst') return { value: { assessment: 'Ok assessment', improvement: 'Ok', reusableAsset: 'x' } as unknown as T, response: {} };
    throw new Error('unknown agent ' + opts.agentKey);
  }
}

async function buildTestServer() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'api-designs-'));
  const dbPath = join(tmpDir, 'test.db');
  const srvMod = await import('../packages/studio/server.ts');
  const factory = (srvMod as unknown as Record<string, unknown>).buildTestServer
    ?? (srvMod as unknown as Record<string, unknown>).buildHttpServer
    ?? (srvMod as unknown as Record<string, unknown>).createTestServer;
  if (typeof factory !== 'function') throw new Error('404 POST /api/designs/:id/generate — server factory not found');
  const mock = new MockLlm() as unknown as import('../packages/llm/client.ts').LlmClient;
  const server = (factory as (opts: unknown) => unknown)({ dbPath, llmFactory: () => mock, mockLlm: mock });
  let httpServer: import('node:http').Server;
  let db: import('node:sqlite').DatabaseSync | null = null;
  if (server && typeof (server as Record<string, unknown>).server !== 'undefined') {
    httpServer = (server as { server: import('node:http').Server }).server;
    db = (server as { db?: import('node:sqlite').DatabaseSync }).db ?? null;
  } else {
    httpServer = server as import('node:http').Server;
  }
  if (!httpServer.listening) {
    httpServer.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
  }
  const addr = httpServer.address() as import('node:net').AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { httpServer, baseUrl, db, dbPath, tmpDir, mock };
}

async function jsonFetch(baseUrl: string, path: string, opts: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { res, json: json as Record<string, unknown>, text };
}

describe('Task 4: API Gate 2 — Designs + Lock/Compliance Guards + Extend GET', () => {
  let ctx: Awaited<ReturnType<typeof buildTestServer>> | null = null;
  before(async () => { ctx = await buildTestServer(); });
  after(async () => {
    if (ctx?.httpServer) await new Promise<void>((resolve) => ctx!.httpServer.close(() => resolve()));
    if (ctx?.db) try { ctx.db.close(); } catch {}
    if (ctx?.tmpDir) try { rmSync(ctx.tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('POST /api/designs/:id/generate before manuscript_approved → 409 "Selesaikan Gate 1 dulu"', async () => {
    assert.ok(ctx);
    const { json: jCreate, res: rCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: 'Topik Gate2 guard sebelum approve yang cukup panjang', callToAction: { kind: 'save', headline: 'Simpan' } }) });
    assert.equal(rCreate.status, 201);
    const cid = String((jCreate.carouselId as string) ?? '');
    assert.ok(cid);
    const { res, json } = await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(res.status, 409, `expected 409 before approve got ${res.status} ${JSON.stringify(json)}`);
    assert.ok(String(json.error ?? json.message ?? JSON.stringify(json)).includes('Selesaikan Gate 1 dulu') || String(JSON.stringify(json)).includes('Selesaikan Gate 1 dulu'), `expected "Selesaikan Gate 1 dulu" in ${JSON.stringify(json)}`);
  });

  it('after approve → 202 designing, GET /api/carousels/:id shows manuscript field', async () => {
    assert.ok(ctx);
    const { json: jCreate, res: rCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: 'Topik Gate2 setelah approve untuk extended GET', callToAction: { kind: 'save', headline: 'Simpan' } }) });
    assert.equal(rCreate.status, 201);
    const cid = String((jCreate.carouselId as string) ?? '');
    const { res: rApprove } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(rApprove.status, 200);
    // attach an uploaded image for chart_snapshot
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    if (ctx!.db) {
      try {
        ctx!.db.prepare('INSERT OR IGNORE INTO uploaded_images (id, carousel_id, original_name, mime_type, byte_size, data_uri, created_at) VALUES (?,?,?,?,?,?,?)').run(`img_${cid.slice(0,6)}`, cid, 'chart.png', 'image/png', 100, dataUri, new Date().toISOString());
      } catch {}
    }
    const { res, json } = await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({ ratios: ['ig_portrait'] }) });
    assert.equal(res.status, 202, `expected 202 after approve got ${res.status} ${JSON.stringify(json)}`);
    // GET extended
    const { res: rGet, json: jGet } = await jsonFetch(ctx!.baseUrl, `/api/carousels/${cid}`, { method: 'GET' });
    assert.equal(rGet.status, 200);
    const hasManuscript = (jGet as Record<string, unknown>).manuscript !== undefined || (jGet.carousel as Record<string, unknown> | undefined)?.manuscript_json !== undefined || (jGet as Record<string, unknown>).manuscriptJson !== undefined;
    // broader check: extended fields present
    assert.ok((jGet as Record<string, unknown>).manuscript !== undefined || hasManuscript, `GET /api/carousels/:id should contain manuscript field, got ${JSON.stringify(Object.keys(jGet))}`);
    assert.ok((jGet as Record<string, unknown>).manuscriptVersion !== undefined || (jGet as Record<string, unknown>).manuscript_version !== undefined || (jGet as Record<string, unknown>).manuscriptLocked !== undefined, `should contain manuscriptVersion/manuscriptLocked, got ${JSON.stringify(jGet).slice(0,600)}`);
    assert.ok((jGet as Record<string, unknown>).materiRaw !== undefined || (jGet as Record<string, unknown>).materi_raw !== undefined || (jGet as Record<string, unknown>).manuscript !== undefined, `should contain materiRaw`);
  });

  it('design regen after Gate2 changes_requested keeps manuscript_locked=1 (manuscript not changed)', async () => {
    assert.ok(ctx);
    const { json: jCreate, res: rCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: 'Topik Gate2 changes_requested keep locked test', callToAction: { kind: 'save', headline: 'Simpan' } }) });
    assert.equal(rCreate.status, 201);
    const cid = String((jCreate.carouselId as string) ?? '');
    const { res: rApprove } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(rApprove.status, 200);
    // generate design
    await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    // wait a bit for design async to finish (needs_review)
    await new Promise((r) => setTimeout(r, 300));
    // Gate2 decision changes_requested
    const { res: rDec } = await jsonFetch(ctx!.baseUrl, `/api/carousels/${cid}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'changes_requested', note: 'Perbaiki visual agar lebih jelas dan presisi' }) });
    assert.equal(rDec.status, 200, `Gate2 changes_requested should be 200 got ${rDec.status}`);
    const { json: jAfter } = await jsonFetch(ctx!.baseUrl, `/api/carousels/${cid}`, { method: 'GET' });
    const row = (jAfter.carousel as Record<string, unknown>) ?? jAfter as Record<string, unknown>;
    const locked = (jAfter.manuscriptLocked ?? row.manuscript_locked ?? row.manuscriptLocked) as number | undefined;
    assert.equal(Number(locked), 1, `manuscript_locked should stay 1 after Gate2 changes_requested, got ${JSON.stringify(jAfter).slice(0,500)}`);
    // regen should still succeed and keep locked=1
    const beforeManuscript = (jAfter.manuscript ?? row.manuscript_json ?? row.manuscript) as unknown;
    const { res: rRegen } = await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(rRegen.status, 202, `regen after Gate2 changes_requested should be 202 got ${rRegen.status}`);
    const { json: jAfter2 } = await jsonFetch(ctx!.baseUrl, `/api/carousels/${cid}`, { method: 'GET' });
    const row2 = (jAfter2.carousel as Record<string, unknown>) ?? jAfter2 as Record<string, unknown>;
    const locked2 = (jAfter2.manuscriptLocked ?? row2.manuscript_locked ?? row2.manuscriptLocked) as number | undefined;
    assert.equal(Number(locked2), 1, `manuscript_locked should remain 1 after regen`);
    const afterManuscript = (jAfter2.manuscript ?? row2.manuscript_json ?? row2.manuscript) as unknown;
    assert.deepEqual(afterManuscript, beforeManuscript, 'manuscript should not have changed after design regen');
  });

  it('POST /api/carousels/:id/decision approved with blocked=1 → 409 "Diblokir kepatuhan"', async () => {
    assert.ok(ctx);
    const { json: jCreate, res: rCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: 'Topik blocked compliance guard test panjang', callToAction: { kind: 'save', headline: 'Simpan' } }) });
    assert.equal(rCreate.status, 201);
    const cid = String((jCreate.carouselId as string) ?? '');
    await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, { method: 'POST', body: JSON.stringify({}) });
    await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    await new Promise((r) => setTimeout(r, 300));
    // force blocked=1
    if (ctx!.db) {
      try { ctx!.db.prepare('UPDATE carousels SET compliance_blocked = 1 WHERE id = ?').run(cid); } catch {}
      try { ctx!.db.prepare("INSERT OR IGNORE INTO compliance_findings (id, carousel_id, rule_key, rule_name, layer, severity, result, subject_ref, evidence, suggestion, decided_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(`${cid}-block`, cid, 'L2.test_block', 'Test block', 'L2_banned_phrase', 'block', 'fail', 'carousel', 'blocked evidence', 'fix', 'rule_engine', new Date().toISOString()); } catch {}
    }
    const { res, json } = await jsonFetch(ctx!.baseUrl, `/api/carousels/${cid}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'approved', note: 'approve blocked test' }) });
    assert.equal(res.status, 409, `expected 409 blocked got ${res.status} ${JSON.stringify(json)}`);
    assert.ok(String(json.error ?? json.message ?? JSON.stringify(json)).includes('Diblokir kepatuhan') || String(json.error ?? '').includes('Carousel diblokir kepatuhan'), `expected "Diblokir kepatuhan" in ${JSON.stringify(json)}`);
  });

  it('bulk-decision 10 with mix status → 207 partial', async () => {
    assert.ok(ctx);
    const ids: string[] = [];
    // create 6 that will be ready for Gate2 decision (needs_review)
    for (let i = 0; i < 6; i++) {
      const { json: jCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: `Bulk decision valid ${i} topik panjang untuk test`, callToAction: { kind: 'save', headline: 'Simpan' } }) });
      const cid = String((jCreate.carouselId as string) ?? '');
      ids.push(cid);
      await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, { method: 'POST', body: JSON.stringify({}) });
      await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    }
    await new Promise((r) => setTimeout(r, 400));
    // create 4 that are not ready (manuscript_needs_review, should be skipped)
    for (let i = 0; i < 4; i++) {
      const { json: jCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: `Bulk decision invalid ${i} topik`, callToAction: { kind: 'save', headline: 'Simpan' } }) });
      ids.push(String((jCreate.carouselId as string) ?? ''));
    }
    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/designs/bulk-decision', { method: 'POST', body: JSON.stringify({ carouselIds: ids, decision: 'approved' }) });
    assert.equal(res.status, 207, `expected 207 partial got ${res.status} ${JSON.stringify(json)}`);
    const succeeded = (json.succeeded ?? json.succeededIds ?? []) as unknown[];
    const skipped = (json.skipped ?? []) as unknown[];
    assert.ok(Array.isArray(succeeded) && succeeded.length === 6, `expected 6 succeeded got ${JSON.stringify(json)}`);
    assert.ok(Array.isArray(skipped) && skipped.length === 4, `expected 4 skipped got ${JSON.stringify(json)}`);
  });

  it('GET /preview/:id/:pos for design slide contains <img src="data:"> for chart_snapshot', async () => {
    assert.ok(ctx);
    const { json: jCreate, res: rCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify({ categoryKey: 'edukasi_trading', topic: 'Topik preview chart_snapshot dataUri test', callToAction: { kind: 'save', headline: 'Simpan' } }) });
    assert.equal(rCreate.status, 201);
    const cid = String((jCreate.carouselId as string) ?? '');
    await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, { method: 'POST', body: JSON.stringify({}) });
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    if (ctx!.db) {
      try { ctx!.db.prepare('INSERT OR IGNORE INTO uploaded_images (id, carousel_id, original_name, mime_type, byte_size, data_uri, created_at) VALUES (?,?,?,?,?,?,?)').run(`img_prev_${cid.slice(0,6)}`, cid, 'chart.png', 'image/png', 100, dataUri, new Date().toISOString()); } catch {}
    }
    await jsonFetch(ctx!.baseUrl, `/api/designs/${cid}/generate`, { method: 'POST', body: JSON.stringify({}) });
    await new Promise((r) => setTimeout(r, 400));
    // find a slide position that has chart_snapshot — try 1..4
    let foundImg = false;
    let lastHtml = '';
    for (let pos = 1; pos <= 4; pos++) {
      const res = await fetch(`${ctx!.baseUrl}/preview/${cid}/${pos}`);
      const html = await res.text();
      lastHtml = html;
      if (html.includes('<img') && html.includes('data:image')) { foundImg = true; break; }
    }
    assert.ok(foundImg, `expected preview to contain <img src="data:"> for chart_snapshot, got preview html snippet: ${lastHtml.slice(0, 800)}`);
  });
});
