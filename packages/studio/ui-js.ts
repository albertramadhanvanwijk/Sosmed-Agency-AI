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
  uploads: [], brand: null, ctaPresets: [], simTimer: null
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
  $('load-msg').textContent = msg || 'Memuat…';
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
  ['needs_review', 'Perlu Review'], ['approved', 'Disetujui'], ['changes_requested', 'Minta Revisi'], ['failed', 'Gagal']
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
    if (d.carousels.length === 0) { fill(n, [el('div', 'empty', 'Tidak ada carousel yang menunggu persetujuan.')]); return; }
    fill(n, d.carousels.map(function (c) {
      var box = el('div', 'finding ' + (c.compliance_blocked ? 'block' : ''));
      var h = el('div', 'fh');
      h.appendChild(el('span', null, c.title || c.topic));
      h.appendChild(badge(c.category_key.replace(/_/g, ' '), 'b-cat'));
      if (c.compliance_blocked) h.appendChild(badge('Diblokir kepatuhan', 'b-fail'));
      if (c.revision_round > 0) h.appendChild(badge('perbaikan ke-' + c.revision_round, 'b-work'));
      box.appendChild(h);
      var meta = el('div', 'fd');
      meta.appendChild(el('b', null, 'Ringkasan: '));
      meta.appendChild(el('span', null, (c.compliance_outcome || '-').toUpperCase() + ' · ' + c.slide_count + ' slide · ' + usd(c.cost_usd) + ' · ' + ago(c.updated_at)));
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
  return busy(btn, 'Menyimpan keputusan', 'Sebentar…', function () {
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
  if (!window.confirm('Tolak carousel ini: ' + (c ? (c.title || c.topic) : id) + '?')) return;
  
  var note = prompt('Alasan penolakan (opsional, minimal 5 karakter jika diisi):', '');
  if (note === null) return; // User cancelled
  note = (note || '').trim();
  
  // Validate if note was provided but too short
  if (note.length > 0 && note.length < 5) {
    alert('Alasan harus minimal 5 karakter jika diisi.');
    return;
  }
  
  var btn = null; // No button to animate for rejection
  return busy(btn, 'Menolak carousel', 'Menyimpan…', function () {
    return api('/api/carousels/' + id + '/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected', note: note, autoRevise: false })
    });
  }).then(function () {
    toast('Carousel ditolak' + (note ? ' dengan alasan.' : '.'), 'ok');
    closeDrawer();
    loadApprovals();
    loadOverview(true);
  }).catch(function (e) { toast('Gagal: ' + e.message, 'bad'); });
}

/**
 * Formulir catatan revisi.
 *
 * Catatan WAJIB diisi. Tanpa catatan, agen tidak punya bahan untuk belajar dan
 * kesalahan yang sama akan terulang — inilah inti permintaan pengguna pada
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
      auto ? 'Agen sedang memperbaiki sesuai catatan Anda. Ini memakan 2 sampai 5 menit…' : 'Menyimpan…', function () {
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

function openDetail(id) {
  state.detailId = id;
  openDrawer();
  var inner = $('drawer-i');
  fill(inner, [el('div', 'empty', 'Memuat detail…')]);

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
    meta.textContent = d.slides.length + ' slide · ' + num(c.tokens_in) + '/' + num(c.tokens_out) + ' token · ' + usd(c.cost_usd) + ' · ' + msFmt(c.duration_ms) + ' · dibuat ' + ago(c.created_at);
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
      done.appendChild(el('div', 'fd', 'Status: ' + c.status + (c.approved_at ? ' · ' + ago(c.approved_at) : '') + (c.approval_note ? ' · ' + c.approval_note : '')));
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
        var hold = el('div', 'hold');
        var fr = document.createElement('iframe');
        fr.setAttribute('loading', 'lazy');
        fr.setAttribute('scrolling', 'no');
        fr.title = 'Slide ' + s.position;
        fr.src = '/preview/' + id + '/' + s.position + '?ratio=ig_portrait';
        hold.appendChild(fr);
        th.appendChild(hold);
        var cap = el('div', 'cap');
        cap.appendChild(el('span', null, 'Slide ' + s.position + ' · ' + s.role));
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
var HW = 292, HH = 160, OX = 880, OY = 150;
function iso(c, r) { return { x: OX + (c - r) * HW, y: OY + (c + r) * HH }; }

var SHORT = { strategist: 'ST', research: 'RS', copywriter: 'CW', composer: 'CP', renderer: 'RN', compliance: 'CO', compliance_advisor: 'CA', scheduler: 'SC', analyst: 'AN' };
var ANAME = { strategist: 'Strategist', research: 'Research', copywriter: 'Copywriter', composer: 'Composer', renderer: 'Renderer', compliance: 'Compliance', compliance_advisor: 'Nuansa', scheduler: 'Scheduler', analyst: 'Analyst' };
var AROLE = {
  strategist: 'sudut pandang & pesan kunci', research: 'fakta bersumber + waktu', copywriter: 'caption per platform',
  composer: 'slide spec terstruktur', compliance: 'aturan kode — dapat memblokir', compliance_advisor: 'penilaian model — peringatan',
  renderer: 'HTML → PNG/PDF', scheduler: 'saran waktu tayang', analyst: 'penilaian & aset simpan'
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
        node.title = (ANAME[a.agentKey] || a.agentKey) + ' — ' + (SLABEL[a.status] || a.status) + (a.task ? ': ' + a.task : '');
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
      var tdx = el('td', null, '—');
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

function renderPlan(p) {
  $('plan-meta').textContent = p.periodStart + ' sampai ' + p.periodEnd + ' · ' + p.slots.length + ' slot';
  var out = $('plan-out');
  out.textContent = '';
  var note = el('div', 'finding');
  note.appendChild(el('div', 'fd', p.strategyNote));
  out.appendChild(note);
  if (p.warnings && p.warnings.length > 0) {
    var w = el('div', 'finding block');
    w.style.marginTop = '12px';
    w.appendChild(el('div', 'fh', 'Peringatan'));
    p.warnings.forEach(function (x) { w.appendChild(el('div', 'fd', '• ' + x)); });
    out.appendChild(w);
  }
  var list = el('div');
  list.style.marginTop = '12px';
  p.slots.forEach(function (s) {
    var row = el('div', 'plan-row');
    var dd = el('div', 'plan-date');
    dd.appendChild(el('div', 'd', s.date.slice(5)));
    dd.appendChild(el('div', 'w', s.weekday));
    row.appendChild(dd);
    var body = el('div', 'plan-body');
    body.appendChild(el('div', 'tp', s.topic));
    var meta = el('div', 'row');
    meta.style.marginTop = '4px';
    meta.appendChild(badge(s.categoryKey.replace(/_/g, ' '), 'b-cat'));
    meta.appendChild(badge(s.suggestedTime, 'b-muted'));
    if (s.timeSensitive) meta.appendChild(badge('peka waktu', 'b-wait'));
    body.appendChild(meta);
    body.appendChild(el('div', 'rz', s.rationale));
    row.appendChild(body);
    var act = el('div');
    var b = el('button', 'btn sm primary', 'Produksi');
    b.onclick = function () {
      showTab('create');
      $('f-cat').value = s.categoryKey;
      $('f-topic').value = s.topic;
      $('f-extra').value = 'Topik ini berasal dari rencana mingguan. ' + s.rationale;
      onCategoryChange();
      checkSimilarity();
      toast('Topik dimuat ke formulir produksi.', 'ok');
    };
    act.appendChild(b);
    row.appendChild(act);
    list.appendChild(row);
  });
  out.appendChild(list);
}

function buildPlan() {
  return busy($('plan-build'), 'Menyusun rencana', 'Mengambil berita terbaru dan menyusun rotasi kategori…', function () {
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
    jurnal_trading: 'Kategori pembangun kepercayaan. Template kerugian wajib jujur.',
    market_info: 'Mengambil berita nyata terbaru secara otomatis.',
    market_outlook: 'Paling berisiko. Selalu dibingkai sebagai analisis skenario.'
  };
  var themes = {
    edukasi_trading: { primary: '#3B82F6', accent: '#1E40AF', bg: '#EFF6FF' },
    edukasi_propfirm: { primary: '#A855F7', accent: '#7E22CE', bg: '#FAF5FF' },
    jurnal_trading: { primary: '#F59E0B', accent: '#D97706', bg: '#FFFBEB' },
    market_info: { primary: '#10B981', accent: '#047857', bg: '#ECFDF5' },
    market_outlook: { primary: '#EF4444', accent: '#DC2626', bg: '#FEF2F2' }
  };
  var catKey = $('f-cat').value;
  $('f-cat-hint').textContent = hints[catKey] || '';
  var theme = themes[catKey] || themes.edukasi_trading;
  document.documentElement.style.setProperty('--cat-primary', theme.primary);
  document.documentElement.style.setProperty('--cat-accent', theme.accent);
  document.documentElement.style.setProperty('--cat-bg', theme.bg);
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
      d1.appendChild(el('span', null, ' · kesamaan ' + Math.round(h.score * 100) + '% · ' + h.categoryKey.replace(/_/g, ' ')));
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
      busy(null, 'Mengunggah ' + f.name, 'Menyimpan gambar ke basis data lokal…', function () {
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

function renderUploads() {
  var n = $('up-list');
  n.textContent = '';
  state.uploads.forEach(function (u) {
    var d = el('div', 'up');
    var img = document.createElement('img');
    img.src = u.dataUri;
    img.alt = u.name;
    d.appendChild(img);
    d.appendChild(el('div', 'un', u.name));
    var b = el('button', 'del', '×');
    b.title = 'Hapus gambar';
    b.onclick = function () {
      busy(null, 'Menghapus gambar', '', function () { return api('/api/uploads/' + u.id, { method: 'DELETE' }); })
        .then(function () {
          state.uploads = state.uploads.filter(function (x) { return x.id !== u.id; });
          renderUploads();
        })
        .catch(function (e) { toast('Gagal menghapus: ' + e.message, 'bad'); });
    };
    d.appendChild(b);
    n.appendChild(d);
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

  return busy($('btn-produce'), 'Memulai produksi', 'Pipeline 9 agen sedang berjalan. Ini memakan 2 sampai 5 menit. Anda dapat berpindah tab; kemajuannya terlihat di Dashboard dan Agent Office.', function () {
    return api('/api/produce', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }).then(function () {
    $('produce-msg').textContent = 'Produksi berjalan. Pantau di Dashboard.';
    toast('Produksi dimulai. Hasilnya muncul di Dashboard saat selesai.', 'ok');
    $('f-topic').value = '';
    $('sim-warn').textContent = '';
    state.uploads = [];
    renderUploads();
    pollUntilDone();
  }).catch(function (e) { toast('Gagal memulai: ' + e.message, 'bad'); });
}

var pollTimer = null;
function pollUntilDone() {
  if (pollTimer) clearInterval(pollTimer);
  var ticks = 0;
  pollTimer = setInterval(function () {
    ticks++;
    loadOverview(true);
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
      b.appendChild(el('div', 'fd', (k.tags || []).join(', ') + ' · ' + ago(k.created_at)));
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
        if (r.occurrences > 1) h.appendChild(badge('muncul ' + r.occurrences + '×', 'b-muted'));
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

  if (tab === 'create') { onCategoryChange(); return Promise.resolve(); }
  if (!loader) return Promise.resolve();
  // Setiap perpindahan tab dan setiap muat ulang menampilkan popup kemajuan,
  // supaya pengguna tahu sistem sedang bekerja.
  return busy($('btn-refresh'), 'Memuat ' + lbl[1], 'Mengambil data dari server…', function () { return Promise.resolve(loader()); })
    .catch(function (e) { toast('Gagal memuat: ' + e.message, 'bad'); });
}

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
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); } });

$('pf-cat').onchange = function () { busy($('btn-refresh'), 'Memuat pipeline', '', loadPipeline); };
$('plan-build').onclick = buildPlan;
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
  return busy($('mem-reflect'), 'Mempelajari catatan revisi', 'Mencari pola berulang dari catatan Anda…', function () {
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
showTab('dashboard');
`;
