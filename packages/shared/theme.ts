/**
 * Tema default PropDesk AI.
 *
 * Token di sini adalah nilai bawaan yang masuk akal untuk niche trading
 * propfirm: gelap, kontras tinggi, terasa serius namun modern. Klien dapat
 * menimpanya lewat brand kit (lihat packages/shared/brand.ts).
 */
import type { BrandTokens } from './types.ts';

export const DEFAULT_TOKENS: BrandTokens = {
  colors: {
    background: '#0B1220',
    surface: '#151E31',
    primary: '#3B82F6',
    accent: '#22D3EE',
    text: '#F1F5F9',
    muted: '#94A3B8',
    border: '#26334A',
    positive: '#22C55E',
    negative: '#F43F5E',
  },
  fonts: {
    // Font sistem yang pasti tersedia di Windows/macOS/Linux agar render
    // tidak bergantung pada unduhan. Bila klien menyematkan font merek,
    // font tersebut dikirim sebagai @font-face data URI.
    heading: "'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif",
    body: "'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif",
  },
  typography: {
    baseScale: 1,
    // 32px pada lebar 1080 sesuai batas minimum keterbacaan di PRD §11.1.
    minBodyPx: 32,
  },
  spacing: {
    padding: 80,
    gap: 32,
  },
  radius: {
    card: 28,
    badge: 12,
  },
  style: {
    cornerStyle: 'rounded',
    borderWidth: 2,
  },
};

/** Profil rasio keluaran: ukuran kanvas dan kepadatan piksel. */
export interface RatioProfileSpec {
  /** Kunci profil. */
  key: 'ig_portrait' | 'square' | 'story' | 'linkedin_pdf' | 'pinterest';
  /** Label yang dibaca manusia. */
  label: string;
  width: number;
  height: number;
  /**
   * Faktor skala perangkat. 2 berarti kanvas 1080x1350 dirender sebagai
   * 2160x2700 piksel sehingga teks tetap tajam.
   */
  deviceScaleFactor: number;
  /** Platform yang memakai profil ini. */
  platforms: string[];
  /** Catatan khusus, misalnya batas platform. */
  note?: string;
}

export const RATIO_PROFILES: Record<RatioProfileSpec['key'], RatioProfileSpec> = {
  ig_portrait: {
    key: 'ig_portrait',
    label: 'Instagram Portrait 4:5',
    width: 1080,
    height: 1350,
    deviceScaleFactor: 2,
    platforms: ['instagram', 'facebook'],
    note: 'Profil acuan desain. Semua template dirancang pada rasio ini lebih dulu.',
  },
  square: {
    key: 'square',
    label: 'Square 1:1',
    width: 1080,
    height: 1080,
    deviceScaleFactor: 2,
    platforms: ['instagram', 'threads', 'facebook'],
    note: 'Toleransi teks lebih ketat; template harus lolos validasi overflow di profil ini.',
  },
  story: {
    key: 'story',
    label: 'Story 9:16',
    width: 1080,
    height: 1920,
    deviceScaleFactor: 2,
    platforms: ['instagram', 'tiktok'],
    note: 'Perlu area aman atas dan bawah karena tertutup antarmuka aplikasi.',
  },
  linkedin_pdf: {
    key: 'linkedin_pdf',
    label: 'LinkedIn Document (PDF)',
    width: 1080,
    height: 1350,
    deviceScaleFactor: 2,
    platforms: ['linkedin'],
    note: 'LinkedIn tidak mendukung carousel gambar; format resminya adalah unggahan dokumen PDF.',
  },
  pinterest: {
    key: 'pinterest',
    label: 'Pinterest 2:3',
    width: 1000,
    height: 1500,
    deviceScaleFactor: 2,
    platforms: ['pinterest'],
  },
};

/** Area aman (safe area) per profil, dalam persen terhadap tinggi kanvas. */
export const SAFE_AREA: Record<RatioProfileSpec['key'], { top: number; bottom: number; left: number; right: number }> = {
  ig_portrait: { top: 0, bottom: 0, left: 0, right: 0 },
  square: { top: 0, bottom: 0, left: 0, right: 0 },
  // Story: 12% atas untuk header aplikasi, 18% bawah untuk tombol aksi.
  story: { top: 12, bottom: 18, left: 6, right: 6 },
  linkedin_pdf: { top: 0, bottom: 0, left: 0, right: 0 },
  pinterest: { top: 0, bottom: 0, left: 0, right: 0 },
};

/** Menghasilkan blok CSS custom property dari token merek. */
export function tokensToCssVars(tokens: BrandTokens): string {
  const c = tokens.colors;
  return [
    `--c-bg: ${c.background}`,
    `--c-surface: ${c.surface}`,
    `--c-primary: ${c.primary}`,
    `--c-accent: ${c.accent}`,
    `--c-text: ${c.text}`,
    `--c-muted: ${c.muted}`,
    `--c-border: ${c.border}`,
    `--c-positive: ${c.positive}`,
    `--c-negative: ${c.negative}`,
    `--f-heading: ${tokens.fonts.heading}`,
    `--f-body: ${tokens.fonts.body}`,
    `--sp-pad: ${tokens.spacing.padding}px`,
    `--sp-gap: ${tokens.spacing.gap}px`,
    `--r-card: ${tokens.radius.card}px`,
    `--r-badge: ${tokens.radius.badge}px`,
    `--bw: ${tokens.style.borderWidth}px`,
    `--scale: ${tokens.typography.baseScale}`,
    `--min-body: ${tokens.typography.minBodyPx}px`,
  ].join(';\n  ');
}

/** Memeriksa apakah warna latar tergolong gelap, untuk memilih varian logo. */
export function isDarkColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Luminance relatif menurut WCAG.
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.5;
}

/**
 * Menghitung rasio kontras WCAG antara dua warna.
 * Dipakai validator brand untuk menolak kombinasi yang tidak terbaca.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
    const [r, g, b] = [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
