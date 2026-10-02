/**
 * CLI produksi carousel.
 *
 * Contoh pemakaian:
 *   node packages/cli/generate.ts --category edukasi_propfirm --topic "static vs trailing drawdown"
 *   node packages/cli/generate.ts --all                      # satu carousel untuk tiap kategori
 *   node packages/cli/generate.ts --demo                     # tanpa memanggil model (data contoh)
 *
 * Hasil ditulis ke folder lokal `output/`. TIDAK ada unggahan otomatis ke
 * platform mana pun — sesuai keputusan proyek, unggahan dilakukan manual.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_ORDER, getCategory } from '../shared/categories.ts';
import type { CarouselSpec, ProductionResult, RatioProfile, Slide } from '../shared/types.ts';
import { createBrandKit, validateBrandTokens } from '../shared/brand.ts';
import { LlmClient } from '../llm/client.ts';
import { produceCarousel, PipelineError } from '../agents/pipeline.ts';
import { renderCarousel } from '../renderer/index.ts';
import { formatComplianceReport } from '../compliance/engine.ts';
import { buildHtml } from '../templates/base.ts';
import { resolveTemplate } from '../templates/registry.ts';
import { RATIO_PROFILES } from '../shared/theme.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

interface Args {
  category?: string;
  topic?: string;
  all: boolean;
  demo: boolean;
  fresh: boolean;
  verbose: boolean;
  ratios: RatioProfile[];
  brand: string;
  outputDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    all: false,
    demo: false,
    fresh: false,
    verbose: false,
    ratios: ['ig_portrait'],
    brand: 'PropDesk',
    outputDir: join(ROOT, 'output'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    switch (a) {
      case '--category':
      case '-c':
        args.category = argv[++i];
        break;
      case '--topic':
      case '-t':
        args.topic = argv[++i];
        break;
      case '--brand':
        args.brand = argv[++i] ?? args.brand;
        break;
      case '--output':
        args.outputDir = resolve(argv[++i] ?? args.outputDir);
        break;
      case '--ratios':
        args.ratios = (argv[++i] ?? 'ig_portrait').split(',').map((r) => r.trim()) as RatioProfile[];
        break;
      case '--all':
        args.all = true;
        break;
      case '--demo':
        args.demo = true;
        break;
      case '--fresh':
        args.fresh = true;
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith('-')) {
          console.error(`Argumen tidak dikenal: ${a}`);
          printHelp();
          process.exit(1);
        }
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
PropDesk AI — Produksi Carousel

Pemakaian:
  node packages/cli/generate.ts [opsi]

Opsi:
  -c, --category <kunci>   Kategori konten. Salah satu dari:
${CATEGORY_ORDER.map((k) => `                             ${k} (${getCategory(k).name})`).join('\n')}
  -t, --topic <teks>       Topik carousel (wajib bila tidak memakai --all)
      --all                Hasilkan satu carousel untuk setiap kategori
      --demo               Pakai data contoh, tanpa memanggil 9Router
      --ratios <daftar>    Profil rasio, dipisah koma (bawaan: ig_portrait)
                           Pilihan: ${Object.keys(RATIO_PROFILES).join(', ')}
      --brand <nama>       Nama merek pada kaki slide (bawaan: PropDesk)
      --output <dir>       Direktori keluaran (bawaan: ./output)
      --fresh              Abaikan cache model, minta hasil baru
  -v, --verbose            Tampilkan detail setiap langkah
  -h, --help               Tampilkan bantuan ini
`);
}

// ---------------------------------------------------------------------------
// Topik bawaan per kategori (dipakai oleh --all)
// ---------------------------------------------------------------------------

const DEFAULT_TOPICS: Record<string, string> = {
  edukasi_trading: 'Membaca struktur pasar dengan pendekatan higher high dan lower low',
  edukasi_propfirm: 'Perbedaan static drawdown dan trailing drawdown pada program evaluasi',
  jurnal_trading: 'Evaluasi posisi minggu ini: satu kekalahan yang layak dicatat',
  market_info: 'Dampak rilis data inflasi terhadap ekspektasi suku bunga',
  market_outlook: 'Skenario pergerakan indeks dolar untuk pekan depan',
};

// ---------------------------------------------------------------------------
// Data contoh untuk mode demo (tanpa model)
// ---------------------------------------------------------------------------

function demoSpec(categoryKey: string): CarouselSpec {
  const category = getCategory(categoryKey);
  const base: Omit<Slide, 'position' | 'role'> = {
    headline: '',
    body: null,
    bullets: [],
    emphasis: [],
    visual: { type: 'none' },
    sourceRefs: [],
  };

  const make = (position: number, role: Slide['role'], headline: string, extra: Partial<Slide> = {}): Slide => ({
    ...base,
    position,
    role,
    headline,
    ...extra,
  });

  const slides: Record<string, Slide[]> = {
    edukasi_trading: [
      make(1, 'hook', 'Higher High dan Lower Low, Dua Istilah Dasar Struktur Pasar', {
        body: 'Tanpa memahami keduanya, membaca grafik hanya jadi tebak-tebakan.',
        emphasis: ['Struktur Pasar'],
        visual: { type: 'abstract_bg', abstractStyle: 'grid' },
        templateKey: 'hook-bold',
      }),
      make(2, 'body', 'Apa Itu Higher High', {
        body: 'Higher high terjadi ketika harga berhasil membuat puncak yang lebih tinggi daripada puncak sebelumnya. Ini menandakan pembeli masih memegang kendali.',
        visual: { type: 'abstract_bg', abstractStyle: 'dots' },
        templateKey: 'concept-one-idea',
      }),
      make(3, 'body', 'Apa Itu Lower Low', {
        body: 'Lower low terjadi ketika harga membuat dasar yang lebih rendah daripada dasar sebelumnya. Ini menandakan penjual sedang mendominasi pergerakan.',
        visual: { type: 'abstract_bg', abstractStyle: 'diagonal' },
        templateKey: 'concept-one-idea',
      }),
      make(4, 'checklist', 'Urutan Membaca Struktur', {
        bullets: [
          'Tandai puncak dan dasar terakhir',
          'Bandingkan dengan puncak dan dasar sebelumnya',
          'Tentukan apakah struktur masih naik atau sudah berubah',
          'Baru cari area masuk yang sejalan',
          'Batalkan analisis bila struktur berubah arah',
        ],
        templateKey: 'checklist-numbered',
      }),
      make(5, 'recap', 'Tiga Hal yang Perlu Anda Ingat', {
        bullets: [
          'Struktur naik ditandai higher high dan higher low',
          'Struktur berubah saat satu titik kunci ditembus',
          'Selalu tentukan batas di mana analisis Anda salah',
        ],
        templateKey: 'recap-takeaway',
      }),
      make(6, 'cta', 'Simpan Carousel Ini', {
        body: 'Struktur pasar adalah dasar dari hampir semua metode trading. Simpan agar mudah dibuka kembali saat Anda menganalisis grafik.',
        templateKey: 'recap-takeaway',
      }),
      make(7, 'disclaimer', 'Sebelum Anda Mengambil Keputusan'),
    ],
    edukasi_propfirm: [
      make(1, 'hook', 'Static vs Trailing Drawdown, Jangan Sampai Salah Baca Aturan', {
        body: 'Dua istilah ini terdengar mirip, tetapi konsekuensinya pada akun Anda sangat berbeda.',
        emphasis: ['Trailing Drawdown'],
        visual: { type: 'abstract_bg', abstractStyle: 'grid' },
        templateKey: 'hook-bold',
      }),
      make(2, 'body', 'Perbandingan Dasar Hitung', {
        body: 'Perhatikan dasar perhitungannya, karena di sinilah letak perbedaannya.',
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
        },
        templateKey: 'propfirm-rules-table',
        sourceRefs: ['f1'],
      }),
      make(3, 'body', 'Kenapa Ini Penting bagi Anda', {
        body: 'Pada akun dengan batas trailing, jarak menuju batas kerugian bisa menyusut walaupun Anda tidak mengalami kerugian. Inilah yang membuat sebagian trader kehilangan akun padahal rasa-rasanya sedang untung.',
        emphasis: ['menyusut'],
        templateKey: 'concept-one-idea',
        sourceRefs: ['f2'],
      }),
      make(4, 'checklist', 'Periksa Sebelum Mendaftar', {
        bullets: [
          'Pastikan jenis drawdown yang berlaku',
          'Hitung ulang batas kerugian pada ukuran akun Anda',
          'Cek aturan konsistensi dan batas lot',
          'Pahami syarat jumlah hari minimum',
          'Baca ketentuan pembagian payout',
        ],
        templateKey: 'checklist-numbered',
      }),
      make(5, 'recap', 'Tiga Hal yang Perlu Anda Ingat', {
        bullets: [
          'Static tidak bergerak, trailing mengikuti ekuitas tertinggi',
          'Satu kesalahan hitung bisa membatalkan akun',
          'Selalu cocokkan dengan aturan resmi penyelenggara',
        ],
        templateKey: 'recap-takeaway',
      }),
      make(6, 'cta', 'Simpan Sebagai Rujukan', {
        body: 'Aturan setiap program berbeda. Simpan carousel ini dan bandingkan dengan ketentuan resmi program yang Anda ikuti.',
        templateKey: 'recap-takeaway',
      }),
      make(7, 'disclaimer', 'Sebelum Anda Mengambil Keputusan'),
    ],
    jurnal_trading: [
      make(1, 'hook', 'Catatan Jujur: Satu Posisi Kalah yang Layak Dibahas', {
        body: 'Bukan setiap posisi berakhir untung, dan justru yang kalah paling banyak memberi pelajaran.',
        emphasis: ['layak dibahas'],
        visual: { type: 'abstract_bg', abstractStyle: 'wave' },
        templateKey: 'hook-bold',
      }),
      make(2, 'body', 'Statistik Posisi', {
        body: 'Rencana awal memakai risiko tetap, sehingga hasil dapat diukur dengan satuan R.',
        visual: {
          type: 'stat_tile',
          stats: [
            { label: 'Hasil', value: '-1.0R', note: 'Batas risiko' },
            { label: 'Rencana', value: '2R', note: 'Target awal' },
            { label: 'Ukuran posisi', value: '0.5%', note: 'Dari ekuitas' },
            { label: 'Durasi', value: '6 jam', note: 'Ditutup manual' },
          ],
        },
        templateKey: 'journal-stat-tile',
        sourceRefs: ['f1'],
      }),
      make(3, 'body', 'Apa yang Sudah Sesuai Rencana', {
        body: 'Ukuran posisi dipatuhi dan titik keluar dijalankan tanpa keraguan. Dua hal ini yang membatasi kerugian tetap pada satu R.',
        templateKey: 'concept-one-idea',
      }),
      make(4, 'body', 'Apa yang Menyimpang', {
        body: 'Masuk terlalu dini sebelum konfirmasi muncul. Rencana mensyaratkan penutupan di atas area tertentu, tetapi posisi dibuka saat harga masih di bawahnya.',
        emphasis: ['terlalu dini'],
        templateKey: 'concept-one-idea',
      }),
      make(5, 'recap', 'Pelajaran Utama', {
        bullets: [
          'Kesalahan ada pada eksekusi, bukan pada analisis',
          'Menunggu konfirmasi lebih murah daripada masuk lebih awal',
          'Membatasi ukuran posisi menyelamatkan akun dari kerugian besar',
        ],
        templateKey: 'recap-takeaway',
      }),
      make(6, 'disclaimer', 'Catatan Penting'),
    ],
    market_info: [
      make(1, 'hook', 'Rilis Data Inflasi dan Dampaknya pada Ekspektasi Suku Bunga', {
        body: 'Angka yang lebih tinggi dari perkiraan mengubah cara pasar membaca arah kebijakan berikutnya.',
        emphasis: ['Ekspektasi Suku Bunga'],
        visual: { type: 'abstract_bg', abstractStyle: 'grid' },
        templateKey: 'hook-bold',
      }),
      make(2, 'body', 'Apa yang Terjadi', {
        body: 'Data inflasi dirilis di atas perkiraan konsensus. Reaksi pasar terlihat pada penguatan mata uang dan tekanan pada aset berisiko dalam jangka pendek.',
        templateKey: 'news-why-it-matters',
        sourceRefs: ['f1', 'f2'],
      }),
      make(3, 'body', 'Mengapa Ini Penting bagi Trader Retail', {
        body: 'Perubahan ekspektasi suku bunga memengaruhi pergerakan mata uang dan indeks. Bagi trader, ini berarti volatilitas cenderung meningkat setelah rilis data seperti ini.',
        templateKey: 'news-why-it-matters',
        sourceRefs: ['f3'],
      }),
      make(4, 'checklist', 'Yang Perlu Dipantau', {
        bullets: [
          'Pernyataan pejabat bank sentral setelah rilis data',
          'Rilis data ketenagakerjaan berikutnya',
          'Pergerakan imbal hasil obligasi',
          'Reaksi indeks dolar di sekitar level kunci',
        ],
        templateKey: 'checklist-numbered',
      }),
      make(5, 'cta', 'Ikuti untuk Pembaruan', {
        body: 'Konten berita cepat kadaluarsa. Ikuti akun ini agar tidak melewatkan pembaruan berikutnya.',
        templateKey: 'recap-takeaway',
      }),
      make(6, 'disclaimer', 'Catatan Penting'),
    ],
    market_outlook: [
      make(1, 'hook', 'Skenario Indeks Dolar untuk Pekan Berikutnya', {
        body: 'Dua kemungkinan arah dengan tingkat pembatalan yang jelas, bukan satu ramalan.',
        emphasis: ['tingkat pembatalan'],
        visual: { type: 'abstract_bg', abstractStyle: 'grid' },
        templateKey: 'hook-bold',
      }),
      make(2, 'body', 'Konteks Pasar Saat Ini', {
        body: 'Setelah rilis data inflasi, indeks dolar bergerak di dalam rentang. Selama rentang ini bertahan, arah besar belum dapat ditentukan.',
        templateKey: 'concept-one-idea',
        sourceRefs: ['f1', 'f2'],
      }),
      make(3, 'example', 'Dua Skenario dan Batasnya', {
        body: 'Analisis ini bukan ajakan bertransaksi, melainkan peta kondisi.',
        bullets: [
          'Bila harga bertahan di atas batas atas rentang, perhatikan kelanjutan penguatan',
          'Bila harga gagal bertahan, waspadai kembalinya pelemahan',
          'Analisis batal bila harga kembali ke tengah rentang',
        ],
        emphasis: ['batas atas rentang'],
        templateKey: 'scenario-outlook',
      }),
      make(4, 'body', 'Manajemen Risiko', {
        body: 'Tentukan ukuran posisi sebelum mencari arah. Ketika arah belum jelas, kerugian terbesar biasanya datang dari posisi yang terlalu besar.',
        emphasis: ['sebelum mencari arah'],
        templateKey: 'concept-one-idea',
      }),
      make(5, 'recap', 'Yang Membatalkan Analisis Ini', {
        bullets: [
          'Kembalinya harga ke tengah rentang',
          'Munculnya data baru yang mengubah ekspektasi kebijakan',
        ],
        templateKey: 'recap-takeaway',
      }),
      make(6, 'disclaimer', 'Sebelum Anda Mengambil Keputusan'),
    ],
  };

  const categorySlides = slides[categoryKey] ?? [];
  return {
    title: `Demo ${category.name}`,
    categoryKey: category.key,
    disclaimerKey: category.riskLevel === 'high' ? 'outlook_signal' : 'default_finansial',
    locale: 'id-ID',
    asOf: new Date().toISOString(),
    slides: categorySlides,
  };
}

// ---------------------------------------------------------------------------
// Penulisan laporan
// ---------------------------------------------------------------------------

/** Menulis seluruh berkas pendamping: caption, laporan kepatuhan, biaya, fakta. */
async function writeReports(
  result: ProductionResult,
  dir: string,
  extra: { scheduleNote?: string; analysis?: string; improvement?: string; reusableAsset?: string },
): Promise<string[]> {
  const written: string[] = [];
  const save = async (name: string, content: string) => {
    const p = join(dir, name);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content, 'utf8');
    written.push(p);
  };

  // Caption siap salin
  const v = result.captions.variants[result.captions.recommendedIndex];
  const captionText = [
    `# Caption — ${result.spec.title}`,
    `# Kategori: ${getCategory(result.spec.categoryKey).name}`,
    `# Dibuat: ${result.finishedAt}`,
    '',
    '--- Salin dari sini ---',
    '',
    v?.hook ?? '',
    '',
    v?.body ?? '',
    '',
    v?.cta ?? '',
    '',
    (v?.hashtags ?? []).join(' '),
    '',
    '--- Selesai ---',
  ].join('\n');
  await save('caption.txt', captionText);

  // Laporan kepatuhan
  const complianceText = [
    `# Laporan Kepatuhan — ${result.spec.title}`,
    '',
    formatComplianceReport(result.compliance),
    '',
    '## Catatan',
    '',
    'Laporan ini dihasilkan oleh rule engine deterministik (lapisan L1, L2, L3)',
    'ditambah penilaian nuansa oleh model (lapisan L4, bersifat peringatan saja).',
    'Berkas carousel belum boleh diterbitkan tanpa persetujuan manusia.',
  ].join('\n');
  await save('laporan-kepatuhan.md', complianceText);

  // Fact sheet
  const factText = [
    `# Fact Sheet — ${result.spec.title}`,
    '',
    result.factSheet.limitations ? `Catatan keterbatasan: ${result.factSheet.limitations}\n` : '',
    '| ID | Klaim | Sumber | Waktu data | Keyakinan |',
    '|---|---|---|---|---|',
    ...result.factSheet.entries.map(
      (e) => `| ${e.id} | ${e.claim} | ${e.sourceName} | ${e.asOf} | ${e.confidence} |`,
    ),
  ].join('\n');
  await save('fact-sheet.md', factText);

  // Jejak langkah
  const stepsText = [
    `# Jejak Produksi — ${result.spec.title}`,
    '',
    `Mulai: ${result.startedAt}`,
    `Selesai: ${result.finishedAt}`,
    '',
    '| Langkah | Agen | Status | Durasi | Catatan |',
    '|---|---|---|---|---|',
    ...result.steps.map(
      (s) => `| ${s.stepKey} | ${s.agentKey} | ${s.status} | ${(s.durationMs / 1000).toFixed(1)}s | ${s.note} |`,
    ),
    '',
    extra.scheduleNote ? `## Penjadwalan\n\n${extra.scheduleNote}` : '',
    extra.analysis ? `## Penilaian Analyst\n\n${extra.analysis}` : '',
    extra.improvement ? `\nPerbaikan berikutnya: ${extra.improvement}` : '',
    extra.reusableAsset ? `\nAset yang layak disimpan: ${extra.reusableAsset}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await save('jejak-produksi.md', stepsText);

  // Biaya
  const costText = JSON.stringify(
    {
      totalUsd: result.cost.totalUsd,
      totalTokensIn: result.cost.totalTokensIn,
      totalTokensOut: result.cost.totalTokensOut,
      billableCalls: result.cost.billableCalls,
      entries: result.cost.entries,
      catatan: 'Perkiraan biaya. Model lokal dan combo gratis tercatat 0.',
    },
    null,
    2,
  );
  await save('biaya.json', costText);

  // Spesifikasi slide (sumber kebenaran untuk render ulang)
  await save('slide-spec.json', JSON.stringify(result.spec, null, 2));

  return written;
}

// ---------------------------------------------------------------------------
// Indikator kemajuan
// ---------------------------------------------------------------------------

/**
 * Label ringkas setiap langkah pipeline.
 *
 * Ditampilkan secara BAWAAN, bukan hanya dengan --verbose. Alasannya: satu
 * produksi memakan satu sampai tiga menit, dan tanpa indikator apa pun layar
 * tampak membeku sehingga sulit dibedakan dari proses yang menggantung.
 */
const STEP_LABELS: Record<string, string> = {
  brief: 'Strategist menyusun sudut pandang',
  research: 'mengumpulkan fakta bersumber',
  caption: 'menulis caption',
  compose: 'menyusun slide spec',
  compliance_rules: 'memeriksa aturan kepatuhan',
  compliance_advisor: 'meninjau nuansa klaim',
  render: 'merender slide menjadi gambar',
  schedule: 'menyarankan waktu tayang',
  analyze: 'menilai hasil',
};

/** Mencetak satu baris kemajuan, menggantikan baris sebelumnya. */
function makeProgressPrinter(): (stepKey: string, agentKey: string) => void {
  let index = 0;
  const total = Object.keys(STEP_LABELS).length;
  return (stepKey, agentKey) => {
    index += 1;
    const label = STEP_LABELS[stepKey] ?? stepKey;
    const bar = `[${index}/${total}]`;
    process.stdout.write(`   ${bar} ${agentKey.padEnd(20)} ${label}\n`);
  };
}

// ---------------------------------------------------------------------------
// Alur utama
// ---------------------------------------------------------------------------

async function produceOne(args: Args, categoryKey: string, topic: string): Promise<boolean> {
  const category = getCategory(categoryKey);
  const brandKit = createBrandKit(args.brand);

  console.log(`\n${'='.repeat(74)}`);
  console.log(`KATEGORI : ${category.name}  (risiko: ${category.riskLevel})`);
  console.log(`TOPIK    : ${topic}`);
  console.log(`RASIO    : ${args.ratios.join(', ')}`);
  console.log(`${'='.repeat(74)}`);

  // Periksa keterbacaan brand kit sebelum repot-repot memanggil model.
  const brandIssues = validateBrandTokens(brandKit.tokens);
  const brandBlocks = brandIssues.filter((i) => i.severity === 'block');
  if (brandBlocks.length > 0) {
    console.error('\nBrand kit tidak lolos pemeriksaan keterbacaan:');
    for (const i of brandBlocks) console.error(`  [BLOKIR] ${i.field}: ${i.message}`);
    return false;
  }

  const folderName = `${categoryKey}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
  const outDir = join(args.outputDir, folderName);

  // --- Mode demo: tanpa memanggil 9Router --------------------------------
  if (args.demo) {
    const spec = demoSpec(categoryKey);
    const disclaimerText = brandKit.disclaimers[spec.disclaimerKey] ?? brandKit.disclaimers.default_finansial!;
    // Isi teks disclaimer dari brand kit, bukan dari data contoh.
    for (const slide of spec.slides) {
      if (slide.role === 'disclaimer') {
        slide.headline = slide.headline || 'Sebelum Anda Mengambil Keputusan';
        slide.body = disclaimerText;
      }
    }
    console.log('\nMode demo: memakai data contoh, tanpa memanggil model.');
    for (const slide of spec.slides) {
      const template = resolveTemplate(slide);
      const ctx = {
        tokens: brandKit.tokens,
        ratio: RATIO_PROFILES[args.ratios[0]!],
        position: slide.position,
        total: spec.slides.length,
        brandName: args.brand,
        categoryLabel: category.name.toUpperCase(),
        asOf: spec.asOf,
        disclaimerText,
      };
      const html = buildHtml(slide, ctx, template);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, `html-${String(slide.position).padStart(2, '0')}.html`), html, 'utf8');
    }
    const render = await renderCarousel(spec, brandKit.tokens, {
      ratios: args.ratios,
      outputBaseDir: outDir,
      folderName: '.',
      brandName: args.brand,
      categoryLabel: category.name.toUpperCase(),
      disclaimerText,
      verbose: args.verbose,
    });
    console.log(`\nSelesai: ${render.outputs.length} berkas gambar dalam ${(render.durationMs / 1000).toFixed(1)}s`);
    console.log(`Keluaran: ${render.outputDir}`);
    return true;
  }

  // --- Mode produksi: pipeline 9 agen -------------------------------------
  let llm: LlmClient;
  try {
    llm = new LlmClient({ root: ROOT });
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    return false;
  }

  try {
    const result = await produceCarousel(
      {
        categoryKey,
        topic,
        brandName: args.brand,
        tokens: brandKit.tokens,
        disclaimers: brandKit.disclaimers,
        ratios: args.ratios,
        outputBaseDir: args.outputDir,
        folderName,
        fresh: args.fresh,
        verbose: args.verbose,
        onStep: args.verbose ? undefined : makeProgressPrinter(),
      },
      llm,
    );

    // Ringkasan kepatuhan
    console.log(`\n${'-'.repeat(74)}`);
    console.log(`Kepatuhan: ${result.compliance.outcome.toUpperCase()} — ${result.compliance.summary}`);
    const problems = result.compliance.findings.filter((f) => f.result !== 'pass');
    if (problems.length > 0) {
      for (const f of problems) {
        const tag = f.severity === 'block' ? '[BLOKIR]' : '[CATATAN]';
        console.log(`  ${tag} ${f.subjectRef}: ${f.ruleName}`);
        if (f.evidence) console.log(`      ${f.evidence.slice(0, 140)}`);
      }
    }

    // Ringkasan berkas
    const pngs = result.outputs.filter((o) => o.kind === 'slide_png');
    const pdfs = result.outputs.filter((o) => o.kind === 'carousel_pdf');
    const totalBytes = result.outputs.reduce((a, o) => a + (o.byteSize ?? 0), 0);
    console.log(`\nBerkas: ${pngs.length} PNG, ${pdfs.length} PDF (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    for (const o of pngs.slice(0, 3)) {
      console.log(`  ${o.slidePosition ? `slide ${o.slidePosition}` : 'gabungan'} → ${o.path}`);
    }
    if (pngs.length > 3) console.log(`  ... dan ${pngs.length - 3} slide lainnya`);

    console.log(`\nBiaya: $${result.cost.totalUsd.toFixed(6)} (${result.cost.billableCalls} panggilan berbayar, ${result.cost.totalTokensIn + result.cost.totalTokensOut} token)`);
    const elapsed = (Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 1000;
    console.log(`Waktu total: ${elapsed.toFixed(1)}s`);

    const scheduleStep = result.steps.find((s) => s.stepKey === 'schedule');
    const analyzeStep = result.steps.find((s) => s.stepKey === 'analyze');

    const reportDir = join(args.outputDir, folderName);
    const files = await writeReports(result, reportDir, {
      ...(scheduleStep ? { scheduleNote: scheduleStep.note } : {}),
      ...(analyzeStep ? { analysis: analyzeStep.note } : {}),
    });
    console.log(`\nLaporan tertulis (${files.length} berkas):`);
    for (const f of files) console.log(`  ${f}`);
    console.log(`\nKeluaran lengkap: ${reportDir}`);
    console.log('Catatan: berkas TIDAK diunggah otomatis. Unggahan dilakukan manual.');
    return true;
  } catch (err) {
    if (err instanceof PipelineError) {
      console.error(`\nPipeline berhenti pada langkah "${err.stepKey}" (agen ${err.agentKey}).`);
      console.error(`\n${err.message}`);
    } else {
      console.error(`\nProduksi gagal: ${err instanceof Error ? err.message : err}`);
    }
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();

  if (!args.all && (!args.category || !args.topic)) {
    console.error('Perlu --category dan --topic, atau --all untuk semua kategori.');
    console.error('Jalankan dengan --help untuk melihat pilihan.');
    process.exit(1);
  }

  if (args.category && !CATEGORY_ORDER.includes(args.category as (typeof CATEGORY_ORDER)[number])) {
    console.error(`Kategori tidak dikenal: "${args.category}".`);
    console.error(`Pilihan: ${CATEGORY_ORDER.join(', ')}`);
    process.exit(1);
  }

  const jobs: { category: string; topic: string }[] = args.all
    ? CATEGORY_ORDER.map((k) => ({ category: k, topic: DEFAULT_TOPICS[k] ?? getCategory(k).name }))
    : [{ category: args.category!, topic: args.topic! }];

  const results: { category: string; ok: boolean }[] = [];
  for (const job of jobs) {
    const ok = await produceOne(args, job.category, job.topic);
    results.push({ category: job.category, ok });

    // Jeda singkat antar kategori agar penyedia model tidak kena batas laju.
    if (args.all && jobs.indexOf(job) < jobs.length - 1 && !args.demo) {
      console.log('\nJeda 3 detik sebelum kategori berikutnya...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(74)}`);
  console.log('RINGKASAN');
  console.log(`${'='.repeat(74)}`);
  for (const r of results) {
    console.log(`  ${r.ok ? 'BERHASIL' : 'GAGAL   '}  ${getCategory(r.category).name}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} kategori berhasil. Total waktu: ${elapsed}s`);
  console.log(`Keluaran ada di: ${args.outputDir}`);

  if (okCount < results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nGagal total:', err instanceof Error ? err.message : err);
  process.exit(1);
});
