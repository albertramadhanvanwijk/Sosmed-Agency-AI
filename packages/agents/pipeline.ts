/**
 * Pipeline produksi carousel: sembilan agen bekerja berurutan.
 *
 * Alur:
 *   1. Strategist        -> brief (angle, pesan kunci)
 *   2. Research          -> fact sheet bersumber
 *   3. Copywriter        -> caption per platform
 *   4. Carousel Composer -> slide spec (DATA, bukan gambar)
 *   5. Compliance        -> rule engine deterministik (lapisan MEMBLOKIR)
 *   6. Compliance advisor-> penilaian nuansa oleh model (lapisan penasihat)
 *   7. Renderer          -> HTML menjadi PNG/PDF (bukan model bahasa)
 *   8. Scheduler         -> saran waktu tayang
 *   9. Analyst           -> penilaian dan aset yang layak disimpan
 *
 * Dua hal yang disengaja dari desain ini:
 *
 *   - Semua model bahasa hanya menghasilkan DATA. Tidak ada satu pun yang
 *     diminta menggambar. Penyebabnya ada di ADR-01: teks yang dihasilkan
 *     model gambar sering salah huruf, dan konten finansial tidak boleh salah
 *     angka.
 *   - Kepatuhan diperiksa DUA KALI dengan sifat berbeda. Lapisan kode bersifat
 *     memblokir dan tidak dapat dibujuk. Lapisan model hanya dapat menambah
 *     peringatan. Dengan begitu, keluaran model tidak pernah dapat meloloskan
 *     dirinya sendiri.
 *
 * Bila ada langkah gagal, pipeline BERHENTI dan mengembalikan galat yang
 * menjelaskan langkah mana yang gagal. Kelanjutan otomatis ke publikasi tidak
 * pernah terjadi tanpa persetujuan manusia.
 */
import { randomUUID } from 'node:crypto';
import type {
  BrandLogo,
  BrandMark,
  BrandTokens,
  CallToAction,
  CarouselSpec,
  CaptionSet,
  CategoryDefinition,
  ComplianceFinding,
  ComplianceReport,
  CostReport,
  FactSheet,
  ProductionResult,
  RatioProfile,
  Slide,
  SlideRole,
  StepTrace,
  UploadedImage,
} from '../shared/types.ts';
import { getCategory } from '../shared/categories.ts';
import { DEFAULT_DISCLAIMERS } from '../shared/brand.ts';
import { applyTheme } from '../templates/themes.ts';
import { budgetsToPrompt, visualConstraintFor } from '../templates/text-budget.ts';
import { fetchFeeds } from '../news/rss.ts';
import { formatNewsBrief } from '../news/select.ts';
import { sourcesForCategory } from '../news/feeds.ts';
import { LlmClient } from '../llm/client.ts';
import {
  PROMPT_VERSION,
  analystSystem,
  analystUser,
  complianceAdvisorSystem,
  complianceAdvisorUser,
  composerSystem,
  composerUser,
  copywriterSystem,
  copywriterUser,
  researchSystem,
  researchUser,
  strategistSystem,
  strategistUser,
  type AnalystOutput,
  type StrategistOutput,
} from '../agents/prompts.ts';
import { checkCompliance, formatComplianceReport } from '../compliance/engine.ts';
import { validateSlide, resolveTemplate, type SlideValidationIssue } from '../templates/registry.ts';
import { renderCarousel, type RenderResult } from '../renderer/index.ts';

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

/** Permintaan produksi. */
export interface ProduceRequest {
  categoryKey: string;
  topic: string;
  brandName: string;
  tokens: BrandTokens;
  /** Kunci disclaimer yang dipakai. */
  disclaimerKey?: string;
  /** Kumpulan disclaimer yang tersedia; bila kosong memakai bawaan. */
  disclaimers?: Record<string, string>;
  /** Profil rasio yang dirender. */
  ratios: RatioProfile[];
  /** Direktori dasar keluaran. */
  outputBaseDir: string;
  /** Nama folder keluaran. */
  folderName: string;
  /** Penanda waktu data. Bila kosong diisi waktu sekarang. */
  asOf?: string;
  /** Catatan tambahan untuk Strategist. */
  audienceNote?: string;
  /** Saran tambahan langsung dari pengguna agar konten lebih informatif. */
  extraInstructions?: string;
  /** Ajakan bertindak yang diinginkan. */
  callToAction?: CallToAction;
  /** Gambar yang diunggah pengguna, sudah dalam bentuk data URI. */
  uploadedImages?: UploadedImage[];
  /** Ringkasan konten yang pernah dibuat, agar tidak mengulang topik. */
  historyBrief?: string;
  /** Aturan hasil pembelajaran dari revisi manusia. */
  learnedRules?: string;
  /** Peran/logo merek yang dipasang pada slide. */
  logo?: BrandLogo;
  /** Merek teks; opsional. */
  brandMark?: BrandMark;
  /** Benar untuk melewati cache model dan meminta variasi baru. */
  fresh?: boolean;
  verbose?: boolean;
  /**
   * Dipanggil setiap sebuah langkah dimulai. Dipakai antarmuka Studio untuk
   * menampilkan kemajuan dan status agen di Virtual Agent Office secara nyata.
   */
  onStep?: (stepKey: string, agentKey: string) => void;
}

/** Hasil satu langkah pipeline. */
interface StepOutcome<T> {
  value: T;
  trace: StepTrace;
}

/** Galat pipeline yang menyebut langkah penyebabnya. */
export class PipelineError extends Error {
  readonly stepKey: string;
  readonly agentKey: string;
  readonly detail?: unknown;

  constructor(message: string, stepKey: string, agentKey: string, detail?: unknown) {
    super(message);
    this.name = 'PipelineError';
    this.stepKey = stepKey;
    this.agentKey = agentKey;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Pembantu
// ---------------------------------------------------------------------------

/** Menghitung kata pada seluruh field teks slide. */
function countSlideWords(slide: Slide): number {
  const parts = [slide.headline, slide.body ?? '', ...slide.bullets];
  return parts.reduce((total, part) => {
    const words = part.trim().split(/\s+/).filter(Boolean).length;
    return total + words;
  }, 0);
}

/** Memastikan nilai role sah; mengembalikan null bila tidak dikenal. */
function asRole(value: unknown): SlideRole | null {
  const allowed: SlideRole[] = ['hook', 'body', 'example', 'checklist', 'recap', 'cta', 'disclaimer'];
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as SlideRole) : null;
}

/**
 * Membuat keterangan gambar unggahan untuk dikirim ke Composer.
 *
 * Composer perlu tahu bahwa sebuah gambar akan muncul pada slide tertentu,
 * supaya teks di sekitarnya benar-benar membahas isi gambar itu — bukan sekadar
 * menempel gambar sebagai hiasan.
 */
function describeUploadedImages(images: UploadedImage[]): string {
  return images
    .map((img, i) => {
      const placement = img.slidePosition
        ? `ditempatkan pada slide ${img.slidePosition}`
        : 'penempatan diserahkan ke sistem (biasanya slide ke-2)';
      const caption = img.caption ? `; keterangan: ${img.caption}` : '';
      return `  ${i + 1}. ${img.originalName} — ${placement}${caption}`;
    })
    .join('\n');
}

/**
 * Memeriksa apakah ukuran visual sebuah slide melebihi batas yang diuji.
 *
 * Dipisah dari `validateSlide` (yang memeriksa teks) karena batas visual
 * berasal dari modul anggaran yang berbeda, dan pesan galatnya perlu menyebut
 * angka konkret agar model dapat memperbaikinya.
 */
function validateVisualSize(slide: Slide): SlideValidationIssue[] {
  const issues: SlideValidationIssue[] = [];
  const v = slide.visual;
  if (!v) return issues;
  const c = visualConstraintFor(v.type);

  if (v.type === 'table' && v.table) {
    if (v.table.rows.length > c.maxRows) {
      issues.push({
        slidePosition: slide.position,
        field: 'structure',
        message: `Tabel memiliki ${v.table.rows.length} baris, melebihi batas ${c.maxRows}. Kurangi baris atau pecah menjadi dua slide.`,
        severity: v.table.rows.length > c.maxRows + 1 ? 'block' : 'warn',
      });
    }
    if (v.table.columns.length > c.maxColumns) {
      issues.push({
        slidePosition: slide.position,
        field: 'structure',
        message: `Tabel memiliki ${v.table.columns.length} kolom, melebihi batas ${c.maxColumns}.`,
        severity: 'block',
      });
    }
    // Sel yang terlalu panjang membuat baris tabel membengkak dan memicu
    // luapan walaupun jumlah barisnya sedikit.
    for (const [i, row] of v.table.rows.entries()) {
      const longest = row.cells.reduce((m, cell) => Math.max(m, cell.length), 0);
      if (longest > c.maxCellChars) {
        issues.push({
          slidePosition: slide.position,
          field: 'structure',
          message: `Baris ${i + 1} tabel memiliki sel sepanjang ${longest} karakter, melebihi batas ${c.maxCellChars}.`,
          severity: 'block',
        });
      }
    }
    // Slide bertabel yang isinya masih panjang hampir pasti meluap.
    const body = slide.body ?? '';
    if (body.length > 180) {
      issues.push({
        slidePosition: slide.position,
        field: 'body',
        message: `Slide bertabel memuat isi ${body.length} karakter. Slide bertabel hanya muat isi pendek; pindahkan penjelasan ke slide berikutnya.`,
        severity: 'block',
      });
    }
  }

  if (v.type === 'stat_tile' && v.stats) {
    if (v.stats.length > c.maxCards) {
      issues.push({
        slidePosition: slide.position,
        field: 'structure',
        message: `Kartu angka berjumlah ${v.stats.length}, melebihi batas ${c.maxCards}.`,
        severity: 'warn',
      });
    }
    for (const [i, s] of v.stats.entries()) {
      if (s.note && s.note.length > c.maxNoteChars) {
        issues.push({
          slidePosition: slide.position,
          field: 'structure',
          message: `Keterangan kartu ${i + 1} sepanjang ${s.note.length} karakter, melebihi batas ${c.maxNoteChars}.`,
          severity: 'warn',
        });
      }
    }
  }

  return issues;
}

/**
 * Membangun ringkasan batas panjang teks untuk dikirim ke Composer.
 *
 * Angka diambil dari modul anggaran teks (`text-budget.ts`) supaya hanya ada
 * SATU sumber kebenaran. Sebelumnya daftar batas ditulis ulang di sini, dan itu
 * berbahaya: ketika anggaran diperbaiki di modul anggaran, salinan di sini akan
 * tertinggal dan model tetap diminta menulis teks yang terlalu panjang.
 *
 * Batasnya dihitung untuk profil rasio yang benar-benar akan dirender, karena
 * kanvas yang lebih tinggi menampung teks lebih banyak.
 */
function buildLimitsBrief(category: CategoryDefinition, ratio: RatioProfile): string {
  // Satu entri per peran unik, memakai template pertama yang cocok untuk peran
  // tersebut pada kategori ini.
  const seen = new Set<string>();
  const entries: { role: SlideRole; templateSlug: string }[] = [];
  for (const item of category.outline) {
    if (seen.has(item.role)) continue;
    seen.add(item.role);
    const slug =
      category.preferredTemplates.find((slug) => roleMatchesTemplate(item.role, slug)) ??
      category.preferredTemplates[0] ??
      item.role;
    entries.push({ role: item.role, templateSlug: slug });
  }
  return budgetsToPrompt(entries, ratio);
}

/**
 * Menebak apakah sebuah template cocok untuk peran slide tertentu, berdasarkan
 * namanya. Hanya dipakai untuk menyusun label pada instruksi ke model; pemilihan
 * template yang sebenarnya dilakukan `resolveTemplate`.
 */
function roleMatchesTemplate(role: SlideRole, slug: string): boolean {
  const map: Record<SlideRole, string[]> = {
    hook: ['hook'],
    body: ['concept', 'rule', 'table', 'news'],
    example: ['scenario', 'journal', 'stat', 'concept'],
    checklist: ['checklist'],
    recap: ['recap'],
    cta: ['recap', 'takeaway'],
    disclaimer: ['disclaimer'],
  };
  return (map[role] ?? []).some((token) => slug.includes(token));
}

/** Memperbaiki slide spec dari model agar sesuai tipe dan urutan yang benar. */
function normalizeSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) throw new Error('Keluaran Composer tidak memuat larik "slides".');
  return raw.map((item, index) => {
    const s = item as Record<string, unknown>;
    const role = asRole(s.role);
    if (!role) throw new Error(`Slide #${index + 1} memiliki role tidak dikenal: ${JSON.stringify(s.role)}`);

    const visualRaw = (s.visual ?? { type: 'none' }) as Record<string, unknown>;
    const slide: Slide = {
      // Posisi selalu ditetapkan ulang dari urutan, bukan dipercaya dari model.
      position: index + 1,
      role,
      headline: String(s.headline ?? '').trim(),
      body: s.body === null || s.body === undefined || String(s.body).trim() === '' ? null : String(s.body).trim(),
      bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b).trim()).filter(Boolean) : [],
      emphasis: Array.isArray(s.emphasis) ? s.emphasis.map((e) => String(e).trim()).filter(Boolean).slice(0, 2) : [],
      visual: normalizeVisual(visualRaw),
      sourceRefs: Array.isArray(s.sourceRefs) ? s.sourceRefs.map((r) => String(r).trim()).filter(Boolean) : [],
    };
    if (typeof s.templateKey === 'string' && s.templateKey.trim()) slide.templateKey = s.templateKey.trim();
    slide.wordCount = countSlideWords(slide);
    return slide;
  });
}

/** Membersihkan spesifikasi visual dari model. */
function normalizeVisual(raw: Record<string, unknown>): Slide['visual'] {
  const allowed = ['none', 'abstract_bg', 'chart_snapshot', 'table', 'stat_tile'];
  const type = (allowed.includes(String(raw.type)) ? String(raw.type) : 'none') as Slide['visual']['type'];
  const out: Slide['visual'] = { type };

  if (type === 'abstract_bg') {
    const styles = ['grid', 'diagonal', 'dots', 'wave', 'none'];
    const style = String(raw.abstractStyle ?? 'glow');
    out.abstractStyle = (styles.includes(style) ? style : 'grid') as NonNullable<Slide['visual']['abstractStyle']>;
  }

  if (type === 'table' && raw.table) {
    const t = raw.table as { columns?: unknown; rows?: unknown };
    const columns = Array.isArray(t.columns) ? t.columns.map(String).slice(0, 3) : [];
    const rows = Array.isArray(t.rows)
      ? t.rows.slice(0, 4).map((r) => {
          const cells = Array.isArray((r as { cells?: unknown }).cells)
            ? ((r as { cells: unknown[] }).cells.map(String))
            : [];
          // Ratakan agar jumlah sel selalu sama dengan jumlah kolom.
          while (cells.length < columns.length) cells.push('-');
          return { cells: cells.slice(0, columns.length) };
        })
      : [];
    if (columns.length >= 2 && rows.length >= 1) out.table = { columns, rows };
    else out.type = 'none';
  }

  if (type === 'stat_tile' && raw.stats) {
    const stats = Array.isArray(raw.stats)
      ? raw.stats.slice(0, 4).map((s) => {
          const o = s as { label?: unknown; value?: unknown; note?: unknown };
          return {
            label: String(o.label ?? '').trim(),
            value: String(o.value ?? '').trim(),
            ...(o.note ? { note: String(o.note).trim() } : {}),
          };
        }).filter((s) => s.label && s.value)
      : [];
    if (stats.length >= 2) out.stats = stats;
    else out.type = 'none';
  }

  if (type === 'chart_snapshot') {
    // Model tidak punya gambar grafik; ini hanya penanda tempat.
    out.chartAssetRef = typeof raw.chartAssetRef === 'string' ? raw.chartAssetRef : 'belum ada berkas grafik';
  }

  return out;
}

/** Membentuk caption set dari keluaran Copywriter. */
function normalizeCaptions(raw: {
  hook?: unknown;
  body?: unknown;
  hashtags?: unknown;
  cta?: unknown;
}): CaptionSet {
  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags.map((h) => String(h).trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`))
    : [];
  const variant = {
    platform: 'instagram' as const,
    hook: String(raw.hook ?? '').trim(),
    body: String(raw.body ?? '').trim(),
    hashtags: hashtags.slice(0, 10),
    cta: String(raw.cta ?? '').trim(),
  };
  return { variants: [variant], recommendedIndex: 0 };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** Menjalankan seluruh pipeline produksi untuk satu carousel. */
export async function produceCarousel(
  req: ProduceRequest,
  llm: LlmClient,
): Promise<ProductionResult> {
  const startedAt = new Date().toISOString();
  const category = getCategory(req.categoryKey);
  const carouselId = randomUUID();
  const traces: StepTrace[] = [];
  const disclaimers = { ...DEFAULT_DISCLAIMERS, ...(req.disclaimers ?? {}) };
  const disclaimerKey = req.disclaimerKey ?? (category.riskLevel === 'high' ? 'outlook_signal' : category.requiresSources ? 'propfirm_program' : 'default_finansial');
  const asOf = req.asOf ?? new Date().toISOString();
  const log = req.verbose ? (msg: string) => console.log(msg) : () => {};

  // --- Persiapkan bahan pendukung sebelum pipeline dimulai -----------------
  //
  // Berita diambil HANYA untuk kategori yang memerlukannya. Pengambilan umpan
  // dilakukan di sini (bukan oleh agen) supaya:
  //  1. isi umpan melewati pembersih HTML di satu tempat, dan
  //  2. kegagalan sebuah sumber tidak menggagalkan seluruh produksi.
  //
  // Semua isi berita diperlakukan sebagai DATA tidak dipercaya. Judul berita
  // tidak pernah menjadi instruksi bagi agen.
  let newsBrief: string | null = null;
  const newsWarnings: string[] = [];
  if (category.requiresAsOf) {
    const sources = sourcesForCategory(category.key);
    if (sources.length > 0) {
      log(`\n[berita] mengambil ${sources.length} sumber untuk kategori ${category.name}`);
      const { items, outcomes } = await fetchFeeds(sources, { limit: 18, timeoutMs: 12_000, concurrency: 6 });
      for (const o of outcomes) {
        if (!o.ok) newsWarnings.push(`${o.sourceName}: ${o.error ?? 'gagal'}`);
      }
      if (items.length > 0) {
        newsBrief = formatNewsBrief(items, req.topic);
        log(`   ${items.length} berita terkumpul dari ${outcomes.filter((o) => o.ok).length} sumber`);
      } else {
        log('   tidak ada berita yang berhasil diambil; agen riset akan menyatakan keterbatasan datanya');
      }
    }
  }

  /** Menjalankan satu langkah dan mencatat jejaknya. */
  async function step<T>(stepKey: string, agentKey: string, note: (value: T) => string, fn: () => Promise<T>): Promise<T> {
    const stepStart = Date.now();
    const stepStartIso = new Date().toISOString();
    log(`\n[${stepKey}] ${agentKey}`);
    // Beri tahu pemanggil bahwa langkah ini dimulai, supaya antarmuka dapat
    // menampilkan agen mana yang sedang bekerja.
    req.onStep?.(stepKey, agentKey);
    try {
      const value = await fn();
      traces.push({
        stepKey,
        agentKey,
        status: 'succeeded',
        startedAt: stepStartIso,
        durationMs: Date.now() - stepStart,
        note: note(value),
      });
      return value;
    } catch (err) {
      traces.push({
        stepKey,
        agentKey,
        status: 'failed',
        startedAt: stepStartIso,
        durationMs: Date.now() - stepStart,
        note: 'langkah gagal',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new PipelineError(
        `Langkah "${stepKey}" (agen ${agentKey}) gagal: ${err instanceof Error ? err.message : String(err)}`,
        stepKey,
        agentKey,
        err,
      );
    }
  }

  // --- Langkah 1: Strategist ------------------------------------------------
  const brief = await step(
    'brief',
    'strategist',
    (b: StrategistOutput) => `angle: ${b.angle}`,
    async () => {
      const { value } = await llm.callJson<StrategistOutput>(
        {
          taskClass: 'decision',
          agentKey: 'strategist',
          system: strategistSystem,
          user: strategistUser({
            category,
            topic: req.topic,
            ...(req.audienceNote ? { audienceNote: req.audienceNote } : {}),
            ...(req.extraInstructions ? { extraInstructions: req.extraInstructions } : {}),
            ...(req.historyBrief ? { historyBrief: req.historyBrief } : {}),
            ...(req.learnedRules ? { learnedRules: req.learnedRules } : {}),
          }),
          temperature: 0.6,
          bypassCache: req.fresh,
          cacheContext: {
            topic: req.topic,
            category: category.key,
            audience: req.audienceNote ?? null,
            extra: req.extraInstructions ?? null,
            // Riwayat dan pelajaran ikut masuk kunci cache supaya perubahan
            // memori benar-benar menghasilkan keluaran baru, bukan hasil lama.
            history: req.historyBrief ? true : null,
            rules: req.learnedRules ? true : null,
            promptVersion: PROMPT_VERSION,
          },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as Partial<StrategistOutput>;
          if (typeof o.angle !== 'string' || o.angle.trim().length < 8) return 'Field "angle" harus berupa teks minimal 8 karakter.';
          if (!Array.isArray(o.keyMessages) || o.keyMessages.length < 2) return 'Field "keyMessages" harus berisi minimal 2 pesan.';
          if (typeof o.hookDirection !== 'string' || o.hookDirection.trim().length < 8) return 'Field "hookDirection" harus berupa teks minimal 8 karakter.';
          if (typeof o.title !== 'string' || o.title.trim().length === 0) return 'Field "title" tidak boleh kosong.';
          if (!['save', 'reach', 'trust', 'educate'].includes(String(o.objective))) {
            return 'Field "objective" harus salah satu dari: save, reach, trust, educate.';
          }
          return null;
        },
      );
      return value;
    },
  );

  // --- Langkah 2: Research -------------------------------------------------
  const factSheet = await step(
    'research',
    'research',
    (f: FactSheet) => `${f.entries.length} entri fakta`,
    async () => {
      const { value } = await llm.callJson<FactSheet>(
        {
          taskClass: 'transform',
          agentKey: 'research',
          system: researchSystem,
          user: researchUser({
            category,
            topic: req.topic,
            angle: brief.angle,
            keyMessages: brief.keyMessages,
            hasLiveNews: newsBrief !== null,
            ...(newsBrief ? { newsBrief } : {}),
          }),
          temperature: 0.3,
          bypassCache: req.fresh,
          cacheContext: {
            topic: req.topic,
            category: category.key,
            angle: brief.angle,
            // Berita berubah setiap kali diambil, jadi hasilnya tidak boleh
            // diambil dari cache bila berita baru tersedia.
            news: newsBrief ? newsBrief.slice(0, 400) : null,
            promptVersion: PROMPT_VERSION,
          },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as Partial<FactSheet>;
          if (!Array.isArray(o.entries) || o.entries.length < 2) return 'Field "entries" harus berisi minimal 2 entri fakta.';
          const ids = new Set<string>();
          for (const [i, e] of o.entries.entries()) {
            const entry = e as Partial<FactSheet['entries'][number]>;
            if (typeof entry.id !== 'string' || !entry.id.trim()) return `Entri #${i + 1} tidak memiliki "id".`;
            if (ids.has(entry.id)) return `ID entri "${entry.id}" duplikat; setiap id harus unik.`;
            ids.add(entry.id);
            if (typeof entry.claim !== 'string' || entry.claim.trim().length < 10) return `Entri #${i + 1} tidak memiliki "claim" yang memadai.`;
            if (typeof entry.sourceName !== 'string' || !entry.sourceName.trim()) return `Entri #${i + 1} tidak memiliki "sourceName".`;
            if (typeof entry.asOf !== 'string' || Number.isNaN(Date.parse(entry.asOf))) return `Entri #${i + 1} tidak memiliki "asOf" berupa tanggal ISO yang sah.`;
            if (!['low', 'medium', 'high'].includes(String(entry.confidence))) return `Entri #${i + 1} memiliki "confidence" tidak sah.`;
          }
          return null;
        },
      );
      return {
        entries: value.entries.map((e) => ({
          id: e.id,
          claim: e.claim,
          sourceName: e.sourceName,
          ...(e.sourceUrl ? { sourceUrl: e.sourceUrl } : {}),
          asOf: e.asOf,
          confidence: e.confidence,
        })),
        ...(value.limitations ? { limitations: value.limitations } : {}),
      };
    },
  );

  // --- Langkah 3: Copywriter -----------------------------------------------
  const captions = await step(
    'caption',
    'copywriter',
    (c: CaptionSet) => `caption ${c.variants[0]?.body.length ?? 0} karakter, ${c.variants[0]?.hashtags.length ?? 0} hashtag`,
    async () => {
      const { value } = await llm.callJson<{ hook: string; body: string; hashtags: string[]; cta: string }>(
        {
          taskClass: 'transform',
          agentKey: 'copywriter',
          system: copywriterSystem,
          user: copywriterUser({
            category,
            topic: req.topic,
            angle: brief.angle,
            keyMessages: brief.keyMessages,
            facts: factSheet.entries.map((e) => ({ id: e.id, claim: e.claim })),
            brandName: req.brandName,
          }),
          temperature: 0.7,
          bypassCache: req.fresh,
          cacheContext: { topic: req.topic, angle: brief.angle, brand: req.brandName, promptVersion: PROMPT_VERSION },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as { hook?: unknown; body?: unknown; hashtags?: unknown; cta?: unknown };
          if (typeof o.hook !== 'string' || o.hook.trim().length < 5) return 'Field "hook" harus berupa teks minimal 5 karakter.';
          if (typeof o.body !== 'string' || o.body.trim().length < 40) return 'Field "body" harus berisi caption yang memadai (minimal 40 karakter).';
          if (!Array.isArray(o.hashtags) || o.hashtags.length < 3) return 'Field "hashtags" harus berisi minimal 3 tagar.';
          if (typeof o.cta !== 'string' || o.cta.trim().length < 5) return 'Field "cta" harus berupa teks minimal 5 karakter.';
          return null;
        },
      );
      return normalizeCaptions(value);
    },
  );

  // --- Langkah 4: Carousel Composer ---------------------------------------
  const slides = await step(
    'compose',
    'composer',
    (s: Slide[]) => `${s.length} slide`,
    async () => {
      const { value } = await llm.callJson<{ slides: unknown[] }>(
        {
          taskClass: 'transform',
          agentKey: 'composer',
          system: composerSystem,
          user: composerUser({
            category,
            topic: req.topic,
            angle: brief.angle,
            hookDirection: brief.hookDirection,
            keyMessages: brief.keyMessages,
            facts: factSheet.entries.map((e) => ({ id: e.id, claim: e.claim })),
            brandName: req.brandName,
            slideRange: category.slideRange,
            outline: category.outline,
            limits: buildLimitsBrief(category, req.ratios[0] ?? 'ig_portrait'),
            requiresSources: category.requiresSources,
            asOf,
            ...(req.callToAction ? { callToAction: req.callToAction } : {}),
            ...(req.uploadedImages && req.uploadedImages.length > 0
              ? { uploadedImageNotes: describeUploadedImages(req.uploadedImages) }
              : {}),
            ...(req.historyBrief ? { historyBrief: req.historyBrief } : {}),
            ...(req.learnedRules ? { learnedRules: req.learnedRules } : {}),
          }),
          temperature: 0.5,
          maxOutputTokens: 8000,
          bypassCache: req.fresh,
          cacheContext: {
            topic: req.topic,
            angle: brief.angle,
            category: category.key,
            cta: req.callToAction?.kind ?? null,
            images: req.uploadedImages?.length ?? 0,
            history: req.historyBrief ? true : null,
            rules: req.learnedRules ? true : null,
            promptVersion: PROMPT_VERSION,
          },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as { slides?: unknown[] };
          if (!Array.isArray(o.slides)) return 'Field "slides" harus berupa larik.';
          if (o.slides.length < category.slideRange.min || o.slides.length > category.slideRange.max + 2) {
            return `Jumlah slide harus antara ${category.slideRange.min} dan ${category.slideRange.max}, diterima ${o.slides.length}.`;
          }
          for (const [i, s] of o.slides.entries()) {
            const item = s as { role?: unknown; headline?: unknown };
            if (!asRole(item.role)) return `Slide #${i + 1} memiliki "role" tidak sah: ${JSON.stringify(item.role)}.`;
            if (typeof item.headline !== 'string' || item.headline.trim().length === 0) return `Slide #${i + 1} harus memiliki "headline" berupa teks.`;
          }
          const hasDisclaimer = o.slides.some((s) => (s as { role?: unknown }).role === 'disclaimer');
          if (!hasDisclaimer) return 'Carousel harus memiliki tepat satu slide dengan role "disclaimer" di akhir.';
          return null;
        },
      );
      const normalized = normalizeSlides(value.slides);

      // Pastikan slide disclaimer terisi otomatis dari brand kit, bukan dari
      // model. Teks kepatuhan tidak boleh bergantung pada kreativitas model.
      const disclaimerText = disclaimers[disclaimerKey] ?? DEFAULT_DISCLAIMERS.default_finansial!;
      for (const slide of normalized) {
        if (slide.role === 'disclaimer') {
          if (!slide.headline || slide.headline.trim().length === 0) {
            slide.headline = 'Sebelum Anda Mengambil Keputusan';
          }
          slide.body = disclaimerText;
        }
      }
      return normalized;
    },
  );

  const spec: CarouselSpec = {
    title: brief.title || req.topic,
    categoryKey: category.key,
    disclaimerKey,
    locale: 'id-ID',
    asOf,
    slides,
  };

  // --- Langkah 5: Kepatuhan deterministik (MEMBLOKIR) ---------------------
  const compliance = await step(
    'compliance_rules',
    'compliance',
    (r: ComplianceReport) => r.summary,
    async () => checkCompliance(spec, { disclaimerText: disclaimers[disclaimerKey] }, {}),
  );

  // --- Langkah 6: Penilaian nuansa oleh model (penasihat) -----------------
  const advisorFindings = await step(
    'compliance_advisor',
    'compliance',
    (f: ComplianceFinding[]) => (f.length === 0 ? 'tidak ada temuan nuansa' : `${f.length} temuan nuansa`),
    async () => {
      const { value } = await llm.callJson<{
        findings: { slidePosition?: unknown; issue?: unknown; evidence?: unknown; suggestion?: unknown }[];
      }>(
        {
          taskClass: 'decision',
          agentKey: 'compliance_advisor',
          system: complianceAdvisorSystem,
          user: complianceAdvisorUser({
            category,
            slideTexts: slides.map((s) => [s.headline, s.body ?? '', ...s.bullets].filter(Boolean).join(' | ')),
          }),
          temperature: 0.1,
          bypassCache: req.fresh,
          cacheContext: { topic: req.topic, category: category.key, promptVersion: PROMPT_VERSION },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as { findings?: unknown };
          if (!Array.isArray(o.findings)) return 'Field "findings" harus berupa larik (boleh kosong).';
          for (const [i, f] of o.findings.entries()) {
            const item = f as { issue?: unknown; evidence?: unknown };
            if (typeof item.issue !== 'string' || !item.issue.trim()) return `Temuan #${i + 1} harus memiliki "issue" berupa teks.`;
            if (typeof item.evidence !== 'string' || !item.evidence.trim()) return `Temuan #${i + 1} harus memiliki "evidence" berupa kutipan.`;
          }
          return null;
        },
      );
      return value.findings.slice(0, 5).map<ComplianceFinding>((f, i) => {
        const pos = Number(f.slidePosition);
        return {
          ruleKey: `L4.nuance_${i + 1}`,
          ruleName: 'Penilaian nuansa oleh model',
          layer: 'L4_framing',
          // Selalu peringatan, tidak pernah blokir: keputusan akhir ada di kode
          // dan di manusia, bukan pada penilaian model.
          severity: 'warn',
          result: 'warn',
          subjectRef: Number.isFinite(pos) && pos >= 1 ? `slide:${pos}` : 'carousel',
          evidence: `${String(f.issue)} — kutipan: "${String(f.evidence)}"`,
          ...(f.suggestion ? { suggestion: String(f.suggestion) } : {}),
          decidedBy: 'llm',
        } as ComplianceFinding;
      });
    },
  );

  const fullCompliance: ComplianceReport = {
    ...compliance,
    findings: [...compliance.findings, ...advisorFindings],
    outcome:
      compliance.blocked
        ? 'block'
        : advisorFindings.length > 0
          ? 'warn'
          : compliance.outcome,
    summary: `${compliance.summary}${advisorFindings.length > 0 ? `, ${advisorFindings.length} catatan nuansa` : ''}`,
  };

  // Catatan: pemeriksaan kepatuhan memakai versi SEBELUM pratinjau dirapikan,
  // dan pemeriksaan ulang dilakukan setelah pratinjau karena perapian itu
  // mengubah teks — dan teks berubah berarti hasil pemeriksaan lama tidak lagi
  // berlaku untuk isi yang benar-benar akan terbit.
  // Validasi slide DILAKUKAN sebelum render, termasuk batas visual. Tabel yang
  // terlalu besar adalah penyebab kegagalan render yang paling mahal: seluruh
  // carousel gagal setelah puluhan panggilan model terlanjur dibayar. Karena
  // itu masalahnya dideteksi di sini, dan pesannya menyebut slide yang salah.
  const previewIssues: SlideValidationIssue[] = [];
  for (const slide of slides) {
    const template = resolveTemplate(slide);
    previewIssues.push(...validateSlide(slide, template));
    previewIssues.push(...validateVisualSize(slide));
  }

  /**
   * Menghapus penekanan (emphasis) yang setelah dirender ternyata menjadi
   * teks yatim: frasa ada di daftar penekanan, tetapi tidak ditemukan lagi di
   * dalam judul atau isi slide.
   *
   * Kasus nyata yang memunculkan fungsi ini: sebuah penekanan berbunyi
   * "analisis ini batal bila harga tutup di bawah support harian", sementara
   * teks slide menyebut "titik invalidasi" — sehingga tidak ada yang tercetak
   * walaupun model menandai ada yang perlu ditekankan.
   */
  function pruneOrphanEmphasis(list: Slide[]): number {
    let removed = 0;
    for (const slide of list) {
      const haystack = `${slide.headline} ${slide.body ?? ''} ${slide.bullets.join(' ')}`.toLowerCase();
      const kept = slide.emphasis.filter((phrase) => haystack.includes(phrase.toLowerCase()));
      removed += slide.emphasis.length - kept.length;
      slide.emphasis = kept;
    }
    return removed;
  }

  const removedEmphasis = pruneOrphanEmphasis(slides);
  if (removedEmphasis > 0) {
    log(`   menyingkirkan ${removedEmphasis} penekanan yang tidak ditemukan pada teks slide`);
  }

  // --- Gerbang: bila diblokir, jangan lanjut ke render --------------------
  if (fullCompliance.blocked) {
    throw new PipelineError(
      [
        'Carousel diblokir oleh pemeriksaan kepatuhan (lapisan wajib).',
        '',
        formatComplianceReport(fullCompliance),
        '',
        'Perbaiki temuan bertanda [BLOKIR] lalu jalankan ulang.',
      ].join('\n'),
      'compliance_rules',
      'compliance',
    );
  }

  // --- Langkah 7: Render ke gambar ----------------------------------------
  const renderResult = await step(
    'render',
    'renderer',
    (r: RenderResult) => `${r.outputs.length} berkas dalam ${(r.durationMs / 1000).toFixed(1)}s`,
    async () => {
      // Periksa kesesuaian teks dengan batas template lebih dulu, agar pesan
      // galatnya menyebut slide dan field yang perlu diperbaiki. Pemeriksaan ini
      // memakai hasil pemeriksaan setelah pratinjau dirapikan.
      const blocking = previewIssues.filter((i) => i.severity === 'block');
      if (blocking.length > 0) {
        throw new Error(
          [
            'Teks slide melampaui batas template:',
            ...blocking.map((i) => `  slide ${i.slidePosition} (${i.field}): ${i.message}`),
          ].join('\n'),
        );
      }

      return renderCarousel(spec, applyTheme(req.tokens, category.key), {
        ratios: req.ratios,
        outputBaseDir: req.outputBaseDir,
        folderName: req.folderName,
        brandName: req.brandName,
        categoryLabel: category.name.toUpperCase(),
        categoryKey: category.key,
        disclaimerText: disclaimers[disclaimerKey],
        ...(req.logo ? { logo: req.logo } : {}),
        ...(req.brandMark ? { brandMark: req.brandMark } : {}),
        ...(req.callToAction ? { callToAction: req.callToAction } : {}),
        ...(req.uploadedImages ? { uploadedImages: req.uploadedImages } : {}),
        verbose: req.verbose,
      });
    },
  );

  // --- Langkah 8: Scheduler (penjadwalan disarankan) ----------------------
  const schedule = await step(
    'schedule',
    'scheduler',
    (s: { slots: string[]; note: string }) => `slot disarankan: ${s.slots.join(' / ')}. ${s.note}`,
    async () => {
      // Penjadwalan tidak memakai model: ini aturan sederhana berdasarkan
      // perilaku umum audiens di Indonesia, dan manusia tetap memutuskan.
      const weekdaySlots: Record<number, string> = {
        0: '19.00-21.00 WIB',
        1: '07.00-08.30 atau 12.00-13.00 WIB',
        2: '07.00-08.30 atau 19.00-21.00 WIB',
        3: '12.00-13.00 atau 19.00-21.00 WIB',
        4: '07.00-08.30 atau 19.00-21.00 WIB',
        5: '12.00-13.00 atau 16.00-17.00 WIB',
        6: '09.00-11.00 WIB',
      };
      const today = new Date().getDay();
      const slots = [
        weekdaySlots[today] ?? '19.00-21.00 WIB',
        weekdaySlots[(today + 2) % 7] ?? '19.00-21.00 WIB',
      ];
      return {
        slots,
        note:
          category.key === 'market_info'
            ? 'Kategori berita sebaiknya tayang dalam 2 jam setelah data dirilis agar tetap relevan.'
            : 'Saran berbasis pola umum audiens; sesuaikan setelah data metrik terkumpul.',
      };
    },
  );

  // --- Langkah 9: Analyst -------------------------------------------------
  const costSoFar = llm.costReport();
  const analysis = await step(
    'analyze',
    'analyst',
    (a: AnalystOutput) => `${a.assessment} Perbaikan berikutnya: ${a.improvement}`,
    async () => {
      const { value } = await llm.callJson<AnalystOutput>(
        {
          taskClass: 'decision',
          agentKey: 'analyst',
          system: analystSystem,
          user: analystUser({
            category,
            topic: req.topic,
            slideCount: slides.length,
            complianceOutcome: fullCompliance.outcome,
            complianceFindings: fullCompliance.findings.filter((f) => f.result !== 'pass').length,
            costUsd: costSoFar.totalUsd,
          }),
          temperature: 0.4,
          bypassCache: req.fresh,
          cacheContext: { topic: req.topic, category: category.key, promptVersion: PROMPT_VERSION },
          verbose: req.verbose,
        },
        (v) => {
          const o = v as Partial<AnalystOutput>;
          if (typeof o.assessment !== 'string' || o.assessment.trim().length < 10) return 'Field "assessment" harus berupa teks minimal 10 karakter.';
          if (typeof o.improvement !== 'string' || o.improvement.trim().length < 10) return 'Field "improvement" harus berupa teks minimal 10 karakter.';
          if (typeof o.reusableAsset !== 'string') return 'Field "reusableAsset" harus berupa teks.';
          return null;
        },
      );
      return value;
    },
  );

  const finalCost: CostReport = llm.costReport();

  return {
    carouselId,
    spec,
    factSheet,
    captions,
    compliance: fullCompliance,
    cost: {
      ...finalCost,
      // Laporan biaya untuk produksi ini saja: agen yang terlibat di atas.
      entries: finalCost.entries.filter((e) =>
        ['strategist', 'research', 'copywriter', 'composer', 'compliance_advisor', 'analyst'].includes(e.agentKey),
      ),
    },
    outputs: renderResult.outputs,
    // Jejak diambil apa adanya dari `traces`. Sebelumnya dua entri tambahan
    // untuk analyze dan schedule dituliskan ulang di sini, padahal keduanya
    // sudah tercatat oleh `step()` — akibatnya jejak memuat baris ganda dan
    // total durasi menjadi tidak akurat.
    steps: traces,
    startedAt,
    finishedAt: new Date().toISOString(),
    // Peringatan non-fatal (mis. sumber berita yang gagal diambil) diteruskan ke
    // pemanggil agar tidak hilang diam-diam.
    warnings: newsWarnings,
  };
}
