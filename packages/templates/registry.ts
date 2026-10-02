/**
 * Registry template.
 *
 * Tugas registry:
 *  - mencari template berdasarkan slug,
 *  - memilih template otomatis berdasarkan peran slide,
 *  - MEMVALIDASI kesesuaian data terhadap batas template.
 *
 * Validasi dilakukan sebelum render supaya kesalahan ditemukan sebagai pesan
 * yang bisa diperbaiki manusia, bukan sebagai slide yang teksnya terpotong.
 */
import type { Slide, SlideRole } from '../shared/types.ts';
import { TEMPLATE_LIST } from './definitions.ts';
import type { TemplateDefinition } from './base.ts';

const BY_SLUG = new Map(TEMPLATE_LIST.map((t) => [t.slug, t]));

/** Template cadangan untuk setiap peran, bila template pilihan tidak cocok. */
const FALLBACK_BY_ROLE: Record<SlideRole, string> = {
  hook: 'hook-bold',
  body: 'concept-one-idea',
  example: 'concept-one-idea',
  checklist: 'checklist-numbered',
  recap: 'recap-takeaway',
  cta: 'recap-takeaway',
  disclaimer: 'disclaimer-note',
};

/** Mengambil template berdasarkan slug; galat menyebut slug yang tersedia. */
export function getTemplate(slug: string): TemplateDefinition {
  const found = BY_SLUG.get(slug);
  if (!found) {
    throw new Error(
      `Template "${slug}" tidak ada. Template tersedia: ${[...BY_SLUG.keys()].join(', ')}`,
    );
  }
  return found;
}

/** Benar bila slug template dikenal. */
export function hasTemplate(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/**
 * Menentukan template untuk sebuah slide.
 *
 * Urutan keputusan:
 *   1. `slide.templateKey` bila diisi dan templatenya ada serta mendukung peran.
 *   2. Template pertama yang mendukung peran tersebut.
 *   3. Cadangan berdasarkan peran.
 */
export function resolveTemplate(slide: Slide): TemplateDefinition {
  if (slide.templateKey) {
    const explicit = BY_SLUG.get(slide.templateKey);
    if (explicit) {
      // Template khusus kadang dipakai lintas peran (mis. tabel untuk 'body').
      // Yang penting template mengenali bahwa strukturnya masuk akal.
      if (explicit.supportedRoles.includes(slide.role) || explicit.limits.bullets >= slide.bullets.length) {
        return explicit;
      }
    }
  }
  const byRole = TEMPLATE_LIST.find((t) => t.supportedRoles.includes(slide.role));
  if (byRole) return byRole;
  return getTemplate(FALLBACK_BY_ROLE[slide.role] ?? 'concept-one-idea');
}

/** Satu masalah pada slide yang perlu diperbaiki. */
export interface SlideValidationIssue {
  slidePosition: number;
  field: 'headline' | 'body' | 'bullets' | 'structure';
  message: string;
  severity: 'block' | 'warn';
}

/** Menghitung kata, mengabaikan spasi berlebih. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Memvalidasi slide terhadap batas template.
 *
 * `block` berarti slide tidak boleh dirender (kemungkinan besar teks terpotong).
 * `warn` berarti masih boleh dirender tetapi sebaiknya diperbaiki.
 */
export function validateSlide(slide: Slide, template: TemplateDefinition): SlideValidationIssue[] {
  const issues: SlideValidationIssue[] = [];
  const at = (field: SlideValidationIssue['field'], message: string, severity: 'block' | 'warn') =>
    issues.push({ slidePosition: slide.position, field, message, severity });

  const headline = slide.headline ?? '';
  const body = slide.body ?? '';

  if (headline.trim().length === 0) {
    at('structure', 'Judul slide kosong.', 'block');
  }
  if (headline.length > template.limits.headlineChars) {
    // Judul panjang adalah penyebab paling umum teks terpotong pada slide hook.
    at(
      'headline',
      `Judul ${headline.length} karakter, melebihi batas ${template.limits.headlineChars} untuk template "${template.slug}".`,
      headline.length > template.limits.headlineChars * 1.35 ? 'block' : 'warn',
    );
  }
  if (body.length > template.limits.bodyChars) {
    at(
      'body',
      `Isi slide ${body.length} karakter, melebihi batas ${template.limits.bodyChars}.`,
      body.length > template.limits.bodyChars * 1.4 ? 'block' : 'warn',
    );
  }
  if (slide.bullets.length > template.limits.bullets) {
    at(
      'bullets',
      `${slide.bullets.length} butir poin, sedangkan template "${template.slug}" hanya mendukung ${template.limits.bullets}.`,
      slide.bullets.length > template.limits.bullets + 1 ? 'block' : 'warn',
    );
  }
  for (const [i, b] of slide.bullets.entries()) {
    if (b.length > template.limits.bulletChars) {
      at('bullets', `Poin #${i + 1} sepanjang ${b.length} karakter, melebihi ${template.limits.bulletChars}.`, 'warn');
    }
  }

  // Aturan "satu slide satu ide": paragraf isi yang terlalu banyak menandakan
  // slide sedang memuat lebih dari satu gagasan.
  if (countWords(body) > 110) {
    at('body', `Isi slide ${countWords(body)} kata. Pecah menjadi beberapa slide agar satu slide satu ide.`, 'warn');
  }

  return issues;
}

/** Ringkasan seluruh template untuk ditampilkan di antarmuka. */
export function listTemplates(): { slug: string; name: string; description: string; roles: SlideRole[] }[] {
  return TEMPLATE_LIST.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    roles: t.supportedRoles,
  }));
}
