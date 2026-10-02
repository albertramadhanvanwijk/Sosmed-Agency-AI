/**
 * Uji asap klien 9Router: memastikan koneksi, routing, validasi keluaran, dan
 * pembukuan biaya benar-benar bekerja sebelum dipakai pipeline produksi.
 *
 * Jalankan: node packages/llm/smoke.ts
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { LlmClient, stripCodeFence } from './client.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

interface Hasil {
  ok: boolean;
  catatan: string;
}

async function main() {
  console.log('=== Uji Asap Klien 9Router ===\n');
  const llm = new LlmClient({ root });
  console.log(`Alamat: ${(llm as unknown as { baseUrl: string }).baseUrl}\n`);

  const hasil: Hasil[] = [];

  // --- Uji 1: panggilan teks biasa pada kelas tugas transform ---------------
  process.stdout.write('1. Panggilan teks (transform) ... ');
  try {
    const res = await llm.call({
      taskClass: 'transform',
      agentKey: 'smoke',
      system: 'Jawab singkat dalam bahasa Indonesia.',
      user: 'Sebutkan tiga aturan umum program evaluasi propfirm, masing-masing maksimal 6 kata.',
      temperature: 0.2,
    });
    console.log(`OK (${res.latencyMs}ms, model=${res.model}, routedTo=${res.routedTo ?? '-'}, ${res.tokensIn}/${res.tokensOut} token)`);
    console.log(`   Jawaban: ${res.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    hasil.push({ ok: true, catatan: 'panggilan teks' });
  } catch (err) {
    console.log('GAGAL');
    console.log(`   ${err instanceof Error ? err.message.slice(0, 400) : err}`);
    hasil.push({ ok: false, catatan: 'panggilan teks' });
  }

  // --- Uji 2: keluaran JSON dengan pemeriksa bentuk -------------------------
  process.stdout.write('\n2. Keluaran JSON (transform) ... ');
  try {
    const { value, response } = await llm.callJson<{ slides: { position: number; headline: string }[] }>(
      {
        taskClass: 'transform',
        agentKey: 'smoke-json',
        system:
          'Balas HANYA JSON valid tanpa pagar kode markdown dan tanpa penjelasan apa pun.',
        user: 'Buat 2 slide carousel edukasi trading. Format: {"slides":[{"position":1,"headline":"..."}]}',
        temperature: 0.3,
      },
      (v) => {
        const o = v as { slides?: unknown };
        if (!Array.isArray(o?.slides)) return 'Objek harus memiliki larik "slides".';
        if (o.slides.length !== 2) return `Diharapkan tepat 2 slide, diterima ${o.slides.length}.`;
        for (const [i, s] of o.slides.entries()) {
          const sl = s as { position?: unknown; headline?: unknown };
          if (typeof sl.position !== 'number') return `Slide #${i + 1} tidak memiliki "position" berupa angka.`;
          if (typeof sl.headline !== 'string' || sl.headline.trim().length === 0) {
            return `Slide #${i + 1} tidak memiliki "headline" berupa teks tidak kosong.`;
          }
        }
        return null;
      },
    );
    console.log(`OK (${response.latencyMs}ms, model=${response.model}, perbaikan=${response.repairAttempts})`);
    for (const s of value.slides) console.log(`   ${s.position}. ${s.headline}`);
    hasil.push({ ok: true, catatan: 'keluaran JSON' });
  } catch (err) {
    console.log('GAGAL');
    console.log(`   ${err instanceof Error ? err.message.slice(0, 400) : err}`);
    hasil.push({ ok: false, catatan: 'keluaran JSON' });
  }

  // --- Uji 3: kelas tugas murah (extract) ----------------------------------
  process.stdout.write('\n3. Kelas tugas extract (model lokal) ... ');
  try {
    const res = await llm.call({
      taskClass: 'extract',
      agentKey: 'smoke-extract',
      system: 'Klasifikasikan teks. Jawab HANYA satu kata kategori.',
      user: 'Klasifikasikan topik ini: "cara menghitung batas drawdown harian pada akun evaluasi". Pilihan: edukasi_trading, edukasi_propfirm, jurnal_trading, market_info, market_outlook.',
      temperature: 0,
    });
    console.log(`OK (${res.latencyMs}ms, model=${res.model})`);
    console.log(`   Kategori: ${res.text.trim().slice(0, 60)}`);
    hasil.push({ ok: true, catatan: 'kelas extract' });
  } catch (err) {
    console.log('GAGAL');
    console.log(`   ${err instanceof Error ? err.message.slice(0, 300) : err}`);
    hasil.push({ ok: false, catatan: 'kelas extract' });
  }

  // --- Uji 4: cache harus mencegah panggilan kedua -------------------------
  process.stdout.write('\n4. Cache (panggilan identik dua kali) ... ');
  try {
    const opts = {
      taskClass: 'transform' as const,
      agentKey: 'smoke-cache',
      system: 'Jawab singkat.',
      user: 'Sebutkan satu istilah penting dalam manajemen risiko trading.',
      temperature: 0.2,
      cacheContext: { uji: 'cache-v1' },
    };
    const first = await llm.call(opts);
    const second = await llm.call(opts);
    // Kontrak: token pada respons berarti token yang dibelanjakan pemanggilan
    // ini, sehingga panggilan yang dilayani cache harus melaporkan nol.
    const ok = second.cached === true && second.tokensIn === 0 && second.tokensOut === 0;
    console.log(
      ok
        ? `OK (panggilan kedua dilayani cache; token terbelanja ${second.tokensIn}/${second.tokensOut}; respons asli ${Math.round(first.latencyMs / 1000)}s)`
        : `PERINGATAN: panggilan kedua dianggap berbayar (cached=${second.cached}, token ${second.tokensIn}/${second.tokensOut})`,
    );
    if (ok) console.log(`   Jawaban: ${first.text.replace(/\s+/g, ' ').slice(0, 80)}`);
    hasil.push({ ok, catatan: 'cache' });
  } catch (err) {
    console.log('GAGAL');
    console.log(`   ${err instanceof Error ? err.message.slice(0, 300) : err}`);
    hasil.push({ ok: false, catatan: 'cache' });
  }

  // --- Uji 5: pembersih pagar kode -----------------------------------------
  process.stdout.write('\n5. Pembersih pagar kode markdown ... ');
  const cases: { input: string; expected: string }[] = [
    { input: '```json\n{"a":1}\n```', expected: '{"a":1}' },
    { input: 'Berikut hasilnya:\n{"a":1}', expected: '{"a":1}' },
    { input: '{"a":1}\n\nSemoga membantu!', expected: '{"a":1}' },
    { input: '{"a":1}', expected: '{"a":1}' },
  ];
  let fenceOk = true;
  for (const c of cases) {
    const got = stripCodeFence(c.input);
    if (got !== c.expected) {
      fenceOk = false;
      console.log(`\n   TIDAK COCOK: masukan=${JSON.stringify(c.input)} diharapkan=${JSON.stringify(c.expected)} diterima=${JSON.stringify(got)}`);
    }
  }
  console.log(fenceOk ? 'OK (4 dari 4 kasus)' : 'GAGAL');
  hasil.push({ ok: fenceOk, catatan: 'pembersih pagar kode' });

  // --- Rekap biaya ---------------------------------------------------------
  const cost = llm.costReport();
  console.log('\n=== Rekap Biaya Sesi ===');
  console.log(`Panggilan berbayar : ${cost.billableCalls}`);
  console.log(`Token masuk        : ${cost.totalTokensIn}`);
  console.log(`Token keluar       : ${cost.totalTokensOut}`);
  console.log(`Perkiraan biaya    : $${cost.totalUsd.toFixed(6)}`);
  console.log(`Waktu dihemat cache: ${(cost.savedLatencyMs / 1000).toFixed(1)}s`);
  console.log('\nRincian per agen:');
  for (const e of cost.entries) {
    console.log(`  ${e.agentKey.padEnd(14)} ${e.model.padEnd(34)} ${e.cached ? 'CACHE' : `${e.tokensIn}/${e.tokensOut} tok`}  ${e.latencyMs}ms`);
  }

  const gagal = hasil.filter((h) => !h.ok);
  console.log(`\n=== Kesimpulan: ${hasil.length - gagal.length}/${hasil.length} uji lulus ===`);
  if (gagal.length > 0) {
    console.log(`Gagal: ${gagal.map((g) => g.catatan).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nUji asap gagal total:');
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
