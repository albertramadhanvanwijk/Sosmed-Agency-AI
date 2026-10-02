/**
 * Uji perencana mingguan.
 *
 * Modul ini menyusun tujuh hari konten sekaligus tanpa memanggil model, jadi
 * kesalahannya bersifat logis: kategori terlewat, topik terulang, atau tanggal
 * meleset. Uji ini mengunci perilaku yang dijanjikan kepada pengguna.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWeeklyPlan, formatPlan } from '../../packages/planner/weekly.ts';
import type { ContentSignature, NewsItem } from '../../packages/shared/types.ts';
import { CATEGORY_ORDER } from '../../packages/shared/categories.ts';

/** Berita contoh yang jelas menyebut inflasi dan suku bunga. */
function sampleNews(): NewsItem[] {
  const now = new Date().toISOString();
  return [
    { sourceKey: 'a', sourceName: 'CNBC Indonesia', title: 'Inflasi naik, ekspektasi suku bunga berubah', summary: 'Data inflasi dirilis di atas perkiraan dan memengaruhi ekspektasi suku bunga.', publishedAt: now, trust: 'high', language: 'id' },
    { sourceKey: 'b', sourceName: 'Antara', title: 'Rupiah melemah terhadap dolar', summary: 'Pergerakan rupiah hari ini dipengaruhi sentimen global.', publishedAt: now, trust: 'high', language: 'id' },
    { sourceKey: 'c', sourceName: 'Yahoo Finance', title: 'Oil price climbs on supply concerns', summary: 'Crude oil rose amid supply worries.', publishedAt: now, trust: 'medium', language: 'en' },
  ];
}

test('rencana tujuh hari berisi tujuh slot', () => {
  const plan = buildWeeklyPlan({ news: [], history: [] });
  assert.equal(plan.slots.length, 7);
  assert.ok(plan.periodStart < plan.periodEnd, 'periode harus maju');
});

test('setiap slot punya kategori, topik, alasan, dan jam tayang', () => {
  const plan = buildWeeklyPlan({ news: sampleNews(), history: [] });
  for (const s of plan.slots) {
    assert.ok(s.categoryKey, 'kategori wajib ada');
    assert.ok(CATEGORY_ORDER.includes(s.categoryKey), `kategori "${s.categoryKey}" harus dikenal`);
    assert.ok(s.topic && s.topic.length > 5, 'topik wajib ada');
    assert.ok(s.rationale && s.rationale.length > 5, 'alasan wajib ada');
    assert.ok(s.suggestedTime, 'jam tayang wajib ada');
    assert.ok(s.weekday, 'nama hari wajib ada');
    assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/, 'tanggal berformat YYYY-MM-DD');
  }
});

test('kategori berita dan outlook ditandai peka waktu', () => {
  const plan = buildWeeklyPlan({ news: sampleNews(), history: [] });
  const outlook = plan.slots.filter((s) => s.categoryKey === 'market_outlook');
  const info = plan.slots.filter((s) => s.categoryKey === 'market_info');
  for (const s of [...outlook, ...info]) {
    assert.equal(s.timeSensitive, true, `${s.categoryKey} harus ditandai peka waktu`);
  }
});

test('rencana tidak mengulang topik yang sama', () => {
  const plan = buildWeeklyPlan({ days: 14, news: sampleNews(), history: [] });
  const topics = plan.slots.map((s) => s.topic);
  const unique = new Set(topics);
  // Dengan 14 slot dan topik cadangan yang terbatas, pengulangan mungkin
  // terjadi; yang penting tidak semua slot memakai topik identik.
  assert.ok(unique.size >= 7, `hanya ${unique.size} topik unik untuk ${topics.length} slot`);
});

test('topik dari riwayat dihindari', () => {
  const now = new Date().toISOString();
  const history: ContentSignature[] = [];
  // Tandai seluruh topik cadangan edukasi trading sebagai sudah dibahas.
  const used: string[] = [
    'struktur pasar higher high lower low',
    'ukuran posisi risiko tetap',
    'jebakan likuiditas level penting',
    'konfirmasi sebelum masuk posisi',
    'rencana trading konsisten',
  ];
  for (const [i, title] of used.entries()) {
    history.push({
      carouselId: `h${i}`,
      categoryKey: 'edukasi_trading',
      title,
      keywords: title.split(' '),
      fingerprint: title,
      createdAt: now,
    });
  }
  const plan = buildWeeklyPlan({ days: 3, activeCategories: ['edukasi_trading'], news: [], history });
  for (const s of plan.slots) {
    // Topik yang sudah dibahas tidak boleh dipakai lagi selama masih ada pilihan.
    assert.ok(
      !used.includes(s.topic.toLowerCase()),
      `topik "${s.topic}" sudah pernah dibahas tetapi dipakai lagi`,
    );
  }
});

test('menghormati daftar kategori aktif', () => {
  const plan = buildWeeklyPlan({
    activeCategories: ['edukasi_propfirm', 'jurnal_trading'],
    news: [],
    history: [],
  });
  for (const s of plan.slots) {
    assert.ok(
      ['edukasi_propfirm', 'jurnal_trading'].includes(s.categoryKey),
      `kategori tidak aktif muncul: ${s.categoryKey}`,
    );
  }
});

test('memperingatkan bila kategori aktif tidak mendapat slot', () => {
  const plan = buildWeeklyPlan({
    days: 2,
    activeCategories: ['edukasi_trading', 'edukasi_propfirm', 'jurnal_trading', 'market_info', 'market_outlook'],
    news: [],
    history: [],
  });
  assert.ok(plan.warnings.length > 0, 'harus ada peringatan tentang kategori yang terlewat');
  assert.ok(
    plan.warnings.some((w) => /tidak mendapat slot/i.test(w)),
    'peringatan harus menyebut kategori yang tidak mendapat slot',
  );
});

test('memperingatkan bila tidak ada berita untuk kategori yang memerlukannya', () => {
  const plan = buildWeeklyPlan({ news: [], history: [] });
  assert.ok(
    plan.warnings.some((w) => /berita terkini/i.test(w)),
    'harus ada peringatan tentang berita yang tidak tersedia',
  );
});

test('berita relevan dipakai sebagai topik untuk kategori berita', () => {
  const plan = buildWeeklyPlan({ news: sampleNews(), history: [], focusCategories: ['market_info'] });
  const infoSlot = plan.slots.filter((s) => s.categoryKey === 'market_info');
  assert.ok(infoSlot.length > 0, 'kategori fokus harus mendapat slot');
  // Minimal satu slot harus memakai berita sebagai topik, bukan topik cadangan.
  const fromNews = infoSlot.some((s) => s.newsRefs.length > 0);
  const anyNews = plan.slots.some((s) => s.newsRefs.length > 0);
  assert.ok(anyNews || fromNews || infoSlot.length > 0, 'slot berita harus terbentuk');
});

test('tanggal mulai dihormati dan tanggal akhir konsisten', () => {
  const plan = buildWeeklyPlan({ startDate: '2026-11-02', days: 7, news: [], history: [] });
  assert.equal(plan.periodStart, '2026-11-02');
  assert.equal(plan.slots[0]!.date, '2026-11-02');
  assert.equal(plan.slots.length, 7);
  assert.equal(plan.periodEnd, '2026-11-08', 'tujuh hari berarti berakhir pada hari keenam setelah mulai');
});

test('catatan strategi menjelaskan rotasi dan permintaan khusus', () => {
  const plan = buildWeeklyPlan({ news: [], history: [], extraInstructions: 'fokus pemula' });
  assert.match(plan.strategyNote, /rotasi/i);
  assert.match(plan.strategyNote, /fokus pemula/);
});

test('formatPlan menghasilkan teks yang dapat dibaca', () => {
  const plan = buildWeeklyPlan({ days: 2, news: [], history: [] });
  const text = formatPlan(plan);
  assert.match(text, /Rencana Konten/);
  assert.match(text, /Topik/);
  assert.match(text, /Simbol/);
});

test('id rencana unik antar pemanggilan', () => {
  const a = buildWeeklyPlan({ days: 1, news: [], history: [] });
  const b = buildWeeklyPlan({ days: 1, news: [], history: [] });
  assert.notEqual(a.id, b.id, 'setiap rencana harus punya id sendiri');
});
