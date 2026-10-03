import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CATEGORIES } from '../../packages/shared/categories.ts';

describe('Item 11: Category Descriptions & Business Logic', () => {
  test('each category has description >= 50 chars and risk guidance', () => {
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      assert.ok(cat.description && cat.description.length >= 50, `${key} description too short`);
      assert.ok(['low','medium','high'].includes(cat.riskLevel), `${key} riskLevel`);
      assert.ok(cat.outline && cat.outline.length >= 5, `${key} outline must have >=5 slides`);
      assert.ok(cat.slideRange.min >= 5, `${key} slideRange.min`);
    }
  });

  test('category guide doc exists with per-category sections', () => {
    const p = 'docs/CATEGORY-GUIDE.md';
    assert.ok(existsSync(p), 'docs/CATEGORY-GUIDE.md must exist');
    const txt = readFileSync(p, 'utf8');
    for (const key of Object.keys(CATEGORIES)) {
      assert.match(txt, new RegExp(key, 'i'), `guide must mention ${key}`);
    }
    assert.match(txt, /Purpose|Tujuan/i, 'guide must have Purpose section');
    assert.match(txt, /Target Audience|Audiens/i, 'guide must have audience');
  });

  test('getCategory returns definition with outline', async () => {
    const { getCategory } = await import('../../packages/shared/categories.ts');
    const cat = getCategory('market_outlook');
    assert.ok(cat.description.length > 20);
    assert.equal(cat.riskLevel, 'high');
  });
});
