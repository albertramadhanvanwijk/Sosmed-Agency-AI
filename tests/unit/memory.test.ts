/**
 * Uji memori: pembelajaran dari revisi dan pencegahan pengulangan topik.
 *
 * Dua modul ini adalah yang membuat agen "menjadi lebih pintar", dan keduanya
 * mudah salah tanpa terlihat. Uji ini mengunci perilaku yang dijanjikan:
 * catatan revisi berulang menjadi aturan, dan topik yang mirip terdeteksi
 * sebelum biaya produksi dikeluarkan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  boostConfidence,
  groupRevisions,
  inferRulesFromRevisions,
  mergeRules,
  memorySummary,
  ruleKey,
  rulesToPrompt,
  selectRules,
  type RevisionRecord,
} from '../../packages/memory/rules.ts';
import {
  checkSimilarity,
  extractKeywords,
  fingerprintContent,
  historyBrief,
  signatureFromSpec,
  similarity,
  similarityLevel,
  SIMILARITY_THRESHOLD,
} from '../../packages/memory/topics.ts';
import type { CarouselSpec, ContentSignature, LearnedRule } from '../../packages/shared/types.ts';

// ---------------------------------------------------------------------------
// Aturan pembelajaran
// ---------------------------------------------------------------------------

test('ruleKey menormalkan aturan agar yang sama tidak menumpuk', () => {
  const a = ruleKey('Sertakan selalu contoh perhitungan dengan angka');
  const b = ruleKey('sertakan contoh perhitungan dengan angka');
  assert.equal(a, b, 'dua penulisan berbeda harus menghasilkan kunci yang sama');
});

test('boostConfidence naik cepat di awal lalu melandai', () => {
  const one = boostConfidence(0, 1);
  const two = boostConfidence(0, 2);
  const ten = boostConfidence(0, 10);
  assert.ok(one > 0.3, 'sekali muncul sudah cukup dipercaya');
  assert.ok(two > one, 'dua kali lebih dipercaya dari sekali');
  assert.ok(ten > two, 'sepuluh kali lebih dipercaya dari dua kali');
  assert.ok(ten <= 0.98, 'tidak pernah mencapai keyakinan mutlak');

  // Kenaikan dibandingkan pada LANGKAH yang sama besar. Membandingkan
  // langkah 1→2 dengan 2→10 tidak bermakna karena kurva eksponensial memang
  // memberi kenaikan lebih besar pada selisih yang lebih jauh.
  const stepEarly = boostConfidence(0, 2) - boostConfidence(0, 1);
  const stepLate = boostConfidence(0, 10) - boostConfidence(0, 9);
  assert.ok(
    stepEarly > stepLate,
    `kenaikan harus melandai: langkah awal ${stepEarly.toFixed(3)} vs langkah akhir ${stepLate.toFixed(3)}`,
  );
});

test('mergeRules menambah aturan baru dari catatan revisi', () => {
  const merged = mergeRules([], [
    {
      categoryKey: 'edukasi_propfirm',
      rule: 'Perbaiki hal berikut: slide terlalu panjang',
      rationale: 'Catatan revisi.',
      evidenceCount: 1,
    },
  ]);
  assert.equal(merged.added.length, 1);
  assert.equal(merged.updated.length, 0);
  assert.equal(merged.rules.length, 1);
  assert.equal(merged.rules[0]!.active, true);
  assert.ok(merged.rules[0]!.confidence > 0, 'aturan baru harus punya kepercayaan');
});

test('mergeRules memperkuat aturan yang sudah ada, bukan menggandakannya', () => {
  const first = mergeRules([], [
    { categoryKey: null, rule: 'Selalu sertakan contoh angka', rationale: 'a', evidenceCount: 1 },
  ]);
  const before = first.rules[0]!.confidence;
  const second = mergeRules(first.rules, [
    { categoryKey: null, rule: 'selalu sertakan contoh angka', rationale: 'b', evidenceCount: 2 },
  ]);
  assert.equal(second.rules.length, 1, 'aturan serupa tidak boleh menjadi dua baris');
  assert.equal(second.added.length, 0);
  assert.equal(second.updated.length, 1);
  assert.ok(second.rules[0]!.confidence >= before, 'kepercayaan tidak boleh turun');
  assert.equal(second.rules[0]!.occurrences, 3, 'kemunculan diakumulasi');
});

test('selectRules mendahulukan aturan kategori yang sama pada keyakinan setara', () => {
  const now = new Date().toISOString();
  const mk = (id: string, cat: LearnedRule['categoryKey'], conf: number): LearnedRule => ({
    id, categoryKey: cat, rule: `Aturan ${id}`, rationale: '', occurrences: 1,
    confidence: conf, createdBy: 'human', createdAt: now, lastSeenAt: now, active: true,
  });
  // Keyakinan setara: di sinilah keunggulan aturan kategori terlihat.
  const rules = [
    mk('umum', null, 0.6),
    mk('spesifik', 'edukasi_propfirm', 0.6),
  ];
  const selected = selectRules(rules, 'edukasi_propfirm');
  assert.equal(selected[0]!.id, 'spesifik', 'aturan kategori yang sama lebih relevan');
});

test('aturan umum dengan keyakinan jauh lebih tinggi tetap dapat didahulukan', () => {
  // Keunggulan aturan kategori BUKAN hak mutlak. Aturan umum yang sudah
  // terbukti berkali-kali tetap layak didahulukan — inilah yang mencegah satu
  // catatan kategori menutupi pelajaran yang berlaku luas.
  const now = new Date().toISOString();
  const rules: LearnedRule[] = [
    { id: 'umum-kuat', categoryKey: null, rule: 'a', rationale: '', occurrences: 10, confidence: 0.95, createdBy: 'human', createdAt: now, lastSeenAt: now, active: true },
    { id: 'spesifik-lemah', categoryKey: 'edukasi_propfirm', rule: 'b', rationale: '', occurrences: 1, confidence: 0.36, createdBy: 'agent', createdAt: now, lastSeenAt: now, active: true },
  ];
  const selected = selectRules(rules, 'edukasi_propfirm');
  assert.equal(selected[0]!.id, 'umum-kuat', 'aturan umum yang jauh lebih kuat didahulukan');
});

test('selectRules mengabaikan aturan nonaktif dan keyakinan rendah', () => {
  const now = new Date().toISOString();
  const rules: LearnedRule[] = [
    { id: 'a', categoryKey: null, rule: 'Nonaktif', rationale: '', occurrences: 5, confidence: 0.95, createdBy: 'human', createdAt: now, lastSeenAt: now, active: false },
    { id: 'b', categoryKey: null, rule: 'Lemah', rationale: '', occurrences: 1, confidence: 0.05, createdBy: 'agent', createdAt: now, lastSeenAt: now, active: true },
    { id: 'c', categoryKey: null, rule: 'Kuat', rationale: '', occurrences: 3, confidence: 0.8, createdBy: 'human', createdAt: now, lastSeenAt: now, active: true },
  ];
  const selected = selectRules(rules, 'edukasi_trading');
  assert.equal(selected.length, 1);
  assert.equal(selected[0]!.id, 'c');
});

test('rulesToPrompt menyebut jumlah kemunculan untuk aturan berulang', () => {
  const now = new Date().toISOString();
  const rules: LearnedRule[] = [
    { id: 'a', categoryKey: null, rule: 'Pecah slide yang terlalu panjang', rationale: '', occurrences: 3, confidence: 0.9, createdBy: 'human', createdAt: now, lastSeenAt: now, active: true },
  ];
  const text = rulesToPrompt(rules);
  assert.match(text, /PELAJARAN DARI REVISI/);
  assert.match(text, /muncul 3×/);
});

test('rulesToPrompt mengembalikan teks kosong bila tidak ada aturan', () => {
  assert.equal(rulesToPrompt([]), '');
});

test('groupRevisions mengelompokkan catatan yang serupa', () => {
  const records: RevisionRecord[] = [
    { carouselId: '1', categoryKey: 'edukasi_trading', title: 'A', note: 'Slide terlalu panjang', decision: 'changes_requested', createdAt: new Date().toISOString() },
    { carouselId: '2', categoryKey: 'edukasi_trading', title: 'B', note: 'slide terlalu panjang', decision: 'changes_requested', createdAt: new Date().toISOString() },
    { carouselId: '3', categoryKey: 'market_info', title: 'C', note: 'Tambahkan sumber berita', decision: 'rejected', createdAt: new Date().toISOString() },
  ];
  const groups = groupRevisions(records);
  assert.equal(groups.length, 2, 'catatan serupa harus menjadi satu kelompok');
  assert.equal(groups[0]!.records.length, 2, 'kelompok terbesar lebih dulu');
});

test('inferRulesFromRevisions menyimpulkan aturan dari catatan berulang', () => {
  const records: RevisionRecord[] = [
    { carouselId: '1', categoryKey: 'edukasi_trading', title: 'A', note: 'Judul terlalu panjang dan berbelit', decision: 'changes_requested', createdAt: new Date().toISOString() },
    { carouselId: '2', categoryKey: 'edukasi_trading', title: 'B', note: 'Judul terlalu panjang dan berbelit', decision: 'changes_requested', createdAt: new Date().toISOString() },
  ];
  const proposed = inferRulesFromRevisions(records);
  assert.ok(proposed.length >= 1, 'harus ada aturan yang diusulkan');
  assert.equal(proposed[0]!.evidenceCount, 2, 'dukungan tercatat');
});

test('inferRulesFromRevisions menandai aturan sebagai umum bila lintas kategori', () => {
  const now = new Date().toISOString();
  const records: RevisionRecord[] = [
    { carouselId: '1', categoryKey: 'edukasi_trading', title: 'A', note: 'kurang contoh nyata', decision: 'changes_requested', createdAt: now },
    { carouselId: '2', categoryKey: 'market_info', title: 'B', note: 'kurang contoh nyata', decision: 'changes_requested', createdAt: now },
    { carouselId: '3', categoryKey: 'jurnal_trading', title: 'C', note: 'kurang contoh nyata', decision: 'changes_requested', createdAt: now },
  ];
  const proposed = inferRulesFromRevisions(records);
  assert.equal(proposed[0]!.categoryKey, null, 'muncul di tiga kategori berarti berlaku umum');
});

test('memorySummary merangkum kondisi memori', () => {
  const now = new Date().toISOString();
  const rules: LearnedRule[] = [
    { id: 'a', categoryKey: 'edukasi_trading', rule: 'x', rationale: '', occurrences: 1, confidence: 0.9, createdBy: 'human', createdAt: now, lastSeenAt: now, active: true },
    { id: 'b', categoryKey: null, rule: 'y', rationale: '', occurrences: 1, confidence: 0.4, createdBy: 'agent', createdAt: now, lastSeenAt: now, active: true },
    { id: 'c', categoryKey: null, rule: 'z', rationale: '', occurrences: 1, confidence: 0.5, createdBy: 'agent', createdAt: now, lastSeenAt: now, active: false },
  ];
  const s = memorySummary(rules);
  assert.equal(s.total, 3);
  assert.equal(s.active, 2);
  assert.equal(s.strong, 1);
  assert.equal(s.byCategory['edukasi_trading'], 1);
  assert.equal(s.byCategory['umum'], 1);
});

// ---------------------------------------------------------------------------
// Deteksi topik berulang
// ---------------------------------------------------------------------------

test('extractKeywords membuang kata umum dan mengutamakan kata spesifik', () => {
  const words = extractKeywords('Cara membaca struktur pasar dengan higher high dan lower low untuk trader');
  assert.ok(!words.includes('cara'), 'kata umum dibuang');
  assert.ok(!words.includes('untuk'), 'kata umum dibuang');
  assert.ok(words.includes('higher'), 'kata spesifik dipertahankan');
  assert.ok(words.includes('struktur'), 'kata spesifik dipertahankan');
});

test('fingerprintContent stabil untuk isi yang sama', () => {
  const a = fingerprintContent(['Cara membaca drawdown', 'Batas kerugian tetap']);
  const b = fingerprintContent(['Cara membaca drawdown', 'Batas kerugian tetap']);
  assert.equal(a, b, 'isi yang sama harus menghasilkan sidik jari yang sama');
});

test('similarity menilai dua carousel sejenis sebagai mirip', () => {
  const now = new Date().toISOString();
  const a: ContentSignature = {
    carouselId: '1', categoryKey: 'edukasi_propfirm', title: 'Static dan trailing drawdown',
    keywords: ['static', 'trailing', 'drawdown', 'batas', 'ekuitas'], fingerprint: 'x', createdAt: now,
  };
  const b: ContentSignature = {
    carouselId: '2', categoryKey: 'edukasi_propfirm', title: 'Perbedaan static vs trailing drawdown',
    keywords: ['static', 'trailing', 'drawdown', 'batas', 'ekuitas'], fingerprint: 'x', createdAt: now,
  };
  const { score, sharedKeywords } = similarity(a, b);
  assert.ok(score > SIMILARITY_THRESHOLD.tooSimilar, `skor ${score} seharusnya tinggi`);
  assert.ok(sharedKeywords.length >= 4);
});

test('similarity menilai dua carousel berbeda sebagai tidak mirip', () => {
  const now = new Date().toISOString();
  const a: ContentSignature = {
    carouselId: '1', categoryKey: 'edukasi_trading', title: 'Struktur pasar',
    keywords: ['struktur', 'pasar', 'puncak', 'dasar'], fingerprint: 'a', createdAt: now,
  };
  const b: ContentSignature = {
    carouselId: '2', categoryKey: 'market_info', title: 'Data inflasi',
    keywords: ['inflasi', 'suku', 'bunga', 'dolar'], fingerprint: 'b', createdAt: now,
  };
  const { score } = similarity(a, b);
  assert.ok(score < SIMILARITY_THRESHOLD.note, `skor ${score} seharusnya rendah`);
});

test('similarityLevel memetakan skor ke tingkat peringatan', () => {
  assert.equal(similarityLevel(0.9), 'duplicate');
  assert.equal(similarityLevel(0.5), 'too_similar');
  assert.equal(similarityLevel(0.3), 'note');
  assert.equal(similarityLevel(0.05), 'clear');
});

test('checkSimilarity menemukan riwayat yang bertumbukan', () => {
  const now = new Date().toISOString();
  const history: ContentSignature[] = [
    { carouselId: '1', categoryKey: 'edukasi_propfirm', title: 'Static vs trailing drawdown', keywords: ['static', 'trailing', 'drawdown', 'batas'], fingerprint: 'x', createdAt: now },
    { carouselId: '2', categoryKey: 'market_info', title: 'Berita inflasi', keywords: ['inflasi', 'dolar'], fingerprint: 'y', createdAt: now },
  ];
  const hits = checkSimilarity(
    { title: 'Perbedaan static dan trailing drawdown', categoryKey: 'edukasi_propfirm' },
    history,
  );
  assert.ok(hits.length >= 1, 'harus menemukan kemiripan');
  assert.equal(hits[0]!.carouselId, '1', 'yang paling mirip lebih dulu');
});

test('checkSimilarity mengembalikan kosong untuk topik yang benar-benar baru', () => {
  const now = new Date().toISOString();
  const history: ContentSignature[] = [
    { carouselId: '1', categoryKey: 'edukasi_trading', title: 'Struktur pasar', keywords: ['struktur', 'pasar'], fingerprint: 'a', createdAt: now },
  ];
  const hits = checkSimilarity(
    { title: 'Cara menghitung pajak kripto di Indonesia', categoryKey: 'market_info' },
    history,
  );
  assert.equal(hits.length, 0, 'topik baru tidak boleh dianggap duplikat');
});

test('signatureFromSpec membuat sidik jari dari seluruh isi carousel', () => {
  const spec: CarouselSpec = {
    title: 'Static vs Trailing Drawdown',
    categoryKey: 'edukasi_propfirm',
    disclaimerKey: 'default_finansial',
    locale: 'id-ID',
    slides: [
      { position: 1, role: 'hook', headline: 'Static vs Trailing Drawdown', body: 'Dua istilah berbeda', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
      { position: 2, role: 'disclaimer', headline: 'Catatan', body: 'Bukan nasihat keuangan', bullets: [], emphasis: [], visual: { type: 'none' }, sourceRefs: [] },
    ],
  };
  const sig = signatureFromSpec('test', spec);
  assert.equal(sig.carouselId, 'test');
  assert.ok(sig.keywords.includes('drawdown'), 'kata kunci penting terambil');
  assert.ok(sig.fingerprint.length > 0);
});

test('historyBrief memberi tahu agen bahwa tidak ada riwayat', () => {
  const text = historyBrief([]);
  assert.match(text, /belum ada konten/i);
});

test('historyBrief mencantumkan topik yang sudah dibahas', () => {
  const now = new Date().toISOString();
  const history: ContentSignature[] = [
    { carouselId: '1', categoryKey: 'edukasi_trading', title: 'Membaca struktur pasar', keywords: ['struktur', 'pasar', 'puncak'], fingerprint: 'x', createdAt: now },
  ];
  const text = historyBrief(history);
  assert.match(text, /jangan diulang/i);
  assert.match(text, /Membaca struktur pasar/);
});
