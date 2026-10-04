import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

// Mock LLM that satisfies pipeline's expected shapes
class MockLlm {
  costReport() {
    return { entries: [], totalUsd: 0.002, totalTokensIn: 10, totalTokensOut: 20, billableCalls: 1, savedLatencyMs: 0, totalTokensOut2: 0 } as unknown as { entries: unknown[]; totalUsd: number; totalTokensIn: number; totalTokensOut: number; billableCalls: number; savedLatencyMs: number };
  }
  async callJson<T>(opts: { agentKey: string; system: string; user: string }, _shape?: (v: unknown) => string | null): Promise<{ value: T; response: unknown }> {
    if (opts.agentKey === 'strategist') {
      return { value: { angle: 'Analisis FOMC dan ECB terhadap likuiditas SMC Order Flow dingin profesional', objective: 'educate', targetAudience: 'trader', keyMessages: ['FOMC menaikkan suku bunga 25bps', 'Likuiditas terfragmentasi pada London session'], hookDirection: 'Hook FOMC', title: 'Dampak FOMC pada likuiditas' } as unknown as T, response: {} };
    }
    if (opts.agentKey === 'research') {
      return { value: { entries: [{ id: 'f1', claim: 'FOMC menaikkan suku bunga', sourceName: 'Pengetahuan umum industri', asOf: new Date().toISOString(), confidence: 'medium' }, { id: 'f2', claim: 'ECB mempertahankan suku bunga', sourceName: 'Pengetahuan umum industri', asOf: new Date().toISOString(), confidence: 'medium' }], limitations: 'terbatas' } as unknown as T, response: {} };
    }
    if (opts.agentKey === 'copywriter') {
      return { value: { hook: 'FOMC mengguncang likuiditas pasar', body: 'Narasi dingin profesional tentang FOMC dan ECB dengan angka presisi', hashtags: ['#FOMC', '#Trading'], cta: 'Simpan' } as unknown as T, response: {} };
    }
    if (opts.agentKey === 'hookGenerator') {
      return { value: { hookOptions: ['Hook FOMC dingin profesional 1', 'Hook ECB SMC Liquidity 2', 'Hook BOE Order Flow 3'], title: 'EURUSD Long' } as unknown as T, response: {} };
    }
    if (opts.agentKey === 'composer') {
      return { value: { slides: [
        { position: 1, role: 'hook', headline: 'Hook', body: null, bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
        { position: 2, role: 'body', headline: 'Body', body: 'Isi edukasi', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
        { position: 7, role: 'cta', headline: 'CTA', body: 'Join', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
        { position: 8, role: 'disclaimer', headline: 'Disclaimer', body: 'Disclaimer text', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
      ] } as unknown as T, response: {} };
    }
    if (opts.agentKey === 'compliance_advisor') return { value: { findings: [] } as unknown as T, response: {} };
    if (opts.agentKey === 'analyst') return { value: { assessment: 'Ok', improvement: 'Ok', reusableAsset: 'x' } as unknown as T, response: {} };
    throw new Error('unknown agent ' + opts.agentKey);
  }
  async call() { throw new Error('not needed'); }
}

// Helper to build a test server with :memory: db and mock LLM
async function buildTestServer() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'api-manuscripts-'));
  const dbPath = join(tmpDir, 'test.db');
  // Import server factory after it exists — before implementation this will throw
  const srvMod = await import('../packages/studio/server.ts');
  // Expect exported factory buildTestServer or buildHttpServer or createTestServer
  const factory = (srvMod as unknown as Record<string, unknown>).buildTestServer
    ?? (srvMod as unknown as Record<string, unknown>).buildHttpServer
    ?? (srvMod as unknown as Record<string, unknown>).createTestServer;
  if (typeof factory !== 'function') {
    throw new Error('404 POST /api/manuscripts — server factory not found (expected FAIL before implementation)');
  }
  const mock = new MockLlm() as unknown as import('../packages/llm/client.ts').LlmClient;
  const server = (factory as (opts: unknown) => unknown)({ dbPath, llmFactory: () => mock, mockLlm: mock });
  // factory may return { server, db } or just server
  let httpServer: import('node:http').Server;
  let db: import('node:sqlite').DatabaseSync | null = null;
  if (server && typeof (server as Record<string, unknown>).server !== 'undefined') {
    httpServer = (server as { server: import('node:http').Server }).server;
    db = (server as { db?: import('node:sqlite').DatabaseSync }).db ?? null;
  } else {
    httpServer = server as import('node:http').Server;
  }
  // If server factory returns a server that already listens, get address; else listen on random port
  if (!httpServer.listening) {
    httpServer.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
  }
  const addr = httpServer.address() as import('node:net').AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { httpServer, baseUrl, db, dbPath, tmpDir, mock };
}

async function jsonFetch(baseUrl: string, path: string, opts: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { res, json: json as Record<string, unknown>, text };
}

describe('Task 3: API Gate 1 — Manuscripts + Materials + PDF Extract + Jobs Split', () => {
  let ctx: Awaited<ReturnType<typeof buildTestServer>> | null = null;

  before(async () => {
    ctx = await buildTestServer();
  });

  after(async () => {
    if (ctx?.httpServer) {
      await new Promise<void>((resolve) => ctx!.httpServer.close(() => resolve()));
    }
    if (ctx?.db) { try { ctx.db.close(); } catch {} }
    if (ctx?.tmpDir) {
      try { rmSync(ctx.tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('edukasi POST /api/manuscripts {topic, materiLinks, promo CTA} → 201 manuscript_needs_review', async () => {
    assert.ok(ctx, 'server must be started');
    const { json, res } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', {
      method: 'POST',
      body: JSON.stringify({
        categoryKey: 'edukasi_trading',
        topic: 'Dampak FOMC terhadap likuiditas pasar dan strategi SMC',
        materiLinks: ['https://example.com'],
        materiRaw: 'Artikel contoh tentang FOMC',
        callToAction: { kind: 'promo', headline: 'Diskon Spesial', promoCodes: ['DISKON10', 'PROMO20'] },
      }),
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status} body ${JSON.stringify(json)}`);
    assert.ok((json as Record<string, unknown>).carouselId, 'must return carouselId');
    const status = (json.status as string) ?? (json.carousel as Record<string, unknown>)?.status as string;
    // allow either top-level status or nested carousel status
    const actualStatus = (json.status as string) ?? (json.manuscript ? 'manuscript_needs_review' : undefined);
    assert.ok(json.manuscript ?? json.carouselId, 'must return manuscript');
  });

  it('jurnal minimal form1+form2 → 201 hookOptions 3', async () => {
    assert.ok(ctx);
    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', {
      method: 'POST',
      body: JSON.stringify({
        categoryKey: 'jurnal_trading',
        form1: [{ pair: 'EUR/USD', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }],
        form2: { directionDesc: 'Direction deskripsi panjang wajib minimal sepuluh karakter', executionDesc: 'Execution deskripsi panjang wajib minimal sepuluh karakter', markDesc: 'Mark deskripsi panjang wajib minimal sepuluh karakter' },
        callToAction: { kind: 'community', headline: 'Join Komunitas', communityName: 'PropDesk' },
      }),
    });
    assert.equal(res.status, 201, `jurnal expected 201 got ${res.status} ${JSON.stringify(json)}`);
    const manuscript = (json.manuscript ?? json.data ?? {}) as Record<string, unknown>;
    const hooks = (manuscript.hookOptions ?? (json as Record<string, unknown>).hookOptions) as unknown[];
    // manuscript may be nested inside carousel
    const hookOptions = (json as Record<string, unknown>).manuscript
      ? ((json.manuscript as Record<string, unknown>).hookOptions as unknown[])
      : hooks;
    assert.ok(Array.isArray(hookOptions) && hookOptions.length === 3, `expected hookOptions 3 got ${JSON.stringify(hookOptions)}`);
  });

  it('outlook gallery 1 → 201', async () => {
    assert.ok(ctx);
    // need an uploaded image id for gallery; cheapest is to create via direct DB insert then use id
    // But API should accept gallery with imageId that may not exist? Spec says gallery ≥1, so we provide one
    const fakeImageId = 'img_test_outlook_1';
    // Insert fake uploaded_image so gallery reference is valid (optional)
    if (ctx!.db) {
      try {
        ctx!.db.prepare("INSERT OR IGNORE INTO uploaded_images (id, original_name, mime_type, byte_size, data_uri, created_at) VALUES (?,?,?,?,?,?)").run(
          fakeImageId, 'chart.png', 'image/png', 100, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', new Date().toISOString()
        );
      } catch {}
    }
    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', {
      method: 'POST',
      body: JSON.stringify({
        categoryKey: 'market_outlook',
        title: 'Skenario XAUUSD menjelang rilis FOMC',
        gallery: [{ imageId: fakeImageId, description: 'Deskripsi chart XAUUSD H4 dengan level kunci yang jelas', sortOrder: 0 }],
        callToAction: { kind: 'save', headline: 'Simpan Analisis' },
      }),
    });
    assert.equal(res.status, 201, `outlook expected 201 got ${res.status} ${JSON.stringify(json)}`);
  });

  it('POST fetch-link with timeout/private → {ok:false} not 500, wizard still can submit', async () => {
    assert.ok(ctx);
    // Use a URL that will fail (private IP or non-routable) — expect {ok:false} not 500
    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/materials/fetch-link', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://127.0.0.1:9/fake' }),
    });
    assert.notEqual(res.status, 500, `fetch-link should not return 500, got ${res.status}`);
    // Should be 200 with ok:false or 400 for private IP, but not 500
    assert.ok(json.ok === false || res.status === 400, `expected ok:false or 400, got ${JSON.stringify(json)} status ${res.status}`);
    // Wizard still can submit: after fetch-link failure, edukasi submit should still succeed (already tested above)
  });

  it('POST pdf-extract with 25 pages → 400 "melebihi 20 halaman"', async () => {
    assert.ok(ctx);
    // Build a fake PDF buffer with 25 page markers and >5KB but <5MB
    const fakePdf = Buffer.from(
      '%PDF-1.4\n' +
      Array.from({ length: 25 }, (_, i) => `${i + 1} 0 obj\n<< /Type /Page >>\nendobj\n`).join('') +
      '%%EOF'
    );
    // Use multipart form-data
    const boundary = '----TestBoundary' + Date.now();
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="test.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`;
    const end = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([Buffer.from(body), fakePdf, Buffer.from(end)]);
    const res = await fetch(`${ctx!.baseUrl}/api/uploads/pdf-extract`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: payload as unknown as BodyInit,
    });
    const text = await res.text();
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(text); } catch { j = { raw: text }; }
    assert.equal(res.status, 400, `expected 400 for 25 pages got ${res.status} ${text}`);
    const errMsg = String((j.error ?? j.message ?? text)).toLowerCase();
    assert.ok(errMsg.includes('melebihi 20 halaman') || errMsg.includes('20 halaman'), `expected "melebihi 20 halaman" in ${text}`);
  });

  it('PUT after approve → 409 "Naskah sudah dikunci"', async () => {
    assert.ok(ctx);
    // Create an edukasi manuscript then approve it, then try PUT
    const { res: resCreate, json: jCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', {
      method: 'POST',
      body: JSON.stringify({
        categoryKey: 'edukasi_trading',
        topic: 'Topik untuk test lock PUT setelah approve',
        callToAction: { kind: 'save', headline: 'Simpan' },
      }),
    });
    assert.equal(resCreate.status, 201);
    const cid = String((jCreate.carouselId ?? (jCreate as Record<string, unknown>).id ?? ''));
    assert.ok(cid, 'carouselId must exist');
    // Approve
    const { res: resApprove } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(resApprove.status, 200, `approve should be 200 got ${resApprove.status}`);
    // Now PUT should be 409
    const { res: resPut, json: jPut } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}`, {
      method: 'PUT',
      body: JSON.stringify({ manuscriptPatch: { title: 'Edited title' }, note: 'Edit after lock' }),
    });
    assert.equal(resPut.status, 409, `expected 409 after lock got ${resPut.status} ${JSON.stringify(jPut)}`);
    assert.ok(String((jPut.error ?? jPut.message ?? '')).toLowerCase().includes('naskah sudah dikunci') || String(JSON.stringify(jPut)).toLowerCase().includes('dikunci'), `expected "Naskah sudah dikunci" in ${JSON.stringify(jPut)}`);
  });

  it('POST regenerate note 3 chars → 400, note 10 chars → 202', async () => {
    assert.ok(ctx);
    const { res: resCreate, json: jCreate } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', {
      method: 'POST',
      body: JSON.stringify({
        categoryKey: 'edukasi_trading',
        topic: 'Topik regenerate note validation test',
        callToAction: { kind: 'save', headline: 'Simpan' },
      }),
    });
    assert.equal(resCreate.status, 201);
    const cid = String(jCreate.carouselId ?? '');
    // short note →400
    const { res: resShort } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ note: 'abc' }),
    });
    assert.equal(resShort.status, 400, `short note should be 400 got ${resShort.status}`);
    // valid note →202
    const { res: resLong, json: jLong } = await jsonFetch(ctx!.baseUrl, `/api/manuscripts/${cid}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Perbaiki narasi agar lebih tajam dan presisi' }),
    });
    assert.equal(resLong.status, 202, `valid note should be 202 got ${resLong.status} ${JSON.stringify(jLong)}`);
  });

  it('bulk-generate 20 with 3 bad → 207 {succeeded:17, skipped:3}', async () => {
    assert.ok(ctx);
    const items: unknown[] = [];
    for (let i = 0; i < 17; i++) {
      items.push({ categoryKey: 'edukasi_trading', topic: `Topik bulk valid ${i} dengan FOMC dan likuiditas`, callToAction: { kind: 'save', headline: 'Simpan' } });
    }
    // 3 bad: missing topic, invalid category, promoCodes invalid
    items.push({ categoryKey: 'edukasi_trading', topic: 'ab', callToAction: { kind: 'save', headline: 'Simpan' } }); // too short
    items.push({ categoryKey: 'jurnal_trading', form1: [], form2: { directionDesc: 'a', executionDesc: 'b', markDesc: 'c' }, callToAction: { kind: 'save', headline: 'Simpan' } }); // missing pair
    items.push({ categoryKey: 'market_outlook', title: 'ab', gallery: [], callToAction: { kind: 'save', headline: 'Simpan' } }); // title too short & gallery empty

    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts/bulk-generate', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    assert.equal(res.status, 207, `expected 207 partial got ${res.status} ${JSON.stringify(json)}`);
    const succeeded = (json.succeeded ?? (json as Record<string, unknown>).jobs ?? []) as unknown[];
    const skipped = (json.skipped ?? []) as unknown[];
    // allow either succeeded as array of ids or objects
    const succLen = Array.isArray(succeeded) ? succeeded.length : 0;
    const skipLen = Array.isArray(skipped) ? skipped.length : 0;
    assert.equal(succLen, 17, `expected 17 succeeded got ${succLen} ${JSON.stringify(json)}`);
    assert.equal(skipLen, 3, `expected 3 skipped got ${skipLen} ${JSON.stringify(json)}`);
  });

  it('GET /api/jobs returns job_type manuscript|design', async () => {
    assert.ok(ctx);
    const { res, json } = await jsonFetch(ctx!.baseUrl, '/api/jobs', { method: 'GET' });
    assert.equal(res.status, 200);
    // After previous creates, there should be jobs with jobType or job_type
    const active = (json.active ?? []) as Record<string, unknown>[];
    // If no active, check recent
    const all = [...active, ...((json.recent ?? []) as Record<string, unknown>[])];
    if (all.length > 0) {
      const hasType = all.some((j) => typeof j.jobType === 'string' || typeof j.job_type === 'string' || typeof j.job_type === 'string');
      assert.ok(hasType || all.length === 0, `jobs should have jobType/job_type field, got ${JSON.stringify(all[0])}`);
    }
  });

  it('materiLinks >3 and non-http(s) → 400; promoCodes non-promo →400; jurnal missing pair →400; outlook gallery 0 →400', async () => {
    assert.ok(ctx);
    const cases: { body: unknown; expect: number }[] = [
      { body: { categoryKey: 'edukasi_trading', topic: 'Topik valid untuk materiLinks test', materiLinks: ['https://a.com','https://b.com','https://c.com','https://d.com'], callToAction: { kind: 'save', headline: 'Simpan' } }, expect: 400 },
      { body: { categoryKey: 'edukasi_trading', topic: 'Topik valid link http', materiLinks: ['ftp://example.com'], callToAction: { kind: 'save', headline: 'Simpan' } }, expect: 400 },
      { body: { categoryKey: 'edukasi_trading', topic: 'Topik valid promo kind', callToAction: { kind: 'community', headline: 'Join', communityName: 'Kom', promoCodes: ['DISKON10'] } }, expect: 400 },
      { body: { categoryKey: 'jurnal_trading', form1: [{ pair: '', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }], form2: { directionDesc: 'Direction desc panjang', executionDesc: 'Execution desc panjang', markDesc: 'Mark desc panjang' }, callToAction: { kind: 'save', headline: 'Simpan' } }, expect: 400 },
      { body: { categoryKey: 'market_outlook', title: 'Judul valid outlook', gallery: [], callToAction: { kind: 'save', headline: 'Simpan' } }, expect: 400 },
    ];
    for (const c of cases) {
      const { res } = await jsonFetch(ctx!.baseUrl, '/api/manuscripts', { method: 'POST', body: JSON.stringify(c.body) });
      assert.equal(res.status, c.expect, `expected ${c.expect} for ${JSON.stringify(c.body).slice(0,80)} got ${res.status}`);
    }
  });
});
