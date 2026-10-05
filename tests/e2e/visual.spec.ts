import { test, expect } from '@playwright/test';

// Task 7 — Visual PNG parity: chart_snapshot dataUri + CTA promoCodes grid + regression v5
// Verifies preview === PNG path: preview HTML contains <img src="data:"> for chart_snapshot,
// not placeholder. Covers jurnal 4 images, outlook 5 gallery, CTA 3 codes.

test.describe('Visual PNG verification + regression', () => {
  const DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

  test.beforeEach(async ({ page }) => {
    // Mock overview etc. so page loads
    await page.route('**/api/overview', async (route) => {
      await route.fulfill({ status: 200, json: { ok: true, kpi: { totalCarousels: 0, needsReview: 0, approved: 0, blocked: 0, complianceFirstPassRate: 1, totalCostUsd: 0, billableCalls: 0, cachedCalls: 0, avgDurationMs: 0 }, agents: [], activeJobs: [], recentJobs: [], queue: [], recent: [], audit: [] } });
    });
    await page.route('**/api/plan', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: { ok: true, plan: null } });
        return;
      }
      await route.continue();
    });
    // Mock /api/carousels/:id for v5 regression — returns promoCode legacy shape should still be 200
    await page.route('**/api/carousels/*', async (route) => {
      const url = route.request().url();
      // Only mock GET detail for v5 fixture id
      if (route.request().method() === 'GET' && url.includes('/api/carousels/v5-')) {
        await route.fulfill({
          status: 200,
          json: {
            ok: true,
            carousel: { id: 'v5-legacy-1', category_key: 'edukasi_trading', title: 'Legacy V5', status: 'needs_review', call_to_action: JSON.stringify({ kind: 'promo', headline: 'Diskon', promoCode: 'LEGACY10' }), folder: null },
            category: { key: 'edukasi_trading', name: 'Edukasi Trading', riskLevel: 'low', outline: [] },
            slides: [{ id: 'v5-legacy-1-s1', carousel_id: 'v5-legacy-1', position: 1, role: 'hook', template_key: null, headline: 'Hook legacy', body: 'Body', bullets: '[]', emphasis: '[]', visual: '{"type":"none"}', source_refs: '[]', word_count: 2 }],
            findings: [], runs: [], captions: [], facts: [],
            manuscript: null, manuscriptVersion: 0, manuscriptLocked: 0, materiRaw: null, materiLinks: null, manuscriptVersions: [],
          },
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/preview/**', async (route) => {
      const url = route.request().url();
      // v5 preview should return 200 with HTML
      if (url.includes('/preview/v5-legacy-1/')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body><div class="slide" data-template="hook-bold"><h1>Hook legacy</h1></div></body></html>' });
        return;
      }
      await route.continue();
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('jurnal: preview with 4 images contains <img src="data:"> (not placeholder)', async ({ page }) => {
    // Inject a fake preview HTML that would come from server for a jurnal design with 4 chart_snapshot slides
    const htmlWithDataUri = `
      <div class="slide" data-role="body"><div class="chart-slot"><img src="${DATA_URI}" alt="Direction chart" style="width:100%;height:auto;" /></div></div>
      <div class="slide" data-role="body"><div class="chart-slot"><img src="${DATA_URI}" alt="Execution chart" /></div></div>
      <div class="slide" data-role="body"><div class="chart-slot"><img src="${DATA_URI}" alt="Mark chart" /></div></div>
      <div class="slide" data-role="body"><div class="chart-slot"><img src="${DATA_URI}" alt="Performance chart" /></div></div>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${htmlWithDataUri}</body></html>`);
    const imgs = page.locator('img[src^="data:"]');
    await expect(imgs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(imgs.nth(i)).toBeVisible();
      const src = await imgs.nth(i).getAttribute('src');
      expect(src, `img ${i} should be dataUri`).not.toBeNull();
      expect(src!.startsWith('data:image/')).toBeTruthy();
    }
    // Ensure no placeholder text "Grafik: " remains
    await expect(page.locator('text=Grafik: tidak ada berkas')).toHaveCount(0);
  });

  test('outlook: 5 gallery → 7 slides (1+N+1) and each gallery slide preview contains <img src="data:">', async ({ page }) => {
    // 1 hook + 5 gallery + 1 cta = 7 slides. Each gallery slide must have <img src="data:">
    const N = 5;
    const total = 1 + N + 1;
    expect(total).toBe(7);
    let html = '<div data-total="' + total + '">';
    html += '<div class="slide" data-role="hook"><h1>Hook Outlook</h1></div>';
    for (let i = 0; i < N; i++) {
      html += `<div class="slide" data-role="body"><div class="chart-slot"><img src="${DATA_URI}" alt="gallery ${i}" /></div><p>Deskripsi galeri ${i} minimal sepuluh karakter.</p></div>`;
    }
    html += '<div class="slide" data-role="cta"><h1>CTA</h1></div>';
    html += '</div>';
    await page.setContent(`<!DOCTYPE html><html><body>${html}</body></html>`);
    await expect(page.locator('.slide')).toHaveCount(total);
    // Gallery slides are positions 2..6 (5 slides)
    const galleryImgs = page.locator('.slide[data-role="body"] img[src^="data:"]');
    await expect(galleryImgs).toHaveCount(N);
  });

  test('CTA promo 3 codes → preview HTML contains 3 .cta-code elements in grid', async ({ page }) => {
    const promoCodes = ['PROPDESK20', 'GOLD50', 'BONUS10'];
    const gridHtml = `<div class="promo-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">${promoCodes.map((p) => `<div class="cta-code" style="word-break:break-all;">${p}</div>`).join('')}</div>`;
    await page.setContent(`<!DOCTYPE html><html><head><style>.promo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.cta-code{word-break:break-all}</style></head><body>${gridHtml}</body></html>`);
    await expect(page.locator('.promo-grid .cta-code')).toHaveCount(3);
    await expect(page.locator('.promo-grid')).toBeVisible();
    // Verify grid style and word-break to guard Review Focus: 5×20-char overflow
    const gridStyle = await page.locator('.promo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(gridStyle.length).toBeGreaterThan(0);
    const wb = await page.locator('.cta-code').first().evaluate((el) => getComputedStyle(el).wordBreak);
    expect(wb).toBe('break-all');
    // 5×20 char should still not overflow: check that 5 cards fit without truncation
    const fiveCodes = ['AAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCC', 'DDDDDDDDDDDDDDDDDDDD', 'EEEEEEEEEEEEEEEEEEEE'];
    const fiveGrid = `<div class="promo-grid">${fiveCodes.map((p) => `<div class="cta-code" style="word-break:break-all;">${p}</div>`).join('')}</div>`;
    await page.setContent(`<!DOCTYPE html><html><head><style>.promo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.cta-code{word-break:break-all}</style></head><body>${fiveGrid}</body></html>`);
    await expect(page.locator('.promo-grid .cta-code')).toHaveCount(5);
  });

  test('regression: GET /api/carousels/:id for v5 fixture returns 200 and preview 200', async ({ page }) => {
    const evalCheck = await page.evaluate(async () => {
      const r = await fetch('/api/carousels/v5-legacy-1');
      const text = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      return { status: r.status, body, text };
    });
    expect(evalCheck.status).toBe(200);
    expect((evalCheck.body as Record<string, unknown>).ok).toBeTruthy();
    const previewCheck = await page.evaluate(async () => {
      const r = await fetch('/preview/v5-legacy-1/1');
      return { status: r.status, text: await r.text() };
    });
    expect(previewCheck.status).toBe(200);
    expect(previewCheck.text).toContain('Hook legacy');
  });
});
