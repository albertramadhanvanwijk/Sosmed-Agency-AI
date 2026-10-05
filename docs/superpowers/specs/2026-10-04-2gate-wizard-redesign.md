# 2-Gate Wizard Redesign — Spec Lengkap (5 Section)

**Tanggal:** 2026-10-04
**Status:** Specification — Menunggu review kamu sebelum `writing-plans` → eksekusi
**Cakupan:** Input materi baru (Wizard B), CTA multi-promo grid, fix visual `chart_snapshot`, pipeline split Gate 1/Gate 2, bulk harian/borong Rencana Mingguan, persona Senior Strategist Deep

---

## Ringkasan Keputusan (Lock)

| Area | Keputusan |
|---|---|
| Flow | 2-gate: `input materi → naskah Gate 1 (manuscript_needs_review → manuscript_approved LOCK) → design Gate 2 (designing → needs_review → ready_to_publish)` — upload manual, tidak auto-publish. Bulk harian/borong di kedua gate. |
| Input Materi | Form lama (`f-cat/f-topic/f-extra/CTA single/upload general`) **hapus total**, ganti Wizard B per kategori. |
| Edukasi (Propfirm/Trading) + Market Info | Topik wajib + materi pendukung opsional: paste artikel + link max 3 (auto-fetch) + upload PDF (extract) + gambar opsional. Persona Deep full. |
| Jurnal Trading | Hanya hook & CTA yang di-generate (3 opsi hook). Form 1 tabel trade repeatable + Form 2 4 grup deskripsi+upload. 7 slide fixed, pecah bila >4 baris → 8 slide. Duplikat skip. |
| Market Outlook/Signal | Hook 3 opsi + galeri repeatable (tiap gambar+deskripsi = 1 slide `chart_snapshot`). Slide dinamis `1+N+1` (tanpa recap). Duplikat skip. |
| CTA | 1 konten = 1 CTA. Hanya `promo` boleh multi (`promoCodes: string[1..5]`). Grid kartu dalam 1 slide CTA. Bebas pilih kind per kategori. |
| Persona | Deep — Edukasi & Market Info full (Strategist+Research+Composer, angka presisi, FOMC/ECB/BOE, SMC/Liquidity/Order Flow, dingin/profesional). Jurnal & Outlook hanya hook. Caption Edukasi/Info analitis, hook tetap engaging. |
| Visual | Prioritas bug: `gambar/chart/visual tidak muncul` → fix `chartAssetRef = dataUri` + template `<img>`. Composer wajib `table/stat_tile/chart_snapshot` bila ada angka. |
| Bulk | Rencana Mingguan harian/borong Gate 1 & Gate 2 via `slotIds` + `carouselIds`. |
| State | Single `carousels.status` extend, reuse `needs_review` untuk Gate 2 agar inbox/board lama tidak pecah. |

**Sumber jawaban Q1-Q6 (2026-10-04):** Q1 dua-duanya (link fetch + paste/PDF), Q2 setuju 7 slide fixed, Q3 hook 3 + dinamis tanpa recap, Q4 grid 1 slide, Q5 deep Edukasi/Info + hook-only Jurnal/Outlook, Q6 duplikat aktif Edukasi/Info, skip manual. Arah B Wizard, 1 CTA multi hanya promo.

---

## Section 1 — Data Model & Status

### 1A. State Machine (single `carousels.status`)

```
[input materi wizard]
  → manuscript_needs_review   (Gate 1 menunggu kamu)
  → manuscript_approved       (kamu pilih naskah/hook → LOCKED)
  → designing                 (render berjalan)
  → needs_review              (Gate 2 menunggu kamu — reuse status lama)
  → ready_to_publish          (Gate 2 approved — manual upload)
  ↓ failed / archived / rejected
  ↘ manuscript_changes_requested → manuscript_needs_review (regenerate naskah only)
  ↘ design_changes_requested → designing (manuscript TETAP LOCKED, design-only)
```

`needs_review` reuse untuk kompatibilitas approvals inbox & pipeline board. `manuscript_needs_review` & `ready_to_publish` baru. `failed/archived/rejected` tetap. `CarouselStatus` type extend.

### 1B. Kolom baru `carousels` (SCHEMA_VERSION 6)

```sql
manuscript_json TEXT            -- polymorphic per kategori (1B.1)
manuscript_version INTEGER DEFAULT 0
manuscript_locked INTEGER DEFAULT 0  -- 1 setelah Gate 1 approved
manuscript_updated_at TEXT
materi_raw TEXT               -- artikel paste / PDF extract (Edukasi/Info)
materi_links TEXT             -- JSON string[] link yang di-fetch
-- call_to_action TEXT sudah ada → migrasi shape (1B.2)
```

**1B.1 `manuscript_json` polymorphic**

```ts
// Edukasi & Market Info
{ angle: string, keyMessages: string[], narrative: string,
  caption: { hook, body, hashtags, cta }, title, disclaimerKey, asOf, sourceRefs[] }

// Jurnal — hanya hook & CTA
{ hookOptions: [string,string,string], selectedHookIndex: number, cta: CallToAction, title }

// Outlook — hook + gallery meta
{ hookOptions: [string,string,string], selectedHookIndex: number, galleryCount: number, cta: CallToAction, title }
```

Caption sudah di Gate 1 (caption A — gate 1). `narrative` Guidance B: boleh trim ke template, larang invent fakta; `factSheet` tetap sumber kebenaran.

**1B.2 `call_to_action` shape baru**

```ts
// BEFORE: {kind, headline, detail, promoCode?, validUntil?, communityName?}
// AFTER:
{
  kind: 'save'|'follow'|'community'|'promo'|'consult',
  headline: string,
  detail?: string,
  promoCodes?: string[],   // hanya bila kind==='promo', 1..5, UI "+ Tambah Kode Promo" → grid
  validUntil?: string,
  communityName?: string
}
```

Validasi: `promoCodes.length>1` hanya bila `kind==='promo'`, else 400. `1 konten = 1 CTA` (1 objek per carousel). Template `cta-action` render `promoCodes.map()` grid kartu. `cta_presets.promo_code` migrasi ke JSON array.

**1B.3 Upload — reuse tabel existing**

- Edukasi/Info: `uploaded_images` optional 0..N → `UploadedImage[]` → `uploadedImageNotes` ke Composer.
- Jurnal: `jurnal_trading_data` + 4 slot `*_image_id` → FK `uploaded_images.id`.
- Outlook: `market_outlook_images` + `market_outlook_data.images[]` → tiap entry = 1 slide `chart_snapshot` dengan `chartAssetRef = dataUri`.

**Fix visual (commit bareng 1B):** `describeUploadedImages()` + `visual.chart_snapshot.chartAssetRef = uploadedImage.dataUri` (bukan placeholder string). `previewSlide` & `buildHtml` sudah baca `spec.callToAction` — tinggal `spec.slides[].visual.dataUri`. Template `chart_snapshot` render `<img src="dataUri">`.

### 1C. Versioning & Lock

```sql
manuscript_versions(id TEXT PK, carousel_id TEXT, version INTEGER, manuscript_json TEXT, materi_raw TEXT, edited_by TEXT, note TEXT, created_at TEXT)
CREATE INDEX idx_manuscript_versions_carousel ON manuscript_versions(carousel_id, version)
```

- Regenerate Gate 1 (note min 5 char) + manual edit Gate 1 → insert v+1, `manuscript_version++`.
- Setelah `manuscript_approved` → `manuscript_locked=1`. Edit Gate 1 ditolak 409. Gate 2 reject tidak buka lock — design regen baca snapshot locked.
- Audit: `carousel.manuscript_edited / regenerated / approved / edit_blocked / regen_blocked`.
- Riwayat UI: `v3 [Riwayat ▼]` view-only; restore = `PUT` dengan isi versi lama + note `Restore v2`.

### 1D. Rencana Mingguan — link slot ↔ carousel

```ts
weekly_plans.slots: PlanSlot[] + {
  carouselId: string | null,          // terisi saat slot di-generate jadi naskah
  manuscriptStatus: 'idle'|'manuscript_needs_review'|'manuscript_approved',
  designStatus: 'idle'|'designing'|'needs_review'|'ready_to_publish'
}
```

Badge sync dari `carousels.status` via `carouselId`. Bulk generate terima `slotIds[]`. Tidak perlu tabel baru; JSON extend kompatibel.

### 1E. Revisions — reuse dengan scope

- `manuscript_changes_requested` → pelajaran untuk Strategist/Research.
- `design_changes_requested` → pelajaran untuk Composer only (naskah tidak berubah).

---

## Section 2 — Flow & Pipeline Split + API

### 2A. Pipeline Split — 2 Fase (1 carouselId, 2 gate)

**Before:** `produceCarousel()` 9 langkah sekuensial → langsung PNG. Naskah & desain nyatu.

**After — Lean Split:**

```
Fase 1 — produceManuscript()                          Fase 2 — produceDesignFromManuscript(carouselId)
├─ Edukasi/Info:                                      ├─ Composer (baca manuscript_json LOCKED)
│  strategist (persona Senior Strategist)             │  Edukasi/Info: narrative → 7 slide
│  research (+ fetch materi_links + materi_raw +      │  Jurnal: Form1+Form2 → 7 slide fixed (pecah bila >4 baris)
│           newsBrief)                                │  Outlook: hook + galeri N → 1+N+1 slide dinamis
│  narrativeWriter (angle/keyMessages/narrative)      │  Enforce visual cerdas: angka → table/stat_tile,
│  copywriter (caption)                               │  gambar → chart_snapshot[dataUri], bukan none
│  simpan manuscript_json + materi_raw                │  compliance_rules (BLOKIR) + advisor (warn)
│  status → manuscript_needs_review                   │  render PNG/PDF per ratio + schedule + analyze
├─ Jurnal: hookGenerator (3 opsi + CTA)               │  status → needs_review → ready_to_publish
└─ Outlook: hookGenerator (3 opsi + CTA)              └─ cost/tokens akumulasi (pisah manuscript vs design)
```

Lock di antara fase: `manuscript_approved` → `locked=1`, Fase 2 baca snapshot locked. Revision scope terjaga: Gate1 reject → Fase1 only, Gate2 reject → design-only (manuscript locked). Kandidat status: `briefed/researching/drafting` tetap untuk internal Fase1, tidak diexpose sebagai gate.

### 2B. API — Endpoint Baru & Ubah

**Deprecate:** `POST /api/produce` lama (langsung render) → ganti di bawah. Form `f-*` UI dihapus.

**Gate 1 — Manuscript**

| Method | Path | Body (polymorphic) | Hasil |
|---|---|---|---|
| POST | `/api/manuscripts` | Edukasi/Info: `{categoryKey, topic*, materiRaw?, materiLinks?: string[≤3], uploadIds?: string[], callToAction: {kind, headline, detail?, promoCodes?[], validUntil?, communityName?}}` <br> Jurnal: `{categoryKey:'jurnal_trading', form1:{pair,direction,session,riskPct,rr,confluence,pnl,result}[], form2:{directionDesc*, executionDesc*, markDesc*, directionImageId?, executionImageId?, markImageId?, performanceImageId?, pairImageId?, generalNotes?}, callToAction}` <br> Outlook: `{categoryKey:'market_outlook', title*, timeframe?, gallery:[{imageId*, description*, sortOrder}] ≥1, callToAction, generalNotes?}` | 201 `{carouselId, manuscript, status:'manuscript_needs_review'}` + job `manuscript` async (Edukasi/Info 2-3 LLM, Jurnal/Outlook 1 LLM) |
| POST | `/api/manuscripts/bulk-generate` | `{items: ManuscriptBody[]}` atau `{slotIds: string[]}` | 202 `{jobs: {carouselId,status}[]}` |
| GET | `/api/manuscripts/:id` | — | `{carousel, manuscript, versions, materiRaw, materiLinks}` |
| PUT | `/api/manuscripts/:id` | `{manuscriptPatch, note?}` (manual edit) | 200 `{manuscript, version}` — 409 bila `locked=1` |
| POST | `/api/manuscripts/:id/regenerate` | `{note* min 5 char}` | 202 `{jobId}` — insert `manuscript_versions` v+1 |
| POST | `/api/manuscripts/:id/approve` | `{selectedHookIndex?:0\|1\|2}` (wajib Jurnal/Outlook) | 200 `{status:'manuscript_approved', locked:true}` |
| POST | `/api/manuscripts/:id/request-changes` | `{note* min 5}` | → `manuscript_changes_requested` + `revisions` entry |
| POST | `/api/manuscripts/bulk-approve` | `{carouselIds: string[]}` | 207 partial (lihat 4B) |
| POST | `/api/materials/fetch-link` | `{url}` | `{ok, title, textSnippet, fetchedAt}` max 3 link, timeout 12s, sanitasi HTML, tolak non-http/private IP |
| POST | `/api/uploads/pdf-extract` | multipart PDF | `{text, pages, truncated}` — lokal tanpa LLM, max 5MB/20 hal |

**Gate 2 — Design**

| Method | Path | Body | Hasil |
|---|---|---|---|
| POST | `/api/designs/:id/generate` | `{ratios?: RatioProfile[]}` default `ig_portrait` | 202 `{jobId, status:'designing'}` — baca manuscript locked + `uploadedImages` → compose → render |
| POST | `/api/designs/bulk-generate` | `{carouselIds: string[]}` (harus `manuscript_approved`) | 202 `{jobs}` |
| GET | `/api/carousels/:id` | — | extend: `+ manuscript, manuscriptVersion, manuscriptLocked, materiRaw` |
| POST | `/api/carousels/:id/decision` | `{decision:'approved'\|'changes_requested'\|'rejected', note?, ratios?}` | Gate2: `approved → ready_to_publish`, `changes_requested → design_changes_requested` (design-only), `rejected → archived` — guard 4G |
| POST | `/api/designs/bulk-decision` | `{carouselIds[], decision, note?}` | Bulk Gate2 → `ready_to_publish` |

**Rencana Mingguan:** `POST /api/plan` tetap, `slots[]` tiap slot tambah `carouselId + manuscriptStatus/designStatus` badge. Bulk via `slotIds` loop `produceManuscript` per slot.

**CTA multi:** `promoCodes` 1..5, tiap 3..20 char `A-Z0-9_-`, hanya bila `kind==='promo'`, else 400. Template grid `repeat(auto-fit, minmax(120px,1fr))`.

### 2C. Visual Fix — Fase 2

```ts
// Jurnal: 4 slot *_image_id → lookup uploaded_images → chart_snapshot per slide
// Outlook: gallery[].imageId → tiap gambar = 1 slide body {visual:{type:'chart_snapshot', chartAssetRef: dataUri, altText: description}}
// Edukasi/Info: uploadIds → composer uploadedImageNotes + dataUri mapping
slide.visual = { type:'chart_snapshot', chartAssetRef: uploadedImage.dataUri, altText: description }
```

### 2D. Jobs & Progress

`jobs` tambah `job_type: 'manuscript'|'design'` + `carousel_id`. `GET /api/jobs` → `{active:[{id, carouselId, jobType, currentStep, progress}], recent}`. Studio polling 2 badge terpisah (Gate1 kuning, Gate2 biru).

### 2E. Validasi & Batas

- Edukasi/Info: `topic` wajib, `materiLinks` max 3, `materiRaw` max 8000 (truncate + warning), PDF 5MB.
- Jurnal: `form1` ≥1, `pair` wajib, `direction` long/short, `form2` 3 deskripsi wajib.
- Outlook: `gallery` ≥1, `title` wajib, hook 3 opsi.
- Duplikat: `checkSimilarity()` hanya Edukasi/Info, skip Jurnal/Outlook.
- Bulk: max 20/request, rate-limit 10s/IP.

---

## Section 3 — UI Wizard per Kategori

### 3A. Navigasi — Hapus Form Lama

Hapus tab `Buat Carousel` + handler `f-cat/f-topic/f-extra/f-cta-*` lama. Ganti hash-switch dalam 1 tab `create`:

```
Buat Edukasi/Info  → #create-edukasi
Buat Jurnal Trading→ #create-jurnal
Buat Market Outlook→ #create-outlook
```

Reuse `renderStudioHtml` + `STUDIO_JS` hash switch, tidak 3 page server. Selector kategori lama dihapus; kategori ditentukan wizard.

### 3B. Wizard Edukasi & Market Info

```
[Kategori* ▼] edukasi_trading / edukasi_propfirm / market_info
[Topik*] input 1 baris
[Materi Pendukung — opsional]
  └─ Paste Artikel textarea 6 baris, counter 0/8000
  └─ Link max 3: [input url] [Fetch] → preview title+snippet+status, [+ Tambah Link] [Hapus]
  └─ Upload PDF: [Pilih PDF] → "Mengekstrak 12 halaman..." → materi_raw + truncate warning
[Gambar Pendukung opsional] [Pilih gambar] max 6MB thumb
[CTA* — bebas kind, promo multi] → 3E
[■ Abaikan cache] [Mulai Buat Naskah →]
```

Validasi: `topic` ≥5, `materiLinks` ≤3 http(s), PDF 5MB/20 hal, gambar 6MB. Duplikat warning aktif. Submit → `POST /api/manuscripts` → card Gate1 di Step 2 (bukan langsung render).

### 3C. Wizard Jurnal Trading — Hanya Hook & CTA

```
Step 1 — Tabel Trade (repeatable)
  | Pair* | Direction* | Session | %Risk | RR | Confluence | PNL | Result | [x] |
  [+ Tambah Baris] [Impor CSV]

Step 2 — Narasi Visual (4 grup, 3 wajib)
  Direction* + Upload | Execution* + Upload | Mark* + Upload | Performance + Gambar opsional
  [Pair utama*] [Timeframe] [Gambar Pair] [Catatan Umum]
[CTA* — 1 CTA, promo multi] → 3E
[Mulai Buat Hook (3 pilihan) →]
```

JLLM hanya `hookOptions[3]+cta`. Mapping lock 7 slide: 1 Hook → 2 Tabel (pecah bila >4) → 3 Direction+Gambar → 4 Execution+Gambar → 5 Mark+Gambar → 6 Performance+Gambar → 7 CTA+Disclaimer.

### 3D. Wizard Market Outlook — Dinamis N+2

```
[Judul*] [Timeframe ▼ H1/H4/D1/W1/MN/—] [Catatan Umum]
Galeri Chart ≥1 wajib:
  ┌─ Gambar 1: [Pilih gambar*] thumb [Deskripsi* textarea] [↑][↓][Hapus] ┐
  [+ Tambah Gambar + Deskripsi]
[CTA* — 1 CTA, promo multi] → 3E
[Mulai Buat Hook (3 pilihan) →]
```

Hook 3 opsi, tiap galeri = 1 slide `chart_snapshot`. Total `1+N+1` tanpa recap, warning bila >8 slide.

### 3E. CTA — 1 Konten = 1 CTA, Hanya Promo Multi

```
[Jenis CTA* ▼ save|follow|community|promo|consult] (bebas per kategori)
  community → [Nama Komunitas*]
  promo → [Headline*] [Detail] [Valid Sampai] + Kode Promo repeatable 1..5:
    [PROPDESK20] [Hapus]  [GOLD50] [Hapus]  [+ Tambah Kode Promo]  preview grid
  save/follow/consult → [Headline*] [Detail]
```

Validasi: `promoCodes` hanya `kind==='promo'`, 3..20 char `A-Z0-9_-`. Template `cta-action` grid. Presets migrasi `promo_codes` JSON array.

### 3F. Preview Gate 1 — Approve Harian/Borong (di wizard yang sama, Step 2)

```
┌─ Naskah Menunggu Persetujuan (Gate 1) ─────────────┐
│ Edukasi/Info: Angle, KeyMessages, Narrative 3 par,  │
│  Caption hook|body|#hashtags|cta, Sumber factSheet  │
│  [Edit Manual ✎] [Regenerate + catatan] [Approve →]│
│ Jurnal/Outlook: ○ Hook1 ○ Hook2 ○ Hook3 + CTA       │
│  [Edit Hook ✎] [Regenerate Hook] [Approve hook →]  │
│  Version: v3 [Riwayat ▼] view-only                 │
└─────────────────────────────────────────────────────┘
```

Edit → `PUT`, Regenerate → modal note → `POST .../regenerate`, Approve → `POST .../approve {selectedHookIndex}` → `locked=1` → tombol `Lanjut ke Design →` (Gate2). Tone: Edukasi/Info full Senior Strategist, Jurnal/Outlook hook-only.

### 3G. Bulk Rencana Mingguan — Harian/Borong Gate 1 & 2

```
[ ] 2026-10-07 edukasi_trading "Dampak FOMC..." [manuscript_needs_review] [Generate Naskah]
[✓] 2026-10-08 jurnal_trading  "EUR/USD Long"   [manuscript_approved]    [Generate Design]
[✓] 2026-10-09 market_outlook   "Skenario XAU"   [needs_review]          [Menunggu Approval Desain]
[Generate Naskah Terpilih (borong)] [Approve Naskah Terpilih] [Generate Design Terpilih] [Approve Design Terpilih]
```

`POST /api/manuscripts/bulk-generate {slotIds}` → `carouselId` balik ke slot. Badge sync via `slots[].carouselId`.

### 3H. Fix Visual — Gambar/Chart Wajib Muncul

Upload → `uploaded_images.dataUri` → `*_image_id` / `gallery[].imageId` FK → Fase2 `chartAssetRef = dataUri` → template `<img src>` → preview & PNG 1 mesin.

### 3I. State & Wiring

- `ui-js.ts`: hapus `f-*` lama, ganti 3 wizard handler + manuscript (edit/regenerate/approve) + design (generate/decision) + bulk Rencana Mingguan + jobs polling 2 badge.
- `ui-css.ts`: wizard step, repeatable row, grid promo, gallery sort handle, version dropdown. Layout utama tidak diubah.

---

## Section 4 — Error Handling & Edge Cases

### 4A. Validasi Double Guard (UI + API 400 Indonesia)

| Wizard | Aturan | Error 400 | Recovery UI |
|---|---|---|---|
| Edukasi/Info | `topic` ≥5, `materiRaw` ≤8000, `materiLinks` ≤3 http(s) | "Topik minimal 5 karakter." / "Maksimal 3 link." / "Link harus http(s)." | Field merah + hint, counter `8234/8000` merah + truncate warning, submit disable |
|  | `kategori` enum | "Kategori tidak dikenal." | Dropdown lock |
| Jurnal | `pair` wajib, `direction` long/short, `form1` ≥1, `form2` 3 deskripsi ≥10 | "Pair wajib diisi." / "Direction harus Long atau Short." / "Minimal 1 baris trade." | Row highlight merah, scroll ke field salah |
|  | CSV header mismatch / RR format | "Baris 3: RR harus 1:2." / "Header CSV tidak cocok." | Preview kuning, [Lewati] vs [Perbaiki] |
| Outlook | `title` ≥8, `gallery` ≥1, tiap `description` ≥10 | "Judul minimal 8 karakter." / "Galeri minimal 1 gambar + deskripsi." | Card border merah |
| CTA | 1 CTA, `promoCodes` hanya `kind==='promo'` 1..5 × 3..20 `A-Z0-9_-`, `validUntil` ≥ hari ini | "Hanya CTA promo boleh multi kode." / "Kode promo 3-20 karakter." / "Tanggal tidak boleh lampau." | Input merah, grid tidak render invalid |
| Upload | PDF 5MB/20 hal, gambar 6MB, tipe png/jpeg/webp/gif/svg | "PDF melebihi 5MB." / "Gambar melebihi 6MB." / "Tipe tidak didukung." | Progress + [Coba lagi] |

Duplikat: skor ≥0.8 → warning kuning "Topik mirip 83% dengan '...' (2 hari lalu)" — tidak blokir, [Lanjutkan] vs [Ubah]. Jurnal/Outlook skip.

### 4B. Lock & Versioning Guard

| Skenario | Guard | Response | Audit |
|---|---|---|---|
| Edit setelah `locked=1` | `PUT` cek `manuscript_locked` | 409 "Naskah sudah dikunci setelah approval Gate 1. Buat revisi via Request Changes." | `manuscript_edit_blocked` |
| Regenerate setelah lock tanpa request-changes | `POST .../regenerate` cek lock | 409 sama — harus `request-changes` → `manuscript_changes_requested` dulu | `manuscript_regen_blocked` |
| Design regen — manuscript ikut berubah? | `POST /api/designs/:id/generate` baca snapshot locked, abaikan terbaru bila locked | Tidak ada API ubah manuscript saat `design_changes_requested` — locked tetap 1 | `design_regenerated` (catat manuscriptVersion) |
| Bulk campur status | Bulk filter, skip status salah | 207 `{succeeded:[id], skipped:[{id,reason}]}` | per item |
| Race Approve bersamaan | `UPDATE ... WHERE status='manuscript_needs_review'` — affected 0 → gagal kedua | 409 "Status sudah berubah, muat ulang." | `approve_race` |

Restore versi lama = `PUT` isi versi lama + note `Restore v2`.

### 4C. Pipeline & LLM Failure — Fase Murah vs Mahal

| Failure | Dampak | Handling |
|---|---|---|
| Fase1 LLM timeout 60s 2 retry | manuscript `failed` atau tetap `manuscript_needs_review` + error note | Job `manuscript` failed, `jobs.error` "Gagal di step 'strategist': timeout", UI card merah [Coba Lagi] tanpa isi ulang form |
| Fase2 composer/compliance blocked | `designing` → `failed` atau `needs_review` blocked | Composer gagal → [Coba Lagi design-only] locked; blocked → findings tampil, tidak bisa Gate2 approve sampai request-changes + regen |
| Cache | `fresh=true` bypass, fresh=false cache | Tombol Abaikan cache hanya Edukasi/Info; Jurnal/Outlook hook selalu fresh |
| News/extraInstructions kosong | Research tetap, `limitations` "Data berita terbatas" | Warning kuning "Sumber berita tidak tersedia — berbasis materi yang kamu paste" — tidak gagal |

Retry 2x backoff, setelah itu failed — user trigger manual [Coba Lagi].

### 4D. File & External Fetch — Best-Effort, Tidak Blokir Submit

| Failure | Handling |
|---|---|
| `fetch-link` timeout 12s / 404 / non-200 | `{ok:false, error:"Gagal ambil link: timeout/404"}` — card kuning "Gagal fetch — link tetap disimpan, tidak jadi fakta." Submit tetap boleh |
| `pdf-extract` corrupt / >20 hal / >5MB / 0 char scan | 400 "PDF tidak bisa dibaca / melebihi 20 halaman / tidak mengandung teks." — scan → "PDF scan — teks tidak terdeteksi. Paste manual." |
| Gambar upload gagal | 400 spesifik — thumb tidak muncul, card merah [Coba lagi]; galeri tanpa imageId tidak bisa submit |
| Partial fetch 1/3 gagal | Warning "1 dari 3 link gagal" + list, tetap lanjut |

### 4E. Bulk & Concurrency

| Edge | Handling |
|---|---|
| Bulk 20, 3 validasi gagal 17 sukses | 207 partial, toast "17 berhasil, 3 dilewati — lihat detail", tidak rollback 17 |
| Bulk slot sudah punya carouselId | Skip "Slot sudah punya naskah (carouselId ...)" + [Regenerate] per slot, tidak duplikat |
| Rate limit bulk | Max 20/request, cooldown 10s/IP → 429 |
| Polling jobs | `GET /api/jobs` beda `jobType`, 2 badge terpisah |

### 4F. Visual & Render — Failover

| Failure | Handling |
|---|---|
| `dataUri` hilang/corrupt/imageId tidak ditemukan | Fallback `visual.type='none'` + warning "Gambar 'X' tidak ditemukan — slide jadi teks." + `visual_fallback` audit, tidak gagalkan carousel |
| dataUri 6MB → render berat | Upload cap 6MB sudah tahan, `<img max-height>`, Chromium timeout retry 1x, fallback teks |
| CTA promo 5×20 char overflow | Grid `auto-fit minmax(120px,1fr)` + `word-break: break-all` |
| Outlook N+2 >8 slide | Warning kuning "7 gambar = 9 slide — kurangi", validate body ≤140 pada chart_snapshot → block bila >180 |
| Jurnal >4 baris | Auto-pecah 2 slide tabel → total 8, slideRange relax 7-8 untuk kasus ini |

### 4G. Compliance & Publishing Guard — Tidak Ada Jalan Pintas

| Guard | Aturan |
|---|---|
| Gate2 approve tanpa Gate1 | 409 "Selesaikan Gate 1 dulu." (`manuscript_locked=1` check) |
| blocked=1 coba approve Gate2 | 409 "Carousel diblokir kepatuhan — perbaiki BLOKIR dulu." (reuse `decideCarousel` guard) |
| ready_to_publish → auto-publish | Tidak pernah — final manual upload, tidak ada `published` status/webhook |
| rejected/archived coba generate | 409 "Carousel sudah diarsipkan/ditolak." |

### 4H. UX Feedback

Toast global, field merah validasi, card kuning warning, card merah block. Tiap `failed` job: [Lihat Error] + [Coba Lagi]. Tiap `manuscript_needs_review`: [Edit][Regenerate+note][Approve] — tidak dead-end. Audit semua.

Tradeoff: fail-open untuk materi pendukung (link/PDF gagal tidak blokir) tapi fail-closed untuk lock & compliance.

---

## Section 5 — Testing & Quality Assurance

### 5A. Scope

```
Baru (wajib lolos):
  Wizard 3 kategori + CTA multi promoCodes grid + visual chart_snapshot fix
  Pipeline split Fase1/Fase2 + lock/versioning + bulk harian/borong
  Persona Deep (Edukasi/Info full, Jurnal/Outlook hook-only)
  Materi pendukung: link fetch + PDF extract + materiRaw 8000
Regresi:
  Carousels lama tetap tampil, needs_review lama approve, previewSlide, render PNG/PDF, compliance block, audit
```

Tidak ada `published` auto — `ready_to_publish` manual.

### 5B. Unit (tanpa LLM/DB)

| Module | Kasus | Ekspektasi |
|---|---|---|
| db migrasi v6 | v5→v6, `manuscript_json/materi_raw/promoCodes` shape | Kolom ada, single `promoCode` → `promoCodes[]` tanpa hilang, `locked` default 0 |
| validate Jurnal/Outlook + CTA | promoCodes 0/1/5/6, kind!='promo'+promoCodes | 6→400, kind salah+promoCodes→400, pair kosong→400, gallery 0→400 |
| manuscript_versions | PUT 3x + regenerate 1x | version 4, rows 4, edited_by benar |
| Lock guard | PUT setelah locked, regenerate tanpa request-changes | 409 Indonesia |
| checkSimilarity scope | Edukasi 0.83, Jurnal 0.95 | Edukasi warning, Jurnal skip |
| Persona builder | strategistSystem Edukasi vs Jurnal | Edukasi mengandung "Senior Market Strategist...FOMC/ECB...", Jurnal hook-only tidak |
| budgetsToPrompt visual deep | angka tapi visual none | Prompt mengandung "wajib table/stat_tile/chart_snapshot" |
| cta-action template | promoCodes 3 kartu | HTML grid 3, validUntil tampil |

`npm run test:unit` — coverage file baru ≥80%.

### 5C. API Integration (SQLite memori + mock LLM, tanpa 9Router)

| Endpoint | Skenario | Assert |
|---|---|---|
| POST /api/manuscripts Edukasi | topic + materiLinks 2 + materiRaw 2000 + CTA promo 2 kode | 201 manuscript_needs_review, caption ada, materi_links tersimpan, job manuscript |
| POST Jurnal | form1 2 baris + form2 3 desk + 2 imageId | 201 hookOptions 3, tanpa narrative panjang |
| POST Outlook | gallery 3 | 201 hookOptions 3, galleryCount 3 |
| POST fetch-link | 200 vs timeout vs 404 | 200→snippet, timeout→{ok:false}, wizard tetap submit |
| POST pdf-extract | 2 hal teks, scan 0 char, 25 hal | 2→pages:2, scan→400, 25→400 |
| PUT manuscripts/:id | sebelum vs setelah approve | sebelum 200 v+1, setelah 409 |
| POST regenerate+approve | note<5 vs ≥5, selectedHookIndex 0-2 vs 3 | <5→400, index 3→400, valid→202/200 locked=1 |
| POST request-changes | note 3 vs 10 | 3→400, 10→200 + revisions row |
| POST designs/:id/generate | sebelum vs setelah manuscript_approved, visual mapping | sebelum 409, setelah 202 + chart_snapshot.dataUri |
| POST bulk-generate | 20 slot 3 salah 1 link gagal | 207 succeeded:17 skipped:3 |
| POST bulk-approve Gate1/2 | mix status | 207 partial |
| POST carousels/:id/decision Gate2 | blocked=1, locked=0 | 409 block, 409 gate |
| GET carousels/:id + preview | baru vs lama | baru manuscript field ada, preview <img src="data:">, lama tetap 200 |

Mock `LlmClient.callJson` fixture StrategistOutput dengan persona phrase + angka.

### 5D. UI/E2E (Playwright, Chromium)

| Alur | Verifikasi |
|---|---|
| Edukasi: Topik + 500 kata + 2 link + CTA promo 2 kode → Gate1 Approve → Gate2 → ready_to_publish | Badge tiap gate, grid promo 2 kartu di preview CTA, counter 500/8000 |
| Jurnal: Form1 2 baris + Form2 3 desk + 2 gambar mock dataUri + CTA community → hook pilih 1 → design 7 slide | Thumb <img> chart, bukan none |
| Outlook: 4 galeri + reorder ↑↓ + CTA save → hook 1 → design 6 slide (1+4+1) | SortOrder ikut PNG |
| CTA grid 1 vs 3 vs 5 kode | Grid tidak overflow (visual regression screenshot) |
| Validasi kosong, 4 links, PDF 6MB, promoCodes 6 | Field merah + toast Indonesia |
| Bulk Rencana Mingguan 5 slot Generate→Approve→Design | 207 toast, badge update, tidak duplikat carouselId |
| Lock: Approve Gate1 → Edit | Edit disable + 409 |
| Visual regresi carousel lama | Tetap 200, visual none teks saja |

E2E mock `POST /api/manuscripts` response, fokus UI flow & rendering.

### 5E. Manual QA Checklist (kamu + tim, sebelum merge)

```
[ ] Edukasi 2000 kata + 3 link (1 timeout) → naskah jadi, warning 1 link gagal tidak blokir
[ ] Edukasi PDF 4 hal → materi_raw terisi, naskah ada angka dari PDF
[ ] Jurnal 4 gambar → 7 slide PNG semua ada gambar (buka PNG, bukan cuma preview)
[ ] Outlook 5 gambar → 7 slide, reorder → PNG ikut berubah
[ ] CTA 3 kode → 1 slide CTA grid 3 kartu jelas di PNG 1080px
[ ] Bulk 10 borongan Gate1→Gate2→ready_to_publish tanpa 500
[ ] Lock: approve Gate1 → regenerate tanpa request-changes → 409
[ ] Duplikat: 2 Edukasi 90% → warning; 2 Jurnal sama → tidak warning
[ ] Persona: naskah Edukasi cek 3 sample mengandung angka presisi + FOMC/ECB/SMC/Liquidity
[ ] Fallback: hapus 1 uploaded_images → Fase2 6 slide lain正常, 1 slide teks + warning
```

### 5F. Non-Fungsional

Migrasi v5→v6 fixture SELECT + preview 3 sample lama 200. Bulk 20 mock 100ms <5s. PDF 5MB <2s. materiRaw 8000 truncate tidak crash, gallery 10 warning render <10s. fetch-link tolak file://, private IP, exe.

### 5G. Done Criteria

```
✓ Unit + API integration hijau (mock LLM)
✓ E2E 8 alur hijau Chromium lokal (preview === PNG 1 mesin)
✓ Manual QA 10 checklist dicentang kamu
✓ CTA grid + chart_snapshot verified di PNG output (bukan cuma HTML)
✓ Bulk 10 harian/borong end-to-end (Gate1→Gate2→ready_to_publish) tanpa 500
✓ Tidak ada regresi: carousel lama & needs_review approve tetap lolos
```

Strategi: TDD validasi+lock+CTA+visual fail dulu baru implement. Mock LLM di CI, 1 smoke 9Router asli (1 Edukasi full persona) sebelum demo.

---

## Non-Goals (Tidak Dikerjakan)

- Library `materials` reusable terpisah (cukup `materi_raw/links` kolom; tambah tabel nanti tanpa ubah wizard).
- Auto-publish / `published` status / webhook.
- 3 page server terpisah untuk wizard (hash switch cukup).
- Perubahan `needs_review` lama — tetap kompatibel.

## Implementasi — Sequencing

Eksekusi via `writing-plans` (1 track, delivery `worktree_isolated`):

1. TDD: validasi + lock + CTA grid + visual mapping (fail dulu).
2. DB migrasi v6 + manuscript_versions + promoCodes shape.
3. Pipeline split `produceManuscript` vs `produceDesignFromManuscript` + persona Deep + visual fix.
4. API `/api/manuscripts` polymorphic + bulk + `fetch-link` + `pdf-extract` + `/api/designs/*` + bulk-decision 207.
5. UI Wizard B 3 kategori + preview Gate1 + bulk Rencana Mingguan + CTA grid + jobs 2 badge.
6. Test: unit + API integration mock + E2E 8 alur + manual QA.

## Open Questions

- PDF extract: library `pdf-parse` vs `pdfjs-dist` — TBA saat implement (prefer yang tanpa native dep).
- LLM persona Deep: 1 paragraf vs 3 paragraf — TBA tuning saat smoke test (mulai 1 paragraf, tambah bila hook/narrative masih generik).

---

## Persetujuan

- [ ] Section 1 Data Model & Status — **SETUJU 2026-10-04**
- [ ] Section 2 Flow & API — **SETUJU 2026-10-04**
- [ ] Section 3 UI Wizard — **SETUJU 2026-10-04**
- [ ] Section 4 Error Handling — **SETUJU 2026-10-04**
- [ ] Section 5 Testing — **SETUJU 2026-10-04**
- [ ] Spec lengkap ini — menunggu centang kamu sebelum `writing-plans`

> Balas **"Setuju spec"** untuk lanjut ke `writing-plans`. Koreksi per section tetap boleh — sebut nomor section + poin.
