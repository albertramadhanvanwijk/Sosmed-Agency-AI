/**
 * Brand kit dan penggabungan token.
 *
 * Klien dapat menimpa sebagian token; sisanya diambil dari tema default.
 * Penggabungan dilakukan dalam (deep merge) supaya klien cukup mengirim warna
 * yang ingin diubah tanpa harus menuliskan seluruh konfigurasi.
 */
import type { BrandKit, BrandTokens } from './types.ts';
import { contrastRatio, DEFAULT_TOKENS } from './theme.ts';

/** Menggabungkan token klien ke atas tema default. */
export function mergeTokens(partial?: Partial<BrandTokens>): BrandTokens {
  if (!partial) return structuredClone(DEFAULT_TOKENS);
  const base = structuredClone(DEFAULT_TOKENS);
  return {
    colors: { ...base.colors, ...(partial.colors ?? {}) },
    fonts: { ...base.fonts, ...(partial.fonts ?? {}) },
    typography: { ...base.typography, ...(partial.typography ?? {}) },
    spacing: { ...base.spacing, ...(partial.spacing ?? {}) },
    radius: { ...base.radius, ...(partial.radius ?? {}) },
    style: { ...base.style, ...(partial.style ?? {}) },
  };
}

/** Disclaimer bawaan sesuai PRD §13.4. */
export const DEFAULT_DISCLAIMERS: Record<string, string> = {
  default_finansial:
    'Materi ini bersifat edukasi dan bukan nasihat keuangan. Trading mengandung risiko kehilangan modal. Kinerja masa lalu tidak menjamin hasil di masa depan.',
  outlook_signal:
    'Ini adalah analisis skenario, bukan ajakan bertransaksi. Selalu gunakan manajemen risiko Anda sendiri. Materi ini bukan nasihat keuangan; trading mengandung risiko kehilangan modal.',
  propfirm_program:
    'Program dapat berubah. Selalu cek aturan resmi di situs penyelenggara sebelum mengambil keputusan mengikuti program. Materi ini bersifat edukasi dan bukan nasihat keuangan.',
};

/** Masalah pada brand kit yang perlu diperbaiki manusia. */
export interface BrandIssue {
  field: string;
  message: string;
  severity: 'block' | 'warn';
}

/**
 * Memeriksa keterbacaan brand kit.
 *
 * Dua kombinasi yang paling sering menyebabkan slide tidak terbaca:
 * teks di atas latar, dan teks di dalam kartu permukaan. Ambang 4.5 dipakai
 * untuk teks normal (WCAG AA).
 */
export function validateBrandTokens(tokens: BrandTokens): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const c = tokens.colors;
  const check = (a: string, b: string, label: string, min = 4.5) => {
    const ratio = contrastRatio(a, b);
    if (ratio < min) {
      issues.push({
        field: label,
        message: `Kontras ${label} hanya ${ratio.toFixed(2)}:1 (minimum ${min}:1). Kombinasi ini sulit dibaca di layar ponsel.`,
        severity: ratio < 3 ? 'block' : 'warn',
      });
    }
  };

  check(c.text, c.background, 'teks utama pada latar');
  check(c.text, c.surface, 'teks utama pada kartu');
  check(c.muted, c.background, 'teks sekunder pada latar', 3);
  check(c.muted, c.surface, 'teks sekunder pada kartu', 3);
  check(c.accent, c.background, 'warna aksen pada latar', 3);
  check(c.primary, c.background, 'warna utama pada latar', 2);

  if (tokens.typography.minBodyPx < 28) {
    issues.push({
      field: 'typography.minBodyPx',
      message: `Ukuran teks isi minimum ${tokens.typography.minBodyPx}px terlalu kecil untuk carousel 1080px. Gunakan minimal 28px, disarankan 32px.`,
      severity: 'warn',
    });
  }
  if (tokens.spacing.padding < 48) {
    issues.push({
      field: 'spacing.padding',
      message: `Jarak tepi ${tokens.spacing.padding}px terlalu rapat; teks berisiko terpotong pada slide rasio 1:1. Disarankan minimal 64px.`,
      severity: 'warn',
    });
  }

  return issues;
}

/** Membuat brand kit lengkap dari token parsial. */
export function createBrandKit(
  name: string,
  tokens?: Partial<BrandTokens>,
  disclaimers?: Record<string, string>,
): BrandKit {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    tokens: mergeTokens(tokens),
    disclaimers: { ...DEFAULT_DISCLAIMERS, ...(disclaimers ?? {}) },
  };
}
