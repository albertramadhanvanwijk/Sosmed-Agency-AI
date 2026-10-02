/**
 * Delapan template slide.
 *
 * Setiap template hanya mengisi DATA ke dalam kerangka visual. Tidak ada satu
 * pun yang menerima HTML dari model bahasa. Delapan template ini menutupi
 * seluruh kerangka slide dari lima kategori konten.
 */
import type { Slide } from '../shared/types.ts';
import {
  components,
  type TemplateContext,
  type TemplateDefinition,
} from './base.ts';

const { kicker, tableBlock, statTiles, checklist, visualBlock, paragraphs, emphasize, ctaBlock } = components;

// ---------------------------------------------------------------------------
// 1. hook-bold — slide pembuka
// ---------------------------------------------------------------------------

const hookBold: TemplateDefinition = {
  slug: 'hook-bold',
  name: 'Hook Bold',
  description: 'Slide pembuka dengan judul besar dan satu aksen warna. Ruang kosong luas agar terbaca dalam sekali lihat.',
  supportedRoles: ['hook'],
  limits: { headlineChars: 68, bodyChars: 150, bullets: 0, bulletChars: 0 },
  render: (slide, ctx) => `
    ${kicker(ctx)}
    <div class="spacer" style="max-height: 6%"></div>
    <h1 class="headline" style="font-size: clamp(84px, 9.4vw, 116px);">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${slide.body
      ? `<div class="body-lg" style="margin-top: 40px; max-width: 88%; color: var(--c-muted);">${paragraphs(slide.body)}</div>`
      : ''}
    ${slide.visual?.type === 'abstract_bg' ? '' : ''}
    <div class="spacer"></div>
    <div class="num-row">
      <span class="badge">${slide.bullets.length > 0 ? 'Geser →' : 'Baca sampai habis'}</span>
    </div>
  `,
};

// ---------------------------------------------------------------------------
// 2. concept-one-idea — satu konsep per slide
// ---------------------------------------------------------------------------

const conceptOneIdea: TemplateDefinition = {
  slug: 'concept-one-idea',
  name: 'Concept One Idea',
  description: 'Satu konsep dijelaskan tuntas: judul, penjelasan, dan ilustrasi abstrak. Dipakai untuk kategori edukasi.',
  supportedRoles: ['body', 'example'],
  limits: { headlineChars: 56, bodyChars: 380, bullets: 4, bulletChars: 90 },
  render: (slide, ctx) => {
    const hasBullets = slide.bullets.length > 0;
    const hasVisual = slide.visual && slide.visual.type !== 'none' && slide.visual.type !== 'abstract_bg';
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(62px, 6.6vw, 82px); margin-top: 26px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${slide.body
      ? `<div class="body-md" style="margin-top: 30px;">${paragraphs(slide.body)}</div>`
      : ''}
    ${hasVisual ? `<div style="margin-top: 34px;">${visualBlock(slide)}</div>` : ''}
    ${hasBullets ? `<div style="margin-top: 30px;">${checklist(slide.bullets, slide.emphasis)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 3. propfirm-rules-table — tabel perbandingan aturan
// ---------------------------------------------------------------------------

const propfirmRulesTable: TemplateDefinition = {
  slug: 'propfirm-rules-table',
  name: 'Propfirm Rules Table',
  description: 'Tabel perbandingan aturan program. Template dengan tingkat simpan tertinggi untuk kategori edukasi propfirm.',
  supportedRoles: ['body', 'example'],
  limits: { headlineChars: 54, bodyChars: 200, bullets: 0, bulletChars: 0 },
  render: (slide, ctx) => {
    const hasTable = slide.visual?.type === 'table' && slide.visual.table;
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(56px, 5.9vw, 74px); margin-top: 24px; margin-bottom: 32px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${
      hasTable
        ? tableBlock(slide.visual!.table!.columns, slide.visual!.table!.rows.map((r) => r.cells))
        : slide.body
          ? `<div class="card body-md">${paragraphs(slide.body)}</div>`
          : ''
    }
    ${slide.body && hasTable ? `<div class="callout" style="margin-top: 30px;">${paragraphs(slide.body)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 4. journal-stat-tile — statistik jurnal trading
// ---------------------------------------------------------------------------

const journalStatTile: TemplateDefinition = {
  slug: 'journal-stat-tile',
  name: 'Journal Stat Tile',
  description: 'Grid statistik posisi: hasil dalam R, rasio risiko-imbalan, dan ukuran posisi. Dipakai untuk jurnal trading.',
  supportedRoles: ['body', 'example'],
  limits: { headlineChars: 56, bodyChars: 260, bullets: 0, bulletChars: 0 },
  render: (slide, ctx) => {
    const hasStats = slide.visual?.type === 'stat_tile' && slide.visual.stats?.length;
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(56px, 5.9vw, 74px); margin-top: 24px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${hasStats ? `<div style="margin-top: 36px;">${statTiles(slide.visual!.stats!)}</div>` : ''}
    ${slide.body ? `<div class="body-md" style="margin-top: 32px;">${paragraphs(slide.body)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 5. news-why-it-matters — berita dengan penanda waktu
// ---------------------------------------------------------------------------

const newsWhyItMatters: TemplateDefinition = {
  slug: 'news-why-it-matters',
  name: 'News Why It Matters',
  description: 'Struktur berita: apa yang terjadi, mengapa penting, dan dampaknya. Selalu menampilkan penanda waktu data.',
  supportedRoles: ['body', 'example'],
  limits: { headlineChars: 62, bodyChars: 340, bullets: 5, bulletChars: 88 },
  render: (slide, ctx) => {
    const hasBullets = slide.bullets.length > 0;
    const hasVisual = slide.visual && slide.visual.type !== 'none' && slide.visual.type !== 'abstract_bg';
    return `
    ${kicker(ctx)}
    <div style="margin-top: 20px;">
      <span class="badge badge-warn">${ctx.asOf ? `Data per ${components.formatAsOf(ctx.asOf)}` : 'Penanda waktu belum diisi'}</span>
    </div>
    <h1 class="headline" style="font-size: clamp(56px, 5.9vw, 76px); margin-top: 26px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${slide.body ? `<div class="body-md" style="margin-top: 28px;">${paragraphs(slide.body)}</div>` : ''}
    ${hasVisual ? `<div style="margin-top: 28px;">${visualBlock(slide)}</div>` : ''}
    ${hasBullets ? `<div style="margin-top: 28px;">${checklist(slide.bullets, slide.emphasis)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 6. scenario-outlook — dua skenario dengan tingkat invalidasi
// ---------------------------------------------------------------------------

const scenarioOutlook: TemplateDefinition = {
  slug: 'scenario-outlook',
  name: 'Scenario Outlook',
  description: 'Menyajikan dua skenario (A dan B) beserta tingkat invalidasi. Selalu dibingkai sebagai analisis skenario, bukan ajakan bertransaksi.',
  supportedRoles: ['example', 'body'],
  limits: { headlineChars: 58, bodyChars: 300, bullets: 3, bulletChars: 80 },
  render: (slide, ctx) => {
    const bullets = slide.bullets;
    const half = Math.ceil(bullets.length / 2);
    const skenarioA = bullets.slice(0, half);
    const skenarioB = bullets.slice(half);
    const renderScenario = (label: string, items: string[], tone: 'ok' | 'warn') => `
      <div class="card" style="flex: 1 1 0; min-width: 0;">
        <span class="badge ${tone === 'ok' ? 'badge-ok' : 'badge-warn'}">${label}</span>
        ${items.length > 0
          ? `<ul style="list-style:none; margin-top: 22px; display:flex; flex-direction:column; gap:16px;">
               ${items.map((t) => `<li style="font-size:32px; line-height:1.36;">${emphasize(t, slide.emphasis)}</li>`).join('')}
             </ul>`
          : '<div style="margin-top:20px; font-size:30px; color:var(--c-muted);">Belum diisi</div>'}
      </div>`;
    const hasVisual = slide.visual && slide.visual.type !== 'none' && slide.visual.type !== 'abstract_bg';
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(54px, 5.6vw, 72px); margin-top: 22px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${slide.body ? `<div class="body-md" style="margin-top: 22px;">${paragraphs(slide.body)}</div>` : ''}
    ${bullets.length > 0
      ? `<div style="display:flex; gap: var(--sp-gap); margin-top: 30px;">${renderScenario('Skenario A', skenarioA, 'ok')}${renderScenario('Skenario B', skenarioB, 'warn')}</div>`
      : ''}
    ${hasVisual ? `<div style="margin-top: 28px;">${visualBlock(slide)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 7. checklist-numbered — daftar periksa
// ---------------------------------------------------------------------------

const checklistNumbered: TemplateDefinition = {
  slug: 'checklist-numbered',
  name: 'Checklist Numbered',
  description: 'Daftar bernomor yang bisa langsung diterapkan pembaca. Cocok sebagai penutup yang mendorong simpan.',
  supportedRoles: ['checklist'],
  limits: { headlineChars: 52, bodyChars: 120, bullets: 6, bulletChars: 76 },
  render: (slide, ctx) => {
    const items = slide.bullets.length > 0 ? slide.bullets : (slide.body ? slide.body.split(/\n/).filter(Boolean) : []);
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(56px, 5.9vw, 74px); margin-top: 24px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${items.length > 0 ? `<div style="margin-top: 34px;">${checklist(items, slide.emphasis)}</div>` : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 8. recap-takeaway — ringkasan dan ajakan
// ---------------------------------------------------------------------------

const recapTakeaway: TemplateDefinition = {
  slug: 'recap-takeaway',
  name: 'Recap Takeaway',
  description: 'Ringkasan tiga poin utama dengan ajakan menyimpan. Dipakai sebagai slide penutup sebelum disclaimer.',
  supportedRoles: ['recap', 'cta'],
  limits: { headlineChars: 48, bodyChars: 200, bullets: 4, bulletChars: 70 },
  render: (slide, ctx) => {
    const points = slide.bullets;
    // Slide dengan peran cta menampilkan blok ajakan bertindak yang dikonfigurasi
    // pengguna. Bila tidak ada konfigurasi, dipakai ajakan bawaan dari isi slide.
    const isCta = slide.role === 'cta';
    return `
    ${kicker(ctx)}
    <h1 class="headline" style="font-size: clamp(58px, 6.2vw, 78px); margin-top: 24px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    ${points.length > 0
      ? `<ul style="list-style:none; margin-top: 36px; display:flex; flex-direction:column; gap: 24px;">
          ${points
            .map(
              (p) => `<li style="display:flex; gap:20px; align-items:flex-start;">
                        <span style="flex:0 0 auto; width:16px; height:16px; margin-top:14px; border-radius:4px; background:var(--c-accent);"></span>
                        <span style="font-size:38px; line-height:1.34;">${emphasize(p, slide.emphasis)}</span>
                      </li>`,
            )
            .join('')}
        </ul>`
      : ''}
    ${slide.body && !(isCta && ctx.callToAction) ? `<div class="body-md" style="margin-top: 30px;">${paragraphs(slide.body)}</div>` : ''}
    ${isCta && ctx.callToAction ? ctaBlock(ctx) : ''}
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------
// 9. disclaimer-note — kotak disclaimer wajib
// ---------------------------------------------------------------------------

const disclaimerNote: TemplateDefinition = {
  slug: 'disclaimer-note',
  name: 'Disclaimer Note',
  description: 'Kotak disclaimer kepatuhan. Wajib ada pada setiap carousel, dengan teks yang dapat diperbarui tanpa mengubah template.',
  supportedRoles: ['disclaimer'],
  limits: { headlineChars: 60, bodyChars: 700, bullets: 0, bulletChars: 0 },
  render: (slide, ctx) => {
    const text = ctx.disclaimerText ?? slide.body ?? '';
    return `
    ${kicker(ctx, 'Catatan Penting')}
    <h1 class="headline" style="font-size: clamp(52px, 5.4vw, 68px); margin-top: 22px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    <div class="disclaimer-box" style="margin-top: 34px;">
      <div class="dtitle">Disclaimer</div>
      ${paragraphs(text)}
    </div>
    <div class="spacer"></div>
  `;
  },
};

// ---------------------------------------------------------------------------

/** Seluruh template, dipakai registry untuk pencarian berdasarkan slug dan peran. */
export const TEMPLATE_LIST: TemplateDefinition[] = [
  hookBold,
  conceptOneIdea,
  propfirmRulesTable,
  journalStatTile,
  newsWhyItMatters,
  scenarioOutlook,
  checklistNumbered,
  recapTakeaway,
  disclaimerNote,
];
