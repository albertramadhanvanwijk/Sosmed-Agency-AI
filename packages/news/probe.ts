/**
 * Pemeriksaan sumber berita.
 *
 * Menampilkan sumber mana yang benar-benar dapat diakses dari mesin ini,
 * berapa berita yang terbaca, dan berita contoh yang didapat. Pemeriksaan ini
 * penting karena alamat umpan berita berubah tanpa pemberitahuan, dan sumber
 * yang mati sebaiknya diketahui sebelum produksi berjalan — bukan sesudahnya.
 *
 * Jalankan: npm run news:probe
 */
import { NEWS_SOURCES, describeSources } from './feeds.ts';
import { fetchFeed, type FetchOutcome } from './rss.ts';
import { selectRelevantNews, formatRelative } from './select.ts';
import { CATEGORY_ORDER, getCategory } from '../shared/categories.ts';
import type { NewsItem } from '../shared/types.ts';

async function main() {
  console.log('=== Pemeriksaan Sumber Berita ===\n');

  const summary = describeSources();
  console.log(`Sumber aktif: ${summary.count}`);
  console.log(`Bahasa      : ${Object.entries(summary.byLanguage).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`Kepercayaan : ${Object.entries(summary.byTrust).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);

  // -------------------------------------------------------------------------
  // 1. Ambil setiap sumber secara terpisah
  // -------------------------------------------------------------------------

  console.log('1. Status setiap sumber\n');
  const outcomes: FetchOutcome[] = [];
  const allItems: NewsItem[] = [];
  let okCount = 0;

  for (const source of NEWS_SOURCES) {
    if (!source.enabled) continue;
    const { items, outcome } = await fetchFeed(source, { timeoutMs: 15_000, limit: 8 });
    outcomes.push(outcome);
    allItems.push(...items);

    const mark = outcome.ok && outcome.count > 0 ? 'OK   ' : 'GAGAL';
    if (outcome.ok && outcome.count > 0) okCount += 1;
    console.log(
      `   ${mark} ${source.name.padEnd(32)} ${String(outcome.count).padStart(3)} berita  ${String(outcome.durationMs).padStart(6)}ms  [${source.trust}/${source.language}]`,
    );
    if (!outcome.ok || outcome.count === 0) {
      console.log(`         └─ ${outcome.error ?? 'tidak ada entri yang dikenali'}`);
    }
  }

  console.log(`\n   ${okCount} dari ${outcomes.length} sumber berhasil.\n`);

  // -------------------------------------------------------------------------
  // 2. Apakah setiap kategori punya bahan berita yang cukup?
  // -------------------------------------------------------------------------

  console.log('2. Ketersediaan bahan per kategori\n');
  const topicPerCategory: Record<string, string> = {
    market_info: 'dampak data inflasi terhadap ekspektasi suku bunga',
    market_outlook: 'skenario arah indeks dolar pekan depan',
    edukasi_trading: 'membaca struktur pasar',
    edukasi_propfirm: 'aturan drawdown program evaluasi',
    jurnal_trading: 'evaluasi posisi trading',
  };

  for (const key of CATEGORY_ORDER) {
    const category = getCategory(key);
    const relevant = selectRelevantNews(allItems, topicPerCategory[key] ?? category.name, { limit: 3 });
    const mark = relevant.length > 0 ? 'ADA ' : 'TIDAK';
    console.log(`   ${mark} ${category.name.padEnd(22)} ${relevant.length} berita relevan untuk topik uji`);
    for (const item of relevant.slice(0, 2)) {
      console.log(`         • [${item.sourceName}] ${item.title.slice(0, 64)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Berita terbaru, untuk memastikan data benar-benar segar
  // -------------------------------------------------------------------------

  console.log('\n3. Lima berita terbaru yang terkumpul\n');
  const newest = [...allItems]
    .filter((i) => i.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    .slice(0, 5);

  if (newest.length === 0) {
    console.log('   Tidak ada berita dengan waktu terbit yang dapat dikenali.');
  } else {
    for (const item of newest) {
      console.log(`   ${formatRelative(item.publishedAt!).padEnd(14)} [${item.sourceName}]`);
      console.log(`      ${item.title.slice(0, 90)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Ringkasan
  // -------------------------------------------------------------------------

  console.log('\n=== Ringkasan ===');
  console.log(`Total berita terkumpul : ${allItems.length}`);
  console.log(`Dengan sumber unik     : ${new Set(allItems.map((i) => i.sourceKey)).size}`);
  const withDate = allItems.filter((i) => i.publishedAt).length;
  console.log(`Punya waktu terbit     : ${withDate} dari ${allItems.length}`);

  if (okCount === 0) {
    console.log('\nPERINGATAN: tidak ada sumber yang dapat diakses. Periksa koneksi jaringan.');
    process.exitCode = 2;
  } else if (okCount < 3) {
    console.log('\nCATATAN: hanya sedikit sumber yang dapat diakses. Kategori berita mungkin kurang variatif.');
  } else {
    console.log('\nSumber berita siap dipakai.');
  }
}

main().catch((e) => {
  console.error('Pemeriksaan gagal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
