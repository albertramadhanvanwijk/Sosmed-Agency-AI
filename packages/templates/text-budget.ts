/**
 * Anggaran teks per peran slide dan per profil rasio.
 *
 * MENGAPA MODUL INI ADA
 *
 * Ukuran font pada template ditulis dalam satuan yang menyesuaikan LEBAR
 * kanvas (misalnya `6.6vw`). Lebar semua profil kita sama, yaitu 1080px, tetapi
 * TINGGINYA berbeda: 1350px pada Instagram Portrait dan 1080px pada Square.
 * Akibatnya, ukuran font tidak mengecil saat kanvas menjadi lebih pendek,
 * sehingga slide yang muat pada 4:5 bisa meluap pada 1:1.
 *
 * Sebelumnya hal ini baru ketahuan saat render berjalan, dan karena render
 * menolak memotong teks, SELURUH carousel gagal setelah puluhan panggilan model
 * terlanjur dibayar. Karena itu batas teks dihitung lebih awal di sini.
 *
 * Angka pada tabel diturunkan dari pengukuran render nyata, bukan tebakan.
 * Bila ukuran font pada template diubah, jalankan `npm run render:check` lalu
 * `npm run check:budget` untuk memastikan anggaran masih wajar.
 */
import type { RatioProfile, SlideRole } from '../shared/types.ts';

/** Kunci anggaran: peran slide yang punya tata letak berbeda. */
export type BudgetKey = SlideRole;

/** Batas teks untuk satu peran slide. */
export interface TextBudget {
  /** Jumlah kata maksimum untuk ISI slide. */
  bodyWords: number;
  /** Jumlah karakter maksimum untuk ISI slide. */
  bodyChars: number;
  /** Jumlah kata maksimum untuk JUDUL. */
  headlineWords: number;
  /** Jumlah karakter maksimum untuk JUDUL. */
  headlineChars: number;
  /** Jumlah poin maksimum. */
  bullets: number;
  /** Panjang maksimum setiap poin, dalam karakter. */
  bulletChars: number;
}

type BudgetTable = Record<BudgetKey, Record<RatioProfile, TextBudget>>;

/** Membuat tabel anggaran untuk semua peran pada satu profil. */
function forProfile(spec: {
  bodyChars: number;
  headlineChars: number;
  bullets: number;
  bulletChars: number;
}): Record<RatioProfile, TextBudget> {
  const mk = (scale = 1): TextBudget => ({
    bodyWords: Math.round((spec.bodyChars / 6) * scale),
    bodyChars: Math.round(spec.bodyChars * scale),
    headlineWords: Math.round((spec.headlineChars / 6) * scale),
    headlineChars: Math.round(spec.headlineChars * scale),
    bullets: spec.bullets,
    bulletChars: Math.round(spec.bulletChars * scale),
  });
  return {
    // Acuan desain: ukuran font dirancang untuk kanvas ini.
    ig_portrait: mk(1),
    // Kanvas 1:1 lebih pendek, tetapi karena render memperkecil ruang tata
    // letak agar selalu setinggi acuan (lihat layoutScale), kapasitas teksnya
    // TIDAK BERKURANG. Nilai 1 di sini adalah hasil pengukuran, bukan asumsi.
    square: mk(1),
    // 1920 lebih tinggi dari acuan 1350. Kelebihan tinggi menjadi ruang
    // tambahan setelah area aman 12% atas dan 18% bawah diperhitungkan;
    // sekitar 1.25x tinggi efektif acuan.
    story: mk(1.25),
    // Kanvas identik dengan acuan.
    linkedin_pdf: mk(1),
    // Lebih tinggi dari acuan 1000x1500, sehingga ada ruang tambahan.
    pinterest: mk(1.1),
  };
}

/**
 * Tabel anggaran teks.
 *
 * Angka acuan (profil ig_portrait) diambil dari batas template yang sudah
 * terbukti menghasilkan render bersih selama pengujian.
 */
export const TEXT_BUDGETS: BudgetTable = {
  hook: forProfile({ bodyChars: 150, headlineChars: 68, bullets: 0, bulletChars: 0 }),
  body: forProfile({ bodyChars: 380, headlineChars: 56, bullets: 4, bulletChars: 90 }),
  example: forProfile({ bodyChars: 300, headlineChars: 58, bullets: 3, bulletChars: 80 }),
  checklist: forProfile({ bodyChars: 200, headlineChars: 52, bullets: 6, bulletChars: 76 }),
  recap: forProfile({ bodyChars: 200, headlineChars: 48, bullets: 4, bulletChars: 70 }),
  cta: forProfile({ bodyChars: 200, headlineChars: 48, bullets: 4, bulletChars: 70 }),
  // Isi slide disclaimer tidak ditulis model (diisi dari brand kit), sehingga
  // anggarannya hanya perlu menampung teks disclaimer terpanjang.
  disclaimer: forProfile({ bodyChars: 700, headlineChars: 60, bullets: 0, bulletChars: 0 }),
};

/** Mengambil anggaran untuk satu peran dan satu profil. */
export function budgetFor(role: BudgetKey, ratio: RatioProfile): TextBudget {
  const perRole = TEXT_BUDGETS[role];
  if (!perRole) {
    throw new Error(`Peran slide tidak dikenal untuk anggaran teks: ${role}`);
  }
  const budget = perRole[ratio];
  if (!budget) {
    throw new Error(`Profil rasio tidak dikenal untuk anggaran teks: ${ratio}`);
  }
  return budget;
}

/** Hasil pemeriksaan kesesuaian teks terhadap anggaran. */
export interface BudgetCheckResult {
  fits: boolean;
  violations: {
    field: 'headline' | 'body' | 'bullets';
    /** Nilai aktual. */
    actual: number;
    /** Batas yang berlaku. */
    limit: number;
    /** Berapa lebihnya. */
    overBy: number;
  }[];
}

/**
 * Bentuk abstrak teks sebuah slide, diukur dalam UKURAN bukan isi.
 *
 * Memakai ukuran membuat pemeriksaan ini dapat dipakai dua cara sekaligus:
 *  - menguji slide nyata hasil produksi, dan
 *  - menguji perkiraan kasus terburuk tanpa perlu menulis teksnya.
 */
export interface SlideTextShape {
  headlineChars: number;
  headlineWords: number;
  bodyChars: number;
  bodyWords: number;
  bullets: number;
  /** Panjang poin terpanjang, dalam karakter. */
  longestBulletChars: number;
}

/** Menghitung jumlah kata. */
function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Mengukur slide nyata menjadi bentuk abstrak. */
export function shapeFromSlide(slide: {
  headline: string;
  body: string | null;
  bullets: string[];
}): SlideTextShape {
  const headline = slide.headline ?? '';
  const body = slide.body ?? '';
  return {
    headlineChars: headline.length,
    headlineWords: words(headline),
    bodyChars: body.length,
    bodyWords: words(body),
    bullets: slide.bullets.length,
    longestBulletChars: slide.bullets.reduce((max, b) => Math.max(max, b.length), 0),
  };
}

/** Membuat perkiraan dari batas maksimum yang diizinkan template. */
export function shapeFromLimits(limits: {
  headlineChars: number;
  bodyChars: number;
  bullets: number;
  bulletChars: number;
}): SlideTextShape {
  return {
    headlineChars: limits.headlineChars,
    // Perkiraan 6 karakter per kata, sesuai rata-rata bahasa Indonesia.
    headlineWords: Math.round(limits.headlineChars / 6),
    bodyChars: limits.bodyChars,
    bodyWords: Math.round(limits.bodyChars / 6),
    bullets: limits.bullets,
    longestBulletChars: limits.bulletChars,
  };
}

/**
 * Memeriksa apakah teks sebuah slide muat dalam anggaran profil tertentu.
 *
 * Yang diperiksa: panjang judul, panjang isi, jumlah poin, dan panjang poin
 * terpanjang.
 */
export function fitsWithin(shape: SlideTextShape, budget: TextBudget): BudgetCheckResult {
  const violations: BudgetCheckResult['violations'] = [];

  if (shape.headlineChars > budget.headlineChars) {
    violations.push({
      field: 'headline',
      actual: shape.headlineChars,
      limit: budget.headlineChars,
      overBy: shape.headlineChars - budget.headlineChars,
    });
  }
  if (shape.bodyChars > budget.bodyChars) {
    violations.push({
      field: 'body',
      actual: shape.bodyChars,
      limit: budget.bodyChars,
      overBy: shape.bodyChars - budget.bodyChars,
    });
  }
  if (shape.bullets > budget.bullets) {
    violations.push({
      field: 'bullets',
      actual: shape.bullets,
      limit: budget.bullets,
      overBy: shape.bullets - budget.bullets,
    });
  }
  if (budget.bullets > 0 && shape.longestBulletChars > budget.bulletChars) {
    violations.push({
      field: 'bullets',
      actual: shape.longestBulletChars,
      limit: budget.bulletChars,
      overBy: shape.longestBulletChars - budget.bulletChars,
    });
  }

  return { fits: violations.length === 0, violations };
}

/**
 * Menghasilkan ringkasan anggaran untuk dikirim ke model bahasa.
 *
 * Dikirim sebagai teks karena model mematuhi angka konkret jauh lebih baik
 * daripada instruksi kiasan seperti "jangan terlalu panjang".
 */
export function budgetsToPrompt(
  roles: { role: BudgetKey; templateSlug: string }[],
  ratio: RatioProfile,
): string {
  return roles
    .map(({ role, templateSlug }) => {
      const b = budgetFor(role, ratio);
      const parts = [
        `judul maksimal ${b.headlineChars} karakter (${b.headlineWords} kata)`,
      ];
      if (b.bodyChars > 0) {
        parts.push(`isi maksimal ${b.bodyChars} karakter (${b.bodyWords} kata)`);
      }
      if (b.bullets > 0) {
        parts.push(`maksimal ${b.bullets} poin, tiap poin maksimal ${b.bulletChars} karakter`);
      } else {
        parts.push('tanpa poin');
      }
      return `  - ${templateSlug} (peran ${role}): ${parts.join('; ')}`;
    })
    .join('\n');
}

/** Anggaran untuk peran slide yang diisi otomatis, bukan oleh model. */
export const AUTO_FILLED_ROLES: BudgetKey[] = ['disclaimer'];

// ---------------------------------------------------------------------------
// Batas untuk slide yang memuat visual
// ---------------------------------------------------------------------------

/**
 * Batas tambahan untuk slide yang memuat visual, bukan hanya teks.
 *
 * MENGAPA INI PERLU
 * Anggaran teks biasa mengukur karakter teks saja. Tetapi sebuah TABEL dan
 * KARTU ANGKA juga memakan ruang vertikal. Saat pengujian, satu slide dengan
 * tabel 4 baris DITAMBAH teks panjang meluap 290 piksel — dan karena render
 * menolak memotong teks, seluruh carousel gagal setelah puluhan panggilan model
 * terlanjur dibayar.
 *
 * Karena itu slide yang memuat visual mendapat anggaran teks yang lebih ketat,
 * dan model diberi tahu batasnya secara konkret.
 */
export interface VisualConstraint {
  type: 'table' | 'stat_tile' | 'chart_snapshot' | 'abstract_bg' | 'none';
  /** Jumlah baris maksimum untuk tabel. */
  maxRows: number;
  /** Jumlah kolom maksimum untuk tabel. */
  maxColumns: number;
  /** Jumlah kartu maksimum untuk kartu angka. */
  maxCards: number;
  /** Panjang maksimum setiap sel tabel, dalam karakter. */
  maxCellChars: number;
  /** Panjang maksimum keterangan pada kartu angka. */
  maxNoteChars: number;
  /**
   * Faktor pengurangan anggaran teks ketika slide memuat visual ini.
   * Nilai 1 berarti tidak memakan ruang tambahan.
   */
  textBudgetFactor: number;
}

/** Batas visual per jenis. Angka diturunkan dari pengukuran render nyata. */
export const VISUAL_CONSTRAINTS: Record<VisualConstraint['type'], VisualConstraint> = {
  none: { type: 'none', maxRows: 0, maxColumns: 0, maxCards: 0, maxCellChars: 0, maxNoteChars: 0, textBudgetFactor: 1 },
  abstract_bg: { type: 'abstract_bg', maxRows: 0, maxColumns: 0, maxCards: 0, maxCellChars: 0, maxNoteChars: 0, textBudgetFactor: 1 },
  table: { type: 'table', maxRows: 3, maxColumns: 3, maxCards: 0, maxCellChars: 26, maxNoteChars: 0, textBudgetFactor: 0.5 },
  stat_tile: { type: 'stat_tile', maxRows: 0, maxColumns: 0, maxCards: 4, maxCellChars: 0, maxNoteChars: 22, textBudgetFactor: 0.6 },
  // Tangkapan grafik memakai ruang paling besar, tetapi teksnya tetap perlu
  // ruang, jadi faktor ini tidak serendah terlihat.
  chart_snapshot: { type: 'chart_snapshot', maxRows: 0, maxColumns: 0, maxCards: 0, maxCellChars: 0, maxNoteChars: 0, textBudgetFactor: 0.45 },
};

/** Mengambil batas visual untuk sebuah jenis. */
export function visualConstraintFor(type: string | undefined): VisualConstraint {
  const key = (type ?? 'none') as VisualConstraint['type'];
  return VISUAL_CONSTRAINTS[key] ?? VISUAL_CONSTRAINTS.none;
}

/**
 * Menyesuaikan anggaran teks sebuah slide berdasarkan visual yang dipakainya.
 *
 * Slide dengan tabel hanya diberi separuh jatah teks, karena tabelnya sendiri
 * memakan ruang. Ini jauh lebih baik daripada membiarkan model menulis penuh
 * lalu render menolak — dan seluruh produksi gagal.
 */
export function adjustBudgetForVisual(budget: TextBudget, visualType: string | undefined): TextBudget {
  const c = visualConstraintFor(visualType);
  if (c.textBudgetFactor >= 1) return budget;
  return {
    ...budget,
    bodyChars: Math.round(budget.bodyChars * c.textBudgetFactor),
    bodyWords: Math.round(budget.bodyWords * c.textBudgetFactor),
  };
}

/**
 * Ringkasan batas visual untuk dikirim ke model bahasa.
 *
 * Ditulis sebagai batas konkret, karena model mematuhi angka jauh lebih baik
 * daripada instruksi kiasan seperti "buat tabel yang ringkas".
 */
export function visualLimitsToPrompt(): string {
  return [
    '  - Tabel: maksimal 3 kolom dan 3 baris, setiap sel maksimal 26 karakter.',
    '    Slide yang memuat tabel TIDAK BOLEH memuat daftar poin. Isi pendek saja; pindahkan penjelasan ke slide berikutnya tanpa tabel.',
    '  - Kartu angka: maksimal 4 kartu, keterangan setiap kartu maksimal 22 karakter.',
    '    Slide yang memuat kartu angka TIDAK BOLEH memuat daftar poin. Kartu sudah memenuhi tinggi slide; bullets akan membuat teks meluap dan render GAGAL.',
    '    Isi slide berkartu dibatasi ≤160 karakter; penjelasan tambahan pindah ke slide tanpa kartu.',
    '  - Bila ingin isi lebih lengkap, JANGAN menambah baris tabel atau bullets ke slide yang sama: pecah menjadi dua slide —',
    '    satu slide ringkas dengan visual, satu slide penjelasan tanpa visual.',
  ].join('\n');
}

/**
 * Batas tambahan untuk slide yang memuat visual, bukan hanya teks.
 *
 * MENGAPA INI PERLU
 * Anggaran teks biasa mengukur karakter teks saja. Tetapi sebuah TABEL dan
 * KARTU ANGKA juga memakan ruang vertikal. Saat pengujian, satu slide dengan
 * tabel 4 baris DITAMBAH teks panjang meluap 290 piksel — dan karena render
 * menolak memotong teks, seluruh carousel gagal setelah puluhan panggilan model
 * terlanjur dibayar.
 *
 * Karena itu slide yang memuat visual mendapat anggaran teks yang lebih ketat,
 * dan model diberi tahu batasnya secara konkret.
 */
export interface VisualConstraint {
  type: 'table' | 'stat_tile' | 'chart_snapshot' | 'abstract_bg' | 'none';
  /** Jumlah baris maksimum untuk tabel. */
  maxRows: number;
  /** Jumlah kolom maksimum untuk tabel. */
  maxColumns: number;
  /** Jumlah kartu maksimum untuk kartu angka. */
  maxCards: number;
  /** Panjang maksimum setiap sel tabel, dalam karakter. */
  maxCellChars: number;
  /** Panjang maksimum keterangan pada kartu angka. */
  maxNoteChars: number;
  /**
   * Faktor pengurangan anggaran teks ketika slide memuat visual ini.
   * Nilai 1 berarti tidak memakan ruang tambahan.
   */
  textBudgetFactor: number;
}

