/**
 * Tema visual per kategori.
 *
 * MENGAPA MODUL INI ADA
 * Sebelumnya semua kategori memakai satu bahasa visual yang sama, sehingga
 * audiens tidak dapat membedakan kategori hanya dari tampilannya. Akibatnya
 * feed terasa monoton dan batas antar jenis konten kabur.
 *
 * Sekarang setiap kategori punya identitasnya sendiri: warna aksen, gaya latar,
 * bentuk kartu (tegas atau membulat), dan cara menyorot angka. Yang TIDAK
 * berubah adalah tata letaknya — supaya keterbacaan dan hasil validasi overflow
 * tetap sama untuk semua kategori.
 *
 * PRINSIP: tema hanya mengubah hal yang bersifat dekoratif. Ukuran teks, jarak
 * tepi, dan area aman tetap mengikuti brand kit, sehingga pergantian tema tidak
 * pernah membuat teks meluap.
 */
import type { BrandTokens, CategoryKey } from '../shared/types.ts';

/** Cara template menyorot sebuah angka atau elemen penting. */
export type AccentStyle =
  | 'underline'   // garis bawah
  | 'marker'      // blok warna di belakang teks
  | 'bracket'     // tanda kurung siku
  | 'pill'        // kapsul kecil
  | 'glow';       // efek cahaya

/** Tema visual satu kategori. */
export interface CategoryTheme {
  key: CategoryKey;
  /** Nama tema, untuk ditampilkan di antarmuka. */
  name: string;
  /** Penjelasan singkat tujuan tampilannya. */
  intent: string;
  /** Warna aksen; menimpa token merek agar antar kategori berbeda. */
  accent: string;
  /** Warna sekunder untuk gradien dan latar. */
  secondary: string;
  /** Nada latar: gelap pekat, gelap lembut, atau terang. */
  surfaceTone: 'deep' | 'soft' | 'flat';
  /** Pola dekoratif bawaan. */
  defaultPattern: 'glow' | 'grid' | 'diagonal' | 'dots' | 'wave' | 'none';
  /** Gaya sudut kartu. */
  cornerStyle: 'rounded' | 'sharp' | 'mixed';
  /** Ketebalan garis batas. */
  borderWidth: number;
  /** Cara menyorot elemen penting. */
  accentStyle: AccentStyle;
  /** Gaya lencana kategori. */
  badgeStyle: 'solid' | 'outline' | 'ghost';
  /** Gaya khas pada judul: huruf besar semua, kapital biasa, atau miring. */
  headlineCase: 'none' | 'uppercase' | 'italic';
  /**
   * Penanda visual yang membedakan kategori dalam sekali lihat.
   * Ditampilkan sebagai strip tipis pada tepi slide.
   */
  edgeStrip: boolean;
  /**
   * Cara menampilkan nomor slide.
   */
  counterStyle: 'plain' | 'bar' | 'dots';
}

/**
 * Tema untuk lima kategori.
 *
 * Warna dipilih agar tetap kontras tinggi terhadap latar gelap, sesuai batas
 * keterbacaan yang diperiksa `validateBrandTokens`.
 */
export const CATEGORY_THEMES: Record<CategoryKey, CategoryTheme> = {
  edukasi_trading: {
    key: 'edukasi_trading',
    name: 'Akademi',
    intent: 'Terasa seperti materi belajar: bersih, tenang, dan mudah diikuti langkah demi langkah.',
    accent: '#22D3EE',
    secondary: '#3B82F6',
    surfaceTone: 'deep',
    defaultPattern: 'grid',
    cornerStyle: 'rounded',
    borderWidth: 2,
    accentStyle: 'underline',
    badgeStyle: 'outline',
    headlineCase: 'none',
    edgeStrip: false,
    counterStyle: 'plain',
  },

  edukasi_propfirm: {
    key: 'edukasi_propfirm',
    name: 'Regulasi',
    intent: 'Terasa formal dan presisi seperti dokumen aturan, karena isinya memang aturan yang harus dibaca teliti.',
    accent: '#60A5FA',
    secondary: '#1D4ED8',
    surfaceTone: 'flat',
    defaultPattern: 'diagonal',
    cornerStyle: 'sharp',
    borderWidth: 3,
    accentStyle: 'bracket',
    badgeStyle: 'solid',
    headlineCase: 'none',
    edgeStrip: true,
    counterStyle: 'bar',
  },

  jurnal_trading: {
    key: 'jurnal_trading',
    name: 'Catatan',
    intent: 'Terasa personal dan jujur seperti buku catatan trader, karena nilainya ada pada keterbukaan.',
    accent: '#FBBF24',
    secondary: '#F97316',
    surfaceTone: 'soft',
    defaultPattern: 'dots',
    cornerStyle: 'rounded',
    borderWidth: 2,
    accentStyle: 'marker',
    badgeStyle: 'ghost',
    headlineCase: 'none',
    edgeStrip: false,
    counterStyle: 'dots',
  },

  market_info: {
    key: 'market_info',
    name: 'Kabar',
    intent: 'Terasa seperti laporan berita: cepat dibaca, penanda waktu menonjol, dan tegas membedakan fakta dari opini.',
    accent: '#38BDF8',
    secondary: '#0EA5E9',
    surfaceTone: 'deep',
    defaultPattern: 'wave',
    cornerStyle: 'mixed',
    borderWidth: 2,
    accentStyle: 'pill',
    badgeStyle: 'solid',
    headlineCase: 'none',
    edgeStrip: true,
    counterStyle: 'bar',
  },

  market_outlook: {
    key: 'market_outlook',
    name: 'Skenario',
    intent: 'Terasa seperti peta kondisi: dua arah yang jelas, batas invalidasi menonjol, dan disklaimer selalu terlihat.',
    accent: '#F472B6',
    secondary: '#A855F7',
    surfaceTone: 'deep',
    defaultPattern: 'glow',
    cornerStyle: 'rounded',
    borderWidth: 3,
    accentStyle: 'glow',
    badgeStyle: 'outline',
    headlineCase: 'none',
    edgeStrip: true,
    counterStyle: 'dots',
  },
};

/** Mengambil tema sebuah kategori. */
export function themeFor(categoryKey: CategoryKey): CategoryTheme {
  return CATEGORY_THEMES[categoryKey] ?? CATEGORY_THEMES.edukasi_trading;
}

/** Warna latar menurut nada permukaan. */
export function surfaceColors(theme: CategoryTheme): { background: string; surface: string; border: string } {
  switch (theme.surfaceTone) {
    case 'flat':
      return { background: '#080E1A', surface: '#101B2E', border: '#1E2B44' };
    case 'soft':
      return { background: '#0C1020', surface: '#1A2036', border: '#2A3350' };
    case 'deep':
    default:
      return { background: '#070C16', surface: '#111B2E', border: '#22314C' };
  }
}

/**
 * Menerapkan tema kategori ke atas token merek.
 *
 * Yang diubah hanya warna aksen, warna permukaan, gaya sudut, dan ketebalan
 * batas. Ukuran teks dan jarak tepi TIDAK diubah, supaya anggaran teks yang
 * sudah diuji tetap berlaku untuk semua tema.
 */
export function applyTheme(tokens: BrandTokens, categoryKey: CategoryKey): BrandTokens {
  const theme = themeFor(categoryKey);
  const surface = surfaceColors(theme);
  const out: BrandTokens = structuredClone(tokens);

  out.colors.accent = theme.accent;
  // Warna utama diarahkan ke sekunder tema, tetapi tetap menjaga kontras teks.
  out.colors.primary = theme.secondary;
  out.colors.background = surface.background;
  out.colors.surface = surface.surface;
  out.colors.border = surface.border;

  out.style.cornerStyle = theme.cornerStyle;
  out.style.borderWidth = theme.borderWidth;
  out.radius.card = theme.cornerStyle === 'sharp' ? 4 : theme.cornerStyle === 'mixed' ? 18 : 28;
  out.radius.badge = theme.cornerStyle === 'sharp' ? 2 : theme.cornerStyle === 'mixed' ? 8 : 12;

  return out;
}

/** Daftar ringkas seluruh tema, untuk ditampilkan di antarmuka. */
export function listThemes(): { key: CategoryKey; name: string; accent: string; intent: string }[] {
  return Object.values(CATEGORY_THEMES).map((t) => ({
    key: t.key,
    name: t.name,
    accent: t.accent,
    intent: t.intent,
  }));
}
