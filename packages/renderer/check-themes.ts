/**
 * Pemeriksaan tema: membuktikan setiap kategori benar-benar tampil berbeda.
 *
 * Pemeriksaan ini ada karena klaim "tiap kategori punya desain sendiri" mudah
 * diucapkan tetapi mudah pula tidak terwujud: satu perubahan pada token merek
 * bisa membuat semua kategori kembali seragam tanpa disadari.
 *
 * Yang diperiksa:
 *  1. Setiap kategori menghasilkan nilai visual yang berbeda dari yang lain.
 *  2. Setiap tema tetap lolos ambang kontras, karena tema yang indah tetapi
 *     tidak terbaca adalah kegagalan.
 *  3. Setiap kategori benar-benar merender (bukan hanya berbeda di atas kertas).
 *
 * Jalankan: npm run check:themes
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_ORDER, getCategory } from '../shared/categories.ts';
import { createBrandKit, validateBrandTokens } from '../shared/brand.ts';
import { RATIO_PROFILES } from '../shared/theme.ts';
import { applyTheme, CATEGORY_THEMES, listThemes } from '../templates/themes.ts';
import { buildHtml } from '../templates/base.ts';
import { resolveTemplate } from '../templates/registry.ts';
import { Renderer } from '../renderer/index.ts';
import type { CategoryKey, RatioProfile, Slide } from '../shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

/** Slide contoh generik untuk melihat pengaruh tema tanpa gangguan isi. */
function sampleSlide(categoryKey: CategoryKey): Slide {
  const category = getCategory(categoryKey);
  const role = category.outline[1]?.role ?? 'body';
  return {
    position: 2,
    role,
    headline: 'Perbedaan Dasar dan Cara Membacanya',
    body:
      'Penjelasan singkat yang mewakili isi sesungguhnya, dengan satu frasa yang ditandai sebagai penekanan visual.',
    bullets: role === 'checklist' ? ['Poin pertama', 'Poin kedua', 'Poin ketiga'] : [],
    emphasis: ['penekanan visual'],
    visual:
      role === 'example'
        ? {
            type: 'table',
            table: {
              columns: ['Parameter', 'Nilai'],
              rows: [{ cells: ['Batas risiko', '5%'] }, { cells: ['Target', '1:2'] }],
            },
          }
        : { type: 'abstract_bg' },
    sourceRefs: [],
  };
}

let failures = 0;

console.log('=== Pemeriksaan Tema per Kategori ===\n');

// ---------------------------------------------------------------------------
// 1. Setiap kategori harus menghasilkan konfigurasi visual yang berbeda
// ---------------------------------------------------------------------------

console.log('1. Kebaruan tema antar kategori\n');

const brand = createBrandKit('Uji Tema');
const signatures = new Map<string, string[]>();

for (const key of CATEGORY_ORDER) {
  const themed = applyTheme(brand.tokens, key);
  const theme = CATEGORY_THEMES[key];
  // Sidik jari visual: gabungan nilai yang menentukan tampilan.
  signatures.set(key, [
    themed.colors.accent,
    themed.colors.primary,
    themed.colors.background,
    themed.colors.surface,
    String(themed.radius.card),
    String(themed.style.borderWidth),
    theme.accentStyle,
    theme.counterStyle,
    theme.defaultPattern,
    String(theme.edgeStrip),
  ]);
}

let duplicates = 0;
for (let i = 0; i < CATEGORY_ORDER.length; i += 1) {
  for (let j = i + 1; j < CATEGORY_ORDER.length; j += 1) {
    const a = CATEGORY_ORDER[i]!;
    const b = CATEGORY_ORDER[j]!;
    const sa = signatures.get(a)!;
    const sb = signatures.get(b)!;
    const same = sa.filter((v, idx) => v === sb[idx]).length;
    // Bila lebih dari separuh penanda visual sama, tema dianggap terlalu mirip.
    const ratio = same / sa.length;
    const status = ratio > 0.5 ? 'TERLALU MIRIP' : 'berbeda';
    if (ratio > 0.5) {
      failures += 1;
      duplicates += 1;
    }
    console.log(
      `   ${getCategory(a).name.padEnd(22)} vs ${getCategory(b).name.padEnd(22)} ${status} (${same}/${sa.length} penanda sama)`,
    );
  }
}
console.log(duplicates === 0 ? '\n   Semua kategori punya identitas visual yang berbeda.' : `\n   ${duplicates} pasangan terlalu mirip.`);

// ---------------------------------------------------------------------------
// 2. Setiap tema harus tetap memenuhi ambang kontras
// ---------------------------------------------------------------------------

console.log('\n2. Keterbacaan setiap tema (kontras WCAG)\n');

let contrastFailures = 0;
for (const key of CATEGORY_ORDER) {
  const themed = applyTheme(brand.tokens, key);
  const issues = validateBrandTokens(themed);
  const blocking = issues.filter((i) => i.severity === 'block');
  const theme = CATEGORY_THEMES[key];
  const status = blocking.length === 0 ? 'OK' : 'GAGAL KONTRAS';
  if (blocking.length > 0) {
    contrastFailures += 1;
    failures += blocking.length;
  }
  console.log(`   ${getCategory(key).name.padEnd(22)} tema=${theme.name.padEnd(12)} aksen=${themed.colors.accent}  ${status}`);
  for (const issue of blocking) {
    console.log(`        [BLOKIR] ${issue.field}: ${issue.message}`);
  }
}
console.log(contrastFailures === 0 ? '\n   Semua tema memenuhi ambang kontras.' : `\n   ${contrastFailures} tema perlu diperbaiki.`);

// ---------------------------------------------------------------------------
// 3. Render nyata untuk membuktikan perbedaan terlihat
// ---------------------------------------------------------------------------

console.log('\n3. Render nyata per kategori\n');

const outDir = join(ROOT, 'output', '_theme-check');
await mkdir(outDir, { recursive: true });

const renderer = new Renderer();
const ratio = RATIO_PROFILES.ig_portrait;
const results: { key: CategoryKey; file: string; bytes: number; ms: number }[] = [];

try {
  for (const key of CATEGORY_ORDER) {
    const slide = sampleSlide(key);
    const themed = applyTheme(brand.tokens, key);
    const template = resolveTemplate(slide);
    const html = buildHtml(
      slide,
      {
        tokens: themed,
        ratio,
        position: slide.position,
        total: 7,
        brandName: 'PropDesk',
        categoryLabel: getCategory(key).name.toUpperCase(),
        categoryKey: key,
        asOf: new Date().toISOString(),
        disclaimerText: brand.disclaimers.default_finansial,
        // Uji CTA agar blok ajakan ikut terbukti dapat dirender.
        callToAction:
          key === 'market_info'
            ? { kind: 'promo', headline: 'Promo evaluasi bulan ini', detail: 'Potongan biaya pendaftaran untuk 20 peserta pertama.', promoCode: 'PROPDESK20', validUntil: '2026-12-31' }
            : key === 'edukasi_propfirm'
              ? { kind: 'community', headline: 'Diskusikan aturan program bersama trader lain', communityName: 'Komunitas PropDesk', detail: 'Tanya jawab aturan drawdown setiap Rabu malam.' }
              : { kind: 'save', headline: 'Simpan carousel ini', detail: 'Buka kembali saat Anda menyusun rencana.' },
      },
      template,
    );

    const file = join(outDir, `${key}.png`);
    const started = Date.now();
    const { overflow, byteSize } = await renderer.renderSlidePng(slide, html, ratio, file);
    const ms = Date.now() - started;

    const overflowNote = overflow.length > 0 ? ` OVERFLOW: ${overflow.map((o) => `${o.element}+${o.overflowPx}px`).join(', ')}` : '';
    if (overflow.length > 0) failures += overflow.length;

    console.log(
      `   ${getCategory(key).name.padEnd(22)} ${String(ms).padStart(5)}ms  ${(byteSize / 1024).toFixed(0).padStart(4)} KB${overflowNote}`,
    );
    results.push({ key, file, bytes: byteSize, ms });
  }
} finally {
  await renderer.close();
}

// ---------------------------------------------------------------------------
// Ringkasan
// ---------------------------------------------------------------------------

console.log('\n=== Ringkasan ===');
console.log(`Kategori diuji     : ${CATEGORY_ORDER.length}`);
console.log(`Tema terdefinisi   : ${listThemes().length}`);
console.log('Tema yang tersedia:');
for (const t of listThemes()) {
  console.log(`  - ${t.name.padEnd(12)} ${t.accent}  ${t.intent.slice(0, 64)}`);
}
console.log(`\nBerkas hasil: ${outDir}`);
console.log(failures === 0 ? '\nSemua tema berbeda, terbaca, dan dapat dirender.' : `\n${failures} masalah perlu diperbaiki.`);

if (failures > 0) process.exitCode = 2;
