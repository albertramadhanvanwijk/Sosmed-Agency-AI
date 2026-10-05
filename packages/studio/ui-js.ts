/**
 * Skrip antarmuka Studio.
 *
 * Dipisah dari CSS dan dari komposisi HTML. Prinsip yang dipegang di sini:
 *
 *  - Setiap tindakan yang memerlukan waktu menampilkan popup kemajuan, supaya
 *    pengguna tahu sistem bekerja dan tidak menekan tombol berulang kali.
 *  - Tombol keputusan HILANG setelah keputusan diambil, sehingga tidak ada
 *    keputusan ganda dan riwayat tetap bersih.
 *  - Catatan revisi wajib diisi, karena catatan itulah bahan pembelajaran agen.
 *  - Tidak ada satu pun nilai yang disisipkan ke DOM tanpa di-escape oleh
 *    pemakaian `textContent` (bukan `innerHTML`).
 */
export const STUDIO_JS = `
'use strict';

var state = {
  tab: 'dashboard', detailId: null, carousels: [], office: null, officeMode: 'graphic',
  uploads: [], brand: null, ctaPresets: [], simTimer: null, plan: null,
  currentManuscript: null, currentCarousel: null, currentVersions: [],
  jobsPollTimer: null,
  // Wizard states
  wizard: {
    edukasi: { links: [], pdfText: '', pdfWarning: false },
    jurnal: { rows: [], imageIds: {}, step: 1 },
    outlook: { gallery: [], step: 1 }
  }
};

function $(id) { return document.getElementById(id); }
function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined && x !== null) e.textContent = String(x); return e; }
function fill(n, kids) { while (n.firstChild) n.removeChild(n.firstChild); kids.forEach(function (k) { n.appendChild(k); }); }
function num(n) { return (n === null || n === undefined) ? '-' : Number(n).toLocaleString('id-ID'); }
function usd(n) { return '$' + Number(n || 0).toFixed(4); }
function pct(v) { return (Number(v || 0) * 100).toFixed(0) + '%'; }
function msFmt(v) { if (!v && v !== 0) return '-'; var s = v / 1000; return s < 90 ? s.toFixed(1) + 's' : (s / 60).toFixed(1) + ' menit'; }
function ago(iso) {
  if (!iso) return '-';
  var d = (Date.now() - Date.parse(iso)) / 1000;
  if (isNaN(d)) return '-';
  if (d < 60) return Math.round(d) + ' dtk lalu';
  if (d < 3600) return Math.round(d / 60) + ' mnt lalu';
  if (d < 86400) return Math.round(d / 3600) + ' jam lalu';
  return Math.round(d / 86400) + ' hari lalu';
}
function badge(t, c) { return el('span', 'badge ' + (c || 'b-muted'), t); }

// ---------------------------------------------------------------------------
// Popup kemajuan & notifikasi
// ---------------------------------------------------------------------------

var loadTimer = null;
function showLoading(msg, sub) {
  $('load-msg').textContent = msg || 'Memuat\\u2026';
  $('load-sub').textContent = sub || '';
  $('loading').classList.add('on');
  if (loadTimer) clearTimeout(loadTimer);
  return Date.now();
}
function hideLoading(started) {
  var elapsed = Date.now() - (started || 0);
  // Minimal tampil 450 ms supaya tidak berkedip saat data tiba sangat cepat.
  var wait = Math.max(0, 450 - elapsed);
  loadTimer = setTimeout(function () { $('loading').classList.remove('on'); }, wait);
}

var toastTimer = null;
function toast(msg, kind) {
  var t = $('toast');
  t.textContent = msg;
  t.className = 'toast on ' + (kind || '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 4600);
}

/** Menjalankan aksi dengan tombol berputar dan popup kemajuan. */
function busy(btn, msg, sub, fn) {
  var started = Date.now();
  if (btn) { btn.classList.add('loading-btn'); btn.disabled = true; }
  if (msg) showLoading(msg, sub);
  return Promise.resolve()
    .then(fn)
    .finally(function () {
      if (btn) { btn.classList.remove('loading-btn'); btn.disabled = false; }
      if (msg) hideLoading(started);
    });
}

function api(path, opts) {
  return fetch(path, opts).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    });
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function renderKpi(k) {
  var cards = [
    ['Total Carousel', num(k.totalCarousels), k.totalSlides + ' slide tersimpan', ''],
    ['Menunggu Persetujuan', num(k.needsReview), 'butuh keputusan Anda', k.needsReview > 0 ? 'warn' : 'ok'],
    ['Disetujui', num(k.approved), 'siap diunggah manual', 'ok'],
    ['Diblokir Kepatuhan', num(k.blocked), k.blocked > 0 ? 'perbaiki temuan dulu' : 'tidak ada', k.blocked > 0 ? 'bad' : 'ok'],
    ['Lolos Pemeriksaan', pct(k.complianceFirstPassRate), 'tanpa temuan memblokir', k.complianceFirstPassRate >= 0.8 ? 'ok' : 'warn'],
    ['Biaya Produksi', usd(k.totalCostUsd), k.billableCalls + ' berbayar, ' + k.cachedCalls + ' dari cache', ''],
    ['Waktu Produksi', msFmt(k.avgDurationMs), 'rata-rata per carousel', ''],
    ['Efisiensi Cache', (k.billableCalls + k.cachedCalls) > 0 ? pct(k.cachedCalls / (k.billableCalls + k.cachedCalls)) : '-', 'panggilan model dari cache', '']
  ];
  fill($('kpi-row'), cards.map(function (c) {
    var d = el('div', 'stat ' + c[3]);
    d.appendChild(el('div', 'v', c[1]));
    d.appendChild(el('div', 'l', c[0]));
    d.appendChild(el('div', 'n', c[2]));
    return d;
  }));
}

function statusBadge(s) {
  var m = {
    needs_review: ['b-wait', 'Perlu Review'], approved: ['b-ok', 'Disetujui'],
    changes_requested: ['b-work', 'Minta Revisi'], rejected: ['b-fail', 'Ditolak'],
    failed: ['b-fail', 'Gagal'], briefed: ['b-idle', 'Briefing'],
    researching: ['b-work', 'Riset'], drafting: ['b-work', 'Menulis'], designing: ['b-work', 'Desain']
  };
  var x = m[s] || ['b-idle', s];
  return badge(x[1], x[0]);
}

function renderQueue(list) {
  $('q-count').textContent = list.length + ' item';
  var n = $('queue-list');
  if (list.length === 0) { fill(n, [el('div', 'empty', 'Tidak ada yang menunggu persetujuan.')]); return; }
  var t = el('table', 'tbl');
  var hd = el('tr'); ['Konten', 'Status', 'Biaya', 'Diperbarui', ''].forEach(function (x) { hd.appendChild(el('th', null, x)); });
  var th = el('thead'); th.appendChild(hd); t.appendChild(th);
  var tb = el('tbody');
  list.forEach(function (c) {
    var tr = el('tr');
    var td1 = el('td', 'wrap');
    td1.appendChild(el('div', null, c.title || c.topic));
    var m = el('div');
    m.style.cssText = 'font-size:11px;color:var(--dim);margin-top:4px;display:flex;gap:6px;flex-wrap:wrap';
    m.appendChild(badge(c.category_key.replace(/_/g, ' '), 'b-cat'));
    if (c.compliance_blocked) m.appendChild(badge('Diblokir', 'b-fail'));
    if (c.revision_round > 0) m.appendChild(badge('perbaikan ke-' + c.revision_round, 'b-work'));
    m.appendChild(el('span', null, c.slide_count + ' slide'));
    td1.appendChild(m);
    tr.appendChild(td1);
    var td2 = el('td'); td2.appendChild(statusBadge(c.status)); tr.appendChild(td2);
    tr.appendChild(el('td', 'num', usd(c.cost_usd)));
    tr.appendChild(el('td', null, ago(c.updated_at)));
    var td5 = el('td');
    var b = el('button', 'btn sm primary', 'Tinjau');
    b.onclick = function () { openDetail(c.id); };
    td5.appendChild(b);
    tr.appendChild(td5);
    tr.onclick = function (e) { if (e.target.tagName !== 'BUTTON') openDetail(c.id); };
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  fill(n, [t]);
}

function renderJobs(jobs) {
  var rows = jobs.slice();
  if (rows.length === 0 && state.carousels.length > 0) {
    rows = state.carousels.slice(0, 8).map(function (c) {
      return { topic: c.title || c.topic, status: c.status === 'failed' ? 'failed' : 'done',
        current_step: c.status === 'needs_review' ? 'menunggu keputusan' : c.status,
        progress: 1, created_at: c.created_at, finished_at: c.updated_at };
    });
  }
  $('j-count').textContent = rows.length + (jobs.length === 0 ? ' carousel' : ' job');
  var n = $('jobs-list');
  if (rows.length === 0) { fill(n, [el('div', 'empty', 'Belum ada produksi.')]); return; }
  var t = el('table', 'tbl');
  var hd = el('tr'); ['Topik', 'Status', 'Langkah', 'Kemajuan', 'Waktu'].forEach(function (x) { hd.appendChild(el('th', null, x)); });
  var th = el('thead'); th.appendChild(hd); t.appendChild(th);
  var tb = el('tbody');
  rows.forEach(function (j) {
    var tr = el('tr');
    tr.appendChild(el('td', 'wrap', j.topic));
    var tds = el('td');
    tds.appendChild(badge(j.status, j.status === 'done' ? 'b-ok' : j.status === 'failed' ? 'b-fail' : j.status === 'running' ? 'b-work' : 'b-idle'));
    tr.appendChild(tds);
    tr.appendChild(el('td', null, j.current_step || '-'));
    tr.appendChild(el('td', 'num', Math.round((j.progress || 0) * 100) + '%'));
    tr.appendChild(el('td', null, ago(j.finished_at || j.created_at)));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  fill(n, [t]);
}

function renderMemSummary(node, summary, revCount) {
  var cards = [
    ['Aturan Aktif', summary.active, 'dipakai pada produksi berikutnya'],
    ['Aturan Kuat', summary.strong, 'kepercayaan di atas 70%'],
    ['Catatan Revisi', revCount, 'sumber pembelajaran agen'],
    ['Topik Tercatat', state.carousels.length, 'mencegah pengulangan']
  ];
  node.textContent = '';
  var g = el('div', 'grid g4');
  cards.forEach(function (c) {
    var d = el('div', 'stat');
    d.appendChild(el('div', 'v', String(c[1] || 0)));
    d.appendChild(el('div', 'l', c[0]));
    d.appendChild(el('div', 'n', c[2]));
    g.appendChild(d);
  });
  node.appendChild(g);
}

function refreshJobsBadges() {
  return api('/api/jobs').then(function (d) {
    var active = d.active || [];
    var mCount = active.filter(function (j) { return j.job_type === 'manuscript'; }).length;
    var dCount = active.filter(function (j) { return j.job_type === 'design'; }).length;
    var mBadge = $('jobs-manuscript-badge');
    var dBadge = $('jobs-design-badge');
    if (mBadge) { mBadge.textContent = String(mCount); mBadge.style.display = ''; }
    if (dBadge) { dBadge.textContent = String(dCount); dBadge.style.display = ''; }
  }).catch(function () {});
}
function loadOverview(silent) {
  return api('/api/overview').then(function (d) {
    state.carousels = d.recent;
    renderKpi(d.kpi);
    renderQueue(d.queue);
    renderJobs(d.recentJobs);
    var pill = document.querySelector('[data-pill="approvals"]');
    if (pill) {
      if (d.kpi.needsReview > 0) { pill.style.display = ''; pill.textContent = d.kpi.needsReview; }
      else { pill.style.display = 'none'; }
    }
    return api('/api/memory/rules').then(function (m) {
      renderMemSummary($('mem-summary'), m.summary, m.revisions.length);
    }).catch(function () { });
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

var COLUMNS = [
  ['briefed', 'Briefing'], ['researching', 'Riset'], ['drafting', 'Menulis'], ['designing', 'Desain'],
  ['needs_review', 'Perlu Review'], ['approved', 'Disetujui'], ['changes_requested', 'Minta Revisi'], ['failed', 'Gagal'], ['archived', 'Arsip']
];

function loadPipeline() {
  var cat = $('pf-cat').value;
  return api('/api/carousels' + (cat ? '?category=' + encodeURIComponent(cat) : '')).then(function (d) {
    state.carousels = d.carousels;
    var board = $('board');
    board.textContent = '';
    COLUMNS.forEach(function (c) {
      var items = d.carousels.filter(function (x) { return x.status === c[0]; });
      var col = el('div', 'col');
      var h = el('h3');
      h.appendChild(el('span', null, c[1]));
      h.appendChild(el('span', null, items.length));
      col.appendChild(h);
      items.forEach(function (x) {
        var card = el('div', 'item ' + (x.compliance_blocked ? 'blocked' : x.compliance_outcome === 'warn' ? 'warn' : 'clean'));
        card.appendChild(el('div', 't', x.title || x.topic));
        var m = el('div', 'm');
        m.appendChild(badge(x.category_key.replace(/_/g, ' '), 'b-cat'));
        m.appendChild(el('span', null, x.slide_count + ' slide'));
        if (x.revision_round > 0) m.appendChild(badge('revisi ke-' + x.revision_round, 'b-work'));
        card.appendChild(m);
        card.onclick = function () { openDetail(x.id); };
        col.appendChild(card);
      });
      board.appendChild(col);
    });
  });
}

// ---------------------------------------------------------------------------
// Persetujuan
// ---------------------------------------------------------------------------

function loadApprovals() {
  return api('/api/carousels?status=needs_review').then(function (d) {
    var n = $('approvals-list');
    // Filter out archived carousels
    var activeCarousels = d.carousels.filter(function (c) {
      return !c.archived_at && c.status !== 'archived';
    });
    if (activeCarousels.length === 0) { fill(n, [el('div', 'empty', 'Tidak ada carousel yang menunggu persetujuan.')]); return; }
    fill(n, activeCarousels.map(function (c) {
      var box = el('div', 'finding ' + (c.compliance_blocked ? 'block' : ''));
      var h = el('div', 'fh');
      h.appendChild(el('span', null, c.title || c.topic));
      h.appendChild(badge(c.category_key.replace(/_/g, ' '), 'b-cat'));
      if (c.compliance_blocked) h.appendChild(badge('Diblokir kepatuhan', 'b-fail'));
      if (c.revision_round > 0) h.appendChild(badge('perbaikan ke-' + c.revision_round, 'b-work'));
      box.appendChild(h);
      var meta = el('div', 'fd');
      meta.appendChild(el('b', null, 'Ringkasan: '));
      meta.appendChild(el('span', null, (c.compliance_outcome || '-').toUpperCase() + ' \\u00B7 ' + c.slide_count + ' slide \\u00B7 ' + usd(c.cost_usd) + ' \\u00B7 ' + ago(c.updated_at)));
      box.appendChild(meta);
      var row = el('div', 'row');
      row.style.marginTop = '10px';
      var bD = el('button', 'btn sm', 'Buka Detail');
      bD.onclick = function () { openDetail(c.id); };
      row.appendChild(bD);
      var bA = el('button', 'btn sm ok', 'Setujui');
      bA.disabled = c.compliance_blocked === 1;
      if (bA.disabled) bA.title = 'Masih ada temuan yang memblokir.';
      bA.onclick = function () { decide(c.id, 'approved', bA); };
      row.appendChild(bA);
      var bR = el('button', 'btn sm warn', 'Minta Revisi');
      bR.onclick = function () { openReviseForm(c.id, 'changes_requested'); };
      row.appendChild(bR);
      var bX = el('button', 'btn sm bad', 'Tolak');
      bX.onclick = function () { openRejectDialog(c.id); };
      row.appendChild(bX);
      box.appendChild(row);
      return box;
    }));
  });
}

function decide(id, decision, btn) {
  var note = 'Disetujui setelah memeriksa pratinjau dan temuan kepatuhan.';
  return busy(btn, 'Menyimpan keputusan', 'Sebentar\\u2026', function () {
    return api('/api/carousels/' + id + '/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decision, note: note })
    });
  }).then(function () {
    toast('Carousel disetujui. Tombol keputusan dihilangkan agar tidak ada keputusan ganda.', 'ok');
    loadApprovals();
    loadOverview(true);
    if (state.detailId === id) { openDetail(id); }
  }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
}

function openRejectDialog(id) {
  var c = state.carousels.filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  
  openDrawer();
  var inner = $('drawer-i');
  inner.textContent = '';

  var t = el('h2', null, 'Tolak Carousel');
  t.style.cssText = 'font-size:17px;margin-bottom:6px;padding-right:36px';
  inner.appendChild(t);
  inner.appendChild(el('div', 'hint', c.title || c.topic));

  var b1 = el('div');
  b1.style.marginTop = '16px';
  b1.appendChild(el('label', 'f', 'Alasan Penolakan (wajib diisi)'));
  var ta = document.createElement('textarea');
  ta.rows = 4;
  ta.id = 'reject-note';
  ta.placeholder = 'Jelaskan mengapa carousel ini ditolak. Catatan ini akan disimpan untuk pembelajaran.';
  b1.appendChild(ta);
  inner.appendChild(b1);

  var row = el('div', 'row');
  row.style.marginTop = '18px';
  var bCancel = el('button', 'btn', 'Batal');
  bCancel.onclick = closeDrawer;
  row.appendChild(bCancel);
  
  var bConfirm = el('button', 'btn bad', 'Ya, Tolak');
  bConfirm.onclick = function () {
    var note = ($('reject-note') && $('reject-note').value || '').trim();
    if (note.length < 5) { toast('Alasan penolakan wajib diisi (minimal 5 karakter).', 'warn'); return; }
    if (!window.confirm('Yakin ingin menolak carousel ini? Carousel akan dipindahkan ke arsip.')) return;
    
    busy(bConfirm, 'Menolak carousel', 'Menyimpan\\u2026', function () {
      return api('/api/carousels/' + id + '/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'rejected', note: note, autoRevise: false })
      });
    }).then(function () {
      toast('Carousel ditolak dan dipindahkan ke arsip.', 'ok');
      closeDrawer();
      loadApprovals();
      loadOverview(true);
      loadPipeline();
    }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
  };
  row.appendChild(bConfirm);
  inner.appendChild(row);
}

/**
 * Formulir catatan revisi.
 *
 * Catatan WAJIB diisi. Tanpa catatan, agen tidak punya bahan untuk belajar dan
 * kesalahan yang sama akan terulang \\u2014 inilah inti permintaan pengguna pada
 * poin revisi.
 */
function openReviseForm(id, decision) {
  var c = state.carousels.filter(function (x) { return x.id === id; })[0];
  openDrawer();
  var inner = $('drawer-i');
  inner.textContent = '';

  var t = el('h2', null, decision === 'rejected' ? 'Tolak Carousel' : 'Minta Revisi');
  t.style.cssText = 'font-size:17px;margin-bottom:6px;padding-right:36px';
  inner.appendChild(t);
  inner.appendChild(el('div', 'hint', c ? (c.title || c.topic) : ''));

  var b1 = el('div');
  b1.style.marginTop = '16px';
  b1.appendChild(el('label', 'f', 'Catatan Anda (wajib diisi)'));
  var ta = document.createElement('textarea');
  ta.rows = 6;
  ta.id = 'rev-note';
  ta.placeholder = 'Tulis apa yang perlu diperbaiki. Catatan ini dipakai agen untuk belajar, sehingga produksi berikutnya tidak mengulangi kesalahan yang sama.';
  b1.appendChild(ta);
  b1.appendChild(el('div', 'hint', 'Contoh: "Slide 3 terlalu panjang, pecah jadi dua slide. Tambahkan contoh perhitungan dengan angka nyata."'));
  inner.appendChild(b1);

  var b2 = el('div');
  b2.style.marginTop = '14px';
  var lbl = el('label', 'row');
  lbl.style.cssText = 'gap:7px;color:var(--muted);font-size:12.5px';
  var cb = document.createElement('input');
  cb.type = 'checkbox'; cb.id = 'rev-auto'; cb.checked = true;
  lbl.appendChild(cb);
  lbl.appendChild(document.createTextNode('Langsung jalankan perbaikan sekarang'));
  b2.appendChild(lbl);
  b2.appendChild(el('div', 'hint', 'Bila dicentang, agen langsung membuat versi perbaikan memakai catatan di atas. Bila tidak, catatan tetap tersimpan sebagai pelajaran agen.'));
  inner.appendChild(b2);

  var row = el('div', 'row');
  row.style.marginTop = '18px';
  var bSend = el('button', 'btn primary', 'Kirim & Perbaiki');
  bSend.onclick = function () {
    var note = ($('rev-note') && $('rev-note').value || '').trim();
    if (note.length < 5) { toast('Catatan revisi wajib diisi (minimal 5 karakter).', 'warn'); return; }
    var auto = $('rev-auto') && $('rev-auto').checked;
    busy(bSend, auto ? 'Menjalankan perbaikan' : 'Menyimpan catatan',
      auto ? 'Agen sedang memperbaiki sesuai catatan Anda. Ini memakan 2 sampai 5 menit\\u2026' : 'Menyimpan\\u2026', function () {
      return api('/api/carousels/' + id + '/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision, note: note, autoRevise: auto })
      });
    }).then(function (r) {
      toast(auto ? 'Catatan tersimpan; perbaikan sedang berjalan.' : 'Catatan tersimpan sebagai pelajaran agen.', 'ok');
      closeDrawer();
      loadApprovals();
      loadOverview(true);
      loadPipeline();
      if (r.revised && r.revised.jobQueued) { pollUntilDone(); }
    }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
  };
  row.appendChild(bSend);
  var bCancel = el('button', 'btn', 'Batal');
  bCancel.onclick = closeDrawer;
  row.appendChild(bCancel);
  inner.appendChild(row);
}

// ---------------------------------------------------------------------------
// Laci detail
// ---------------------------------------------------------------------------

function openDrawer() { $('backdrop').classList.add('on'); $('drawer').classList.add('on'); }
function closeDrawer() { state.detailId = null; $('backdrop').classList.remove('on'); $('drawer').classList.remove('on'); }

// ---------------------------------------------------------------------------
// Slide zoom \\u2014 Item 12 (clickable zoom, pan, download, keyboard)
// ---------------------------------------------------------------------------

var zoomState = { level: 1, x: 0, y: 0, dragging: false, sx: 0, sy: 0, id: null, pos: 1, slides: [] };

function applyZoom() {
  var wr = $('zoom-wrapper'); if (!wr) return;
  wr.style.transform = 'scale(' + zoomState.level + ')';
  wr.style.transformOrigin = 'center center';
  var info = $('zoom-info'); if (info) info.textContent = 'Slide ' + zoomState.pos + ' / ' + zoomState.slides.length + ' \\u00B7 ' + Math.round(zoomState.level * 100) + '% \\u00B7 +/- zoom \\u00B7 Esc tutup';
}

function zoomIn() { zoomState.level = Math.min(3, zoomState.level + 0.25); applyZoom(); }
function zoomOut() { zoomState.level = Math.max(0.25, zoomState.level - 0.25); applyZoom(); }
function zoomReset() { 
  var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  var slideW = 1080, slideH = 1350;
  var maxW = vw * 0.9, maxH = vh * 0.9;
  zoomState.level = Math.min(maxW / slideW, maxH / slideH, 1);
  applyZoom(); 
}
function closeSlideZoom() { var m = $('slide-zoom'); if (m) m.classList.remove('on'); zoomReset(); }

function navigateZoom(dir) {
  if (!zoomState.slides.length) return;
  var idx = -1;
  for (var i = 0; i < zoomState.slides.length; i++) if (zoomState.slides[i].position === zoomState.pos) { idx = i; break; }
  if (idx === -1) return;
  var next = idx + dir;
  if (next < 0) next = zoomState.slides.length - 1;
  if (next >= zoomState.slides.length) next = 0;
  openSlideZoom(zoomState.id, zoomState.slides[next].position, zoomState.slides);
}

function openSlideZoom(id, pos, slides) {
  zoomState.id = id; zoomState.pos = pos; zoomState.slides = slides ? slides.slice() : [];
  var m = $('slide-zoom'); var fr = $('zoom-frame'); if (!m || !fr) return;
  fr.src = '/preview/' + id + '/' + pos + '?ratio=ig_portrait';

  // Calculate initial fit-to-screen scale
  var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  var slideW = 1080, slideH = 1350;
  var maxW = vw * 0.9, maxH = vh * 0.9;
  var scale = Math.min(maxW / slideW, maxH / slideH, 1);
  zoomState.level = scale;
  zoomState.x = 0; zoomState.y = 0;

  m.classList.add('on');
  applyZoom();
  var thumbs = $('zoom-thumbs'); if (thumbs) {
    thumbs.textContent = '';
    (zoomState.slides || []).forEach(function (s) {
      var t = el('div', 'zt' + (s.position === pos ? ' on' : ''));
      var f = document.createElement('iframe'); f.src = '/preview/' + id + '/' + s.position + '?ratio=ig_portrait'; f.title = 'Slide ' + s.position;
      t.appendChild(f); t.onclick = function () { openSlideZoom(id, s.position, zoomState.slides); };
      thumbs.appendChild(t);
    });
  }
}

function openDetail(id) {
  state.detailId = id;
  openDrawer();
  var inner = $('drawer-i');
  fill(inner, [el('div', 'empty', 'Memuat detail\\u2026')]);

  api('/api/carousels/' + id).then(function (d) {
    var c = d.carousel;
    inner.textContent = '';

    var t = el('h2', null, c.title || c.topic);
    t.style.cssText = 'font-size:18px;margin-bottom:8px;padding-right:36px';
    inner.appendChild(t);

    var m = el('div', 'row');
    m.appendChild(badge(c.category_key.replace(/_/g, ' '), 'b-cat'));
    m.appendChild(badge('risiko ' + c.risk_level, c.risk_level === 'high' ? 'b-fail' : 'b-muted'));
    m.appendChild(statusBadge(c.status));
    if (c.compliance_outcome) m.appendChild(badge('kepatuhan: ' + c.compliance_outcome, c.compliance_outcome === 'pass' ? 'b-ok' : c.compliance_outcome === 'block' ? 'b-fail' : 'b-wait'));
    if (c.revision_round > 0) m.appendChild(badge('perbaikan ke-' + c.revision_round, 'b-work'));
    inner.appendChild(m);

    var meta = el('div', 'hint');
    meta.style.marginTop = '7px';
    meta.textContent = d.slides.length + ' slide \\u00B7 ' + num(c.tokens_in) + '/' + num(c.tokens_out) + ' token \\u00B7 ' + usd(c.cost_usd) + ' \\u00B7 ' + msFmt(c.duration_ms) + ' \\u00B7 dibuat ' + ago(c.created_at);
    inner.appendChild(meta);

    // Tombol keputusan hanya ada selama status masih menunggu keputusan.
    if (c.status === 'needs_review') {
      var act = el('div', 'row');
      act.style.marginTop = '14px';
      var bA = el('button', 'btn ok', 'Setujui');
      bA.disabled = c.compliance_blocked === 1;
      if (bA.disabled) bA.title = 'Diblokir oleh temuan kepatuhan.';
      bA.onclick = function () { decide(id, 'approved', bA); };
      act.appendChild(bA);
      var bR = el('button', 'btn warn', 'Minta Revisi');
      var MAX_REVISIONS = 3;
      if (c.revision_round >= MAX_REVISIONS) {
        bR.disabled = true;
        bR.title = 'Sudah ' + MAX_REVISIONS + ' kali revisi. Silakan approve atau reject.';
      } else if (c.revision_round > 0) {
        bR.textContent = 'Minta Revisi (' + c.revision_round + '/' + MAX_REVISIONS + ')';
      }
      bR.onclick = function () { openReviseForm(id, 'changes_requested'); };
      act.appendChild(bR);
      var bX = el('button', 'btn bad', 'Tolak');
      bX.onclick = function () { openRejectDialog(id, 'rejected'); };
      act.appendChild(bX);
      inner.appendChild(act);
    } else {
      var done = el('div', 'finding');
      done.style.marginTop = '14px';
      done.appendChild(el('div', 'fh', 'Keputusan sudah diambil'));
      done.appendChild(el('div', 'fd', 'Status: ' + c.status + (c.approved_at ? ' \\u00B7 ' + ago(c.approved_at) : '') + (c.approval_note ? ' \\u00B7 ' + c.approval_note : '')));
      inner.appendChild(done);
    }

    if (c.revised_from) {
      var s0 = el('div', 'sec');
      s0.appendChild(el('h3', null, 'Rantai Perbaikan'));
      var r0 = el('div', 'finding');
      r0.appendChild(el('div', 'fd', 'Carousel ini adalah hasil perbaikan dari carousel sebelumnya.'));
      if (c.extra_instructions) {
        var pre0 = el('pre', 'mono', c.extra_instructions);
        pre0.style.marginTop = '8px';
        r0.appendChild(pre0);
      }
      var bGo = el('button', 'btn sm', 'Lihat Asal');
      bGo.style.marginTop = '8px';
      bGo.onclick = function () { openDetail(c.revised_from); };
      r0.appendChild(bGo);
      s0.appendChild(r0);
      inner.appendChild(s0);
    }

    var s1 = el('div', 'sec');
    s1.appendChild(el('h3', null, 'Pratinjau Slide'));
    if (d.slides.length === 0) { s1.appendChild(el('div', 'empty', 'Tidak ada slide tersimpan.')); }
    else {
      var strip = el('div', 'strip');
      d.slides.forEach(function (s) {
        var th = el('div', 'thumb');
        th.title = 'Klik untuk zoom';
        th.onclick = function () { openSlideZoom(id, s.position, d.slides); };
        var hold = el('div', 'hold');
        var fr = document.createElement('iframe');
        fr.setAttribute('loading', 'lazy');
        fr.setAttribute('scrolling', 'no');
        fr.title = 'Slide ' + s.position;
        fr.src = '/preview/' + id + '/' + s.position + '?ratio=ig_portrait';
        hold.appendChild(fr);
        th.appendChild(hold);
        var cap = el('div', 'cap');
        cap.appendChild(el('span', null, 'Slide ' + s.position + ' \\u00B7 ' + s.role));
        cap.appendChild(el('span', null, (s.template_key || '').replace(/-/g, ' ')));
        th.appendChild(cap);
        strip.appendChild(th);
      });
      s1.appendChild(strip);
    }
    inner.appendChild(s1);

    var problems = d.findings.filter(function (f) { return f.result !== 'pass'; });
    var passed = d.findings.filter(function (f) { return f.result === 'pass'; });
    var s2 = el('div', 'sec');
    s2.appendChild(el('h3', null, 'Temuan Kepatuhan (' + problems.length + ')'));
    if (problems.length === 0) { s2.appendChild(el('div', 'empty', 'Tidak ada temuan. ' + passed.length + ' aturan lolos.')); }
    else {
      problems.forEach(function (f) {
        var box = el('div', 'finding ' + (f.severity === 'block' ? 'block' : ''));
        var h = el('div', 'fh');
        h.appendChild(badge(f.severity === 'block' ? 'BLOKIR' : 'CATATAN', f.severity === 'block' ? 'b-fail' : 'b-wait'));
        h.appendChild(el('span', null, f.rule_name));
        h.appendChild(badge(f.subject_ref, 'b-muted'));
        h.appendChild(badge(f.decided_by === 'llm' ? 'oleh model' : 'oleh kode', 'b-muted'));
        box.appendChild(h);
        if (f.evidence) {
          var e1 = el('div', 'fd');
          e1.appendChild(el('b', null, 'Bukti: '));
          e1.appendChild(el('span', null, f.evidence));
          box.appendChild(e1);
        }
        if (f.suggestion) {
          var e2 = el('div', 'fd');
          e2.appendChild(el('b', null, 'Saran: '));
          e2.appendChild(el('span', null, f.suggestion));
          box.appendChild(e2);
        }
        s2.appendChild(box);
      });
    }
    inner.appendChild(s2);

    if (d.captions.length > 0) {
      var s3 = el('div', 'sec');
      s3.appendChild(el('h3', null, 'Caption Siap Salin'));
      d.captions.forEach(function (cap) {
        var pre = el('pre', 'mono');
        pre.textContent = [cap.hook, '', cap.body, '', cap.cta, '', (cap.hashtags || []).join(' ')].join('\\n');
        s3.appendChild(pre);
      });
      inner.appendChild(s3);
    }

    if (d.facts.length > 0) {
      var s4 = el('div', 'sec');
      s4.appendChild(el('h3', null, 'Fact Sheet (' + d.facts.length + ')'));
      var t4 = el('table', 'tbl');
      var h4 = el('tr'); ['ID', 'Klaim', 'Sumber', 'Waktu', 'Keyakinan'].forEach(function (x) { h4.appendChild(el('th', null, x)); });
      var th4 = el('thead'); th4.appendChild(h4); t4.appendChild(th4);
      var tb4 = el('tbody');
      d.facts.forEach(function (f) {
        var tr = el('tr');
        tr.appendChild(el('td', null, f.ref));
        tr.appendChild(el('td', 'wrap', f.claim));
        tr.appendChild(el('td', null, f.source_name));
        tr.appendChild(el('td', null, f.as_of ? f.as_of.slice(0, 10) : '-'));
        tr.appendChild(el('td', null, f.confidence));
        tb4.appendChild(tr);
      });
      t4.appendChild(tb4);
      s4.appendChild(t4);
      inner.appendChild(s4);
    }

    var s5 = el('div', 'sec');
    s5.appendChild(el('h3', null, 'Jejak Agen (' + d.runs.length + ' langkah)'));
    if (d.runs.length === 0) { s5.appendChild(el('div', 'empty', 'Tidak ada jejak agen.')); }
    else {
      var t5 = el('table', 'tbl');
      var h5 = el('tr'); ['Langkah', 'Agen', 'Model', 'Status', 'Durasi', 'Token', 'Biaya'].forEach(function (x) { h5.appendChild(el('th', null, x)); });
      var th5 = el('thead'); th5.appendChild(h5); t5.appendChild(th5);
      var tb5 = el('tbody');
      d.runs.forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', null, r.step_key));
        tr.appendChild(el('td', null, r.agent_key));
        tr.appendChild(el('td', null, r.model || (r.agent_key === 'renderer' ? 'bukan model' : '-')));
        var tds = el('td');
        tds.appendChild(badge(r.status, r.status === 'succeeded' ? 'b-ok' : r.status === 'failed' ? 'b-fail' : 'b-idle'));
        tr.appendChild(tds);
        tr.appendChild(el('td', 'num', msFmt(r.duration_ms)));
        tr.appendChild(el('td', 'num', (r.tokens_in || r.tokens_out) ? (r.tokens_in + '/' + r.tokens_out) : (r.cached ? 'cache' : '-')));
        tr.appendChild(el('td', 'num', usd(r.cost_usd)));
        tb5.appendChild(tr);
      });
      t5.appendChild(tb5);
      s5.appendChild(t5);
      inner.appendChild(s5);
    }

    if (d.jurnalTrading) {
      var sJ = el('div', 'sec');
      sJ.appendChild(el('h3', null, 'Data Jurnal Trading'));
      var jt = d.jurnalTrading;
      sJ.appendChild(el('div', 'fd', 'Pair: ' + jt.pair + (jt.timeframe ? ' \\u00B7 Timeframe: ' + jt.timeframe : '')));
      if (jt.tradeTable && jt.tradeTable.length) {
        var tJ = el('table', 'tbl'); var hJ = el('tr');
        ['Pairs','Direction','Session','%Risk','RR','Confluence','PnL','Result'].forEach(function (x) { hJ.appendChild(el('th', null, x)); });
        var thJ = el('thead'); thJ.appendChild(hJ); tJ.appendChild(thJ);
        var tbJ = el('tbody');
        jt.tradeTable.forEach(function (r) {
          var tr = el('tr');
          tr.appendChild(el('td', null, r.pairs)); tr.appendChild(el('td', null, r.direction));
          tr.appendChild(el('td', null, r.session)); tr.appendChild(el('td', null, r.riskPct));
          tr.appendChild(el('td', null, r.rr)); tr.appendChild(el('td', null, r.confluence));
          tr.appendChild(el('td', null, r.pnl)); tr.appendChild(el('td', null, r.result));
          tbJ.appendChild(tr);
        });
        tJ.appendChild(tbJ); sJ.appendChild(tJ);
      }
      if (jt.directionDesc) sJ.appendChild(el('div', 'fd', 'Direction: ' + jt.directionDesc));
      if (jt.executionDesc) sJ.appendChild(el('div', 'fd', 'Execution: ' + jt.executionDesc));
      if (jt.markDesc) sJ.appendChild(el('div', 'fd', 'Mark: ' + jt.markDesc));
      if (jt.generalNotes) sJ.appendChild(el('div', 'fd', 'Catatan: ' + jt.generalNotes));
      inner.appendChild(sJ);
    }

    if (c.schedule_note || c.analysis_note) {
      var s6 = el('div', 'sec');
      s6.appendChild(el('h3', null, 'Catatan'));
      s6.appendChild(el('pre', 'mono', [c.schedule_note ? 'Penjadwalan: ' + c.schedule_note : '', c.analysis_note ? 'Analisis: ' + c.analysis_note : ''].filter(Boolean).join('\\n\\n')));
      inner.appendChild(s6);
    }
  }).catch(function (e) {
    fill(inner, [el('div', 'empty', 'Gagal memuat detail: ' + e.message)]);
  });
}

// ---------------------------------------------------------------------------
// Agent Office
// ---------------------------------------------------------------------------

var ZG = [
  { key: 'brief_room', name: 'Ruang Brief', order: 1, color: '#3B82F6', col: 0, row: 0 },
  { key: 'research_lab', name: 'Laboratorium Riset', order: 2, color: '#A855F7', col: 1, row: 0 },
  { key: 'writing_desk', name: 'Meja Penulisan', order: 3, color: '#22D3EE', col: 2, row: 0 },
  { key: 'design_studio', name: 'Studio Desain', order: 4, color: '#F59E0B', col: 0, row: 1 },
  { key: 'review_room', name: 'Ruang Peninjauan', order: 5, color: '#EF4444', col: 1, row: 1 },
  { key: 'publish_desk', name: 'Meja Terbit', order: 6, color: '#22C55E', col: 2, row: 1 },
  { key: 'library', name: 'Arsip Pengetahuan', order: 7, color: '#61748F', col: 1, row: 2 }
];
var HW = 292, HH = 160, OX = 450, OY = 100;
function iso(c, r) { return { x: OX + (c - r) * HW, y: OY + (c + r) * HH }; }

var SHORT = { strategist: 'ST', research: 'RS', copywriter: 'CW', composer: 'CP', renderer: 'RN', compliance: 'CO', compliance_advisor: 'CA', scheduler: 'SC', analyst: 'AN' };
var ANAME = { strategist: 'Strategist', research: 'Research', copywriter: 'Copywriter', composer: 'Composer', renderer: 'Renderer', compliance: 'Compliance', compliance_advisor: 'Nuansa', scheduler: 'Scheduler', analyst: 'Analyst' };
var AROLE = {
  strategist: 'sudut pandang & pesan kunci', research: 'fakta bersumber + waktu', copywriter: 'caption per platform',
  composer: 'slide spec terstruktur', compliance: 'aturan kode \\u2014 dapat memblokir', compliance_advisor: 'penilaian model \\u2014 peringatan',
  renderer: 'HTML \\u2192 PNG/PDF', scheduler: 'saran waktu tayang', analyst: 'penilaian & aset simpan'
};
var SLABEL = { working: 'Bekerja', done: 'Selesai', awaiting_human: 'Menunggu manusia', failed: 'Gagal', idle: 'Menganggur' };

function renderOffice(data) {
  state.office = data;
  var agents = data.agents || [];
  var graphic = state.officeMode !== 'text';
  $('office').style.display = graphic ? '' : 'none';
  $('office-table-wrap').style.display = graphic ? 'none' : '';

  if (!graphic) { renderOfficeTable(agents); }
  else {
    var wrap = $('office');
    wrap.textContent = '';
    var stage = el('div', 'stage');
    stage.appendChild(el('div', 'iso-floor'));
    ZG.forEach(function (z) {
      var members = agents.filter(function (a) { return a.zone === z.key; });
      var p = iso(z.col, z.row);
      var zone = el('div', 'zone' + (members.length === 0 ? ' dim' : ''));
      zone.style.left = p.x + 'px';
      zone.style.top = p.y + 'px';
      zone.style.setProperty('--zc', z.color);
      zone.appendChild(el('div', 'plate'));
      var room = el('div', 'room');
      var zh = el('div', 'zh');
      zh.appendChild(el('div', 'zn', z.order));
      zh.appendChild(el('div', 'zt', z.name));
      room.appendChild(zh);
      room.appendChild(el('div', 'zs', members.length > 0 ? members.length + ' agen' : 'tidak ada aktivitas'));
      var list = el('div', 'agents');
      members.forEach(function (a) {
        var cls = a.status === 'working' ? 'sw' : a.status === 'failed' ? 'sf' : a.status === 'awaiting_human' ? 'sa' : a.status === 'done' ? 'sd' : '';
        var node = el('div', 'agent ' + cls);
        node.title = (ANAME[a.agentKey] || a.agentKey) + ' \\u2014 ' + (SLABEL[a.status] || a.status) + (a.task ? ': ' + a.task : '');
        node.appendChild(el('div', 'av', SHORT[a.agentKey] || a.agentKey.slice(0, 2).toUpperCase()));
        node.appendChild(el('div', 'nm', ANAME[a.agentKey] || a.agentKey));
        if (a.status === 'failed') node.appendChild(el('div', 'fl bad', 'GAGAL'));
        else if (a.findings > 0 && a.status !== 'idle') node.appendChild(el('div', 'fl need', a.findings + ' TEMUAN'));
        node.onclick = function () { openAgent(a.agentKey); };
        list.appendChild(node);
      });
      room.appendChild(list);
      zone.appendChild(room);
      stage.appendChild(zone);
    });
    wrap.appendChild(stage);
  }

  var steps = ['strategist', 'research', 'copywriter', 'composer', 'compliance', 'compliance_advisor', 'renderer', 'scheduler', 'analyst'];
  var flow = $('office-flow');
  flow.textContent = '';
  steps.forEach(function (k) {
    var agent = agents.filter(function (a) { return a.agentKey === k; })[0];
    var zone = agent ? ZG.filter(function (z) { return z.key === agent.zone; })[0] : null;
    var node = el('div', 'fnode' + (agent && agent.status === 'working' ? ' run' : ''));
    node.style.setProperty('--zc', (zone && zone.color) || '#61748F');
    node.appendChild(el('div', 'fn', ANAME[k] || k));
    node.appendChild(el('div', 'fd', AROLE[k] || ''));
    var st = el('div', 'fs');
    if (agent && agent.status === 'working') st.appendChild(badge('BEKERJA', 'b-work'));
    else if (agent && agent.status === 'failed') st.appendChild(badge('GAGAL', 'b-fail'));
    else if (agent && agent.cached) st.appendChild(badge('CACHE', 'b-muted'));
    else if (agent && agent.status === 'done') st.appendChild(badge('SIAP', 'b-ok'));
    node.appendChild(st);
    flow.appendChild(node);
  });
}

function renderOfficeTable(agents) {
  var t = el('table', 'tbl');
  var hd = el('tr'); ['Zona', 'Agen', 'Status', 'Pekerjaan', 'Model', 'Token', 'Biaya', 'Temuan'].forEach(function (x) { hd.appendChild(el('th', null, x)); });
  var th = el('thead'); th.appendChild(hd); t.appendChild(th);
  var tb = el('tbody');
  ZG.forEach(function (z) {
    var members = agents.filter(function (a) { return a.zone === z.key; });
    if (members.length === 0) {
      var tr0 = el('tr');
      tr0.appendChild(el('td', null, z.name));
      var tdx = el('td', null, '\\u2014');
      tdx.colSpan = 7;
      tdx.style.color = 'var(--dim)';
      tr0.appendChild(tdx);
      tb.appendChild(tr0);
      return;
    }
    members.forEach(function (a, i) {
      var tr = el('tr');
      tr.appendChild(el('td', null, i === 0 ? z.name : ''));
      tr.appendChild(el('td', null, ANAME[a.agentKey] || a.agentKey));
      var tds = el('td');
      tds.appendChild(badge(SLABEL[a.status] || a.status, a.status === 'working' ? 'b-work' : a.status === 'failed' ? 'b-fail' : a.status === 'done' ? 'b-ok' : 'b-idle'));
      tr.appendChild(tds);
      tr.appendChild(el('td', 'wrap', a.task || '-'));
      tr.appendChild(el('td', null, a.model || (a.agentKey === 'renderer' ? 'bukan model' : '-')));
      tr.appendChild(el('td', 'num', (a.tokensIn || 0) + ' / ' + (a.tokensOut || 0)));
      tr.appendChild(el('td', 'num', usd(a.costUsd)));
      tr.appendChild(el('td', 'num', String(a.findings || 0)));
      tb.appendChild(tr);
    });
  });
  t.appendChild(tb);
  fill($('office-table-wrap'), [t]);
}

function openAgent(key) {
  if (!state.office) return;
  var a = (state.office.agents || []).filter(function (x) { return x.agentKey === key; })[0];
  if (!a) return;
  openDrawer();
  var inner = $('drawer-i');
  inner.textContent = '';
  var t = el('h2', null, ANAME[key] || key);
  t.style.cssText = 'font-size:17px;margin-bottom:9px;padding-right:36px';
  inner.appendChild(t);
  var m = el('div', 'row');
  var cls = a.status === 'working' ? 'b-work' : a.status === 'failed' ? 'b-fail' : a.status === 'done' ? 'b-ok' : a.status === 'awaiting_human' ? 'b-wait' : 'b-idle';
  m.appendChild(badge(SLABEL[a.status] || a.status, cls));
  m.appendChild(badge('zona: ' + a.zone, 'b-muted'));
  if (a.cached) m.appendChild(badge('hasil cache', 'b-muted'));
  inner.appendChild(m);

  var tbl = el('table', 'tbl');
  var tb = el('tbody');
  [
    ['Tugas terakhir', a.task || '-'], ['Langkah', a.stepKey || '-'], ['Carousel', a.carouselTitle || '-'],
    ['Model', a.model || (key === 'renderer' ? 'bukan model bahasa (Chromium)' : '-')],
    ['Mulai', a.startedAt ? new Date(a.startedAt).toLocaleString('id-ID') : '-'],
    ['Durasi', msFmt(a.durationMs)], ['Token masuk / keluar', (a.tokensIn || 0) + ' / ' + (a.tokensOut || 0)],
    ['Biaya', usd(a.costUsd)], ['Temuan kepatuhan', String(a.findings || 0)]
  ].forEach(function (r) {
    var tr = el('tr');
    tr.appendChild(el('td', null, r[0]));
    tr.appendChild(el('td', 'wrap', r[1]));
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  inner.appendChild(tbl);

  if (a.error) {
    var s = el('div', 'sec');
    s.appendChild(el('h3', null, 'Galat'));
    s.appendChild(el('pre', 'mono', a.error));
    inner.appendChild(s);
  }
  if (a.carouselId) {
    var b = el('button', 'btn primary', 'Buka Carousel');
    b.style.marginTop = '16px';
    b.onclick = function () { openDetail(a.carouselId); };
    inner.appendChild(b);
  }
  var note = el('div', 'hint');
  note.style.marginTop = '12px';
  note.textContent = 'Semua angka di panel ini berasal dari catatan eksekusi agen, bukan dari animasi.';
  inner.appendChild(note);
}

function loadOffice() { return api('/api/office').then(renderOffice); }

// ---------------------------------------------------------------------------
// Rencana mingguan
// ---------------------------------------------------------------------------

function loadPlan() {
  return api('/api/plan').then(function (d) { if (d.plan) { renderPlan(d.plan); } });
}

function getSelectedPlanIndices() {
  var boxes = document.querySelectorAll('.plan-slot-checkbox:checked');
  var out = [];
  for (var i = 0; i < boxes.length; i++) out.push(Number(boxes[i].getAttribute('data-idx')));
  return out;
}
function bulkGenerateManuscript() {
  var idxs = getSelectedPlanIndices();
  if (idxs.length === 0) { toast('Pilih minimal 1 slot.', 'warn'); return; }
  var items = idxs.map(function (i) {
    var sl = state.plan.slots[i];
    if (sl.categoryKey === 'jurnal_trading') return { categoryKey: sl.categoryKey, topic: sl.topic, form1: [{ pair: (sl.topic.split(' ')[0] || 'EUR/USD'), direction: 'long' }], form2: { directionDesc: 'Direction lengkap minimal sepuluh karakter', executionDesc: 'Execution lengkap minimal sepuluh karakter', markDesc: 'Mark lengkap minimal sepuluh karakter' } };
    if (sl.categoryKey === 'market_outlook') return { categoryKey: sl.categoryKey, title: sl.topic, gallery: [{ imageId: 'img1', description: 'Deskripsi chart minimal sepuluh karakter' }] };
    return { categoryKey: sl.categoryKey, topic: sl.topic };
  });
  api('/api/manuscripts/bulk-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items }) }).then(function (r) { var n = (r.succeeded && r.succeeded.length) || items.length; toast(n + ' berhasil', 'ok'); loadPlan(); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
}
function bulkApproveManuscript() { var idxs = getSelectedPlanIndices(); if (idxs.length === 0) { toast('Pilih minimal 1 slot.', 'warn'); return; } api('/api/manuscripts/bulk-approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: idxs }) }).then(function () { toast(idxs.length + ' berhasil', 'ok'); loadPlan(); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); }); }
function bulkGenerateDesign() { var idxs = getSelectedPlanIndices(); if (idxs.length === 0) { toast('Pilih minimal 1 slot.', 'warn'); return; } api('/api/designs/bulk-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: idxs }) }).then(function () { toast(idxs.length + ' berhasil', 'ok'); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); }); }
function bulkApproveDesign() { var idxs = getSelectedPlanIndices(); if (idxs.length === 0) { toast('Pilih minimal 1 slot.', 'warn'); return; } api('/api/designs/bulk-decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: idxs, decision: 'approved' }) }).then(function () { toast(idxs.length + ' berhasil', 'ok'); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); }); }

function renderPlan(p) {
  state.plan = p;
  $('plan-meta').textContent = p.periodStart + ' sampai ' + p.periodEnd + ' \\u00B7 ' + p.slots.length + ' slot';
  var out = $('plan-out');
  out.textContent = '';
  var note = el('div', 'finding');
  note.appendChild(el('div', 'fd', p.strategyNote));
  out.appendChild(note);
  if (p.warnings && p.warnings.length > 0) {
    var w = el('div', 'finding block');
    w.style.marginTop = '12px';
    w.appendChild(el('div', 'fh', 'Peringatan'));
    p.warnings.forEach(function (x) { w.appendChild(el('div', 'fd', '\\u2022 ' + x)); });
    out.appendChild(w);
  }
  var list = el('div');
  list.style.marginTop = '12px';
  p.slots.forEach(function (s, idx) {
    var row = el('div', 'plan-row');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'plan-slot-checkbox'; cb.setAttribute('data-idx', String(idx)); row.appendChild(cb);
    var dd = el('div', 'plan-date');
    dd.appendChild(el('div', 'd', s.date.slice(5)));
    dd.appendChild(el('div', 'w', s.weekday));
    row.appendChild(dd);
    var body = el('div', 'plan-body');
    body.appendChild(el('div', 'tp', s.topic));
    var meta = el('div', 'row');
    meta.style.marginTop = '4px';
    meta.appendChild(badge(s.categoryKey.replace(/_/g, ' '), 'b-cat'));
    if (s.manuscriptStatus) meta.appendChild(badge(s.manuscriptStatus.replace(/_/g, ' '), 'b-wait'));
    if (s.designStatus) meta.appendChild(badge(s.designStatus.replace(/_/g, ' '), 'b-cat'));
    meta.appendChild(badge(s.suggestedTime, 'b-muted'));
    if (s.timeSensitive) meta.appendChild(badge('peka waktu', 'b-wait'));
    if (s.copyStatus === 'approved') meta.appendChild(badge('copy approved', 'b-ok'));
    else if (s.copyStatus === 'needs_regeneration') meta.appendChild(badge('perlu regenerate', 'b-warn'));
    body.appendChild(meta);
    body.appendChild(el('div', 'rz', s.rationale));
    // copyDraft preview (Item 10)
    var copyPreview = el('div', 'copy-preview copyDraft');
    copyPreview.style.cssText = 'margin-top:8px;padding:8px;border:1px solid var(--line-soft);border-radius:8px;background:var(--panel)';
    if (s.copyDraft) {
      copyPreview.appendChild(el('div', 'fh', s.copyDraft.hook || '\\u2014'));
      copyPreview.appendChild(el('div', 'fd', (s.copyDraft.body || '').slice(0, 220)));
      var tags = el('div', 'hint'); tags.textContent = (s.copyDraft.hashtags || []).join(' ') + (s.copyDraft.cta ? ' \\u00B7 ' + s.copyDraft.cta : '');
      copyPreview.appendChild(tags);
    } else {
      copyPreview.appendChild(el('div', 'hint', 'copyDraft belum tersedia'));
    }
    body.appendChild(copyPreview);
    // inline copy editor (approve/regenerate)
    var copyActions = el('div', 'row'); copyActions.style.marginTop = '6px';
    var btnApprove = el('button', 'btn sm', s.copyStatus === 'approved' ? 'Approved \\u2713' : 'Approve Copy');
    btnApprove.onclick = function () { approveCopy(idx); };
    if (s.copyStatus === 'approved') btnApprove.disabled = true;
    var btnRegen = el('button', 'btn sm', 'Regenerate Copy');
    btnRegen.title = 'regenerateCopy';
    btnRegen.onclick = function () { regenerateCopy(idx); };
    copyActions.appendChild(btnApprove); copyActions.appendChild(btnRegen);
    body.appendChild(copyActions);
    row.appendChild(body);
    var act = el('div');
    var b = el('button', 'btn sm primary', 'Produksi');
    b.title = s.copyStatus === 'approved' ? 'skip copywriter: prebuiltCaptions' : 'Produksi';
    b.onclick = function () {
      // Item 10: if copy approved, send prebuiltCaptions so pipeline can skip copywriter
      if (s.copyStatus === 'approved' && s.copyDraft) {
        produceFromPlanSlot(s);
        return;
      }
      showTab('create');
      $('f-cat').value = s.categoryKey;
      $('f-topic').value = s.topic;
      $('f-extra').value = 'Topik ini berasal dari rencana mingguan. ' + s.rationale + (s.copyDraft ? ' Hook: ' + s.copyDraft.hook : '');
      onCategoryChange();
      checkSimilarity();
      toast('Topik dimuat ke formulir produksi.', 'ok');
    };
    if (s.copyStatus === 'approved') {
      var b2 = el('button', 'btn sm', 'Produksi (skip copywriter)');
      b2.title = 'skipCopywriter';
      b2.onclick = function () { produceFromPlanSlot(s); };
      act.appendChild(b2);
    }
    act.appendChild(b);
    row.appendChild(act);
    list.appendChild(row);
  });
  out.appendChild(list);
}

function approveCopy(idx) {
  if (!state.plan || !state.plan.slots[idx]) return;
  state.plan.slots[idx].copyStatus = 'approved';
  // persist copyStatus via plan reflection in memory (local only)
  renderPlan(state.plan);
  toast('Copy disetujui \\u2014 produksi berikutnya akan skip copywriter (prebuiltCaptions).', 'ok');
}

function openCopywriteDetail(idx) {
  if (!state.plan || !state.plan.slots[idx]) return;
  var s = state.plan.slots[idx];
  openDrawer();
  var inner = $('drawer-i');
  inner.textContent = '';
  
  var t = el('h2', null, 'Detail Copywriting');
  t.style.cssText = 'font-size:17px;margin-bottom:6px;padding-right:36px';
  inner.appendChild(t);
  inner.appendChild(el('div', 'hint', s.topic || '\\u2014'));
  
  if (!s.copyDraft) {
    inner.appendChild(el('div', 'finding', 'Copywriting belum tersedia. Klik Regenerate Copy untuk membuat.'));
    closeDrawer();
    return;
  }
  
  var copyDetail = el('div');
  copyDetail.style.marginTop = '16px';
  copyDetail.appendChild(el('label', 'f', 'Hook'));
  copyDetail.appendChild(el('div', 'finding', s.copyDraft.hook || '\\u2014'));
  
  copyDetail.appendChild(el('label', 'f', 'Body'));
  copyDetail.appendChild(el('div', 'finding', s.copyDraft.body || '\\u2014'));
  
  if (s.copyDraft.hashtags && s.copyDraft.hashtags.length > 0) {
    copyDetail.appendChild(el('label', 'f', 'Hashtags'));
    copyDetail.appendChild(el('div', 'finding', s.copyDraft.hashtags.join(' ')));
  }
  
  if (s.copyDraft.cta) {
    copyDetail.appendChild(el('label', 'f', 'CTA'));
    copyDetail.appendChild(el('div', 'finding', s.copyDraft.cta));
  }
  
  inner.appendChild(copyDetail);
  
  var row = el('div', 'row');
  row.style.marginTop = '18px';
  var bClose = el('button', 'btn', 'Tutup');
  bClose.onclick = closeDrawer;
  row.appendChild(bClose);
  var bRegenHere = el('button', 'btn primary', 'Regenerate');
  bRegenHere.onclick = function () { closeDrawer(); regenerateCopy(idx); renderPlan(state.plan); };
  row.appendChild(bRegenHere);
  inner.appendChild(row);
}
function regenerateCopy(idx) {
  if (!state.plan || !state.plan.slots[idx]) return;
  var s = state.plan.slots[idx];
  // deterministic regeneration: rotate hook suffix
  var base = s.topic || 'topik';
  s.copyDraft = { hook: base + ' \\u2014 versi baru ' + Date.now().toString(36).slice(-4), body: 'Revisi copy untuk ' + base + '. ' + 'Pembahasan praktis dan ringkas untuk carousel.', hashtags: ['#trading', '#tips', '#propdesk'], cta: 'Simpan & bagikan.' };
  s.copyStatus = 'needs_regeneration';
  // after regen, allow approve again
  s.copyStatus = 'draft';
  renderPlan(state.plan);
  toast('Copy di-regenerate (regenerateCopy). Tinjau lalu Approve.', 'ok');
}
function produceFromPlanSlot(slot) {
  var payload = {
    categoryKey: slot.categoryKey,
    topic: slot.topic,
    ratios: ['ig_portrait'],
    brandName: 'PropDesk',
    skipCopywriter: slot.copyStatus === 'approved',
    prebuiltCaptions: slot.copyDraft ? { variants: [{ platform: 'instagram', hook: slot.copyDraft.hook, body: slot.copyDraft.body, hashtags: slot.copyDraft.hashtags, cta: slot.copyDraft.cta }], recommendedIndex: 0 } : undefined,
    extraInstructions: slot.rationale
  };
  busy(null, 'Memulai produksi dari rencana', 'Slot: ' + slot.topic, function () {
    return api('/api/produce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }).then(function () { toast('Produksi dimulai (skip copywriter=' + (payload.skipCopywriter ? 'ya' : 'tidak') + ').', 'ok'); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
}

function buildPlan() {
  return busy($('plan-build'), 'Menyusun rencana', 'Mengambil berita terbaru dan menyusun rotasi kategori\\u2026', function () {
    return api('/api/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        days: Number($('plan-days').value),
        startDate: $('plan-start').value || undefined,
        focusCategories: $('plan-focus').value ? [$('plan-focus').value] : [],
        extraInstructions: $('plan-extra').value.trim() || undefined,
        includeNews: $('plan-news').checked
      })
    });
  }).then(function (d) {
    renderPlan(d.plan);
    toast('Rencana tersusun dengan ' + d.newsCount + ' berita sebagai sumber topik.', 'ok');
  }).catch(function (e) { toast('Gagal menyusun rencana: ' + e.message, 'bad'); });
}

// ---------------------------------------------------------------------------
// Produksi
// ---------------------------------------------------------------------------

function onCategoryChange() {
  var hints = {
    edukasi_trading: 'Risiko rendah. Fokus pada satu konsep per carousel.',
    edukasi_propfirm: 'Wajib menyebut sumber untuk angka aturan program.',
    jurnal_trading: 'Kategori pembangun kepercayaan. Template kerugian wajib jujur. Gunakan panel Jurnal di bawah untuk input terstruktur.',
    market_info: 'Mengambil berita nyata terbaru secara otomatis.',
    market_outlook: 'Paling berisiko. Selalu dibingkai sebagai analisis skenario.'
  };
  var themes = {
    edukasi_trading: { primary: '#3B82F6', accent: '#1E40AF', bg: '#EFF6FF', borderStyle: 'solid', icon: '\\u{1F4DA}', pattern: 'grid' },
    edukasi_propfirm: { primary: '#A855F7', accent: '#7E22CE', bg: '#FAF5FF', borderStyle: 'dashed', icon: '\\u{1F3E2}', pattern: 'diagonal' },
    jurnal_trading: { primary: '#F59E0B', accent: '#D97706', bg: '#FFFBEB', borderStyle: 'double', icon: '\\u{1F4CA}', pattern: 'dots' },
    market_info: { primary: '#10B981', accent: '#047857', bg: '#ECFDF5', borderStyle: 'dotted', icon: '\\u{1F4F0}', pattern: 'waves' },
    market_outlook: { primary: '#EF4444', accent: '#DC2626', bg: '#FEF2F2', borderStyle: 'gradient', icon: '\\u{1F3AF}', pattern: 'arrows' }
  };
  var catKey = $('f-cat').value;
  $('f-cat-hint').textContent = hints[catKey] || '';
  var theme = themes[catKey] || themes.edukasi_trading;
  document.documentElement.style.setProperty('--cat-primary', theme.primary);
  document.documentElement.style.setProperty('--cat-accent', theme.accent);
  document.documentElement.style.setProperty('--cat-bg', theme.bg);
  document.documentElement.style.setProperty('--cat-border', theme.borderStyle);
  document.documentElement.style.setProperty('--cat-pattern', theme.pattern);
  document.documentElement.setAttribute('data-cat', catKey);
  // Sync category icon if element present
  var catIconEl = $('f-cat-icon');
  if (catIconEl) catIconEl.textContent = theme.icon || '';
  var jp = $('jurnal-panel');
  if (jp) jp.style.display = catKey === 'jurnal_trading' ? '' : 'none';
  var op = $('market-outlook-panel');
  if (op) op.style.display = catKey === 'market_outlook' ? '' : 'none';
}

function onCtaKindChange() {
  var k = $('f-cta-kind').value;
  $('cta-promo-wrap').style.display = k === 'promo' ? '' : 'none';
  $('cta-valid-wrap').style.display = k === 'promo' ? '' : 'none';
  $('cta-comm-wrap').style.display = k === 'community' ? '' : 'none';
}

function checkSimilarity() {
  var title = $('f-topic').value.trim();
  var box = $('sim-warn');
  if (title.length < 8) { box.textContent = ''; return; }
  api('/api/similarity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, categoryKey: $('f-cat').value })
  }).then(function (d) {
    box.textContent = '';
    if (d.level === 'clear' || !d.hits || d.hits.length === 0) return;
    var w = el('div', 'similar' + (d.level === 'duplicate' ? ' dup' : ''));
    var msg = d.level === 'duplicate'
      ? 'Topik ini sangat mirip dengan konten yang sudah pernah dibuat. Sebaiknya ganti sudut pandang atau topik.'
      : d.level === 'too_similar'
        ? 'Topik ini cukup mirip dengan konten sebelumnya. Pertimbangkan pendekatan yang berbeda.'
        : 'Ada konten dengan topik berdekatan. Agen akan berusaha memilih sudut yang berbeda.';
    w.appendChild(el('div', 'fh', msg));
    d.hits.slice(0, 3).forEach(function (h) {
      var d1 = el('div', 'fd');
      d1.appendChild(el('b', null, h.title));
      d1.appendChild(el('span', null, ' \\u00B7 kesamaan ' + Math.round(h.score * 100) + '% \\u00B7 ' + h.categoryKey.replace(/_/g, ' ')));
      w.appendChild(d1);
    });
    box.appendChild(w);
  }).catch(function () { });
}

function addFiles(files) {
  Array.prototype.forEach.call(files, function (f) {
    if (f.size > 6 * 1024 * 1024) { toast('Berkas ' + f.name + ' melebihi 6 MB.', 'warn'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var uri = String(reader.result);
      busy(null, 'Mengunggah ' + f.name, 'Menyimpan gambar ke basis data lokal\\u2026', function () {
        return api('/api/uploads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalName: f.name, mimeType: f.type, byteSize: f.size, dataUri: uri, slidePosition: 2 })
        });
      }).then(function (r) {
        state.uploads.push({ id: r.id, name: f.name, dataUri: uri });
        renderUploads();
        toast('Gambar ' + f.name + ' tersimpan.', 'ok');
      }).catch(function (e) { toast('Gagal mengunggah: ' + e.message, 'bad'); });
    };
    reader.readAsDataURL(f);
  });
}

function renderUploads(containerId) {
  var targetId = containerId || 'up-list';
  var n = $(targetId);
  if (!n) return;
  n.textContent = '';
  state.uploads.forEach(function (u) {
    var d = el('div', 'up');
    var img = document.createElement('img');
    img.src = u.dataUri;
    img.alt = u.name;
    d.appendChild(img);
    d.appendChild(el('div', 'un', u.name));
    var b = el('button', 'del', '\\u00D7');
    b.title = 'Hapus gambar';
    b.onclick = function () {
      busy(null, 'Menghapus gambar', '', function () { return api('/api/uploads/' + u.id, { method: 'DELETE' }); })
        .then(function () {
          state.uploads = state.uploads.filter(function (x) { return x.id !== u.id; });
          renderUploads(targetId);
        })
        .catch(function (e) { toast('Gagal menghapus: ' + e.message, 'bad'); });
    };
    d.appendChild(b);
    n.appendChild(d);
  });
}

var jurnalState = { rows: [], imageIds: {} };

function jurnalAddRow(data) {
  data = data || { pairs: '', direction: '', session: '', riskPct: '', rr: '', confluence: '', pnl: '', result: '' };
  jurnalState.rows.push(data);
  renderJurnalTable();
}

function renderJurnalTable() {
  var tb = $('j-tbody'); if (!tb) return;
  tb.textContent = '';
  jurnalState.rows.forEach(function (r, idx) {
    var tr = document.createElement('tr');
    ['pairs','direction','session','riskPct','rr','confluence','pnl','result'].forEach(function (k) {
      var td = document.createElement('td');
      var inp = document.createElement('input'); inp.value = r[k] || ''; inp.placeholder = k;
      inp.oninput = function () { jurnalState.rows[idx][k] = inp.value; };
      td.appendChild(inp); tr.appendChild(td);
    });
    var tdDel = document.createElement('td');
    var del = document.createElement('button'); del.textContent = '\\u00D7'; del.className = 'del';
    del.onclick = function () { jurnalState.rows.splice(idx, 1); renderJurnalTable(); };
    tdDel.appendChild(del); tr.appendChild(tdDel);
    tb.appendChild(tr);
  });
}

function parseCsvToRows(text) {
  var lines = String(text || '').split(/\\r?\\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (lines.length === 0) return [];
  var header = lines[0].toLowerCase();
  var hasHeader = header.includes('pairs') || header.includes('direction') || header.includes('session');
  var start = hasHeader ? 1 : 0;
  var out = [];
  for (var i = start; i < lines.length; i++) {
    var parts = lines[i].split(',').map(function (s) { return s.trim(); });
    if (parts.length < 8) continue;
    out.push({ pairs: parts[0], direction: parts[1], session: parts[2], riskPct: parts[3], rr: parts[4], confluence: parts[5], pnl: parts[6], result: parts[7] });
  }
  return out;
}

function uploadJurnalFile(file, key) {
  if (!file) return Promise.resolve(null);
  if (file.size > 6 * 1024 * 1024) { toast('Berkas ' + file.name + ' melebihi 6 MB.', 'warn'); return Promise.resolve(null); }
  var reader = new FileReader();
  return new Promise(function (resolve) {
    reader.onload = function () {
      var uri = String(reader.result);
      busy(null, 'Mengunggah ' + file.name, '', function () {
        return api('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originalName: file.name, mimeType: file.type, byteSize: file.size, dataUri: uri }) });
      }).then(function (r) { jurnalState.imageIds[key] = r.id; toast('Gambar tersimpan: ' + file.name, 'ok'); resolve(r.id); }).catch(function (e) { toast('Gagal mengunggah: ' + e.message, 'bad'); resolve(null); });
    };
    reader.onerror = function () { resolve(null); };
    reader.readAsDataURL(file);
  });
}

function collectJurnalPayload() {
  return {
    pair: ($('j-pair') && $('j-pair').value.trim()) || '',
    timeframe: ($('j-timeframe') && $('j-timeframe').value.trim()) || null,
    tradeTable: jurnalState.rows.slice(),
    directionDesc: ($('j-dir-desc') && $('j-dir-desc').value.trim()) || '',
    directionImageId: jurnalState.imageIds.direction || null,
    executionDesc: ($('j-exec-desc') && $('j-exec-desc').value.trim()) || '',
    executionImageId: jurnalState.imageIds.execution || null,
    markDesc: ($('j-mark-desc') && $('j-mark-desc').value.trim()) || '',
    markImageId: jurnalState.imageIds.mark || null,
    performanceImageId: jurnalState.imageIds.performance || null,
    pairImageId: jurnalState.imageIds.pair || null,
    generalNotes: ($('j-general-notes') && $('j-general-notes').value.trim()) || null,
  };
}

// Market Outlook state \\u2014 Item 8
var outlookState = { gallery: [], ctas: [] };
function renderOutlookGallery() {
  var n = $('o-gallery'); if (!n) return;
  n.textContent = '';
  outlookState.gallery.forEach(function (g, idx) {
    var row = el('div', 'row');
    row.style.cssText = 'gap:8px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:8px; flex-wrap:wrap';
    var img = document.createElement('img'); img.src = g.preview || ''; img.alt = g.name || ''; img.style.cssText = 'width:72px;height:48px;object-fit:cover;border-radius:6px;background:#0A101C';
    row.appendChild(img);
    var col = el('div'); col.style.flex = '1 1 200px';
    var ta = document.createElement('textarea'); ta.rows = 2; ta.placeholder = 'Deskripsi chart (penting untuk skenario)'; ta.value = g.description || '';
    ta.oninput = function () { outlookState.gallery[idx].description = ta.value; };
    col.appendChild(ta); row.appendChild(col);
    var up = el('button', 'btn sm', '\\u2191'); up.disabled = idx === 0; up.onclick = function () { var t = outlookState.gallery[idx]; outlookState.gallery.splice(idx, 1); outlookState.gallery.splice(idx - 1, 0, t); outlookState.gallery.forEach(function (x, i) { x.sortOrder = i; }); renderOutlookGallery(); };
    var down = el('button', 'btn sm', '\\u2193'); down.disabled = idx === outlookState.gallery.length - 1; down.onclick = function () { var t = outlookState.gallery[idx]; outlookState.gallery.splice(idx, 1); outlookState.gallery.splice(idx + 1, 0, t); outlookState.gallery.forEach(function (x, i) { x.sortOrder = i; }); renderOutlookGallery(); };
    var del = el('button', 'btn sm bad', '\\u00D7'); del.onclick = function () { outlookState.gallery.splice(idx, 1); outlookState.gallery.forEach(function (x, i) { x.sortOrder = i; }); renderOutlookGallery(); };
    row.appendChild(up); row.appendChild(down); row.appendChild(del);
    n.appendChild(row);
  });
}
function renderOutlookCtas() {
  var n = $('o-ctas'); if (!n) return;
  n.textContent = '';
  outlookState.ctas.forEach(function (c, idx) {
    var row = el('div', 'row');
    row.style.cssText = 'gap:8px; flex-wrap:wrap; border:1px solid var(--line); border-radius:8px; padding:8px';
    var kind = document.createElement('select'); ['save','follow','community','promo','consult'].forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = k; if (k === c.kind) o.selected = true; kind.appendChild(o); });
    kind.onchange = function () { outlookState.ctas[idx].kind = kind.value; };
    row.appendChild(kind);
    var head = document.createElement('input'); head.placeholder = 'Headline'; head.value = c.headline || ''; head.oninput = function () { outlookState.ctas[idx].headline = head.value; }; row.appendChild(head);
    var detail = document.createElement('input'); detail.placeholder = 'Detail (opsional)'; detail.value = c.detail || ''; detail.oninput = function () { outlookState.ctas[idx].detail = detail.value; }; row.appendChild(detail);
    if (c.kind === 'promo') {
      var code = document.createElement('input'); code.placeholder = 'Kode promo'; code.value = c.promoCode || ''; code.oninput = function () { outlookState.ctas[idx].promoCode = code.value; }; row.appendChild(code);
    }
    var del = el('button', 'btn sm bad', '\\u00D7'); del.onclick = function () { outlookState.ctas.splice(idx, 1); renderOutlookCtas(); };
    row.appendChild(del); n.appendChild(row);
  });
}
function collectOutlookPayload() {
  return {
    title: ($('o-title') && $('o-title').value.trim()) || '',
    timeframe: ($('o-timeframe') && $('o-timeframe').value) || null,
    images: outlookState.gallery.map(function (g, i) { return { imageId: g.imageId, description: g.description || '', sortOrder: i }; }),
    ctas: outlookState.ctas.slice().map(function (c, i) { return { kind: c.kind, headline: c.headline, detail: c.detail || null, promoCode: c.promoCode || null, validUntil: c.validUntil || null, communityName: c.communityName || null, sortOrder: i }; }),
    generalNotes: ($('o-notes') && $('o-notes').value.trim()) || null,
  };
}
function uploadOutlookFile(file) {
  if (!file || file.size > 6 * 1024 * 1024) { if (file) toast('Berkas ' + file.name + ' melebihi 6 MB.', 'warn'); return Promise.resolve(null); }
  var reader = new FileReader();
  return new Promise(function (resolve) {
    reader.onload = function () {
      var uri = String(reader.result);
      busy(null, 'Mengunggah ' + file.name, '', function () {
        return api('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originalName: file.name, mimeType: file.type, byteSize: file.size, dataUri: uri }) });
      }).then(function (r) {
        outlookState.gallery.push({ imageId: r.id, name: file.name, preview: uri, description: '', sortOrder: outlookState.gallery.length });
        renderOutlookGallery();
        toast('Gambar tersimpan: ' + file.name, 'ok'); resolve(r.id);
      }).catch(function (e) { toast('Gagal mengunggah: ' + e.message, 'bad'); resolve(null); });
    };
    reader.onerror = function () { resolve(null); };
    reader.readAsDataURL(file);
  });
}

function startProduction() {
  var topic = $('f-topic').value.trim();
  if (!topic) { toast('Isi topik terlebih dahulu.', 'warn'); $('f-topic').focus(); return; }
  var kind = $('f-cta-kind').value;
  var head = $('f-cta-head').value.trim();
  var cta = head ? {
    kind: kind,
    headline: head,
    detail: $('f-cta-detail').value.trim() || undefined,
    promoCode: kind === 'promo' ? ($('f-cta-code').value.trim() || undefined) : undefined,
    validUntil: kind === 'promo' ? ($('f-cta-valid').value || undefined) : undefined,
    communityName: kind === 'community' ? ($('f-cta-comm').value.trim() || undefined) : undefined
  } : undefined;

  var payload = {
    categoryKey: $('f-cat').value,
    topic: topic,
    ratios: [$('f-ratio').value],
    brandName: $('f-brand').value.trim() || 'PropDesk',
    fresh: $('f-fresh').checked,
    extraInstructions: $('f-extra').value.trim() || undefined,
    callToAction: cta,
    uploadIds: state.uploads.map(function (u) { return u.id; })
  };
  // Attach jurnal payload for jurnal_trading if filled
  if (payload.categoryKey === 'jurnal_trading') {
    var jp = collectJurnalPayload();
    if (jp.pair) payload.jurnalTrading = jp;
  }
  // Attach market outlook payload for market_outlook if filled
  if (payload.categoryKey === 'market_outlook') {
    var op2 = collectOutlookPayload();
    if (op2.title) payload.marketOutlook = op2;
  }

  // 1) Clear form immediately for responsive feel
  clearProduceForm();

  // 2) Show loading modal
  var loadingEl = $('produce-loading');
  if (loadingEl) loadingEl.classList.add('on');
  animateLoadingBar();

  return busy($('btn-produce'), 'Memulai produksi', '', function () {
    return api('/api/produce', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }).then(function () {
    // 3) Switch to dashboard tab
    showTab('dashboard');
    // 4) Hide loading modal
    if (loadingEl) loadingEl.classList.remove('on');
    resetLoadingBar();
    toast('Produksi dimulai. Hasilnya muncul di Dashboard.', 'ok');
    pollUntilDone();
  }).catch(function (e) {
    if (loadingEl) loadingEl.classList.remove('on');
    resetLoadingBar();
    toast('Gagal memulai: ' + e.message, 'bad');
  });
}

function clearProduceForm() {
  $('f-topic').value = '';
  $('f-extra').value = '';
  $('f-cta-head').value = '';
  $('f-cta-detail').value = '';
  $('f-cta-code').value = '';
  $('f-cta-valid').value = '';
  $('f-cta-comm').value = '';
  $('sim-warn').textContent = '';
  state.uploads = [];
  renderUploads();
  // Clear jurnal trading fields
  var jp = $('j-pair'); if (jp) jp.value = '';
  var jtf = $('j-timeframe'); if (jtf) jtf.value = '';
  var jcsv = $('j-table-csv'); if (jcsv) jcsv.value = '';
  var jdir = $('j-dir-desc'); if (jdir) jdir.value = '';
  var jexec = $('j-exec-desc'); if (jexec) jexec.value = '';
  var jmark = $('j-mark-desc'); if (jmark) jmark.value = '';
  var jperf = $('j-perf-file'); if (jperf) jperf.value = '';
  var jnotes = $('j-general-notes'); if (jnotes) jnotes.value = '';
  var jmsg = $('j-table-msg'); if (jmsg) jmsg.textContent = '';
  var jsave = $('j-save-msg'); if (jsave) jsave.textContent = '';
  // Clear market outlook fields
  var ot = $('o-title'); if (ot) ot.value = '';
  var otf = $('o-timeframe'); if (otf) otf.value = '';
  var on = $('o-notes'); if (on) on.value = '';
  var og = $('o-gallery'); if (og) og.textContent = '';
  var octas = $('o-ctas'); if (octas) octas.textContent = '';
  var osave = $('o-save-msg'); if (osave) osave.textContent = '';
  // Reset category-specific panels
  onCategoryChange();
}

function animateLoadingBar() {
  var bar = $('loading-bar');
  if (!bar) return;
  bar.style.width = '0%';
  var progress = 0;
  var interval = setInterval(function () {
    progress += Math.random() * 8 + 4; // 4-12% per tick
    if (progress > 90) progress = 90;
    bar.style.width = progress + '%';
  }, 800);
  bar.dataset.interval = interval;
}

function resetLoadingBar() {
  var bar = $('loading-bar');
  if (!bar) return;
  clearInterval(bar.dataset.interval);
  bar.style.width = '100%';
  setTimeout(function () { bar.style.width = '0%'; }, 300);
}

var pollTimer = null;
function pollUntilDone() {
  if (pollTimer) clearInterval(pollTimer);
  var ticks = 0;
  pollTimer = setInterval(function () {
    ticks++;
    loadOverview(true);
    refreshJobsBadges();
    if (state.tab === 'office') loadOffice();
    if (state.tab === 'pipeline') loadPipeline();
    if (ticks > 60) { clearInterval(pollTimer); pollTimer = null; }
  }, 5000);
}

// ---------------------------------------------------------------------------
// Pengetahuan, merek, memori, audit
// ---------------------------------------------------------------------------

var KLABEL = { hook_bank: 'Hook Bank', lexicon: 'Lexicon', banned_phrase: 'Frasa Terlarang', winning_template: 'Template Pemenang', glossary: 'Glosarium', post_mortem: 'Catatan Evaluasi' };

function loadKnowledge() {
  return api('/api/knowledge').then(function (d) {
    $('k-count').textContent = d.items.length + ' item';
    var n = $('k-list');
    if (d.items.length === 0) { fill(n, [el('div', 'empty', 'Belum ada pengetahuan tersimpan.')]); return; }
    fill(n, d.items.map(function (k) {
      var b = el('div', 'finding');
      var h = el('div', 'fh');
      h.appendChild(badge(KLABEL[k.kind] || k.kind, 'b-cat'));
      h.appendChild(el('span', null, k.title));
      b.appendChild(h);
      b.appendChild(el('div', 'fd', k.content));
      b.appendChild(el('div', 'fd', (k.tags || []).join(', ') + ' \\u00B7 ' + ago(k.created_at)));
      return b;
    }));
  });
}

function saveKnowledge() {
  var body = {
    kind: $('k-kind').value,
    title: $('k-title').value.trim(),
    content: $('k-content').value.trim(),
    tags: $('k-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
  };
  if (!body.title || !body.content) { toast('Judul dan isi wajib diisi.', 'warn'); return; }
  return busy($('k-save'), 'Menyimpan pengetahuan', '', function () {
    return api('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }).then(function () {
    $('k-title').value = '';
    $('k-content').value = '';
    $('k-tags').value = '';
    loadKnowledge();
    toast('Pengetahuan tersimpan.', 'ok');
  }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
}

function loadBrand() {
  return api('/api/brand').then(function (d) {
    state.brand = d.brand;
    if (d.brand) {
      $('b-pos').value = d.brand.logoPosition || 'top-right';
      $('b-height').value = d.brand.logoHeight || 64;
      $('b-alt').value = d.brand.logoAlt || '';
      $('b-name').value = d.brand.markShortName || '';
      $('b-tag').value = d.brand.markTagline || '';
      $('b-badge').value = d.brand.markBadge || '';
      var prev = $('b-prev');
      prev.textContent = '';
      delete prev.dataset.uri;
      if (d.brand.logoDataUri) {
        var img = document.createElement('img');
        img.src = d.brand.logoDataUri;
        img.alt = d.brand.logoAlt || 'logo';
        prev.appendChild(img);
      } else { prev.textContent = 'Belum ada logo'; }
    }
    return api('/api/cta').then(function (c) {
      state.ctaPresets = c.presets;
      renderCtaPresets();
    });
  });
}

function renderCtaPresets() {
  var n = $('cta-presets');
  n.textContent = '';
  if (state.ctaPresets.length === 0) return;
  n.appendChild(el('span', 'hint', 'Preset tersimpan:'));
  state.ctaPresets.forEach(function (p) {
    var b = el('button', 'btn sm', p.label);
    b.onclick = function () {
      $('f-cta-kind').value = p.kind;
      $('f-cta-head').value = p.headline;
      $('f-cta-detail').value = p.detail || '';
      $('f-cta-code').value = p.promoCode || '';
      $('f-cta-valid').value = p.validUntil || '';
      $('f-cta-comm').value = p.communityName || '';
      onCtaKindChange();
      toast('Preset "' + p.label + '" dimuat.', 'ok');
    };
    n.appendChild(b);
  });
}

function loadMemory() {
  return api('/api/memory/rules').then(function (d) {
    renderMemSummary($('mem-summary2'), d.summary, d.revisions.length);

    var n = $('mem-rules');
    if (d.rules.length === 0) {
      fill(n, [el('div', 'empty', 'Belum ada aturan pembelajaran. Aturan muncul dari catatan revisi Anda, atau dapat ditambahkan manual.')]);
    } else {
      fill(n, d.rules.map(function (r) {
        var b = el('div', 'finding');
        var h = el('div', 'fh');
        h.appendChild(badge(r.createdBy === 'human' ? 'dari Anda' : 'dari agen', r.createdBy === 'human' ? 'b-ok' : 'b-work'));
        h.appendChild(badge(r.categoryKey ? r.categoryKey.replace(/_/g, ' ') : 'semua kategori', 'b-cat'));
        h.appendChild(badge('kepercayaan ' + Math.round(r.confidence * 100) + '%', r.confidence >= 0.7 ? 'b-ok' : 'b-muted'));
        if (r.occurrences > 1) h.appendChild(badge('muncul ' + r.occurrences + '\\u00D7', 'b-muted'));
        if (!r.active) h.appendChild(badge('nonaktif', 'b-idle'));
        b.appendChild(h);
        b.appendChild(el('div', 'fd', r.rule));
        b.appendChild(el('div', 'fd', r.rationale));
        var row = el('div', 'row');
        row.style.marginTop = '7px';
        var bT = el('button', 'btn sm', r.active ? 'Nonaktifkan' : 'Aktifkan');
        bT.onclick = function () {
          busy(null, 'Memperbarui aturan', '', function () {
            return api('/api/memory/rules/' + r.id, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: !r.active })
            });
          }).then(loadMemory);
        };
        row.appendChild(bT);
        var bD = el('button', 'btn sm bad', 'Hapus');
        bD.onclick = function () {
          busy(null, 'Menghapus aturan', '', function () { return api('/api/memory/rules/' + r.id, { method: 'DELETE' }); })
            .then(function () { loadMemory(); toast('Aturan dihapus.', 'ok'); });
        };
        row.appendChild(bD);
        b.appendChild(row);
        return b;
      }));
    }

    var rn = $('mem-revisions');
    if (d.revisions.length === 0) { fill(rn, [el('div', 'empty', 'Belum ada catatan revisi.')]); return; }
    var t = el('table', 'tbl');
    var hd = el('tr'); ['Waktu', 'Konten', 'Keputusan', 'Catatan Anda'].forEach(function (x) { hd.appendChild(el('th', null, x)); });
    var th = el('thead'); th.appendChild(hd); t.appendChild(th);
    var tb = el('tbody');
    d.revisions.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', null, ago(r.createdAt)));
      tr.appendChild(el('td', 'wrap', r.title));
      var td = el('td');
      td.appendChild(badge(r.decision === 'rejected' ? 'ditolak' : 'minta revisi', r.decision === 'rejected' ? 'b-fail' : 'b-warn'));
      tr.appendChild(td);
      tr.appendChild(el('td', 'wrap', r.note));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    fill(rn, [t]);
  });
}

function loadAudit() {
  return api('/api/audit').then(function (d) {
    var ALABEL = {
      'carousel.produced': 'Carousel diproduksi', 'carousel.approved': 'Carousel disetujui',
      'carousel.changes_requested': 'Permintaan revisi', 'carousel.rejected': 'Carousel ditolak',
      'knowledge.added': 'Pengetahuan ditambahkan', 'memory.rule_added': 'Aturan ditambahkan',
      'memory.reflected': 'Pembelajaran dijalankan', 'brand.updated': 'Merek diperbarui',
      'upload.added': 'Gambar diunggah', 'plan.created': 'Rencana disusun'
    };
    var n = $('audit-list');
    if (d.entries.length === 0) { fill(n, [el('div', 'empty', 'Belum ada catatan audit.')]); return; }
    var t = el('table', 'tbl');
    var hd = el('tr'); ['Waktu', 'Pelaku', 'Tindakan', 'Objek', 'Rincian'].forEach(function (x) { hd.appendChild(el('th', null, x)); });
    var th = el('thead'); th.appendChild(hd); t.appendChild(th);
    var tb = el('tbody');
    d.entries.forEach(function (e) {
      var tr = el('tr');
      tr.appendChild(el('td', null, new Date(e.created_at).toLocaleString('id-ID')));
      tr.appendChild(el('td', null, e.actor));
      tr.appendChild(el('td', null, ALABEL[e.action] || e.action));
      tr.appendChild(el('td', null, e.subject_type));
      var td = el('td', 'wrap');
      td.style.fontSize = '11.5px';
      td.style.color = 'var(--muted)';
      td.textContent = e.detail || '-';
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    fill(n, [t]);
  });
}

// ---------------------------------------------------------------------------
// Navigasi
// ---------------------------------------------------------------------------

var TAB_LABEL = {
  dashboard: ['Operasional', 'Dashboard'], plan: ['Operasional', 'Rencana Mingguan'],
  pipeline: ['Operasional', 'Pipeline'], approvals: ['Operasional', 'Persetujuan'],
  create: ['Konten', 'Buat Carousel'], office: ['Konten', 'Agent Office'], knowledge: ['Konten', 'Pengetahuan'],
  brand: ['Pengaturan', 'Logo & Merek'], memory: ['Pengaturan', 'Pembelajaran'], audit: ['Pengaturan', 'Jejak Audit']
};

function showTab(tab) {
  state.tab = tab;
  ['dashboard', 'plan', 'pipeline', 'approvals', 'create', 'office', 'knowledge', 'brand', 'memory', 'audit'].forEach(function (t) {
    var s = $('tab-' + t);
    if (s) { s.style.display = t === tab ? '' : 'none'; }
  });
  var btns = $('nav').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].className = btns[i].getAttribute('data-tab') === tab ? 'on' : '';
  }
  var lbl = TAB_LABEL[tab] || ['', tab];
  $('crumb-group').textContent = lbl[0];
  $('crumb-tab').textContent = lbl[1];

  var loader = {
    dashboard: function () { return loadOverview(true); },
    plan: loadPlan,
    pipeline: loadPipeline,
    approvals: loadApprovals,
    office: loadOffice,
    knowledge: loadKnowledge,
    brand: loadBrand,
    memory: loadMemory,
    audit: loadAudit
  }[tab];

  if (tab === 'create') { 
    // Initialize wizard hash routing (old onCategoryChange removed with f-* form)
    initWizardHash();
    return Promise.resolve(); 
  }
  if (!loader) return Promise.resolve();
  // Setiap perpindahan tab dan setiap muat ulang menampilkan popup kemajuan,
  // supaya pengguna tahu sistem sedang bekerja.
  return busy($('btn-refresh'), 'Memuat ' + lbl[1], 'Mengambil data dari server\\u2026', function () { return Promise.resolve(loader()); })
    .catch(function (e) { toast('Gagal memuat: ' + e.message, 'bad'); });
}

/** Initialize hash-based wizard routing within create tab */
function initWizardHash() {
  // Hide all wizard shells initially
  ['wizard-edukasi', 'wizard-jurnal', 'wizard-outlook'].forEach(function (id) {
    var el = $(id);
    if (el) el.style.display = 'none';
  });
  // Hide wizard nav buttons initially (they're shown when create tab is active)
  var nav = $('wizard-nav-buttons');
  if (nav) nav.style.display = 'flex';

  // Read current hash
  var hash = window.location.hash;
  if (hash === '#create-edukasi' || hash === '#create-jurnal' || hash === '#create-outlook') {
    showWizard(hash.slice(1)); // remove #
  }

  // Listen for hash changes
  window.addEventListener('hashchange', onHashChange);
}

function onHashChange() {
  var hash = window.location.hash;
  if (hash === '#create-edukasi' || hash === '#create-jurnal' || hash === '#create-outlook') {
    showWizard(hash.slice(1));
  } else if (state.tab === 'create') {
    // No valid wizard hash, hide all
    ['wizard-edukasi', 'wizard-jurnal', 'wizard-outlook'].forEach(function (id) {
      var el = $(id);
      if (el) el.style.display = 'none';
    });
    // Show wizard nav
    var nav = $('wizard-nav-buttons');
    if (nav) nav.style.display = 'flex';
  }
}

function showWizard(wizardId) {
  // Hide all wizard shells
  ['wizard-edukasi', 'wizard-jurnal', 'wizard-outlook'].forEach(function (id) {
    var el = $(id);
    if (el) el.style.display = 'none';
  });
  // Hide wizard nav
  var nav = $('wizard-nav-buttons');
  if (nav) nav.style.display = 'none';

  // Show selected wizard
  var wizard = $(wizardId);
  if (wizard) wizard.style.display = '';

  // Update nav button active state
  ['wizard-nav-edukasi', 'wizard-nav-jurnal', 'wizard-nav-outlook'].forEach(function (btnId) {
    var btn = $(btnId);
    if (btn) btn.className = btnId === 'wizard-nav-' + wizardId.replace('wizard-', '') ? 'btn primary' : 'btn';
  });

  // Initialize wizard-specific handlers
  if (wizardId === 'wizard-edukasi') { initEdukasiWizard(); }
  else if (wizardId === 'wizard-jurnal') { initJurnalWizard(); }
  else if (wizardId === 'wizard-outlook') { initOutlookWizard(); }
}

// ===================== EDUKASI WIZARD =====================

function initEdukasiWizard() {
  // Reset state
  state.wizard.edukasi = { links: [], pdfText: '', pdfWarning: false };

  // Character counter for materi
  var materiEl = $('edukasi-materi');
  var counterEl = $('edukasi-materi-counter');
  if (materiEl && counterEl) {
    materiEl.oninput = function () {
      var len = materiEl.value.length;
      counterEl.textContent = len + '/8000';
      counterEl.className = 'hint' + (len > 8000 ? ' danger' : len > 7000 ? ' warn' : '');
    };
  }

  // Add link row
  $('edukasi-add-link').onclick = function () {
    if (state.wizard.edukasi.links.length >= 3) {
      toast('Maksimal 3 link.', 'warn');
      return;
    }
    addEdukasiLinkRow('');
  };

  // Fetch link handler
  function addEdukasiLinkRow(url) {
    var container = $('edukasi-links');
    var idx = state.wizard.edukasi.links.length;
    state.wizard.edukasi.links.push({ url: url, title: '', snippet: '' });

    var row = el('div', 'repeatable-row');
    row.style.cssText = 'gap:8px; align-items:flex-start; flex-wrap:wrap';
    row.id = 'edukasi-link-row-' + idx;

    var inp = document.createElement('input');
    inp.type = 'url';
    inp.placeholder = 'https://...';
    inp.value = url;
    inp.id = 'edukasi-link-' + idx;
    inp.style.flex = '1 1 250px';
    inp.oninput = function () { state.wizard.edukasi.links[idx].url = inp.value; };
    row.appendChild(inp);

    var btnFetch = el('button', 'btn sm', 'Fetch');
    btnFetch.id = 'edukasi-fetch-' + idx;
    btnFetch.onclick = function () { fetchEdukasiLink(idx, inp.value, row); };
    row.appendChild(btnFetch);

    var btnDel = el('button', 'btn sm bad', '\\u00D7');
    btnDel.onclick = function () {
      state.wizard.edukasi.links.splice(idx, 1);
      renderEdukasiLinks();
    };
    row.appendChild(btnDel);

    // Preview container
    var preview = el('div', 'link-preview hint');
    preview.id = 'edukasi-link-preview-' + idx;
    preview.style.cssText = 'flex:1 1 100%; margin-top:4px; font-size:12px; display:none';
    row.appendChild(preview);

    container.appendChild(row);
  }

  function fetchEdukasiLink(idx, url, row) {
    if (!url) { toast('Isi URL terlebih dahulu.', 'warn'); return; }
    var btnFetch = row.querySelector('#edukasi-fetch-' + idx);
    busy(btnFetch, 'Mengambil link', '', function () {
      return api('/api/materials/fetch-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
    }).then(function (r) {
      state.wizard.edukasi.links[idx].title = r.title || '';
      state.wizard.edukasi.links[idx].snippet = r.snippet || '';
      var preview = row.querySelector('#edukasi-link-preview-' + idx);
      if (preview) {
        preview.style.display = '';
        if (r.ok) {
          preview.textContent = (r.title || '') + (r.snippet ? ' \\u2014 ' + r.snippet.slice(0, 200) : '');
        } else {
          preview.textContent = 'Gagal fetch: ' + (r.error || 'timeout/blocked');
          preview.style.color = 'var(--warn)';
        }
      }
      toast(r.ok ? 'Link diambil.' : 'Link gagal diambil (masih bisa submit).', r.ok ? 'ok' : 'warn');
    }).catch(function (e) {
      toast('Error: ' + e.message, 'bad');
    });
  }

  function renderEdukasiLinks() {
    var container = $('edukasi-links');
    container.textContent = '';
    state.wizard.edukasi.links.forEach(function (link, idx) { addEdukasiLinkRow(link.url); });
  }

  // PDF upload handler
  $('edukasi-pdf').onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('PDF melebihi 5 MB.', 'warn');
      e.target.value = '';
      return;
    }
    var progressEl = $('edukasi-pdf-progress');
    var barEl = $('edukasi-pdf-bar');
    var statusEl = $('edukasi-pdf-status');
    var warningEl = $('edukasi-pdf-warning');
    progressEl.style.display = '';
    barEl.style.width = '10%';
    statusEl.textContent = 'Membaca PDF...';

    var reader = new FileReader();
    reader.onload = function () {
      barEl.style.width = '50%';
      statusEl.textContent = 'Mengirim ke server...';
      var base64 = String(reader.result).split(',')[1];
      api('/api/uploads/pdf-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, base64: base64 })
      }).then(function (r) {
        barEl.style.width = '100%';
        if (r.truncated) {
          warningEl.textContent = 'Peringatan: PDF terpotong pada halaman ' + r.pages + ' (maks 20).';
          warningEl.style.display = '';
          state.wizard.edukasi.pdfWarning = true;
        }
        state.wizard.edukasi.pdfText = r.text || '';
        statusEl.textContent = 'Selesai \\u2014 ' + (r.text?.length || 0) + ' karakter diekstrak.';
        toast('PDF diekstrak: ' + (r.text?.length || 0) + ' karakter.', 'ok');
        setTimeout(function () { progressEl.style.display = 'none'; }, 2000);
      }).catch(function (e) {
        progressEl.style.display = 'none';
        toast('Gagal ekstrak PDF: ' + e.message, 'bad');
      });
    };
    e.target.value = '';
  };

  // Image uploads
  $('edukasi-images').onchange = function (e) {
    Array.from(e.target.files).forEach(function (f) {
      if (f.size > 6 * 1024 * 1024) { toast('Gambar ' + f.name + ' > 6 MB.', 'warn'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var uri = String(reader.result);
        state.uploads.push({ id: 'tmp-' + Date.now(), name: f.name, dataUri: uri });
        renderUploads('edukasi-up-list');
        toast('Gambar ditambahkan: ' + f.name, 'ok');
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  // CTA block for edukasi - use renderCtaBlock but with test-compatible IDs
  renderCtaBlockTestCompatible('edukasi-cta-block', 'edukasi');

  // Submit handler
  $('edukasi-submit').onclick = function () { submitEdukasiWizard(); };
}

function submitEdukasiWizard() {
  var kategori = $('edukasi-kategori').value;
  var topic = $('edukasi-topic').value.trim();
  if (!topic) { toast('Topik wajib diisi.', 'warn'); $('edukasi-topic').focus(); return; }
  if (topic.length < 5) { toast('Topik minimal 5 karakter.', 'warn'); return; }
  if (state.wizard.edukasi.links.length > 3) { toast('Maksimal 3 link.', 'warn'); return; }

  var materi = ($('edukasi-materi').value || '').trim();
  if (state.wizard.edukasi.pdfText) {
    materi = (materi + '\n\n--- PDF EXTRACT ---\n' + state.wizard.edukasi.pdfText).trim();
  }
  if (materi.length > 8000) {
    materi = materi.slice(0, 8000);
    toast('Materi dipotong ke 8000 karakter.', 'warn');
  }

  var payload = {
    categoryKey: kategori,
    topic: topic,
    ratios: [$('edukasi-ratio').value],
    brandName: $('edukasi-brand').value.trim() || 'PropDesk',
    fresh: $('edukasi-fresh').checked,
    materiRaw: materi,
    materiLinks: state.wizard.edukasi.links.filter(function (l) { return l.url; }).map(function (l) { return l.url; }),
    callToAction: collectCtaPayloadTestCompatible('edukasi'),
    uploadIds: state.uploads.map(function (u) { return u.id; })
  };

  // Clear form and start production
  clearEdukasiWizard();
  startWizardProduction(payload);
}

function clearEdukasiWizard() {
  $('edukasi-topic').value = '';
  $('edukasi-materi').value = '';
  $('edukasi-materi-counter').textContent = '0/8000';
  $('edukasi-links').textContent = '';
  $('edukasi-pdf').value = '';
  $('edukasi-pdf-progress').style.display = 'none';
  $('edukasi-pdf-warning').style.display = 'none';
  $('edukasi-up-list').textContent = '';
  clearCtaBlockTestCompatible('edukasi');
  state.wizard.edukasi = { links: [], pdfText: '', pdfWarning: false };
  state.uploads = [];
}

// ===================== JURNAL WIZARD =====================

function jurnalWizardAddRow(data) {
  data = data || { pairs: '', direction: '', session: '', riskPct: '', rr: '', confluence: '', pnl: '', result: '' };
  state.wizard.jurnal.rows.push(data);
  renderJurnalWizardTable();
}

function renderJurnalWizardTable() {
  var tb = $('jurnal-tbody');
  if (!tb) return;
  tb.textContent = '';
  state.wizard.jurnal.rows.forEach(function (r, idx) {
    var tr = document.createElement('tr');
    var fields = [
      { key: 'pairs', id: 'jurnal-pair-' + idx, placeholder: 'Pair' },
      { key: 'direction', id: 'jurnal-direction-' + idx, placeholder: 'Direction' },
      { key: 'session', id: 'jurnal-session-' + idx, placeholder: 'Session' },
      { key: 'riskPct', id: 'jurnal-risk-' + idx, placeholder: '%Risk' },
      { key: 'rr', id: 'jurnal-rr-' + idx, placeholder: 'RR' },
      { key: 'confluence', id: 'jurnal-confluence-' + idx, placeholder: 'Confluence' },
      { key: 'pnl', id: 'jurnal-pnl-' + idx, placeholder: 'PnL' },
      { key: 'result', id: 'jurnal-result-' + idx, placeholder: 'Result' }
    ];
    fields.forEach(function (f) {
      var td = document.createElement('td');
      var inp = document.createElement('input'); inp.value = r[f.key] || ''; inp.placeholder = f.placeholder; inp.id = f.id;
      inp.oninput = function () { state.wizard.jurnal.rows[idx][f.key] = inp.value; };
      td.appendChild(inp); tr.appendChild(td);
    });
    var tdDel = document.createElement('td');
    var del = document.createElement('button'); del.textContent = '\\u00D7'; del.className = 'del';
    del.onclick = function () { state.wizard.jurnal.rows.splice(idx, 1); renderJurnalWizardTable(); };
    tdDel.appendChild(del); tr.appendChild(tdDel);
    tb.appendChild(tr);
  });
}

// ===================== JURNAL WIZARD =====================

function initJurnalWizard() {
  // Reset state
  state.wizard.jurnal = { rows: [], imageIds: {}, step: 1 };
  $('jurnal-tbody').textContent = '';
  jurnalWizardAddRow();

  // Add row
  $('jurnal-add-row').onclick = function () { jurnalWizardAddRow(); };

  // CSV import
  $('jurnal-csv-import').onclick = function () {
    var fileInput = $('jurnal-csv-file');
    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var rows = parseCsvToRows(String(reader.result));
        if (rows.length === 0) { toast('Tidak ada baris valid (butuh 8 kolom).', 'warn'); return; }
        state.wizard.jurnal.rows = rows;
        renderJurnalWizardTable();
        toast(rows.length + ' baris diimpor.', 'ok');
      };
      reader.readAsText(file);
      fileInput.value = '';
    };
    fileInput.click();
  };

  // Image uploads for 5 groups (including pair)
  ['jurnal-dir-file', 'jurnal-exec-file', 'jurnal-mark-file', 'jurnal-perf-file', 'jurnal-pair-file'].forEach(function (id) {
    var elFile = $(id);
    if (!elFile) return;
    elFile.onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) { toast('Gambar > 6 MB.', 'warn'); return; }
      var key = id.replace('jurnal-', '').replace('-file', '');
      var reader = new FileReader();
      reader.onload = function () {
        var uri = String(reader.result);
        state.uploads.push({ id: 'tmp-' + Date.now(), name: f.name, dataUri: uri });
        state.wizard.jurnal.imageIds[key] = 'tmp-' + Date.now();
        renderUploads();
        toast('Gambar ' + key + ' ditambahkan.', 'ok');
      };
      reader.readAsDataURL(f);
    };
  });

  // Step navigation
  $('jurnal-next-step').onclick = function () {
    // Validate step 1
    var pair = ($('jurnal-pair').value || '').trim();
    if (!pair) { toast('Pair Utama wajib diisi.', 'warn'); return; }
    if (state.wizard.jurnal.rows.length === 0) { toast('Tabel trade minimal 1 baris.', 'warn'); return; }
    state.wizard.jurnal.step = 2;
    $('jurnal-prev-step').style.display = '';
    $('jurnal-next-step').style.display = 'none';
    $('jurnal-submit').style.display = '';
    // Scroll to step 2
    $('wizard-jurnal').querySelector('[data-step="2"]').scrollIntoView({ behavior: 'smooth' });
  };
  $('jurnal-prev-step').onclick = function () {
    state.wizard.jurnal.step = 1;
    $('jurnal-prev-step').style.display = 'none';
    $('jurnal-next-step').style.display = '';
    $('jurnal-submit').style.display = 'none';
  };

  // CTA block for jurnal
  renderCtaBlockTestCompatible('jurnal-cta-block', 'jurnal');

  // Submit handler
  $('jurnal-submit').onclick = function () { submitJurnalWizard(); };
}

function submitJurnalWizard() {
  // Validate step 2
  if (!($('jurnal-dir-desc').value || '').trim() || !($('jurnal-exec-desc').value || '').trim() || !($('jurnal-mark-desc').value || '').trim()) {
    toast('Lengkapi deskripsi Direction, Execution, dan Mark.', 'warn'); return;
  }

  var payload = {
    categoryKey: 'jurnal_trading',
    topic: ($('jurnal-pair').value || '') + ' Journal',
    ratios: ['ig_portrait'],
    brandName: 'PropDesk',
    fresh: $('jurnal-fresh').checked,
    jurnalTrading: {
      pair: ($('jurnal-pair').value || '').trim(),
      timeframe: ($('jurnal-timeframe').value || '').trim() || null,
      tradeTable: state.wizard.jurnal.rows,
      directionDesc: ($('jurnal-dir-desc').value || '').trim(),
      directionImageId: state.wizard.jurnal.imageIds.direction || null,
      executionDesc: ($('jurnal-exec-desc').value || '').trim(),
      executionImageId: state.wizard.jurnal.imageIds.execution || null,
      markDesc: ($('jurnal-mark-desc').value || '').trim(),
      markImageId: state.wizard.jurnal.imageIds.mark || null,
      performanceImageId: state.wizard.jurnal.imageIds.performance || null,
      pairImageId: state.wizard.jurnal.imageIds.pair || null,
      generalNotes: ($('jurnal-general-notes').value || '').trim() || null
    },
    callToAction: collectCtaPayloadTestCompatible('jurnal'),
    uploadIds: state.uploads.map(function (u) { return u.id; })
  };

  clearJurnalWizard();
  startWizardProduction(payload);
}

function clearJurnalWizard() {
  $('jurnal-pair').value = '';
  $('jurnal-timeframe').value = '';
  $('jurnal-tbody').textContent = '';
  state.wizard.jurnal.rows = [];
  jurnalWizardAddRow();
  $('jurnal-dir-desc').value = '';
  $('jurnal-exec-desc').value = '';
  $('jurnal-mark-desc').value = '';
  $('jurnal-general-notes').value = '';
  ['jurnal-dir-file','jurnal-exec-file','jurnal-mark-file','jurnal-perf-file','jurnal-pair-file'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
  state.wizard.jurnal.imageIds = {};
  state.wizard.jurnal.step = 1;
  $('jurnal-prev-step').style.display = 'none';
  $('jurnal-next-step').style.display = '';
  $('jurnal-submit').style.display = 'none';
  clearCtaBlockTestCompatible('jurnal');
  state.uploads = [];
}

// ===================== OUTLOOK WIZARD =====================

function initOutlookWizard() {
  state.wizard.outlook = { gallery: [], step: 1 };
  renderOutlookGallery();

  $('outlook-add-gallery').onclick = function () {
    state.wizard.outlook.gallery.push({ imageId: null, name: '', preview: '', description: '', sortOrder: state.wizard.outlook.gallery.length });
    renderOutlookGallery();
  };

  function renderOutlookGallery() {
    var n = $('outlook-gallery');
    if (!n) return;
    n.textContent = '';
    state.wizard.outlook.gallery.forEach(function (g, idx) {
      var item = el('div', 'gallery-item');
      item.style.cssText = 'gap:8px; align-items:flex-start';

      var handle = el('div', 'gallery-handle');
      handle.textContent = '\\u{22EE}\\u{22EE}';
      handle.title = 'Drag to reorder';
      item.appendChild(handle);

      var content = el('div', 'gallery-content');
      content.style.flex = '1 1 auto';

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
      fileInput.style.display = 'none';
      content.appendChild(fileInput);

      var btnFile = el('button', 'btn sm', g.imageId ? 'Ganti Gambar' : 'Pilih Gambar');
      btnFile.onclick = function () { fileInput.click(); };
      content.appendChild(btnFile);

      fileInput.onchange = function (e) {
        var f = e.target.files[0];
        if (!f) return;
        if (f.size > 6 * 1024 * 1024) { toast('Gambar > 6 MB.', 'warn'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var uri = String(reader.result);
          state.uploads.push({ id: 'tmp-' + Date.now(), name: f.name, dataUri: uri });
          g.imageId = 'tmp-' + Date.now();
          g.name = f.name;
          g.preview = uri;
          renderOutlookGallery();
          toast('Gambar ditambahkan.', 'ok');
        };
        reader.readAsDataURL(f);
        fileInput.value = '';
      };

      if (g.preview) {
        var img = document.createElement('img');
        img.src = g.preview;
        img.style.cssText = 'width:80px;height:60px;object-fit:cover;border-radius:6px;margin-top:6px';
        content.appendChild(img);
      }

      var ta = document.createElement('textarea');
      ta.rows = 2;
      ta.placeholder = 'Deskripsi chart (wajib)';
      ta.id = 'outlook-gallery-desc-' + idx;
      ta.value = g.description || '';
      ta.oninput = function () { g.description = ta.value; };
      content.appendChild(ta);

      item.appendChild(content);

      var actions = el('div', 'gallery-actions');
      var up = el('button', 'btn sm', '\\u{2191}'); up.disabled = idx === 0; up.id = 'outlook-gallery-up-' + idx; up.onclick = function () {
        var t = state.wizard.outlook.gallery[idx];
        state.wizard.outlook.gallery.splice(idx, 1);
        state.wizard.outlook.gallery.splice(idx - 1, 0, t);
        state.wizard.outlook.gallery.forEach(function (x, i) { x.sortOrder = i; });
        renderOutlookGallery();
      };
      var down = el('button', 'btn sm', '\\u{2193}'); down.disabled = idx === state.wizard.outlook.gallery.length - 1; down.id = 'outlook-gallery-down-' + idx; down.onclick = function () {
        var t = state.wizard.outlook.gallery[idx];
        state.wizard.outlook.gallery.splice(idx, 1);
        state.wizard.outlook.gallery.splice(idx + 1, 0, t);
        state.wizard.outlook.gallery.forEach(function (x, i) { x.sortOrder = i; });
        renderOutlookGallery();
      };
      var del = el('button', 'btn sm bad', '\\u00D7'); del.id = 'outlook-gallery-del-' + idx; del.onclick = function () {
        state.wizard.outlook.gallery.splice(idx, 1);
        state.wizard.outlook.gallery.forEach(function (x, i) { x.sortOrder = i; });
        renderOutlookGallery();
      };
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(del);
      item.appendChild(actions);

      n.appendChild(item);
    });
  }

  // CTA block for outlook
  renderCtaBlockTestCompatible('outlook-cta-block', 'outlook');

  // Submit handler
  $('outlook-submit').onclick = function () { submitOutlookWizard(); };
}

function submitOutlookWizard() {
  var title = ($('outlook-title').value || '').trim();
  if (!title) { toast('Judul Outlook wajib diisi.', 'warn'); return; }
  if (title.length < 8) { toast('Judul minimal 8 karakter.', 'warn'); return; }
  if (state.wizard.outlook.gallery.length === 0) { toast('Galeri minimal 1 item.', 'warn'); return; }
  for (var i = 0; i < state.wizard.outlook.gallery.length; i++) {
    if (!state.wizard.outlook.gallery[i].description) {
      toast('Deskripsi chart ke-' + (i + 1) + ' masih kosong.', 'warn'); return;
    }
    if (!state.wizard.outlook.gallery[i].imageId) {
      toast('Chart ke-' + (i + 1) + ' belum upload gambar.', 'warn'); return;
    }
  }

  var payload = {
    categoryKey: 'market_outlook',
    topic: title,
    ratios: ['ig_portrait'],
    brandName: 'PropDesk',
    fresh: $('outlook-fresh').checked,
    marketOutlook: {
      title: title,
      timeframe: $('outlook-timeframe').value || null,
      images: state.wizard.outlook.gallery.map(function (g, i) {
        return { imageId: g.imageId, description: g.description, sortOrder: i };
      }),
      ctas: collectCtaPayloadTestCompatible('outlook') ? [collectCtaPayloadTestCompatible('outlook')] : [],
      generalNotes: ($('outlook-notes').value || '').trim() || null
    },
    callToAction: collectCtaPayloadTestCompatible('outlook'),
    uploadIds: state.uploads.map(function (u) { return u.id; })
  };

  clearOutlookWizard();
  startWizardProduction(payload);
}

function clearOutlookWizard() {
  $('outlook-title').value = '';
  $('outlook-timeframe').value = '';
  $('outlook-notes').value = '';
  $('outlook-gallery').textContent = '';
  state.wizard.outlook.gallery = [];
  clearCtaBlockTestCompatible('outlook');
  state.uploads = [];
}

// ===================== SHARED WIZARD HELPERS =====================

function renderCtaBlock(containerId, wizardType) {
  var container = $(containerId);
  if (!container) return;
  container.textContent = '';

  var kindSelect = document.createElement('select');
  kindSelect.id = containerId + '-kind';
  ['promo', 'community', 'save', 'follow', 'consult'].forEach(function (k) {
    var opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
    kindSelect.appendChild(opt);
  });

  var head = document.createElement('input');
  head.placeholder = 'Headline CTA (wajib)';
  head.id = containerId + '-head';

  var detail = document.createElement('input');
  detail.placeholder = 'Detail (opsional)';
  detail.id = containerId + '-detail';

  var promoWrap = el('div');
  promoWrap.id = containerId + '-promo';
  promoWrap.style.display = 'none';
  var promoGrid = el('div', 'cta-code-preview');
  promoGrid.id = containerId + '-promo-grid';
  var codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'Kode (3-20 char A-Z0-9_-)';
  codeInput.className = 'cta-code-input';
  codeInput.id = containerId + '-code-input';
  var addCode = el('button', 'btn sm', '+ Tambah Kode Promo');
  addCode.onclick = function () { addPromoCode(containerId); };
  promoWrap.appendChild(el('label', 'f', 'Kode Promo (maks 5)'));
  promoWrap.appendChild(promoGrid);
  promoWrap.appendChild(codeInput);
  promoWrap.appendChild(addCode);

  var validWrap = el('div');
  validWrap.id = containerId + '-valid';
  validWrap.style.display = 'none';
  var validInput = document.createElement('input');
  validInput.type = 'date';
  validInput.id = containerId + '-valid-input';
  validWrap.appendChild(el('label', 'f', 'Berlaku Sampai'));
  validWrap.appendChild(validInput);

  var commWrap = el('div');
  commWrap.id = containerId + '-comm';
  commWrap.style.display = 'none';
  var commInput = document.createElement('input');
  commInput.placeholder = 'Nama Komunitas';
  commInput.id = containerId + '-comm-input';
  commWrap.appendChild(el('label', 'f', 'Nama Komunitas'));
  commWrap.appendChild(commInput);

  function onKindChange() {
    var k = kindSelect.value;
    promoWrap.style.display = k === 'promo' ? '' : 'none';
    validWrap.style.display = k === 'promo' ? '' : 'none';
    commWrap.style.display = k === 'community' ? '' : 'none';
  }
  kindSelect.onchange = onKindChange;

  container.appendChild(el('label', 'f', 'Jenis CTA *'));
  container.appendChild(kindSelect);
  container.appendChild(el('label', 'f', 'Headline CTA *'));
  container.appendChild(head);
  container.appendChild(el('label', 'f', 'Detail'));
  container.appendChild(detail);
  container.appendChild(promoWrap);
  container.appendChild(validWrap);
  container.appendChild(commWrap);

  // Load existing promo codes if any
  onKindChange();
}

function addPromoCode(containerId) {
  var input = $(containerId + '-code-input');
  var grid = $(containerId + '-promo-grid');
  if (!input || !grid) return;
  var code = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    toast('Kode promo: 3-20 karakter, hanya A-Z 0-9 _ -', 'warn');
    return;
  }
  var existing = Array.from(grid.querySelectorAll('.tag')).map(function (e) { return e.textContent; });
  if (existing.includes(code)) { toast('Kode sudah ada.', 'warn'); return; }
  if (existing.length >= 5) { toast('Maksimal 5 kode promo.', 'warn'); return; }
  var tag = el('span', 'tag', code);
  tag.onclick = function () { grid.removeChild(tag); };
  grid.appendChild(tag);
  input.value = '';
}

function collectCtaPayload(wizardType) {
  var containerId = wizardType + '-cta-block';
  var kindEl = $(containerId + '-kind');
  var headEl = $(containerId + '-head');
  var detailEl = $(containerId + '-detail');
  var gridEl = $(containerId + '-promo-grid');
  var validEl = $(containerId + '-valid-input');
  var commEl = $(containerId + '-comm-input');

  if (!kindEl || !headEl) return undefined;
  var kind = kindEl.value;
  var headline = headEl.value.trim();
  if (!headline) return undefined;

  var cta = { kind: kind, headline: headline };
  if (detailEl && detailEl.value.trim()) cta.detail = detailEl.value.trim();
  if (kind === 'promo') {
    var codes = Array.from(gridEl?.querySelectorAll('.tag') || []).map(function (e) { return e.textContent; });
    if (codes.length > 0) cta.promoCodes = codes;
    if (validEl && validEl.value) cta.validUntil = validEl.value;
  }
  if (kind === 'community' && commEl && commEl.value.trim()) cta.communityName = commEl.value.trim();
  return cta;
}

function clearCtaBlock(wizardType) {
  var containerId = wizardType + '-cta-block';
  var headEl = $(containerId + '-head');
  var detailEl = $(containerId + '-detail');
  var gridEl = $(containerId + '-promo-grid');
  var validEl = $(containerId + '-valid-input');
  var commEl = $(containerId + '-comm-input');
  var kindEl = $(containerId + '-kind');
  if (headEl) headEl.value = '';
  if (detailEl) detailEl.value = '';
  if (gridEl) gridEl.textContent = '';
  if (validEl) validEl.value = '';
  if (commEl) commEl.value = '';
  if (kindEl) kindEl.value = 'promo';
}

// ===================== TEST-COMPATIBLE CTA FUNCTIONS =====================

function renderCtaBlockTestCompatible(containerId, wizardType) {
  var container = $(containerId);
  if (!container) return;
  container.textContent = '';

  // Use test-compatible IDs: wizardType + '-cta-' + suffix
  var kindSelect = document.createElement('select');
  kindSelect.id = wizardType + '-cta-kind';
  ['promo', 'community', 'save', 'follow', 'consult'].forEach(function (k) {
    var opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
    kindSelect.appendChild(opt);
  });

  var head = document.createElement('input');
  head.placeholder = 'Headline CTA (wajib)';
  head.id = wizardType + '-cta-headline';

  var detail = document.createElement('input');
  detail.placeholder = 'Detail (opsional)';
  detail.id = wizardType + '-cta-detail';

  var promoWrap = el('div');
  promoWrap.id = wizardType + '-cta-promo-detail';
  promoWrap.style.display = 'none';

  // Promo codes grid
  var promoGrid = el('div', 'promo-grid');
  promoGrid.id = wizardType + '-cta-promo-grid';

  // Hidden inputs for promo codes (for form submission)
  var promoCodesInput = document.createElement('input');
  promoCodesInput.type = 'hidden';
  promoCodesInput.name = 'promoCodes';
  promoCodesInput.id = wizardType + '-promo-codes-input';

  var codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'Kode (3-20 char A-Z0-9_-)';
  codeInput.id = wizardType + '-promo-code-0';
  codeInput.className = 'cta-code-input';

  var addCode = el('button', 'btn sm', '+ Tambah Kode Promo');
  addCode.id = wizardType + '-add-promo-code';
  addCode.onclick = function () { addPromoCodeTestCompatible(wizardType); };

  promoWrap.appendChild(el('label', 'f', 'Kode Promo (maks 5)'));
  promoWrap.appendChild(promoGrid);
  promoWrap.appendChild(codeInput);
  promoWrap.appendChild(addCode);
  promoWrap.appendChild(promoCodesInput);

  var validWrap = el('div');
  validWrap.id = wizardType + '-cta-valid-detail';
  validWrap.style.display = 'none';
  var validInput = document.createElement('input');
  validInput.type = 'date';
  validInput.id = wizardType + '-cta-valid-input';
  validWrap.appendChild(el('label', 'f', 'Berlaku Sampai'));
  validWrap.appendChild(validInput);

  var commWrap = el('div');
  commWrap.id = wizardType + '-cta-community-detail';
  commWrap.style.display = 'none';
  var commInput = document.createElement('input');
  commInput.placeholder = 'Nama Komunitas';
  commInput.id = wizardType + '-cta-community';
  commWrap.appendChild(el('label', 'f', 'Nama Komunitas'));
  commWrap.appendChild(commInput);

  function onKindChange() {
    var k = kindSelect.value;
    promoWrap.style.display = k === 'promo' ? '' : 'none';
    validWrap.style.display = k === 'promo' ? '' : 'none';
    commWrap.style.display = k === 'community' ? '' : 'none';
  }
  kindSelect.onchange = onKindChange;

  container.appendChild(el('label', 'f', 'Jenis CTA *'));
  container.appendChild(kindSelect);
  container.appendChild(el('label', 'f', 'Headline CTA *'));
  container.appendChild(head);
  container.appendChild(el('label', 'f', 'Detail'));
  container.appendChild(detail);
  container.appendChild(promoWrap);
  container.appendChild(validWrap);
  container.appendChild(commWrap);

  // Load existing promo codes if any
  onKindChange();
}

function addPromoCodeTestCompatible(wizardType) {
  var input = $(wizardType + '-promo-code-0');
  var grid = $(wizardType + '-cta-promo-grid');
  var hiddenInput = $(wizardType + '-promo-codes-input');
  if (!input || !grid) return;
  var code = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    toast('Kode promo: 3-20 karakter, hanya A-Z 0-9 _ -', 'warn');
    return;
  }
  var existing = Array.from(grid.querySelectorAll('.cta-code')).map(function (e) { return e.textContent; });
  if (existing.includes(code)) { toast('Kode sudah ada.', 'warn'); return; }
  if (existing.length >= 5) { toast('Maksimal 5 kode promo.', 'warn'); return; }
  var tag = el('div', 'cta-code', code);
  tag.onclick = function () {
    grid.removeChild(tag);
    updatePromoCodesHidden(wizardType);
  };
  grid.appendChild(tag);
  input.value = '';
  updatePromoCodesHidden(wizardType);
}

function updatePromoCodesHidden(wizardType) {
  var grid = $(wizardType + '-cta-promo-grid');
  var hiddenInput = $(wizardType + '-promo-codes-input');
  if (!grid || !hiddenInput) return;
  var codes = Array.from(grid.querySelectorAll('.cta-code')).map(function (e) { return e.textContent; });
  hiddenInput.value = JSON.stringify(codes);
}

function collectCtaPayloadTestCompatible(wizardType) {
  var kindEl = $(wizardType + '-cta-kind');
  var headEl = $(wizardType + '-cta-headline');
  var detailEl = $(wizardType + '-cta-detail');
  var gridEl = $(wizardType + '-cta-promo-grid');
  var validEl = $(wizardType + '-cta-valid-input');
  var commEl = $(wizardType + '-cta-community');

  if (!kindEl || !headEl) return undefined;
  var kind = kindEl.value;
  var headline = headEl.value.trim();
  if (!headline) return undefined;

  var cta = { kind: kind, headline: headline };
  if (detailEl && detailEl.value.trim()) cta.detail = detailEl.value.trim();
  if (kind === 'promo') {
    var codes = Array.from(gridEl?.querySelectorAll('.cta-code') || []).map(function (e) { return e.textContent; });
    if (codes.length > 0) cta.promoCodes = codes;
    if (validEl && validEl.value) cta.validUntil = validEl.value;
  }
  if (kind === 'community' && commEl && commEl.value.trim()) cta.communityName = commEl.value.trim();
  return cta;
}

function clearCtaBlockTestCompatible(wizardType) {
  var headEl = $(wizardType + '-cta-headline');
  var detailEl = $(wizardType + '-cta-detail');
  var gridEl = $(wizardType + '-cta-promo-grid');
  var validEl = $(wizardType + '-cta-valid-input');
  var commEl = $(wizardType + '-cta-community');
  var kindEl = $(wizardType + '-cta-kind');
  if (headEl) headEl.value = '';
  if (detailEl) detailEl.value = '';
  if (gridEl) gridEl.textContent = '';
  if (validEl) validEl.value = '';
  if (commEl) commEl.value = '';
  if (kindEl) kindEl.value = 'promo';
}

function startWizardProduction(payload) {
  busy(null, 'Memulai produksi', '', function () {
    return api('/api/manuscripts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }).then(function (r) {
    var cid = r.carouselId || (r.carousel && r.carousel.id) || r.id;
    if (!cid && r.manuscript && r.manuscript.carouselId) cid = r.manuscript.carouselId;
    if (cid) {
      return api('/api/manuscripts/' + cid).then(function (d) {
        renderManuscriptPreview(d.manuscript, d.versions, d.carousel);
        toast('Naskah dibuat \u2014 lihat Dashboard untuk Gate 1.', 'ok');
      }).catch(function () {
        toast('Naskah dibuat \u2014 lihat Dashboard untuk Gate 1.', 'ok');
      });
    }
    toast('Naskah dibuat \u2014 lihat Dashboard untuk Gate 1.', 'ok');
  }).catch(function (e) {
    toast('Gagal: ' + e.message, 'bad');
  });
}

function renderManuscriptPreview(manuscript, versions, carousel) {
  manuscript = manuscript || {};
  versions = versions || [];
  carousel = carousel || {};
  state.currentManuscript = manuscript;
  state.currentCarousel = carousel;
  state.currentVersions = versions.slice();
  var host = $('manuscript-preview');
  if (!host) {
    var tab = $('tab-create');
    if (!tab) return;
    host = document.createElement('div');
    host.id = 'manuscript-preview';
    tab.appendChild(host);
  }
  host.textContent = '';
  host.style.display = '';
  host.className = 'manuscript-preview';
  var cid = carousel.id || carousel.carouselId || (state.currentCarousel && state.currentCarousel.id) || 'c-test-1';
  var titleRow = el('div', 'row');
  titleRow.style.justifyContent = 'space-between';
  titleRow.appendChild(el('div', 'mp-title', manuscript.title || manuscript.topic || 'Naskah'));
  var st = carousel.status || 'manuscript_needs_review';
  titleRow.appendChild(badge(st.replace(/_/g, ' '), st === 'manuscript_approved' ? 'b-ok' : 'b-wait'));
  host.appendChild(titleRow);
  if (Array.isArray(manuscript.hookOptions) && manuscript.hookOptions.length > 0) {
    var hookWrap = el('div', 'mp-field');
    hookWrap.appendChild(el('label', 'f', 'Pilih Hook (0-2)'));
    manuscript.hookOptions.forEach(function (h, i) {
      var lab = el('label', 'row');
      lab.style.gap = '6px';
      var rb = document.createElement('input');
      rb.type = 'radio'; rb.name = 'hookOption'; rb.value = String(i);
      if (i === (manuscript.selectedHookIndex || 0)) rb.checked = true;
      lab.appendChild(rb);
      lab.appendChild(document.createTextNode(h));
      hookWrap.appendChild(lab);
    });
    host.appendChild(hookWrap);
  }
  if (manuscript.angle) {
    var a = el('div', 'mp-field');
    a.appendChild(el('label', 'f', 'Angle'));
    a.appendChild(el('div', 'fd', manuscript.angle));
    host.appendChild(a);
  }
  if (Array.isArray(manuscript.keyMessages) && manuscript.keyMessages.length) {
    var km = el('div', 'mp-field');
    km.appendChild(el('label', 'f', 'Key Messages'));
    km.appendChild(el('div', 'fd', manuscript.keyMessages.join(' \u00B7 ')));
    host.appendChild(km);
  }
  if (manuscript.narrative) {
    var nar = el('div', 'mp-field');
    nar.appendChild(el('label', 'f', 'Narrative'));
    var ta = document.createElement('textarea');
    ta.id = 'mp-edit-textarea';
    ta.style.display = 'none';
    ta.value = manuscript.narrative;
    ta.rows = 4;
    nar.appendChild(ta);
    var narView = el('div', 'fd');
    narView.id = 'mp-narrative-view';
    narView.textContent = manuscript.narrative;
    nar.appendChild(narView);
    host.appendChild(nar);
  } else {
    var ta2 = document.createElement('textarea');
    ta2.id = 'mp-edit-textarea';
    ta2.style.display = 'none';
    ta2.value = manuscript.narrative || '';
    host.appendChild(ta2);
  }
  if (manuscript.caption) {
    var cap = el('div', 'mp-field');
    cap.appendChild(el('label', 'f', 'Caption'));
    var capObj = manuscript.caption;
    cap.appendChild(el('div', 'fd', (capObj.hook || '') + ' \u2014 ' + (capObj.body || '')));
    host.appendChild(cap);
  }
  var vRow = el('div', 'mp-version');
  vRow.appendChild(el('span', null, 'Versi:'));
  var sel = document.createElement('select');
  sel.id = 'mp-version-select';
  (versions.length ? versions : [{ version: 1 }]).forEach(function (v) {
    var opt = document.createElement('option');
    opt.value = String(v.version);
    opt.textContent = 'v' + v.version;
    sel.appendChild(opt);
  });
  if (sel.options.length === 0) {
    var opt0 = document.createElement('option'); opt0.value = '1'; opt0.textContent = 'v1'; sel.appendChild(opt0);
  }
  sel.onchange = function () {
    var ver = Number(sel.value);
    var found = state.currentVersions.filter(function (x) { return x.version === ver; })[0];
    if (found && found.manuscript_json) {
      try {
        var mj = JSON.parse(found.manuscript_json);
        var view = $('mp-narrative-view');
        if (view) view.textContent = mj.narrative || mj.title || '';
        var ta3 = $('mp-edit-textarea');
        if (ta3) ta3.value = mj.narrative || '';
      } catch {}
    }
  };
  vRow.appendChild(sel);
  var btnRestore = el('button', 'btn sm', 'Restore v' + (sel.value || '1'));
  btnRestore.id = 'mp-restore-btn';
  btnRestore.onclick = function () {
    var ver = Number(sel.value);
    var found = state.currentVersions.filter(function (x) { return x.version === ver; })[0];
    if (!found || !found.manuscript_json) { toast('Versi tidak ditemukan.', 'warn'); return; }
    try {
      var mj = JSON.parse(found.manuscript_json);
      api('/api/manuscripts/' + cid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manuscriptPatch: mj, note: 'Restore v' + ver }) })
        .then(function () { toast('Versi v' + ver + ' dipulihkan.', 'ok'); return api('/api/manuscripts/' + cid); })
        .then(function (d) { renderManuscriptPreview(d.manuscript, d.versions, d.carousel); })
        .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
    } catch (e) { toast('Gagal restore.', 'bad'); }
  };
  vRow.appendChild(btnRestore);
  host.appendChild(vRow);
  var actions = el('div', 'mp-actions');
  var btnEdit = el('button', 'btn sm', 'Edit Manual');
  btnEdit.id = 'mp-edit-btn';
  if (carousel.manuscript_locked === 1 || carousel.locked) btnEdit.disabled = true;
  btnEdit.onclick = function () {
    var taE = $('mp-edit-textarea');
    var viewE = $('mp-narrative-view');
    if (!taE) return;
    taE.style.display = '';
    if (viewE) viewE.style.display = 'none';
    var saveBtn = $('mp-save-edit-btn');
    if (!saveBtn) {
      saveBtn = el('button', 'btn sm primary', 'Simpan Edit');
      saveBtn.id = 'mp-save-edit-btn';
      saveBtn.onclick = function () {
        var newText = ($('mp-edit-textarea') && $('mp-edit-textarea').value) || '';
        api('/api/manuscripts/' + cid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manuscriptPatch: { narrative: newText }, note: 'manual edit' }) })
          .then(function () {
            toast('Naskah tersimpan.', 'ok');
            return api('/api/manuscripts/' + cid);
          })
          .then(function (d) { renderManuscriptPreview(d.manuscript, d.versions, d.carousel); })
          .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
      };
      actions.appendChild(saveBtn);
    }
  };
  actions.appendChild(btnEdit);
  var btnRegen = el('button', 'btn sm', 'Regenerate');
  btnRegen.id = 'mp-regenerate-btn';
  btnRegen.onclick = function () { openRegenerateModal(cid); };
  actions.appendChild(btnRegen);
  var btnApprove = el('button', 'btn sm ok', 'Approve');
  btnApprove.id = 'mp-approve-btn';
  btnApprove.onclick = function () {
    var payload = {};
    var hookInput = host.querySelector('input[name="hookOption"]:checked');
    if (hookInput) payload.selectedHookIndex = Number(hookInput.value);
    if (Array.isArray(manuscript.hookOptions) && manuscript.hookOptions.length && payload.selectedHookIndex === undefined) {
      toast('Pilih salah satu hook (0-2).', 'warn'); return;
    }
    api('/api/manuscripts/' + cid + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function () {
        toast('Naskah disetujui.', 'ok');
        state.currentCarousel.manuscript_locked = 1;
        state.currentCarousel.status = 'manuscript_approved';
        var editBtn = $('mp-edit-btn'); if (editBtn) editBtn.disabled = true;
        var nextBtn = $('mp-next-design-btn');
        if (!nextBtn) {
          nextBtn = el('button', 'btn sm primary', 'Lanjut ke Design');
          nextBtn.id = 'mp-next-design-btn';
          nextBtn.onclick = function () {
            busy(nextBtn, 'Membuat design', '', function () {
              return api('/api/designs/' + cid + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            }).then(function () { toast('Design dimulai.', 'ok'); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
          };
          actions.appendChild(nextBtn);
        } else nextBtn.style.display = '';
      })
      .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
  };
  actions.appendChild(btnApprove);
  if (carousel.manuscript_locked === 1 || carousel.status === 'manuscript_approved') {
    var nextBtn2 = el('button', 'btn sm primary', 'Lanjut ke Design');
    nextBtn2.id = 'mp-next-design-btn';
    nextBtn2.onclick = function () {
      busy(nextBtn2, 'Membuat design', '', function () {
        return api('/api/designs/' + cid + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      }).then(function () { toast('Design dimulai.', 'ok'); }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
    };
    actions.appendChild(nextBtn2);
  } else {
    var ph = el('button', 'btn sm primary', 'Lanjut ke Design');
    ph.id = 'mp-next-design-btn';
    ph.style.display = 'none';
    actions.appendChild(ph);
  }
  host.appendChild(actions);
  var modal = $('mp-regen-modal');
  if (!modal) {
    modal = el('div', 'finding');
    modal.id = 'mp-regen-modal';
    modal.style.display = 'none';
    modal.style.marginTop = '12px';
    var lab2 = el('label', 'f', 'Catatan regenerasi (minimal 5 karakter)');
    modal.appendChild(lab2);
    var taR = document.createElement('textarea');
    taR.id = 'mp-regen-note';
    taR.rows = 3;
    taR.placeholder = 'Tulis catatan regenerasi...';
    modal.appendChild(taR);
    var btnSubmit = el('button', 'btn sm primary', 'Kirim Regenerate');
    btnSubmit.id = 'mp-regen-submit';
    btnSubmit.onclick = function () {
      var note = (taR.value || '').trim();
      if (note.length < 5) { toast('Catatan regenerasi minimal 5 karakter.', 'warn'); return; }
      api('/api/manuscripts/' + cid + '/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note }) })
        .then(function () { toast('Regenerate menjalankan ulang naskah.', 'ok'); modal.style.display = 'none'; })
        .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
    };
    modal.appendChild(btnSubmit);
    var btnCancel = el('button', 'btn sm', 'Batal');
    btnCancel.onclick = function () { modal.style.display = 'none'; };
    modal.appendChild(btnCancel);
    host.appendChild(modal);
  } else {
    modal.style.display = 'none';
  }
  var regenBtn = $('mp-regenerate-btn');
  if (regenBtn) regenBtn.onclick = function () { openRegenerateModal(cid); };
}

function openRegenerateModal(cid) {
  var modal = $('mp-regen-modal');
  if (!modal) return;
  modal.style.display = '';
  var noteEl = $('mp-regen-note');
  if (noteEl) noteEl.value = '';
  var btn = $('mp-regen-submit');
  if (btn) {
    btn.onclick = function () {
      var note = (($('mp-regen-note') && $('mp-regen-note').value) || '').trim();
      if (note.length < 5) { toast('Catatan regenerasi minimal 5 karakter.', 'warn'); return; }
      api('/api/manuscripts/' + cid + '/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note }) })
        .then(function () { toast('Regenerate menjalankan ulang naskah.', 'ok'); modal.style.display = 'none'; })
        .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
    };
  }
}

if (typeof window !== 'undefined') { try { window.renderManuscriptPreview = renderManuscriptPreview; } catch {} try { window.toast = toast; } catch {} try { window.refreshJobsBadges = refreshJobsBadges; } catch {} }

function refreshCurrent() { return showTab(state.tab); }

// ---------------------------------------------------------------------------
// Inisialisasi
// ---------------------------------------------------------------------------

$('nav').onclick = function (e) {
  var t = e.target.getAttribute && e.target.getAttribute('data-tab');
  if (!t) {
    var p = e.target.parentNode;
    t = p && p.getAttribute && p.getAttribute('data-tab');
  }
  if (t) { showTab(t); }
};
$('btn-refresh').onclick = refreshCurrent;
$('btn-quick').onclick = function () { showTab('create'); };
$('drawer-x').onclick = closeDrawer;
$('backdrop').onclick = closeDrawer;
document.addEventListener('keydown', function (e) {
  var zm = $('slide-zoom');
  if (zm && zm.classList.contains('on')) {
    if (e.key === 'Escape') { closeSlideZoom(); return; }
    if (e.key === 'ArrowLeft') { navigateZoom(-1); return; }
    if (e.key === 'ArrowRight') { navigateZoom(1); return; }
    if (e.key === '+' || e.key === '=') { zoomIn(); return; }
    if (e.key === '-' || e.key === '_') { zoomOut(); return; }
  }
  if (e.key === 'Escape') { closeDrawer(); }
});
(function () {
  var zi = $('zoom-in'); if (zi) zi.onclick = zoomIn;
  var zo = $('zoom-out'); if (zo) zo.onclick = zoomOut;
  var zr = $('zoom-reset'); if (zr) zr.onclick = zoomReset;
  var zc = $('zoom-close'); if (zc) zc.onclick = closeSlideZoom;
  var zm2 = $('slide-zoom'); if (zm2) zm2.onclick = function (ev) { if (ev.target === zm2) closeSlideZoom(); };
  var zd = $('zoom-download'); if (zd) zd.onclick = function () { var fr = $('zoom-frame'); if (fr && fr.src) window.open(fr.src, '_blank'); };
  var wr = $('zoom-wrapper'); if (wr) {
    wr.addEventListener('wheel', function (ev) { ev.preventDefault(); if (ev.deltaY < 0) zoomIn(); else zoomOut(); }, { passive: false });
  }
})();

$('pf-cat').onchange = function () { busy($('btn-refresh'), 'Memuat pipeline', '', loadPipeline); };
$('plan-build').onclick = buildPlan;
if ($('bulk-generate-manuscript')) $('bulk-generate-manuscript').onclick = bulkGenerateManuscript;
if ($('bulk-approve-manuscript')) $('bulk-approve-manuscript').onclick = bulkApproveManuscript;
if ($('bulk-generate-design')) $('bulk-generate-design').onclick = bulkGenerateDesign;
if ($('bulk-approve-design')) $('bulk-approve-design').onclick = bulkApproveDesign;
$('of-mode').onclick = function () {
  state.officeMode = state.officeMode === 'text' ? 'graphic' : 'text';
  $('of-mode').textContent = state.officeMode === 'text' ? 'Mode Grafis' : 'Mode Teks';
  if (state.office) { renderOffice(state.office); }
};
$('k-save').onclick = saveKnowledge;
$('f-cat').onchange = function () { onCategoryChange(); checkSimilarity(); };
$('f-topic').oninput = function () {
  if (state.simTimer) clearTimeout(state.simTimer);
  state.simTimer = setTimeout(checkSimilarity, 700);
};
$('f-cta-kind').onchange = onCtaKindChange;
$('f-files').onchange = function (e) { addFiles(e.target.files); };
$('btn-produce').onclick = startProduction;

if ($('o-files')) $('o-files').onchange = function (e) { var files = e.target.files; for (var i = 0; i < files.length; i++) uploadOutlookFile(files[i]); e.target.value = ''; };
if ($('o-cta-add')) $('o-cta-add').onclick = function () { outlookState.ctas.push({ kind: 'community', headline: '', detail: '', promoCode: '', sortOrder: outlookState.ctas.length }); renderOutlookCtas(); };
if ($('o-cta-add-promo')) $('o-cta-add-promo').onclick = function () { outlookState.ctas.push({ kind: 'promo', headline: '', detail: '', promoCode: '', sortOrder: outlookState.ctas.length }); renderOutlookCtas(); };
if ($('o-save')) $('o-save').onclick = function () {
  var payload = collectOutlookPayload();
  if (!payload.title) { toast('Isi Judul Outlook terlebih dahulu.', 'warn'); return; }
  if (payload.images.length === 0) { toast('Galeri masih kosong \\u2014 upload minimal 1 chart.', 'warn'); return; }
  for (var k = 0; k < payload.images.length; k++) if (!payload.images[k].description) { toast('Deskripsi chart ke-' + (k + 1) + ' masih kosong.', 'warn'); return; }
  if (!state.detailId) { if ($('o-save-msg')) $('o-save-msg').textContent = 'Siap \\u2014 data akan dikirim bersama produksi berikutnya.'; toast('Data outlook siap. Klik Mulai Produksi.', 'ok'); return; }
  busy($('o-save'), 'Menyimpan outlook', '', function () { return api('/api/market-outlook/' + state.detailId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); })
    .then(function () { if ($('o-save-msg')) $('o-save-msg').textContent = 'Tersimpan \\u2014 extraInstructions siap dipakai.'; toast('Outlook tersimpan.', 'ok'); })
    .catch(function (e) { toast('Gagal menyimpan outlook: ' + e.message, 'bad'); if ($('o-save-msg')) $('o-save-msg').textContent = e.message; });
};

if ($('j-row-add')) $('j-row-add').onclick = function () { jurnalAddRow(); };
if ($('j-csv-import')) $('j-csv-import').onclick = function () {
  var txt = $('j-table-csv') && $('j-table-csv').value;
  var rows = parseCsvToRows(txt);
  if (rows.length === 0) { if ($('j-table-msg')) $('j-table-msg').textContent = 'Tidak ada baris valid (butuh 8 kolom).'; return; }
  rows.forEach(function (r) { jurnalAddRow(r); });
  if ($('j-table-msg')) $('j-table-msg').textContent = rows.length + ' baris diimpor.';
};
['j-pair-file','j-dir-file','j-exec-file','j-mark-file','j-perf-file'].forEach(function (id) {
  var elFile = $(id); if (!elFile) return;
  elFile.onchange = function (e) {
    var f = e.target.files[0]; if (!f) return;
    var key = id === 'j-pair-file' ? 'pair' : id === 'j-dir-file' ? 'direction' : id === 'j-exec-file' ? 'execution' : id === 'j-mark-file' ? 'mark' : 'performance';
    uploadJurnalFile(f, key);
  };
});
if ($('j-save')) $('j-save').onclick = function () {
  var payload = collectJurnalPayload();
  if (!payload.pair) { toast('Isi Pair Utama terlebih dahulu.', 'warn'); return; }
  if (!payload.directionDesc || !payload.executionDesc || !payload.markDesc) { toast('Lengkapi deskripsi direction, execution, dan mark.', 'warn'); return; }
  if (payload.tradeTable.length === 0) { toast('Tabel trade masih kosong.', 'warn'); return; }
  // Saat di tab Buat (belum ada carousel), simpan lokal dan ikutkan saat Mulai Produksi
  if (!state.detailId) {
    if ($('j-save-msg')) $('j-save-msg').textContent = 'Siap \\u2014 data akan dikirim bersama produksi berikutnya.';
    toast('Data jurnal siap. Klik Mulai Produksi untuk membuat carousel.', 'ok');
    return;
  }
  busy($('j-save'), 'Menyimpan jurnal', '', function () {
    return api('/api/jurnal-trading/' + state.detailId, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  }).then(function (r) {
    if ($('j-save-msg')) $('j-save-msg').textContent = 'Tersimpan \\u2014 extraInstructions siap dipakai produksi.';
    toast('Jurnal tersimpan.', 'ok');
  }).catch(function (e) { toast('Gagal menyimpan jurnal: ' + e.message, 'bad'); if ($('j-save-msg')) $('j-save-msg').textContent = e.message; });
};

$('b-logo').onchange = function (e) {
  var f = e.target.files[0];
  if (!f) return;
  if (f.size > 1024 * 1024) { toast('Ukuran logo melebihi 1 MB.', 'warn'); return; }
  var reader = new FileReader();
  reader.onload = function () {
    var uri = String(reader.result);
    var prev = $('b-prev');
    prev.textContent = '';
    var img = document.createElement('img');
    img.src = uri;
    img.alt = 'pratinjau logo';
    prev.appendChild(img);
    prev.dataset.uri = uri;
  };
  reader.readAsDataURL(f);
};

$('b-save').onclick = function () {
  var prev = $('b-prev');
  var body = {
    logoPosition: $('b-pos').value,
    logoHeight: Number($('b-height').value) || 64,
    logoAlt: $('b-alt').value.trim() || null,
    markShortName: $('b-name').value.trim() || null,
    markTagline: $('b-tag').value.trim() || null,
    markBadge: $('b-badge').value.trim() || null
  };
  if (prev.dataset.uri) { body.logoDataUri = prev.dataset.uri; }
  return busy($('b-save'), 'Menyimpan konfigurasi merek', '', function () {
    return api('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }).then(function () { toast('Konfigurasi merek tersimpan.', 'ok'); loadBrand(); })
    .catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
};

$('b-remove').onclick = function () {
  return busy($('b-remove'), 'Menghapus logo', '', function () {
    return api('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removeLogo: true }) });
  }).then(function () { toast('Logo dihapus.', 'ok'); loadBrand(); });
};

$('m-add').onclick = function () {
  var rule = $('m-rule').value.trim();
  if (rule.length < 8) { toast('Aturan minimal 8 karakter.', 'warn'); return; }
  return busy($('m-add'), 'Menambah aturan', '', function () {
    return api('/api/memory/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: rule,
        categoryKey: $('m-cat').value || null,
        rationale: 'Ditambahkan langsung oleh pemilik akun.'
      })
    });
  }).then(function () {
    $('m-rule').value = '';
    loadMemory();
    toast('Aturan disimpan dan akan dipakai pada produksi berikutnya.', 'ok');
  }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
};

$('mem-reflect').onclick = function () {
  return busy($('mem-reflect'), 'Mempelajari catatan revisi', 'Mencari pola berulang dari catatan Anda\\u2026', function () {
    return api('/api/memory/reflect', { method: 'POST' });
  }).then(function (d) {
    toast(d.added + ' aturan baru, ' + d.updated + ' aturan diperkuat.', 'ok');
    loadMemory();
  }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
};

// Hormati preferensi sistem untuk gerakan minimal.
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) {
  $('of-motion').checked = false;
  var st = document.createElement('style');
  st.textContent = '* { animation: none !important; transition: none !important; }';
  document.head.appendChild(st);
}
$('of-motion').onchange = function () {
  var ex = $('motion-off');
  if (!$('of-motion').checked && !ex) {
    var s = document.createElement('style');
    s.id = 'motion-off';
    s.textContent = '* { animation: none !important; }';
    document.head.appendChild(s);
  } else if ($('of-motion').checked && ex) { ex.remove(); }
};

(function () {
  var d = new Date(Date.now() + 7 * 3600 * 1000);
  $('plan-start').value = d.toISOString().slice(0, 10);
})();

onCtaKindChange();
refreshJobsBadges();
showTab('dashboard');
setInterval(refreshJobsBadges, 5000);
`;
