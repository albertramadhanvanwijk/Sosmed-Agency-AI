/**
 * Peng-escape teks untuk disisipkan ke HTML.
 *
 * Dipakai untuk SETIAP nilai dinamis yang masuk ke dokumen. Tanpa ini, judul
 * carousel yang memuat tanda kurung siku akan merusak markup, dan teks yang
 * berasal dari model bahasa tidak boleh dipercaya begitu saja.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
