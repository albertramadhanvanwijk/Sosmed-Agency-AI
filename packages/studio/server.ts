/**
 * Server Studio PropDesk AI.
 *
 * Menyediakan API JSON dan antarmuka web untuk:
 *   - Command Center (KPI dan antrean hari ini)
 *   - Pipeline Kanban (alur produksi)
 *   - Approvals Inbox (persetujuan manusia — gerbang wajib)
 *   - Carousel Studio (pratinjau slide dan caption)
 *   - Virtual Agent Office (2D isometrik, status dari data nyata)
 *   - Knowledge Base
 *   - Audit log
 *
 * Sengaja tanpa kerangka kerja web: hanya modul bawaan Node. Alasannya,
 * proyek ini harus dapat dijalankan tanpa memasang apa pun selain Chromium,
 * sehingga hambatan untuk mencobanya serendah mungkin.
 *
 * Catatan tentang pratinjau: pratinjau slide dirender dari slide-spec yang
 * tersimpan melalui mesin template yang SAMA dengan yang menghasilkan PNG.
 * Jadi apa yang terlihat di antarmuka adalah apa yang akan terbit — bukan
 * tangkapan layar yang bisa berbeda dari hasil akhir.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import {
  DEFAULT_CLIENT,
  DEFAULT_ORG,
  addKnowledge,
  audit,
  createJob,
  decideCarousel,
  defaultDbPath,
  deleteCtaPreset,
  deleteLearnedRule,
  deleteUploadedImage,
  getActiveJobs,
  getAgentRuns,
  getAgentStatuses,
  getBrandConfig,
  getCaptions,
  getCarousel,
  getFacts,
  getFindings,
  getKpi,
  getRecentJobs,
  getSlides,
  latestWeeklyPlan,
  listCarousels,
  listCtaPresets,
  listKnowledge,
  listLearnedRules,
  listRevisions,
  listSignatures,
  listUploadedImages,
  openDb,
  recentAudit,
  recordNewsUsage,
  recordRevision,
  saveCtaPreset,
  saveBrandConfig,
  saveProduction,
  saveSignature,
  saveUploadedImage,
  saveWeeklyPlan,
  seedDemoIfEmpty,
  setLearnedRuleActive,
  updateJob,
  upsertLearnedRule,
} from './db.ts';
import { renderStudioHtml } from './ui.ts';
import { LlmClient } from '../llm/client.ts';
import { produceCarousel, PipelineError } from '../agents/pipeline.ts';
import { createBrandKit } from '../shared/brand.ts';
import { getCategory, CATEGORY_ORDER, isCategoryKey } from '../shared/categories.ts';
import { RATIO_PROFILES } from '../shared/theme.ts';
import { listThemes } from '../templates/themes.ts';
import { resolveTemplate } from '../templates/registry.ts';
import { buildHtml } from '../templates/base.ts';
import { NEWS_SOURCES } from '../news/feeds.ts';
import { sourcesForCategory } from '../news/feeds.ts';
import { fetchFeeds, fetchFeed } from '../news/rss.ts';
import { selectRelevantNews } from '../news/select.ts';
import { buildWeeklyPlan, formatPlan } from '../planner/weekly.ts';
import { checkSimilarity, similarityLevel, SIMILARITY_THRESHOLD, historyBrief, signatureFromSpec } from '../memory/topics.ts';
import { inferRulesFromRevisions, mergeRules, memorySummary, rulesToPrompt, selectRules } from '../memory/rules.ts';
import type { CallToAction, CarouselSpec, CategoryKey, RatioProfile, Slide, UploadedImage } from '../shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(ROOT, 'output');
const PORT = Number(process.env.STUDIO_PORT ?? 4321);

const db = openDb(defaultDbPath(ROOT));
seedDemoIfEmpty(db);

// ---------------------------------------------------------------------------
// Utilitas HTTP
// ---------------------------------------------------------------------------

/** Mengirim JSON. */
function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Mengirim galat dalam bentuk JSON yang dapat dibaca manusia. */
function fail(res: ServerResponse, status: number, message: string, extra?: unknown): void {
  json(res, status, { ok: false, error: message, ...(extra ? { detail: extra } : {}) });
}

/** Membaca badan permintaan sebagai JSON dengan batas ukuran. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // Batas 1 MB: cukup untuk perintah produksi, mencegah penyalahgunaan.
    if (size > 1_000_000) throw new Error('Badan permintaan terlalu besar.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// ---------------------------------------------------------------------------
// Produksi di latar belakang
// ---------------------------------------------------------------------------

/** Langkah pipeline dalam urutan, untuk perhitungan kemajuan. */
const STEP_ORDER = [
  'brief',
  'research',
  'caption',
  'compose',
  'compliance_rules',
  'compliance_advisor',
  'render',
  'schedule',
  'analyze',
];

/**
 * Menjalankan produksi tanpa memblokir permintaan HTTP.
 *
 * Menerima konteks lengkap, termasuk: catatan tambahan pengguna, ajakan
 * bertindak, gambar unggahan, konfigurasi merek, dan rangkaian perbaikan dari
 * catatan revisi. Semua itu diteruskan ke pipeline agar hasilnya benar-benar
 * menanggapi permintaan — bukan hanya memakai topik yang sama.
 */
async function runProduction(input: {
  categoryKey: string;
  topic: string;
  ratios: RatioProfile[];
  fresh: boolean;
  brandName: string;
  /** Saran tambahan dari pengguna agar konten lebih informatif. */
  extraInstructions?: string;
  /** Ajakan bertindak yang dipilih pengguna. */
  callToAction?: CallToAction;
  /** Id gambar unggahan yang akan disisipkan. */
  uploadIds?: string[];
  /** Id carousel yang sedang diperbaiki; menandai rantai revisi. */
  revisedFrom?: string;
  /** Id carousel yang sudah ditentukan pemanggil (dipakai saat perbaikan). */
  carouselId?: string;
}): Promise<void> {
  const jobId = `job_${randomUUID().slice(0, 8)}`;
  const carouselId = input.carouselId ?? randomUUID();
  const category = getCategory(input.categoryKey);
  const folderName = `${input.categoryKey}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
  const outputPath = join(OUTPUT_DIR, folderName);

  createJob(db, { id: jobId, carouselId, categoryKey: input.categoryKey, topic: input.topic });
  updateJob(db, jobId, { status: 'running', progress: 0 });

  const brand = createBrandKit(input.brandName);
  const startedMs = Date.now();
  const llm = new LlmClient({ root: ROOT });

  // --- Memori: riwayat konten dan pelajaran dari revisi -------------------
  //
  // Keduanya disusun SEBELUM pipeline berjalan, karena keduanya menjadi bagian
  // dari prompt. Dengan begitu agen memilih sudut pandang yang sadar akan apa
  // yang sudah pernah dibahas dan apa yang pernah dikoreksi manusia.
  const history = listSignatures(db, 300).map((s) => ({
    carouselId: s.carouselId,
    categoryKey: (isCategoryKey(s.categoryKey) ? s.categoryKey : category.key) as CategoryKey,
    title: s.title,
    keywords: s.keywords,
    fingerprint: s.fingerprint,
    createdAt: s.createdAt,
  }));
  const historyText = historyBrief(history, 25);

  const activeRules = selectRules(listLearnedRules(db, true), category.key);
  const rulesText = activeRules.length > 0 ? rulesToPrompt(activeRules) : '';

  // --- Merek: logo, merek teks, dan ajakan bertindak ---------------------
  const brandCfg = getBrandConfig(db);
  const logo = brandCfg?.logoDataUri
    ? {
        label: brandCfg.logoLabel ?? 'Logo',
        position: (brandCfg.logoPosition as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'),
        heightPx: brandCfg.logoHeight,
        assetPath: brandCfg.logoDataUri,
        altText: brandCfg.logoAlt ?? brand.name,
      }
    : undefined;
  const brandMark = brandCfg?.markShortName
    ? {
        shortName: brandCfg.markShortName,
        ...(brandCfg.markTagline ? { tagline: brandCfg.markTagline } : {}),
        ...(brandCfg.markBadge ? { badge: brandCfg.markBadge } : {}),
      }
    : undefined;

  // --- Gambar unggahan: dibaca lalu diubah menjadi data URI --------------
  let uploadedImages: UploadedImage[] | undefined;
  if (input.uploadIds && input.uploadIds.length > 0) {
    const all = listUploadedImages(db);
    uploadedImages = all
      .filter((img) => input.uploadIds!.includes(img.id))
      .map((img) => ({
        path: img.dataUri,
        originalName: img.originalName,
        mimeType: img.mimeType,
        byteSize: img.byteSize,
        ...(img.slidePosition ? { slidePosition: img.slidePosition } : {}),
        ...(img.caption ? { caption: img.caption } : {}),
      }));
  }

  try {
    const result = await produceCarousel(
      {
        categoryKey: input.categoryKey,
        topic: input.topic,
        brandName: input.brandName,
        tokens: brand.tokens,
        disclaimers: brand.disclaimers,
        ratios: input.ratios,
        outputBaseDir: OUTPUT_DIR,
        folderName,
        fresh: input.fresh,
        verbose: true,
        ...(input.extraInstructions ? { extraInstructions: input.extraInstructions } : {}),
        ...(input.callToAction ? { callToAction: input.callToAction } : {}),
        ...(uploadedImages ? { uploadedImages } : {}),
        ...(historyText ? { historyBrief: historyText } : {}),
        ...(rulesText ? { learnedRules: rulesText } : {}),
        ...(logo ? { logo } : {}),
        ...(brandMark ? { brandMark } : {}),
        onStep: (stepKey) => {
          const index = STEP_ORDER.indexOf(stepKey);
          const progress = index >= 0 ? (index + 1) / STEP_ORDER.length : 0.1;
          updateJob(db, jobId, { currentStep: stepKey, progress });
        },
      },
      llm,
    );

    // Menyimpan hasil. Perhatikan: status yang disimpan adalah needs_review
    // (atau failed bila kepatuhan memblokir), bukan published.
    const captionVariant = result.captions.variants[result.captions.recommendedIndex];
    saveProduction(db, {
      carouselId,
      categoryKey: input.categoryKey,
      topic: input.topic,
      title: result.spec.title,
      riskLevel: category.riskLevel,
      asOf: result.spec.asOf ?? new Date().toISOString(),
      disclaimerKey: result.spec.disclaimerKey,
      folder: outputPath,
      slides: result.spec.slides.map((s) => ({
        position: s.position,
        role: s.role,
        ...(s.templateKey ? { templateKey: s.templateKey } : {}),
        headline: s.headline,
        body: s.body,
        bullets: s.bullets,
        emphasis: s.emphasis,
        visual: s.visual,
        sourceRefs: s.sourceRefs,
        wordCount: s.wordCount ?? 0,
      })),
      caption: captionVariant
        ? {
            platform: captionVariant.platform,
            hook: captionVariant.hook,
            body: captionVariant.body,
            hashtags: captionVariant.hashtags,
            cta: captionVariant.cta,
          }
        : null,
      facts: result.factSheet.entries.map((e) => ({
        ref: e.id,
        claim: e.claim,
        sourceName: e.sourceName,
        asOf: e.asOf,
        confidence: e.confidence,
      })),
      findings: result.compliance.findings.map((f) => ({
        ruleKey: f.ruleKey,
        ruleName: f.ruleName,
        layer: f.layer,
        severity: f.severity,
        result: f.result,
        subjectRef: f.subjectRef,
        ...(f.evidence ? { evidence: f.evidence } : {}),
        ...(f.suggestion ? { suggestion: f.suggestion } : {}),
        decidedBy: f.decidedBy,
      })),
      complianceOutcome: result.compliance.outcome,
      complianceBlocked: result.compliance.blocked,
      agentRuns: result.steps.map((s) => ({
        stepKey: s.stepKey,
        agentKey: s.agentKey,
        status: s.status,
        startedAt: s.startedAt,
        durationMs: s.durationMs,
        note: s.note,
        ...(s.error ? { error: s.error } : {}),
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        cached: false,
      })),
      costUsd: result.cost.totalUsd,
      tokensIn: result.cost.totalTokensIn,
      tokensOut: result.cost.totalTokensOut,
      durationMs: Date.now() - startedMs,
      ...(result.steps.find((s) => s.stepKey === 'schedule')?.note
        ? { scheduleNote: result.steps.find((s) => s.stepKey === 'schedule')!.note }
        : {}),
      ...(result.steps.find((s) => s.stepKey === 'analyze')?.note
        ? { analysisNote: result.steps.find((s) => s.stepKey === 'analyze')!.note }
        : {}),
    });

    // Catat juga jejak model per agen agar kantor menampilkan model yang dipakai.
    for (const entry of result.cost.entries) {
      db.prepare(
        `UPDATE agent_runs SET model = ?, tokens_in = ?, tokens_out = ?, cost_usd = ?, cached = ?
         WHERE carousel_id = ? AND agent_key = ?`,
      ).run(entry.model, entry.tokensIn, entry.tokensOut, entry.amountUsd, entry.cached ? 1 : 0, carouselId, entry.agentKey);
    }

    // Tandai rantai perbaikan bila produksi ini lahir dari catatan revisi.
    if (input.revisedFrom) {
      const parent = getCarousel(db, input.revisedFrom);
      db.prepare('UPDATE carousels SET revised_from = ?, revision_round = ?, extra_instructions = ? WHERE id = ?').run(
        input.revisedFrom,
        (parent?.revision_round ?? 0) + 1,
        input.extraInstructions ?? null,
        carouselId,
      );
    } else if (input.extraInstructions) {
      db.prepare('UPDATE carousels SET extra_instructions = ? WHERE id = ?').run(input.extraInstructions, carouselId);
    }

    // Simpan sidik jari isi. Inilah yang membuat produksi berikutnya dapat
    // menghindari topik yang sudah pernah dibahas.
    const signature = signatureFromSpec(
      carouselId,
      result.spec,
      result.captions.variants.map((v) => `${v.hook} ${v.body}`),
    );
    saveSignature(db, {
      carouselId,
      categoryKey: result.spec.categoryKey,
      title: result.spec.title,
      keywords: signature.keywords,
      fingerprint: signature.fingerprint,
    });

    // Catat sumber berita yang benar-benar dipakai, agar asal setiap klaim dapat
    // ditelusuri dan sumber yang tidak layak dapat dikesampingkan nanti.
    const newsFacts = result.factSheet.entries.filter(
      (e) => e.confidence !== 'low' && !/^pengetahuan umum/i.test(e.sourceName),
    );
    if (newsFacts.length > 0) {
      recordNewsUsage(
        db,
        newsFacts.map((e) => ({
          carouselId,
          sourceKey: e.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60),
          sourceName: e.sourceName,
          title: e.claim.slice(0, 200),
          ...(e.sourceUrl ? { url: e.sourceUrl } : {}),
          publishedAt: e.asOf,
          trust: e.confidence === 'high' ? 'high' : 'medium',
          usedAs: 'fact',
        })),
      );
    }

    updateJob(db, jobId, {
      status: 'done',
      progress: 1,
      currentStep: null,
      error: result.compliance.blocked ? 'Diblokir oleh pemeriksaan kepatuhan; lihat temuan.' : null,
    });
  } catch (err) {
    const message =
      err instanceof PipelineError
        ? `Berhenti pada langkah "${err.stepKey}": ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    updateJob(db, jobId, { status: 'failed', error: message.slice(0, 1200) });

    // Simpan kegagalan agar terlihat di antarmuka, bukan hilang di konsol.
    db.prepare(
      `INSERT OR IGNORE INTO carousels (id, org_id, client_id, category_key, topic, title, status, risk_level,
        compliance_outcome, compliance_blocked, as_of, disclaimer_key, folder, slide_count, cost_usd, tokens_in, tokens_out,
        duration_ms, schedule_note, analysis_note, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      carouselId,
      DEFAULT_ORG,
      DEFAULT_CLIENT,
      input.categoryKey,
      input.topic,
      input.topic.slice(0, 60),
      'failed',
      category.riskLevel,
      'block',
      0,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      Date.now() - startedMs,
      null,
      null,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    db.prepare('INSERT INTO compliance_findings (id, carousel_id, rule_key, rule_name, layer, severity, result, subject_ref, evidence, suggestion, decided_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
      `${carouselId}-err`,
      carouselId,
      'PIPELINE.error',
      'Produksi gagal',
      'L1_structure',
      'block',
      'fail',
      'carousel',
      message.slice(0, 800),
      'Periksa pesan galat, lalu jalankan ulang produksi.',
      'rule_engine',
      new Date().toISOString(),
    );
  }
}

// ---------------------------------------------------------------------------
// Pratinjau slide dari spesifikasi tersimpan
// ---------------------------------------------------------------------------

/** Memuat slide spec dari penyimpanan berkas produksi. */
async function loadSpecFromFolder(folder: string): Promise<CarouselSpec | null> {
  const p = join(folder, 'slide-spec.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, 'utf8')) as CarouselSpec;
  } catch {
    return null;
  }
}

/** Merender HTML satu slide untuk pratinjau. */
async function previewSlide(
  carouselId: string,
  position: number,
  ratioKey: RatioProfile,
  includeChrome: boolean,
): Promise<string | null> {
  const row = getCarousel(db, carouselId);
  if (!row) return null;

  // Sumber pertama: berkas slide-spec.json dari produksi. Ini yang paling
  // akurat karena memuat seluruh detail asli.
  let spec: CarouselSpec | null = row.folder ? await loadSpecFromFolder(row.folder) : null;

  // Sumber kedua: susun ulang dari baris tabel `slides`. Ini membuat pratinjau
  // tetap bekerja walaupun berkas produksi sudah dihapus, dipindahkan, atau
  // carousel dibuat tanpa berkas (mis. data contoh). Tanpa cadangan ini,
  // pratinjau akan menampilkan galat di dalam bingkai.
  if (!spec) {
    const rows = getSlides(db, carouselId);
    if (rows.length === 0) return null;
    spec = {
      title: row.title,
      categoryKey: row.category_key as CarouselSpec['categoryKey'],
      disclaimerKey: row.disclaimer_key ?? 'default_finansial',
      locale: 'id-ID',
      ...(row.as_of ? { asOf: row.as_of } : {}),
      slides: rows.map((s) => ({
        position: s.position,
        role: s.role as Slide['role'],
        headline: s.headline,
        body: s.body,
        bullets: safeJson<string[]>(s.bullets, []),
        emphasis: safeJson<string[]>(s.emphasis, []),
        visual: safeJson<Slide['visual']>(s.visual, { type: 'none' }),
        ...(s.template_key ? { templateKey: s.template_key } : {}),
        sourceRefs: safeJson<string[]>(s.source_refs, []),
      })),
    };
  }

  const slide = spec.slides.find((s) => s.position === position);
  if (!slide) return null;

  const brand = createBrandKit('PropDesk');
  const category = getCategory(spec.categoryKey);
  const ratio = RATIO_PROFILES[ratioKey];
  if (!ratio) return null;

  const template = resolveTemplate(slide as Slide);
  const html = buildHtml(
    slide as Slide,
    {
      tokens: brand.tokens,
      ratio,
      position: slide.position,
      total: spec.slides.length,
      brandName: 'PropDesk',
      categoryLabel: category.name.toUpperCase(),
      asOf: spec.asOf,
      disclaimerText: brand.disclaimers[spec.disclaimerKey] ?? brand.disclaimers.default_finansial,
    },
    template,
  );

  if (includeChrome) return html;
  return html;
}

/** Membaca JSON yang tersimpan sebagai teks, dengan nilai cadangan bila rusak. */
function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Perutean
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

/** Menyajikan berkas dari folder keluaran, dengan pengaman lintasan. */
async function serveOutputFile(res: ServerResponse, relPath: string): Promise<void> {
  // Normalisasi dan pastikan berkas benar-benar berada di dalam folder
  // keluaran, agar permintaan tidak dapat membaca berkas lain di sistem.
  const safe = normalize(relPath).replace(/^([/\\])+/, '');
  const target = resolve(OUTPUT_DIR, safe);
  if (!target.startsWith(resolve(OUTPUT_DIR) + sep) && target !== resolve(OUTPUT_DIR)) {
    fail(res, 403, 'Jalur berkas di luar folder keluaran ditolak.');
    return;
  }
  if (!existsSync(target)) {
    fail(res, 404, `Berkas tidak ditemukan: ${safe}`);
    return;
  }
  const s = await stat(target);
  if (!s.isFile()) {
    fail(res, 400, 'Bukan berkas.');
    return;
  }
  const data = await readFile(target);
  res.writeHead(200, {
    'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': data.byteLength,
  });
  res.end(data);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // --- Antarmuka -----------------------------------------------------------
  if (path === '/' || path === '/index.html') {
    const html = renderStudioHtml({
      categories: CATEGORY_ORDER.map((k) => {
        const c = getCategory(k);
        return { key: c.key, name: c.name, riskLevel: c.riskLevel, slideRange: c.slideRange };
      }),
      ratios: Object.values(RATIO_PROFILES).map((r) => ({ key: r.key, label: r.label, width: r.width, height: r.height })),
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // --- Berkas keluaran ----------------------------------------------------
  if (path.startsWith('/files/')) {
    await serveOutputFile(res, decodeURIComponent(path.slice('/files/'.length)));
    return;
  }

  // --- Pratinjau slide (HTML dari mesin template) -------------------------
  const previewMatch = /^\/preview\/([^/]+)\/(\d+)$/.exec(path);
  if (previewMatch) {
    const ratio = (url.searchParams.get('ratio') ?? 'ig_portrait') as RatioProfile;
    const html = await previewSlide(previewMatch[1]!, Number(previewMatch[2]), ratio, true);
    if (!html) {
      fail(res, 404, 'Pratinjau tidak tersedia untuk carousel ini (mungkin dibuat dengan mode demo atau tanpa berkas produksi).');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // --- API ----------------------------------------------------------------
  if (!path.startsWith('/api/')) {
    fail(res, 404, `Rute tidak dikenal: ${path}`);
    return;
  }

  try {
    if (method === 'GET' && path === '/api/overview') {
      json(res, 200, {
        ok: true,
        kpi: getKpi(db),
        agents: getAgentStatuses(db),
        activeJobs: getActiveJobs(db),
        recentJobs: getRecentJobs(db, 12),
        queue: listCarousels(db, { status: 'needs_review', limit: 12 }),
        recent: listCarousels(db, { limit: 12 }),
        audit: recentAudit(db, 20),
      });
      return;
    }

    if (method === 'GET' && path === '/api/carousels') {
      const status = url.searchParams.get('status') ?? undefined;
      const category = url.searchParams.get('category') ?? undefined;
      json(res, 200, {
        ok: true,
        carousels: listCarousels(db, {
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          limit: Number(url.searchParams.get('limit') ?? 200),
        }),
      });
      return;
    }

    const detailMatch = /^\/api\/carousels\/([^/]+)$/.exec(path);
    if (method === 'GET' && detailMatch) {
      const id = detailMatch[1]!;
      const row = getCarousel(db, id);
      if (!row) {
        fail(res, 404, 'Carousel tidak ditemukan.');
        return;
      }
      const cat = getCategory(row.category_key);
      json(res, 200, {
        ok: true,
        carousel: row,
        category: { key: cat.key, name: cat.name, riskLevel: cat.riskLevel, outline: cat.outline },
        slides: getSlides(db, id).map((s) => ({
          ...s,
          bullets: JSON.parse(s.bullets) as string[],
          emphasis: JSON.parse(s.emphasis) as string[],
          visual: JSON.parse(s.visual) as unknown,
          sourceRefs: JSON.parse(s.source_refs) as string[],
        })),
        findings: getFindings(db, id),
        runs: getAgentRuns(db, id),
        captions: getCaptions(db, id).map((c) => ({ ...c, hashtags: JSON.parse(c.hashtags) as string[] })),
        facts: getFacts(db, id),
      });
      return;
    }

    const decisionMatch = /^\/api\/carousels\/([^/]+)\/decision$/.exec(path);
    if (method === 'POST' && decisionMatch) {
      const id = decisionMatch[1]!;
      const body = (await readJson(req)) as {
        decision?: string;
        note?: string;
        /** Benar untuk langsung memperbaiki carousel ini setelah minta revisi. */
        autoRevise?: boolean;
        ratios?: string[];
      };
      const decision = body.decision;
      if (decision !== 'approved' && decision !== 'changes_requested' && decision !== 'rejected') {
        fail(res, 400, 'Keputusan harus salah satu dari: approved, changes_requested, rejected.');
        return;
      }

      const row = getCarousel(db, id);
      if (!row) {
        fail(res, 404, 'Carousel tidak ditemukan.');
        return;
      }

      // Untuk revisi dan penolakan, catatan WAJIB ada. Catatan inilah yang
      // menjadi bahan pembelajaran agen; tanpa catatan, kesalahan yang sama
      // akan terulang dan sistem tidak pernah menjadi lebih baik.
      const note = (body.note ?? '').trim();
      if (decision === 'changes_requested' && note.length < 5) {
        fail(res, 400, 'Catatan revisi wajib diisi (minimal 5 karakter) agar agen dapat mempelajarinya.');
        return;
      }
      if (decision === 'rejected' && note.length > 0 && note.length < 5) {
        fail(res, 400, 'Jika memberikan catatan penolakan, minimal 5 karakter.');
        return;
      }

      // Cek batas revisi: maksimal 3 kali revisi per carousel
      const MAX_REVISIONS = 3;
      if (decision === 'changes_requested' && row.revision_round >= MAX_REVISIONS) {
        fail(res, 409, `Sudah ${MAX_REVISIONS} kali revisi. Sebaiknya approve atau reject.`);
        return;
      }

      try {
        decideCarousel(db, id, decision, note, 'operator');
      } catch (err) {
        fail(res, 409, err instanceof Error ? err.message : String(err));
        return;
      }

      let revised: { jobQueued: boolean; newCarouselId: string | null; learnedRuleId: string | null } = {
        jobQueued: false,
        newCarouselId: null,
        learnedRuleId: null,
      };

      if (decision !== 'approved') {
        // 1. Catat revisi sebagai bahan pembelajaran.
        recordRevision(db, {
          carouselId: id,
          categoryKey: row.category_key,
          title: row.title,
          decision: decision === 'rejected' ? 'rejected' : 'changes_requested',
          note,
        });

        // 2. Ubah catatan menjadi aturan yang akan dipakai produksi berikutnya.
        //    Aturan dari manusia langsung dipercaya penuh, tidak menunggu
        //    pengulangan.
        const ruleId = `lr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date().toISOString();
        upsertLearnedRule(db, {
          id: ruleId,
          categoryKey: isCategoryKey(row.category_key) ? (row.category_key as CategoryKey) : null,
          rule: `Perbaiki hal berikut: ${note}`,
          rationale: `Catatan ${decision === 'rejected' ? 'penolakan' : 'revisi'} pada carousel "${row.title}".`,
          occurrences: 1,
          confidence: 0.9,
          createdBy: 'human',
          source: 'manual',
          createdAt: now,
          lastSeenAt: now,
          active: true,
        });
        revised.learnedRuleId = ruleId;

        // 3. Jalankan perbaikan bila diminta. Produksi ulang memakai catatan
        //    revisi sebagai permintaan khusus, sehingga hasilnya benar-benar
        //    menanggapi catatan itu — bukan sekadar mengulang produksi lama.
        //    HANYA untuk changes_requested, BUKAN untuk rejected.
        if (decision === 'changes_requested' && body.autoRevise === true) {
          const ratios = (body.ratios ?? ['ig_portrait']).filter((r): r is RatioProfile => r in RATIO_PROFILES);
          const newCarouselId = randomUUID();
          revised.newCarouselId = newCarouselId;
          revised.jobQueued = true;

          runProduction({
            categoryKey: row.category_key,
            topic: row.topic,
            ratios: ratios.length > 0 ? ratios : ['ig_portrait'],
            fresh: true,
            brandName: 'PropDesk',
            extraInstructions: [
              `Ini PERBAIKAN dari carousel sebelumnya yang berjudul "${row.title}".`,
              'Catatan revisi dari pemilik akun WAJIB ditindaklanjuti:',
              note,
              '',
              'Perbaiki secara nyata: jangan hanya mengubah kata pembuka. Periksa apakah ada slide yang',
              'perlu diganti, ditambah, atau dihapus agar catatan di atas terpenuhi.',
            ].join('\n'),
            revisedFrom: id,
            carouselId: newCarouselId,
          }).catch((err) => {
            console.error('[perbaikan] gagal:', err instanceof Error ? err.message : err);
          });
        }
      }

      json(res, 200, { ok: true, carousel: getCarousel(db, id), revised });
      return;
    }

    if (method === 'POST' && path === '/api/produce') {
      const body = (await readJson(req)) as {
        categoryKey?: string;
        topic?: string;
        ratios?: string[];
        fresh?: boolean;
        brandName?: string;
      };
      if (!body.categoryKey || !body.topic) {
        fail(res, 400, 'Perlu "categoryKey" dan "topic".');
        return;
      }
      if (!CATEGORY_ORDER.includes(body.categoryKey as (typeof CATEGORY_ORDER)[number])) {
        fail(res, 400, `Kategori tidak dikenal. Pilihan: ${CATEGORY_ORDER.join(', ')}`);
        return;
      }
      const ratios = (body.ratios ?? ['ig_portrait']).filter((r): r is RatioProfile => r in RATIO_PROFILES);
      if (ratios.length === 0) {
        fail(res, 400, `Profil rasio tidak dikenal. Pilihan: ${Object.keys(RATIO_PROFILES).join(', ')}`);
        return;
      }

      // Kembalikan respons lebih dulu, lalu produksi berjalan di latar
      // belakang. Antarmuka memantau kemajuannya lewat /api/jobs.
      json(res, 202, { ok: true, message: 'Produksi dimulai. Pantau di Command Center.' });
      runProduction({
        categoryKey: body.categoryKey,
        topic: body.topic,
        ratios,
        fresh: body.fresh === true,
        brandName: body.brandName ?? 'PropDesk',
      }).catch((err) => {
        console.error('[produksi] gagal:', err instanceof Error ? err.message : err);
      });
      return;
    }

    if (method === 'GET' && path === '/api/jobs') {
      json(res, 200, { ok: true, active: getActiveJobs(db), recent: getRecentJobs(db, 20) });
      return;
    }

    if (method === 'GET' && path === '/api/office') {
      json(res, 200, {
        ok: true,
        agents: getAgentStatuses(db),
        activeJobs: getActiveJobs(db),
      });
      return;
    }

    if (method === 'GET' && path === '/api/knowledge') {
      const kind = url.searchParams.get('kind') ?? undefined;
      json(res, 200, {
        ok: true,
        items: listKnowledge(db, kind).map((k) => ({ ...k, tags: JSON.parse(k.tags) as string[] })),
      });
      return;
    }

    if (method === 'POST' && path === '/api/knowledge') {
      const body = (await readJson(req)) as {
        kind?: string;
        title?: string;
        content?: string;
        categoryKey?: string | null;
        tags?: string[];
      };
      if (!body.kind || !body.title || !body.content) {
        fail(res, 400, 'Perlu "kind", "title", dan "content".');
        return;
      }
      const id = addKnowledge(db, {
        kind: body.kind,
        title: body.title,
        content: body.content,
        categoryKey: body.categoryKey ?? null,
        tags: body.tags ?? [],
      });
      audit(db, 'operator', 'knowledge.added', 'knowledge_item', id, { kind: body.kind, title: body.title });
      json(res, 200, { ok: true, id });
      return;
    }

    if (method === 'GET' && path === '/api/audit') {
      json(res, 200, { ok: true, entries: recentAudit(db, Number(url.searchParams.get('limit') ?? 60)) });
      return;
    }

    // ---------------------------------------------------------------
    // Rencana konten mingguan
    // ---------------------------------------------------------------

    if (method === 'POST' && path === '/api/plan') {
      const body = (await readJson(req)) as {
        days?: number;
        startDate?: string;
        activeCategories?: string[];
        focusCategories?: string[];
        extraInstructions?: string;
        includeNews?: boolean;
      };

      // Berita diambil hanya bila diminta, karena butuh waktu beberapa detik.
      let news: Awaited<ReturnType<typeof fetchFeeds>>['items'] = [];
      let newsWarnings: string[] = [];
      if (body.includeNews !== false) {
        const sources = NEWS_SOURCES.filter((s) => s.enabled && s.markets);
        const result = await fetchFeeds(sources, { limit: 15, timeoutMs: 12_000, concurrency: 6 });
        news = result.items;
        newsWarnings = result.outcomes.filter((o) => !o.ok).map((o) => `${o.sourceName}: ${o.error ?? 'gagal'}`);
      }

      const plan = buildWeeklyPlan({
        ...(body.days ? { days: body.days } : {}),
        ...(body.startDate ? { startDate: body.startDate } : {}),
        ...(body.activeCategories && body.activeCategories.length > 0
          ? { activeCategories: body.activeCategories.filter(isCategoryKey) }
          : {}),
        ...(body.focusCategories ? { focusCategories: body.focusCategories.filter(isCategoryKey) } : {}),
        ...(body.extraInstructions ? { extraInstructions: body.extraInstructions } : {}),
        news,
        history: listSignatures(db, 300).map((s) => ({
          carouselId: s.carouselId,
          categoryKey: s.categoryKey as CategoryKey,
          title: s.title,
          keywords: s.keywords,
          fingerprint: s.fingerprint,
          createdAt: s.createdAt,
        })),
      });

      if (newsWarnings.length > 0) {
        plan.warnings.push(`${newsWarnings.length} sumber berita gagal diambil: ${newsWarnings.slice(0, 3).join('; ')}`);
      }

      saveWeeklyPlan(db, plan);
      audit(db, 'operator', 'plan.created', 'weekly_plan', plan.id, {
        period: `${plan.periodStart}..${plan.periodEnd}`,
        slots: plan.slots.length,
        sourcesOfNews: news.length,
      });

      json(res, 200, { ok: true, plan, newsCount: news.length });
      return;
    }

    if (method === 'GET' && path === '/api/plan') {
      const plan = latestWeeklyPlan(db);
      json(res, 200, { ok: true, plan });
      return;
    }

    // ---------------------------------------------------------------
    // Memori: aturan pembelajaran
    // ---------------------------------------------------------------

    if (method === 'GET' && path === '/api/memory/rules') {
      const rules = listLearnedRules(db);
      json(res, 200, {
        ok: true,
        rules,
        summary: memorySummary(rules),
        revisions: listRevisions(db, 60),
      });
      return;
    }

    if (method === 'POST' && path === '/api/memory/rules') {
      const body = (await readJson(req)) as {
        categoryKey?: string | null;
        rule?: string;
        rationale?: string;
      };
      if (!body.rule || body.rule.trim().length < 8) {
        fail(res, 400, 'Perlu "rule" berupa teks minimal 8 karakter.');
        return;
      }
      const now = new Date().toISOString();
      const id = `lr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      upsertLearnedRule(db, {
        id,
        categoryKey: body.categoryKey && isCategoryKey(body.categoryKey) ? body.categoryKey : null,
        rule: body.rule.trim(),
        rationale: body.rationale?.trim() || 'Ditambahkan langsung oleh pemilik akun.',
        occurrences: 1,
        // Aturan yang ditulis manusia langsung dipercaya penuh.
        confidence: 0.95,
        createdBy: 'human',
        source: 'manual',
        createdAt: now,
        lastSeenAt: now,
        active: true,
      });
      audit(db, 'operator', 'memory.rule_added', 'learned_rule', id, { rule: body.rule.slice(0, 120) });
      json(res, 200, { ok: true, id });
      return;
    }

    const ruleToggle = /^\/api\/memory\/rules\/([^/]+)$/.exec(path);
    if (ruleToggle) {
      const id = ruleToggle[1]!;
      if (method === 'DELETE') {
        deleteLearnedRule(db, id);
        audit(db, 'operator', 'memory.rule_deleted', 'learned_rule', id, {});
        json(res, 200, { ok: true });
        return;
      }
      if (method === 'PATCH' || method === 'POST') {
        const body = (await readJson(req)) as { active?: boolean };
        setLearnedRuleActive(db, id, body.active !== false);
        audit(db, 'operator', 'memory.rule_toggled', 'learned_rule', id, { active: body.active !== false });
        json(res, 200, { ok: true });
        return;
      }
    }

    // Menyimpulkan aturan baru dari kumpulan catatan revisi.
    if (method === 'POST' && path === '/api/memory/reflect') {
      const revisions = listRevisions(db, 200);
      if (revisions.length === 0) {
        json(res, 200, { ok: true, added: 0, updated: 0, message: 'Belum ada catatan revisi untuk dipelajari.' });
        return;
      }
      const proposed = inferRulesFromRevisions(
        revisions.map((r) => ({
          carouselId: r.carouselId,
          categoryKey: r.categoryKey as CategoryKey,
          title: r.title,
          note: r.note,
          decision: r.decision,
          createdAt: r.createdAt,
        })),
      );
      const existing = listLearnedRules(db).map((r) => ({
        id: r.id,
        // Kunci kategori dari basis data bertipe teks; perlu dipersempit agar
        // cocok dengan tipe `LearnedRule`. Nilai yang tidak dikenal dianggap
        // berlaku umum, bukan dibuang.
        categoryKey: r.categoryKey && isCategoryKey(r.categoryKey) ? (r.categoryKey as CategoryKey) : null,
        rule: r.rule,
        rationale: r.rationale,
        occurrences: r.occurrences,
        confidence: r.confidence,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        lastSeenAt: r.lastSeenAt,
        active: r.active,
      }));
      const merged = mergeRules(existing, proposed);
      for (const r of [...merged.added, ...merged.updated]) upsertLearnedRule(db, r);
      audit(db, 'system', 'memory.reflected', 'learned_rule', null, {
        added: merged.added.length,
        updated: merged.updated.length,
      });
      json(res, 200, {
        ok: true,
        added: merged.added.length,
        updated: merged.updated.length,
        proposed: proposed.slice(0, 10),
      });
      return;
    }

    // ---------------------------------------------------------------
    // Konfigurasi merek (logo & merek teks)
    // ---------------------------------------------------------------

    if (method === 'GET' && path === '/api/brand') {
      json(res, 200, { ok: true, brand: getBrandConfig(db) });
      return;
    }

    if (method === 'POST' && path === '/api/brand') {
      const body = (await readJson(req)) as {
        logoLabel?: string;
        logoPosition?: string;
        logoHeight?: number;
        /** Logo dikirim sebagai data URI; formatnya sudah divalidasi di antarmuka. */
        logoDataUri?: string;
        logoAlt?: string;
        markShortName?: string;
        markTagline?: string;
        markBadge?: string;
        removeLogo?: boolean;
      };
      const current = getBrandConfig(db);
      saveBrandConfig(db, {
        logoLabel: body.logoLabel ?? current?.logoLabel ?? null,
        logoPosition: body.logoPosition ?? current?.logoPosition ?? 'top-right',
        logoHeight: body.logoHeight ?? current?.logoHeight ?? 64,
        logoDataUri: body.removeLogo ? null : (body.logoDataUri ?? current?.logoDataUri ?? null),
        logoAlt: body.logoAlt ?? current?.logoAlt ?? null,
        markShortName: body.markShortName ?? current?.markShortName ?? null,
        markTagline: body.markTagline ?? current?.markTagline ?? null,
        markBadge: body.markBadge ?? current?.markBadge ?? null,
      });
      audit(db, 'operator', 'brand.updated', 'brand_config', 'default', {
        hasLogo: Boolean(body.logoDataUri) && !body.removeLogo,
        position: body.logoPosition ?? current?.logoPosition,
      });
      json(res, 200, { ok: true, brand: getBrandConfig(db) });
      return;
    }

    // ---------------------------------------------------------------
    // Preset ajakan bertindak
    // ---------------------------------------------------------------

    if (method === 'GET' && path === '/api/cta') {
      json(res, 200, { ok: true, presets: listCtaPresets(db) });
      return;
    }

    if (method === 'POST' && path === '/api/cta') {
      const body = (await readJson(req)) as {
        id?: string;
        label?: string;
        kind?: string;
        headline?: string;
        detail?: string;
        promoCode?: string;
        validUntil?: string;
        communityName?: string;
      };
      const kinds = ['save', 'follow', 'community', 'promo', 'consult'];
      if (!body.label || !body.headline || !body.kind || !kinds.includes(body.kind)) {
        fail(res, 400, `Perlu "label", "headline", dan "kind" (salah satu dari: ${kinds.join(', ')}).`);
        return;
      }
      const id = body.id ?? `cta_${Date.now().toString(36)}`;
      saveCtaPreset(db, {
        id,
        label: body.label,
        kind: body.kind,
        headline: body.headline,
        detail: body.detail ?? null,
        promoCode: body.promoCode ?? null,
        validUntil: body.validUntil ?? null,
        communityName: body.communityName ?? null,
      });
      audit(db, 'operator', 'cta.saved', 'cta_preset', id, { kind: body.kind, label: body.label });
      json(res, 200, { ok: true, id });
      return;
    }

    const ctaDelete = /^\/api\/cta\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && ctaDelete) {
      deleteCtaPreset(db, ctaDelete[1]!);
      audit(db, 'operator', 'cta.deleted', 'cta_preset', ctaDelete[1]!, {});
      json(res, 200, { ok: true });
      return;
    }

    // ---------------------------------------------------------------
    // Gambar unggahan
    // ---------------------------------------------------------------

    if (method === 'GET' && path === '/api/uploads') {
      const carouselId = url.searchParams.get('carouselId') ?? undefined;
      const images = listUploadedImages(db, carouselId);
      json(res, 200, {
        ok: true,
        // Data URI tidak dikirim ulang dalam daftar agar respons tetap ringan;
        // antarmuka hanya perlu mengetahui gambar mana yang tersedia.
        images: images.map((i) => ({
          id: i.id,
          originalName: i.originalName,
          mimeType: i.mimeType,
          byteSize: i.byteSize,
          slidePosition: i.slidePosition,
          caption: i.caption,
          createdAt: i.createdAt,
        })),
      });
      return;
    }

    if (method === 'POST' && path === '/api/uploads') {
      const body = (await readJson(req)) as {
        originalName?: string;
        mimeType?: string;
        byteSize?: number;
        dataUri?: string;
        slidePosition?: number;
        caption?: string;
      };
      if (!body.dataUri || !body.originalName) {
        fail(res, 400, 'Perlu "originalName" dan "dataUri".');
        return;
      }
      // Hanya gambar yang diterima; unggahan jenis lain ditolak.
      if (!/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/.test(body.dataUri)) {
        fail(res, 400, 'Hanya berkas gambar (PNG, JPEG, WebP, GIF, atau SVG) yang dapat diunggah.');
        return;
      }
      // Batas 6 MB agar basis data tidak membengkak.
      const size = body.byteSize ?? Math.floor((body.dataUri.length * 3) / 4);
      if (size > 6_000_000) {
        fail(res, 413, `Ukuran gambar ${(size / 1_048_576).toFixed(1)} MB melebihi batas 6 MB.`);
        return;
      }
      const id = saveUploadedImage(db, {
        originalName: body.originalName,
        mimeType: body.mimeType ?? 'image/png',
        byteSize: size,
        dataUri: body.dataUri,
        ...(body.slidePosition ? { slidePosition: body.slidePosition } : {}),
        ...(body.caption ? { caption: body.caption } : {}),
      });
      audit(db, 'operator', 'upload.added', 'uploaded_image', id, { name: body.originalName, size });
      json(res, 200, { ok: true, id });
      return;
    }

    const uploadDelete = /^\/api\/uploads\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && uploadDelete) {
      deleteUploadedImage(db, uploadDelete[1]!);
      audit(db, 'operator', 'upload.deleted', 'uploaded_image', uploadDelete[1]!, {});
      json(res, 200, { ok: true });
      return;
    }

    // ---------------------------------------------------------------
    // Berita langsung
    // ---------------------------------------------------------------

    if (method === 'GET' && path === '/api/news') {
      const categoryKey = url.searchParams.get('category') ?? 'market_info';
      if (!isCategoryKey(categoryKey)) {
        fail(res, 400, 'Parameter "category" tidak dikenal.');
        return;
      }
      const topic = url.searchParams.get('topic') ?? '';
      const sources = sourcesForCategory(categoryKey);
      const { items, outcomes } = await fetchFeeds(sources, { limit: 12, timeoutMs: 12_000, concurrency: 6 });
      const relevant = topic ? selectRelevantNews(items, topic, { limit: 12 }) : items.slice(0, 12);
      json(res, 200, {
        ok: true,
        items: relevant.map((i) => ({
          title: i.title,
          sourceName: i.sourceName,
          publishedAt: i.publishedAt,
          trust: i.trust,
          url: i.url ?? null,
          summary: i.summary.slice(0, 200),
        })),
        sources: outcomes.map((o) => ({ sourceName: o.sourceName, ok: o.ok, count: o.count, error: o.error ?? null })),
      });
      return;
    }

    // Memeriksa kesamaan topik terhadap riwayat konten.
    if (method === 'POST' && path === '/api/similarity') {
      const body = (await readJson(req)) as { title?: string; categoryKey?: string; topic?: string };
      if (!body.title) {
        fail(res, 400, 'Perlu "title".')
        return;
      }
      const history = listSignatures(db, 500).map((s) => ({
        carouselId: s.carouselId,
        categoryKey: s.categoryKey as CategoryKey,
        title: s.title,
        keywords: s.keywords,
        fingerprint: s.fingerprint,
        createdAt: s.createdAt,
      }));
      const hits = checkSimilarity(
        { title: body.title, summary: body.topic ?? '', categoryKey: body.categoryKey ?? 'edukasi_trading' },
        history,
      );
      const top = hits[0];
      json(res, 200, {
        ok: true,
        hits,
        level: similarityLevel(top?.score ?? 0),
        threshold: SIMILARITY_THRESHOLD,
      });
      return;
    }

    fail(res, 404, `Rute API tidak dikenal: ${method} ${path}`);
  } catch (err) {
    fail(res, 500, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[server] galat tak tertangani:', err);
    if (!res.headersSent) fail(res, 500, 'Galat internal server.');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('PropDesk AI — Studio');
  console.log(`  Buka: http://127.0.0.1:${PORT}`);
  console.log(`  Basis data: ${defaultDbPath(ROOT)}`);
  console.log(`  Keluaran  : ${OUTPUT_DIR}`);
  console.log('');
  console.log('  Tekan Ctrl+C untuk berhenti.');
});

process.on('SIGINT', () => {
  console.log('\nMenutup Studio...');
  server.close(() => process.exit(0));
});
