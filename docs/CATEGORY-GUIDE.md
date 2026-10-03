# Panduan Kategori Konten — Sosmed Agency AI

Dokumen ini adalah sumber kebenaran untuk **Item 11** (Category Descriptions & Business Logic).
Setiap kategori membawa aturan risiko, struktur slide, visual, dan audiens yang berbeda.
Composer, Compliance, dan Planner membaca `packages/shared/categories.ts` sebagai kode;
dokumen ini menjelaskan *maksud bisnis* di baliknya agar operator dan agen punya rujukan yang sama.

---

## Ringkasan 5 Kategori

| Kategori | Risiko | Frekuensi/Minggu | Slide | Bulk Approve |
|----------|--------|------------------|-------|--------------|
| edukasi_trading | low | 2 | 6–10 | Ya |
| edukasi_propfirm | medium | 1 | 6–10 | Ya |
| jurnal_trading | medium | 1 | 6–9 | Ya |
| market_info | medium | 2 | 5–8 | Tidak |
| market_outlook | high | 1 | 6–9 | Tidak |

---

## 1. Edukasi Trading (`edukasi_trading`)

**Purpose:** Pembelajaran tentang trading — konsep, psikologi, dan manajemen uang/risiko.

**Content Focus:**
- Bagaimana cara trading yang benar (satu konsep per carousel).
- Psikologi trading: fear, greed, disiplin.
- Money management & risk management.
- Dasar-dasar psikologi trading tanpa jargon yang tidak dijelaskan.

**Slide Structure:** Hook (janji jelas) → Definisi konsep → Contoh konkret dengan angka → Kesalahan umum → Checklist yang bisa diterapkan → Recap 3 poin → CTA simpan/ikuti. (`outline` 7 langkah di `categories.ts`)

**Visual:** Edukasional, bersih, text-heavy; template `concept-one-idea`, `checklist-numbered`.

**Target Audience:** Trader pemula–menengah.

**Aturan Produksi:** `requiresSources=false`, `requiresAsOf=false`.

---

## 2. Edukasi Propfirm (`edukasi_propfirm`)

**Purpose:** Edukasi tentang broker proprietary — aturan, fitur, dan peluang.

**Content Focus:**
- Apa itu proprietary firm.
- Rules & regulations propfirm (drawdown, target profit, konsistensi, payout).
- Keuntungan vs risiko.
- Trading conditions & requirements.

**Slide Structure:** Hook (aturan yang paling disalahpahami) → Aturan dasar + tabel perbandingan → Contoh perhitungan nyata → Konsekuensi pelanggaran → Checklist sebelum daftar/payout → Recap → CTA rujukan.

**Visual:** Profesional, corporate; template `propfirm-rules-table`.

**Target Audience:** Calon peserta propfirm.

**Aturan Produksi:** `requiresSources=true` (angka aturan wajib ada sumber), `riskLevel=medium`.

---

## 3. Jurnal Trading (`jurnal_trading`)

**Purpose:** Laporan trading harian/mingguan — catatan transparan atas satu posisi (pembangun kepercayaan).

**Content Focus:**
- Analisis trade-by-trade.
- Chart analysis & setup.
- Entry/exit rationale.
- Performance stats (risk-reward, hasil dalam R, ukuran posisi).

**Slide Structure:** Hook (hasil jujur) → Tangkapan layar/grafik entry–exit → Statistik posisi → Analisis jujur (yang sesuai vs menyimpang) → Pelajaran → CTA diskusi → Disclaimer pribadi.

**Visual:** Data-heavy, analitis, chart-focused; template `journal-stat-tile`.

**Target Audience:** Komunitas trading, pelacakan performa.

**Aturan Produksi:** `requiresAsOf=true`, `riskLevel=medium`. Input terstruktur via `jurnal_trading_data` (pair, trade_table, direction/execution/mark, performance image). Template kerugian wajib jujur.

---

## 4. Market Info / News (`market_info`)

**Purpose:** Real-time market news & impact analysis — *apa yang terjadi, mengapa penting, dampaknya*.

**Content Focus:**
- Breaking financial news (Forex/Indices/Crypto).
- Penjelasan news dan dampaknya terhadap market.
- Data & statistik pasar.

**Slide Structure:** Hook peristiwa → Ringkasan faktual + as_of → Mengapa penting bagi trader retail → Dampak pada instrumen terkait → Checklist pantauan → CTA follow → Disclaimer informasi.

**News Source:** RSS nyata (Reuters, Bloomberg, CNBC, Yahoo Finance) — dipakai pipeline `news/select.ts`.

**Visual:** News-style, data-driven.

**Target Audience:** Trader aktif, pelaku pasar.

**Aturan Produksi:** `requiresSources=true`, `requiresAsOf=true`, `allowsBulkApprove=false` (butuh perhatian manusia per carousel), `timeSensitive`.

---

## 5. Market Outlook / Signal (`market_outlook`)

**Purpose:** Analisis arah pasar & prediksi — *paling berisiko*, selalu dibingkai sebagai **skenario**, bukan ajakan transaksi.

**Content Focus:**
- Technical analysis & market direction.
- Chart-based predictions.
- Scenario analysis (Skenario A vs B).
- Support/resistance & tingkat invalidasi.

**Slide Structure:** Hook pertanyaan/kondisi penentu → Konteks pasar + as_of → Skenario A (area & invalidasi) → Skenario B (alternatif) → Manajemen risiko → Recap kondisi pembatalan → Disclaimer lengkap.

**Manual Input:** Bisa AI-generated ATAU user upload chart beserta deskripsi (lihat `market_outlook_images` + `carousel_ctas` untuk Item 8).

**Visual:** Chart-heavy, analitis, teknikal; template `scenario-outlook`.

**Target Audience:** Technical trader, penggemar analisis.

**Aturan Produksi:** `riskLevel=high`, `requiresSources=true`, `requiresAsOf=true`, `allowsBulkApprove=false`. Selalu sertakan disclaimer skenario.

---

## Rujukan Kode

- Definisi kategori: `packages/shared/categories.ts` (`CATEGORIES`, `CATEGORY_ORDER`, `getCategory`).
- Tema visual: `packages/shared/category-themes.ts` (`CATEGORY_THEMES`).
- Outline dipakai Composer: `packages/agents/prompts.ts`.

Perubahan konten kategori harus sinkron antara dokumen ini dan `categories.ts`.
