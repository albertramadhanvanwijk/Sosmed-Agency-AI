/**
 * Fondasi sistem template.
 *
 * Semua template dirender menjadi HTML mandiri (self-contained) yang kemudian
 * difoto oleh Chromium. Aturan penting yang ditegakkan di sini:
 *
 *  - Template MENERIMA DATA, bukan HTML. Seluruh teks dari LLM di-escape.
 *    Ini mencegah injeksi markup sekaligus menjamin konsistensi visual.
 *  - Tidak ada gambar eksternal: latar dibuat dari gradien dan pola CSS
 *    sehingga render tidak bergantung pada jaringan (sesuai keputusan untuk
 *    tidak memakai model gambar).
 *  - Semua ukuran memakai px pada kanvas 1080 agar hasil dapat diprediksi dan
 *    divalidasi sebelum difoto.
 */
import type {
  BrandLogo,
  BrandMark,
  BrandTokens,
  CallToAction,
  CategoryKey,
  Slide,
  SlideRole,
  UploadedImage,
} from '../shared/types.ts';
import { SAFE_AREA, tokensToCssVars, type RatioProfileSpec } from '../shared/theme.ts';
import { themeFor, type CategoryTheme } from './themes.ts';

/** Konteks yang tersedia untuk setiap template. */
export interface TemplateContext {
  tokens: BrandTokens;
  ratio: RatioProfileSpec;
  /** Posisi slide (dimulai dari 1). */
  position: number;
  /** Jumlah seluruh slide. */
  total: number;
  /** Nama merek yang ditampilkan kecil di kaki slide. */
  brandName: string;
  /** Label kategori yang tampil sebagai kicker, mis. "EDUKASI PROPFIRM". */
  categoryLabel: string;
  /** Penanda waktu data, ditampilkan bila ada. */
  asOf?: string;
  /** Teks disclaimer yang harus tampil (dipakai template disclaimer). */
  disclaimerText?: string;
  /** Kategori konten; menentukan tema yang dipakai. */
  categoryKey?: CategoryKey;
  /** Logo yang dipasang pada slide; opsional. */
  logo?: BrandLogo;
  /** Merek teks; opsional. */
  brandMark?: BrandMark;
  /** Ajakan bertindak yang diinginkan; opsional. */
  callToAction?: CallToAction;
  /** Gambar yang diunggah pengguna, dipetakan ke posisi slide. */
  uploadedImages?: UploadedImage[];
}

/** Definisi sebuah template. */
export interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  /** Peran slide yang cocok memakai template ini. */
  supportedRoles: SlideRole[];
  /** Batas karakter yang disarankan; validator memperingatkan bila dilampaui. */
  limits: {
    headlineChars: number;
    bodyChars: number;
    bullets: number;
    bulletChars: number;
  };
  /** Menghasilkan isi slide (tanpa <html> pembungkus). */
  render: (slide: Slide, ctx: TemplateContext) => string;
}

// ---------------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------------

/**
 * Meng-escape karakter HTML. Dipakai untuk SETIAP teks yang berasal dari LLM
 * atau dari pengguna. Tanpa ini, teks seperti "RSI < 30" akan merusak markup.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Menerapkan penekanan pada frasa tertentu tanpa memutus keamanan escaping.
 * Teks di-escape lebih dulu, lalu frasa penekanan dibungkus <em>. Karena
 * pencarian dilakukan pada teks yang sudah di-escape, dan penanda yang
 * disisipkan berasal dari kode kita (bukan dari LLM), markup tetap aman.
 */
export function emphasize(text: string, phrases: string[]): string {
  let out = esc(text);
  for (const raw of phrases) {
    const phrase = esc(raw).trim();
    if (phrase.length < 2) continue;
    // Escape karakter khusus regex pada frasa.
    const pattern = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(pattern, 'gi'), (m) => `<em>${m}</em>`);
  }
  return out;
}

/** Memecah teks menjadi paragraf, membuang baris kosong. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Komponen bersama
// ---------------------------------------------------------------------------

/** Kicker kecil di atas judul: label kategori. */
function kicker(ctx: TemplateContext, text?: string): string {
  const label = text ?? ctx.categoryLabel;
  if (!label) return '';
  return `<div class="kicker">${esc(label)}</div>`;
}

/**
 * Logo merek pada slide.
 *
 * Ukurannya sengaja TIDAK ikut skala tema: logo harus tetap sama besar di semua
 * kategori, karena logo adalah identitas yang tidak boleh berubah-ubah.
 */
function logoBlock(ctx: TemplateContext): string {
  const logo = ctx.logo;
  if (!logo) return '';
  const src = logo.assetPath ? logo.assetPath : logo.inlineSvg ? '' : '';
  // Bila SVG mentah tersedia, dipakai langsung. Bila tidak, dipakai berkas.
  if (logo.inlineSvg) {
    return `<div class="logo" style="height:${logo.heightPx}px">${logo.inlineSvg}</div>`;
  }
  if (src) {
    return `<div class="logo" style="height:${logo.heightPx}px"><img src="${esc(src)}" alt="${esc(logo.altText)}" /></div>`;
  }
  return '';
}

/** Kaki slide: logo, merek, penanda waktu, dan nomor slide. */
function footer(ctx: TemplateContext, opts: { showCounter?: boolean } = {}): string {
  const showCounter = opts.showCounter !== false;
  const theme = ctx.categoryKey ? themeFor(ctx.categoryKey) : null;

  // Kiri: logo bila ada, atau nama merek. Bila keduanya ada, keduanya ditampilkan.
  const left: string[] = [];
  if (ctx.logo && ctx.logo.position === 'bottom-left') left.push(logoBlock(ctx));
  const mark = ctx.brandMark;
  if (mark?.shortName || ctx.brandName) {
    const name = mark?.shortName ?? ctx.brandName;
    const tagline = mark?.tagline ? `<div class="foot-tagline">${esc(mark.tagline)}</div>` : '';
    left.push(`<div class="foot-brand-wrap"><div class="foot-brand">${esc(name)}</div>${tagline}</div>`);
  }

  const asOf = ctx.asOf ? `<div class="foot-asof">Data per ${esc(formatAsOf(ctx.asOf))}</div>` : '';

  let counter = '';
  if (showCounter) {
    const style = theme?.counterStyle ?? 'plain';
    if (style === 'bar') {
      // Gaya batang: batang terisi sebagian menunjukkan posisi slide.
      const pct = Math.round((ctx.position / Math.max(1, ctx.total)) * 100);
      counter = `<div class="foot-counter-bar"><div class="bar"><i style="width:${pct}%"></i></div><span>${ctx.position}/${ctx.total}</span></div>`;
    } else if (style === 'dots') {
      // Gaya titik: satu titik per slide, yang aktif lebih terang.
      const dots = Array.from({ length: Math.min(ctx.total, 12) }, (_, i) =>
        i + 1 === ctx.position ? '<i class="on"></i>' : '<i></i>',
      ).join('');
      counter = `<div class="foot-counter-dots">${dots}</div>`;
    } else {
      counter = `<div class="foot-counter"><span class="cur">${ctx.position}</span><span class="sep">/</span><span class="tot">${ctx.total}</span></div>`;
    }
  }

  return `<footer class="foot">${left.join('')}${asOf}${counter}</footer>`;
}

/**
 * Blok ajakan bertindak.
 *
 * Bentuknya menyesuaikan jenis ajakan: kode promo memerlukan kotak tersendiri
 * agar mudah dibaca dan diketik ulang, sedangkan ajakan bergabung komunitas
 * perlu nama kanal yang ditonjolkan.
 */
function ctaBlock(ctx: TemplateContext): string {
  const cta = ctx.callToAction;
  if (!cta) return '';

  if (cta.kind === 'promo' && cta.promoCode) {
    const valid = cta.validUntil ? `<div class="cta-valid">Berlaku sampai ${esc(formatDateShort(cta.validUntil))}</div>` : '';
    return `
      <div class="cta cta-promo">
        <div class="cta-head">${esc(cta.headline)}</div>
        ${cta.detail ? `<div class="cta-detail">${esc(cta.detail)}</div>` : ''}
        <div class="cta-code">${esc(cta.promoCode)}</div>
        ${valid}
      </div>`;
  }

  if (cta.kind === 'community') {
    return `
      <div class="cta cta-community">
        <div class="cta-head">${esc(cta.headline)}</div>
        ${cta.communityName ? `<div class="cta-community-name">${esc(cta.communityName)}</div>` : ''}
        ${cta.detail ? `<div class="cta-detail">${esc(cta.detail)}</div>` : ''}
      </div>`;
  }

  // save, follow, consult: satu kartu sederhana.
  return `
    <div class="cta">
      <div class="cta-head">${esc(cta.headline)}</div>
      ${cta.detail ? `<div class="cta-detail">${esc(cta.detail)}</div>` : ''}
    </div>`;
}

/** Memformat tanggal pendek untuk batas berlaku promo. */
function formatDateShort(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return value;
  }
}

/**
 * Blok gambar yang diunggah pengguna.
 *
 * Berbeda dari `chartSnapshot` yang hanya menandai tempat, blok ini benar-benar
 * menampilkan berkas yang diunggah. Berkas dilewatkan sebagai data URI sehingga
 * render tetap mandiri.
 */
function uploadedImageBlock(ctx: TemplateContext): string {
  const images = ctx.uploadedImages;
  if (!images || images.length === 0) return '';
  // Ambil gambar yang ditandai untuk slide ini; bila tidak ada yang ditandai,
  // pakai gambar pertama yang belum terpakai pada slide berikutnya.
  const forThisSlide = images.filter((img) => img.slidePosition === ctx.position);
  const chosen = forThisSlide.length > 0 ? forThisSlide : ctx.position === 2 && images[0] && !images[0].slidePosition ? [images[0]] : [];
  if (chosen.length === 0) return '';
  return chosen
    .map(
      (img) => `
      <figure class="img-upload">
        <img src="${esc(img.path)}" alt="${esc(img.caption ?? img.originalName)}" />
        ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}
      </figure>`,
    )
    .join('');
}

/** Memformat penanda waktu menjadi "2 Okt 2026, 08.00 WIB" bila memungkinkan. */
export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(d);
  } catch {
    return iso;
  }
}

/** Latar dekoratif berbasis pola CSS, bukan gambar. */
function decorativeBackground(style: string | undefined): string {
  switch (style) {
    case 'grid':
      return '<div class="deco deco-grid"></div>';
    case 'diagonal':
      return '<div class="deco deco-diagonal"></div>';
    case 'dots':
      return '<div class="deco deco-dots"></div>';
    case 'wave':
      return '<div class="deco deco-wave"></div>';
    case 'none':
      return '';
    default:
      return '<div class="deco deco-glow"></div>';
  }
}

/** Tabel dua kolom atau lebih. */
function tableBlock(columns: string[], rows: string[][]): string {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Deretan kartu angka besar. */
function statTiles(stats: { label: string; value: string; note?: string }[]): string {
  const items = stats
    .map(
      (s) => `
      <div class="stat">
        <div class="stat-value">${esc(s.value)}</div>
        <div class="stat-label">${esc(s.label)}</div>
        ${s.note ? `<div class="stat-note">${esc(s.note)}</div>` : ''}
      </div>`,
    )
    .join('\n');
  // Jumlah kartu ganjil pada grid dua kolom meninggalkan celah di baris
  // terakhir. Kelas berikut membuat kartu terakhir melebar sehingga susunannya
  // tetap terlihat disengaja, bukan seperti tata letak yang rusak.
  const odd = stats.length % 2 === 1 && stats.length > 1 ? ' stat-grid-odd' : '';
  return `<div class="stat-grid${odd}">${items}</div>`;
}

/** Daftar bernomor dengan penanda centang. */
function checklist(items: string[], emphasis: string[]): string {
  const lis = items
    .map(
      (item, i) => `
      <li class="chk">
        <span class="chk-num">${i + 1}</span>
        <span class="chk-text">${emphasize(item, emphasis)}</span>
      </li>`,
    )
    .join('\n');
  return `<ul class="chk-list">${lis}</ul>`;
}

/** Blok visual generik berdasarkan spesifikasi slide. */
function visualBlock(slide: Slide): string {
  const v = slide.visual;
  if (!v) return '';
  switch (v.type) {
    case 'table':
      if (!v.table) return '';
      return tableBlock(v.table.columns, v.table.rows.map((r) => r.cells));
    case 'stat_tile':
      if (!v.stats || v.stats.length === 0) return '';
      return statTiles(v.stats);
    case 'chart_snapshot': {
      const ref = String(v.chartAssetRef ?? '');
      if (ref.startsWith('data:')) {
        const alt = esc(v.altText ?? 'chart');
        return `<div class="chart-slot" style="border:none; padding:0;"><img src="${esc(ref)}" alt="${alt}" style="width:100%;height:auto;max-height:620px;object-fit:contain;border-radius:var(--r-card);display:block;" /></div>`;
      }
      return `<div class="chart-slot"><span>Grafik: ${esc(v.chartAssetRef ?? 'tidak ada berkas')}</span></div>`;
    }
    case 'abstract_bg':
      return '';
    case 'none':
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Dokumen HTML
// ---------------------------------------------------------------------------

/**
 * Tinggi kanvas acuan desain. Seluruh ukuran font pada template ditulis untuk
 * kanvas setinggi ini.
 *
 * MENGAPA INI PENTING
 * Ukuran font memakai satuan yang mengikuti LEBAR kanvas (mis. `6.6vw`). Lebar
 * semua profil kita hampir sama (1080px), tetapi tingginya berbeda jauh. Tanpa
 * penyesuaian, slide yang muat pada kanvas 1350px akan meluap pada kanvas
 * 1080px, karena fontnya tidak ikut mengecil.
 *
 * Solusinya: rendernya diperkecil dengan `zoom` agar ruang tata letaknya selalu
 * setinggi acuan. Dengan begitu satu slide spec dapat dirender ke SEMUA profil
 * tanpa perlu mengubah teksnya.
 */
export const REFERENCE_HEIGHT = 1350;

/**
 * Menghitung faktor skala dan ukuran tata letak untuk sebuah profil.
 *
 * Kanvas yang lebih TINGGI dari acuan tidak diperkecil (kelebihan tinggi adalah
 * ruang tambahan gratis). Hanya kanvas yang lebih PENDEK yang diperkecil.
 */
export function layoutScale(ratio: RatioProfileSpec): {
  scale: number;
  /** Ukuran tata letak sebelum diperkecil. */
  layoutWidth: number;
  layoutHeight: number;
} {
  const scale = Math.min(1, ratio.height / REFERENCE_HEIGHT);
  return {
    scale,
    layoutWidth: Math.round(ratio.width / scale),
    layoutHeight: Math.round(ratio.height / scale),
  };
}

/** CSS dasar yang dipakai seluruh template. */
function baseCss(tokens: BrandTokens, ratio: RatioProfileSpec, theme: CategoryTheme | null = null): string {
  const safe = SAFE_AREA[ratio.key];
  const { scale, layoutWidth, layoutHeight } = layoutScale(ratio);
  // Area aman dihitung terhadap tinggi tata letak, bukan tinggi fisik, supaya
  // tetap proporsional setelah diperkecil.
  const safeTopPx = Math.round((safe.top / 100) * layoutHeight);
  const safeBottomPx = Math.round((safe.bottom / 100) * layoutHeight);
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  html {
    /* Seluruh ukuran di dalam dokumen memakai satuan px pada kanvas acuan.
       Zoom memetakan kanvas acuan itu ke ukuran keluaran yang diminta. */
    ${scale < 1 ? `zoom: ${scale};` : ''}
  }

  html, body {
    width: ${layoutWidth}px;
    height: ${layoutHeight}px;
    overflow: hidden;
  }

  body {
    ${tokensToCssVars(tokens)};
    background: var(--c-bg);
    color: var(--c-text);
    font-family: var(--f-body);
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }

  .slide {
    position: relative;
    width: ${layoutWidth}px;
    height: ${layoutHeight}px;
    display: flex;
    flex-direction: column;
    padding-top: calc(${safeTopPx}px + var(--sp-pad) * 0.6);
    padding-bottom: calc(${safeBottomPx}px + var(--sp-pad) * 0.6);
    padding-left: var(--sp-pad);
    padding-right: var(--sp-pad);
    overflow: hidden;
  }

  /* --- Latar dekoratif: dibuat dari CSS, bukan gambar --- */
  .deco { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
  .deco-glow {
    background:
      radial-gradient(900px 620px at 88% -8%, color-mix(in srgb, var(--c-primary) 26%, transparent), transparent 68%),
      radial-gradient(700px 520px at 6% 104%, color-mix(in srgb, var(--c-accent) 16%, transparent), transparent 70%);
  }
  .deco-grid {
    background-image:
      linear-gradient(color-mix(in srgb, var(--c-border) 60%, transparent) var(--bw), transparent var(--bw)),
      linear-gradient(90deg, color-mix(in srgb, var(--c-border) 60%, transparent) var(--bw), transparent var(--bw));
    background-size: 90px 90px;
    opacity: 0.5;
    mask-image: radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 78%);
  }
  .deco-diagonal {
    background-image: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--c-primary) 14%, transparent) 0 4px,
      transparent 4px 34px
    );
    opacity: 0.55;
    mask-image: linear-gradient(200deg, #000 0%, transparent 62%);
  }
  .deco-dots {
    background-image: radial-gradient(color-mix(in srgb, var(--c-border) 85%, transparent) 3px, transparent 3px);
    background-size: 46px 46px;
    opacity: 0.55;
    mask-image: radial-gradient(100% 100% at 50% 50%, #000 10%, transparent 72%);
  }
  .deco-wave {
    background:
      radial-gradient(120% 60% at 50% 118%, color-mix(in srgb, var(--c-accent) 24%, transparent), transparent 62%),
      radial-gradient(90% 44% at 50% 128%, color-mix(in srgb, var(--c-primary) 20%, transparent), transparent 58%);
  }

  /* --- Kerangka --- */
  .body-wrap {
    position: relative;
    z-index: 1;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .spacer { flex: 1 1 auto; min-height: 0; }

  .kicker {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-accent);
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .kicker::after {
    content: '';
    flex: 1 1 auto;
    height: var(--bw);
    background: linear-gradient(90deg, color-mix(in srgb, var(--c-accent) 55%, transparent), transparent);
  }

  h1.headline {
    font-family: var(--f-heading);
    font-weight: 800;
    line-height: 1.06;
    letter-spacing: -0.02em;
    margin-top: 30px;
    text-wrap: balance;
  }
  h1.headline em, p em, span em, li em {
    font-style: normal;
    color: var(--c-accent);
    position: relative;
  }

  p, li { font-family: var(--f-body); color: var(--c-text); }

  /* --- Kaki slide --- */
  .foot {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 34px;
    padding-top: 22px;
    border-top: var(--bw) solid color-mix(in srgb, var(--c-border) 80%, transparent);
    font-size: 26px;
    color: var(--c-muted);
  }
  .foot-brand { font-weight: 700; color: color-mix(in srgb, var(--c-text) 78%, transparent); letter-spacing: 0.01em; }
  .foot-asof { margin-left: auto; }
  .foot-counter { display: flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
  .foot-counter .cur { font-weight: 800; color: var(--c-text); }
  .foot-counter .sep, .foot-counter .tot { color: var(--c-muted); }
  .foot-asof + .foot-counter { margin-left: 22px; }

  /* --- Tabel --- */
  .tbl {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: var(--bw) solid var(--c-border);
    border-radius: var(--r-card);
    overflow: hidden;
    font-size: 34px;
  }
  .tbl th {
    background: color-mix(in srgb, var(--c-primary) 22%, var(--c-surface));
    color: var(--c-text);
    font-weight: 800;
    text-align: left;
    padding: 26px 30px;
    font-size: 30px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .tbl td {
    padding: 26px 30px;
    border-top: var(--bw) solid color-mix(in srgb, var(--c-border) 80%, transparent);
    vertical-align: top;
  }
  .tbl tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--c-surface) 46%, transparent); }

  /* --- Kartu statistik --- */
  .stat-grid { display: grid; gap: var(--sp-gap); grid-template-columns: repeat(2, 1fr); }
  /* Jumlah kartu ganjil: kartu terakhir melebar agar tidak ada celah kosong. */
  .stat-grid-odd > .stat:last-child { grid-column: 1 / -1; }
  /* Satu kartu saja: tampilkan sebagai satu kartu lebar penuh. */
  .stat-grid:has(> .stat:only-child) { grid-template-columns: 1fr; }
  .stat {
    background: color-mix(in srgb, var(--c-surface) 82%, transparent);
    border: var(--bw) solid var(--c-border);
    border-radius: var(--r-card);
    padding: 34px 32px;
    position: relative;
    overflow: hidden;
  }
  .stat::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 6px;
    background: linear-gradient(180deg, var(--c-accent), var(--c-primary));
  }
  .stat-value {
    font-family: var(--f-heading);
    font-size: 62px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .stat-label { margin-top: 12px; font-size: 30px; color: var(--c-muted); }
  .stat-note { margin-top: 8px; font-size: 26px; color: color-mix(in srgb, var(--c-muted) 82%, transparent); }

  /* --- Daftar periksa --- */
  .chk-list { list-style: none; display: flex; flex-direction: column; gap: 22px; }
  .chk {
    display: flex;
    align-items: flex-start;
    gap: 22px;
    background: color-mix(in srgb, var(--c-surface) 70%, transparent);
    border: var(--bw) solid var(--c-border);
    border-radius: var(--r-card);
    padding: 26px 28px;
  }
  .chk-num {
    flex: 0 0 auto;
    width: 52px; height: 52px;
    border-radius: 999px;
    background: linear-gradient(145deg, var(--c-accent), var(--c-primary));
    color: #05101f;
    font-weight: 800;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--f-heading);
  }
  .chk-text { font-size: 34px; line-height: 1.36; padding-top: 4px; }

  /* --- Blok lain --- */
  .card {
    background: color-mix(in srgb, var(--c-surface) 82%, transparent);
    border: var(--bw) solid var(--c-border);
    border-radius: var(--r-card);
    padding: 36px 38px;
  }
  .chart-slot {
    border: 3px dashed color-mix(in srgb, var(--c-border) 90%, transparent);
    border-radius: var(--r-card);
    padding: 40px;
    text-align: center;
    color: var(--c-muted);
    font-size: 30px;
  }
  .callout {
    border-left: 8px solid var(--c-accent);
    background: color-mix(in srgb, var(--c-accent) 10%, transparent);
    border-radius: 0 var(--r-badge) var(--r-badge) 0;
    padding: 28px 32px;
    font-size: 34px;
    line-height: 1.4;
  }
  .disclaimer-box {
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: var(--bw) solid color-mix(in srgb, var(--c-border) 90%, transparent);
    border-radius: var(--r-card);
    padding: 34px 36px;
    font-size: 30px;
    line-height: 1.5;
    color: color-mix(in srgb, var(--c-text) 80%, transparent);
  }
  .disclaimer-box .dtitle {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c-accent);
    margin-bottom: 16px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 12px 22px;
    border-radius: var(--r-badge);
    background: color-mix(in srgb, var(--c-primary) 20%, transparent);
    border: var(--bw) solid color-mix(in srgb, var(--c-primary) 40%, transparent);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--c-text);
  }
  .badge-warn { background: color-mix(in srgb, var(--c-negative) 18%, transparent); border-color: color-mix(in srgb, var(--c-negative) 45%, transparent); }
  .badge-ok { background: color-mix(in srgb, var(--c-positive) 18%, transparent); border-color: color-mix(in srgb, var(--c-positive) 45%, transparent); }
  .body-lg { font-size: 40px; line-height: 1.44; color: color-mix(in srgb, var(--c-text) 92%, transparent); }
  .body-md { font-size: 36px; line-height: 1.46; color: color-mix(in srgb, var(--c-text) 88%, transparent); }
  .body-lg p + p, .body-md p + p { margin-top: 22px; }
  .num-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .meter {
    height: 16px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c-border) 70%, transparent);
    overflow: hidden;
    flex: 1 1 160px;
  }
  .meter > i { display: block; height: 100%; background: linear-gradient(90deg, var(--c-accent), var(--c-primary)); }

  /* ===================== GAYA PER KATEGORI ===================== */

  /* Strip tepi: penanda kategori yang terlihat dalam sekali lihat. */
  .edge-strip {
    position: absolute; left: 0; top: 0; bottom: 0; width: 12px; z-index: 2;
    background: linear-gradient(180deg, var(--c-accent), color-mix(in srgb, var(--c-primary) 60%, transparent));
  }
  /* Kategori tanpa strip tetap punya aksen tepi tipis sebagai penyeimbang. */
  .slide:not([data-theme]) { padding-left: var(--sp-pad); }

  /* Logo pada sudut atas slide. */
  .logo-corner { position: absolute; top: 34px; right: 46px; z-index: 3; display: flex; align-items: center; }
  .logo-corner[data-pos='top-left'] { left: 46px; right: auto; }
  .logo { display: flex; align-items: center; }
  .logo img, .logo svg { height: 100%; width: auto; max-width: 320px; object-fit: contain; display: block; }

  /* Logo di kaki slide (bila dipilih posisi bawah). */
  .foot .logo { height: 52px; margin-right: 18px; }
  .foot-brand-wrap { display: flex; flex-direction: column; gap: 2px; }
  .foot-tagline { font-size: 20px; color: color-mix(in srgb, var(--c-muted) 85%, transparent); letter-spacing: 0.02em; }

  /* Nomor slide gaya batang. */
  .foot-counter-bar { margin-left: auto; display: flex; align-items: center; gap: 14px; }
  .foot-counter-bar .bar {
    width: 130px; height: 8px; border-radius: 999px; overflow: hidden;
    background: color-mix(in srgb, var(--c-border) 75%, transparent);
  }
  .foot-counter-bar .bar > i { display: block; height: 100%; background: var(--c-accent); }
  .foot-counter-bar span { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--c-muted); }

  /* Nomor slide gaya titik. */
  .foot-counter-dots { margin-left: auto; display: flex; gap: 9px; align-items: center; }
  .foot-counter-dots i {
    width: 10px; height: 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--c-border) 85%, transparent);
  }
  .foot-counter-dots i.on { background: var(--c-accent); width: 26px; border-radius: 999px; }

  /* Sorotan angka menurut gaya kategori. */
  [data-accent-style='bracket'] h1.headline em::before { content: '['; opacity: .6; margin-right: 4px; }
  [data-accent-style='bracket'] h1.headline em::after { content: ']'; opacity: .6; margin-left: 4px; }
  [data-accent-style='marker'] h1.headline em,
  [data-accent-style='marker'] p em,
  [data-accent-style='marker'] li em {
    background: color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 6px; padding: 0 6px; color: var(--c-text);
  }
  [data-accent-style='underline'] h1.headline em,
  [data-accent-style='underline'] p em,
  [data-accent-style='underline'] li em {
    text-decoration: underline; text-decoration-color: var(--c-accent);
    text-decoration-thickness: 6px; text-underline-offset: 8px; color: var(--c-text);
  }
  [data-accent-style='pill'] h1.headline em,
  [data-accent-style='pill'] p em,
  [data-accent-style='pill'] li em {
    background: color-mix(in srgb, var(--c-accent) 20%, transparent);
    border: 2px solid color-mix(in srgb, var(--c-accent) 45%, transparent);
    border-radius: 999px; padding: 2px 14px; color: var(--c-text);
  }
  [data-accent-style='glow'] h1.headline em,
  [data-accent-style='glow'] p em,
  [data-accent-style='glow'] li em {
    color: var(--c-text);
    text-shadow: 0 0 22px color-mix(in srgb, var(--c-accent) 85%, transparent),
                 0 0 46px color-mix(in srgb, var(--c-accent) 45%, transparent);
  }

  /* Sudut tegas untuk tema Regulasi dan Kabar. */
  [data-theme='edukasi_propfirm'] .card,
  [data-theme='edukasi_propfirm'] .stat,
  [data-theme='edukasi_propfirm'] .chk,
  [data-theme='edukasi_propfirm'] .callout { border-radius: 3px; }
  [data-theme='edukasi_propfirm'] .kicker { color: var(--c-primary); }
  [data-theme='market_info'] .kicker { letter-spacing: 0.18em; }

  /* Jurnal: kartu lebih hangat dan membulat. */
  [data-theme='jurnal_trading'] .stat-value { color: var(--c-accent); }
  [data-theme='jurnal_trading'] .card { background: color-mix(in srgb, var(--c-surface) 92%, transparent); }

  /* Outlook: kartu skenario diberi bingkai lebih tegas. */
  [data-theme='market_outlook'] .card { border-width: 3px; }
  [data-theme='market_outlook'] .badge { font-weight: 800; }

  /* ===================== AJAKAN BERTINDAK ===================== */

  .cta {
    margin-top: 30px;
    background: color-mix(in srgb, var(--c-surface) 88%, transparent);
    border: var(--bw) solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: var(--r-card);
    padding: 28px 32px;
  }
  .cta-head {
    font-family: var(--f-heading); font-size: 38px; font-weight: 800;
    line-height: 1.24; letter-spacing: -0.01em; color: var(--c-text);
  }
  .cta-detail { margin-top: 10px; font-size: 30px; line-height: 1.4; color: var(--c-muted); }

  /* Promo: kode perlu kotak tersendiri agar mudah dibaca dan diketik ulang. */
  .cta-promo { border-width: 3px; background: color-mix(in srgb, var(--c-accent) 10%, var(--c-surface)); }
  .cta-code {
    margin-top: 18px; display: inline-block;
    font-family: var(--f-heading); font-size: 46px; font-weight: 800;
    letter-spacing: 0.08em; color: #05101F;
    background: linear-gradient(145deg, var(--c-accent), var(--c-primary));
    border-radius: var(--r-badge); padding: 12px 28px;
    font-variant-numeric: tabular-nums;
  }
  .cta-valid { margin-top: 14px; font-size: 26px; color: var(--c-muted); }

  /* Komunitas: nama kanal ditonjolkan. */
  .cta-community-name {
    margin-top: 14px; font-size: 36px; font-weight: 800; color: var(--c-accent);
    letter-spacing: 0.01em;
  }

  /* ===================== GAMBAR YANG DIUNGGAH ===================== */

  .img-upload { margin-top: 30px; display: flex; flex-direction: column; gap: 12px; }
  .img-upload img {
    width: 100%; max-height: 620px; object-fit: contain;
    background: color-mix(in srgb, var(--c-surface) 80%, transparent);
    border: var(--bw) solid var(--c-border);
    border-radius: var(--r-card);
  }
  .img-upload figcaption { font-size: 28px; color: var(--c-muted); text-align: center; }
  `;
}

/** Membungkus isi slide menjadi dokumen HTML mandiri. */
export function buildHtml(slide: Slide, ctx: TemplateContext, template: TemplateDefinition): string {
  const inner = template.render(slide, ctx);
  // Tema kategori dipakai untuk atribut data, sehingga CSS dapat menyesuaikan
  // tampilan tanpa perlu menggandakan seluruh aturan gaya di setiap template.
  const theme = ctx.categoryKey ? themeFor(ctx.categoryKey) : null;
  // Logo di sudut atas ditampilkan terpisah dari kaki slide.
  const topLogo = ctx.logo && ctx.logo.position.startsWith('top') ? logoBlock(ctx) : '';
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.brandMark?.shortName ?? ctx.brandName)} — slide ${ctx.position}</title>
<style>${baseCss(ctx.tokens, ctx.ratio, theme)}</style>
</head>
<body>
  <div class="slide" data-template="${esc(template.slug)}" data-role="${esc(slide.role)}" data-position="${ctx.position}"${theme ? ` data-theme="${esc(theme.key)}" data-accent-style="${esc(theme.accentStyle)}"` : ''}>
    ${decorativeBackground(slide.visual?.abstractStyle ?? theme?.defaultPattern)}
    ${theme?.edgeStrip ? '<div class="edge-strip"></div>' : ''}
    ${topLogo ? `<div class="logo-corner">${topLogo}</div>` : ''}
    <div class="body-wrap">
      ${inner}
      ${uploadedImageBlock(ctx)}
    </div>
    ${footer(ctx)}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Ekspor komponen untuk dipakai berkas template
// ---------------------------------------------------------------------------

export const components = {
  kicker,
  footer,
  tableBlock,
  statTiles,
  checklist,
  visualBlock,
  paragraphs,
  emphasize,
  esc,
  formatAsOf,
  logoBlock,
  ctaBlock,
  uploadedImageBlock,
};
