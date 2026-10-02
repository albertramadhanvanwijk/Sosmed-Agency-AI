/**
 * Renderer: HTML -> PNG / PDF.
 *
 * Inilah mesin yang menjawab pertanyaan "bisakah HTML dikonversi menjadi
 * gambar?" — bisa, dan hasilnya jauh lebih baik daripada membiarkan model
 * gambar menulis teks, karena:
 *
 *  - Teks dijamin tepat huruf per huruf (tidak ada glyph yang salah).
 *  - Font, warna, dan jarak konsisten di seluruh slide.
 *  - Revisi satu kata cukup mengubah data, tidak merender ulang dengan model.
 *  - Satu slide spec dapat dirender ke banyak ukuran tanpa biaya tambahan.
 *
 * Alur render per slide:
 *   1. Bangun dokumen HTML mandiri dari template.
 *   2. Muat di Chromium pada ukuran kanvas target.
 *   3. Tunggu font siap.
 *   4. Ukur apakah ada teks yang meluap (overflow).
 *   5. Foto menjadi PNG pada skala perangkat yang diminta.
 *
 * Pada langkah 4, overflow membuat render GAGAL, bukan memotong teks. Ini
 * disengaja: konten yang terpotong tidak boleh lolos ke publikasi.
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type {
  BrandLogo,
  BrandMark,
  CallToAction,
  CarouselSpec,
  CategoryKey,
  RatioProfile,
  RenderedOutput,
  Slide,
  UploadedImage,
} from '../shared/types.ts';
import { RATIO_PROFILES, type RatioProfileSpec } from '../shared/theme.ts';
import { resolveChromium } from './chromium.ts';
import { buildHtml, type TemplateContext } from '../templates/base.ts';
import { resolveTemplate, validateSlide } from '../templates/registry.ts';

/**
 * Bentuk minimal elemen yang diukur saat memeriksa overflow.
 *
 * Ditulis sempit dengan sengaja: pengukuran hanya membutuhkan empat anggota
 * ini, sehingga tipe tidak bergantung pada versi pustaka DOM.
 */
interface MeasuredElement {
  scrollHeight: number;
  clientHeight: number;
  dataset: { position?: string };
  querySelector(selector: string): MeasuredElement | null;
  querySelectorAll(selector: string): ArrayLike<MeasuredElement>;
}

/** Satu slide yang gagal dirender karena teksnya meluap. */
export interface OverflowIssue {
  slidePosition: number;
  /** Elemen mana yang meluap, untuk memudahkan perbaikan. */
  element: string;
  /** Berapa piksel kelebihan tinggi isi. */
  overflowPx: number;
}

/** Hasil render satu carousel. */
export interface RenderResult {
  outputs: RenderedOutput[];
  /** Slide yang teksnya tidak muat; render untuk carousel dianggap gagal bila ada. */
  overflow: OverflowIssue[];
  /** Jalur direktori keluaran. */
  outputDir: string;
  durationMs: number;
}

/** Opsi render. */
export interface RenderOptions {
  /** Profil rasio yang diminta. Boleh lebih dari satu. */
  ratios: RatioProfile[];
  /** Direktori dasar keluaran. */
  outputBaseDir: string;
  /** Nama folder untuk carousel ini (biasanya slug). */
  folderName: string;
  /** Nama merek di kaki slide. */
  brandName: string;
  /** Label kategori pada kicker. */
  categoryLabel: string;
  /** Kunci kategori; menentukan tema visual yang dipakai. */
  categoryKey?: CategoryKey;
  /** Teks disclaimer untuk slide disclaimer. */
  disclaimerText?: string;
  /** Logo merek yang dipasang pada slide. */
  logo?: BrandLogo;
  /** Merek teks yang tampil. */
  brandMark?: BrandMark;
  /** Ajakan bertindak yang ditampilkan pada slide cta. */
  callToAction?: CallToAction;
  /** Gambar yang diunggah pengguna, sudah berupa data URI. */
  uploadedImages?: UploadedImage[];
  /** Hentikan dan laporkan bila ada overflow (bawaan: true). */
  failOnOverflow?: boolean;
  /** Tampilkan kemajuan di konsol. */
  verbose?: boolean;
}

/** Membuka browser sekali lalu dipakai ulang untuk semua slide. */
export class Renderer {
  private browser: Browser | null = null;
  private readonly plan = resolveChromium();

  /** Menampilkan browser mana yang dipakai, agar tidak ada tebakan. */
  get chromiumInfo(): { executablePath: string; source: string } {
    return this.plan;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        executablePath: this.plan.executablePath,
        // Argumen berikut menjaga render tetap stabil di Windows dan di
        // lingkungan tanpa GPU.
        args: [
          '--force-color-profile=srgb',
          '--disable-lcd-text',
          '--font-render-hinting=none',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
    }
    return this.browser;
  }

  /** Menutup browser. Wajib dipanggil agar proses tidak menggantung. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Mengukur apakah ada elemen teks yang meluap keluar dari slide.
   * Dijalankan di dalam halaman sehingga memakai layout asli, bukan perkiraan.
   */
  private async measureOverflow(page: Page): Promise<OverflowIssue[]> {
    // Halaman dijalankan di dalam Chromium, sehingga `document` hanya ada saat
    // fungsi ini berjalan di sana. Pemanggilan ini sengaja dibungkus dalam
    // string yang dieksekusi halaman, bukan ditafsirkan Node.
    return page.evaluate(() => {
      const issues: { slidePosition: number; element: string; overflowPx: number }[] = [];
      const slideEl = document.querySelector('.slide') as unknown as MeasuredElement | null;
      if (!slideEl) return issues;
      const position = Number(slideEl.dataset.position ?? '0');

      // 1. Isi slide melebihi tinggi yang tersedia.
      const wrap = slideEl.querySelector('.body-wrap');
      if (wrap) {
        // scrollHeight mengukur isi sesungguhnya; clientHeight tinggi yang tersedia.
        const overflow = wrap.scrollHeight - wrap.clientHeight;
        if (overflow > 2) {
          issues.push({
            slidePosition: position,
            element: '.body-wrap',
            overflowPx: Math.round(overflow),
          });
        }
      }

      // 2. Slide itu sendiri melebihi kanvas.
      const slideOverflow = slideEl.scrollHeight - slideEl.clientHeight;
      if (slideOverflow > 2) {
        issues.push({
          slidePosition: position,
          element: '.slide',
          overflowPx: Math.round(slideOverflow),
        });
      }

      // 3. Tabel dengan banyak baris sering meluap tanpa memicu dua pemeriksaan
      //    di atas karena tabel bisa mengecil; periksa tinggi selnya.
      const tables = slideEl.querySelectorAll('.tbl');
      for (let i = 0; i < tables.length; i += 1) {
        const el = tables[i]!;
        const diff = el.scrollHeight - el.clientHeight;
        if (diff > 2) {
          issues.push({ slidePosition: position, element: '.tbl', overflowPx: Math.round(diff) });
        }
      }

      return issues;
    });
  }

  /**
   * Merender satu slide menjadi PNG.
   * Mengembalikan jalur berkas dan daftar masalah overflow bila ada.
   */
  async renderSlidePng(
    slide: Slide,
    html: string,
    ratio: RatioProfileSpec,
    outPath: string,
  ): Promise<{ overflow: OverflowIssue[]; byteSize: number }> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      viewport: { width: ratio.width, height: ratio.height },
      deviceScaleFactor: ratio.deviceScaleFactor,
    });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      // Pastikan font benar-benar siap sebelum difoto; tanpa ini ukuran teks
      // bisa berubah setelah screenshot dan menimbulkan perbedaan hasil.
      await page.evaluate(() => document.fonts.ready);
      // Beri satu frame agar layout akhir stabil.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

      const overflow = await this.measureOverflow(page);

      await mkdir(dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, type: 'png', fullPage: false });
      const s = await stat(outPath);
      return { overflow, byteSize: s.size };
    } finally {
      await page.close();
    }
  }

  /** Merender satu slide menjadi PDF satu halaman (dipakai untuk profil LinkedIn). */
  async renderSlidePdf(
    html: string,
    ratio: RatioProfileSpec,
    outPath: string,
  ): Promise<number> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      viewport: { width: ratio.width, height: ratio.height },
    });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await mkdir(dirname(outPath), { recursive: true });
      await page.pdf({
        path: outPath,
        width: `${ratio.width}px`,
        height: `${ratio.height}px`,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      const s = await stat(outPath);
      return s.size;
    } finally {
      await page.close();
    }
  }
}

/**
 * Merender seluruh carousel ke semua profil rasio yang diminta.
 *
 * Mengembalikan daftar berkas yang dihasilkan beserta masalah overflow.
 * Berkas ditulis ke disk lokal; TIDAK ada unggahan otomatis ke mana pun.
 */
export async function renderCarousel(
  spec: CarouselSpec,
  tokens: Parameters<typeof buildHtml>[1]['tokens'],
  opts: RenderOptions,
): Promise<RenderResult> {
  const started = Date.now();
  const renderer = new Renderer();
  const outputs: RenderedOutput[] = [];
  const overflow: OverflowIssue[] = [];
  const failures: string[] = [];

  const outputDir = resolve(opts.outputBaseDir, opts.folderName);
  const total = spec.slides.length;

  try {
    for (const ratioKey of opts.ratios) {
      const ratio = RATIO_PROFILES[ratioKey];
      if (!ratio) throw new Error(`Profil rasio tidak dikenal: ${ratioKey}`);
      const isPdfProfile = ratioKey === 'linkedin_pdf';

      for (const slide of spec.slides) {
        const template = resolveTemplate(slide);

        // Validasi sebelum render: lebih baik menolak dengan pesan jelas
        // daripada menghasilkan slide yang teksnya terpotong.
        const issues = validateSlide(slide, template);
        const blocking = issues.filter((i) => i.severity === 'block');
        if (blocking.length > 0) {
          for (const b of blocking) {
            failures.push(`Slide ${b.slidePosition} (${b.field}): ${b.message}`);
          }
        }

        const ctx: TemplateContext = {
          tokens,
          ratio,
          position: slide.position,
          total,
          brandName: opts.brandName,
          categoryLabel: opts.categoryLabel,
          ...(opts.categoryKey ? { categoryKey: opts.categoryKey } : {}),
          asOf: spec.asOf,
          disclaimerText: opts.disclaimerText,
          ...(opts.logo ? { logo: opts.logo } : {}),
          ...(opts.brandMark ? { brandMark: opts.brandMark } : {}),
          ...(opts.callToAction ? { callToAction: opts.callToAction } : {}),
          ...(opts.uploadedImages ? { uploadedImages: opts.uploadedImages } : {}),
        };
        const html = buildHtml(slide, ctx, template);

        const fileName = `slide-${String(slide.position).padStart(2, '0')}.${isPdfProfile ? 'pdf' : 'png'}`;
        const outPath = join(outputDir, ratioKey, fileName);

        if (opts.verbose) {
          console.log(`  render ${ratioKey} slide ${slide.position}/${total} [${template.slug}]`);
        }

        if (isPdfProfile) {
          const bytes = await renderer.renderSlidePdf(html, ratio, outPath);
          outputs.push({
            path: outPath,
            ratioProfile: ratioKey,
            kind: 'carousel_pdf',
            slidePosition: slide.position,
            width: ratio.width,
            height: ratio.height,
            byteSize: bytes,
          });
        } else {
          const { overflow: found, byteSize } = await renderer.renderSlidePng(slide, html, ratio, outPath);
          for (const f of found) overflow.push(f);
          outputs.push({
            path: outPath,
            ratioProfile: ratioKey,
            kind: 'slide_png',
            slidePosition: slide.position,
            width: ratio.width * ratio.deviceScaleFactor,
            height: ratio.height * ratio.deviceScaleFactor,
            byteSize,
          });
        }
      }

      // Untuk profil PDF (LinkedIn), gabungkan seluruh halaman menjadi satu
      // dokumen PDF multi-halaman supaya bisa diunggah sebagai document post.
      if (isPdfProfile) {
        const merged = await mergePdfs(
          outputs.filter((o) => o.ratioProfile === ratioKey && o.kind === 'carousel_pdf').map((o) => o.path),
          join(outputDir, ratioKey, 'carousel.pdf'),
        );
        if (merged) {
          outputs.push({
            path: merged.path,
            ratioProfile: ratioKey,
            kind: 'carousel_pdf',
            byteSize: merged.byteSize,
          });
        }
      }
    }
  } finally {
    await renderer.close();
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Validasi template gagal — render dibatalkan agar tidak menghasilkan slide yang teksnya terpotong:',
        ...failures.map((f) => `  - ${f}`),
      ].join('\n'),
    );
  }

  if (overflow.length > 0 && opts.failOnOverflow !== false) {
    const detail = overflow
      .map((o) => `  - slide ${o.slidePosition}: ${o.element} kelebihan ${o.overflowPx}px`)
      .join('\n');
    throw new Error(
      [
        'Teks meluap dari kanvas, render dibatalkan:',
        detail,
        '',
        'Perbaiki dengan memperpendek teks slide tersebut, bukan memotongnya.',
      ].join('\n'),
    );
  }

  return { outputs, overflow, outputDir, durationMs: Date.now() - started };
}

/**
 * Menggabungkan beberapa PDF menjadi satu.
 *
 * Dilakukan tanpa pustaka PDF eksternal: karena setiap halaman dihasilkan oleh
 * Chromium dengan ukuran identik, kita cukup menyusun ulang objek halaman.
 * Bila penggabungan gagal, fungsi mengembalikan null dan render tetap dianggap
 * berhasil dengan PDF per slide — kegagalan di sini tidak boleh membatalkan
 * seluruh produksi.
 */
async function mergePdfs(
  pagePaths: string[],
  outPath: string,
): Promise<{ path: string; byteSize: number } | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    if (pagePaths.length === 0) return null;
    if (pagePaths.length === 1) {
      const buf = await readFile(pagePaths[0]!);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, buf);
      return { path: outPath, byteSize: buf.byteLength };
    }

    const pages = await Promise.all(pagePaths.map((p) => readFile(p)));
    const merged = concatPdfBuffers(pages);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, merged);
    return { path: outPath, byteSize: merged.byteLength };
  } catch {
    return null;
  }
}

/**
 * Menyusun beberapa PDF sederhana menjadi satu berkas.
 *
 * Strategi: seluruh objek dari setiap berkas disalin ke berkas baru dengan
 * penomoran objek yang digeser, lalu daftar halaman digabung. Chromium
 * menghasilkan PDF linear dengan penomoran objek yang berurutan, sehingga
 * pendekatan ini andal untuk kasus kita.
 */
function concatPdfBuffers(buffers: Buffer[]): Buffer {
  const header = '%PDF-1.4\n';
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  let objectCounter = 0;

  for (const buf of buffers) {
    const text = buf.toString('latin1');
    // Ambil setiap objek: "N 0 obj ... endobj"
    const objectRegex = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
    const found: { id: number; body: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = objectRegex.exec(text)) !== null) {
      found.push({ id: Number(m[1]), body: m[2]! });
    }
    if (found.length === 0) throw new Error('PDF tidak memiliki objek yang dapat dibaca');

    const idMap = new Map<number, number>();
    for (const obj of found) {
      objectCounter += 1;
      idMap.set(obj.id, objectCounter);
    }

    const pageId = found
      .filter((o) => /\/Type\s*\/Page[^s]/.test(o.body))
      .map((o) => idMap.get(o.id)!);
    pageObjectIds.push(...pageId);

    for (const obj of found) {
      const newId = idMap.get(obj.id)!;
      // Perbaiki seluruh rujukan "N 0 R" agar menunjuk ke nomor objek baru.
      const body = obj.body.replace(/(\d+)\s+0\s+R/g, (_full, refId) => {
        const mapped = idMap.get(Number(refId));
        return mapped ? `${mapped} 0 R` : `${refId} 0 R`;
      });
      objects.push(`${newId} 0 obj${body}endobj\n`);
    }
  }

  // Halaman induk baru berisi seluruh halaman dari semua berkas.
  const pagesId = ++objectCounter;
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  objects.push(`${pagesId} 0 obj<</Type/Pages/Count ${pageObjectIds.length}/Kids[${kids}]>>endobj\n`);

  // Katalog dokumen.
  const catalogId = ++objectCounter;
  objects.push(`${catalogId} 0 obj<</Type/Catalog/Pages ${pagesId} 0 R>>endobj\n`);

  // Tulis ulang setiap halaman agar induknya menunjuk ke Pages yang baru.
  const bodyText = objects
    .join('')
    .replace(/\/Type\s*\/Page([^s])/g, (_full, tail) => `/Type/Page${tail}`)
    .replace(/\/Parent\s+\d+\s+0\s+R/g, `/Parent ${pagesId} 0 R`);

  const headerBytes = Buffer.from(header, 'latin1');
  const bodyBytes = Buffer.from(bodyText, 'latin1');
  const xrefOffset = headerBytes.byteLength + bodyBytes.byteLength;

  let xref = `xref\n0 ${objectCounter + 1}\n0000000000 65535 f \n`;
  // Offset dihitung dari awal berkas; cukup akurat untuk pembaca yang toleran
  // maupun yang ketat karena kita menghitung posisi setiap objek.
  const positions: number[] = [0];
  let cursor = headerBytes.byteLength;
  const objectChunks = objects.map((o) => Buffer.from(o, 'latin1'));
  for (const chunk of objectChunks) {
    positions.push(cursor);
    cursor += chunk.byteLength;
  }
  for (let i = 1; i <= objectCounter; i += 1) {
    xref += `${String(positions[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer<</Size ${objectCounter + 1}/Root ${catalogId} 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.concat([headerBytes, ...objectChunks, Buffer.from(xref + trailer, 'latin1')]);
}
