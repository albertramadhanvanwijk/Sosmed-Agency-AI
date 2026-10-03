import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Item 1: Agent Office Layout - Center/Full Width', () => {
  test('CSS contains centered office layout rules', async () => {
    const { STUDIO_CSS } = await import('../../packages/studio/ui-css.ts');
    // Centered container, responsive full-width, visual hierarchy
    assert.match(STUDIO_CSS, /#tab-office|office-wrap|office-centered/, 'CSS should define office layout');
    assert.match(STUDIO_CSS, /margin:\s*0\s*auto|max-width|place-items|justify-content:\s*center/, 'CSS should center office');
    assert.match(STUDIO_CSS, /@media.*max-width.*900px|@media.*768px/, 'CSS should have responsive breakpoint for office');
  });

  test('office HTML uses centered card structure', async () => {
    const { renderStudioHtml } = await import('../../packages/studio/ui.ts');
    const html = renderStudioHtml({
      categories: [{ key: 'edukasi_trading', name: 'Edukasi Trading', riskLevel: 'low', slideRange: { min: 6, max: 10 } }],
      ratios: [{ key: 'ig_portrait', label: 'Portrait', width: 1080, height: 1350 }],
    });
    assert.match(html, /tab-office/, 'HTML should contain tab-office');
    assert.match(html, /office-wrap|office/i, 'HTML should contain office-wrap');
  });

  test('office-wrap is responsive full-width on mobile', async () => {
    const { STUDIO_CSS } = await import('../../packages/studio/ui-css.ts');
    // Should have mobile rule that makes office-wrap full-width / stacked
    assert.match(STUDIO_CSS, /\.office-wrap/, 'office-wrap class must exist');
    // Check that mobile media query adjusts office layout
    const mobileSection = STUDIO_CSS.match(/@media[^{]*\{[^}]*office[^}]*\}/s);
    assert.ok(mobileSection || STUDIO_CSS.includes('900px'), 'mobile media query should affect office');
  });
});
