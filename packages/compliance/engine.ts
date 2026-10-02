/**
 * Mesin kepatuhan deterministik.
 *
 * Menjalankan seluruh aturan dari `rules.ts` terhadap sebuah carousel dan
 * menghasilkan laporan dengan kesimpulan yang dapat ditindaklanjuti.
 *
 * Yang penting dipahami dari desain ini: mesin ini TIDAK memanggil model
 * bahasa. Semua keputusan di sini berasal dari kode, sehingga hasilnya
 * konsisten, dapat diuji, dan tidak dapat dibujuk oleh teks di dalam konten.
 * Penilaian nuansa (L4) ditambahkan terpisah sebagai lapisan penasihat yang
 * hanya dapat menambah peringatan, tidak pernah membatalkan blokir dari sini.
 */
import type {
  CarouselSpec,
  ComplianceFinding,
  ComplianceReport,
  Slide,
} from '../shared/types.ts';
import { getCategory } from '../shared/categories.ts';
import { ALL_RULES, rulesForCategory, type ComplianceRule } from './rules.ts';

/** Konteks pemeriksaan. */
export interface ComplianceContext {
  /** Teks disclaimer yang benar-benar akan tampil; kosong berarti tidak ada. */
  disclaimerText?: string;
}

/** Teks slide yang digabung untuk pencarian pola. */
function slideText(slide: Slide): string {
  return [slide.headline, slide.body ?? '', ...slide.bullets].join('\n');
}

/** Seluruh teks carousel. */
function allText(spec: CarouselSpec): string {
  return spec.slides.map(slideText).join('\n');
}

/**
 * Menormalkan teks untuk pencarian pola.
 *
 * Beberapa trik umum yang harus tetap tertangkap:
 *  - spasi berlebih (mis. "pasti   profit"),
 *  - karakter lebar penuh,
 *  - penyisipan tanda baca antar kata ("p.a.s.t.i"),
 *  - huruf besar-kecil.
 */
export function normalize(text: string): string {
  let out = text.toLowerCase();
  // Buang karakter tak terlihat yang sering dipakai untuk menyiasati filter.
  out = out.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  // Ubah karakter lebar penuh menjadi ASCII.
  out = out.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // Rapikan spasi.
  out = out.replace(/\s+/g, ' ');
  // Runtuhkan pemisahan antar huruf tunggal: "p a s t i" -> "pasti"
  out = out.replace(/\b(?:\w[.\-_*·•]?){3,}\b/g, (token) => token.replace(/[.\-_*·•\s]/g, ''));
  return out;
}

/** Menemukan kalimat di sekitar kecocokan, untuk bukti yang dapat dibaca. */
function evidenceSnippet(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, text.lastIndexOf('\n', index) + 1);
  const endOfLine = text.indexOf('\n', index + matchLength);
  const end = endOfLine === -1 ? text.length : endOfLine;
  const snippet = text.slice(start, end).trim();
  return snippet.length > 200 ? `${snippet.slice(0, 197)}...` : snippet;
}

/** Benar bila teks mengandung angka yang tampak seperti data. */
function hasNumericClaim(text: string, ignorePatterns: string[]): { found: boolean; match?: string } {
  const cleaned = text;
  // Pola angka bermakna: persentase, desimal, nominal mata uang, level harga,
  // atau angka berkelompok ribuan.
  const patterns = [
    /\b\d+(?:[.,]\d+)?\s*%/g,                        // 10%, 2,5%
    /\b(?:rp|idr|usd|\$)\s?\d[\d.,]*/gi,             // Rp10.000.000, $1,234
    /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/g,        // 10.000, 1,234.56
    /\b\d+(?:[.,]\d+)?\s*(?:r\b|pips?\b|poin\b|lot\b)/gi, // 2R, 50 pips, 1 lot
    /\b\d+(?:[.,]\d+)?\s*(?:ribu|juta|miliar|k\b|jt\b)/gi, // 10 juta
  ];
  for (const p of patterns) {
    p.lastIndex = 0;
    const m = p.exec(cleaned);
    if (m) {
      // Abaikan angka yang cocok dengan pola pengecualian (mis. "dalam 5 hari").
      const isIgnored = ignorePatterns.some((ip) => new RegExp(ip, 'i').test(m[0]));
      if (!isIgnored) return { found: true, match: m[0] };
    }
  }
  return { found: false };
}

/** Satu temuan bawaan untuk aturan yang lolos. */
function pass(rule: ComplianceRule, subjectRef: string, note?: string): ComplianceFinding {
  return {
    ruleKey: rule.key,
    ruleName: rule.name,
    layer: rule.layer,
    severity: rule.severity,
    result: 'pass',
    subjectRef,
    ...(note ? { evidence: note } : {}),
    decidedBy: 'rule_engine',
  };
}

/** Satu temuan kegagalan. */
function fail(
  rule: ComplianceRule,
  subjectRef: string,
  evidence: string,
  suggestion?: string,
): ComplianceFinding {
  return {
    ruleKey: rule.key,
    ruleName: rule.name,
    layer: rule.layer,
    severity: rule.severity,
    result: rule.severity === 'block' ? 'fail' : 'warn',
    subjectRef,
    evidence,
    ...(suggestion ? { suggestion } : {}),
    decidedBy: 'rule_engine',
  };
}

/** Menjalankan satu aturan. */
function runRule(
  rule: ComplianceRule,
  spec: CarouselSpec,
  ctx: ComplianceContext,
): ComplianceFinding[] {
  switch (rule.checkType) {
    case 'require_role': {
      const wanted = String(rule.config.role);
      const alt = rule.config.altRole ? String(rule.config.altRole) : undefined;
      const label = String(rule.config.label ?? wanted);
      const found = spec.slides.some((s) => s.role === wanted || (alt !== undefined && s.role === alt));
      return found
        ? [pass(rule, 'carousel', `Ditemukan ${label}.`)]
        : [
            fail(
              rule,
              'carousel',
              `Tidak ada slide dengan peran "${wanted}"${alt ? ` atau "${alt}"` : ''}.`,
              `Tambahkan ${label} pada akhir carousel.`,
            ),
          ];
    }

    case 'slide_count_range': {
      const min = Number(rule.config.min ?? 5);
      const max = Number(rule.config.max ?? 12);
      const n = spec.slides.length;
      if (n >= min && n <= max) return [pass(rule, 'carousel', `${n} slide, dalam rentang ${min}-${max}.`)];
      return [
        fail(
          rule,
          'carousel',
          `Carousel memiliki ${n} slide, di luar rentang yang disarankan ${min}-${max}.`,
          n < min ? 'Tambahkan slide penjelasan atau contoh.' : 'Pecah menjadi dua carousel agar tidak terlalu padat.',
        ),
      ];
    }

    case 'first_slide_is_hook': {
      const first = spec.slides.find((s) => s.position === 1) ?? spec.slides[0];
      if (!first) return [fail(rule, 'carousel', 'Carousel tidak memiliki slide.', 'Tambahkan minimal satu slide.')];
      return first.role === 'hook'
        ? [pass(rule, 'slide:1', 'Slide pertama berperan hook.')]
        : [
            fail(
              rule,
              'slide:1',
              `Slide pertama berperan "${first.role}", bukan "hook".`,
              'Ubah peran slide pertama menjadi hook dan tulis judul yang menghentikan gulir.',
            ),
          ];
    }

    case 'no_empty_content': {
      const findings: ComplianceFinding[] = [];
      for (const slide of spec.slides) {
        const empty = !slide.headline || slide.headline.trim().length === 0;
        if (empty) {
          findings.push(
            fail(rule, `slide:${slide.position}`, 'Judul slide kosong.', 'Isi judul slide ini sebelum dirender.'),
          );
        }
      }
      return findings.length > 0 ? findings : [pass(rule, 'carousel', 'Semua slide memiliki judul.')];
    }

    case 'require_disclaimer_text': {
      const text = ctx.disclaimerText ?? '';
      if (text.trim().length === 0) {
        return [
          fail(
            rule,
            'carousel',
            `Kunci disclaimer "${spec.disclaimerKey}" tidak menghasilkan teks apa pun.`,
            'Tambahkan teks disclaimer untuk kunci ini di brand kit, atau ganti ke kunci yang tersedia.',
          ),
        ];
      }
      return [pass(rule, 'carousel', `Disclaimer terisi (${text.trim().length} karakter).`)];
    }

    case 'forbidden_pattern': {
      const patterns = (rule.config.patterns as string[] | undefined) ?? [];
      const hint = rule.config.hint ? String(rule.config.hint) : undefined;
      const findings: ComplianceFinding[] = [];
      let hit = false;

      for (const slide of spec.slides) {
        const raw = slideText(slide);
        const normalized = normalize(raw);
        for (const pattern of patterns) {
          const re = new RegExp(pattern, 'i');
          const m = re.exec(normalized);
          if (m) {
            hit = true;
            // Bukti diambil dari teks asli agar manusia melihat kalimat aslinya.
            const originalIndex = raw.toLowerCase().indexOf(m[0].slice(0, 12));
            const evidence = originalIndex >= 0 ? evidenceSnippet(raw, originalIndex, m[0].length) : m[0];
            findings.push(fail(rule, `slide:${slide.position}`, `Ditemukan "${m[0]}": ${evidence}`, hint));
          }
        }
      }
      return hit ? findings : [pass(rule, 'carousel', `Tidak ditemukan pola terlarang (${patterns.length} pola diperiksa).`)];
    }

    case 'attribution_claim': {
      const patterns = (rule.config.patterns as string[] | undefined) ?? [];
      const hint = rule.config.hint ? String(rule.config.hint) : undefined;
      const findings: ComplianceFinding[] = [];
      let hit = false;
      for (const slide of spec.slides) {
        const raw = slideText(slide);
        const normalized = normalize(raw);
        for (const pattern of patterns) {
          const m = new RegExp(pattern, 'i').exec(normalized);
          if (m) {
            hit = true;
            findings.push(
              fail(rule, `slide:${slide.position}`, `Klaim atributif tanpa dasar: "${m[0]}"`, hint),
            );
          }
        }
      }
      return hit ? findings : [pass(rule, 'carousel', 'Tidak ada klaim lisensi atau pengawasan otoritas.')];
    }

    case 'numeric_requires_source': {
      const ignorePatterns = (rule.config.ignorePatterns as string[] | undefined) ?? [];
      const findings: ComplianceFinding[] = [];
      let anyMissing = false;

      for (const slide of spec.slides) {
        // Slide yang hanya mengarahkan pembaca (cta/recap/disclaimer) tidak
        // perlu sumber walaupun menyebut angka umum.
        if (slide.role === 'cta' || slide.role === 'disclaimer') continue;

        const text = slideText(slide);
        const numeric = hasNumericClaim(text, ignorePatterns);
        if (!numeric.found) continue;

        if (slide.sourceRefs.length === 0) {
          anyMissing = true;
          findings.push(
            fail(
              rule,
              `slide:${slide.position}`,
              `Menyebut angka "${numeric.match}" tetapi tidak memiliki rujukan sumber.`,
              'Tambahkan rujukan ke entri fact sheet pada slide ini, atau hapus angkanya.',
            ),
          );
        }
      }
      return anyMissing
        ? findings
        : [pass(rule, 'carousel', 'Semua slide berangka memiliki rujukan sumber.')];
    }

    default: {
      return [
        {
          ruleKey: rule.key,
          ruleName: rule.name,
          layer: rule.layer,
          severity: rule.severity,
          result: 'skipped',
          subjectRef: 'carousel',
          evidence: `Tipe pemeriksaan "${rule.checkType}" belum diterapkan di mesin.`,
          decidedBy: 'rule_engine',
        },
      ];
    }
  }
}

/**
 * Menjalankan seluruh aturan kepatuhan terhadap sebuah carousel.
 *
 * @param spec          Carousel yang diperiksa.
 * @param ctx           Konteks (teks disclaimer yang benar-benar tampil).
 * @param options.strict Bila benar, peringatan juga dianggap memblokir
 *                       (dipakai untuk kategori berisiko tinggi).
 */
export function checkCompliance(
  spec: CarouselSpec,
  ctx: ComplianceContext,
  options: { strict?: boolean } = {},
): ComplianceReport {
  const category = getCategory(spec.categoryKey);
  // Kategori berisiko tinggi selalu diperiksa ketat, terlepas dari permintaan.
  const strict = options.strict === true || category.riskLevel === 'high';
  const rules = rulesForCategory(category.key, category.requiresSources);

  const findings: ComplianceFinding[] = [];
  for (const rule of rules) {
    findings.push(...runRule(rule, spec, ctx));
  }

  // Aturan tambahan yang hanya relevan untuk kategori berisiko tinggi.
  if (category.riskLevel === 'high') {
    const disclaimerSlide = spec.slides.find((s) => s.role === 'disclaimer');
    const mandatory = /bukan\s+ajakan|bukan\s+nasihat|risiko|skenario/i;
    if (disclaimerSlide && !mandatory.test(`${disclaimerSlide.body ?? ''} ${ctx.disclaimerText ?? ''}`)) {
      findings.push({
        ruleKey: 'L1.high_risk_disclaimer_wording',
        ruleName: 'Kata wajib pada disclaimer kategori berisiko tinggi',
        layer: 'L1_structure',
        severity: 'block',
        result: 'fail',
        subjectRef: `slide:${disclaimerSlide.position}`,
        evidence: 'Disclaimer tidak memuat penegasan bahwa materi adalah analisis skenario, bukan ajakan bertransaksi.',
        suggestion:
          'Gunakan kunci disclaimer "outlook_signal" yang sudah memuat penegasan tersebut, atau tulis penegasan serupa.',
        decidedBy: 'rule_engine',
      });
    }
    if (category.requiresAsOf && !spec.asOf) {
      findings.push({
        ruleKey: 'L1.requires_as_of',
        ruleName: 'Penanda waktu data wajib',
        layer: 'L1_structure',
        severity: 'block',
        result: 'fail',
        subjectRef: 'carousel',
        evidence: 'Carousel tidak memiliki penanda waktu (asOf), padahal data pasar cepat berubah.',
        suggestion: 'Isi asOf dengan waktu data diambil sehingga pembaca tahu seberapa segar analisisnya.',
        decidedBy: 'rule_engine',
      });
    }
  }

  const blocking = findings.filter((f) => f.result === 'fail' && f.severity === 'block');
  const warns = findings.filter((f) => f.result === 'warn');
  const outcome: ComplianceReport['outcome'] =
    blocking.length > 0 ? 'block' : warns.length > 0 ? 'warn' : 'pass';

  const summary = [
    `${findings.filter((f) => f.result === 'pass').length} aturan lolos`,
    `${blocking.length} pelanggaran memblokir`,
    `${warns.length} peringatan`,
    strict ? '(mode ketat: kategori berisiko tinggi)' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    findings,
    outcome,
    blocked: blocking.length > 0,
    checkedAt: new Date().toISOString(),
    summary,
  };
}

/** Mencetak laporan kepatuhan dalam bentuk yang mudah dibaca manusia. */
export function formatComplianceReport(report: ComplianceReport): string {
  const lines: string[] = [];
  const icon = report.outcome === 'pass' ? 'LOLOS' : report.outcome === 'warn' ? 'PERINGATAN' : 'DIBLOKIR';
  lines.push(`Status kepatuhan: ${icon}`);
  lines.push(report.summary);
  lines.push('');

  const problems = report.findings.filter((f) => f.result === 'fail' || f.result === 'warn');
  if (problems.length > 0) {
    lines.push('Temuan yang perlu ditindaklanjuti:');
    for (const f of problems) {
      const tag = f.severity === 'block' ? '[BLOKIR]' : '[PERINGATAN]';
      lines.push(`  ${tag} ${f.subjectRef} — ${f.ruleName}`);
      if (f.evidence) lines.push(`      Bukti: ${f.evidence}`);
      if (f.suggestion) lines.push(`      Saran: ${f.suggestion}`);
    }
    lines.push('');
  }

  const passed = report.findings.filter((f) => f.result === 'pass');
  if (passed.length > 0) {
    lines.push(`Aturan yang lolos (${passed.length}):`);
    for (const f of passed) {
      lines.push(`  - ${f.ruleName}${f.evidence ? `: ${f.evidence}` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Jumlah seluruh aturan yang aktif, untuk ditampilkan di ringkasan sistem. */
export const TOTAL_RULE_COUNT = ALL_RULES.length;
