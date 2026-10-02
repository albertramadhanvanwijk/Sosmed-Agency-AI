/**
 * Tema warna untuk setiap kategori carousel.
 *
 * Setiap kategori memiliki palet warna yang khas:
 * - primary: warna utama untuk badge dan aksen
 * - accent: warna lebih gelap untuk border dan hover
 * - bg: warna latar belakang terang untuk form
 * - name: nama kategori dalam bahasa Indonesia
 */

export type CategoryKey = 'edukasi_trading' | 'edukasi_propfirm' | 'jurnal_trading' | 'market_info' | 'market_outlook';

export interface CategoryTheme {
  primary: string;
  accent: string;
  bg: string;
  name: string;
}

export const CATEGORY_THEMES: Record<CategoryKey, CategoryTheme> = {
  edukasi_trading: {
    primary: '#3B82F6',
    accent: '#1E40AF',
    bg: '#EFF6FF',
    name: 'Trading Education'
  },
  edukasi_propfirm: {
    primary: '#A855F7',
    accent: '#7E22CE',
    bg: '#FAF5FF',
    name: 'Prop Firm Education'
  },
  jurnal_trading: {
    primary: '#F59E0B',
    accent: '#D97706',
    bg: '#FFFBEB',
    name: 'Trading Journal'
  },
  market_info: {
    primary: '#10B981',
    accent: '#047857',
    bg: '#ECFDF5',
    name: 'Market Info'
  },
  market_outlook: {
    primary: '#EF4444',
    accent: '#DC2626',
    bg: '#FEF2F2',
    name: 'Market Outlook'
  }
} as const;

/**
 * Mengambil tema warna untuk kategori tertentu.
 *
 * Jika kategori tidak dikenal, mengembalikan tema default (edukasi_trading).
 */
export function getCategoryTheme(key: string | null | undefined): CategoryTheme {
  if (!key) return CATEGORY_THEMES.edukasi_trading;
  const theme = CATEGORY_THEMES[key as CategoryKey];
  return theme || CATEGORY_THEMES.edukasi_trading;
}

/**
 * Mengatur variabel CSS untuk tema kategori pada elemen.
 *
 * Dipakai saat pengguna mengubah kategori form untuk memperbarui warna
 * form secara real-time.
 */
export function applyCategoryTheme(element: HTMLElement, categoryKey: string | null): void {
  const theme = getCategoryTheme(categoryKey);
  element.style.setProperty('--cat-primary', theme.primary);
  element.style.setProperty('--cat-accent', theme.accent);
  element.style.setProperty('--cat-bg', theme.bg);
}

/**
 * Membuat elemen badge untuk menampilkan kategori dengan warna temanya.
 */
export function createCategoryBadge(categoryKey: string | null): HTMLElement {
  const theme = getCategoryTheme(categoryKey);
  const badge = document.createElement('span');
  badge.className = 'badge category-badge';
  badge.textContent = theme.name;
  badge.style.backgroundColor = theme.primary;
  badge.style.color = '#fff';
  return badge;
}
