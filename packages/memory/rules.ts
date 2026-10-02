/**
 * Memori agen: aturan yang dipelajari dari revisi manusia.
 *
 * MENGAPA MODUL INI ADA
 * Tanpa ini, setiap revisi hanya memperbaiki satu carousel. Kesalahan yang sama
 * akan terulang di produksi berikutnya, dan pemilik proyek merasa agennya tidak
 * "belajar". Modul ini menutup lingkaran itu:
 *
 *   revisi manusia -> alasan ditangkap -> diubah menjadi aturan -> disisipkan
 *   ke prompt produksi berikutnya -> kesalahan yang sama tidak terulang
 *
 * DUA JENIS ATURAN
 *  1. Aturan yang ditulis langsung manusia (`createdBy: 'human'`). Ini yang
 *     paling kuat dan langsung dipakai.
 *  2. Aturan yang disimpulkan agen dari catatan revisi (`createdBy: 'agent'`).
 *     Agen membaca kumpulan catatan revisi, mencari pola yang berulang, lalu
 *     mengusulkan aturan. Usulan ini tetap perlu dikonfirmasi manusia — agen
 *     tidak boleh mengubah kebijakannya sendiri tanpa persetujuan.
 *
 * Aturan dengan kemunculan berulang naik tingkat kepercayaannya, sehingga
 * aturan yang sering muncul lebih mungkin diterapkan.
 */
import type { CategoryKey, LearnedRule } from '../shared/types.ts';

/** Batas jumlah aturan yang disisipkan ke prompt, agar prompt tidak membengkak. */
export const MAX_RULES_IN_PROMPT = 14;

/** Tingkat kepercayaan minimum agar sebuah aturan dipakai. */
export const MIN_CONFIDENCE = 0.35;

/** Menaikkan kepercayaan ketika aturan yang sama muncul lagi. */
export function boostConfidence(current: number, occurrences: number): number {
  // Naik cepat di awal (agar aturan baru segera berguna), lalu melandai.
  const base = 1 - Math.exp(-occurrences / 2.2);
  return Math.min(0.98, Math.max(current, base));
}

/**
 * Menormalkan teks aturan menjadi kunci pembanding.
 *
 * Dipakai untuk mengenali "aturan yang sama" yang ditulis dengan kata berbeda,
 * supaya tidak menumpuk sebagai puluhan aturan hampir identik.
 */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    // Buang kata yang tidak membedakan makna.
    .replace(/\b(jangan|harus|wajib|selalu|agar|supaya|dan|atau|yang|untuk|pada|di|ke|dari|itu|ini|adalah|lebih)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

/** Memilih aturan yang relevan untuk sebuah produksi. */
export function selectRules(
  rules: LearnedRule[],
  categoryKey: CategoryKey,
  limit = MAX_RULES_IN_PROMPT,
): LearnedRule[] {
  return rules
    .filter((r) => r.active && r.confidence >= MIN_CONFIDENCE)
    // Aturan khusus kategori lebih relevan daripada aturan umum.
    .map((r) => ({
      rule: r,
      weight: r.confidence * (r.categoryKey === categoryKey ? 1.6 : r.categoryKey === null ? 1 : 0.25),
    }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((x) => x.rule);
}

/** Mengubah daftar aturan menjadi blok teks untuk disisipkan ke prompt. */
export function rulesToPrompt(rules: LearnedRule[]): string {
  if (rules.length === 0) return '';
  const lines = rules.map(
    (r, i) => `  ${i + 1}. ${r.rule}${r.occurrences > 1 ? ` (muncul ${r.occurrences}× dalam revisi)` : ''}`,
  );
  return [
    'PELAJARAN DARI REVISI SEBELUMNYA (wajib dipatuhi):',
    ...lines,
    '',
    'Pelajaran di atas berasal dari koreksi manusia atas pekerjaan sebelumnya. Mengabaikannya',
    'berarti mengulangi kesalahan yang sudah pernah dikoreksi.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Refleksi: menyimpulkan aturan dari catatan revisi
// ---------------------------------------------------------------------------

/** Satu catatan revisi yang akan dianalisis. */
export interface RevisionRecord {
  carouselId: string;
  categoryKey: CategoryKey;
  title: string;
  /** Catatan yang ditulis manusia. */
  note: string;
  /** Keputusan yang diambil. */
  decision: 'changes_requested' | 'rejected';
  createdAt: string;
}

/** Aturan hasil kesimpulan, sebelum disimpan. */
export interface ProposedRule {
  categoryKey: CategoryKey | null;
  rule: string;
  rationale: string;
  /** Berapa catatan yang mendukung aturan ini. */
  evidenceCount: number;
}

/**
 * Mengelompokkan catatan revisi berdasarkan kemiripan kata kunci.
 *
 * Pendekatan ini dipilih daripada langsung meminta model menyimpulkan, karena
 * pengelompokan harus dapat diperiksa manusia. Model kemudian hanya diberi
 * kelompok yang sudah jelas, bukan seluruh riwayat.
 */
export function groupRevisions(records: RevisionRecord[]): { key: string; records: RevisionRecord[] }[] {
  const groups = new Map<string, RevisionRecord[]>();
  for (const r of records) {
    const key = ruleKey(r.note);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, records: list }))
    .sort((a, b) => b.records.length - a.records.length);
}

/**
 * Menyimpulkan aturan dari catatan revisi TANPA memanggil model.
 *
 * Dipakai sebagai jalur cepat dan sebagai cadangan bila model tidak tersedia.
 * Aturan yang dihasilkan sederhana, tetapi sudah cukup untuk menangkap
 * permintaan yang berulang seperti "judul terlalu panjang" atau "tambahkan
 * angka konkret".
 *
 * Kelompok yang muncul lebih dari sekali diangkat menjadi aturan; yang sekali
 * hanya menjadi catatan agar prompt tidak dipenuhi aturan sekali pakai.
 */
export function inferRulesFromRevisions(
  records: RevisionRecord[],
  minEvidence = 1,
): ProposedRule[] {
  const groups = groupRevisions(records);
  const proposed: ProposedRule[] = [];

  for (const group of groups) {
    if (group.records.length < minEvidence) continue;
    // Kategori yang paling sering muncul dalam kelompok ini.
    const counts = new Map<CategoryKey, number>();
    for (const r of group.records) counts.set(r.categoryKey, (counts.get(r.categoryKey) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    // Bila kelompok ini tersebar di banyak kategori, jadikan aturan umum.
    const isGeneral = counts.size >= 3;
    const sample = group.records[0]!;

    proposed.push({
      categoryKey: isGeneral ? null : (dominant?.[0] ?? null),
      rule: `Perhatikan catatan berikut: ${sample.note.trim()}`,
      rationale: `Muncul ${group.records.length}× pada revisi sebelumnya (mis. "${sample.title}").`,
      evidenceCount: group.records.length,
    });
  }

  return proposed.sort((a, b) => b.evidenceCount - a.evidenceCount);
}

/** Bentuk keluaran agen refleksi. */
export interface ReflectionOutput {
  rules: {
    rule: string;
    rationale: string;
    categoryKey: string | null;
    confidence: number;
  }[];
  summary: string;
}

/**
 * Menerapkan aturan yang diusulkan ke daftar aturan yang sudah ada.
 *
 * Mengembalikan daftar baru beserta ringkasan perubahan, sehingga pemanggil
 * dapat melaporkan apa yang berubah — bukan diam-diam memperbarui.
 */
export function mergeRules(
  existing: LearnedRule[],
  proposed: ProposedRule[],
  now = new Date().toISOString(),
): { rules: LearnedRule[]; added: LearnedRule[]; updated: LearnedRule[] } {
  const byKey = new Map(existing.map((r) => [ruleKey(r.rule), r]));
  const added: LearnedRule[] = [];
  const updated: LearnedRule[] = [];

  for (const p of proposed) {
    const key = ruleKey(p.rule);
    if (!key) continue;
    const found = byKey.get(key);

    if (found) {
      const occurrences = found.occurrences + p.evidenceCount;
      found.occurrences = occurrences;
      found.confidence = boostConfidence(found.confidence, occurrences);
      found.lastSeenAt = now;
      updated.push(found);
    } else {
      const rule: LearnedRule = {
        id: `lr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        categoryKey: p.categoryKey,
        rule: p.rule,
        rationale: p.rationale,
        occurrences: p.evidenceCount,
        confidence: boostConfidence(0, p.evidenceCount),
        createdBy: 'agent',
        createdAt: now,
        lastSeenAt: now,
        active: true,
      };
      byKey.set(key, rule);
      added.push(rule);
    }
  }

  return { rules: [...byKey.values()], added, updated };
}

/** Ringkasan kondisi memori, untuk ditampilkan di antarmuka. */
export function memorySummary(rules: LearnedRule[]): {
  total: number;
  active: number;
  strong: number;
  byCategory: Record<string, number>;
} {
  const active = rules.filter((r) => r.active);
  const byCategory: Record<string, number> = {};
  for (const r of active) {
    const key = r.categoryKey ?? 'umum';
    byCategory[key] = (byCategory[key] ?? 0) + 1;
  }
  return {
    total: rules.length,
    active: active.length,
    strong: active.filter((r) => r.confidence >= 0.7).length,
    byCategory,
  };
}
