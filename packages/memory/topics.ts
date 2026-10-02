/**
 * Memori topik: mencegah agen membahas hal yang sudah pernah dibahas.
 *
 * MENGAPA MODUL INI ADA
 * Sebelumnya tidak ada catatan apa yang pernah dibahas, sehingga agen dapat
 * membuat dua carousel tentang topik yang sama tanpa menyadarinya. Bagi
 * audiens itu terasa seperti kehabisan ide. Modul ini menyimpan sidik jari
 * setiap carousel, lalu memeriksa kesamaan sebelum produksi baru dimulai.
 *
 * CARA KERJA
 *  1. Setiap carousel yang selesai disimpan sidik jarinya: kata kunci penting
 *     dan sidik isi (fingerprint) dari judul, slide, dan caption.
 *  2. Sebelum produksi, topik baru diukur kesamaannya terhadap seluruh riwayat.
 *  3. Bila kesamaan tinggi, produksi diberi tahu topik-topik yang sudah dibahas
 *     agar memilih sudut yang berbeda — atau pengguna diberi peringatan.
 *
 * Pemeriksaan ini sengaja tidak memakai model: kesamaan harus dapat dihitung,
 * diuji, dan dijelaskan, bukan bergantung pada penilaian yang berubah-ubah.
 */
import type {
  CarouselSpec,
  ContentSignature,
  SimilarityHit,
} from '../shared/types.ts';

/** Kata yang terlalu umum untuk dijadikan penanda topik. */
const STOP_WORDS = new Set([
  'dan', 'atau', 'yang', 'untuk', 'pada', 'di', 'ke', 'dari', 'dengan', 'adalah', 'ini', 'itu',
  'tidak', 'bisa', 'akan', 'sudah', 'juga', 'dalam', 'oleh', 'agar', 'supaya', 'bila', 'jika',
  'saat', 'ketika', 'setelah', 'sebelum', 'lebih', 'paling', 'sangat', 'harus', 'wajib',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were',
  'cara', 'tips', 'panduan', 'kenapa', 'mengapa', 'apa', 'bagaimana',
]);

/**
 * Mengambil kata kunci penting dari sebuah teks.
 *
 * Aturan pemilihan: buang kata umum, buang kata yang sangat pendek, dan
 * dahulukan kata yang lebih panjang karena biasanya lebih spesifik
 * ("drawdown" lebih bermakna daripada "akun").
 */
export function extractKeywords(text: string, limit = 18): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  return [...counts.entries()]
    // Gabungkan frekuensi dengan panjang kata sebagai bobot kepentingan.
    .map(([word, count]) => ({ word, weight: count * (1 + word.length / 12) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((x) => x.word);
}

/**
 * Membuat sidik jari isi yang stabil untuk sebuah carousel.
 *
 * Bukan hash kriptografis: tujuannya membandingkan kemiripan, bukan memastikan
 * keunikan. Karena itu sidik jari berbentuk daftar kata kunci terurut yang
 * dapat dibandingkan secara langsung.
 */
export function fingerprintContent(parts: string[]): string {
  return extractKeywords(parts.join(' '), 24).sort().join('|');
}

/** Membuat sidik jari dari sebuah carousel yang sudah selesai. */
export function signatureFromSpec(
  carouselId: string,
  spec: CarouselSpec,
  captions: string[] = [],
): ContentSignature {
  const parts = [
    spec.title,
    ...spec.slides.map((s) => `${s.headline} ${s.body ?? ''} ${s.bullets.join(' ')}`),
    ...captions,
  ];
  return {
    carouselId,
    categoryKey: spec.categoryKey,
    title: spec.title,
    keywords: extractKeywords(parts.join(' ')),
    fingerprint: fingerprintContent(parts),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Menghitung kemiripan dua himpunan kata kunci.
 *
 * Memakai Jaccard terhadap kata kunci inti, ditambah bonus bila kategori sama.
 * Kategori diberi bobot karena dua carousel dalam kategori yang sama dengan
 * topik serupa jauh lebih terasa berulang bagi audiens yang sama, dibanding
 * topik serupa di kategori berbeda.
 */
export function similarity(
  a: ContentSignature,
  b: ContentSignature,
): { score: number; sharedKeywords: string[] } {
  const setA = new Set(a.keywords);
  const setB = new Set(b.keywords);
  const shared = [...setA].filter((k) => setB.has(k));

  const union = new Set([...setA, ...setB]);
  const jaccard = union.size === 0 ? 0 : shared.length / union.size;

  // Bonus bila sidik isi benar-benar sama.
  const fingerprintSame = a.fingerprint === b.fingerprint ? 0.35 : 0;

  // Bonus kategori sama: kesamaan 0.5 saja sudah mengkhawatirkan di kategori
  // yang sama, tetapi belum tentu masalah di kategori berbeda.
  const sameCategory = a.categoryKey === b.categoryKey ? 0.18 : 0;

  return {
    score: Math.min(1, jaccard * 1.25 + fingerprintSame + sameCategory),
    sharedKeywords: shared.sort(),
  };
}

/** Ambang yang dipakai untuk menentukan tingkat peringatan. */
export const SIMILARITY_THRESHOLD = {
  /** Di atas ini dianggap duplikat; produksi sebaiknya dibatalkan. */
  duplicate: 0.62,
  /** Di atas ini dianggap terlalu mirip; sebaiknya ganti sudut pandang. */
  tooSimilar: 0.42,
  /** Di atas ini hanya sebagai catatan. */
  note: 0.28,
} as const;

/** Tingkat peringatan hasil pemeriksaan. */
export type SimilarityLevel = 'duplicate' | 'too_similar' | 'note' | 'clear';

/** Menentukan tingkat peringatan dari skor tertinggi. */
export function similarityLevel(score: number): SimilarityLevel {
  if (score >= SIMILARITY_THRESHOLD.duplicate) return 'duplicate';
  if (score >= SIMILARITY_THRESHOLD.tooSimilar) return 'too_similar';
  if (score >= SIMILARITY_THRESHOLD.note) return 'note';
  return 'clear';
}

/**
 * Memeriksa sebuah topik baru terhadap seluruh riwayat.
 *
 * Mengembalikan kemiripan yang relevan, terurut dari yang paling mirip.
 */
export function checkSimilarity(
  candidate: { title: string; summary?: string; categoryKey: string },
  history: ContentSignature[],
  limit = 5,
): SimilarityHit[] {
  const candidateSignature: ContentSignature = {
    carouselId: 'candidate',
    categoryKey: candidate.categoryKey as ContentSignature['categoryKey'],
    title: candidate.title,
    keywords: extractKeywords(`${candidate.title} ${candidate.summary ?? ''}`),
    fingerprint: fingerprintContent([candidate.title, candidate.summary ?? '']),
    createdAt: new Date().toISOString(),
  };

  return history
    .map((h) => {
      const { score, sharedKeywords } = similarity(candidateSignature, h);
      return {
        carouselId: h.carouselId,
        title: h.title,
        categoryKey: h.categoryKey,
        createdAt: h.createdAt,
        score,
        sharedKeywords,
      };
    })
    .filter((h) => h.score >= SIMILARITY_THRESHOLD.note)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Menyusun ringkasan riwayat untuk dikirim ke agen Strategist.
 *
 * Agen perlu tahu apa yang SUDAH dibahas supaya dapat memilih sudut yang
 * berbeda secara sadar, bukan sekadar dilarang mengulang.
 */
export function historyBrief(history: ContentSignature[], limit = 25): string {
  if (history.length === 0) {
    return 'Belum ada konten sebelumnya. Ini produksi pertama, jadi semua sudut pandang masih terbuka.';
  }
  const recent = [...history]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

  const lines = recent.map((h, i) => {
    const keywords = h.keywords.slice(0, 6).join(', ');
    return `  ${i + 1}. [${h.categoryKey}] ${h.title}\n     kata kunci: ${keywords}`;
  });

  return [
    `KONTEN YANG SUDAH PERNAH DIBUAT (${recent.length} terakhir, jangan diulang):`,
    ...lines,
    '',
    'PENTING: pilih sudut pandang yang BELUM dibahas di daftar di atas. Bila topik yang',
    'diminta mirip dengan yang sudah ada, ajukan pendekatan yang berbeda — misalnya dari',
    'sisi kesalahan umum, studi kasus, atau perbandingan — bukan mengulang penjelasan dasar.',
  ].join('\n');
}
