/**
 * Aturan kepatuhan.
 *
 * Aturan di sini adalah DATA, bukan logika yang tersebar. Setiap aturan
 * punya tipe pemeriksaan yang dijalankan mesin di `engine.ts`. Menambah
 * aturan baru tidak perlu mengubah mesin.
 *
 * Pembagian lapisan mengikuti PRD §13.2:
 *   L1_structure    — kelengkapan wajib (disclaimer, CTA, panjang, penanda waktu)
 *   L2_banned_phrase— frasa terlarang (deterministik, tidak bisa dibujuk)
 *   L3_claim_source — klaim angka wajib bersumber
 *   L4_framing      — penilaian nuansa (advisor; dijalankan model, bukan kode)
 *   L5_brand        — merek dan keterbacaan
 *
 * Lapisan L1, L2, L3, dan L5 di file ini bersifat DETERMINISTIK. Inilah alasan
 * kepatuhan tidak diserahkan sepenuhnya kepada model bahasa: model dapat
 * dibujuk dan keluarannya tidak konsisten, sedangkan frasa terlarang dan
 * disclaimer wajib harus diperiksa dengan cara yang sama setiap kali.
 */
import type { ComplianceLayer, ComplianceSeverity, SlideRole } from '../shared/types.ts';

/** Tipe pemeriksaan yang dikenali mesin. */
export type CheckType =
  /** Harus ada slide dengan salah satu peran ini. */
  | 'require_role'
  /** Jumlah slide harus berada dalam rentang yang diizinkan. */
  | 'slide_count_range'
  /** Slide pertama harus berperan hook. */
  | 'first_slide_is_hook'
  /** Tidak boleh ada judul atau isi yang kosong. */
  | 'no_empty_content'
  /** Wajib ada teks disclaimer yang dapat diselesaikan. */
  | 'require_disclaimer_text'
  /** Pola yang dilarang muncul di teks mana pun. */
  | 'forbidden_pattern'
  /** Angka pada slide wajib punya rujukan sumber (bergantung kategori). */
  | 'numeric_requires_source'
  /** Pola yang menandakan klaim atributif tanpa dasar. */
  | 'attribution_claim';

/** Definisi satu aturan. */
export interface ComplianceRule {
  key: string;
  name: string;
  description: string;
  layer: ComplianceLayer;
  severity: ComplianceSeverity;
  checkType: CheckType;
  /** Konfigurasi khusus tipe pemeriksaan. */
  config: Record<string, unknown>;
  /** Membatasi aturan pada kategori tertentu; kosong berarti semua kategori. */
  appliesToCategories?: string[];
}

/**
 * Aturan L1 — kelengkapan struktur.
 *
 * `require_role` untuk disclaimer dan CTA berlaku pada SEMUA kategori. Ini
 * keputusan yang disengaja: bahkan konten edukasi paling ringan pun tetap
 * membawa risiko jika pembaca menganggapnya nasihat keuangan.
 */
export const STRUCTURE_RULES: ComplianceRule[] = [
  {
    key: 'L1.disclaimer_present',
    name: 'Disclaimer wajib ada',
    description:
      'Setiap carousel harus memiliki slide berperan disclaimer. Tanpa ini, pembaca dapat menganggap materi sebagai nasihat keuangan.',
    layer: 'L1_structure',
    severity: 'block',
    checkType: 'require_role',
    config: { role: 'disclaimer' satisfies SlideRole, label: 'slide disclaimer' },
  },
  {
    key: 'L1.cta_present',
    name: 'Ajakan penutup wajib ada',
    description:
      'Carousel harus diakhiri slide berperan cta atau recap agar pembaca tahu tindakan berikutnya.',
    layer: 'L1_structure',
    severity: 'warn',
    checkType: 'require_role',
    config: { role: 'cta' satisfies SlideRole, altRole: 'recap' satisfies SlideRole, label: 'slide cta atau recap' },
  },
  {
    key: 'L1.first_slide_is_hook',
    name: 'Slide pertama harus hook',
    description:
      'Slide pertama menentukan sebagian besar performa. Tanpa peran hook, slide pembuka biasanya tidak cukup kuat menghentikan gulir.',
    layer: 'L1_structure',
    severity: 'warn',
    checkType: 'first_slide_is_hook',
    config: {},
  },
  {
    key: 'L1.no_empty_content',
    name: 'Tidak ada judul atau isi kosong',
    description: 'Slide dengan judul kosong tidak dapat dirender dengan benar.',
    layer: 'L1_structure',
    severity: 'block',
    checkType: 'no_empty_content',
    config: {},
  },
  {
    key: 'L1.disclaimer_text_resolvable',
    name: 'Teks disclaimer dapat ditemukan',
    description:
      'Kunci disclaimer pada carousel harus ada di brand kit, supaya slide disclaimer benar-benar berisi teks.',
    layer: 'L1_structure',
    severity: 'block',
    checkType: 'require_disclaimer_text',
    config: {},
  },
];

/**
 * Aturan L2 — frasa terlarang.
 *
 * Semua pola ditulis huruf kecil dan diuji terhadap teks yang sudah
 * dinormalkan. Pola sengaja lebar (mencakup variasi kata) karena satu
 * kebocoran klaim jauh lebih mahal daripada beberapa peringatan berlebih.
 */
export const BANNED_PHRASE_RULES: ComplianceRule[] = [
  {
    key: 'L2.guaranteed_profit',
    name: 'Klaim keuntungan pasti',
    description: 'Menjanjikan keuntungan atau meniadakan kemungkinan rugi. Dilarang pada semua kategori.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\b(pasti|dijamin|jaminan|terjamin|100\\s*%)\\s+(profit|untung|cuan|menang|naik|balik modal)',
        '\\b(profit|untung|cuan)\\s+(pasti|dijamin|terjamin|selalu|tanpa gagal|100\\s*%)',
        // Pola berikut memerlukan konteks "hasil" lebih dulu, karena frasa
        // "tanpa kerugian" sendirian sering dipakai untuk menjelaskan
        // mekanisme (mis. trailing drawdown), bukan menjanjikan hasil.
        '\\b(profit|untung|cuan|hasil|menang)\\b[^.]{0,40}\\btanpa\\s+(rugi|loss|kerugian)\\b',
        '\\b(nol|0)\\s+(rugi|loss|kerugian)\\b',
        '\\bselalu\\s+(profit|untung|cuan|menang)\\b',
        '\\bprofit\\s+konsisten\\b',
        '\\b(pasti|dijamin|terjamin)\\s+(payout|withdraw|penarikan|profit konsisten)',
      ],
      hint: 'Ganti dengan pernyataan bersyarat, misalnya "berpotensi" atau "bila rencana dijalankan konsisten".',
    },
  },
  {
    key: 'L2.risk_free',
    name: 'Klaim bebas risiko',
    description:
      'Menyiratkan trading tanpa risiko atau tanpa kemungkinan rugi. Bertentangan dengan kenyataan dan berbahaya bagi pembaca baru.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\bbebas\\s+risiko\\b',
        '\\baman\\s+tanpa\\s+risiko\\b',
        '\\brisiko\\s+nol\\b',
        '\\btanpa\\s+risiko\\b',
        // "tanpa rugi" bentuk pendek hampir selalu merupakan klaim, bukan
        // penjelasan mekanisme, sehingga tetap diblokir.
        '\\btanpa\\s+rugi\\b',
        '\\btanpa\\s+loss\\b',
        // Klaim eksplisit yang menyebut hasil dan ketiadaan kerugian sekaligus.
        '\\b(profit|untung|cuan|hasil)\\s+tanpa\\s+kerugian\\b',
        '\\bkerugian\\s+adalah\\s+hal\\s+yang\\s+mustahil\\b',
      ],
      hint: 'Selalu sebutkan bahwa trading mengandung risiko kehilangan modal.',
    },
  },
  {
    key: 'L2.risk_free_compound',
    name: 'Frasa "tanpa kerugian" pada konteks lain',
    description:
      'Frasa "tanpa kerugian" kadang dipakai untuk menjelaskan mekanisme (misalnya pada trailing drawdown), bukan untuk menjanjikan hasil. Karena itu perlu ditinjau manusia, bukan langsung diblokir.',
    layer: 'L2_banned_phrase',
    severity: 'warn',
    checkType: 'forbidden_pattern',
    config: {
      patterns: ['\\btanpa\\s+kerugian\\b'],
      hint:
        'Bila ini memang menjelaskan mekanisme, perjelas kalimatnya agar tidak terbaca sebagai janji, misalnya "tanpa kerugian yang direalisasikan". Bila ini klaim hasil, hapus.',
    },
  },
  {
    key: 'L2.fast_rich',
    name: 'Klaim cepat kaya',
    description: 'Menjanjikan hasil besar dalam waktu singkat. Pola iklan menyesatkan yang paling sering ditindak platform.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\bcepat\\s+kaya\\b',
        '\\bkaya\\s+(dalam|hanya)\\s+\\d+\\s*(hari|minggu|bulan)',
        '\\b(untung|cuan)\\s+besar\\s+dalam\\s+(sehari|sekejap|waktu singkat)',
        '\\bmodal\\s+kecil\\s+(untung|cuan)\\s+besar\\b',
      ],
      hint: 'Hapus klaim durasi. Fokuskan pada proses dan manajemen risiko, bukan hasil instan.',
    },
  },
  {
    key: 'L2.trade_call_to_action',
    name: 'Ajakan bertransaksi langsung',
    description:
      'Mengajak pembaca membuka posisi. Produk ini menghasilkan analisis skenario, bukan sinyal eksekusi.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\b(beli|buy|jual|sell|entry|masuk posisi|open posisi)\\s+(sekarang|now|segera|hari ini|malam ini)',
        '\\b(segera|ayo|yuk|wajib)\\s+(beli|buy|jual|sell|entry|open posisi)',
        '\\bsinyal\\s+(beli|jual|buy|sell)\\b',
      ],
      hint: 'Ubah menjadi pernyataan skenario, misalnya "bila harga bertahan di atas area X, yang diperhatikan adalah ...".',
    },
  },
  {
    key: 'L2.deposit_solicitation',
    name: 'Ajakan menaruh dana',
    description: 'Mengajak menyetor dana ke instrumen atau program tertentu.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\b(deposit|setor|transfer|top up)\\s+(sekarang|segera|hari ini|minimal)',
        '\\b(ayo|yuk|segera)\\s+(deposit|setor|join|gabung)\\b',
        '\\bdaftar\\s+sekarang\\s+untuk\\s+(profit|untung)',
      ],
      hint: 'Materi boleh menjelaskan mekanisme program, tetapi tidak boleh mengajak menyetor dana.',
    },
  },
  {
    key: 'L2.unfounded_licence',
    name: 'Klaim lisensi tanpa dasar',
    description:
      'Menyatakan entitas berlisensi, terdaftar, atau diawasi otoritas. Program evaluasi propfirm umumnya bukan entitas berlisensi di banyak yurisdiksi.',
    layer: 'L2_banned_phrase',
    severity: 'block',
    checkType: 'attribution_claim',
    config: {
      patterns: [
        '\\b(berlisensi|terlisensi|terdaftar|diawasi|diatur)\\s+(oleh\\s+)?(bappebti|ojk|otoritas|regulator|pemerintah)',
        '\\b(resmi|legal)\\s+(diawasi|terdaftar)\\b',
        '\\bbroker\\s+berlisensi\\b',
      ],
      hint: 'Gunakan penyebutan netral: "penyelenggara program evaluasi". Hindari klaim status hukum.',
    },
  },
  {
    key: 'L2.testimonial_income',
    name: 'Klaim penghasilan pribadi',
    description:
      'Menyebut angka penghasilan tanpa bukti yang dapat diverifikasi. Sulit dipertahankan dan sering ditindak platform.',
    layer: 'L2_banned_phrase',
    severity: 'warn',
    checkType: 'forbidden_pattern',
    config: {
      patterns: [
        '\\b(saya|kami|aku)\\s+(menghasilkan|profit|untung|dapat)\\s+(rp\\.?|idr|\\$|usd)\\s?[\\d.,]+',
        '\\bpenghasilan\\s+(saya|kami)\\s+(rp\\.?|idr|\\$|usd)',
      ],
      hint: 'Untuk jurnal trading, gunakan satuan R atau persentase risiko, bukan nominal rupiah/dolar.',
    },
  },
];

/**
 * Aturan L3 — klaim angka wajib bersumber.
 *
 * Hanya berlaku pada kategori yang memerlukan sumber. Slide yang memuat angka
 * tetapi tidak memiliki rujukan akan diblokir, karena angka tanpa sumber adalah
 * penyebab utama konten finansial kehilangan kredibilitas.
 */
export const CLAIM_SOURCE_RULES: ComplianceRule[] = [
  {
    key: 'L3.numeric_needs_source',
    name: 'Angka wajib punya rujukan sumber',
    description:
      'Slide yang menyebut angka (persentase, nominal, level harga) harus memiliki rujukan sumber yang dapat diperiksa.',
    layer: 'L3_claim_source',
    severity: 'block',
    checkType: 'numeric_requires_source',
    config: {
      // Rentang hari minimum/kecepatan yang tidak memerlukan sumber karena
      // merupakan penjelasan umum, bukan data pasar.
      ignorePatterns: ['\\b(maksimal|minimal|dalam)\\s+\\d+\\s+(hari|minggu|menit|jam)\\b'],
    },
  },
];

/**
 * Aturan L5 — merek dan keterbacaan.
 *
 * Diperiksa pada brand kit, bukan pada slide. Lihat `packages/shared/brand.ts`
 * untuk penerapannya; aturan ini terdokumentasi di sini agar seluruh kebijakan
 * kepatuhan terbaca di satu tempat.
 */
export const BRAND_RULES: ComplianceRule[] = [
  {
    key: 'L5.contrast',
    name: 'Kontras teks memadai',
    description: 'Rasio kontras teks terhadap latar minimal 4.5:1 agar terbaca di layar ponsel.',
    layer: 'L5_brand',
    severity: 'block',
    checkType: 'forbidden_pattern',
    config: { minRatio: 4.5, appliedInBrandValidator: true },
  },
  {
    key: 'L5.min_body_size',
    name: 'Ukuran teks isi memadai',
    description: 'Teks isi minimal 28px pada lebar 1080 agar tetap terbaca setelah dikompres platform.',
    layer: 'L5_brand',
    severity: 'warn',
    checkType: 'forbidden_pattern',
    config: { minBodyPx: 28, appliedInBrandValidator: true },
  },
];

/** Seluruh aturan deterministik yang dijalankan mesin kepatuhan. */
export const ALL_RULES: ComplianceRule[] = [
  ...STRUCTURE_RULES,
  ...BANNED_PHRASE_RULES,
  ...CLAIM_SOURCE_RULES,
];

/** Aturan yang berlaku untuk sebuah kategori. */
export function rulesForCategory(categoryKey: string, requiresSources: boolean): ComplianceRule[] {
  return ALL_RULES.filter((rule) => {
    if (rule.appliesToCategories && !rule.appliesToCategories.includes(categoryKey)) return false;
    // Aturan klaim angka hanya masuk akal pada kategori yang memang menuntut sumber.
    if (rule.checkType === 'numeric_requires_source' && !requiresSources) return false;
    return true;
  });
}
