/**
 * Perencana konten mingguan.
 *
 * MENGAPA MODUL INI ADA
 * Sebelumnya setiap carousel dibuat satu per satu, sehingga selalu ada
 * pertanyaan "besok bikin apa?" dan kategori tertentu terabaikan. Modul ini
 * menyusun rencana tujuh hari sekaligus, dengan memperhatikan:
 *
 *  1. Rotasi kategori — semua kategori aktif mendapat porsi tayang.
 *  2. Berita terbaru — kategori berita dan outlook mengambil topik dari berita
 *     yang benar-benar sedang terjadi, bukan dari daftar tetap.
 *  3. Riwayat konten — topik yang sudah pernah dibahas dihindari.
 *  4. Jam tayang per hari — mengikuti pola umum audiens Indonesia.
 *
 * Yang TIDAK dilakukan: rencana ini tidak langsung memproduksi carousel.
 * Rencana disimpan, pengguna meninjau, lalu memilih slot mana yang diproduksi.
 * Alasannya, memproduksi tujuh carousel otomatis tanpa tinjauan akan membuang
 * biaya untuk topik yang mungkin tidak diinginkan.
 */
import type {
  CategoryKey,
  ContentSignature,
  NewsItem,
  PlanSlot,
  WeeklyPlan,
} from '../shared/types.ts';
import { CATEGORY_ORDER, getCategory } from '../shared/categories.ts';
import { CATEGORY_THEMES } from '../templates/themes.ts';
import { extractKeywords } from '../memory/topics.ts';
import { selectRelevantNews } from '../news/select.ts';

/** Jam tayang per hari, mengikuti pola umum audiens Indonesia. */
const TIME_SLOTS: Record<number, string[]> = {
  0: ['19.00-21.00 WIB'],                                   // Minggu malam
  1: ['07.00-08.30 WIB', '12.00-13.00 WIB'],                // Senin
  2: ['07.00-08.30 WIB', '19.00-21.00 WIB'],                // Selasa
  3: ['12.00-13.00 WIB', '19.00-21.00 WIB'],                // Rabu
  4: ['07.00-08.30 WIB', '19.00-21.00 WIB'],                // Kamis
  5: ['12.00-13.00 WIB', '16.00-17.00 WIB'],                // Jumat
  6: ['09.00-11.00 WIB', '19.00-21.00 WIB'],                // Sabtu
};

/** Nama hari dalam bahasa Indonesia, indeks mengikuti `Date.getDay()`. */
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Pola rotasi kategori per hari.
 *
 * Urutannya disusun dengan alasan:
 *  - Senin: outlook, karena trader menyiapkan pekan.
 *  - Selasa: edukasi trading, saat perhatian masih tinggi.
 *  - Rabu: berita, karena data ekonomi biasanya dirilis pertengahan pekan.
 *  - Kamis: edukasi propfirm, materi yang mendorong simpan.
 *  - Jumat: jurnal, saat orang menutup pekan.
 *  - Sabtu: berita ringan atau edukasi, waktu santai.
 *  - Minggu: recap/edukasi untuk persiapan pekan.
 */
const ROTATION: Record<number, CategoryKey[]> = {
  0: ['edukasi_trading', 'market_outlook'],
  1: ['market_outlook', 'market_info'],
  2: ['edukasi_trading', 'market_info'],
  3: ['market_info', 'edukasi_propfirm'],
  4: ['edukasi_propfirm', 'edukasi_trading'],
  5: ['jurnal_trading', 'market_info'],
  6: ['edukasi_trading', 'jurnal_trading'],
};

/** Opsi penyusunan rencana. */
export interface PlanOptions {
  /** Tanggal mulai, format YYYY-MM-DD. Bawaan: hari ini. */
  startDate?: string;
  /** Jumlah hari yang direncanakan. Bawaan: 7. */
  days?: number;
  /** Kategori yang diaktifkan. Bawaan: seluruh kategori. */
  activeCategories?: CategoryKey[];
  /** Kategori yang ingin ditonjolkan; akan mendapat prioritas. */
  focusCategories?: CategoryKey[];
  /** Berita terbaru, dipakai untuk kategori yang butuh kebaruan. */
  news?: NewsItem[];
  /** Riwayat konten, dipakai untuk menghindari pengulangan topik. */
  history?: ContentSignature[];
  /** Saran tambahan dari pengguna untuk seluruh rencana. */
  extraInstructions?: string;
}

/** Menghasilkan tanggal dalam format YYYY-MM-DD pada zona waktu Indonesia. */
function toDateString(d: Date): string {
  // Zona waktu Jakarta adalah UTC+7 tanpa perubahan musim.
  const jakarta = new Date(d.getTime() + 7 * 3600_000);
  return jakarta.toISOString().slice(0, 10);
}

/** Daftar topik cadangan per kategori, dipakai bila berita tidak relevan. */
const FALLBACK_TOPICS: Record<CategoryKey, string[]> = {
  edukasi_trading: [
    'Membaca struktur pasar dengan higher high dan lower low',
    'Menentukan ukuran posisi berdasarkan risiko tetap',
    'Mengenali jebakan likuiditas di sekitar level penting',
    'Membaca konfirmasi sebelum masuk posisi',
    'Menyusun rencana trading yang dapat dijalankan konsisten',
  ],
  edukasi_propfirm: [
    'Perbedaan static dan trailing drawdown pada program evaluasi',
    'Aturan konsistensi dan cara menghitungnya',
    'Batas kerugian harian yang sering disalahpahami peserta',
    'Tahapan proses payout dan syarat yang perlu dipenuhi',
    'Kesalahan umum yang membuat akun evaluasi gugur',
  ],
  jurnal_trading: [
    'Evaluasi satu posisi kalah yang layak dicatat',
    'Pelajaran dari posisi yang keluar terlalu cepat',
    'Meninjau disiplin eksekusi selama sepekan',
    'Perbandingan hasil antara rencana dan kenyataan',
    'Menghitung ulang rasio risiko dan imbalan',
  ],
  market_info: [
    'Ringkasan pergerakan pasar pekan ini',
    'Dampak data ekonomi terbaru bagi trader retail',
    'Membaca reaksi pasar terhadap pernyataan bank sentral',
    'Sektor yang bergerak paling kuat pekan ini',
  ],
  market_outlook: [
    'Skenario arah indeks dolar untuk pekan depan',
    'Area kunci yang menentukan arah pasar',
    'Dua skenario dengan tingkat pembatalan yang jelas',
    'Menyusun rencana menghadapi volatilitas pekan depan',
  ],
};

/**
 * Memilih topik untuk satu slot.
 *
 * ATURAN PENTING YANG DIPELAJARI DARI PENGUJIAN
 *
 * Kategori evergreen (edukasi trading, edukasi propfirm, jurnal trading) TIDAK
 * boleh mengambil topik dari berita. Alasannya terlihat jelas saat pengujian:
 * rencana memberi topik "Kasus 1.048 Ton Udang Impor" untuk kategori jurnal
 * trading, dan berita merger perusahaan untuk kategori edukasi propfirm.
 * Kategori itu bersifat evergreen, sehingga topiknya harus berasal dari daftar
 * topik edukatif, bukan dari apa pun yang kebetulan muncul di kanal berita.
 *
 * Hanya kategori market_info dan market_outlook yang boleh mengambil topik dari
 * berita, karena keduanya memang tentang keadaan pasar saat ini.
 */

/** Kategori yang boleh mengambil topik dari berita terkini. */
const NEWS_DRIVEN_CATEGORIES: CategoryKey[] = ['market_info', 'market_outlook'];

/**
 * Ambang jumlah kata kunci yang harus bersamaan agar sebuah berita dianggap
 * benar-benar membahas topik yang dicari. Nol berarti hanya ada satu kata yang
 * kebetulan sama, dan itu menghasilkan topik yang tidak nyambung.
 */
const MIN_KEYWORD_OVERLAP = 2;

function chooseTopic(
  categoryKey: CategoryKey,
  news: NewsItem[],
  usedTopics: string[],
  history: ContentSignature[],
): { topic: string; rationale: string; newsRefs: string[] } {
  const usedWords = new Set([
    ...usedTopics.flatMap((t) => extractKeywords(t, 8)),
    ...history.flatMap((h) => h.keywords.slice(0, 6)),
  ]);

  // Hanya kategori yang memang tentang keadaan pasar yang mengambil topik dari
  // berita. Sisanya memakai daftar topik edukatif di bawah.
  if (news.length > 0 && NEWS_DRIVEN_CATEGORIES.includes(categoryKey)) {
    const fromNews = chooseTopicFromNews(categoryKey, news, usedWords);
    if (fromNews) return fromNews;
  }

  // Topik cadangan yang belum pernah dibahas.
  const fallbacks = FALLBACK_TOPICS[categoryKey];
  for (const topic of fallbacks) {
    if (usedTopics.includes(topic)) continue;
    const topicWords = extractKeywords(topic, 6);
    const overlap = topicWords.filter((k) => usedWords.has(k)).length;
    // Terima bila tidak terlalu mirip dengan yang sudah dibahas.
    if (overlap <= 2) {
      return {
        topic,
        rationale: 'Topik evergreen yang belum pernah dibahas di akun ini.',
        newsRefs: [],
      };
    }
  }

  // Pilihan terakhir: topik cadangan apa pun.
  const any = fallbacks[usedTopics.length % fallbacks.length] ?? getCategory(categoryKey).name;
  return {
    topic: any,
    rationale: 'Cadangan karena seluruh topik pilihan sudah pernah dibahas; pertimbangkan sudut pandang baru.',
    newsRefs: [],
  };
}

/**
 * Mencari topik dari berita untuk kategori yang memang berorientasi pasar.
 *
 * Menolak berita yang:
 *  - tidak berbahasa Indonesia, karena topiknya harus dapat langsung dipakai;
 *  - tidak cukup berbagi kata kunci dengan topik yang dicari;
 *  - berasal dari sumber kepercayaan rendah (hanya layak jadi bahan ide).
 *
 * Mengembalikan null bila tidak ada berita yang layak, sehingga pemanggil dapat
 * memakai topik cadangan — itu lebih baik daripada memaksa memakai berita yang
 * tidak nyambung.
 */
function chooseTopicFromNews(
  categoryKey: CategoryKey,
  news: NewsItem[],
  usedWords: Set<string>,
): { topic: string; rationale: string; newsRefs: string[] } | null {
  for (const hint of keywordHints(categoryKey)) {
    const hintWords = extractKeywords(hint, 6);
    // Kumpulkan berita berbahasa Indonesia yang memuat minimal dua kata kunci.
    const candidates = news
      .filter((item) => item.language === 'id' && item.trust !== 'low')
      .map((item) => {
        const itemWords = new Set(extractKeywords(`${item.title} ${item.summary}`, 24));
        const overlap = hintWords.filter((k) => itemWords.has(k)).length;
        return { item, overlap };
      })
      .filter((c) => c.overlap >= MIN_KEYWORD_OVERLAP)
      .sort((a, b) => b.overlap - a.overlap);

    for (const c of candidates) {
      const newsWords = extractKeywords(c.item.title, 6);
      // Lewati berita yang kata kuncinya sudah banyak terpakai.
      const alreadyUsed = newsWords.filter((k) => usedWords.has(k)).length;
      if (newsWords.length > 0 && alreadyUsed >= newsWords.length) continue;
      return {
        topic: c.item.title,
        rationale: `Diambil dari berita terbaru: ${c.item.sourceName}${c.item.publishedAt ? ` (${new Date(c.item.publishedAt).toLocaleDateString('id-ID')})` : ''}.`,
        newsRefs: [c.item.url ?? c.item.title],
      };
    }
  }
  return null;
}

/**
 * Kata kunci yang dipakai untuk mencari berita relevan per kategori.
 *
 * Untuk kategori yang berorientasi pasar, kata kuncinya harus cukup spesifik
 * agar tidak menangkap berita bisnis umum. Frasa dua kata dipakai dengan sengaja:
 * kata tunggal seperti "pasar" terlalu mudah bertemu dengan berita apa pun.
 */
function keywordHints(categoryKey: CategoryKey): string[] {
  switch (categoryKey) {
    case 'market_info':
      return [
        'inflasi suku bunga',
        'rupiah bank indonesia',
        'ihsg saham',
        'harga minyak komoditas',
        'data ekonomi rilis',
      ];
    case 'market_outlook':
      return [
        'prospek pasar pekan',
        'indeks dolar the fed',
        'ekspektasi kebijakan suku bunga',
        'sentimen pasar global',
      ];
    // Kategori berikut tidak mengambil topik dari berita, sehingga kata kunci
    // ini hanya dipakai bila seseorang memanggilnya secara eksplisit.
    case 'edukasi_trading':
      return ['strategi manajemen risiko'];
    case 'edukasi_propfirm':
      return ['aturan evaluasi drawdown'];
    case 'jurnal_trading':
      return ['evaluasi posisi trading'];
    default:
      return [];
  }
}

/**
 * Menyusun rencana konten mingguan.
 *
 * Fungsi ini TIDAK memanggil model bahasa dan tidak memakan biaya. Ia bekerja
 * dari rotasi tetap, berita nyata, dan riwayat konten. Hasilnya berupa daftar
 * slot yang dapat ditinjau manusia sebelum ada biaya produksi dikeluarkan.
 */
export function buildWeeklyPlan(opts: PlanOptions = {}): WeeklyPlan {
  const days = opts.days ?? 7;
  const start = opts.startDate ? new Date(`${opts.startDate}T00:00:00+07:00`) : new Date();
  const active = opts.activeCategories ?? [...CATEGORY_ORDER];
  const focus = new Set(opts.focusCategories ?? []);
  const news = opts.news ?? [];
  const history = opts.history ?? [];

  const usedTopics: string[] = [];
  const slots: PlanSlot[] = [];
  const warnings: string[] = [];

  // Kategori yang diminta tidak aktif tidak akan muncul di rencana.
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * 86400_000);
    const weekdayIndex = date.getDay();
    const weekday = WEEKDAYS[weekdayIndex] ?? 'Senin';

    // Ambil kandidat rotasi untuk hari ini, saring yang aktif, lalu dahulukan
    // kategori fokus bila ada.
    const rotation = (ROTATION[weekdayIndex] ?? []).filter((k) => active.includes(k));
    const ordered = [
      ...rotation.filter((k) => focus.has(k)),
      ...rotation.filter((k) => !focus.has(k)),
    ];

    // Bila rotasi tidak menyediakan kategori aktif, pakai kategori aktif pertama.
    const categoryKey = ordered[0] ?? active[i % Math.max(1, active.length)];
    if (!categoryKey) {
      warnings.push(`Tidak ada kategori aktif untuk ${weekday} ${toDateString(date)}.`);
      continue;
    }

    const category = getCategory(categoryKey);
    const theme = CATEGORY_THEMES[categoryKey];
    const chosen = chooseTopic(categoryKey, news, usedTopics, history);
    usedTopics.push(chosen.topic);

    const times = TIME_SLOTS[weekdayIndex] ?? ['19.00-21.00 WIB'];
    const suggestedTime = times[0] ?? '19.00-21.00 WIB';

    slots.push({
      date: toDateString(date),
      weekday,
      categoryKey,
      topic: chosen.topic,
      angle: `Pendekatan tema ${theme?.name ?? category.name}: ${theme?.intent ?? category.description}`,
      rationale: chosen.rationale,
      newsRefs: chosen.newsRefs,
      factRefs: [],
      suggestedTime,
      timeSensitive: category.requiresAsOf,
    });
  }

  // Peringatan bila kategori aktif tidak mendapat slot sama sekali.
  for (const key of active) {
    if (!slots.some((s) => s.categoryKey === key)) {
      warnings.push(
        `Kategori "${getCategory(key).name}" tidak mendapat slot dalam ${days} hari. Pertimbangkan menambah hari atau mengubah rotasi.`,
      );
    }
  }

  // Peringatan bila tidak ada berita untuk kategori yang memerlukannya.
  const needsNews = slots.filter((s) => getCategory(s.categoryKey).requiresAsOf);
  if (needsNews.length > 0 && news.length === 0) {
    warnings.push(
      `${needsNews.length} slot memerlukan berita terkini, tetapi tidak ada berita yang tersedia. Slot tersebut akan memakai topik cadangan.`,
    );
  }

  // Peringatan bila topik yang terpilih bukan berbahasa Indonesia. Untuk akun
  // berbahasa Indonesia, topik berbahasa asing tidak dapat langsung dipakai.
  const foreign = slots.filter((s) => {
    if (s.newsRefs.length === 0) return false;
    const letters = s.topic.replace(/[^a-zA-Z\s]/g, '');
    // Penanda sederhana: kata fungsi Indonesia yang khas.
    const indonesianMarkers = /\b(dan|yang|untuk|dengan|dari|pada|ini|itu|akan|tidak|telah|adalah|di|ke|naik|turun|pasar|harga|saham|rupiah|dolar)\b/i;
    return !indonesianMarkers.test(letters) && s.topic.split(/\s+/).length > 4;
  });
  if (foreign.length > 0) {
    warnings.push(
      `${foreign.length} topik berasal dari berita berbahasa asing. Sesuaikan judulnya ke bahasa Indonesia sebelum diproduksi, atau ubah topiknya.`,
    );
  }

  const periodStart = toDateString(start);
  const periodEnd = toDateString(new Date(start.getTime() + (days - 1) * 86400_000));

  return {
    // ID harus unik walaupun dua rencana disusun pada milidetik yang sama;
    // karena itu ada bagian acak di belakang cap waktu.
    id: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    periodStart,
    periodEnd,
    createdAt: new Date().toISOString(),
    strategyNote: buildStrategyNote(slots, opts.extraInstructions),
    slots,
    warnings,
  };
}

/** Menyusun catatan strategi ringkas untuk rencana. */
function buildStrategyNote(slots: PlanSlot[], extraInstructions?: string): string {
  const counts = new Map<CategoryKey, number>();
  for (const s of slots) counts.set(s.categoryKey, (counts.get(s.categoryKey) ?? 0) + 1);

  const distribution = [...counts.entries()]
    .map(([k, n]) => `${getCategory(k).name} ${n}×`)
    .join(', ');

  const parts = [
    `Rencana ${slots.length} hari dengan rotasi: ${distribution}.`,
    'Kategori berita dan outlook ditempatkan pada hari kerja karena data ekonomi biasanya dirilis pertengahan pekan, sedangkan jurnal ditempatkan menjelang akhir pekan saat trader menutup posisi.',
  ];

  const timeSensitive = slots.filter((s) => s.timeSensitive).length;
  if (timeSensitive > 0) {
    parts.push(
      `${timeSensitive} slot bersifat peka waktu: produksinya sebaiknya beberapa jam sebelum tayang agar datanya masih segar.`,
    );
  }

  if (extraInstructions) {
    parts.push(`Permintaan khusus pemilik akun: ${extraInstructions}`);
  }

  return parts.join(' ');
}

/** Mencetak rencana dalam bentuk tabel yang mudah dibaca. */
export function formatPlan(plan: WeeklyPlan): string {
  const lines: string[] = [
    `=== Rencana Konten ${plan.periodStart} sampai ${plan.periodEnd} ===`,
    '',
    plan.strategyNote,
    '',
  ];

  for (const slot of plan.slots) {
    const category = getCategory(slot.categoryKey);
    const mark = slot.timeSensitive ? ' ⏱' : '';
    lines.push(`${slot.weekday.padEnd(7)} ${slot.date}  ${slot.suggestedTime.padEnd(16)} ${category.name}${mark}`);
    lines.push(`         Topik   : ${slot.topic}`);
    lines.push(`         Alasan  : ${slot.rationale}`);
    if (slot.newsRefs.length > 0) lines.push(`         Rujukan : ${slot.newsRefs[0]?.slice(0, 70)}`);
    lines.push('');
  }

  if (plan.warnings.length > 0) {
    lines.push('Peringatan:');
    for (const w of plan.warnings) lines.push(`  - ${w}`);
  }

  lines.push('Simbol ⏱ berarti slot peka waktu: data harus segar saat produksi.');
  return lines.join('\n');
}
