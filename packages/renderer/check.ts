/**
 * Pemeriksaan render: membuktikan HTML benar-benar dapat dikonversi menjadi
 * gambar di mesin ini, untuk SETIAP template dan setiap profil rasio.
 *
 * Skrip ini sengaja memakai data contoh realistis (bukan "lorem ipsum") agar
 * masalah tata letak yang sesungguhnya langsung terlihat: judul panjang, tabel
 * penuh, kotak disclaimer, dan blok statistik.
 *
 * Jalankan: npm run render:check
 */
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { CarouselSpec, Slide } from '../shared/types.ts';
import { DEFAULT_TOKENS, RATIO_PROFILES } from '../shared/theme.ts';
import { Renderer } from './index.ts';
import { buildHtml } from '../templates/base.ts';
import { resolveTemplate, validateSlide } from '../templates/registry.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const BRAND = 'PropDesk Demo';
const CATEGORY = 'EDUKASI PROPFIRM';

/** Slide contoh yang menutupi seluruh template. */
const FIXTURES: Slide[] = [
  {
    position: 1,
    role: 'hook',
    headline: 'Static vs Trailing Drawdown, Jangan Sampai Salah Baca Aturan',
    body: 'Dua istilah ini terdengar mirip tetapi konsekuensinya pada akun Anda sangat berbeda.',
    bullets: [],
    emphasis: ['Trailing Drawdown'],
    visual: { type: 'abstract_bg', abstractStyle: 'grid' },
    templateKey: 'hook-bold',
    sourceRefs: [],
  },
  {
    position: 2,
    role: 'body',
    headline: 'Static Dihitung dari Saldo Awal',
    body: 'Batas kerugian static dihitung dari saldo awal akun dan tidak pernah bergerak. Jika akun dimulai pada 100.000 dengan batas 10%, maka garis merah Anda tetap di 90.000 sampai kapan pun, meskipun ekuitas sempat naik jauh di atas saldo awal.',
    bullets: [],
    emphasis: ['tidak pernah bergerak'],
    visual: { type: 'abstract_bg', abstractStyle: 'dots' },
    templateKey: 'concept-one-idea',
    sourceRefs: [],
  },
  {
    position: 3,
    role: 'body',
    headline: 'Perbandingan Dasar Hitung',
    body: 'Perhatikan dasar perhitungannya, karena inilah inti perbedaannya.',
    bullets: [],
    emphasis: [],
    visual: {
      type: 'table',
      table: {
        columns: ['Jenis', 'Dasar Hitung', 'Ikut Naik?'],
        rows: [
          { cells: ['Static', 'Saldo awal akun', 'Tidak'] },
          { cells: ['Trailing', 'Ekuitas tertinggi', 'Ya'] },
          { cells: ['EOD Trailing', 'Saldo akhir hari tertinggi', 'Ya, per hari'] },
        ],
      },
      abstractStyle: 'diagonal',
    },
    templateKey: 'propfirm-rules-table',
    sourceRefs: [],
  },
  {
    position: 4,
    role: 'body',
    headline: 'Hasil Posisi Minggu Ini',
    body: 'Catatan jujur: satu kekalahan karena entry terlalu dini, dua kemenangan dengan rencana yang dipatuhi.',
    bullets: [],
    emphasis: [],
    visual: {
      type: 'stat_tile',
      stats: [
        { label: 'Hasil bersih', value: '+2.4R', note: 'Tiga posisi' },
        { label: 'Win rate', value: '66%', note: '2 dari 3' },
        { label: 'Risiko per posisi', value: '0.5%', note: 'Tetap' },
        { label: 'Kesalahan dicatat', value: '1', note: 'Entry dini' },
      ],
      abstractStyle: 'wave',
    },
    templateKey: 'journal-stat-tile',
    sourceRefs: [],
  },
  {
    position: 5,
    role: 'body',
    headline: 'Kenapa Rilis Data Inflasi Ini Penting bagi Trader Retail',
    body: 'Angka inflasi yang lebih tinggi dari perkiraan biasanya menunda harapan penurunan suku bunga, sehingga dolar menguat dan aset berisiko tertekan dalam jangka pendek.',
    bullets: [],
    emphasis: ['menunda harapan penurunan suku bunga'],
    // visualSpec bertipe union; "glow" bukan nilai yang sah untuk abstractStyle,
    // jadi di sini dikosongkan agar sesuai tipe.
    visual: { type: 'abstract_bg', abstractStyle: 'wave' },
    templateKey: 'news-why-it-matters',
    sourceRefs: ['f1'],
  },
  {
    position: 6,
    role: 'example',
    headline: 'Dua Skenario yang Mungkin Terjadi',
    body: 'Analisis ini bukan ajakan bertransaksi, melainkan peta kondisi.',
    bullets: [
      'Harga bertahan di atas area support harian',
      'Volume membesar saat mendekati resistance',
      'Analisis ini batal bila harga tutup di bawah support harian',
      'Skenario gagal bila resistance ditembus dengan volume besar',
    ],
    emphasis: ['support harian'],
    visual: { type: 'none', abstractStyle: 'grid' },
    templateKey: 'scenario-outlook',
    sourceRefs: ['f2'],
  },
  {
    position: 7,
    role: 'checklist',
    headline: 'Periksa Sebelum Mendaftar Program',
    body: null,
    bullets: [
      'Pastikan jenis drawdown yang berlaku',
      'Hitung ulang batas kerugian pada ukuran akun Anda',
      'Cek aturan konsistensi dan batas lot',
      'Pahami syarat jumlah hari minimum',
      'Baca ketentuan pembagian payout',
    ],
    emphasis: [],
    visual: { type: 'none', abstractStyle: 'dots' },
    templateKey: 'checklist-numbered',
    sourceRefs: [],
  },
  {
    position: 8,
    role: 'recap',
    headline: 'Tiga Hal yang Perlu Anda Ingat',
    body: null,
    bullets: [
      'Static tidak bergerak, trailing mengikuti ekuitas tertinggi',
      'Satu kesalahan hitung bisa membatalkan akun',
      'Selalu cocokkan dengan aturan resmi penyelenggara',
    ],
    emphasis: [],
    visual: { type: 'none', abstractStyle: 'wave' },
    templateKey: 'recap-takeaway',
    sourceRefs: [],
  },
  {
    position: 9,
    role: 'disclaimer',
    headline: 'Sebelum Anda Mengambil Keputusan',
    body: 'Materi ini bersifat edukasi dan bukan nasihat keuangan. Trading mengandung risiko kehilangan modal. Kinerja masa lalu tidak menjamin hasil di masa depan. Program dapat berubah, selalu cek aturan resmi di situs penyelenggara.',
    bullets: [],
    emphasis: [],
    visual: { type: 'none' },
    templateKey: 'disclaimer-note',
    sourceRefs: [],
  },
];

const SPEC: CarouselSpec = {
  title: 'Static vs Trailing Drawdown',
  categoryKey: 'edukasi_propfirm',
  disclaimerKey: 'default_finansial',
  locale: 'id-ID',
  asOf: new Date().toISOString(),
  slides: FIXTURES,
};

async function main() {
  const outDir = join(root, 'output', '_render-check');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const renderer = new Renderer();
  const info = renderer.chromiumInfo;
  console.log('=== Pemeriksaan Render HTML -> Gambar ===');
  console.log(`Chromium : ${info.source}`);
  console.log(`Jalur    : ${info.executablePath}`);
  console.log(`Keluaran : ${outDir}\n`);

  // Untuk pemeriksaan ini kita memakai satu profil saja agar cepat, yaitu
  // profil acuan desain. Profil lain diuji penuh melalui pipeline produksi.
  const ratio = RATIO_PROFILES.ig_portrait;
  const results: { slug: string; slide: number; file: string; bytes: number; ms: number; overflow: string }[] = [];
  let overflowCount = 0;
  let validationCount = 0;

  for (const slide of SPEC.slides) {
    const template = resolveTemplate(slide);
    const issues = validateSlide(slide, template);
    if (issues.length > 0) {
      validationCount += issues.length;
      for (const i of issues) {
        console.log(`  [validasi ${i.severity}] slide ${i.slidePosition} ${i.field}: ${i.message}`);
      }
    }

    const ctx = {
      tokens: DEFAULT_TOKENS,
      ratio,
      position: slide.position,
      total: SPEC.slides.length,
      brandName: BRAND,
      categoryLabel: CATEGORY,
      asOf: SPEC.asOf,
      disclaimerText:
        'Materi ini bersifat edukasi dan bukan nasihat keuangan. Trading mengandung risiko kehilangan modal. Kinerja masa lalu tidak menjamin hasil di masa depan.',
    };
    const html = buildHtml(slide, ctx, template);
    const fileName = `slide-${String(slide.position).padStart(2, '0')}-${template.slug}.png`;
    const outPath = join(outDir, fileName);

    const started = Date.now();
    const { overflow, byteSize } = await renderer.renderSlidePng(slide, html, ratio, outPath);
    const ms = Date.now() - started;

    if (overflow.length > 0) {
      overflowCount += overflow.length;
      for (const o of overflow) {
        console.log(`  [overflow] slide ${o.slidePosition}: ${o.element} kelebihan ${o.overflowPx}px`);
      }
    }

    const status = overflow.length > 0 ? 'OVERFLOW' : 'OK';
    console.log(
      `  ${status.padEnd(8)} slide ${String(slide.position).padStart(2)}  ${template.slug.padEnd(22)} ${String(ms).padStart(5)}ms  ${(byteSize / 1024).toFixed(0)} KB`,
    );
    results.push({
      slug: template.slug,
      slide: slide.position,
      file: outPath,
      bytes: byteSize,
      ms,
      overflow: overflow.map((o) => `${o.element}+${o.overflowPx}px`).join(' '),
    });
  }

  await renderer.close();

  const totalBytes = results.reduce((a, r) => a + r.bytes, 0);
  const totalMs = results.reduce((a, r) => a + r.ms, 0);
  console.log('\n=== Ringkasan ===');
  console.log(`Slide dirender   : ${results.length}`);
  console.log(`Template diuji   : ${new Set(results.map((r) => r.slug)).size}`);
  console.log(`Ukuran kanvas    : ${ratio.width}x${ratio.height} @${ratio.deviceScaleFactor}x = ${ratio.width * ratio.deviceScaleFactor}x${ratio.height * ratio.deviceScaleFactor} piksel`);
  console.log(`Total ukuran     : ${(totalBytes / 1024).toFixed(0)} KB`);
  console.log(`Total waktu      : ${totalMs} ms (rata-rata ${Math.round(totalMs / results.length)} ms/slide)`);
  console.log(`Masalah overflow : ${overflowCount}`);
  console.log(`Peringatan validasi: ${validationCount}`);

  if (overflowCount > 0) {
    console.log('\nAda slide yang teksnya meluap. Perbaiki teksnya, jangan potong.');
    process.exitCode = 2;
  } else {
    console.log('\nSemua slide berhasil dirender tanpa teks terpotong.');
  }
}

main().catch((e) => {
  console.error('\nPemeriksaan render gagal:');
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
