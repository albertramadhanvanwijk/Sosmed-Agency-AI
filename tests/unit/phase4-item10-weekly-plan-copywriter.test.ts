import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Item 10: Weekly Plan with Copywriter Output', () => {
  test('planner exports copywriter helpers and PlanSlot supports copyDraft', async () => {
    const m = await import('../../packages/planner/weekly.ts');
    const hasHelper = typeof (m as any).enrichPlanWithCopyDrafts === 'function' || typeof (m as any).buildWeeklyPlanWithCopy === 'function' || typeof (m as any).generateCopyDrafts === 'function';
    assert.ok(hasHelper, 'weekly.ts should export enrichPlanWithCopyDrafts/buildWeeklyPlanWithCopy/generateCopyDrafts');
    const { buildWeeklyPlan } = await import('../../packages/planner/weekly.ts');
    const plan = buildWeeklyPlan({ days: 2, news: [], history: [] });
    // slots should be enrichable with copyDraft
    const enriched = (m as any).enrichPlanWithCopyDrafts ? (m as any).enrichPlanWithCopyDrafts(plan) : plan;
    assert.ok(Array.isArray(enriched.slots), 'plan.slots must be array');
    // after enrichment at least one slot has copyDraft shape
    const first = enriched.slots[0];
    assert.ok(first.copyDraft && typeof first.copyDraft.hook === 'string' && typeof first.copyDraft.body === 'string', 'slot copyDraft must have hook/body');
    assert.ok(first.copyDraft.hashtags && Array.isArray(first.copyDraft.hashtags), 'copyDraft hashtags array');
  });

  test('shared/types PlanSlot allows copy draft and status', async () => {
    const src = await import('node:fs').then(async (fs) => fs.readFileSync('packages/shared/types.ts', 'utf8'));
    assert.match(src, /copyDraft/, 'types.ts PlanSlot should contain copyDraft');
    assert.match(src, /copyStatus/, 'types.ts PlanSlot should contain copyStatus');
  });

  test('UI plan rendering includes copy preview and Approve/Regenerate actions', async () => {
    const { STUDIO_JS } = await import('../../packages/studio/ui-js.ts');
    assert.match(STUDIO_JS, /copyDraft|copy.*preview/i, 'JS should reference copyDraft/preview');
    assert.match(STUDIO_JS, /Approve.*Copy|approveCopy|copyStatus/i, 'JS should have Approve Copy flow');
    assert.match(STUDIO_JS, /Regenerate|regenerateCopy/i, 'JS should have Regenerate Copy flow');
    assert.match(STUDIO_JS, /skip.*copywriter|skipCopywriter|prebuiltCaptions/i, 'JS should support skipping copywriter when copy approved');
  });

  test('renderStudioHtml contains plan copy section', async () => {
    const { renderStudioHtml } = await import('../../packages/studio/ui.ts');
    const html = renderStudioHtml({
      categories: [{ key: 'edukasi_trading', name: 'Edukasi Trading', riskLevel: 'low', slideRange: { min: 6, max: 10 } }],
      ratios: [{ key: 'ig_portrait', label: 'Portrait', width: 1080, height: 1350 }],
    });
    assert.match(html, /plan-out/, 'HTML should contain plan-out');
    // copy preview marker inside plan tab
    assert.match(html, /copy|copywriter|copy-preview/i, 'HTML should mention copy/copywriter in plan tab');
  });

  test('pipeline can skip copywriter when prebuilt captions provided', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('packages/agents/pipeline.ts', 'utf8'));
    assert.match(src, /prebuiltCaptions|skipCopywriter|skipCopy/i, 'pipeline.ts should support skipping copywriter');
  });
});
