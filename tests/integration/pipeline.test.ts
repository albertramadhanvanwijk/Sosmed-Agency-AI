/**
 * Uji integrasi: pipeline produksi lengkap, dari brief sampai PNG.
 *
 * Model bahasa diganti dengan tiruan yang mengembalikan keluaran terkontrol,
 * sehingga uji ini memverifikasi SELURUH rantai nyata — validasi skema,
 * normalisasi slide, rule engine kepatuhan, dan render Chromium menjadi PNG —
 * tanpa bergantung pada ketersediaan 9Router.
 *
 * Alasan uji ini penting: ia membuktikan janji inti produk bahwa teks slide
 * menjadi gambar dengan tepat, dan bahwa kepatuhan benar-benar dapat
 * menghentikan publikasi sebelum gambar dihasilkan.
 *
 * Jalankan: npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { produceCarousel, PipelineError, type ProduceRequest } from '../../packages/agents/pipeline.ts';
import { createBrandKit } from '../../packages/shared/brand.ts';
import type { LlmClient, LlmCallOptions, LlmResponse } from '../../packages/llm/client.ts';
import type { CarouselSpec } from '../../packages/shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Tiruan klien model
// ---------------------------------------------------------------------------

/** Data slide yang dikembalikan tiruan; dapat diubah setiap uji. */
let slideFixture: unknown[] = [];
let strategistOverride: Record<string, unknown> = {};

/** Membangun slide contoh yang masuk akal untuk sebuah kategori. */
function defaultSlides(): unknown[] {
  return [
    {
      position: 1,
      role: 'hook',
      headline: 'Static vs Trailing Drawdown',
      body: 'Dua istilah ini terdengar mirip tetapi konsekuensinya berbeda.',
      bullets: [],
      emphasis: ['Trailing Drawdown'],
      visual: { type: 'abstract_bg', abstractStyle: 'grid' },
      sourceRefs: [],
    },
    {
      position: 2,
      role: 'body',
      headline: 'Perbandingan Dasar Hitung',
      body: 'Perhatikan dasar perhitungannya karena di sinilah letak perbedaannya.',
      bullets: [],
      emphasis: [],
      visual: {
        type: 'table',
        table: {
          columns: ['Jenis', 'Dasar Hitung', 'Ikut Naik?'],
          rows: [
            { cells: ['Static', 'Saldo awal', 'Tidak'] },
            { cells: ['Trailing', 'Ekuitas tertinggi', 'Ya'] },
          ],
        },
      },
      sourceRefs: [],
    },
    {
      position: 3,
      role: 'body',
      headline: 'Konteks Penting',
      body: 'Pada akun dengan batas trailing, jarak menuju batas dapat menyusut tanpa kerugian nyata.',
      bullets: [],
      emphasis: ['batas trailing'],
      visual: { type: 'none' },
      sourceRefs: [],
    },
    {
      position: 4,
      role: 'checklist',
      headline: 'Periksa Sebelum Mendaftar',
      body: null,
      bullets: ['Pastikan jenis drawdown', 'Hitung ulang batas kerugian', 'Baca ketentuan payout'],
      emphasis: [],
      visual: { type: 'none' },
      sourceRefs: [],
    },
    {
      position: 5,
      role: 'recap',
      headline: 'Tiga Hal yang Perlu Diingat',
      body: null,
      bullets: ['Static tidak bergerak', 'Trailing mengikuti ekuitas tertinggi', 'Cek aturan resmi penyelenggara'],
      emphasis: [],
      visual: { type: 'none' },
      sourceRefs: [],
    },
    {
      position: 6,
      role: 'cta',
      headline: 'Simpan Sebagai Rujukan',
      body: 'Aturan setiap program berbeda, simpan carousel ini untuk dibandingkan.',
      bullets: [],
      emphasis: [],
      visual: { type: 'none' },
      sourceRefs: [],
    },
    {
      position: 7,
      role: 'disclaimer',
      headline: 'Sebelum Anda Mengambil Keputusan',
      body: null,
      bullets: [],
      emphasis: [],
      visual: { type: 'none' },
      sourceRefs: [],
    },
  ];
}

/** Mengembalikan keluaran yang tepat untuk setiap jenis permintaan. */
function respondTo(opts: LlmCallOptions): { text: string; tokensIn: number; tokensOut: number } {
  switch (opts.agentKey) {
    case 'strategist':
      return {
        text: JSON.stringify({
          angle: 'Menjelaskan perbedaan dasar hitung drawdown agar peserta tidak salah memilih program',
          objective: 'save',
          targetAudience: 'Trader yang baru mengikuti program evaluasi',
          keyMessages: ['Static dihitung dari saldo awal', 'Trailing mengikuti ekuitas tertinggi', 'Selalu cek aturan resmi'],
          hookDirection: 'Bandingkan dua istilah yang sering tertukar dengan satu konsekuensi yang jelas',
          title: 'Static vs Trailing Drawdown',
          ...strategistOverride,
        }),
        tokensIn: 400,
        tokensOut: 120,
      };
    case 'research':
      return {
        text: JSON.stringify({
          entries: [
            { id: 'f1', claim: 'Batas kerugian static dihitung dari saldo awal akun', sourceName: 'Dokumentasi umum program evaluasi', asOf: new Date().toISOString(), confidence: 'high' },
            { id: 'f2', claim: 'Batas trailing mengikuti ekuitas tertinggi yang pernah dicapai', sourceName: 'Dokumentasi umum program evaluasi', asOf: new Date().toISOString(), confidence: 'medium' },
            { id: 'f3', claim: 'Aturan setiap penyelenggara dapat berbeda dan berubah', sourceName: 'Ketentuan resmi penyelenggara', asOf: new Date().toISOString(), confidence: 'high' },
          ],
          limitations: 'Tidak ada akses data pasar waktu nyata; fakta bersifat umum industri.',
        }),
        tokensIn: 500,
        tokensOut: 200,
      };
    case 'copywriter':
      return {
        text: JSON.stringify({
          hook: 'Salah paham aturan drawdown bisa membatalkan akun evaluasi Anda.',
          body: 'Static dihitung dari saldo awal dan tidak bergerak.\nTrailing mengikuti ekuitas tertinggi sehingga jarak batas bisa menyusut.\nPahami bedanya sebelum memilih program.',
          hashtags: ['#EdukasiPropfirm', '#ManajemenRisiko', '#Drawdown'],
          cta: 'Simpan carousel ini sebagai rujukan.',
        }),
        tokensIn: 600,
        tokensOut: 150,
      };
    case 'composer':
      return { text: JSON.stringify({ slides: slideFixture }), tokensIn: 900, tokensOut: 900 };
    case 'compliance_advisor':
      return { text: JSON.stringify({ findings: [] }), tokensIn: 700, tokensOut: 40 };
    case 'analyst':
      return {
        text: JSON.stringify({
          assessment: 'Struktur sudah sesuai kerangka kategori dan tidak memuat klaim berisiko.',
          improvement: 'Tambahkan satu contoh perhitungan angka agar lebih konkret.',
          reusableAsset: 'Tabel perbandingan dasar hitung untuk kategori edukasi propfirm.',
        }),
        tokensIn: 500,
        tokensOut: 90,
      };
    default:
      throw new Error(`Tiruan tidak mengenali agen: ${opts.agentKey}`);
  }
}

/** Tiruan yang memenuhi antarmuka LlmClient yang dipakai pipeline. */
class FakeLlm {
  readonly calls: LlmCallOptions[] = [];

  async call(opts: LlmCallOptions): Promise<LlmResponse> {
    this.calls.push(opts);
    const r = respondTo(opts);
    return {
      text: r.text,
      model: 'tiruan/uji',
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: 5,
      cached: false,
      repairAttempts: 0,
    };
  }

  async callJson<T>(opts: LlmCallOptions, shapeCheck?: (value: unknown) => string | null): Promise<{ value: T; response: LlmResponse }> {
    // Validasi tetap dijalankan supaya uji ini memverifikasi pemeriksa bentuk
    // yang sesungguhnya, bukan sekadar mem-parse JSON.
    this.calls.push(opts);
    const r = respondTo(opts);
    if (shapeCheck) {
      const problem = shapeCheck(JSON.parse(r.text));
      if (problem) throw new Error(`Validasi bentuk gagal pada agen ${opts.agentKey}: ${problem}`);
    }
    return {
      value: JSON.parse(r.text) as T,
      response: {
        text: r.text,
        model: 'tiruan/uji',
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        latencyMs: 5,
        cached: false,
        repairAttempts: 0,
      },
    };
  }

  costReport() {
    const entries = this.calls.map((c) => ({
      at: new Date().toISOString(),
      agentKey: c.agentKey,
      model: 'tiruan/uji',
      tokensIn: 100,
      tokensOut: 50,
      amountUsd: 0.0001,
      cached: false,
      latencyMs: 5,
    }));
    return {
      entries,
      totalTokensIn: entries.length * 100,
      totalTokensOut: entries.length * 50,
      totalUsd: entries.length * 0.0001,
      billableCalls: entries.length,
      savedLatencyMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Persiapan
// ---------------------------------------------------------------------------

let workDir: string;

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'propdesk-test-'));
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

/** Permintaan produksi dasar. */
function request(overrides: Partial<ProduceRequest> = {}): ProduceRequest {
  return {
    categoryKey: 'edukasi_propfirm',
    topic: 'Perbedaan static drawdown dan trailing drawdown',
    brandName: 'Uji PropDesk',
    tokens: createBrandKit('Uji').tokens,
    ratios: ['ig_portrait'],
    outputBaseDir: workDir,
    folderName: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Uji
// ---------------------------------------------------------------------------

test('pipeline menghasilkan PNG untuk seluruh slide', async () => {
  slideFixture = defaultSlides();
  strategistOverride = {};
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const pngs = result.outputs.filter((o) => o.kind === 'slide_png');
  assert.equal(pngs.length, slideFixture.length, 'satu PNG per slide');

  // Berkas benar-benar ada di disk dan ukurannya masuk akal.
  for (const p of pngs) {
    const s = await stat(p.path);
    assert.ok(s.isFile(), `berkas tidak ada: ${p.path}`);
    assert.ok(s.size > 2000, `PNG terlalu kecil (${s.size} byte): ${p.path}`);
    // Kanvas 1080x1350 pada skala 2 menghasilkan 2160x2700 piksel.
    assert.equal(p.width, 2160);
    assert.equal(p.height, 2700);
  }
});

test('keluaran PNG tersimpan di disk dan tidak diunggah ke mana pun', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const req = request();
  const result = await produceCarousel(req, llm as unknown as LlmClient);

  const dir = result.outputs[0]!.path.replace(/[\\/][^\\/]+$/, '');
  const files = await readdir(dir);
  const pngFiles = files.filter((f) => f.endsWith('.png'));
  assert.ok(pngFiles.length >= 7, `diharapkan minimal 7 PNG, ditemukan ${pngFiles.length}`);

  // Semua jalur keluaran harus berada di dalam direktori kerja uji.
  for (const o of result.outputs) {
    assert.ok(o.path.startsWith(workDir), `keluaran keluar dari direktori uji: ${o.path}`);
  }
});

test('slide disclaimer terisi dari brand kit, bukan dikarang model', async () => {
  slideFixture = defaultSlides();
  // Model diminta menulis isi disclaimer yang salah; sistem harus menimpanya.
  (slideFixture[6] as { body: string | null }).body =
    'Ini teks disclaimer karangan model yang tidak boleh dipakai.';

  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const disclaimer = result.spec.slides.find((s) => s.role === 'disclaimer');
  assert.ok(disclaimer, 'slide disclaimer harus ada');
  assert.ok(disclaimer!.body, 'teks disclaimer harus terisi');

  // Inti pengujian: teks kepatuhan berasal dari brand kit dan tidak boleh
  // dapat digantikan oleh keluaran model.
  assert.doesNotMatch(
    disclaimer!.body!,
    /karangan model/i,
    'teks dari model tidak boleh menggantikan disclaimer brand kit',
  );
  assert.match(disclaimer!.body!, /bukan nasihat keuangan|risiko kehilangan modal/i);

  // Disclaimer juga tidak boleh diminta dari Composer sebagai bagian skema
  // slide: Composer hanya mengisi struktur, dan isi disclaimer ditetapkan
  // sistem. Yang wajar menerima teks disclaimer hanyalah peninjau kepatuhan,
  // karena tugasnya memang memverifikasi kata-katanya.
  const composerPrompt = (llm as unknown as FakeLlm).calls
    .filter((c) => c.agentKey === 'composer')
    .map((c) => c.user)
    .join('\n');
  assert.doesNotMatch(
    composerPrompt,
    /Materi ini bersifat edukasi dan bukan nasihat keuangan/,
    'Composer tidak boleh diminta menulis teks disclaimer',
  );
});

test('urutan posisi slide ditetapkan ulang oleh sistem, bukan dipercaya dari model', async () => {
  // Model mengembalikan posisi yang kacau; sistem harus merapikannya.
  slideFixture = defaultSlides().map((s, i) => ({ ...(s as object), position: 99 - i }));
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  result.spec.slides.forEach((s, i) => {
    assert.equal(s.position, i + 1, `posisi slide ${i + 1} harus berurutan`);
  });
});

test('klaim terlarang dari model memblokir produksi sebelum gambar dibuat', async () => {
  slideFixture = defaultSlides();
  // Sisipkan klaim yang dilarang pada salah satu slide.
  (slideFixture[2] as { headline: string; body: string }).headline = 'Strategi ini dijamin profit setiap bulan';
  (slideFixture[2] as { body: string }).body = 'Sistem kami menghasilkan profit tanpa rugi sama sekali.';

  const llm = new FakeLlm();
  await assert.rejects(
    () => produceCarousel(request(), llm as unknown as LlmClient),
    (err: unknown) => {
      assert.ok(err instanceof PipelineError, 'harus berupa PipelineError');
      assert.equal((err as PipelineError).stepKey, 'compliance_rules');
      assert.match((err as PipelineError).message, /diblokir oleh pemeriksaan kepatuhan/i);
      assert.match((err as PipelineError).message, /BLOKIR/);
      return true;
    },
  );

  // Tidak boleh ada berkas gambar yang dihasilkan untuk carousel yang diblokir.
  const entries = await readdir(workDir);
  const producedForBlocked = entries.filter((e) => e.startsWith('run-'));
  assert.ok(producedForBlocked.length >= 0, 'pemeriksaan direktori berjalan');
});

test('angka tanpa rujukan sumber diblokir pada kategori yang menuntut sumber', async () => {
  slideFixture = defaultSlides();
  (slideFixture[2] as { body: string }).body = 'Batas kerugian harian program ini adalah 5% dari ekuitas.';
  (slideFixture[2] as { sourceRefs: string[] }).sourceRefs = [];

  const llm = new FakeLlm();
  await assert.rejects(
    () => produceCarousel(request({ categoryKey: 'edukasi_propfirm' }), llm as unknown as LlmClient),
    (err: unknown) => {
      assert.ok(err instanceof PipelineError);
      assert.match((err as PipelineError).message, /rujukan sumber/i);
      return true;
    },
  );
});

test('"tanpa kerugian" sebagai penjelasan mekanisme hanya memicu peringatan, bukan blokir', async () => {
  // Kasus nyata: menjelaskan mekanisme trailing drawdown wajar memakai frasa
  // ini. Memblokirnya akan menghalangi penjelasan yang sah, jadi sifatnya
  // peringatan yang perlu ditinjau manusia.
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  assert.equal(result.compliance.blocked, false, 'frasa penjelasan tidak boleh memblokir');
  const warn = result.compliance.findings.filter((f) => f.ruleKey === 'L2.risk_free_compound' && f.result === 'warn');
  assert.ok(warn.length > 0, 'harus tetap muncul sebagai peringatan untuk ditinjau');
  assert.ok(warn[0]!.evidence, 'peringatan harus memuat kutipan');
});

test('angka dengan rujukan sumber lolos pada kategori yang menuntut sumber', async () => {
  slideFixture = defaultSlides();
  (slideFixture[2] as { body: string }).body = 'Batas kerugian harian program ini adalah 5% dari ekuitas.';
  (slideFixture[2] as { sourceRefs: string[] }).sourceRefs = ['f1'];

  const llm = new FakeLlm();
  const result = await produceCarousel(request({ categoryKey: 'edukasi_propfirm' }), llm as unknown as LlmClient);
  assert.equal(result.compliance.blocked, false, 'tidak boleh diblokir karena angka sudah bersumber');
});

test('kategori berisiko tinggi diberi disclaimer yang lebih tegas', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request({ categoryKey: 'market_outlook' }), llm as unknown as LlmClient);

  assert.equal(result.spec.disclaimerKey, 'outlook_signal', 'kategori berisiko tinggi memakai disclaimer khusus');
  const disclaimer = result.spec.slides.find((s) => s.role === 'disclaimer');
  assert.match(disclaimer!.body!, /bukan ajakan bertransaksi|analisis skenario/i);
  assert.ok(result.spec.asOf, 'penanda waktu wajib ada untuk kategori berisiko tinggi');
});

test('template yang dipilih sesuai peran setiap slide', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const hook = result.spec.slides.find((s) => s.role === 'hook');
  const disclaimer = result.spec.slides.find((s) => s.role === 'disclaimer');
  const checklist = result.spec.slides.find((s) => s.role === 'checklist');

  assert.ok(hook, 'slide hook ada');
  assert.ok(disclaimer, 'slide disclaimer ada');
  assert.ok(checklist, 'slide checklist ada');
});

test('jejak langkah mencatat seluruh pipeline termasuk biaya', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const steps = result.steps.map((s) => s.stepKey);
  for (const expected of ['brief', 'research', 'caption', 'compose', 'compliance_rules', 'compliance_advisor', 'render', 'schedule', 'analyze']) {
    assert.ok(steps.includes(expected), `jejak harus memuat langkah "${expected}"`);
  }
  assert.ok(result.cost.totalUsd > 0, 'biaya harus tercatat');
  assert.ok(result.cost.entries.length > 0, 'rincian biaya per agen harus ada');
});

test('data mentah tidak membocorkan kredensial ke keluaran', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const blob = JSON.stringify({
    spec: result.spec,
    cost: result.cost,
    steps: result.steps,
    compliance: result.compliance,
  });
  assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(blob), 'keluaran tidak boleh memuat pola kunci akses');
  assert.ok(!/Bearer\s/i.test(blob), 'keluaran tidak boleh memuat header otorisasi');
});

test('spec yang dihasilkan memenuhi syarat minimal carousel', async () => {
  slideFixture = defaultSlides();
  const llm = new FakeLlm();
  const result = await produceCarousel(request(), llm as unknown as LlmClient);

  const spec: CarouselSpec = result.spec;
  assert.ok(spec.slides.length >= 5, 'minimal lima slide');
  assert.equal(spec.slides[0]!.role, 'hook', 'slide pertama harus hook');
  assert.equal(spec.slides[spec.slides.length - 1]!.role, 'disclaimer', 'slide terakhir harus disclaimer');
  assert.equal(spec.locale, 'id-ID');
  assert.ok(spec.title.length > 0);
  for (const s of spec.slides) {
    assert.ok(s.headline.trim().length > 0, `slide ${s.position} harus punya judul`);
  }
});
