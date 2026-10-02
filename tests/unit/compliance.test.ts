/**
 * Uji mesin kepatuhan.
 *
 * Setiap kasus di sini mewakili kesalahan yang benar-benar terjadi di praktik
 * konten finansial. Uji ini dijalankan dengan `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CarouselSpec, Slide } from '../../packages/shared/types.ts';
import { checkCompliance, normalize } from '../../packages/compliance/engine.ts';

/** Membuat slide cepat untuk pengujian. */
function slide(partial: Partial<Slide> & { position: number; role: Slide['role'] }): Slide {
  return {
    headline: 'Judul contoh',
    body: null,
    bullets: [],
    emphasis: [],
    visual: { type: 'none' },
    sourceRefs: [],
    ...partial,
  };
}

/** Carousel minimal yang seharusnya lolos. */
function cleanCarousel(overrides: Partial<CarouselSpec> = {}): CarouselSpec {
  return {
    title: 'Uji',
    categoryKey: 'edukasi_trading',
    disclaimerKey: 'default_finansial',
    locale: 'id-ID',
    slides: [
      slide({ position: 1, role: 'hook', headline: 'Cara Membaca Batas Drawdown' }),
      slide({ position: 2, role: 'body', headline: 'Definisi', body: 'Penjelasan singkat konsep.' }),
      slide({ position: 3, role: 'checklist', headline: 'Periksa', bullets: ['Cek aturan', 'Hitung ulang'] }),
      slide({ position: 4, role: 'recap', headline: 'Ringkasan', bullets: ['Poin satu', 'Poin dua'] }),
      slide({ position: 5, role: 'disclaimer', headline: 'Catatan Penting' }),
    ],
    ...overrides,
  };
}

const CTX = {
  disclaimerText:
    'Materi ini bersifat edukasi dan bukan nasihat keuangan. Trading mengandung risiko kehilangan modal.',
};

// ---------------------------------------------------------------------------

test('normalize menangkap upaya penyamaran frasa terlarang', () => {
  assert.equal(normalize('PASTI   PROFIT'), 'pasti profit');
  assert.match(normalize('p.a.s.t.i profit'), /pasti profit/);
  assert.match(normalize('pasti\u200bprofit'), /pasti.{0,2}profit/);
  // Karakter lebar penuh harus menjadi ASCII.
  assert.match(normalize('ｐａｓｔｉ profit'), /pasti profit/);
});

test('carousel bersih lolos tanpa blokir', () => {
  const report = checkCompliance(cleanCarousel(), CTX);
  assert.equal(report.blocked, false, 'carousel bersih seharusnya tidak diblokir');
  assert.ok(['pass', 'warn'].includes(report.outcome));
});

test('disclaimer yang hilang memblokir carousel', () => {
  const spec = cleanCarousel();
  spec.slides = spec.slides.filter((s: Slide) => s.role !== 'disclaimer');
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L1.disclaimer_present' && f.result === 'fail'));
});

test('teks disclaimer yang tidak dapat diselesaikan memblokir carousel', () => {
  const report = checkCompliance(cleanCarousel(), { disclaimerText: '' });
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L1.disclaimer_text_resolvable'));
});

test('klaim profit pasti memblokir carousel', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Strategi ini dijamin profit setiap bulan',
    body: 'Sistem kami 100% profit dan menghasilkan profit tanpa rugi.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  const found = report.findings.filter((f) => f.ruleKey === 'L2.guaranteed_profit' && f.result === 'fail');
  assert.ok(found.length > 0, 'aturan klaim profit pasti harus terpicu');
  assert.ok(found[0]!.evidence, 'temuan harus memuat bukti kutipan');
});

test('frasa "tanpa kerugian" sebagai penjelasan mekanisme tidak diblokir', () => {
  // Kasus nyata dari produksi: menjelaskan trailing drawdown memang wajar
  // memakai frasa ini. Memblokirnya menghalangi edukasi yang sah.
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Mekanisme batas trailing',
    body: 'Jarak menuju batas kerugian dapat menyusut tanpa kerugian nyata.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, false, 'penjelasan mekanisme tidak boleh diblokir');
  assert.ok(
    report.findings.some((f) => f.ruleKey === 'L2.risk_free_compound' && f.result === 'warn'),
    'tetap harus muncul sebagai peringatan untuk ditinjau manusia',
  );
});

test('klaim hasil tanpa kerugian tetap diblokir', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Hasil sistem kami',
    body: 'Sistem ini menghasilkan profit tanpa rugi sepanjang tahun.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true, 'klaim hasil tanpa kerugian harus diblokir');
});

test('ajakan bertransaksi memblokir carousel', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Sinyal beli malam ini',
    body: 'Segera buy sekarang sebelum harga naik.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L2.trade_call_to_action' && f.result === 'fail'));
});

test('klaim lisensi tanpa dasar memblokir carousel', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Kami broker berlisensi Bappebti',
    body: 'Perusahaan kami diawasi OJK sepenuhnya.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L2.unfounded_licence'));
});

test('angka tanpa sumber bersifat memblokir pada kategori yang menuntut sumber', () => {
  const spec = cleanCarousel({ categoryKey: 'edukasi_propfirm' });
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Batas kerugian akun',
    body: 'Batas kerugian harian adalah 5% dan target profit 8%.',
  });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L3.numeric_needs_source' && f.result === 'fail'));
});

test('angka dengan rujukan sumber lolos', () => {
  const spec = cleanCarousel({ categoryKey: 'edukasi_propfirm' });
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Batas kerugian akun',
    body: 'Batas kerugian harian adalah 5%.',
    sourceRefs: ['f1'],
  });
  const report = checkCompliance(spec, CTX);
  const numeric = report.findings.filter((f) => f.ruleKey === 'L3.numeric_needs_source');
  assert.ok(numeric.every((f) => f.result !== 'fail'), 'angka bersumber tidak boleh diblokir');
});

test('angka pada slide cta dan disclaimer dikecualikan dari tuntutan sumber', () => {
  const spec = cleanCarousel({ categoryKey: 'edukasi_propfirm' });
  spec.slides[3] = slide({
    position: 4,
    role: 'cta',
    headline: 'Simpan carousel ini',
    body: 'Ada 3 aturan penting yang perlu diingat.',
  });
  const report = checkCompliance(spec, CTX);
  const numericFails = report.findings.filter((f) => f.ruleKey === 'L3.numeric_needs_source' && f.result === 'fail');
  assert.equal(numericFails.length, 0, 'slide cta tidak boleh dituntut sumber');
});

test('kategori berisiko tinggi memaksa mode ketat dan menuntut penanda waktu', () => {
  const spec = cleanCarousel({ categoryKey: 'market_outlook' });
  spec.slides[1] = slide({ position: 2, role: 'body', headline: 'Konteks pasar', body: 'Ringkasan kondisi.' });
  // tanpa asOf
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true, 'kategori outlook tanpa asOf harus diblokir');
  assert.ok(report.findings.some((f) => f.ruleKey === 'L1.requires_as_of'));
});

test('kategori berisiko tinggi menuntut kata penegas pada disclaimer', () => {
  const spec = cleanCarousel({ categoryKey: 'market_outlook' });
  spec.asOf = new Date().toISOString();
  const report = checkCompliance(spec, { disclaimerText: 'Ini materi biasa saja.' });
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L1.high_risk_disclaimer_wording'));
});

test('disclaimer outlook_signal yang benar meloloskan kategori berisiko tinggi', () => {
  const spec = cleanCarousel({ categoryKey: 'market_outlook' });
  spec.asOf = new Date().toISOString();
  const report = checkCompliance(spec, {
    disclaimerText:
      'Ini adalah analisis skenario, bukan ajakan bertransaksi. Selalu gunakan manajemen risiko Anda sendiri.',
  });
  assert.equal(
    report.blocked,
    false,
    `seharusnya lolos, temuan: ${report.findings.filter((f) => f.result === 'fail').map((f) => f.ruleKey).join(', ')}`,
  );
});

test('judul kosong memblokir carousel', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({ position: 2, role: 'body', headline: '   ', body: 'Ada isi.' });
  const report = checkCompliance(spec, CTX);
  assert.equal(report.blocked, true);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L1.no_empty_content'));
});

test('slide pertama yang bukan hook hanya memicu peringatan, bukan blokir', () => {
  const spec = cleanCarousel();
  spec.slides[0] = slide({ position: 1, role: 'body', headline: 'Langsung ke penjelasan' });
  const report = checkCompliance(spec, CTX);
  const finding = report.findings.find((f) => f.ruleKey === 'L1.first_slide_is_hook');
  assert.ok(finding, 'aturan hook harus diperiksa');
  assert.equal(finding!.severity, 'warn');
  assert.equal(report.blocked, false, 'peringatan saja tidak boleh memblokir');
});

test('klaim penghasilan pribadi memicu peringatan', () => {
  const spec = cleanCarousel();
  spec.slides[1] = slide({
    position: 2,
    role: 'body',
    headline: 'Catatan minggu ini',
    body: 'Saya menghasilkan Rp 50.000.000 bulan ini dari trading.',
  });
  const report = checkCompliance(spec, CTX);
  assert.ok(report.findings.some((f) => f.ruleKey === 'L2.testimonial_income' && f.result === 'warn'));
});

test('laporan kepatuhan memuat jumlah aturan yang diperiksa', () => {
  const report = checkCompliance(cleanCarousel(), CTX);
  assert.ok(report.findings.length > 5, 'harus ada banyak temuan (termasuk yang lolos)');
  assert.ok(report.summary.includes('aturan lolos'));
  assert.ok(report.checkedAt);
});

test('catatan biaya dan jejak tidak menyertakan data rahasia', () => {
  // Pengaman: laporan kepatuhan tidak boleh memuat teks kunci akses.
  const spec = cleanCarousel();
  const blob = JSON.stringify(checkCompliance(spec, CTX));
  assert.ok(!/sk-[a-z0-9]{10,}/i.test(blob), 'laporan tidak boleh memuat token akses');
});
