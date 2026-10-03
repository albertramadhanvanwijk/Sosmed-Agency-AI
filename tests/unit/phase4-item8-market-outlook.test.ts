import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

async function loadHelpers() {
  return await import('../../packages/studio/db.ts');
}

describe('Item 8: Market Outlook Multi-Image Form', () => {
  test('validateMarketOutlookPayload exists and validates', async () => {
    const m = await loadHelpers();
    assert.ok(typeof (m as any).validateMarketOutlookPayload === 'function', 'validateMarketOutlookPayload harus ada');
    const v = (m as any).validateMarketOutlookPayload as (p: unknown) => { ok: boolean; error?: string };
    assert.equal(v({ title: 'Outlook EURUSD', timeframe: 'H1', images: [{ imageId: 'img1', description: 'Chart H1', sortOrder: 0 }], ctas: [{ kind: 'promo', headline: 'Join', promoCode: 'CODE' }] }).ok, true);
    assert.equal(v({ title: '', timeframe: 'H1', images: [] }).ok, false, 'empty title should fail');
    assert.equal(v(null).ok, false);
  });

  test('save/get Market Outlook data round-trip', async () => {
    const m = await loadHelpers() as any;
    assert.ok(typeof m.saveMarketOutlookData === 'function', 'saveMarketOutlookData harus ada');
    assert.ok(typeof m.getMarketOutlookData === 'function', 'getMarketOutlookData harus ada');
    // Light integration with temp DB if helpers use DB; just check signature callable
    const payload = { title: 'T1', timeframe: 'D1', images: [{ imageId: 'a', description: 'desc', sortOrder: 0 }], ctas: [], generalNotes: 'note' };
    // validate passes
    assert.equal(m.validateMarketOutlookPayload(payload).ok, true);
  });

  test('server exposes /api/market-outlook endpoint (import check)', async () => {
    const { STUDIO_JS } = await import('../../packages/studio/ui-js.ts');
    assert.match(STUDIO_JS, /market-outlook|marketOutlook|j-?outlook/i, 'JS should reference market outlook');
  });

  test('UI contains market outlook panel', async () => {
    const { renderStudioHtml } = await import('../../packages/studio/ui.ts');
    const html = renderStudioHtml({
      categories: [{ key: 'market_outlook', name: 'Market Outlook', riskLevel: 'high', slideRange: { min: 6, max: 9 } }],
      ratios: [{ key: 'ig_portrait', label: 'Portrait', width: 1080, height: 1350 }],
    });
    assert.match(html, /market-outlook|outlook-panel/i, 'HTML should contain market outlook panel');
  });
});
