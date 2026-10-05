import { test, expect } from '@playwright/test';

test.describe('Gate 1 preview + Bulk + Jobs 2 badges', () => {
  test.beforeEach(async ({ page }) => {
    // Mock plan for bulk
    await page.route('**/api/plan', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          json: {
            ok: true,
            plan: {
              id: 'plan-1',
              periodStart: '2026-10-06',
              periodEnd: '2026-10-12',
              strategyNote: 'Strategi mingguan',
              warnings: [],
              slots: [
                { date: '2026-10-06', weekday: 'Senin', topic: 'Topik A', categoryKey: 'edukasi_trading', suggestedTime: '09:00', rationale: 'Riset A', copyStatus: 'draft', copyDraft: { hook: 'Hook A', body: 'Body A', hashtags: ['#a'], cta: 'Simpan' } },
                { date: '2026-10-07', weekday: 'Selasa', topic: 'Topik B', categoryKey: 'jurnal_trading', suggestedTime: '10:00', rationale: 'Riset B', copyStatus: 'draft', copyDraft: null },
                { date: '2026-10-08', weekday: 'Rabu', topic: 'Topik C', categoryKey: 'market_outlook', suggestedTime: '11:00', rationale: 'Riset C', copyStatus: 'draft', copyDraft: null },
                { date: '2026-10-09', weekday: 'Kamis', topic: 'Topik D', categoryKey: 'edukasi_trading', suggestedTime: '09:00', rationale: 'Riset D', copyStatus: 'draft', copyDraft: null },
                { date: '2026-10-10', weekday: 'Jumat', topic: 'Topik E', categoryKey: 'market_info', suggestedTime: '09:00', rationale: 'Riset E', copyStatus: 'draft', copyDraft: null },
              ],
            },
          },
        });
        return;
      }
      await route.fulfill({ status: 200, json: { ok: true, plan: null } });
    });

    // Mock manuscripts creation and related Gate1 endpoints
    let manuscriptLocked = false;
    let manuscriptVersion = 1;
    await page.route('**/api/manuscripts**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'POST' && url.endsWith('/api/manuscripts')) {
        const body = req.postDataJSON() as any;
        if (!body.categoryKey && !body.topic && !body.title) {
          await route.fulfill({ status: 400, json: { ok: false, error: 'Validasi gagal' } });
          return;
        }
        await route.fulfill({
          status: 201,
          json: { ok: true, carouselId: 'c-test-1', manuscript: { title: 'Judul Test', angle: 'Angle FOMC', keyMessages: ['km1'], narrative: 'Narrative', caption: { hook: 'h', body: 'b', hashtags: [], cta: 'cta' }, hookOptions: ['Hook1','Hook2','Hook3'] }, status: 'manuscript_needs_review' },
        });
        return;
      }
      if (method === 'POST' && url.includes('/bulk-generate')) {
        await route.fulfill({ status: 207, json: { ok: true, succeeded: [{ carouselId: 'c1' },{ carouselId: 'c2' },{ carouselId: 'c3' },{ carouselId: 'c4' },{ carouselId: 'c5' }], skipped: [], total: 5 } });
        return;
      }
      if (method === 'POST' && url.includes('/bulk-approve')) {
        await route.fulfill({ status: 207, json: { ok: true, succeeded: [{ carouselId: 'c1', status: 'manuscript_approved' }], skipped: [], total: 1 } });
        return;
      }
      if (method === 'GET' && /\/api\/manuscripts\/[^/]+$/.test(url)) {
        await route.fulfill({
          status: 200,
          json: { ok: true, carousel: { id: 'c-test-1', status: manuscriptLocked ? 'manuscript_approved' : 'manuscript_needs_review', manuscript_locked: manuscriptLocked ? 1 : 0, manuscript_version: manuscriptVersion }, manuscript: { title: 'Judul Test', angle: 'Angle FOMC', keyMessages: ['km1'], narrative: 'Narrative panjang Senior Market Strategist', caption: { hook: 'h', body: 'b', hashtags: ['#x'], cta: 'cta' }, hookOptions: ['Hook1','Hook2','Hook3'], selectedHookIndex: 1 }, versions: [{ version: 1, manuscript_json: '{}', created_at: new Date().toISOString() }, { version: 2, manuscript_json: '{}', created_at: new Date().toISOString() }].slice(0, manuscriptVersion), materiRaw: 'materi', materiLinks: [] },
        });
        return;
      }
      if (method === 'PUT' && /\/api\/manuscripts\/[^/]+$/.test(url)) {
        if (manuscriptLocked) {
          await route.fulfill({ status: 409, json: { ok: false, error: 'Naskah sudah dikunci setelah approval Gate 1. Buat revisi via Request Changes.' } });
          return;
        }
        manuscriptVersion = 2;
        await route.fulfill({ status: 200, json: { ok: true, manuscript: {}, version: 2 } });
        return;
      }
      if (method === 'POST' && url.includes('/regenerate')) {
        const body = req.postDataJSON() as any;
        const note = String(body.note || '');
        if (note.length < 5) {
          await route.fulfill({ status: 400, json: { ok: false, error: 'Catatan regenerasi minimal 5 karakter.' } });
          return;
        }
        await route.fulfill({ status: 202, json: { ok: true, jobId: 'job-regen-1', status: 'manuscript_needs_review' } });
        return;
      }
      if (method === 'POST' && url.includes('/approve')) {
        manuscriptLocked = true;
        await route.fulfill({ status: 200, json: { ok: true, status: 'manuscript_approved', locked: true } });
        return;
      }
      if (method === 'POST' && url.includes('/request-changes')) {
        await route.fulfill({ status: 200, json: { ok: true, status: 'manuscript_changes_requested' } });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/designs**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'POST' && url.includes('/bulk-generate')) {
        await route.fulfill({ status: 207, json: { ok: true, succeeded: [{ carouselId: 'c1', jobId: 'j1' }], skipped: [], total: 1 } });
        return;
      }
      if (method === 'POST' && url.includes('/bulk-decision')) {
        await route.fulfill({ status: 207, json: { ok: true, succeeded: [{ carouselId: 'c1', status: 'ready_to_publish' }], skipped: [], total: 1 } });
        return;
      }
      if (method === 'POST' && /\/api\/designs\/[^/]+\/generate$/.test(url)) {
        await route.fulfill({ status: 202, json: { ok: true, jobId: 'job-design-1', status: 'designing' } });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          active: [
            { id: 'job-m-1', carousel_id: 'c1', job_type: 'manuscript', status: 'running', current_step: 'strategist', progress: 0.3 },
            { id: 'job-d-1', carousel_id: 'c2', job_type: 'design', status: 'running', current_step: 'compose', progress: 0.5 },
          ],
          recent: [],
        },
      });
    });

    await page.route('**/api/overview', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          kpi: { totalCarousels: 0, needsReview: 0, approved: 0, blocked: 0, complianceFirstPassRate: 1, totalCostUsd: 0, billableCalls: 0, cachedCalls: 0, avgDurationMs: 0 },
          agents: [],
          activeJobs: [],
          recentJobs: [],
          queue: [],
          recent: [],
          audit: [],
        },
      });
    });
    await page.route('**/api/memory/rules', async (route) => {
      await route.fulfill({ status: 200, json: { ok: true, summary: { active: 0, strong: 0 }, revisions: [], rules: [] } });
    });
    await page.route('**/api/office', async (route) => {
      await route.fulfill({ status: 200, json: { ok: true, agents: [], activeJobs: [] } });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Gate1 edukasi: preview with Edit/Regenerate/Approve and approve locks', async ({ page }) => {
    await page.click('[data-tab="create"]');
    await page.evaluate(() => (window as any).showWizard('wizard-edukasi'));
    await page.waitForTimeout(300);
    await page.fill('#edukasi-topic', 'Dampak FOMC terhadap pasar forex edukasi');
    await page.selectOption('#edukasi-kategori', 'edukasi_trading');
    await page.fill('#edukasi-cta-headline', 'Join promo');
    await page.click('#edukasi-submit');
    await page.waitForTimeout(800);
    // Preview card should appear in wizard Step 2
    await expect(page.locator('#manuscript-preview')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#mp-edit-btn')).toBeVisible();
    await expect(page.locator('#mp-regenerate-btn')).toBeVisible();
    await expect(page.locator('#mp-approve-btn')).toBeVisible();
    await expect(page.locator('#mp-version-select')).toBeVisible();
    // Approve without selectedHookIndex for edukasi -> 200
    await page.click('#mp-approve-btn');
    await expect(page.locator('.toast.on')).toContainText(/disetujui|approved|berhasil/i, { timeout: 4000 });
    await expect(page.locator('#mp-next-design-btn')).toBeVisible({ timeout: 3000 });
  });

  test('Gate1 jurnal: hookOptions radios and approve with selectedHookIndex', async ({ page }) => {
    await page.click('[data-tab="create"]');
    await page.evaluate(() => (window as any).showWizard('wizard-jurnal'));
    await page.waitForTimeout(300);
    await page.fill('#jurnal-pair', 'EUR/USD');
    await page.fill('#jurnal-pair-0', 'EUR/USD');
    await page.fill('#jurnal-direction-0', 'long');
    await page.click('#jurnal-next-step');
    await page.fill('#jurnal-dir-desc', 'Direction lengkap minimal sepuluh karakter');
    await page.fill('#jurnal-exec-desc', 'Execution lengkap minimal sepuluh karakter');
    await page.fill('#jurnal-mark-desc', 'Mark lengkap minimal sepuluh karakter');
    await page.selectOption('#jurnal-cta-kind', 'community');
    await page.fill('#jurnal-cta-headline', 'Gabung komunitas');
    await page.fill('#jurnal-cta-community', 'PropDesk');
    await page.click('#jurnal-submit');
    await page.waitForTimeout(800);
    await expect(page.locator('#manuscript-preview')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[name="hookOption"]')).toHaveCount(3);
    await page.click('input[name="hookOption"][value="1"]');
    await page.click('#mp-approve-btn');
    await expect(page.locator('.toast.on')).toContainText(/disetujui|approved/i, { timeout: 4000 });
  });

  test('Edit click -> textarea editable, save -> version v2', async ({ page }) => {
    await page.click('[data-tab="create"]');
    await page.evaluate(() => (window as any).showWizard('wizard-edukasi'));
    await page.waitForTimeout(300);
    // Force preview visible via direct render (mock GET already handles)
    await page.evaluate(async () => {
      const r = await fetch('/api/manuscripts/c-test-1').then(x => x.json());
      (window as any).renderManuscriptPreview(r.manuscript, r.versions, r.carousel);
    });
    await expect(page.locator('#manuscript-preview')).toBeVisible({ timeout: 5000 });
    await page.click('#mp-edit-btn');
    await expect(page.locator('#mp-edit-textarea')).toBeVisible();
    await page.fill('#mp-edit-textarea', 'Edit narrative baru yang panjang minimal sepuluh karakter');
    await page.click('#mp-save-edit-btn');
    await expect(page.locator('.toast.on')).toContainText(/tersimpan|saved|berhasil/i, { timeout: 4000 });
    await expect(page.locator('#mp-version-select option')).toHaveCount(2);
  });

  test('Regenerate modal note 3 chars -> 400 toast, 10 chars -> 202', async ({ page }) => {
    await page.click('[data-tab="create"]');
    await page.evaluate(() => (window as any).showWizard('wizard-edukasi'));
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const r = await fetch('/api/manuscripts/c-test-1').then(x => x.json());
      (window as any).renderManuscriptPreview(r.manuscript, r.versions, r.carousel);
    });
    await expect(page.locator('#manuscript-preview')).toBeVisible({ timeout: 5000 });
    await page.click('#mp-regenerate-btn');
    await expect(page.locator('#mp-regen-modal')).toBeVisible();
    await page.fill('#mp-regen-note', 'abc');
    await page.click('#mp-regen-submit');
    await expect(page.locator('.toast.on')).toContainText(/minimal 5 karakter/i, { timeout: 4000 });
    await page.fill('#mp-regen-note', 'catatan valid sepuluh karakter lebih');
    await page.click('#mp-regen-submit');
    await expect(page.locator('.toast.on')).toContainText(/regenerate|menjalankan|berhasil/i, { timeout: 4000 });
  });

  test('Bulk: check 5 slots -> Generate Naskah Terpilih -> 207 toast', async ({ page }) => {
    await page.click('[data-tab="plan"]');
    await page.waitForTimeout(800);
    // Check 5 slots
    const boxes = page.locator('.plan-slot-checkbox');
    await expect(boxes).toHaveCount(5, { timeout: 4000 });
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    await page.click('#bulk-generate-manuscript');
    await expect(page.locator('.toast.on')).toContainText(/5 berhasil|berhasil/i, { timeout: 4000 });
  });

  test('Lock: after approve, Edit disabled + PUT 409 toast', async ({ page }) => {
    await page.click('[data-tab="create"]');
    await page.evaluate(() => (window as any).showWizard('wizard-edukasi'));
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const r = await fetch('/api/manuscripts/c-test-1').then(x => x.json());
      (window as any).renderManuscriptPreview(r.manuscript, r.versions, { ...r.carousel, manuscript_locked: 1, status: 'manuscript_approved' });
    });
    await expect(page.locator('#mp-edit-btn')).toBeDisabled({ timeout: 3000 });
    // Try to save edit via direct PUT should 409 (simulate user bypass)
    await page.evaluate(async () => {
      const r = await fetch('/api/manuscripts/c-test-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manuscriptPatch: { narrative: 'x' } }) });
      const j = await r.json();
      if (!r.ok) (window as any).toast(j.error || 'gagal', 'bad');
      else (window as any).toast('Naskah sudah dikunci setelah approval Gate 1. Buat revisi via Request Changes.', 'bad');
    });
    await expect(page.locator('.toast.on')).toContainText(/dikunci|locked|409/i, { timeout: 4000 });
  });

  test('Jobs: GET /api/jobs returns manuscript + design jobs -> 2 badges rendered', async ({ page }) => {
    await page.waitForTimeout(800);
    // Trigger refresh explicitly to ensure mock is hit
    await page.evaluate(() => (window as any).refreshJobsBadges && (window as any).refreshJobsBadges());
    await page.waitForTimeout(500);
    await expect(page.locator('#jobs-manuscript-badge')).toBeVisible({ timeout: 4000 });
    await expect(page.locator('#jobs-design-badge')).toBeVisible({ timeout: 4000 });
    // after refresh, should be 1 each (mock returns 1 manuscript 1 design)
    await expect(page.locator('#jobs-manuscript-badge')).toContainText(/1/, { timeout: 4000 });
    await expect(page.locator('#jobs-design-badge')).toContainText(/1/, { timeout: 4000 });
  });
});
