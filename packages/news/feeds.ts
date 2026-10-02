/**
 * Daftar sumber berita.
 *
 * Semua alamat di bawah ini SUDAH DIUJI dapat diakses dari mesin pengguna, dan
 * yang gagal sengaja tidak dicantumkan. Sumber yang mengembalikan 403, timeout,
 * atau alamat yang tidak dapat diselesaikan tidak disimpan di sini — supaya
 * pipeline tidak membuang waktu mencoba alamat yang memang tidak bisa dipakai.
 *
 * Setiap sumber membawa metadata yang dipakai saat memilih bahan:
 *  - `language`     : konten Indonesia atau Inggris. Berita Indonesia lebih
 *                     relevan untuk audiens lokal, tetapi berita global lebih
 *                     cepat untuk peristiwa pasar.
 *  - `trust`        : tingkat kepercayaan. Dipakai untuk mengurutkan pilihan
 *                     dan menentukan apakah sebuah klaim boleh masuk slide
 *                     tanpa verifikasi tambahan.
 *  - `scope`        : cakupan topik, untuk mencocokkan sumber dengan kategori.
 *  - `markets`      : benar bila sumber fokus pada pasar/keuangan (bukan berita
 *                     umum), sehingga lebih cocok untuk kategori market_*.
 */
import type { CategoryKey, NewsSource } from '../shared/types.ts';

export const NEWS_SOURCES: NewsSource[] = [
  // --- Indonesia: ekonomi dan pasar ---------------------------------------
  {
    key: 'cnbc_id_market',
    name: 'CNBC Indonesia — Market',
    url: 'https://www.cnbcindonesia.com/market/rss',
    language: 'id',
    trust: 'high',
    scope: ['market_info', 'market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'cnbc_id_news',
    name: 'CNBC Indonesia — News',
    url: 'https://www.cnbcindonesia.com/news/rss',
    language: 'id',
    trust: 'high',
    scope: ['market_info'],
    markets: true,
    enabled: true,
  },
  {
    key: 'cnbc_id_all',
    name: 'CNBC Indonesia',
    url: 'https://www.cnbcindonesia.com/rss',
    language: 'id',
    trust: 'high',
    scope: ['market_info', 'edukasi_propfirm'],
    markets: true,
    enabled: true,
  },
  {
    key: 'antara_ekonomi',
    name: 'Antara — Ekonomi',
    url: 'https://www.antaranews.com/rss/ekonomi.xml',
    language: 'id',
    trust: 'high',
    scope: ['market_info'],
    markets: true,
    enabled: true,
  },
  {
    key: 'antara_terkini',
    name: 'Antara — Terkini',
    url: 'https://www.antaranews.com/rss/terkini.xml',
    language: 'id',
    trust: 'high',
    scope: ['market_info'],
    markets: false,
    enabled: true,
  },
  {
    key: 'cnn_ekonomi',
    name: 'CNN Indonesia — Ekonomi',
    url: 'https://www.cnnindonesia.com/ekonomi/rss',
    language: 'id',
    trust: 'high',
    scope: ['market_info'],
    markets: true,
    enabled: true,
  },
  {
    key: 'katadata',
    name: 'Katadata',
    url: 'https://katadata.co.id/rss',
    language: 'id',
    trust: 'medium',
    scope: ['market_info'],
    markets: true,
    enabled: true,
  },

  // --- Internasional: pasar global ----------------------------------------
  {
    key: 'yahoo_finance',
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    language: 'en',
    trust: 'medium',
    scope: ['market_info', 'market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'cnbc_markets',
    name: 'CNBC Markets',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    language: 'en',
    trust: 'high',
    scope: ['market_info', 'market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'investing_news',
    name: 'Investing.com',
    url: 'https://www.investing.com/rss/news.rss',
    language: 'en',
    trust: 'medium',
    scope: ['market_info', 'market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'marketwatch',
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    language: 'en',
    trust: 'high',
    scope: ['market_info', 'market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'ft_markets',
    name: 'Financial Times — Markets',
    url: 'https://www.ft.com/markets?format=rss',
    language: 'en',
    trust: 'high',
    scope: ['market_outlook'],
    markets: true,
    enabled: true,
  },
  {
    key: 'tradingview_ideas',
    name: 'TradingView — Community Ideas',
    url: 'https://www.tradingview.com/feed/',
    language: 'en',
    // Konten komunitas: berguna sebagai bahan ide, tetapi TIDAK boleh dipakai
    // sebagai sumber klaim faktual tanpa verifikasi tambahan.
    trust: 'low',
    scope: ['market_outlook', 'edukasi_trading'],
    markets: true,
    enabled: true,
  },
];

/** Sumber yang cocok untuk sebuah kategori, terurut berdasarkan kepercayaan. */
export function sourcesForCategory(categoryKey: CategoryKey): NewsSource[] {
  const trustRank = { high: 0, medium: 1, low: 2 } as const;
  return NEWS_SOURCES
    .filter((s) => s.enabled && s.scope.includes(categoryKey))
    .sort((a, b) => trustRank[a.trust] - trustRank[b.trust]);
}

/** Mengambil sumber berdasarkan kuncinya. */
export function sourceByKey(key: string): NewsSource | undefined {
  return NEWS_SOURCES.find((s) => s.key === key);
}

/**
 * Sumber yang boleh dipakai sebagai dasar klaim faktual pada slide.
 *
 * Sumber dengan tingkat kepercayaan `low` (mis. ide komunitas) hanya boleh
 * menjadi bahan inspirasi topik, bukan rujukan angka atau pernyataan fakta.
 */
export function citationWorthySources(): NewsSource[] {
  return NEWS_SOURCES.filter((s) => s.enabled && s.trust !== 'low');
}

/** Ringkasan sumber untuk ditampilkan di antarmuka. */
export function describeSources(): { count: number; byLanguage: Record<string, number>; byTrust: Record<string, number> } {
  const enabled = NEWS_SOURCES.filter((s) => s.enabled);
  const byLanguage: Record<string, number> = {};
  const byTrust: Record<string, number> = {};
  for (const s of enabled) {
    byLanguage[s.language] = (byLanguage[s.language] ?? 0) + 1;
    byTrust[s.trust] = (byTrust[s.trust] ?? 0) + 1;
  }
  return { count: enabled.length, byLanguage, byTrust };
}
