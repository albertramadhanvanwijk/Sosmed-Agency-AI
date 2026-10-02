/**
 * Klien model bahasa melalui 9Router lokal.
 *
 * Semua panggilan model melewati berkas ini agar kebijakan berikut berlaku
 * seragam:
 *
 *  - Routing per kelas tugas: model mahal hanya untuk keputusan, model murah
 *    untuk transformasi. Konfigurasi diambil dari hasil probe nyata, bukan
 *    dari asumsi.
 *  - Rantai cadangan: bila model utama gagal (kuota habis, layanan sibuk),
 *    permintaan dicoba ke model berikutnya sebelum menyerah.
 *  - Cache berdasarkan hash masukan: mengulang langkah yang sama tidak
 *    menambah biaya.
 *  - Validasi keluaran: setiap respons wajib lolos pemeriksa. Bila tidak,
 *    permintaan diperbaiki maksimum dua kali dengan pesan galat disertakan.
 *  - Pembukuan: setiap panggilan dicatat ke buku besar biaya.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CostEntry, CostReport } from '../shared/types.ts';

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

/** Kelas tugas. Menentukan seberapa mahal model yang dipakai. */
export type TaskClass =
  | 'decision'   // strategi, penilaian kepatuhan, analisis akhir
  | 'transform'  // menulis caption, menyusun slide spec, merangkum sumber
  | 'extract';   // klasifikasi, penandaan, ekstraksi sederhana

/** Konfigurasi satu model. */
export interface ModelConfig {
  id: string;
  /** Perkiraan biaya per 1 juta token (USD). Nol berarti gratis/lokal. */
  costPer1MIn: number;
  costPer1MOut: number;
  /** Catatan kenapa model ini dipilih. */
  note: string;
}

/**
 * Routing model.
 *
 * Urutan dalam setiap kelas adalah urutan percobaan. Model pertama adalah
 * pilihan utama; sisanya cadangan bila pilihan utama tidak tersedia.
 *
 * Isi daftar ini berasal dari hasil `npm run probe:models` pada 9Router
 * pengguna. Model yang ada di katalog tetapi tidak lolos probe sengaja
 * TIDAK dicantumkan supaya kegagalan tidak terjadi berulang di produksi.
 */
export const MODEL_ROUTING: Record<TaskClass, ModelConfig[]> = {
  decision: [
    { id: 'My_Agents', costPer1MIn: 0, costPer1MOut: 0, note: 'combo dengan rantai cadangan internal; penalaran terkuat yang tersedia' },
    { id: 'gemini/gemini-3.5-flash-lite', costPer1MIn: 0.1, costPer1MOut: 0.4, note: 'cadangan: cepat dan patuh skema' },
  ],
  transform: [
    { id: 'gemini/gemini-3.5-flash-lite', costPer1MIn: 0.1, costPer1MOut: 0.4, note: 'paling seimbang antara kecepatan dan kepatuhan skema' },
    { id: 'gemini/gemini-3.1-flash-lite-preview', costPer1MIn: 0.1, costPer1MOut: 0.4, note: 'cadangan setara' },
    { id: 'My_Agents', costPer1MIn: 0, costPer1MOut: 0, note: 'cadangan terakhir' },
  ],
  extract: [
    { id: 'ollama/gpt-oss:120b', costPer1MIn: 0, costPer1MOut: 0, note: 'tercepat dari hasil probe; cocok untuk tugas ringan' },
    { id: 'gemini/gemini-3.5-flash-lite', costPer1MIn: 0.1, costPer1MOut: 0.4, note: 'cadangan' },
  ],
};

/** Pesan galat yang menandakan percobaan ulang layak dilakukan. */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 522, 524]);

/** Kode galat yang berarti "jangan coba model ini lagi sekarang". */
const HARD_FAIL_HINTS = [
  'insufficient credits',
  'not supported when using codex',
  'requires an active subscription',
  'is deleted or disabled',
  'not included in your free usage',
  'model is not supported',
];

// ---------------------------------------------------------------------------
// Tipe hasil
// ---------------------------------------------------------------------------

/** Satu respons model beserta jejak pemakaiannya. */
export interface LlmResponse {
  text: string;
  model: string;
  /** Model yang benar-benar melayani permintaan (bisa berbeda dari yang diminta). */
  routedTo?: string;
  /** Token masukan yang dibelanjakan pada pemanggilan ini; 0 bila dari cache. */
  tokensIn: number;
  /** Token keluaran yang dibelanjakan pada pemanggilan ini; 0 bila dari cache. */
  tokensOut: number;
  latencyMs: number;
  /** Benar bila jawaban diambil dari cache sehingga tidak menambah biaya. */
  cached: boolean;
  /** Jumlah perbaikan yang diperlukan agar keluaran valid. */
  repairAttempts: number;
}

/** Opsi pemanggilan. */
export interface LlmCallOptions {
  taskClass: TaskClass;
  system: string;
  user: string;
  /** Nama agen untuk pembukuan dan jejak. */
  agentKey: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Benar untuk melewati cache (mis. saat meminta variasi baru). */
  bypassCache?: boolean;
  /** Dipakai untuk kunci cache; sertakan apa pun yang memengaruhi hasil. */
  cacheContext?: Record<string, unknown>;
  verbose?: boolean;
}

/** Pemeriksa keluaran: mengembalikan null bila valid, atau pesan galat. */
export type OutputValidator = (text: string) => string | null;

// ---------------------------------------------------------------------------
// Lingkungan & cache
// ---------------------------------------------------------------------------

/** Membaca .env.local tanpa menambah dependensi. */
function loadEnvFile(root: string): Record<string, string> {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/** Klien model. */
export class LlmClient {
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly entries: CostEntry[] = [];
  private readonly env: Record<string, string>;

  constructor(opts: { root: string; baseUrl?: string }) {
    this.env = loadEnvFile(opts.root);
    this.baseUrl = (opts.baseUrl ?? this.env.NINE_ROUTER_BASE_URL ?? 'http://127.0.0.1:20128/v1').replace(/\/$/, '');
    this.cacheDir = join(opts.root, 'storage', 'llm-cache');
    // Gagalkan lebih awal bila konfigurasi belum lengkap, supaya pesan
    // galatnya muncul sebelum pipeline berjalan jauh.
    this.authToken();
  }

  /**
   * Mengambil token akses 9Router dari lingkungan.
   *
   * Nilai kredensial sengaja TIDAK disimpan sebagai properti kelas dan tidak
   * pernah ditulis ke berkas maupun log. Fungsi ini membacanya tepat saat
   * dibutuhkan, sehingga rahasia tidak ikut terbawa bila objek klien dicetak
   * ke konsol atau tersimpan dalam jejak.
   */
  private authToken(): string {
    const fromEnv = process.env.NINE_ROUTER_API_KEY;
    const value = fromEnv && fromEnv.length > 0 ? fromEnv : this.env.NINE_ROUTER_API_KEY;
    if (!value) {
      throw new Error(
        [
          'Konfigurasi 9Router belum lengkap: token akses tidak ditemukan.',
          '',
          'Buat berkas .env.local di akar proyek, lalu isi dua nilai berikut:',
          '  1. NINE_ROUTER_API_KEY  — kunci dari aplikasi 9Router (menu API Keys)',
          '  2. NINE_ROUTER_BASE_URL — alamat lokal 9Router, misalnya http://127.0.0.1:20128/v1',
          '',
          'Berkas .env.local sudah tercantum di .gitignore sehingga tidak ikut ter-commit.',
        ].join('\n'),
      );
    }
    return value;
  }

  /** Seluruh catatan biaya sejauh sesi ini. */
  get ledger(): CostEntry[] {
    return [...this.entries];
  }

  /** Rekap biaya sesi ini. */
  costReport(): CostReport {
    const billable = this.entries.filter((e) => !e.cached);
    return {
      entries: [...this.entries],
      totalTokensIn: this.entries.reduce((a, e) => a + e.tokensIn, 0),
      totalTokensOut: this.entries.reduce((a, e) => a + e.tokensOut, 0),
      totalUsd: Number(billable.reduce((a, e) => a + e.amountUsd, 0).toFixed(6)),
      billableCalls: billable.length,
      savedLatencyMs: this.entries.filter((e) => e.cached).reduce((a, e) => a + e.latencyMs, 0),
    };
  }

  private cacheKey(opts: LlmCallOptions): string {
    const payload = JSON.stringify({
      taskClass: opts.taskClass,
      system: opts.system,
      user: opts.user,
      temperature: opts.temperature ?? 0.4,
      ctx: opts.cacheContext ?? null,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private async readCache(key: string): Promise<LlmResponse | null> {
    const file = join(this.cacheDir, `${key}.json`);
    if (!existsSync(file)) return null;
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as LlmResponse;
      // Kontrak nilai kembalian: `tokensIn` dan `tokensOut` selalu berarti
      // "token yang dibelanjakan pada pemanggilan ini". Karena cache tidak
      // membelanjakan token, nilainya nol. Jumlah token asli tetap tersimpan
      // di berkas cache bila sewaktu-waktu perlu diperiksa.
      return { ...raw, cached: true, tokensIn: 0, tokensOut: 0 };
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, res: LlmResponse): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(join(this.cacheDir, `${key}.json`), JSON.stringify({ ...res, cached: false }, null, 2), 'utf8');
  }

  // -------------------------------------------------------------------------
  // Pemanggilan
  // -------------------------------------------------------------------------

  /** Satu percobaan ke satu model. */
  private async attempt(
    model: ModelConfig,
    opts: LlmCallOptions,
  ): Promise<
    | { kind: 'ok'; text: string; routedTo?: string; tokensIn: number; tokensOut: number; latencyMs: number }
    | { kind: 'retry'; reason: string }
    | { kind: 'hard'; reason: string }
  > {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken()}`,
        },
        body: JSON.stringify({
          model: model.id,
          // Selalu eksplisit: sebagian penyedia di 9Router default ke SSE dan
          // responsnya tidak dapat diparse sebagai JSON.
          stream: false,
          temperature: opts.temperature ?? 0.4,
          ...(opts.maxOutputTokens ? { max_tokens: opts.maxOutputTokens } : {}),
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - started;
      const raw = await res.text();

      if (!res.ok) {
        const reason = this.extractError(raw, res.status);
        const lower = reason.toLowerCase();
        if (HARD_FAIL_HINTS.some((h) => lower.includes(h))) {
          return { kind: 'hard', reason };
        }
        if (RETRYABLE_STATUS.has(res.status)) {
          return { kind: 'retry', reason: `HTTP ${res.status}: ${reason}` };
        }
        return { kind: 'hard', reason: `HTTP ${res.status}: ${reason}` };
      }

      let data: {
        model?: string;
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        data = JSON.parse(raw);
      } catch {
        // Sebagian penyedia tetap mengirim SSE walau stream=false. Coba urai.
        const parsed = this.parseSse(raw);
        if (!parsed) {
          return { kind: 'retry', reason: 'respons bukan JSON dan tidak dapat diurai sebagai SSE' };
        }
        data = parsed;
      }

      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) {
        return { kind: 'retry', reason: 'respons kosong' };
      }

      return {
        kind: 'ok',
        text,
        routedTo: data.model,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        latencyMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = err instanceof Error && err.name === 'AbortError';
      return { kind: 'retry', reason: aborted ? 'timeout 180s' : msg };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Mengambil pesan galat yang bisa dibaca dari respons gagal. */
  private extractError(raw: string, status: number): string {
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) return j.error.message.replace(/\s+/g, ' ').slice(0, 300);
    } catch { /* bukan JSON */ }
    return raw.replace(/\s+/g, ' ').slice(0, 300) || `HTTP ${status}`;
  }

  /** Mengurai respons berformat SSE menjadi objek gaya chat completion. */
  private parseSse(raw: string): { model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null {
    const chunks = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter((l) => l && l !== '[DONE]');
    if (chunks.length === 0) return null;
    let content = '';
    let model: string | undefined;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    for (const chunk of chunks) {
      try {
        const j = JSON.parse(chunk) as {
          model?: string;
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        if (j.model) model = j.model;
        content += j.choices?.[0]?.delta?.content ?? '';
        if (j.usage) usage = j.usage;
      } catch { /* lewati potongan yang rusak */ }
    }
    if (!content) return null;
    return { model, choices: [{ message: { content } }], usage };
  }

  /**
   * Memanggil model dengan routing, pengulangan, cache, dan pembersihan
   * keluaran.
   *
   * Bila `validate` diberikan, keluaran yang tidak lolos akan diperbaiki
   * maksimum dua kali. Sesudah itu fungsi melempar galat berisi cuplikan
   * keluaran terakhir agar masalahnya dapat diperiksa manusia.
   */
  async call(opts: LlmCallOptions, validate?: OutputValidator): Promise<LlmResponse> {
    const chain = MODEL_ROUTING[opts.taskClass];
    if (!chain || chain.length === 0) {
      throw new Error(`Tidak ada model terkonfigurasi untuk kelas tugas "${opts.taskClass}"`);
    }

    const key = this.cacheKey(opts);
    if (!opts.bypassCache) {
      const hit = await this.readCache(key);
      if (hit) {
        this.entries.push({
          at: new Date().toISOString(),
          agentKey: opts.agentKey,
          model: hit.model,
          tokensIn: 0,
          tokensOut: 0,
          amountUsd: 0,
          cached: true,
          latencyMs: hit.latencyMs,
        });
        if (opts.verbose) console.log(`    [cache] ${opts.agentKey} memakai hasil sebelumnya`);
        return hit;
      }
    }

    let lastError = 'tidak diketahui';
    let repairAttempts = 0;
    let user = opts.user;

    for (const model of chain) {
      // Sampai dua kali percobaan pada model yang sama untuk galat sementara.
      for (let tryIndex = 0; tryIndex < 2; tryIndex += 1) {
        if (opts.verbose) {
          console.log(`    [llm] ${opts.agentKey} -> ${model.id}${tryIndex > 0 ? ` (percobaan ${tryIndex + 1})` : ''}`);
        }
        const result = await this.attempt(model, { ...opts, user });

        if (result.kind === 'ok') {
          const amountUsd =
            (result.tokensIn / 1_000_000) * model.costPer1MIn +
            (result.tokensOut / 1_000_000) * model.costPer1MOut;

          const response: LlmResponse = {
            text: result.text,
            model: model.id,
            routedTo: result.routedTo,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs: result.latencyMs,
            cached: false,
            repairAttempts,
          };

          if (validate) {
            const problem = validate(response.text);
            if (problem) {
              if (repairAttempts < 2) {
                repairAttempts += 1;
                lastError = problem;
                // Kirim ulang dengan pesan galat yang jelas; ini jauh lebih
                // efektif daripada sekadar mengulang permintaan yang sama.
                user = [
                  opts.user,
                  '',
                  '---',
                  'PERBAIKAN WAJIB. Keluaran sebelumnya ditolak karena:',
                  problem,
                  '',
                  'Keluaran sebelumnya (jangan ulangi kesalahan ini):',
                  response.text.slice(0, 1500),
                  '',
                  'Kirim ulang HANYA dengan format yang diminta.',
                ].join('\n');
                if (opts.verbose) console.log(`    [perbaikan ${repairAttempts}] ${problem}`);
                continue;
              }
              lastError = `Keluaran tetap tidak valid setelah ${repairAttempts} perbaikan: ${problem}`;
              break;
            }
          }

          this.entries.push({
            at: new Date().toISOString(),
            agentKey: opts.agentKey,
            model: model.id,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            amountUsd,
            cached: false,
            latencyMs: result.latencyMs,
          });
          await this.writeCache(key, response);
          return response;
        }

        if (result.kind === 'hard') {
          lastError = `${model.id}: ${result.reason}`;
          if (opts.verbose) console.log(`    [lewati] ${model.id} tidak dapat dipakai: ${result.reason.slice(0, 120)}`);
          break; // lanjut ke model berikutnya
        }

        lastError = `${model.id}: ${result.reason}`;
        if (tryIndex === 0) {
          // Jeda sebelum percobaan ulang, menghormati saran reset penyedia.
          const waitMs = 2500;
          if (opts.verbose) console.log(`    [tunggu] ${waitMs}ms lalu coba lagi`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }

    throw new Error(
      [
        `Semua model untuk kelas tugas "${opts.taskClass}" gagal (agen: ${opts.agentKey}).`,
        `Penyebab terakhir: ${lastError}`,
        '',
        'Periksa apakah 9Router berjalan di ' + this.baseUrl + ' dan kuota model masih tersedia.',
        'Jalankan "npm run probe:models" untuk memeriksa model mana yang aktif.',
      ].join('\n'),
    );
  }

  /**
   * Memanggil model dan memaksa keluaran berupa objek JSON.
   *
   * Fungsi ini yang membuat kontrak "LLM hanya menghasilkan data" dapat
   * diandalkan: keluaran dibersihkan dari pagar kode markdown, diparse, dan
   * kegagalan parse dikembalikan sebagai pesan perbaikan ke model.
   */
  async callJson<T>(opts: LlmCallOptions, shapeCheck?: (value: unknown) => string | null): Promise<{ value: T; response: LlmResponse }> {
    const response = await this.call(opts, (text) => {
      const cleaned = stripCodeFence(text);
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Keluaran bukan JSON yang valid (${msg}). Kirim HANYA objek JSON, tanpa penjelasan dan tanpa pagar kode.`;
      }
      if (shapeCheck) {
        const problem = shapeCheck(parsed);
        if (problem) return problem;
      }
      return null;
    });
    return { value: JSON.parse(stripCodeFence(response.text)) as T, response };
  }
}

/**
 * Membuang pagar kode markdown dan teks pembuka/penutup.
 *
 * Banyak model membungkus JSON dengan ```json ... ``` walaupun sudah diminta
 * tidak. Membersihkannya di satu tempat jauh lebih andal daripada meminta
 * setiap agen menanganinya sendiri.
 */
export function stripCodeFence(text: string): string {
  let out = text.trim();
  const fence = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/.exec(out);
  if (fence) out = fence[1]!.trim();

  // Bila masih ada teks di luar objek JSON, ambil dari kurung kurawal pertama
  // sampai penutup terakhir yang seimbang.
  if (!out.startsWith('{') && !out.startsWith('[')) {
    const start = out.search(/[[{]/);
    if (start >= 0) out = out.slice(start);
  }
  if (!out.endsWith('}') && !out.endsWith(']')) {
    const lastBrace = Math.max(out.lastIndexOf('}'), out.lastIndexOf(']'));
    if (lastBrace >= 0) out = out.slice(0, lastBrace + 1);
  }
  return out.trim();
}
