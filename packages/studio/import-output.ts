/**
 * Impor hasil produksi CLI ke basis data Studio.
 *
 * MENGAPA PERINTAH INI ADA
 * Pipeline CLI menulis hasilnya ke folder `output/` sebagai berkas, sementara
 * dashboard Studio membaca dari basis data. Tanpa penjembatan ini, pekerjaan
 * yang benar-benar dihasilkan lewat CLI tidak akan terlihat di dashboard —
 * padahal justru itulah produksi yang sesungguhnya.
 *
 * Perintah ini membaca setiap folder produksi (slide spec, laporan kepatuhan,
 * fact sheet, jejak langkah, biaya) dan memasukkannya ke basis data. Hasilnya
 * dapat dijalankan berulang: produksi yang sudah pernah diimpor dilewati,
 * sehingga aman dijalankan berkali-kali.
 *
 * Jalankan: npm run studio:import
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultDbPath, openDb, saveProduction, listCarousels, audit, removeDemoData, saveSignature } from './db.ts';
import { getCategory } from '../shared/categories.ts';
import { signatureFromSpec } from '../memory/topics.ts';
import type { CarouselSpec, Slide } from '../shared/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUTPUT_DIR = join(ROOT, 'output');

/** Folder yang bukan hasil produksi dan harus dilewati. */
const SKIP_PREFIXES = ['_'];

/** Apakah folder ini berisi hasil produksi yang lengkap? */
async function isProductionFolder(dir: string): Promise<boolean> {
  return existsSync(join(dir, 'slide-spec.json'));
}

/** Membaca JSON dengan aman. */
async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Membaca laporan kepatuhan markdown dan mengambil statusnya. */
async function readComplianceStatus(dir: string): Promise<{ outcome: string; findings: { ruleKey: string; ruleName: string; subjectRef: string; evidence: string; suggestion: string; severity: string; result: string; decidedBy: string; layer: string }[] }> {
  const path = join(dir, 'laporan-kepatuhan.md');
  if (!existsSync(path)) {
    return { outcome: 'unknown', findings: [] };
  }
  const text = await readFile(path, 'utf8');
  const outcome = /Status kepatuhan: (\w+)/.exec(text)?.[1]?.toLowerCase() ?? 'unknown';

  // Laporan memuat baris temuan dalam bentuk:
  //   [BLOKIR] slide:4 — Nama aturan
  //       Bukti: ...
  //       Saran: ...
  const findings: { ruleKey: string; ruleName: string; subjectRef: string; evidence: string; suggestion: string; severity: string; result: string; decidedBy: string; layer: string }[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*\[(BLOKIR|PERINGATAN)\]\s+(\S+)\s+—\s+(.+)$/.exec(lines[i] ?? '');
    if (!m) continue;
    const severity = m[1] === 'BLOKIR' ? 'block' : 'warn';
    const subjectRef = m[2] ?? 'carousel';
    const ruleName = (m[3] ?? '').trim();
    let evidence = '';
    let suggestion = '';
    // Ambil dua baris rincian yang mengikuti.
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
      const line = (lines[j] ?? '').trim();
      if (line.startsWith('Bukti:')) evidence = line.slice(6).trim();
      else if (line.startsWith('Saran:')) suggestion = line.slice(6).trim();
      else if (line.startsWith('[')) break;
    }
    findings.push({
      ruleKey: ruleName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60),
      ruleName,
      subjectRef,
      evidence,
      suggestion,
      severity,
      result: severity === 'block' ? 'fail' : 'warn',
      decidedBy: /nuansa/i.test(ruleName) ? 'llm' : 'rule_engine',
      layer: /nuansa/i.test(ruleName) ? 'L4_framing' : 'L2_banned_phrase',
    });
  }
  return { outcome, findings };
}

/** Membaca fact sheet markdown (tabel). */
async function readFacts(dir: string): Promise<{ ref: string; claim: string; sourceName: string; asOf: string; confidence: string }[]> {
  const path = join(dir, 'fact-sheet.md');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const facts: { ref: string; claim: string; sourceName: string; asOf: string; confidence: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    // Baris tabel: | f1 | klaim | sumber | asOf | keyakinan |
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;
    const [, ref, claim, sourceName, asOf, confidence] = cells;
    if (!ref || ref === 'ID' || /^-+$/.test(ref)) continue;
    facts.push({
      ref,
      claim: claim ?? '',
      sourceName: sourceName ?? '',
      asOf: asOf ?? new Date().toISOString(),
      confidence: confidence ?? 'medium',
    });
  }
  return facts;
}

/** Membaca jejak langkah markdown (tabel). */
async function readSteps(dir: string): Promise<{ stepKey: string; agentKey: string; status: string; durationMs: number; note: string }[]> {
  const path = join(dir, 'jejak-produksi.md');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const steps: { stepKey: string; agentKey: string; status: string; durationMs: number; note: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    // Baris tabel berbentuk: | step | agen | status | durasi | catatan |
    // Setelah pemisahan, hasilnya 7 bagian (ada bagian kosong di ujung).
    if (cells.length < 7) continue;
    const [, stepKey, agentKey, status, duration, note] = cells;
    if (!stepKey || stepKey === 'Langkah' || /^-+$/.test(stepKey)) continue;
    steps.push({
      stepKey,
      agentKey: agentKey ?? '',
      status: status ?? 'succeeded',
      durationMs: Math.round(parseFloat(duration ?? '0') * 1000) || 0,
      note: note ?? '',
    });
  }
  return steps;
}

/** Membaca caption teks. */
async function readCaption(dir: string): Promise<{ platform: string; hook: string; body: string; hashtags: string[]; cta: string } | null> {
  const path = join(dir, 'caption.txt');
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  const start = text.indexOf('--- Salin dari sini ---');
  const end = text.indexOf('--- Selesai ---');
  if (start < 0 || end < 0) return null;
  const body = text.slice(start + '--- Salin dari sini ---'.length, end).trim();
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const hashtagLine = lines.filter((l) => l.startsWith('#') && !l.startsWith('# ')).pop() ?? '';
  const rest = lines.filter((l) => l !== hashtagLine && l.length > 0);
  const hook = rest[0] ?? '';
  const cta = rest.length > 1 ? rest[rest.length - 1]! : '';
  const middle = rest.slice(1, -1).join('\n');
  return {
    platform: 'instagram',
    hook,
    body: middle,
    hashtags: hashtagLine.split(/\s+/).filter((h) => h.startsWith('#')),
    cta,
  };
}

/** Membaca rekap biaya. */
async function readCost(dir: string): Promise<{ totalUsd: number; tokensIn: number; tokensOut: number; entries: { agentKey: string; model: string; tokensIn: number; tokensOut: number; amountUsd: number; cached: boolean }[] }> {
  const data = await readJsonSafe<{
    totalUsd?: number;
    totalTokensIn?: number;
    totalTokensOut?: number;
    entries?: { agentKey?: string; model?: string; tokensIn?: number; tokensOut?: number; amountUsd?: number; cached?: boolean }[];
  }>(join(dir, 'biaya.json'));
  if (!data) return { totalUsd: 0, tokensIn: 0, tokensOut: 0, entries: [] };
  return {
    totalUsd: data.totalUsd ?? 0,
    tokensIn: data.totalTokensIn ?? 0,
    tokensOut: data.totalTokensOut ?? 0,
    entries: (data.entries ?? []).map((e) => ({
      agentKey: e.agentKey ?? '',
      model: e.model ?? '',
      tokensIn: e.tokensIn ?? 0,
      tokensOut: e.tokensOut ?? 0,
      amountUsd: e.amountUsd ?? 0,
      cached: e.cached === true,
    })),
  };
}

async function main() {
  const db = openDb(defaultDbPath(ROOT));

  if (!existsSync(OUTPUT_DIR)) {
    console.log(`Folder keluaran belum ada: ${OUTPUT_DIR}`);
    console.log('Jalankan produksi lebih dulu, misalnya: npm run carousel:demo');
    return;
  }

  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory() && !SKIP_PREFIXES.some((p) => e.name.startsWith(p)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => join(OUTPUT_DIR, e.name));

  // Data contoh dihapus BILA ada hasil produksi nyata yang akan diimpor, supaya
  // dashboard tidak mencampur keduanya. Bila belum ada produksi nyata, data
  // contoh dibiarkan agar antarmuka tetap dapat dilihat.
  const realFolders = await Promise.all(folders.map((dir) => isProductionFolder(dir)));
  if (realFolders.some(Boolean)) {
    const removed = removeDemoData(db);
    if (removed.removed > 0) {
      console.log(`Data contoh dibersihkan: ${removed.removed} carousel contoh dihapus.\n`);
    }
  }

  // Kumpulkan id carousel yang sudah ada, supaya impor dapat dijalankan ulang.
  const existing = new Set(listCarousels(db, { limit: 2000 }).map((c) => c.id));

  console.log('=== Impor Hasil Produksi ke Studio ===\n');
  console.log(`Memindai ${folders.length} folder di ${OUTPUT_DIR}\n`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const dir of folders) {
    const name = dir.split(/[\\/]/).pop() ?? dir;
    if (!(await isProductionFolder(dir))) {
      skipped += 1;
      continue;
    }

    const spec = await readJsonSafe<CarouselSpec>(join(dir, 'slide-spec.json'));
    if (!spec || !Array.isArray(spec.slides)) {
      console.log(`  LEWATI ${name} — slide-spec.json tidak dapat dibaca`);
      failed += 1;
      continue;
    }

    // Identitas carousel diturunkan dari nama folder agar impor berulang tidak
    // menghasilkan duplikat.
    const carouselId = `imp_${name.replace(/[^a-zA-Z0-9]+/g, '_')}`;
    if (existing.has(carouselId)) {
      console.log(`  SUDAH ADA ${name}`);
      skipped += 1;
      continue;
    }

    const category = getCategory(spec.categoryKey);
    const compliance = await readComplianceStatus(dir);
    const facts = await readFacts(dir);
    const steps = await readSteps(dir);
    const caption = await readCaption(dir);
    const cost = await readCost(dir);

    // Durasi produksi dihitung dari jumlah durasi langkah-langkahnya, karena
    // berkas hasil tidak menyimpan durasi total.
    const durationMs = steps.reduce((total, s) => total + s.durationMs, 0);

    saveProduction(db, {
      carouselId,
      categoryKey: spec.categoryKey,
      topic: spec.title,
      title: spec.title,
      riskLevel: category.riskLevel,
      asOf: spec.asOf ?? new Date().toISOString(),
      disclaimerKey: spec.disclaimerKey,
      folder: dir,
      slides: spec.slides.map((s: Slide) => ({
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
      caption,
      facts,
      findings: compliance.findings,
      complianceOutcome: compliance.outcome,
      complianceBlocked: compliance.outcome === 'diblokir' || compliance.findings.some((f) => f.result === 'fail'),
      agentRuns: steps.map((s) => {
        const match = cost.entries.find((e) => e.agentKey === s.agentKey);
        return {
          stepKey: s.stepKey,
          agentKey: s.agentKey,
          status: s.status,
          ...(match?.model ? { model: match.model } : {}),
          startedAt: new Date().toISOString(),
          durationMs: s.durationMs,
          note: s.note,
          tokensIn: match?.tokensIn ?? 0,
          tokensOut: match?.tokensOut ?? 0,
          costUsd: match?.amountUsd ?? 0,
          cached: match?.cached ?? false,
        };
      }),
      costUsd: cost.totalUsd,
      tokensIn: cost.tokensIn,
      tokensOut: cost.tokensOut,
      durationMs,
      scheduleNote: steps.find((s) => s.stepKey === 'schedule')?.note ?? '',
      analysisNote: steps.find((s) => s.stepKey === 'analyze')?.note ?? '',
    });

    console.log(
      `  DIIMPOR ${name}\n           ${spec.slides.length} slide, kepatuhan ${compliance.outcome}, ${compliance.findings.length} temuan, biaya $${cost.totalUsd.toFixed(6)}`,
    );

    // Sidik jari isi WAJIB disimpan juga untuk hasil impor. Tanpa langkah ini,
    // konten yang dibuat lewat CLI tidak ikut terdeteksi sebagai topik yang
    // sudah pernah dibahas — dan itu membuat pemeriksaan duplikasi buta
    // terhadap sebagian besar riwayat.
    const sig = signatureFromSpec(carouselId, spec, caption ? [`${caption.hook} ${caption.body}`] : []);
    saveSignature(db, {
      carouselId,
      categoryKey: spec.categoryKey,
      title: spec.title,
      keywords: sig.keywords,
      fingerprint: sig.fingerprint,
    });

    imported += 1;
  }

  if (imported > 0) {
    audit(db, 'system', 'studio.import', 'studio', null, { imported, skipped, failed });
  }

  console.log('\n=== Ringkasan ===');
  console.log(`  Diimpor     : ${imported}`);
  console.log(`  Dilewati    : ${skipped}`);
  console.log(`  Gagal       : ${failed}`);
  console.log(`\nBuka dashboard untuk melihatnya: npm run studio`);
}

main().catch((e) => {
  console.error('Impor gagal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
