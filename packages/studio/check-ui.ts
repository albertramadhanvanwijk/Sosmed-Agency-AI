/**
 * Pemeriksaan antarmuka Studio.
 *
 * Membuka Studio di Chromium, berpindah ke setiap tab, dan mengambil tangkapan
 * layar. Juga mengumpulkan galat konsol dan permintaan jaringan yang gagal —
 * supaya masalah front-end terlihat sebagai data, bukan tebakan.
 *
 * Jalankan: node packages/studio/check-ui.ts   (Studio harus sudah berjalan)
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromium } from '../renderer/chromium.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const URL_BASE = process.env.STUDIO_URL ?? 'http://127.0.0.1:4321';
const OUT = join(ROOT, 'output', '_studio-check');

const TABS = ['command', 'pipeline', 'approvals', 'office', 'knowledge', 'audit'];

async function main() {
  await mkdir(OUT, { recursive: true });
  const plan = resolveChromium();
  const browser = await chromium.launch({ executablePath: plan.executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1180 }, deviceScaleFactor: 1 });

  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'gagal'}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
  });

  console.log('=== Pemeriksaan Antarmuka Studio ===');
  console.log(`Sasaran: ${URL_BASE}`);
  console.log(`Keluaran: ${OUT}\n`);

  await page.goto(URL_BASE, { waitUntil: 'load', timeout: 60_000 });
  // Tunggu pemuatan data awal selesai (KPI terisi oleh JavaScript).
  await page.waitForFunction(() => {
    const row = document.getElementById('kpi-row');
    return row && row.children.length > 0;
  }, { timeout: 30_000 }).catch(() => { /* dilaporkan sebagai masalah di bawah */ });

  const kpiCount = await page.evaluate(() => document.getElementById('kpi-row')?.children.length ?? 0);
  console.log(`1. Command Center — ${kpiCount} kartu KPI terisi ${kpiCount > 0 ? 'OK' : 'GAGAL'}`);
  await page.screenshot({ path: join(OUT, '01-command-center.png'), fullPage: false });

  for (const [i, tab] of TABS.entries()) {
    if (tab === 'command') continue;
    const n = String(i + 1).padStart(2, '0');
    await page.click(`nav.tabs button[data-tab="${tab}"]`);
    // Beri waktu tab memuat datanya.
    await page.waitForTimeout(1600);

    const info = await page.evaluate((t) => {
      const sec = document.getElementById('tab-' + t);
      if (!sec) return { visible: false, nodes: 0, empties: 0, iframes: 0 };
      const empties = sec.querySelectorAll('.empty').length;
      const iframes = sec.querySelectorAll('iframe').length;
      return {
        visible: sec.style.display !== 'none',
        nodes: sec.querySelectorAll('*').length,
        empties,
        iframes,
      };
    }, tab);

    const status = info.visible ? 'OK' : 'TIDAK TAMPIL';
    console.log(
      `${i + 1}. ${tab.padEnd(11)} ${status}  ${String(info.nodes).padStart(5)} elemen` +
      `${info.iframes ? `, ${info.iframes} pratinjau slide` : ''}` +
      `${info.empties ? `, ${info.empties} keadaan kosong` : ''}`,
    );
    await page.screenshot({ path: join(OUT, `${n}-${tab}.png`), fullPage: tab === 'office' });
  }

  // Buka satu detail carousel untuk memastikan laci dan pratinjau bekerja.
  await page.click('nav.tabs button[data-tab="approvals"]');
  await page.waitForTimeout(1200);
  const hasDetail = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#approvals-list button')) as HTMLElement[];
    const btn = buttons.find((b) => (b.textContent ?? '').includes('Buka Detail'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (hasDetail) {
    await page.waitForTimeout(3000);
    const drawer = await page.evaluate(() => {
      const inner = document.getElementById('drawer-inner');
      const drawerEl = document.getElementById('drawer');
      return {
        open: drawerEl ? drawerEl.classList.contains('on') : false,
        iframes: inner ? inner.querySelectorAll('iframe').length : 0,
        findings: inner ? inner.querySelectorAll('.finding').length : 0,
        tables: inner ? inner.querySelectorAll('table').length : 0,
        text: ((inner && inner.textContent) || '').slice(0, 90).replace(/\s+/g, ' '),
      };
    });
    console.log(`\n7. Laci detail — ${drawer.open ? 'terbuka' : 'GAGAL TERBUKA'}`);
    console.log(`   pratinjau slide: ${drawer.iframes}, temuan/blok: ${drawer.findings}, tabel: ${drawer.tables}`);
    console.log(`   ringkasan: ${drawer.text}`);
    await page.screenshot({ path: join(OUT, '07-detail-drawer.png'), fullPage: false });

    // Tutup laci sebelum berpindah tab, karena laci menutupi bilah tab.
    await page.click('#drawer-close');
    await page.waitForTimeout(500);

    // Buka juga panel detail agen dari kantor.
    await page.click('nav.tabs button[data-tab="office"]');
    await page.waitForTimeout(2400);
    const agentOpened = await page.evaluate(() => {
      const a = document.querySelector('#office .agent') as HTMLElement | null;
      if (a) { a.click(); return true; }
      return false;
    });
    if (agentOpened) {
      await page.waitForTimeout(1200);
      const agentInfo = await page.evaluate(() => {
        const inner = document.getElementById('drawer-inner');
        const drawerEl = document.getElementById('drawer');
        return {
          open: drawerEl ? drawerEl.classList.contains('on') : false,
          rows: inner ? inner.querySelectorAll('tr').length : 0,
        };
      });
      console.log(`8. Detail agen — ${agentInfo.open ? 'terbuka' : 'GAGAL'} (${agentInfo.rows} baris data)`);
      await page.screenshot({ path: join(OUT, '08-agent-detail.png'), fullPage: false });
      await page.click('#drawer-close');
    }
  } else {
    console.log('\n7. Laci detail — tidak ada tombol detail (tidak ada carousel menunggu review)');
  }

  await browser.close();

  console.log('\n=== Galat front-end ===');
  if (consoleErrors.length === 0) console.log('  Tidak ada galat konsol.');
  else for (const e of consoleErrors.slice(0, 15)) console.log(`  [konsol] ${e}`);

  // Permintaan pratinjau yang gagal wajar bila carousel tidak punya berkas
  // produksi (mis. data contoh). Yang penting tidak ada galat JavaScript.
  const realFailures = failedRequests.filter((f) => !f.includes('/preview/'));
  if (realFailures.length === 0) console.log('  Tidak ada permintaan jaringan yang gagal (selain pratinjau data contoh).');
  else for (const f of realFailures.slice(0, 15)) console.log(`  [jaringan] ${f}`);

  const problems = consoleErrors.length + realFailures.length;
  console.log(problems === 0 ? '\nAntarmuka bersih tanpa galat.' : `\nAda ${problems} masalah yang perlu diperiksa.`);
  if (problems > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error('Pemeriksaan antarmuka gagal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
