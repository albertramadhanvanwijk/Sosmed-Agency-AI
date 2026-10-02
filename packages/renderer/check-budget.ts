/**
 * Pemeriksaan kesesuaian template pada SEMUA profil rasio.
 *
 * Alasan pemeriksaan ini ada: sebuah slide yang muat pada profil 4:5
 * (Instagram Portrait) belum tentu muat pada profil 1:1 (Square) yang lebih
 * pendek. Sebelumnya hal ini baru ketahuan saat produksi, dan kegagalannya
 * menggagalkan seluruh carousel setelah puluhan panggilan model terlanjur
 * dibayar.
 *
 * Pemeriksaan ini menggunakan aturan kapasitas yang SAMA dengan yang dipakai
 * melewati model (lihat `packages/templates/text-budget.ts`), sehingga batas
 * teks dapat ditolak lebih awal — sebelum biaya dikeluarkan.
 *
 * Jalankan: npm run check:budget
 */
import { getCategory, CATEGORY_ORDER } from '../shared/categories.ts';
import { RATIO_PROFILES } from '../shared/theme.ts';
import {
  TEXT_BUDGETS,
  budgetFor,
  fitsWithin,
  shapeFromLimits,
  type BudgetKey,
} from '../templates/text-budget.ts';

/** Rasio tinggi kanvas terhadap profil acuan (ig_portrait 1350). */
const BASE_RATIO = RATIO_PROFILES.ig_portrait.height;

/** Mengukur tinggi kanvas sebuah profil, memperhitungkan area aman. */
function usableRatio(key: keyof typeof RATIO_PROFILES): number {
  return RATIO_PROFILES[key].height / BASE_RATIO;
}

let failures = 0;

console.log('=== Pemeriksaan Anggaran Teks per Profil Rasio ===\n');
console.log('Anggaran teks dihitung ulang untuk setiap profil, karena kanvas yang');
console.log('lebih pendek menampung lebih sedikit teks.\n');

// ---------------------------------------------------------------------------
// 1. Setiap kategori harus muat di setiap profil
// ---------------------------------------------------------------------------

console.log('1. Kategori x Profil Rasio\n');

const ratioKeys = Object.keys(RATIO_PROFILES) as (keyof typeof RATIO_PROFILES)[];

// Perkiraan panjang teks terburuk yang realistis untuk setiap peran slide.
// Angka ini diambil dari batas atas yang biasa dihasilkan model, bukan dari
// batas ideal, supaya pemeriksaan ini benar-benar menguji kasus terburuk.
const WORST_CASE = {
  hook: { headline: 68, body: 150, bullets: 0, bulletChars: 0 },
  body: { headline: 56, body: 380, bullets: 4, bulletChars: 90 },
  example: { headline: 58, body: 300, bullets: 3, bulletChars: 80 },
  checklist: { headline: 52, body: 0, bullets: 6, bulletChars: 76 },
  recap: { headline: 48, body: 200, bullets: 4, bulletChars: 70 },
  cta: { headline: 48, body: 200, bullets: 4, bulletChars: 70 },
  disclaimer: { headline: 60, body: 700, bullets: 0, bulletChars: 0 },
} as const;

const header = ['Kategori', 'Peran', ...ratioKeys.map((k) => (RATIO_PROFILES[k].label.split(' ')[0] ?? k))];
console.log('   ' + header.map((h) => h.padEnd(12)).join(''));
for (const categoryKey of CATEGORY_ORDER) {
  const category = getCategory(categoryKey);
  const seen = new Set<string>();
  for (const { role } of category.outline) {
    const budgetKey = role as BudgetKey;
    if (seen.has(role)) continue;
    seen.add(role);

    const worst = WORST_CASE[budgetKey as keyof typeof WORST_CASE];
    if (!worst) continue;
    // Slide disclaimer tidak menyimpan isi dari model (diisi brand kit), jadi
    // panjang isi tidak relevan untuk pengukuran ini.
    const shape = shapeFromLimits({
      headlineChars: worst.headline,
      bodyChars: role === 'disclaimer' ? 0 : worst.body,
      bullets: worst.bullets,
      bulletChars: worst.bulletChars,
    });

    const row: string[] = [];
    for (const ratioKey of ratioKeys) {
      const budget = budgetFor(budgetKey, ratioKey);
      const result = fitsWithin(shape, budget);
      const mark = result.fits ? '  ok' : ` >${result.violations[0]?.overBy ?? '?'}`;
      if (!result.fits) failures += 1;
      row.push(`${result.fits ? 'OK' : 'LUAP'}${mark}`.padEnd(12));
    }
    console.log('   ' + [category.name.slice(0, 11), role].map((c) => c.padEnd(12)).join('') + row.join(''));
  }
}

// ---------------------------------------------------------------------------
// 2. Profil acuan harus menjadi yang paling longgar
// ---------------------------------------------------------------------------

console.log('\n2. Urutan kapasitas antar profil\n');
const refBudget = budgetFor('body', 'ig_portrait');
let orderingOk = true;
for (const ratioKey of ratioKeys) {
  if (ratioKey === 'ig_portrait') continue;
  const budget = budgetFor('body', ratioKey);
  const usable = usableRatio(ratioKey);
  // Profil yang kanvasnya lebih pendek harus punya anggaran teks lebih ketat.
  const consistent = usable >= 1 ? budget.bodyChars >= refBudget.bodyChars : budget.bodyChars <= refBudget.bodyChars;
  if (!consistent) {
    orderingOk = false;
    failures += 1;
    console.log(`   TIDAK KONSISTEN: ${RATIO_PROFILES[ratioKey].label} — kanvas ${(usable * 100).toFixed(0)}% dari acuan tetapi anggaran isi ${budget.bodyChars} (acuan ${refBudget.bodyChars})`);
  }
}
console.log(orderingOk ? '   Semua profil konsisten dengan tinggi kanvasnya.' : '   Ada profil yang anggarannya tidak masuk akal.');

// ---------------------------------------------------------------------------
// 3. Ringkasan anggaran
// ---------------------------------------------------------------------------

console.log('\n3. Ringkasan Anggaran Teks\n');
console.log('   ' + ['Peran'.padEnd(12), ...ratioKeys.map((k) => (RATIO_PROFILES[k].label.split(' ')[0] ?? k).padEnd(11))].join(''));
for (const key of Object.keys(TEXT_BUDGETS) as BudgetKey[]) {
  const cells = ratioKeys.map((r) => `${budgetFor(key, r).bodyChars}`.padEnd(11));
  console.log('   ' + [key.padEnd(12), ...cells].join(''));}
console.log('\n   Angka di atas adalah batas karakter untuk ISI slide (body).');

console.log(`\n=== Kesimpulan: ${failures === 0 ? 'semua slide muat di semua profil' : `${failures} kombinasi meluap`} ===`);
if (failures > 0) {
  console.log('\nPerbaikan yang disarankan: perkecil ukuran font pada template yang bermasalah,');
  console.log('kurangi jumlah poin, atau naikkan anggaran hanya jika tampilan tetap terbaca.');
  console.log(reasonText());
  process.exitCode = 2;
}

/** Ringkasan alasan anggaran ini ada, untuk ditampilkan saat gagal. */
function reasonText(): string {
  return [
    '',
    'Catatan: anggaran ini bukan angka sembarang. Angka ini diturunkan dari hasil',
    'render nyata, karena ukuran font pada template ditulis dalam satuan yang',
    'menyesuaikan lebar kanvas (vw). Saat kanvas menjadi lebih pendek, ukuran font',
    'tidak ikut mengecil, sehingga batas teksnya harus lebih ketat.',
  ].join('\n');
}
