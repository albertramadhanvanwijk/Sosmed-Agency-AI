import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Item 12: Slide Preview Zoom', () => {
  test('CSS contains zoom modal styles', async () => {
    const { STUDIO_CSS } = await import('../../packages/studio/ui-css.ts');
    assert.match(STUDIO_CSS, /slide-zoom|zoom-modal|image-zoom|modal.*image/i, 'CSS should contain zoom modal styles');
    assert.match(STUDIO_CSS, /zoom.*in|zoom-controls|pan|drag/i, 'CSS should reference zoom controls');
  });

  test('JS contains zoom functions and keyboard handlers', async () => {
    const { STUDIO_JS } = await import('../../packages/studio/ui-js.ts');
    assert.match(STUDIO_JS, /openSlideZoom|slideZoom|zoomLevel|zoomIn|zoomOut/i, 'JS should contain zoom functions');
    assert.match(STUDIO_JS, /keydown|Escape|ArrowLeft|ArrowRight/, 'JS should handle keyboard navigation');
  });

  test('HTML contains slide zoom modal markup', async () => {
    const { renderStudioHtml } = await import('../../packages/studio/ui.ts');
    const html = renderStudioHtml({
      categories: [{ key: 'edukasi_trading', name: 'Edukasi Trading', riskLevel: 'low', slideRange: { min: 6, max: 10 } }],
      ratios: [{ key: 'ig_portrait', label: 'Portrait', width: 1080, height: 1350 }],
    });
    assert.match(html, /slide-zoom|zoom-modal|drawer|backdrop/, 'HTML should contain modal container');
  });

  test('thumbnails are clickable for zoom', async () => {
    const { STUDIO_JS } = await import('../../packages/studio/ui-js.ts');
    assert.match(STUDIO_JS, /thumb.*onclick|openSlideZoom|click.*zoom/i, 'thumbnails should be clickable');
  });
});
