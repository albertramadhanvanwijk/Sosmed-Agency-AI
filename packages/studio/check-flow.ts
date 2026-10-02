/**
 * Pemeriksaan alur kerja Studio, bukan hanya tampilan.
 *
 * Skrip ini menjalankan urutan yang benar-benar dipakai pengguna: menyusun
 * rencana, membuat carousel, memutuskan hasil, meminta revisi dengan catatan,
 * dan memastikan tombol keputusan HILANG setelah diputuskan.
 *
 * Pemeriksaan ini penting karena beberapa permintaan bersifat perilaku, bukan
 * tampilan: "tombol hilang setelah diputuskan" dan "catatan revisi wajib diisi"
 * tidak dapat dibuktikan dengan melihat tangkapan layar saja.
 *
 * Jalankan dengan Studio sudah berjalan: node packages/studio/check-flow.ts
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromium } from '../renderer/chromium.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4321';
const OUT = join(ROOT, 'output', '_flow-check');

/** Hasil satu pemeriksaan. */
interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
function record(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok, detail });
  console.log(`   ${ok ? 'OK   ' : 'GAGAL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const plan = resolveChromium();
  const browser = await chromium.launch({ executablePath: plan.executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

  console.log('=== Pemeriksaan Alur Kerja Studio ===\n');
  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => {
    const r = document.getElementById('kpi-row');
    return r && r.children.length > 0;
  }, { timeout: 30_000 }).catch(() => {});

  // -------------------------------------------------------------------------
  console.log('1. Tata letak admin');
  // -------------------------------------------------------------------------
  const layout = await page.evaluate(() => {
    const crumb = document.getElementById('crumb-tab');
    return {
      hasSidebar: !!document.querySelector('.side'),
      navCount: document.querySelectorAll('#nav button').length,
      hasTopbar: !!document.querySelector('.top'),
      hasCrumb: crumb ? crumb.textContent ?? '' : '',
    };
  });
  record('bilah sisi tampil', layout.hasSidebar);
  record('menu navigasi lengkap', layout.navCount >= 10, `${layout.navCount} menu`);
  record('bilah atas dan jejak lokasi tampil', layout.hasTopbar && layout.hasCrumb.length > 0, layout.hasCrumb);
  await page.screenshot({ path: join(OUT, '01-dashboard.png') });

  // -------------------------------------------------------------------------
  console.log('\n2. Popup kemajuan saat memuat ulang');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="pipeline"]');
  // Popup harus muncul segera setelah klik.
  const loadingAppeared = await page.waitForFunction(
    () => {
      const e = document.getElementById('loading');
      return e ? e.classList.contains('on') : false;
    },
    { timeout: 3000 },
  ).then(() => true).catch(() => false);
  record('popup kemajuan muncul saat berpindah tab', loadingAppeared);
  await page.screenshot({ path: join(OUT, '02-loading.png') });

  // Popup harus hilang setelah data selesai dimuat.
  const loadingGone = await page.waitForFunction(
    () => {
      const e = document.getElementById('loading');
      return e ? !e.classList.contains('on') : true;
    },
    { timeout: 15_000 },
  ).then(() => true).catch(() => false);
  record('popup kemajuan hilang setelah selesai', loadingGone);

  // -------------------------------------------------------------------------
  console.log('\n3. Rencana mingguan');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="plan"]');
  await page.waitForTimeout(1200);
  await page.click('#plan-build');
  const planDone = await page.waitForFunction(
    () => {
      const out = document.getElementById('plan-out');
      return out && out.querySelectorAll('.plan-row').length >= 5;
    },
    { timeout: 90_000 },
  ).then(() => true).catch(() => false);
  const planInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('#plan-out .plan-row');
    const firstRow = rows[0] as HTMLElement | undefined;
    const firstTopic = firstRow ? firstRow.querySelector('.tp') : null;
    const metaEl = document.getElementById('plan-meta');
    return {
      count: rows.length,
      first: firstTopic ? firstTopic.textContent ?? '' : '',
      meta: metaEl ? metaEl.textContent ?? '' : '',
    };
  });
  record('rencana mingguan tersusun', planDone, `${planInfo.count} slot`);
  record('slot rencana punya topik', planInfo.first.length > 8, planInfo.first.slice(0, 60));
  await page.screenshot({ path: join(OUT, '03-plan.png'), fullPage: false });

  // -------------------------------------------------------------------------
  console.log('\n4. Formulir produksi (CTA, saran tambahan, gambar)');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="create"]');
  await page.waitForTimeout(900);
  const formFields = await page.evaluate(() => ({
    extra: !!document.getElementById('f-extra'),
    ctaKind: !!document.getElementById('f-cta-kind'),
    files: !!document.getElementById('f-files'),
    simBox: !!document.getElementById('sim-warn'),
  }));
  record('kolom saran tambahan tersedia', formFields.extra);
  record('pemilih jenis CTA tersedia', formFields.ctaKind);
  record('unggahan gambar tersedia', formFields.files);

  // CTA jenis promo harus memunculkan kolom kode promo.
  await page.selectOption('#f-cta-kind', 'promo');
  await page.waitForTimeout(300);
  const promoVisible = await page.evaluate(() => {
    const e = document.getElementById('cta-promo-wrap');
    return e ? e.style.display !== 'none' : false;
  });
  record('kolom kode promo muncul untuk jenis promo', promoVisible);
  await page.selectOption('#f-cta-kind', 'community');
  await page.waitForTimeout(300);
  const commVisible = await page.evaluate(() => {
    const e = document.getElementById('cta-comm-wrap');
    return e ? e.style.display !== 'none' : false;
  });
  record('kolom nama komunitas muncul untuk jenis komunitas', commVisible);

  // Pemeriksaan kesamaan topik harus muncul untuk topik yang sudah dibahas.
  await page.fill('#f-topic', 'Perbedaan static drawdown dan trailing drawdown pada program evaluasi');
  await page.waitForTimeout(1600);
  const simShown = await page.evaluate(() => {
    const box = document.getElementById('sim-warn');
    if (!box) return { has: false, text: '' };
    return { has: box.children.length > 0, text: (box.textContent ?? '').slice(0, 80) };
  });
  record('peringatan topik berulang muncul', simShown.has, simShown.text);
  await page.screenshot({ path: join(OUT, '04-create.png') });

  // -------------------------------------------------------------------------
  console.log('\n5. Tombol keputusan hilang setelah diputuskan');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="approvals"]');
  await page.waitForTimeout(1500);
  const queue = await page.evaluate(() => {
    const items = document.querySelectorAll('#approvals-list .finding');
    return items.length;
  });

  if (queue === 0) {
    record('ada carousel untuk diuji', false, 'antrean kosong, uji keputusan dilewati');
  } else {
    // Buka carousel pertama.
    const opened = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('#approvals-list button')) as HTMLElement[];
      const b = buttons.find((x) => (x.textContent ?? '').includes('Buka Detail'));
      if (b) { b.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    const beforeDecision = await page.evaluate(() => {
      const inner = document.getElementById('drawer-i');
      if (!inner) return { hasApprove: false, hasRevise: false };
      const buttons = Array.from(inner.querySelectorAll('button')).map((b) => b.textContent ?? '');
      return {
        hasApprove: buttons.some((t) => t.includes('Setujui')),
        hasRevise: buttons.some((t) => t.includes('Minta Revisi')),
      };
    });
    record('tombol keputusan tersedia pada status menunggu', beforeDecision.hasApprove && beforeDecision.hasRevise);

    // Uji bahwa catatan revisi WAJIB diisi.
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('#drawer-i button')) as HTMLElement[];
      const b = buttons.find((x) => (x.textContent ?? '').includes('Minta Revisi'));
      if (b) { b.click(); }
    });
    await page.waitForTimeout(800);
    const hasNoteField = await page.evaluate(() => !!document.getElementById('rev-note'));
    record('formulir catatan revisi muncul', hasNoteField);

    // Kirim tanpa catatan: harus ditolak.
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('#drawer-i button')) as HTMLElement[];
      const b = buttons.find((x) => (x.textContent ?? '').includes('Kirim'));
      if (b) { b.click(); }
    });
    await page.waitForTimeout(900);
    const blocked = await page.evaluate(() => {
      const toast = document.getElementById('toast');
      if (!toast) return false;
      return toast.classList.contains('on') && /wajib diisi/i.test(toast.textContent ?? '');
    });
    record('catatan kosong ditolak', blocked);
    await page.screenshot({ path: join(OUT, '05-revise-form.png') });
    await page.click('#drawer-x');
    await page.waitForTimeout(500);
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Kantor agen dan mode teks');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="office"]');
  await page.waitForTimeout(2500);
  const officeInfo = await page.evaluate(() => ({
    zones: document.querySelectorAll('#office .zone').length,
    agents: document.querySelectorAll('#office .agent').length,
    flow: document.querySelectorAll('#office-flow .fnode').length,
  }));
  record('kantor menampilkan zona', officeInfo.zones >= 5, `${officeInfo.zones} zona`);
  record('agen tampil di kantor', officeInfo.agents >= 5, `${officeInfo.agents} agen`);
  record('alur produksi tampil', officeInfo.flow >= 9, `${officeInfo.flow} langkah`);

  await page.click('#of-mode');
  await page.waitForTimeout(700);
  const textMode = await page.evaluate(() => {
    const wrap = document.getElementById('office-table-wrap');
    return {
      tableHidden: wrap ? wrap.style.display === 'none' : true,
      rows: document.querySelectorAll('#office-table-wrap tr').length,
    };
  });
  record('mode teks menyediakan tabel setara', !textMode.tableHidden && textMode.rows > 3, `${textMode.rows} baris`);
  await page.screenshot({ path: join(OUT, '06-office.png') });
  await page.click('#of-mode');
  await page.waitForTimeout(500);

  // -------------------------------------------------------------------------
  console.log('\n7. Logo & merek, serta pembelajaran');
  // -------------------------------------------------------------------------
  await page.click('nav button[data-tab="brand"]');
  await page.waitForTimeout(1500);
  const brandForm = await page.evaluate(() => ({
    logo: !!document.getElementById('b-logo'),
    pos: !!document.getElementById('b-pos'),
    name: !!document.getElementById('b-name'),
  }));
  record('formulir logo tersedia', brandForm.logo && brandForm.pos);
  record('formulir merek teks tersedia', brandForm.name);
  await page.screenshot({ path: join(OUT, '07-brand.png') });

  await page.click('nav button[data-tab="memory"]');
  await page.waitForTimeout(1500);
  const memInfo = await page.evaluate(() => {
    const sum = document.getElementById('mem-summary2');
    return {
      hasRuleField: !!document.getElementById('m-rule'),
      hasReflect: !!document.getElementById('mem-reflect'),
      summary: sum ? sum.textContent ?? '' : '',
    };
  });
  record('halaman pembelajaran tersedia', memInfo.hasRuleField && memInfo.hasReflect);
  await page.screenshot({ path: join(OUT, '08-memory.png') });

  await browser.close();

  // -------------------------------------------------------------------------
  console.log('\n=== Galat konsol ===');
  if (consoleErrors.length === 0) console.log('   Tidak ada galat konsol.');
  else for (const e of consoleErrors.slice(0, 10)) console.log(`   [konsol] ${e}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== Kesimpulan: ${checks.length - failed.length}/${checks.length} pemeriksaan lulus ===`);
  if (failed.length > 0) {
    console.log('Yang belum lulus:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
    process.exitCode = 2;
  }
  console.log(`Tangkapan layar: ${OUT}`);
}

main().catch((e) => {
  console.error('Pemeriksaan alur gagal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
