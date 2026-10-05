/**
 * Komposisi halaman Studio.
 *
 * Berkas ini hanya menyusun kerangka HTML dan menyatukan gaya (`ui-css.ts`)
 * dengan skrip (`ui-js.ts`). Memisahkannya membuat setiap bagian dapat
 * ditelusuri dan diubah sendiri-sendiri \u2014 pada versi sebelumnya semuanya berada
 * dalam satu berkas besar, dan itu menyulitkan perawatan.
 */
import { escapeHtml as esc } from './escape.ts';
import { STUDIO_CSS } from './ui-css.ts';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUDIO_JS = readFileSync(resolve(__dirname, 'static/studio.js'), 'utf8');

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
      { tab: 'dashboard', label: 'Dashboard', icon: '\u25A4' },
      { tab: 'plan', label: 'Rencana Mingguan', icon: '\u25A6' },
      { tab: 'pipeline', label: 'Pipeline', icon: '\u25A5' },
      { tab: 'approvals', label: 'Persetujuan', icon: '\u2714' },
    ],
  },
  {
    group: 'Konten',
    items: [
      { tab: 'create', label: 'Buat Carousel', icon: '\uFF0B' },
      { tab: 'office', label: 'Agent Office', icon: '\u25C9' },
      { tab: 'knowledge', label: 'Pengetahuan', icon: '\u25C8' },
    ],
  },
  {
    group: 'Pengaturan',
    items: [
      { tab: 'brand', label: 'Logo & Merek', icon: '\u25D0' },
      { tab: 'memory', label: 'Pembelajaran', icon: '\u2726' },
      { tab: 'audit', label: 'Jejak Audit', icon: '\u2630' },
    ],
  },
];

/** Membangun halaman Studio lengkap. */
export function renderStudioHtml(config: StudioConfig): string {
  const categoryOptions = config.categories
    .map((c) => `<option value="${esc(c.key)}">${esc(c.name)} \u2014 risiko ${esc(c.riskLevel)}</option>`)
    .join('');

  const ratioOptions = config.ratios
    .map(
      (r) =>
        `<option value="${esc(r.key)}"${r.key === 'ig_portrait' ? ' selected' : ''}>${esc(r.label)} (${r.width}\u00D7${r.height})</option>`,
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
<title>PropDesk AI \u2014 Studio</title>
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
      <span id="jobs-manuscript-badge" class="jobs-badge manuscript">0</span>
      <span id="jobs-design-badge" class="jobs-badge design">0</span>
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
            <div class="hint" style="margin-bottom:8px">Copy preview (copywriter) tampil di tiap slot \u2014 setujui copy untuk lewati agen copywriter saat produksi (skip copywriter), atau regenerate bila perlu.</div>
            <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap">
              <button class="btn sm" id="bulk-generate-manuscript">Generate Naskah Terpilih</button>
              <button class="btn sm" id="bulk-approve-manuscript">Approve Naskah Terpilih</button>
              <button class="btn sm" id="bulk-generate-design">Generate Design Terpilih</button>
              <button class="btn sm" id="bulk-approve-design">Approve Design Terpilih</button>
            </div>
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
            <!-- Wizard Navigation -->
            <div id="wizard-nav-buttons" class="wizard-nav" style="margin-bottom:16px; display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn" data-wizard="edukasi" id="wizard-nav-edukasi">Buat Edukasi/Info</button>
              <button class="btn" data-wizard="jurnal" id="wizard-nav-jurnal">Buat Jurnal Trading</button>
              <button class="btn" data-wizard="outlook" id="wizard-nav-outlook">Buat Market Outlook</button>
            </div>

            <!-- Wizard: Edukasi & Market Info -->
            <div id="wizard-edukasi" class="wizard-shell" style="display:none">
              <div class="wizard-step" data-step="1">
                <div class="fh">Langkah 1: Topik & Materi</div>
                
                <div class="grid g3" style="margin-top:12px">
                  <div>
                    <label class="f">Kategori *</label>
                    <select id="edukasi-kategori">
                      <option value="edukasi_trading">Edukasi Trading</option>
                      <option value="edukasi_propfirm">Edukasi Propfirm</option>
                      <option value="market_info">Market Info</option>
                    </select>
                  </div>
                  <div><label class="f">Profil Rasio</label><select id="edukasi-ratio">${ratioOptions}</select></div>
                  <div><label class="f">Nama Merek</label><input id="edukasi-brand" value="PropDesk" /></div>
                </div>

                <div style="margin-top:12px">
                  <label class="f">Topik *</label>
                  <input id="edukasi-topic" placeholder="mis. Dampak FOMC terhadap pasar forex" />
                  <div id="edukasi-topic-hint" class="hint"></div>
                </div>

                <div style="margin-top:12px">
                  <label class="f">Materi Pendukung \u2014 opsional</label>
                  <div class="hint">Paste artikel, fetch link, atau upload PDF. Maksimal 8000 karakter total.</div>
                  
                  <div style="margin-top:8px">
                    <label class="f">Paste Artikel</label>
                    <textarea id="edukasi-materi" rows="6" placeholder="Tempel artikel atau tulis materi di sini..."></textarea>
                    <div class="row" style="margin-top:4px; justify-content:flex-end;">
                      <span id="edukasi-materi-counter" class="hint">0/8000</span>
                    </div>
                  </div>

                  <div style="margin-top:12px">
                    <label class="f">Link Referensi (maks 3)</label>
                    <div id="edukasi-links" class="repeatable-container"></div>
                    <div class="row" style="margin-top:8px; gap:8px;">
                      <button class="btn sm" id="edukasi-add-link" type="button">+ Tambah Link</button>
                      <span id="edukasi-links-hint" class="hint">Maksimal 3 link. Setiap link di-fetch untuk ambil title & snippet.</span>
                    </div>
                  </div>

                  <div style="margin-top:12px">
                    <label class="f">Upload PDF (maks 5 MB, 20 halaman)</label>
                    <input type="file" id="edukasi-pdf" accept=".pdf" />
                    <div class="hint">Teks diekstrak otomatis ke materi. Progress ditampilkan saat ekstraksi.</div>
                    <div id="edukasi-pdf-progress" style="display:none; margin-top:6px;">
                      <div class="loading-progress" style="height:4px;">
                        <div class="loading-bar" id="edukasi-pdf-bar" style="width:0%"></div>
                      </div>
                      <span id="edukasi-pdf-status" class="hint"></span>
                    </div>
                    <div id="edukasi-pdf-warning" class="hint" style="color:var(--warn); display:none;"></div>
                  </div>
                </div>

                <div style="margin-top:12px">
                  <label class="f">Gambar Pendukung (opsional, maks 6 MB)</label>
                  <input type="file" id="edukasi-images" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
                  <div class="hint">Thumbnail ditampilkan. Dipakai sebagai visual pendukung di slide.</div>
                  <div class="uploads" id="edukasi-up-list"></div>
                </div>
              </div>

              <div class="wizard-step" data-step="2" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">
                <div class="fh">Langkah 2: CTA</div>
                <div id="edukasi-cta-block"></div>
              </div>

              <div class="row" style="margin-top:16px">
                <button class="btn primary" id="edukasi-submit" type="button">Mulai Buat Naskah \u2192</button>
                <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
                  <input type="checkbox" id="edukasi-fresh" /> Abaikan cache
                </label>
                <div class="spacer"></div>
                <span id="edukasi-produce-msg" style="font-size:12.5px;color:var(--muted)"></span>
              </div>
            </div>

            <!-- Wizard: Jurnal Trading -->
            <div id="wizard-jurnal" class="wizard-shell" style="display:none">
              <div class="wizard-step" data-step="1">
                <div class="fh">Langkah 1: Tabel Trade</div>
                <div class="fd">Minimal 1 baris. Pair wajib, Direction: long/short.</div>

                <div class="grid g3" style="margin-top:12px">
                  <div><label class="f">Pair Utama *</label><input id="jurnal-pair" placeholder="mis. EUR/USD, XAU/USD" /></div>
                  <div><label class="f">Timeframe</label><input id="jurnal-timeframe" placeholder="mis. H1, H4, D1" /></div>
                  <div><label class="f">Gambar Pair (opsional)</label><input type="file" id="jurnal-pair-file" accept="image/png,image/jpeg,image/webp,image/gif" /></div>
                </div>

                <div style="margin-top:12px">
                  <label class="f">Tabel Trade</label>
                  <div class="row" style="gap:8px; margin-top:4px; margin-bottom:8px;">
                    <button class="btn sm" id="jurnal-add-row" type="button">+ Tambah Baris</button>
                    <button class="btn sm" id="jurnal-csv-import" type="button">Impor CSV</button>
                    <input type="file" id="jurnal-csv-file" accept=".csv" style="display:none" />
                    <span id="jurnal-table-msg" class="hint"></span>
                  </div>
                  <div id="jurnal-table-wrap" style="overflow:auto">
                    <table class="tbl" id="jurnal-table" style="width:100%; min-width:760px">
                      <thead>
                        <tr>
                          <th>Pair *</th><th>Direction *</th><th>Session</th><th>%Risk</th>
                          <th>RR</th><th>Confluence</th><th>PnL</th><th>Result</th><th></th>
                        </tr>
                      </thead>
                      <tbody id="jurnal-tbody"></tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div class="wizard-step" data-step="2" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">
                <div class="fh">Langkah 2: Narasi Visual (4 Grup)</div>
                <div class="fd">3 deskripsi wajib (Direction, Execution, Mark). Gambar opsional per grup.</div>

                <div class="grid g2" style="margin-top:12px">
                  <div class="repeatable-row">
                    <label class="f">Deskripsi Direction *</label>
                    <textarea id="jurnal-dir-desc" rows="3" placeholder="mis. Trend up H1, retest OB"></textarea>
                    <input type="file" id="jurnal-dir-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                    <div class="hint">Upload chart direction (opsional)</div>
                  </div>
                  <div class="repeatable-row">
                    <label class="f">Deskripsi Execution *</label>
                    <textarea id="jurnal-exec-desc" rows="3" placeholder="mis. Entry London open, SL di bawah OB"></textarea>
                    <input type="file" id="jurnal-exec-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                    <div class="hint">Upload chart execution (opsional)</div>
                  </div>
                </div>

                <div class="grid g2" style="margin-top:12px">
                  <div class="repeatable-row">
                    <label class="f">Deskripsi Mark/Setup *</label>
                    <textarea id="jurnal-mark-desc" rows="3" placeholder="mis. Tandai OB dan FVG"></textarea>
                    <input type="file" id="jurnal-mark-file" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:6px" />
                    <div class="hint">Upload mark image (opsional)</div>
                  </div>
                  <div class="repeatable-row">
                    <label class="f">Performance (opsional)</label>
                    <input type="file" id="jurnal-perf-file" accept="image/png,image/jpeg,image/webp,image/gif" />
                    <div class="hint">Upload performance chart (opsional)</div>
                    <label class="f" style="margin-top:8px;">Catatan Umum</label>
                    <textarea id="jurnal-general-notes" rows="3" placeholder="Catatan umum (opsional)"></textarea>
                  </div>
                </div>
              </div>

              <div class="wizard-step" data-step="3" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">
                <div class="fh">Langkah 3: CTA</div>
                <div id="jurnal-cta-block"></div>
              </div>

              <div class="row" style="margin-top:16px">
                <button class="btn sm" id="jurnal-prev-step" type="button" style="display:none">\u2190 Kembali</button>
                <button class="btn primary" id="jurnal-next-step" type="button">Lanjut ke CTA \u2192</button>
                <button class="btn primary" id="jurnal-submit" type="button" style="display:none">Mulai Buat Hook (3 Pilihan) \u2192</button>
                <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
                  <input type="checkbox" id="jurnal-fresh" /> Abaikan cache
                </label>
                <div class="spacer"></div>
                <span id="jurnal-produce-msg" style="font-size:12.5px;color:var(--muted)"></span>
              </div>
            </div>

            <!-- Wizard: Market Outlook -->
            <div id="wizard-outlook" class="wizard-shell" style="display:none">
              <div class="wizard-step" data-step="1">
                <div class="fh">Langkah 1: Judul & Galeri</div>

                <div class="grid g3" style="margin-top:12px">
                  <div><label class="f">Judul Outlook *</label><input id="outlook-title" placeholder="mis. Skenario EUR/USD pekan depan" /></div>
                  <div><label class="f">Timeframe</label><select id="outlook-timeframe"><option value="">\u2014</option><option>H1</option><option>H4</option><option>D1</option><option>W1</option><option>MN</option></select></div>
                  <div><label class="f">Catatan Umum (opsional)</label><input id="outlook-notes" placeholder="catatan skenario / disclaimer tambahan" /></div>
                </div>

                <div style="margin-top:12px">
                  <label class="f">Galeri Chart \u2265 1 wajib</label>
                  <div class="hint">Tiap gambar + deskripsi = 1 slide chart_snapshot. Urutan menentukan alur skenario.</div>
                  <div id="outlook-gallery" class="repeatable-container" style="margin-top:10px; display:flex; flex-direction:column; gap:8px"></div>
                  <div class="row" style="margin-top:8px; gap:8px;">
                    <button class="btn sm" id="outlook-add-gallery" type="button">+ Tambah Gambar + Deskripsi</button>
                    <span id="outlook-gallery-hint" class="hint">Minimal 1 item. Drag handle (\u2191\u2193) untuk reorder.</span>
                  </div>
                </div>
              </div>

              <div class="wizard-step" data-step="2" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">
                <div class="fh">Langkah 2: CTA</div>
                <div id="outlook-cta-block"></div>
              </div>

              <div class="row" style="margin-top:16px">
                <button class="btn primary" id="outlook-submit" type="button">Mulai Buat Hook (3 Pilihan) \u2192</button>
                <label class="row" style="gap:6px;color:var(--muted);font-size:12.5px">
                  <input type="checkbox" id="outlook-fresh" /> Abaikan cache
                </label>
                <div class="spacer"></div>
                <span id="outlook-produce-msg" style="font-size:12.5px;color:var(--muted)"></span>
              </div>
            </div>

            <!-- Loading modal overlay -->
            <div id="manuscript-preview" style="display:none"></div>
            <div class="produce-loading" id="produce-loading" style="display:none">
              <div class="loading-backdrop"></div>
              <div class="loading-modal">
                <div class="loading-spinner"></div>
                <h3 id="loading-title">Memulai produksi...</h3>
                <p id="loading-sub">Pipeline 9 agen sedang berjalan. Ini memakan 2\u20135 menit.</p>
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
<div class="drawer" id="drawer"><button class="x" id="drawer-x">\u00D7</button><div class="drawer-i" id="drawer-i"></div></div>
<div class="slide-zoom" id="slide-zoom">
  <div class="zoom-stage" id="zoom-stage">
    <div class="zoom-wrapper" id="zoom-wrapper">
      <iframe class="zoom-frame" id="zoom-frame" title="Slide zoom"></iframe>
    </div>
    <div class="zoom-info" id="zoom-info"></div>
    <button class="zoom-close" id="zoom-close" title="Tutup (Esc)">\u00D7</button>
    <div class="zoom-controls" id="zoom-controls">
      <button id="zoom-out" title="Perkecil">\u2212</button>
      <button id="zoom-reset" title="Reset">\u25CE</button>
      <button id="zoom-in" title="Perbesar">\uFF0B</button>
      <button id="zoom-download" title="Unduh">\u2913</button>
    </div>
    <div class="zoom-thumbs" id="zoom-thumbs"></div>
  </div>
</div>
<div class="loading" id="loading">
  <div class="box">
    <div class="spin"></div>
    <div class="msg" id="load-msg">Memuat\u2026</div>
    <div class="sub" id="load-sub"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>${STUDIO_JS}</script>
</body>
</html>`;
}
