/**
 * Pembaca umpan berita RSS/Atom.
 *
 * Ditulis tanpa pustaka pihak ketiga, dan sengaja toleran: umpan berita di
 * dunia nyata sering tidak rapi (tag tidak tertutup, entitas HTML ganda,
 * tanggal dengan format berbeda-beda). Parser yang terlalu ketat akan gagal
 * pada umpan yang sebenarnya baik.
 *
 * Yang TIDAK dilakukan berkas ini:
 *  - tidak mengeksekusi apa pun dari isi umpan,
 *  - tidak meneruskan HTML mentah ke template (semua teks dibersihkan menjadi
 *    teks polos), dan
 *  - tidak mempercayai isi umpan sebagai instruksi. Isi umpan adalah DATA,
 *    bukan perintah — lihat catatan keamanan di `fetchNews`.
 */
import type { NewsItem, NewsSource } from '../shared/types.ts';

/** Membuang tag HTML dan mengubah entitas menjadi karakter biasa. */
export function stripHtml(input: string): string {
  let out = input;
  // Buang blok script/style beserta isinya sebelum membuang tag lain.
  out = out.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  // Ganti tag penutup blok dengan spasi agar kata tidak menempel.
  out = out.replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, ' ');
  out = out.replace(/<br\s*\/?>/gi, ' ');
  // Buang seluruh tag yang tersisa.
  out = out.replace(/<[^>]+>/g, '');
  // Entitas HTML yang umum.
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    });
  // Rapikan spasi.
  return out.replace(/\s+/g, ' ').trim();
}

/** Mengambil isi sebuah tag, mendukung pembungkus CDATA. */
function tagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  let value = m[1] ?? '';
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
  if (cdata) value = cdata[1] ?? '';
  return value;
}

/** Mengambil nilai atribut dari tag pembuka. */
function attrOf(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  return re.exec(xml)?.[1] ?? null;
}

/**
 * Mengurai tanggal dari berbagai format yang lazim di umpan berita.
 * Mengembalikan waktu ISO, atau null bila tidak dapat dikenali.
 */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = stripHtml(raw).trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  // Tolak tanggal yang jelas tidak masuk akal (sebelum 2000 atau lebih dari
  // satu hari di masa depan), karena itu biasanya tanda umpan rusak.
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  if (ms > Date.now() + 24 * 3600_000) return null;
  return date.toISOString();
}

/**
 * Memisahkan umpan menjadi daftar entri mentah (RSS `<item>` atau Atom `<entry>`).
 * Dipisah agar pemakaian tag di dalam satu entri tidak mencampur entri lain.
 */
function splitEntries(xml: string): string[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  if (items && items.length > 0) return items;
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi);
  if (entries && entries.length > 0) return entries;
  return [];
}

/** Mengambil tautan sebuah entri (RSS `link` teks, atau Atom `link href`). */
function entryLink(entry: string): string | null {
  const plain = tagContent(entry, 'link');
  if (plain) {
    const cleaned = stripHtml(plain);
    if (cleaned.startsWith('http')) return cleaned;
  }
  const href = attrOf(entry, 'link', 'href');
  if (href) return href;
  // Sebagian umpan memakai <guid isPermaLink="true">.
  const guid = tagContent(entry, 'guid');
  if (guid && stripHtml(guid).startsWith('http')) return stripHtml(guid);
  return null;
}

/** Mengurai satu umpan menjadi daftar berita. */
export function parseFeed(xml: string, source: NewsSource, limit = 30): NewsItem[] {
  const entries = splitEntries(xml).slice(0, limit);
  const items: NewsItem[] = [];

  for (const entry of entries) {
    const titleRaw = tagContent(entry, 'title');
    const title = titleRaw ? stripHtml(titleRaw) : '';
    if (!title || title.length < 8) continue;

    const descriptionRaw =
      tagContent(entry, 'description') ??
      tagContent(entry, 'summary') ??
      tagContent(entry, 'content:encoded') ??
      tagContent(entry, 'content');
    const summary = descriptionRaw ? stripHtml(descriptionRaw).slice(0, 600) : '';

    const publishedAt = parseDate(
      tagContent(entry, 'pubDate') ??
        tagContent(entry, 'published') ??
        tagContent(entry, 'updated') ??
        tagContent(entry, 'dc:date'),
    );

    const link = entryLink(entry);

    items.push({
      sourceKey: source.key,
      sourceName: source.name,
      title,
      summary,
      ...(link ? { url: link } : {}),
      publishedAt,
      trust: source.trust,
      language: source.language,
    });
  }

  return items;
}

/** Hasil pengambilan satu sumber. */
export interface FetchOutcome {
  sourceKey: string;
  sourceName: string;
  ok: boolean;
  count: number;
  /** Waktu pengambilan; dipakai untuk penanda `asOf`. */
  fetchedAt: string;
  durationMs: number;
  error?: string;
}

/**
 * Mengambil satu umpan melalui jaringan.
 *
 * CATATAN KEAMANAN: isi umpan diperlakukan sebagai DATA yang tidak dipercaya.
 * Semua HTML dibuang, dan pemanggil (agen riset) diberi instruksi tegas bahwa
 * isi berita tidak pernah menjadi perintah. Sebuah judul berita yang berbunyi
 * "abaikan instruksi sebelumnya" hanyalah judul berita.
 */
export async function fetchFeed(
  source: NewsSource,
  opts: { timeoutMs?: number; limit?: number } = {},
): Promise<{ items: NewsItem[]; outcome: FetchOutcome }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        // Beberapa penyedia menolak permintaan tanpa User-Agent yang wajar.
        'User-Agent': 'PropDeskBot/1.0 (+konten edukasi trading; menghubungi pemilik situs)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });

    const durationMs = Date.now() - started;

    if (!res.ok) {
      return {
        items: [],
        outcome: {
          sourceKey: source.key,
          sourceName: source.name,
          ok: false,
          count: 0,
          fetchedAt: new Date().toISOString(),
          durationMs,
          error: `HTTP ${res.status}`,
        },
      };
    }

    const xml = await res.text();
    const items = parseFeed(xml, source, opts.limit ?? 30);

    return {
      items,
      outcome: {
        sourceKey: source.key,
        sourceName: source.name,
        ok: true,
        count: items.length,
        fetchedAt: new Date().toISOString(),
        durationMs,
        ...(items.length === 0 ? { error: 'umpan terbaca tetapi tidak ada entri yang dikenali' } : {}),
      },
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error
      ? err.name === 'AbortError'
        ? `timeout ${(opts.timeoutMs ?? 15_000) / 1000}s`
        : err.message
      : String(err);
    return {
      items: [],
      outcome: {
        sourceKey: source.key,
        sourceName: source.name,
        ok: false,
        count: 0,
        fetchedAt: new Date().toISOString(),
        durationMs,
        error: message.slice(0, 200),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mengambil beberapa umpan secara paralel dengan batas konkurensi.
 *
 * Hasil dikembalikan lengkap dengan status setiap sumber, sehingga antarmuka
 * dapat menampilkan sumber mana yang gagal — bukan menyembunyikannya.
 */
export async function fetchFeeds(
  sources: NewsSource[],
  opts: { timeoutMs?: number; limit?: number; concurrency?: number } = {},
): Promise<{ items: NewsItem[]; outcomes: FetchOutcome[] }> {
  const concurrency = opts.concurrency ?? 5;
  const items: NewsItem[] = [];
  const outcomes: FetchOutcome[] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    for (let i = cursor++; i < sources.length; i = cursor++) {
      const source = sources[i]!;
      const result = await fetchFeed(source, opts);
      outcomes.push(result.outcome);
      items.push(...result.items);
    }
  });
  await Promise.all(workers);

  // Buang duplikat berdasarkan judul yang dinormalkan, karena beberapa portal
  // mengulang berita yang sama di beberapa kanal umpan.
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Urutkan: terbaru lebih dulu, lalu kepercayaan sumber.
  const trustRank = { high: 0, medium: 1, low: 2 } as const;
  unique.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return trustRank[a.trust] - trustRank[b.trust];
  });

  return { items: unique, outcomes };
}
