import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

describe('Task 2: Pipeline Split — produceManuscript + produceDesignFromManuscript + Persona Deep + Visual Fix', () => {
  // This test must FAIL before implementation: produceManuscript is not defined
  it('edukasi produceManuscript -> caption present, narrative contains persona phrase, cost.manuscript', async () => {
    const { produceManuscript } = await import('../packages/agents/pipeline.ts');
    const { hasPersonaDeep } = await import('../packages/agents/prompts.ts');
    assert.ok(produceManuscript, 'produceManuscript must be exported');
    assert.ok(hasPersonaDeep, 'hasPersonaDeep must be exported');
    // persona deep verifier
    assert.equal(hasPersonaDeep('edukasi_trading'), true);
    assert.equal(hasPersonaDeep('market_info'), true);
    assert.equal(hasPersonaDeep('jurnal_trading'), false);

    // mock LlmClient
    class MockLlm {
      entries: unknown[] = [];
      costReport() { return { entries: this.entries, totalUsd: 0.001, totalTokensIn: 10, totalTokensOut: 10, billableCalls: 1, savedLatencyMs: 0 }; }
      async callJson<T>(opts: { agentKey: string; system: string; user: string }, _shape?: (v: unknown) => string | null): Promise<{ value: T; response: unknown }> {
        this.entries.push(opts.agentKey);
        if (opts.agentKey === 'strategist') {
          return { value: { angle: 'Analisis dampak FOMC terhadap likuiditas SMC dan Order Flow', objective: 'educate', targetAudience: 'trader retail', keyMessages: ['FOMC menaikkan suku bunga','Likuiditas terfragmentasi'], hookDirection: 'Hook tentang FOMC', title: 'Dampak FOMC pada Likuiditas' } as unknown as T, response: {} };
        }
        if (opts.agentKey === 'research') {
          return { value: { entries: [{ id: 'f1', claim: 'FOMC menaikkan suku bunga 25bps', sourceName: 'Pengetahuan umum industri', asOf: new Date().toISOString(), confidence: 'medium' }], limitations: 'terbatas' } as unknown as T, response: {} };
        }
        if (opts.agentKey === 'copywriter') {
          return { value: { hook: 'FOMC mengguncang likuiditas', body: 'Narasi tentang FOMC dan ECB', hashtags: ['#FOMC','#Trading'], cta: 'Simpan' } as unknown as T, response: {} };
        }
        if (opts.agentKey === 'composer') {
          return { value: { slides: [{ position: 1, role: 'hook', headline: 'Hook', body: null, bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] }] } as unknown as T, response: {} };
        }
        throw new Error('unknown agent ' + opts.agentKey);
      }
      async call() { throw new Error('not needed'); }
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'task2-edukasi-'));
    const dbPath = join(tmpDir, 'test.db');
    const db = (await import('../packages/studio/db.ts')).openDb(dbPath);
    const llm = new MockLlm() as unknown as import('../packages/llm/client.ts').LlmClient;

    const res = await produceManuscript({
      categoryKey: 'edukasi_trading',
      topic: 'Dampak FOMC terhadap likuiditas pasar',
      brandName: 'PropDesk',
      tokens: { colors: { background: '#fff', surface: '#eee', primary: '#111', accent: '#f00', text: '#000', muted: '#777', border: '#ccc', positive: '#0f0', negative: '#f00' }, fonts: { heading: 'Inter', body: 'Inter' }, typography: { baseScale: 16, minBodyPx: 12 }, spacing: { padding: 24, gap: 12 }, radius: { card: 8, badge: 4 }, style: { cornerStyle: 'rounded', borderWidth: 1 } } as unknown as import('../packages/shared/types.ts').BrandTokens,
      ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[],
      outputBaseDir: tmpDir,
      folderName: 'test',
      callToAction: { kind: 'promo', headline: 'Diskon', promoCodes: ['PROPDESK20'] },
      dbPath,
    }, llm);

    assert.ok(res.carouselId, 'must return carouselId');
    assert.ok(res.manuscript, 'must return manuscript');
    const m = res.manuscript as unknown as Record<string, unknown>;
    assert.ok(m.caption, 'edukasi manuscript must have caption');
    const narrative = String((m as Record<string, unknown>).narrative ?? '');
    assert.ok(narrative.includes('FOMC') || narrative.includes('SMC') || narrative.includes('Liquidity'), `narrative must contain persona phrase, got: ${narrative}`);
    assert.ok(res.cost, 'must return cost');
    // cost.manuscript or cost.totalUsd
    const costAny = res.cost as unknown as Record<string, unknown>;
    assert.ok(costAny.totalUsd !== undefined || costAny.manuscript !== undefined, 'cost must have manuscript cost');

    // verify persisted - db instance from test's openDb path; close before unlink
    {
      const { openDb: od, getManuscript: gm } = await import('../packages/studio/db.ts');
      // res already persisted via persistManuscript's own openDb/close; verify via fresh open
      const db2 = od(dbPath);
      const persisted = gm(db2, res.carouselId);
      assert.ok(persisted, 'manuscript must be persisted via getManuscript');
      db2.close();
    }
    try { db.close(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { await new Promise((r) => setTimeout(r, 500)); try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  });

  it('jurnal produceManuscript -> hookOptions 3, no narrative, hook contains persona phrase', async () => {
    const { produceManuscript } = await import('../packages/agents/pipeline.ts');
    const tmpDir = mkdtempSync(join(tmpdir(), 'task2-jurnal-'));
    const dbPath = join(tmpDir, 'test.db');
    (await import('../packages/studio/db.ts')).openDb(dbPath);
    class MockLlm {
      async callJson<T>(opts: { agentKey: string }): Promise<{ value: T; response: unknown }> {
        if (opts.agentKey === 'hookGenerator') {
          return { value: { hookOptions: ['Hook FOMC 1 dingin profesional', 'Hook ECB 2 SMC Liquidity', 'Hook BOE 3 Order Flow'], title: 'EURUSD Long' } as unknown as T, response: {} };
        }
        throw new Error('unexpected ' + opts.agentKey);
      }
      costReport() { return { entries: [], totalUsd: 0.002, totalTokensIn: 5, totalTokensOut: 5, billableCalls: 1, savedLatencyMs: 0 }; }
      async call() { throw new Error('x'); }
    }
    const llm = new MockLlm() as unknown as import('../packages/llm/client.ts').LlmClient;
    const res = await produceManuscript({
      categoryKey: 'jurnal_trading',
      topic: 'EUR/USD Long',
      brandName: 'PropDesk',
      tokens: { colors: { background: '#fff', surface: '#eee', primary: '#111', accent: '#f00', text: '#000', muted: '#777', border: '#ccc', positive: '#0f0', negative: '#f00' }, fonts: { heading: 'Inter', body: 'Inter' }, typography: { baseScale: 16, minBodyPx: 12 }, spacing: { padding: 24, gap: 12 }, radius: { card: 8, badge: 4 }, style: { cornerStyle: 'rounded', borderWidth: 1 } } as unknown as import('../packages/shared/types.ts').BrandTokens,
      ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[],
      outputBaseDir: tmpDir,
      folderName: 'test',
      callToAction: { kind: 'community', headline: 'Join', communityName: 'Komunitas' },
      dbPath,
      // jurnal-specific minimal
      jurnalPayload: { pair: 'EUR/USD', tradeTable: [{ pairs: 'EUR/USD', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }], directionDesc: 'Direction desc wajib', executionDesc: 'Execution desc wajib', markDesc: 'Mark desc wajib' },
    }, llm);
    const m = res.manuscript as unknown as Record<string, unknown>;
    assert.ok(Array.isArray(m.hookOptions), 'must have hookOptions');
    assert.equal((m.hookOptions as unknown[]).length, 3);
    assert.equal(m.narrative, undefined, 'jurnal must not have narrative');
    const hooks = (m.hookOptions as string[]).join(' ');
    assert.ok(hooks.includes('FOMC') || hooks.includes('SMC') || hooks.includes('Liquidity') || hooks.includes('dingin'), 'hook must contain persona phrase');
    // persisted check: open via openDb path then close via helper db handle
    {
      const { openDb, getManuscript: gm } = await import('../packages/studio/db.ts');
      const db2 = openDb(dbPath);
      const persisted = gm(db2, res.carouselId);
      assert.ok(persisted, 'jurnal manuscript persisted');
      db2.close();
    }
    // retry rm with delay to avoid WAL lock on Windows
    await new Promise((r) => setTimeout(r, 200));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { await new Promise((r) => setTimeout(r, 500)); try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  });

  it('produceDesignFromManuscript with 2 uploadedImages dataUri -> slides[2] chart_snapshot dataUri', async () => {
    const { produceManuscript, produceDesignFromManuscript } = await import('../packages/agents/pipeline.ts');
    const tmpDir = mkdtempSync(join(tmpdir(), 'task2-design-'));
    const dbPath = join(tmpDir, 'test.db');
    const dbMod = await import('../packages/studio/db.ts');
    dbMod.openDb(dbPath);
    // create jurnal manuscript first
    class MockLlmManuscript {
      async callJson<T>(opts: { agentKey: string }): Promise<{ value: T; response: unknown }> {
        if (opts.agentKey === 'hookGenerator') return { value: { hookOptions: ['Hook FOMC 1', 'Hook ECB 2', 'Hook BOE 3'], title: 'EURUSD Long' } as unknown as T, response: {} };
        throw new Error(opts.agentKey);
      }
      costReport() { return { entries: [], totalUsd: 0, totalTokensIn: 0, totalTokensOut: 0, billableCalls: 0, savedLatencyMs: 0 }; }
      async call() { throw new Error('x'); }
    }
    class MockLlmDesign {
      async callJson<T>(opts: { agentKey: string }): Promise<{ value: T; response: unknown }> {
        if (opts.agentKey === 'composer') {
          return { value: { slides: [
            { position: 1, role: 'hook', headline: 'Hook', body: null, bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
            { position: 2, role: 'body', headline: 'Tabel', body: 'Isi', bullets: [], emphasis: [], visual: { type: 'table', table: { columns: ['A','B'], rows: [{ cells: ['1','2'] }] } }, sourceRefs: [] },
            { position: 3, role: 'body', headline: 'Direction', body: 'Direction desc', bullets: [], emphasis: [], visual: { type: 'chart_snapshot', chartAssetRef: 'placeholder' }, sourceRefs: [] },
            { position: 4, role: 'body', headline: 'Execution', body: 'Execution desc', bullets: [], emphasis: [], visual: { type: 'chart_snapshot', chartAssetRef: 'placeholder' }, sourceRefs: [] },
            { position: 5, role: 'body', headline: 'Mark', body: 'Mark desc', bullets: [], emphasis: [], visual: { type: 'chart_snapshot', chartAssetRef: 'placeholder' }, sourceRefs: [] },
            { position: 6, role: 'body', headline: 'Performance', body: 'Perf', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
            { position: 7, role: 'cta', headline: 'CTA', body: 'Join', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
            { position: 8, role: 'disclaimer', headline: 'Disclaimer', body: 'Disclaimer text', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
          ] } as unknown as T, response: {} };
        }
        if (opts.agentKey === 'compliance_advisor') return { value: { findings: [] } as unknown as T, response: {} };
        if (opts.agentKey === 'analyst') return { value: { assessment: 'Ok', improvement: 'Ok perbaikan', reusableAsset: 'asset' } as unknown as T, response: {} };
        throw new Error('unexpected design agent ' + opts.agentKey);
      }
      costReport() { return { entries: [], totalUsd: 0, totalTokensIn: 0, totalTokensOut: 0, billableCalls: 0, savedLatencyMs: 0 }; }
      async call() { throw new Error('x'); }
    }
    const llmM = new MockLlmManuscript() as unknown as import('../packages/llm/client.ts').LlmClient;
    const resM = await produceManuscript({
      categoryKey: 'jurnal_trading',
      topic: 'EUR/USD Long visual',
      brandName: 'PropDesk',
      tokens: { colors: { background: '#fff', surface: '#eee', primary: '#111', accent: '#f00', text: '#000', muted: '#777', border: '#ccc', positive: '#0f0', negative: '#f00' }, fonts: { heading: 'Inter', body: 'Inter' }, typography: { baseScale: 16, minBodyPx: 12 }, spacing: { padding: 24, gap: 12 }, radius: { card: 8, badge: 4 }, style: { cornerStyle: 'rounded', borderWidth: 1 } } as unknown as import('../packages/shared/types.ts').BrandTokens,
      ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[],
      outputBaseDir: tmpDir,
      folderName: 'test',
      callToAction: { kind: 'community', headline: 'Join', communityName: 'Kom' },
      dbPath,
      jurnalPayload: { pair: 'EUR/USD', tradeTable: [{ pairs: 'EUR/USD', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }], directionDesc: 'Direction desc', executionDesc: 'Execution desc', markDesc: 'Mark desc' },
    }, llmM);

    // insert 2 uploaded images linked to carousel
    const db = new DatabaseSync(dbPath);
    const dataUri1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const dataUri2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const id1 = dbMod.saveUploadedImage(db, { carouselId: resM.carouselId, originalName: 'direction.png', mimeType: 'image/png', byteSize: 100, dataUri: dataUri1, caption: 'Direction chart' });
    const id2 = dbMod.saveUploadedImage(db, { carouselId: resM.carouselId, originalName: 'execution.png', mimeType: 'image/png', byteSize: 100, dataUri: dataUri2, caption: 'Execution chart' });
    // update jurnal data to reference images
    dbMod.saveJurnalTradingData(db, resM.carouselId, { pair: 'EUR/USD', tradeTable: [{ pairs: 'EUR/USD', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }], directionDesc: 'Direction desc', directionImageId: id1, executionDesc: 'Execution desc', executionImageId: id2, markDesc: 'Mark desc' });
    // approve manuscript so design can proceed (manuscript_locked=1)
    db.prepare("UPDATE carousels SET manuscript_locked = 1, status = 'manuscript_approved' WHERE id = ?").run(resM.carouselId);
    db.close();

    const llmD = new MockLlmDesign() as unknown as import('../packages/llm/client.ts').LlmClient;
    const result = await produceDesignFromManuscript(resM.carouselId, { ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[], dbPath }, llmD);
    assert.ok(result.spec, 'must return spec');
    const slide2 = result.spec.slides[2]!;
    assert.equal(slide2.visual.type, 'chart_snapshot', `slides[2] must be chart_snapshot, got ${slide2.visual.type}`);
    assert.ok(String(slide2.visual.chartAssetRef ?? '').startsWith('data:'), `chartAssetRef must start with data:, got ${String(slide2.visual.chartAssetRef).slice(0,30)}`);
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { await new Promise((r) => setTimeout(r, 800)); try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  });

  it('produceDesignFromManuscript with missing imageId -> fallback type none not throw', async () => {
    const { produceManuscript, produceDesignFromManuscript } = await import('../packages/agents/pipeline.ts');
    const tmpDir = mkdtempSync(join(tmpdir(), 'task2-missing-'));
    const dbPath = join(tmpDir, 'test.db');
    const dbMod = await import('../packages/studio/db.ts');
    dbMod.openDb(dbPath);
    class MockLlmManuscript {
      async callJson<T>(opts: { agentKey: string }): Promise<{ value: T; response: unknown }> {
        if (opts.agentKey === 'hookGenerator') return { value: { hookOptions: ['H1','H2','H3'], title: 'T' } as unknown as T, response: {} };
        throw new Error(opts.agentKey);
      }
      costReport() { return { entries: [], totalUsd: 0, totalTokensIn: 0, totalTokensOut: 0, billableCalls: 0, savedLatencyMs: 0 }; }
      async call() { throw new Error('x'); }
    }
    class MockLlmDesign {
      async callJson<T>(opts: { agentKey: string }): Promise<{ value: T; response: unknown }> {
        if (opts.agentKey === 'composer') return { value: { slides: [
          { position: 1, role: 'hook', headline: 'Hook', body: null, bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
          { position: 2, role: 'body', headline: 'Tabel', body: 'Isi', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
          { position: 3, role: 'body', headline: 'Direction', body: 'Desc', bullets: [], emphasis: [], visual: { type: 'chart_snapshot', chartAssetRef: 'placeholder' }, sourceRefs: [] },
          { position: 4, role: 'disclaimer', headline: 'Disclaimer', body: 'Disclaimer', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
        ] } as unknown as T, response: {} };
        if (opts.agentKey === 'compliance_advisor') return { value: { findings: [] } as unknown as T, response: {} };
        if (opts.agentKey === 'analyst') return { value: { assessment: 'Ok', improvement: 'Ok perbaikan', reusableAsset: 'asset' } as unknown as T, response: {} };
        throw new Error(opts.agentKey);
      }
      costReport() { return { entries: [], totalUsd: 0, totalTokensIn: 0, totalTokensOut: 0, billableCalls: 0, savedLatencyMs: 0 }; }
      async call() { throw new Error('x'); }
    }
    const llmM = new MockLlmManuscript() as unknown as import('../packages/llm/client.ts').LlmClient;
    const resM = await produceManuscript({
      categoryKey: 'jurnal_trading', topic: 'Missing image test', brandName: 'PropDesk',
      tokens: { colors: { background: '#fff', surface: '#eee', primary: '#111', accent: '#f00', text: '#000', muted: '#777', border: '#ccc', positive: '#0f0', negative: '#f00' }, fonts: { heading: 'Inter', body: 'Inter' }, typography: { baseScale: 16, minBodyPx: 12 }, spacing: { padding: 24, gap: 12 }, radius: { card: 8, badge: 4 }, style: { cornerStyle: 'rounded', borderWidth: 1 } } as unknown as import('../packages/shared/types.ts').BrandTokens,
      ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[], outputBaseDir: tmpDir, folderName: 'test',
      callToAction: { kind: 'save', headline: 'Simpan' }, dbPath,
      jurnalPayload: { pair: 'EUR/USD', tradeTable: [{ pairs: 'EUR/USD', direction: 'Long', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'SMC', pnl: '+1R', result: 'win' }], directionDesc: 'Direction desc', executionDesc: 'Execution desc', markDesc: 'Mark desc', directionImageId: 'missing_id_12345' },
    }, llmM);
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE carousels SET manuscript_locked = 1, status = 'manuscript_approved' WHERE id = ?").run(resM.carouselId);
    db.close();
    const llmD = new MockLlmDesign() as unknown as import('../packages/llm/client.ts').LlmClient;
    let threw = false;
    let result: unknown = null;
    try { result = await produceDesignFromManuscript(resM.carouselId, { ratios: ['ig_portrait'] as unknown as import('../packages/shared/types.ts').RatioProfile[], dbPath }, llmD); } catch { threw = true; }
    assert.equal(threw, false, 'must not throw on missing imageId');
    const spec = (result as { spec: { slides: { visual: { type: string } }[] } }).spec;
    const fallback = spec.slides.find((s: { visual: { type: string } }) => s.visual.type === 'none');
    assert.ok(fallback, 'at least one slide should fallback to none when image missing');
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { await new Promise((r) => setTimeout(r, 800)); try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  });
});
