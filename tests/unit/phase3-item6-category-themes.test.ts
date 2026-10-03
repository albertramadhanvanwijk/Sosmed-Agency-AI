import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORY_THEMES, getCategoryTheme } from '../../packages/shared/category-themes.ts';

describe('Item 6: Category Theme Visual Differentiation', () => {
  test('each category has distinct borderStyle, icon, pattern', () => {
    const expected = {
      edukasi_trading: { borderStyle: 'solid', icon: '📚', pattern: 'grid' },
      edukasi_propfirm: { borderStyle: 'dashed', icon: '🏢', pattern: 'diagonal' },
      jurnal_trading: { borderStyle: 'double', icon: '📊', pattern: 'dots' },
      market_info: { borderStyle: 'dotted', icon: '📰', pattern: 'waves' },
      market_outlook: { borderStyle: 'gradient', icon: '🎯', pattern: 'arrows' },
    } as const;
    for (const [key, exp] of Object.entries(expected)) {
      const t = (CATEGORY_THEMES as Record<string, unknown>)[key] as Record<string, string>;
      assert.ok(t, `theme ${key} must exist`);
      assert.strictEqual(t.borderStyle, exp.borderStyle, `${key} borderStyle`);
      assert.strictEqual(t.icon, exp.icon, `${key} icon`);
      assert.strictEqual(t.pattern, exp.pattern, `${key} pattern`);
    }
  });

  test('getCategoryTheme still returns fallback for unknown key', () => {
    const t = getCategoryTheme(null);
    assert.strictEqual(t.primary, '#3B82F6');
  });

  test('CSS variables include cat pattern and border', async () => {
    const { STUDIO_CSS } = await import('../../packages/studio/ui-css.ts');
    assert.match(STUDIO_CSS, /cat-pattern|cat-border|borderStyle|pattern/i, 'CSS should reference pattern/border theming');
  });
});
