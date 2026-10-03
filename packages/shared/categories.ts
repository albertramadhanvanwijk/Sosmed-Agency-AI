/**
 * Definisi lima kategori konten.
 *
 * Ini bukan sekadar daftar label: setiap kategori membawa aturan yang mengikat
 * produksi (wajib sumber, wajib penanda waktu, boleh approve massal atau tidak)
 * dan kerangka slide yang dipakai agen Composer. Menambah kategori baru cukup
 * dengan menambah entri di sini — tidak ada logika kategori yang ditulis ulang
 * di tempat lain.
 */
import type { CategoryDefinition, CategoryKey } from './types.ts';

export const CATEGORIES: Record<CategoryKey, CategoryDefinition> = {
  edukasi_trading: {
    key: 'edukasi_trading',
    name: 'Edukasi Trading',
    description:
      'Mengajarkan satu konsep trading per carousel: definisi, contoh penerapan, kesalahan umum, dan checklist. Bersifat evergreen.',
    riskLevel: 'low',
    requiresSources: false,
    requiresAsOf: false,
    allowsBulkApprove: true,
    defaultFrequencyPerWeek: 2,
    slideRange: { min: 6, max: 10 },
    outline: [
      { role: 'hook', purpose: 'Satu janji jelas tentang konsep yang akan dibahas; buat pembaca merasa ini untuknya' },
      { role: 'body', purpose: 'Definisi konsep dengan bahasa sehari-hari, tanpa jargon yang tidak dijelaskan' },
      { role: 'example', purpose: 'Contoh konkret dengan angka sederhana yang bisa dibayangkan pembaca' },
      { role: 'body', purpose: 'Kesalahan umum yang dilakukan trader pada konsep ini dan kenapa itu merugikan' },
      { role: 'checklist', purpose: 'Daftar periksa yang bisa langsung diterapkan pembaca' },
      { role: 'recap', purpose: 'Ringkas tiga poin utama dalam satu slide' },
      { role: 'cta', purpose: 'Ajakan menyimpan carousel dan mengikuti akun' },
    ],
    preferredTemplates: ['hook-bold', 'concept-one-idea', 'checklist-numbered', 'recap-takeaway', 'cta-action'],
  },

  edukasi_propfirm: {
    key: 'edukasi_propfirm',
    name: 'Edukasi Propfirm',
    description:
      'Menjelaskan mekanisme program evaluasi propfirm: aturan drawdown, target profit, konsistensi, dan proses payout. Kategori dengan tingkat simpan tertinggi.',
    riskLevel: 'medium',
    requiresSources: true,
    requiresAsOf: false,
    allowsBulkApprove: true,
    defaultFrequencyPerWeek: 1,
    slideRange: { min: 6, max: 10 },
    outline: [
      { role: 'hook', purpose: 'Menyoroti aturan propfirm yang paling sering disalahpahami peserta' },
      { role: 'body', purpose: 'Menjelaskan aturan dasar dengan tabel perbandingan bila memungkinkan' },
      { role: 'example', purpose: 'Contoh perhitungan nyata dengan angka, misalnya batas drawdown pada saldo tertentu' },
      { role: 'body', purpose: 'Konsekuensi bila aturan dilanggar dan bagaimana program menanganinya' },
      { role: 'checklist', purpose: 'Daftar periksa sebelum mendaftar atau sebelum mengambil payout' },
      { role: 'recap', purpose: 'Ringkasan aturan dalam satu slide' },
      { role: 'cta', purpose: 'Ajakan menyimpan sebagai rujukan' },
    ],
    preferredTemplates: ['hook-bold', 'propfirm-rules-table', 'checklist-numbered', 'recap-takeaway', 'cta-action'],
  },

  jurnal_trading: {
    key: 'jurnal_trading',
    name: 'Jurnal Trading',
    description:
      'Catatan transparan atas satu posisi: hasil, statistik, apa yang berjalan, apa yang salah, dan pelajarannya. Kategori pembangun kepercayaan; template kerugian wajib ada dan jujur.',
    riskLevel: 'medium',
    requiresSources: false,
    requiresAsOf: true,
    allowsBulkApprove: true,
    defaultFrequencyPerWeek: 1,
    slideRange: { min: 6, max: 9 },
    outline: [
      { role: 'hook', purpose: 'Hasil posisi dalam satu kalimat jujur, tanpa melebih-lebihkan' },
      { role: 'example', purpose: 'Tangkapan layar atau ringkasan grafik dengan penanda masuk dan keluar' },
      { role: 'body', purpose: 'Statistik posisi: rasio risiko-imbalan, hasil dalam R, ukuran posisi' },
      { role: 'body', purpose: 'Analisis jujur: apa yang sudah sesuai rencana dan apa yang menyimpang' },
      { role: 'recap', purpose: 'Pelajaran utama yang bisa diambil pembaca' },
      { role: 'cta', purpose: 'Ajakan berdiskusi di komentar' },
      { role: 'disclaimer', purpose: 'Penegasan bahwa ini catatan pribadi, bukan rekomendasi' },
    ],
    preferredTemplates: ['hook-bold', 'journal-stat-tile', 'recap-takeaway', 'cta-action'],
  },

  market_info: {
    key: 'market_info',
    name: 'Market Info/News',
    description:
      'Membahas satu peristiwa pasar terkini: apa yang terjadi, mengapa penting, dan apa dampaknya. Konten cepat yang kehilangan nilai dalam hitungan jam sehingga punya jalur prioritas.',
    riskLevel: 'medium',
    requiresSources: true,
    requiresAsOf: true,
    allowsBulkApprove: false,
    defaultFrequencyPerWeek: 2,
    slideRange: { min: 5, max: 8 },
    outline: [
      { role: 'hook', purpose: 'Peristiwa utama dalam satu kalimat yang menjelaskan kenapa ini penting sekarang' },
      { role: 'body', purpose: 'Ringkasan faktual peristiwa dengan penanda waktu data' },
      { role: 'body', purpose: 'Mengapa ini penting bagi trader retail, tanpa berlebihan' },
      { role: 'body', purpose: 'Dampak yang mungkin terasa pada instrumen terkait' },
      { role: 'checklist', purpose: 'Hal yang perlu dipantau trader dalam waktu dekat' },
      { role: 'cta', purpose: 'Ajakan mengikuti untuk pembaruan' },
      { role: 'disclaimer', purpose: 'Penegasan ini laporan informasi, bukan rekomendasi' },
    ],
    preferredTemplates: ['hook-bold', 'news-why-it-matters', 'checklist-numbered', 'cta-action'],
  },

  market_outlook: {
    key: 'market_outlook',
    name: 'Market Outlook/Signal',
    description:
      'Analisis skenario: dua kemungkinan arah, tingkat invalidasi, dan manajemen risiko. Kategori paling berisiko sehingga selalu dibingkai sebagai skenario, bukan ajakan bertransaksi.',
    riskLevel: 'high',
    requiresSources: true,
    requiresAsOf: true,
    allowsBulkApprove: false,
    defaultFrequencyPerWeek: 1,
    slideRange: { min: 6, max: 9 },
    outline: [
      { role: 'hook', purpose: 'Satu pertanyaan atau kondisi pasar yang sedang menentukan arah' },
      { role: 'body', purpose: 'Konteks pasar saat ini dengan data dan penanda waktu' },
      { role: 'example', purpose: 'Skenario A: bila kondisi terpenuhi, area yang diperhatikan dan tingkat invalidasi' },
      { role: 'example', purpose: 'Skenario B: bila kondisi gagal, area alternatif dan tingkat invalidasi' },
      { role: 'body', purpose: 'Manajemen risiko: ukuran posisi dan titik di mana analisis ini salah' },
      { role: 'recap', purpose: 'Ringkasan kondisi yang membatalkan analisis' },
      { role: 'disclaimer', purpose: 'Disclaimer lengkap: analisis skenario, bukan ajakan bertransaksi' },
    ],
    preferredTemplates: ['hook-bold', 'scenario-outlook', 'recap-takeaway', 'cta-action'],
  },
};

/** Urutan tampilan kategori di antarmuka dan laporan. */
export const CATEGORY_ORDER: CategoryKey[] = [
  'edukasi_trading',
  'edukasi_propfirm',
  'jurnal_trading',
  'market_info',
  'market_outlook',
];

/** Mengambil definisi kategori, dengan galat jelas bila kuncinya salah. */
export function getCategory(key: string): CategoryDefinition {
  const found = CATEGORIES[key as CategoryKey];
  if (!found) {
    const valid = CATEGORY_ORDER.join(', ');
    throw new Error(`Kategori tidak dikenal: "${key}". Kategori yang tersedia: ${valid}`);
  }
  return found;
}

/** Benar bila kunci kategori dikenal. */
export function isCategoryKey(key: string): key is CategoryKey {
  return key in CATEGORIES;
}
