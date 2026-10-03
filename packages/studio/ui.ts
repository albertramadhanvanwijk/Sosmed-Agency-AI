/**
 * Komposisi halaman Studio.
 *
 * Berkas ini hanya menyusun kerangka HTML dan menyatukan gaya (`ui-css.ts`)
 * dengan skrip (`ui-js.ts`). Memisahkannya membuat setiap bagian dapat
 * ditelusuri dan diubah sendiri-sendiri — pada versi sebelumnya semuanya berada
 * dalam satu berkas besar, dan itu menyulitkan perawatan.
 */
import { escapeHtml as esc } from './escape.ts';
import { STUDIO_CSS } from './ui-css.ts';
import { STUDIO_JS } from './ui-js.ts';

/** Konfigurasi yang disuntikkan dari server. */
export interface StudioConfig {
  categories: { key: string; name: string; riskLevel: string; slideRange: { min: number; max: number } }[];
  ratios: { key: string; label: string; width: number; height: number }[];
}

/** Menu navigasi bilah sisi, dikelompokkan seperti admin dashboard. */
const NAV: { group: string; items: { tab: string; label: string; icon: string }[] }[] = [
  {
    group: 'Operasional',
    items: [
      { tab: 'dashboard', label: 'Dashboard', icon: '▤' },
      { tab: 'plan', label: 'Rencana Mingguan', icon: '▦' },
      { tab: 'pipeline', label: 'Pipeline', icon: '▥' },
      { tab: 'approvals', label: 'Persetujuan', icon: '✔' },
    ],
  },
  {
    group: 'Konten',
    items: [
      { tab: 'create', label: 'Buat Carousel', icon: '＋' },
      { tab: 'office', label: 'Agent Office', icon: '◉' },
      { tab: 'knowledge', label: 'Pengetahuan', icon: '◈' },
    ],
  },
  {
    group: 'Pengaturan',
    items: [
      { tab: 'brand', label: 'Logo & Merek', icon: '◐' },
      { tab: 'memory', label: 'Pembelajaran', icon: '✦' },
      { tab: 'audit', label: 'Jejak Audit', icon: '☰' },
    ],
  },
];

/** Membangun halaman Studio lengkap. */
export function renderStudioHtml(config: StudioConfig): string {
  const categoryOptions = config.categories
    .map((c) => `<option value="${esc(c.key)}">${esc(c.name)} — risiko ${esc(c.riskLevel)}</option>`)
    .join('');

  const ratioOptions = config.ratios
    .map(
      (r) =>
        `<option value="${esc(r.key)}"${r.key === 'ig_portrait' ? ' selected' : ''}>${esc(r.label)} (${r.width}×${r.height})</option>`,
    )
    .join('');

  const navHtml = NAV.map(
    (g) => `
      <div class="group">${esc(g.group)}</div>
      ${g.items
        .map(
          (i) =>
            `<button data-tab="${esc(i.tab)}"><span class="ic">${i.icon}</span><span class="tx">${esc(i.label)}</span><span class="pill" data-pill="${esc(i.tab)}" style="display:none">0</span></button>`,
        )
        .join('')}`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%233B82F6'/%3E%3Ctext x='16' y='22' font-family='Segoe UI,sans-serif' font-size='15' font-weight='800' text-anchor='middle' fill='%23fff'%3EPD%3C/text%3E%3C/svg%3E" />
<title>PropDesk AI — Studio</title>
<style>${STUDIO_CSS}</style>
</head>
<body>
<div class="layout">

  <aside class="side">
    <div class="side-brand">
      <div class="mark">PD</div>
      <div><h1>PropDesk AI</h1><small>Studio</small></div>
    </div>
    <nav class="side-nav" id="nav">${navHtml}</nav>
    <div class="side-foot">
      Mode satu pengguna.<br />
      Gambar tersimpan lokal, tanpa unggahan otomatis.<br />
      Teks dirender dari template, bukan dibuat model gambar.
    </div>
  </aside>

  <div class="main">
    <header class="top">
      <div class="crumb"><span id="crumb-group">Operasional</span> / <b id="crumb-tab">Dashboard</b></div>
      <div class="spacer"></div>
      <button class="btn" id="btn-refresh">Muat Ulang</button>
      <button class="btn primary" id="btn-quick">Buat Carousel</button>
    </header>

    <div class="work">

      <section id="tab-dashboard">
        <div class="grid g4" id="kpi-row" style="margin-bottom:16px"></div>
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h2>Menunggu Persetujuan</h2><span class="sub" id="q-count"></span></div>
            <div class="card-b flush" id="queue-list"></div>
          </div>
          <div class="card">
            <div class="card-h"><h2>Produksi Terakhir</h2><span class="sub" id="j-count"></span></div>
            <div class="card-b flush" id="jobs-list"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Kondisi Memori Agen</h2><span class="sub">aturan dari revisi dan riwayat topik</span></div>
          <div class="card-b" id="mem-summary"></div>
        </div>
      </section>

      <section id="tab-plan" style="display:none">
        <div class="card">
          <div class="card-h">
            <h2>Rencana Konten Mingguan</h2>
            <span class="sub">topik dari berita nyata dan riwayat konten Anda</span>
            <div class="spacer"></div>
            <button class="btn primary" id="plan-build">Susun Rencana</button>
          </div>
          <div class="card-b">
            <div class="grid g3">
              <div>
                <label class="f">Jumlah Hari</label>
                <select id="plan-days">
                  <option value="7" selected>7 hari</option>
                  <option value="5">5 hari kerja</option>
                  <option value="14">14 hari</option>
                </select>
              </div>
              <div><label class="f">Tanggal Mulai</label><input type="date" id="plan-start" /></div>
              <div>
                <label class="f">Kategori Fokus</label>
                <select id="plan-focus"><option value="">Rotasi otomatis</option>${categoryOptions}</select>
              </div>
              <div style="grid-column:1/-1">
                <label class="f">Saran Tambahan untuk Seluruh Rencana</label>
                <input id="plan-extra" placeholder="mis. minggu ini fokus membahas manajemen risiko untuk pemula" />
              </div>
            </div>
            <div class="row" style="margin-top:12px">
              <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
                <input type="checkbox" id="plan-news" checked /> Ambil berita terbaru untuk sumber topik
              </label>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Hasil Rencana</h2><span class="sub" id="plan-meta"></span></div>
          <div class="card-b">
            <div class="hint" style="margin-bottom:8px">Copy preview (copywriter) tampil di tiap slot — setujui copy untuk lewati agen copywriter saat produksi (skip copywriter), atau regenerate bila perlu.</div>
            <div id="plan-out"><div class="empty">Belum ada rencana. Klik "Susun Rencana".</div></div>
          </div>
        </div>
      </section>

      <section id="tab-pipeline" style="display:none">
        <div class="card">
          <div class="card-h">
            <h2>Pipeline Produksi</h2>
            <span class="sub">status dari basis data</span>
            <div class="spacer"></div>
            <select id="pf-cat" style="width:auto"><option value="">Semua kategori</option>${categoryOptions}</select>
          </div>
          <div class="card-b"><div class="board" id="board"></div></div>
        </div>
      </section>

      <section id="tab-approvals" style="display:none">
        <div class="card">
          <div class="card-h">
            <h2>Persetujuan Konten</h2>
            <span class="sub">carousel dengan temuan pemblokir tidak dapat disetujui</span>
          </div>
          <div class="card-b" id="approvals-list"></div>
        </div>
      </section>

      <section id="tab-create" style="display:none">
        <div class="card">
          <div class="card-h"><h2>Buat Carousel Baru</h2><span class="sub">teks dari 9Router, gambar dirender lokal</span></div>
          <div class="card-b">
            <div class="grid g3">
              <div>
                <label class="f">Kategori</label>
                <select id="f-cat">${categoryOptions}</select>
                <div class="hint" id="f-cat-hint"></div>
              </div>
              <div><label class="f">Profil Rasio</label><select id="f-ratio">${ratioOptions}</select></div>
              <div><label class="f">Nama Merek</label><input id="f-brand" value="PropDesk" /></div>
            </div>

            <div style="margin-top:12px">
              <label class="f">Topik</label>
              <input id="f-topic" placeholder="mis. Perbedaan static drawdown dan trailing drawdown" />
              <div id="sim-warn"></div>
            </div>

            <div style="margin-top:12px">
              <label class="f">Saran Tambahan agar Konten Lebih Informatif</label>
              <textarea id="f-extra" rows="3" placeholder="mis. sertakan contoh perhitungan dengan angka, dan jelaskan kesalahan umum pemula"></textarea>
              <div class="hint">Saran ini diprioritaskan agen di atas instruksi bawaannya.</div>
            </div>

            <div style="margin-top:14px">
              <label class="f">Ajakan Bertindak (CTA)</label>
              <div class="grid g3">
                <div>
                  <select id="f-cta-kind">
                    <option value="save">Minta simpan konten</option>
                    <option value="follow">Minta ikuti akun</option>
                    <option value="community">Ajakan gabung komunitas</option>
                    <option value="promo">Pasang promo atau kode</option>
                    <option value="consult">Ajakan konsultasi</option>
                  </select>
                </div>
                <div><input id="f-cta-head" placeholder="Kalimat ajakan utama" /></div>
                <div><input id="f-cta-detail" placeholder="Keterangan tambahan (opsional)" /></div>
              </div>
              <div class="grid g2" style="margin-top:9px">
                <div id="cta-promo-wrap" style="display:none">
                  <label class="f">Kode Promo</label>
                  <input id="f-cta-code" placeholder="mis. PROPDESK20" />
                </div>
                <div id="cta-valid-wrap" style="display:none">
                  <label class="f">Berlaku Sampai</label>
                  <input type="date" id="f-cta-valid" />
                </div>
                <div id="cta-comm-wrap" style="display:none">
                  <label class="f">Nama Komunitas</label>
                  <input id="f-cta-comm" placeholder="mis. Komunitas PropDesk" />
                </div>
              </div>
              <div id="cta-presets" class="row" style="margin-top:9px"></div>
            </div>

            <div style="margin-top:14px">
              <label class="f">Gambar untuk Disisipkan (opsional)</label>
              <input type="file" id="f-files" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
              <div class="hint">Maksimal 6 MB per gambar. Gambar disisipkan ke slide dan dijelaskan oleh teks di sekitarnya.</div>
              <div class="uploads" id="up-list"></div>
            </div>

            <!-- Jurnal Trading structured input (hanya tampil saat kategori jurnal_trading) -->
            <div id="jurnal-panel" style="display:none; margin-top:18px; padding:14px; border:1px solid var(--line); border-radius:12px; background: var(--cat-bg, #FFFBEB)">
              <div class="fh" style="font-weight:700">Jurnal Trading — Input Terstruktur</div>
              <div class="fd" style="margin-top:4px; color:var(--muted)">Isi data pair, tabel trade, dan deskripsi. Data ini menjadi sumber kebenaran untuk slide; angka tidak akan dikarang.</div>

              <div class="grid g3" style="margin-top:12px">
                <div><label class="f">Pair Utama *</label><input id="j-pair" placeholder="mis. EUR/USD, XAU/USD" /></div>
                <div><label class="f">Timeframe</label><input id="j-timeframe" placeholder="mis. H1, H4, D1" /></div>
                <div><label class="f">Gambar Pair (opsional)</label><input type="file" id="j-pair-file" accept="image/png,image/jpeg,image/webp,image/gif" /></div>
              </div>

              <div style="margin-top:12px">
                <label class="f">Tabel Trade — Pairs | Direction | Session | %Risk | RR | Confluence | PnL | Result</label>
                <div class="hint">Ketik manual atau paste CSV (header otomatis). Contoh baris: EUR/USD, Buy, London, 1%, 1:2, OB+CT, 50, Profit</div>
                <textarea id="j-table-csv" rows="4" placeholder="Paste CSV di sini atau isi tabel di bawah"></textarea>
                <div class="row" style="gap:8px; margin-top:8px">
                  <button class="btn sm" id="j-csv-import">Impor CSV</button>
                  <button class="btn sm" id="j-row-add">+ Baris</button>
                  <span id="j-table-msg" class="hint"></span>
                </div>
                <div id="j-table-wrap" style="margin-top:10px; overflow:auto">
                  <table class="tbl" id="j-table" style="width:100%; min-width:720px">
                    <thead><tr><th>Pairs</th><th>Direction</th><th>Session</th><th>%Risk</th><th>RR</th><th>Confluence</th><th>PnL</th><th>Result</th><th></th></tr></thead>
                    <tbody id="j-tbody"></tbody>
                  </table>
                </div>
              </div>

              <div class="grid g2" style="margin-top:12px">
                <div>
                  <label class="f">Deskripsi Direction *</label>
                  <textarea id="j-dir-desc" rows="3" placeholder="mis. Trend up H1, retest OB"></textarea>
                  <input type="file" id="j-dir-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                  <div class="hint">Upload chart direction (opsional)</div>
                </div>
                <div>
                  <label class="f">Deskripsi Execution *</label>
                  <textarea id="j-exec-desc" rows="3" placeholder="mis. Entry London open, SL di bawah OB"></textarea>
                  <input type="file" id="j-exec-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                  <div class="hint">Upload chart execution (opsional)</div>
                </div>
              </div>

              <div class="grid g2" style="margin-top:12px">
                <div>
                  <label class="f">Deskripsi Mark/Setup *</label>
                  <textarea id="j-mark-desc" rows="3" placeholder="mis. Tandai OB dan FVG"></textarea>
                  <input type="file" id="j-mark-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                  <div class="hint">Upload mark image (opsional)</div>
                </div>
                <div>
                  <label class="f">Performance (opsional) + Catatan Umum</label>
                  <input type="file" id="j-perf-file" accept="image/png,image/jpeg,image/webp,image/gif" />
                  <div class="hint">Upload performance chart (opsional)</div>
                  <textarea id="j-general-notes" rows="3" placeholder="Catatan umum (opsional) — akan masuk ke extraInstructions" style="margin-top:8px"></textarea>
                  <div class="row" style="gap:8px; margin-top:8px">
                    <button class="btn sm" id="j-save">Simpan Jurnal</button>
                    <span id="j-save-msg" class="hint"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Market Outlook structured input (hanya tampil saat kategori market_outlook) -->
            <div id="market-outlook-panel" class="market-outlook-panel outlook-panel" style="display:none; margin-top:18px; padding:14px; border:1px solid var(--line); border-radius:12px; background: var(--cat-bg, #FEF2F2)">
              <div class="fh" style="font-weight:700">Market Outlook — Input Terstruktur</div>
              <div class="fd" style="margin-top:4px; color:var(--muted)">Judul, timeframe, galeri chart dengan deskripsi, dan CTA. Urutan galeri penting untuk narasi skenario.</div>
              <div class="grid g3" style="margin-top:12px">
                <div><label class="f">Judul Outlook *</label><input id="o-title" placeholder="mis. Skenario EUR/USD pekan depan" /></div>
                <div><label class="f">Timeframe</label><select id="o-timeframe"><option value="">—</option><option>H1</option><option>H4</option><option>D1</option><option>W1</option><option>MN</option></select></div>
                <div><label class="f">Catatan Umum (opsional)</label><input id="o-notes" placeholder="catatan skenario / disclaimer tambahan" /></div>
              </div>
              <div style="margin-top:12px">
                <label class="f">Galeri Chart — upload beberapa gambar + deskripsi per gambar</label>
                <div class="hint">Urutan gambar menentukan alur skenario A/B. Drag handle untuk reorder (atau pakai tombol ↑↓).</div>
                <input type="file" id="o-files" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="margin-top:6px" />
                <div id="o-gallery" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
              </div>
              <div style="margin-top:12px">
                <label class="f">CTA (bisa banyak) — jenis: Link / Promo Code / Join Community</label>
                <div id="o-ctas" style="display:flex; flex-direction:column; gap:8px; margin-top:6px"></div>
                <div class="row" style="gap:8px; margin-top:8px">
                  <button class="btn sm" id="o-cta-add">+ CTA</button>
                  <button class="btn sm" id="o-cta-add-promo">+ Kode Promo</button>
                </div>
              </div>
              <div class="row" style="gap:8px; margin-top:12px">
                <button class="btn sm" id="o-save">Simpan Outlook</button>
                <span id="o-save-msg" class="hint"></span>
              </div>
            </div>

            <div class="row" style="margin-top:16px">
              <button class="btn primary" id="btn-produce">Mulai Produksi</button>
              <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
                <input type="checkbox" id="f-fresh" /> Abaikan cache
              </label>
              <div class="spacer"></div>
              <span id="produce-msg" style="font-size:12.5px;color:var(--muted)"></span>
            </div>

            <!-- Loading modal overlay -->
            <div class="produce-loading" id="produce-loading" style="display:none">
              <div class="loading-backdrop"></div>
              <div class="loading-modal">
                <div class="loading-spinner"></div>
                <h3 id="loading-title">Memulai produksi...</h3>
                <p id="loading-sub">Pipeline 9 agen sedang berjalan. Ini memakan 2–5 menit.</p>
                <div class="loading-progress">
                  <div class="loading-bar" id="loading-bar"></div>
                </div>
                <p class="loading-hint" id="loading-hint">Anda akan diarahkan ke Dashboard saat selesai.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-office" style="display:none">
        <div class="card">
          <div class="card-h">
            <h2>Virtual Agent Office</h2>
            <span class="sub">setiap status berasal dari catatan eksekusi nyata</span>
            <div class="spacer"></div>
            <button class="btn" id="of-mode">Mode Teks</button>
            <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
              <input type="checkbox" id="of-motion" checked /> Animasi
            </label>
          </div>
          <div class="legend">
            <span><i style="background:#22D3EE"></i>Bekerja</span>
            <span><i style="background:#16A34A"></i>Selesai</span>
            <span><i style="background:#D97706"></i>Menunggu manusia</span>
            <span><i style="background:#E11D48"></i>Gagal</span>
            <span><i style="background:#3F526E"></i>Menganggur</span>
          </div>
          <div class="office-wrap" id="office"></div>
          <div id="office-table-wrap" style="display:none;padding:0 16px 14px"></div>
          <div class="flow" id="office-flow"></div>
        </div>
      </section>

      <section id="tab-knowledge" style="display:none">
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h2>Tambah Pengetahuan</h2></div>
            <div class="card-b">
              <div style="margin-bottom:10px">
                <label class="f">Jenis</label>
                <select id="k-kind">
                  <option value="hook_bank">Hook Bank</option>
                  <option value="lexicon">Lexicon</option>
                  <option value="banned_phrase">Frasa Terlarang</option>
                  <option value="winning_template">Template Pemenang</option>
                  <option value="glossary">Glosarium</option>
                  <option value="post_mortem">Catatan Evaluasi</option>
                </select>
              </div>
              <div style="margin-bottom:10px"><label class="f">Judul</label><input id="k-title" /></div>
              <div style="margin-bottom:10px"><label class="f">Isi</label><textarea id="k-content" rows="4"></textarea></div>
              <div style="margin-bottom:12px"><label class="f">Tagar</label><input id="k-tags" placeholder="propfirm, drawdown" /></div>
              <button class="btn primary" id="k-save">Simpan</button>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h2>Pengetahuan Tersimpan</h2><span class="sub" id="k-count"></span></div>
            <div class="card-b" id="k-list"></div>
          </div>
        </div>
      </section>

      <section id="tab-brand" style="display:none">
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h2>Logo</h2><span class="sub">opsional, muncul pada slide</span></div>
            <div class="card-b">
              <div style="margin-bottom:11px">
                <label class="f">Berkas Logo</label>
                <input type="file" id="b-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
                <div class="hint">PNG dengan latar transparan memberi hasil terbaik. Maksimal 1 MB.</div>
              </div>
              <div class="grid g3">
                <div>
                  <label class="f">Posisi</label>
                  <select id="b-pos">
                    <option value="top-right">Kanan atas</option>
                    <option value="top-left">Kiri atas</option>
                    <option value="bottom-left">Kiri bawah (kaki slide)</option>
                  </select>
                </div>
                <div><label class="f">Tinggi (piksel)</label><input type="number" id="b-height" value="64" min="24" max="200" /></div>
                <div><label class="f">Teks Alternatif</label><input id="b-alt" placeholder="mis. Logo PropDesk" /></div>
              </div>
              <div class="logo-prev" id="b-prev" style="margin-top:11px">Belum ada logo</div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h2>Merek Teks</h2><span class="sub">opsional, bisa dipakai tanpa logo</span></div>
            <div class="card-b">
              <div style="margin-bottom:11px"><label class="f">Nama Pendek</label><input id="b-name" placeholder="mis. PropDesk" /></div>
              <div style="margin-bottom:11px"><label class="f">Baris Kedua</label><input id="b-tag" placeholder="mis. Trading Education" /></div>
              <div style="margin-bottom:11px"><label class="f">Lencana Sudut</label><input id="b-badge" placeholder="mis. EDUKASI" /></div>
              <div class="row">
                <button class="btn primary" id="b-save">Simpan Konfigurasi Merek</button>
                <button class="btn bad" id="b-remove">Hapus Logo</button>
              </div>
              <div class="hint" style="margin-top:9px">
                Logo dan merek bersifat opsional. Bila keduanya kosong, kaki slide hanya menampilkan nama
                merek dari formulir produksi.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-memory" style="display:none">
        <div class="card">
          <div class="card-h">
            <h2>Aturan Pembelajaran</h2>
            <span class="sub">dari catatan revisi Anda, dipakai pada produksi berikutnya</span>
            <div class="spacer"></div>
            <button class="btn primary" id="mem-reflect">Pelajari Catatan Revisi</button>
          </div>
          <div class="card-b">
            <div id="mem-summary2" style="margin-bottom:14px"></div>
            <div class="grid g3" style="margin-bottom:14px">
              <div>
                <label class="f">Aturan Baru</label>
                <textarea id="m-rule" rows="2" placeholder="mis. Sertakan selalu contoh perhitungan dengan angka"></textarea>
              </div>
              <div>
                <label class="f">Kategori</label>
                <select id="m-cat"><option value="">Semua kategori</option>${categoryOptions}</select>
              </div>
              <div style="display:flex;align-items:flex-end"><button class="btn primary" id="m-add">Tambah Aturan</button></div>
            </div>
            <div id="mem-rules"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Riwayat Catatan Revisi</h2><span class="sub">sumber pembelajaran agen</span></div>
          <div class="card-b" id="mem-revisions"></div>
        </div>
      </section>

      <section id="tab-audit" style="display:none">
        <div class="card">
          <div class="card-h"><h2>Jejak Audit</h2><span class="sub">setiap keputusan manusia tercatat</span></div>
          <div class="card-b flush" id="audit-list"></div>
        </div>
      </section>

    </div>
  </div>
</div>

<div class="backdrop" id="backdrop"></div>
<div class="drawer" id="drawer"><button class="x" id="drawer-x">×</button><div class="drawer-i" id="drawer-i"></div></div>
<div class="slide-zoom" id="slide-zoom">
  <div class="zoom-stage" id="zoom-stage">
    <div class="zoom-wrapper" id="zoom-wrapper">
      <iframe class="zoom-frame" id="zoom-frame" title="Slide zoom"></iframe>
    </div>
    <div class="zoom-info" id="zoom-info"></div>
    <button class="zoom-close" id="zoom-close" title="Tutup (Esc)">×</button>
    <div class="zoom-controls" id="zoom-controls">
      <button id="zoom-out" title="Perkecil">−</button>
      <button id="zoom-reset" title="Reset">◎</button>
      <button id="zoom-in" title="Perbesar">＋</button>
      <button id="zoom-download" title="Unduh">⤓</button>
    </div>
    <div class="zoom-thumbs" id="zoom-thumbs"></div>
  </div>
</div>
<div class="loading" id="loading">
  <div class="box">
    <div class="spin"></div>
    <div class="msg" id="load-msg">Memuat…</div>
    <div class="sub" id="load-sub"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>${STUDIO_JS}</script>
</body>
</html>`;
}
