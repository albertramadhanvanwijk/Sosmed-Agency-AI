/**
 * Model domain PropDesk AI — tipe inti.
 *
 * Prinsip yang tercermin di file ini:
 *  - LLM hanya menghasilkan DATA terstruktur (slide spec), bukan gambar.
 *  - Semua konten terikat pada kategori yang membawa aturan risikonya sendiri.
 *  - Setiap klaim faktual wajib punya rujukan sumber dan penanda waktu (as_of).
 *
 * File ini tidak mengimpor apa pun agar bisa dipakai di semua paket.
 */

// ---------------------------------------------------------------------------
// Kategori konten
// ---------------------------------------------------------------------------

/** Lima kategori konten yang menjadi cakupan produk. */
export type CategoryKey =
  | 'edukasi_trading'
  | 'edukasi_propfirm'
  | 'jurnal_trading'
  | 'market_info'
  | 'market_outlook';

/** Tingkat risiko kepatuhan sebuah kategori. Menentukan ketatnya pemeriksaan. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Definisi kategori beserta aturan yang mengikat produksinya. */
export interface CategoryDefinition {
  key: CategoryKey;
  name: string;
  /** Penjelasan singkat untuk prompt agen. */
  description: string;
  riskLevel: RiskLevel;
  /** Klaim angka wajib punya rujukan sumber. */
  requiresSources: boolean;
  /** Wajib menyertakan penanda waktu data (penting untuk berita). */
  requiresAsOf: boolean;
  /**
   * Boleh disetujui secara massal. Dilarang untuk kategori berisiko tinggi
   * (outlook/signal) karena butuh perhatian manusia per carousel.
   */
  allowsBulkApprove: boolean;
  /** Frekuensi tayang yang disarankan per minggu. */
  defaultFrequencyPerWeek: number;
  /** Rentang jumlah slide yang disarankan. */
  slideRange: { min: number; max: number };
  /** Kerangka slide yang disarankan, dipakai sebagai panduan Composer. */
  outline: { role: SlideRole; purpose: string }[];
  /** Slot template yang paling cocok untuk kategori ini. */
  preferredTemplates: string[];
}

/** Peran sebuah slide di dalam alur naratif carousel. */
export type SlideRole =
  | 'hook'
  | 'body'
  | 'example'
  | 'checklist'
  | 'recap'
  | 'cta'
  | 'disclaimer';

/** Jenis visual yang diizinkan pada sebuah slide. */
export type SlideVisualType =
  | 'none'
  | 'abstract_bg'
  | 'chart_snapshot'
  | 'table'
  | 'stat_tile';

// ---------------------------------------------------------------------------
// Slide spec — kontrak data antara LLM dan renderer
// ---------------------------------------------------------------------------

/** Satu baris pada visual bertipe tabel. */
export interface TableRow {
  cells: string[];
}

/** Spesifikasi visual sebuah slide. Renderer memetakannya ke komponen template. */
export interface SlideVisualSpec {
  type: SlideVisualType;
  /** Untuk `table`: judul kolom dan barisnya. */
  table?: {
    columns: string[];
    rows: TableRow[];
  };
  /** Untuk `stat_tile`: kumpulan angka besar yang ditonjolkan. */
  stats?: { label: string; value: string; note?: string }[];
  /** Untuk `chart_snapshot`: rujukan ke aset gambar grafik yang sudah ada. */
  chartAssetRef?: string;
  /** Untuk `abstract_bg`: penanda gaya latar, bukan gambar hasil AI. */
  abstractStyle?: 'grid' | 'diagonal' | 'dots' | 'wave' | 'none';
  /** Keterangan alt untuk aksesibilitas. */
  altText?: string;
}

/** Satu slide dalam carousel. */
export interface Slide {
  position: number;
  role: SlideRole;
  /** Judul slide, maksimal 8 kata. */
  headline: string;
  /** Isi slide; boleh null untuk slide yang hanya menampilkan judul besar. */
  body: string | null;
  /** Poin-poin singkat; dipakai pada slide bertipe daftar. */
  bullets: string[];
  /** Frasa di dalam headline/body yang perlu penekanan visual. */
  emphasis: string[];
  visual: SlideVisualSpec;
  /** Kunci template spesifik untuk slide ini; bila kosong dipakai template carousel. */
  templateKey?: string;
  /** Rujukan ke entri fact sheet yang mendukung klaim pada slide ini. */
  sourceRefs: string[];
  /** Jumlah kata terhitung; diisi oleh validator, bukan oleh LLM. */
  wordCount?: number;
}

/** Rangkuman seluruh carousel — inilah yang dirender. */
export interface CarouselSpec {
  /** Judul internal carousel (tidak tampil di slide). */
  title: string;
  categoryKey: CategoryKey;
  /** Kunci disclaimer yang dipakai; wajib ada pada kategori berisiko. */
  disclaimerKey: string;
  /** Bahasa keluaran. */
  locale: string;
  /** Penanda waktu data. Wajib untuk kategori berita/outlook. */
  asOf?: string;
  /** Ajakan bertindak yang dipilih pengguna; ditampilkan pada slide cta. */
  callToAction?: CallToAction;
  slides: Slide[];
}

// ---------------------------------------------------------------------------
// Fact sheet — jejak sumber untuk setiap klaim
// ---------------------------------------------------------------------------

/** Satu klaim faktual dengan sumbernya. */
export interface FactEntry {
  /** Kunci rujukan yang dipakai di `Slide.sourceRefs`. */
  id: string;
  /** Klaim yang diringkas dalam satu kalimat. */
  claim: string;
  /** Nama sumber yang dapat diperiksa manusia. */
  sourceName: string;
  sourceUrl?: string;
  /** Waktu data berlaku; wajib untuk fakta pasar. */
  asOf: string;
  /** Tingkat keyakinan atas klaim ini. */
  confidence: 'low' | 'medium' | 'high';
}

/** Hasil kerja agen riset untuk satu brief. */
export interface FactSheet {
  entries: FactEntry[];
  /** Catatan bila data terbatas; ditampilkan kepada manusia saat review. */
  limitations?: string;
}

// ---------------------------------------------------------------------------
// Brand kit
// ---------------------------------------------------------------------------

/** Token visual sebuah merek. Semuanya dipakai template; tidak ada nilai ajaib di template. */
export interface BrandTokens {
  colors: {
    /** Warna latar utama slide. */
    background: string;
    /** Warna panel/kartu di atas latar. */
    surface: string;
    /** Warna utama merek. */
    primary: string;
    /** Warna aksen untuk penekanan. */
    accent: string;
    /** Warna teks utama. */
    text: string;
    /** Warna teks sekunder. */
    muted: string;
    /** Warna garis/batas. */
    border: string;
    /** Warna untuk keadaan positif (profit/aman). */
    positive: string;
    /** Warna untuk keadaan negatif (loss/peringatan). */
    negative: string;
  };
  fonts: {
    /** Nama keluarga font untuk judul; harus tersedia di sistem atau disematkan. */
    heading: string;
    /** Nama keluarga font untuk isi. */
    body: string;
  };
  /** Skala tipografi dasar dalam piksel pada lebar desain 1080. */
  typography: {
    baseScale: number;
    /** Ukuran minimum teks isi; di bawah ini dilarang karena tidak terbaca di HP. */
    minBodyPx: number;
  };
  spacing: {
    /** Jarak tepi aman dari sisi slide. */
    padding: number;
    /** Jarak antar elemen. */
    gap: number;
  };
  radius: {
    card: number;
    badge: number;
  };
  /** Gaya sudut kartu dan aksen. */
  style: {
    cornerStyle: 'rounded' | 'sharp' | 'mixed';
    /** Ketebalan garis batas dekoratif; 0 berarti tanpa garis. */
    borderWidth: number;
  };
}

/** Identitas merek lengkap untuk satu klien. */
export interface BrandKit {
  id: string;
  name: string;
  tokens: BrandTokens;
  /** Teks disclaimer yang tersedia untuk dipakai carousel. */
  disclaimers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Kepatuhan
// ---------------------------------------------------------------------------

/** Tingkat keparahan sebuah temuan. `block` menghentikan publikasi. */
export type ComplianceSeverity = 'block' | 'warn' | 'info';

/** Hasil satu pemeriksaan. */
export type ComplianceResult = 'pass' | 'fail' | 'warn' | 'skipped';

/** Lapisan pemeriksaan, sesuai PRD §13.2. */
export type ComplianceLayer =
  | 'L1_structure'
  | 'L2_banned_phrase'
  | 'L3_claim_source'
  | 'L4_framing'
  | 'L5_brand';

/** Satu temuan kepatuhan. */
export interface ComplianceFinding {
  ruleKey: string;
  ruleName: string;
  layer: ComplianceLayer;
  severity: ComplianceSeverity;
  result: ComplianceResult;
  /** Lokasi temuan, mis. `slide:4`. */
  subjectRef: string;
  /** Kutipan teks yang memicu temuan. */
  evidence?: string;
  /** Saran perbaikan konkret. */
  suggestion?: string;
  /** Siapa yang memutuskan: aturan kode atau penilaian model. */
  decidedBy: 'rule_engine' | 'llm' | 'human';
}

/** Laporan kepatuhan lengkap untuk satu carousel. */
export interface ComplianceReport {
  findings: ComplianceFinding[];
  /** Kesimpulan: apakah boleh lanjut ke review manusia. */
  outcome: 'pass' | 'warn' | 'block';
  /** Benar bila ada temuan severity `block`. */
  blocked: boolean;
  checkedAt: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Biaya
// ---------------------------------------------------------------------------

/** Satu baris catatan biaya pemakaian model. */
export interface CostEntry {
  at: string;
  agentKey: string;
  model: string;
  /** Jumlah token masukan dan keluaran. */
  tokensIn: number;
  tokensOut: number;
  /** Perkiraan biaya dalam USD; 0 bila model lokal/gratis. */
  amountUsd: number;
  /** Benar bila jawaban diambil dari cache sehingga tidak ada biaya baru. */
  cached: boolean;
  latencyMs: number;
}

/** Rekap biaya satu kali produksi carousel. */
export interface CostReport {
  entries: CostEntry[];
  totalTokensIn: number;
  totalTokensOut: number;
  totalUsd: number;
  /** Jumlah panggilan model nyata (bukan cache). */
  billableCalls: number;
  /** Total detik yang dihemat karena cache. */
  savedLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Hasil produksi
// ---------------------------------------------------------------------------

/** Berkas yang dihasilkan untuk satu carousel. */
export interface RenderedOutput {
  /** Jalur absolut di disk; berkas TIDAK di-upload otomatis. */
  path: string;
  ratioProfile: RatioProfile;
  kind: 'slide_png' | 'carousel_pdf' | 'zip' | 'caption_txt';
  slidePosition?: number;
  width?: number;
  height?: number;
  byteSize?: number;
}

/** Profil rasio keluaran render. */
export type RatioProfile =
  | 'ig_portrait'
  | 'square'
  | 'story'
  | 'linkedin_pdf'
  | 'pinterest';

/** Hasil lengkap satu kali produksi carousel. */
export interface ProductionResult {
  carouselId: string;
  spec: CarouselSpec;
  factSheet: FactSheet;
  captions: CaptionSet;
  compliance: ComplianceReport;
  cost: CostReport;
  outputs: RenderedOutput[];
  /** Ringkasan langkah yang benar-benar berjalan, untuk jejak audit. */
  steps: StepTrace[];
  startedAt: string;
  finishedAt: string;
  /** Peringatan non-fatal, mis. sumber berita yang gagal diambil. */
  warnings?: string[];
}

/** Jejak satu langkah produksi. */
export interface StepTrace {
  stepKey: string;
  agentKey: string;
  status: 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
  durationMs: number;
  /** Catatan singkat hasil langkah. */
  note: string;
  /** Pesan galat bila langkah gagal. */
  error?: string;
}

/** Kumpulan caption untuk berbagai platform. */
export interface CaptionSet {
  variants: CaptionVariant[];
  /** Indeks varian yang disarankan; manusia tetap dapat memilih. */
  recommendedIndex: number;
}

/** Caption untuk satu platform. */
export interface CaptionVariant {
  platform: PlatformKey;
  hook: string;
  body: string;
  hashtags: string[];
  cta: string;
}

/** Platform distribusi yang didukung. */
export type PlatformKey =
  | 'instagram'
  | 'facebook'
  | 'threads'
  | 'linkedin'
  | 'tiktok'
  | 'x'
  | 'pinterest';

// ---------------------------------------------------------------------------
// Sumber berita
// ---------------------------------------------------------------------------

/** Sumber berita RSS/Atom. */
export interface NewsSource {
  key: string;
  name: string;
  url: string;
  language: 'id' | 'en';
  /** Tingkat kepercayaan; `low` tidak boleh dipakai sebagai rujukan fakta. */
  trust: 'high' | 'medium' | 'low';
  /** Kategori yang cocok memakai sumber ini. */
  scope: CategoryKey[];
  /** Benar bila sumber fokus pada pasar/keuangan. */
  markets: boolean;
  enabled: boolean;
}

/** Satu berita hasil pengambilan umpan. */
export interface NewsItem {
  sourceKey: string;
  sourceName: string;
  title: string;
  summary: string;
  url?: string;
  /** Waktu terbit menurut sumber; null bila tidak dapat dikenali. */
  publishedAt: string | null;
  trust: 'high' | 'medium' | 'low';
  language: 'id' | 'en';
}

// ---------------------------------------------------------------------------
// Logo & merek pada carousel
// ---------------------------------------------------------------------------

/**
 * Logo yang dipasang pada slide.
 *
 * Bila `inlineSvg` diisi, logo dipakai langsung sebagai SVG di dalam dokumen
 * sehingga tidak memerlukan berkas gambar terpisah. Bila `assetPath` diisi,
 * berkas gambar dibaca lalu disematkan sebagai data URI. Dua cara itu dipilih
 * supaya hasil render tetap mandiri: halaman tidak bergantung pada berkas luar
 * saat dimuat Chromium, sehingga tidak ada risiko gambar gagal dimuat.
 */
export interface BrandLogo {
  /** Nama untuk ditampilkan di antarmuka. */
  label: string;
  /** Posisi logo pada slide. */
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Tinggi logo dalam piksel pada kanvas acuan 1080x1350. */
  heightPx: number;
  /** SVG mentah; dipakai bila diisi. */
  inlineSvg?: string;
  /** Jalur berkas gambar (png/jpg/svg); dibaca lalu disematkan sebagai data URI. */
  assetPath?: string;
  /** Teks alternatif untuk aksesibilitas. */
  altText: string;
}

/**
 * Merek teks yang tampil di slide.
 *
 * Dipisahkan dari logo supaya keduanya dapat dipakai sendiri-sendiri: ada
 * merek yang punya logo tanpa nama pendek, dan ada yang hanya ingin namanya
 * tampil sebagai teks.
 */
export interface BrandMark {
  /** Nama pendek yang tampil, mis. "PropDesk". */
  shortName: string;
  /** Baris kedua opsional, mis. "Trading Education". */
  tagline?: string;
  /** Teks lencana opsional di sudut slide, mis. "EDUKASI". */
  badge?: string;
}

// ---------------------------------------------------------------------------
// Ajakan bertindak & masukan tambahan dari pengguna
// ---------------------------------------------------------------------------

/**
 * Ajakan bertindak (call to action) yang dapat dikonfigurasi.
 *
 * Bentuknya berbeda-beda tergantung tujuan, sehingga isinya berupa struktur
 * dan bukan satu kalimat tetap. Dengan begitu template dapat menampilkannya
 * dengan benar: kode promo perlu kotak tersendiri, dan ajakan bergabung
 * komunitas perlu nama komunitas yang ditonjolkan.
 */
export interface CallToAction {
  /** Jenis ajakan; menentukan cara template menampilkannya. */
  kind: 'save' | 'follow' | 'community' | 'promo' | 'consult';
  /** Kalimat utama ajakan. */
  headline: string;
  /** Penjelasan tambahan; opsional. */
  detail?: string;
  /** Kode promo yang perlu ditonjolkan; hanya untuk `promo`. */
  promoCode?: string;
  /** Batas waktu promo dalam format YYYY-MM-DD; hanya untuk `promo`. */
  validUntil?: string;
  /** Nama komunitas atau kanal; untuk `community`. */
  communityName?: string;
}

/** Gambar yang diunggah pengguna untuk disisipkan ke slide. */
export interface UploadedImage {
  /** Jalur berkas lokal. */
  path: string;
  /** Nama asli berkas, untuk ditampilkan di antarmuka. */
  originalName: string;
  /** Jenis isi, mis. image/png. */
  mimeType: string;
  /** Ukuran dalam byte. */
  byteSize: number;
  /** Saran penempatan pada slide mana; opsional. */
  slidePosition?: number;
  /** Keterangan yang ikut ditampilkan sebagai teks alt. */
  caption?: string;
}

/** Bahan tambahan dari pengguna saat meminta produksi carousel. */
export interface ProducerInput {
  /** Saran tambahan agar konten lebih informatif. */
  extraInstructions?: string;
  /** Ajakan bertindak yang diinginkan. */
  callToAction?: CallToAction;
  /** Gambar yang diunggah pengguna untuk disisipkan. */
  uploadedImages?: UploadedImage[];
  /** Catatan revisi untuk produksi ulang. */
  revisionNote?: string;
}

// ---------------------------------------------------------------------------
// Renungan (reflection) atas revisi
// ---------------------------------------------------------------------------

/**
 * Satu aturan yang dipelajari dari revisi manusia.
 *
 * Inilah yang membuat agen menjadi lebih baik seiring waktu: setiap kali
 * seseorang menolak atau meminta revisi, alasannya diterjemahkan menjadi
 * aturan yang disisipkan ke prompt produksi berikutnya.
 */
export interface LearnedRule {
  id: string;
  /** Kategori yang terpengaruh; null berarti berlaku untuk semua kategori. */
  categoryKey: CategoryKey | null;
  /** Aturan yang dipelajari, ditulis sebagai instruksi singkat. */
  rule: string;
  /** Alasan di balik aturan ini; membantu model memahaminya. */
  rationale: string;
  /** Berapa kali revisi serupa terjadi. */
  occurrences: number;
  /** Tingkat kepercayaan 0 sampai 1; naik ketika aturan yang sama berulang. */
  confidence: number;
  /** Asal aturan: dari manusia langsung atau disimpulkan agen. */
  createdBy: 'human' | 'agent';
  createdAt: string;
  lastSeenAt: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Deteksi konten duplikat
// ---------------------------------------------------------------------------

/** Ringkasan satu carousel yang pernah dibuat, untuk mendeteksi duplikasi. */
export interface ContentSignature {
  carouselId: string;
  categoryKey: CategoryKey;
  title: string;
  /** Kata kunci utama yang pernah dibahas. */
  keywords: string[];
  /** Sidik jari isi untuk perbandingan cepat. */
  fingerprint: string;
  createdAt: string;
}

/** Hasil pemeriksaan kesamaan terhadap konten sebelumnya. */
export interface SimilarityHit {
  carouselId: string;
  title: string;
  categoryKey: CategoryKey;
  createdAt: string;
  /** Skor kesamaan 0 sampai 1. */
  score: number;
  /** Kata kunci yang bertumbukan. */
  sharedKeywords: string[];
}

// ---------------------------------------------------------------------------
// Rencana konten mingguan
// ---------------------------------------------------------------------------

/** Draf copy untuk satu slot rencana (Item 10). */
export interface CopyDraft {
  hook: string;
  body: string;
  hashtags: string[];
  cta: string;
}

/** Satu slot konten dalam rencana mingguan. */
export interface PlanSlot {
  /** Tanggal tayang yang disarankan, format YYYY-MM-DD. */
  date: string;
  /** Hari dalam bahasa Indonesia, mis. "Senin". */
  weekday: string;
  categoryKey: CategoryKey;
  /** Topik yang disarankan. */
  topic: string;
  /** Sudut pandang singkat. */
  angle: string;
  /** Alasan mengapa topik ini relevan. */
  rationale: string;
  /** Rujukan berita yang mendasari, bila ada. */
  newsRefs: string[];
  /** Rujukan fakta yang sudah tersimpan di basis data. */
  factRefs: string[];
  /** Jam tayang yang disarankan. */
  suggestedTime: string;
  /** Apakah slot ini untuk kategori yang butuh kebaruan tinggi. */
  timeSensitive: boolean;
  /** Draf copy dari copywriter untuk slot ini (Item 10). */
  copyDraft?: CopyDraft;
  /** Status persetujuan copy: draft → approved → produksi skip copywriter. */
  copyStatus?: 'draft' | 'approved' | 'needs_regeneration';
}

/** Rencana konten satu minggu. */
export interface WeeklyPlan {
  id: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  /** Catatan strategi keseluruhan. */
  strategyNote: string;
  slots: PlanSlot[];
  /** Peringatan, mis. sumber berita yang gagal diambil. */
  warnings: string[];
}
