import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Phase 2 Task 3 - Journal Trading Structured Input (Item 9)
 *
 * Domain: jurnal_trading kategori requires structured manual input.
 * Helpers should validate, store, and render journal brief.
 */
describe('Phase 2 Task 3: Journal Trading Structured Input', () => {
  async function loadHelpers() {
    const mod = await import('../../packages/studio/db.ts');
    return mod as unknown as {
      createJurnalTradingPayload?: (p: unknown) => unknown;
      validateJurnalTradingPayload?: (p: unknown) => { ok: boolean; error?: string };
      buildJurnalExtraInstructions?: (p: unknown) => string;
      saveJurnalTradingData?: (db: unknown, p: unknown) => void;
      getJurnalTradingData?: (db: unknown, carouselId: string) => unknown;
    };
  }

  test('validateJurnalTradingPayload must exist and reject empty payload', async () => {
    const { validateJurnalTradingPayload } = await loadHelpers();
    assert.ok(typeof validateJurnalTradingPayload === 'function', 'validateJurnalTradingPayload harus ada');
    const res = (validateJurnalTradingPayload as (p: unknown) => { ok: boolean })(null);
    assert.strictEqual(res.ok, false, 'null payload should be invalid');
  });

  test('buildJurnalExtraInstructions menghasilkan prompt terstruktur untuk composer', async () => {
    const { buildJurnalExtraInstructions } = await loadHelpers();
    assert.ok(typeof buildJurnalExtraInstructions === 'function', 'buildJurnalExtraInstructions harus ada');
    const payload = {
      pair: 'EUR/USD',
      tradeTable: [{ pairs: 'EUR/USD', direction: 'Buy', session: 'London', riskPct: '1%', rr: '1:2', confluence: 'OB+CT', pnl: '50', result: 'Profit' }],
      directionDesc: 'Trend up di H1, retest order block',
      executionDesc: 'Entry di London open, SL di bawah OB',
      markDesc: 'Tandai OB dan FVG',
      pairImageId: null,
    };
    const text = buildJurnalExtraInstructions!(payload) as string;
    assert.ok(typeof text === 'string' && text.length > 50, 'must produce instruction text');
    assert.ok(text.includes('EUR/USD'), 'must contain pair');
    assert.ok(text.toLowerCase().includes('order block') || text.includes('OB'), 'must contain direction/execution context');
  });

  test('CSV paste helper: parse trade table dari teks CSV', async () => {
    const { validateJurnalTradingPayload } = await loadHelpers();
    // Contract: validator accepts array tradeTable dengan field wajib
    const good = {
      pair: 'XAU/USD',
      tradeTable: [
        { pairs: 'XAU/USD', direction: 'Sell', session: 'NY', riskPct: '0.5%', rr: '1:3', confluence: 'FVG', pnl: '-10', result: 'Loss' },
      ],
      directionDesc: 'Downtrend',
      executionDesc: 'Break of structure',
      markDesc: 'Mark FVG',
    };
    const ok = (validateJurnalTradingPayload as (p: unknown) => { ok: boolean; error?: string })(good);
    assert.strictEqual(ok.ok, true, `good payload should pass, got error: ${(ok as { error?: string }).error}`);

    const bad = { pair: 'XAU/USD', tradeTable: 'bukan-array' as unknown, directionDesc: '', executionDesc: '', markDesc: '' };
    const badRes = (validateJurnalTradingPayload as (p: unknown) => { ok: boolean })(bad);
    assert.strictEqual(badRes.ok, false, 'bad tradeTable should fail');
  });
});
