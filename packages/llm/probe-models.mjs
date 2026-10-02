/**
 * Probe v2 — memilih model untuk routing produksi.
 *
 * Perbedaan dari probe v1:
 *  - Selalu mengirim `stream: false` (beberapa provider default ke SSE dan itu
 *    membuat respons tidak bisa diparse).
 *  - Menguji kepatuhan terhadap skema JSON nyata (tugas copywriting carousel)
 *    dalam bahasa Indonesia, bukan sekadar "balas JSON".
 *  - Mencatat latensi dan token agar keputusan routing berbasis data.
 *
 * Jalankan: npm run probe:models
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function loadEnv() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv();
const BASE = env.NINE_ROUTER_BASE_URL || 'http://127.0.0.1:20128/v1';
const KEY = env.NINE_ROUTER_API_KEY;

const CANDIDATES = [
  'My_Agents',
  'gemini/gemini-3.5-flash-lite',
  'gemini/gemini-3.7-flash',
  'gemini/gemini-3.8-flash',
  'gemini/gemini-3.1-flash-lite-preview',
  'gemini/gemini-2.5-flash',
  'gemini/gemma-4-31b-it',
  'ollama/gpt-oss:120b',
  'ollama/deepseek-v4.1-flash:cloud',
  'ollama/minimax-m3',
  'openrouter/nvidia/nemotron-3.5-lightning:free',
  'openrouter/qwen/qwen3.8-27b:free',
  'af/gpt-oss-120b',
  'af/mistral-large-latest',
  'bzl/gpt-5.4-nano',
  'qd/qmodel_latest',
];

const TIMEOUT_MS = 60_000;

// Tugas uji realistis: menulis 3 slide carousel edukasi propfirm.
const SYSTEM = `Kamu copywriter carousel edukasi trading propfirm berbahasa Indonesia.
Balas HANYA JSON valid sesuai skema, tanpa penjelasan, tanpa pagar kode markdown.
Aturan: heading maksimal 8 kata, body maksimal 30 kata, tanpa klaim keuntungan pasti.`;

const USER = `Buat 3 slide carousel kategori "Edukasi Propfirm" tentang perbedaan static drawdown dan trailing drawdown.
Skema wajib:
{"slides":[{"position":1,"role":"hook","headline":"string","body":null},{"position":2,"role":"body","headline":"string","body":"string"},{"position":3,"role":"checklist","headline":"string","body":"string","bullets":["string","string"]}]}`;

async function probe(model) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
      }),
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    const text = await res.text();

    if (!res.ok) {
      let msg = text.slice(0, 200);
      try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* mentah */ }
      return { model, ok: false, status: res.status, ms, error: msg.replace(/\s+/g, ' ') };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { model, ok: false, status: res.status, ms, error: 'respons bukan JSON' };
    }

    const content = data?.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/```json|```/g, '').trim();

    let schemaOk = false;
    let detail = '';
    try {
      const parsed = JSON.parse(cleaned);
      const s = parsed?.slides;
      const shapeOk =
        Array.isArray(s) && s.length === 3 &&
        s[0]?.role === 'hook' &&
        typeof s[0]?.headline === 'string' && s[0].headline.length > 0 &&
        typeof s[1]?.body === 'string' &&
        Array.isArray(s[2]?.bullets) && s[2].bullets.length >= 2;
      schemaOk = shapeOk;
      // Cek batas panjang yang diminta
      const headingOk = s.every((x) => String(x?.headline ?? '').split(/\s+/).length <= 8);
      const bodyOk = s.every((x) => x?.body == null || String(x.body).split(/\s+/).length <= 30);
      detail = `skema=${shapeOk ? 'OK' : 'MELESET'} heading=${headingOk ? 'OK' : 'PANJANG'} body=${bodyOk ? 'OK' : 'PANJANG'}`;
      if (!headingOk || !bodyOk) schemaOk = false;
    } catch {
      detail = 'JSON tidak bisa diparse';
    }

    return {
      model,
      ok: schemaOk,
      status: res.status,
      ms,
      routedTo: data?.model,
      usage: data?.usage,
      detail,
      sample: cleaned.slice(0, 110).replace(/\s+/g, ' '),
    };
  } catch (err) {
    return {
      model,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: err.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : String(err.message ?? err).slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = cursor++; i < items.length; i = cursor++) out[i] = await fn(items[i]);
    }),
  );
  return out;
}

async function main() {
  if (!KEY) { console.error('NINE_ROUTER_API_KEY tidak ada di .env.local'); process.exit(1); }

  console.log(`Probe v2 model 9Router — ${BASE}`);
  console.log(`Uji: kepatuhan skema JSON pada tugas copywriting Indonesia\n`);

  const results = await mapLimit(CANDIDATES, 3, probe);

  const pass = [];
  for (const r of results) {
    if (r.ok) {
      console.log(`[LULUS] ${r.model.padEnd(45)} ${String(r.ms).padStart(6)}ms  ${r.detail}  as=${r.routedTo}`);
      pass.push(r);
    } else {
      const why = r.detail ?? r.error ?? `HTTP ${r.status}`;
      console.log(`[GAGAL] ${r.model.padEnd(45)} ${String(r.status).padStart(4)}      ${why}`);
    }
  }

  pass.sort((a, b) => a.ms - b.ms);
  console.log('\n=== PERINGKAT (cepat & patuh skema) ===');
  pass.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.model.padEnd(45)} ${String(p.ms).padStart(6)}ms  in=${p.usage?.prompt_tokens ?? '?'} out=${p.usage?.completion_tokens ?? '?'}`);
  });
  console.log(`\nLulus: ${pass.length}/${CANDIDATES.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    tested: results.length,
    passed: pass.map((p) => ({ model: p.model, latencyMs: p.ms, routedTo: p.routedTo, usage: p.usage })),
    failed: results.filter((r) => !r.ok).map((r) => ({ model: r.model, status: r.status, error: r.error ?? r.detail })),
  };
  const out = join(__dirname, 'probe-report.json');
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nLaporan disimpan: ${out}`);
}

main().catch((e) => { console.error('Probe gagal:', e); process.exit(1); });
