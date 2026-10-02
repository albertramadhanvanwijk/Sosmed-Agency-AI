# PRD — PropDesk AI
## AI Social Media Agency OS untuk Niche Trading Propfirm

| Field | Isi |
|---|---|
| Nama kerja produk | **PropDesk AI** (nama bisa diganti; dipakai konsisten di dokumen ini) |
| Versi dokumen | 1.0 |
| Tanggal | 2 Oktober 2026 |
| Pemilik produk | Pemilik proyek (individu) |
| Status | Draft untuk persetujuan — belum ada kode |
| Dokumen terkait | `docs/SKEMA-DATABASE.md` (skema lengkap + DDL), `README.md` (indeks proyek) |

---

## 0. Cara Membaca Dokumen Ini

Dokumen ini adalah **spesifikasi tunggal** sebelum penulisan kode. Isinya:

- Keputusan arsitektur yang sudah dikunci beserta alasannya (Bagian 5) — bagian ini yang paling mahal jika diubah nanti, jadi baca duluan.
- Ruang lingkup per fase (Bagian 6) — apa yang **tidak** dikerjakan sama pentingnya.
- Requirement fungsional bernomor `FR-x.y` (Bagian 9–13) agar bisa dilacak ke backlog dan test.
- Requirement non-fungsional bernomor `NFR-x` (Bagian 14).
- Roadmap, KPI, risiko, dan estimasi biaya (Bagian 16–19).

Detail kolom, tipe data, index, dan DDL ada di `docs/SKEMA-DATABASE.md`. Dokumen ini hanya memuat model domain ringkas dan merujuk ke dokumen tersebut.

---

## 1. Ringkasan Eksekutif

PropDesk AI adalah **platform operasi agensi sosial media berbasis AI** yang dikhususkan untuk niche trading propfirm. Produk menggabungkan tiga hal yang biasanya terpisah:

1. **Content Engine** — mesin produksi carousel gambar dari ide menjadi PNG/PDF siap tayang, dengan teks yang dijamin akurat karena dirender secara deterministik dari template HTML, bukan digambar oleh model difusi.
2. **Dashboard Operasi** — pipeline Kanban, kalender, approval inbox, studio carousel, knowledge base, dan analytics dalam satu tempat.
3. **Virtual Agent Office** — representasi visual 2D isometrik dari 9 agen AI yang bekerja, dengan status yang **berasal dari database nyata**, bukan animasi hiasan.

Cakupan konten dibatasi pada 5 kategori: Edukasi Trading, Edukasi Propfirm, Jurnal Trading, Market Info/News, dan Market Outlook/Signal. Format keluaran: **carousel gambar saja** (PDF untuk LinkedIn, varian rasio untuk platform lain).

Pemakaian awal adalah **single-tenant untuk satu brand pribadi**, tetapi skema database dirancang tenant-ready (`org_id` di semua tabel) sehingga produk dapat dijual sebagai SaaS multi-klien tanpa migrasi besar.

Nilai jual utama produk ini ada pada dua hal: (a) hasil produksi carousel yang **benar-benar bisa dipakai** karena teks presisi dan template konsisten, dan (b) **knowledge base yang mengakumulasi aset pemenang** (hook bank, frasa terlarang, template dengan save rate tertinggi) sehingga kualitas output naik seiring waktu. Keduanya adalah moat yang tidak bisa ditiru hanya dengan memanggil API LLM.

---

## 2. Latar Belakang & Masalah

Mengelola konten sosial media untuk niche trading propfirm punya kombinasi kesulitan yang jarang dimiliki niche lain:

| Masalah | Dampak |
|---|---|
| **Volume carousel tinggi** — 5 kategori × beberapa post/minggu = 30–60 slide desain per minggu | Tidak sanggup dikerjakan manual seorang diri; biaya desainer tidak masuk |
| **Akurasi teks kritis** — angka drawdown, persentase, level harga, jam rilis data | Salah satu angka saja merusak kredibilitas; AI image generator gagal di sini |
| **Risiko regulatorik & platform** — klaim profit, "dijamin payout", framing signal | Post bisa dihapus, akun bisa dibatasi; framing yang salah berisiko sengketa |
| **News punya kadaluarsa** — konten market info kehilangan nilai dalam hitungan jam | Produksi lambat = konten mati saat tayang |
| **Tidak ada umpan balik terstruktur** — hook mana yang menang tidak tercatat | Setiap carousel dimulai dari nol; kualitas tidak naik |
| **Konsistensi brand** — warna, font, tone, disclaimer wajib | Hasil terlihat amatir; disclaimer sering terlupa |

Solusi yang ada saat ini (alat desain + ChatGPT, atau scheduler biasa) hanya menyelesaikan satu bagian: alat desain tidak otomatis, scheduler tidak memproduksi, dan chat LLM tidak menyimpan aset pemenang.

---

## 3. Tujuan & Non-Tujuan

### 3.1 Tujuan

| ID | Tujuan | Ukuran keberhasilan |
|---|---|---|
| G-1 | Menghasilkan carousel siap tayang dengan usaha manusia minimal | ≤ 5 menit kerja manusia per carousel (di luar review) |
| G-2 | Teks 100% akurat dan konsisten brand | 0 typo teks akibat rendering; 100% lolos brand kit check |
| G-3 | Mencegah konten berisiko terbit | 100% carousel melewati compliance gate sebelum publish |
| G-4 | Kualitas naik seiring waktu | Save rate rata-rata naik dari bulan ke bulan; hook bank bertambah |
| G-5 | Cukup enak dipakai untuk kerja harian satu orang | Approval selesai dari HP dalam < 2 menit per carousel |
| G-6 | Siap dijual sebagai SaaS tanpa refactor besar | Isolasi data per `org_id` dan per `client_id` berjalan sejak hari 1 |

### 3.2 Non-Tujuan (eksplisit di luar cakupan)

| ID | Non-tujuan | Alasan |
|---|---|---|
| NG-1 | Menghasilkan gambar/foto berkualitas fotorealistis sebagai isi utama slide | Teks tidak akurat dan tidak bisa diedit; AI image gen hanya untuk latar/tekstur/ilustrasi abstrak |
| NG-2 | Video/reels di MVP | Biaya produksi dan waktu naik tajam; slide spec yang sama bisa dipakai nanti (lihat ADR-05) |
| NG-3 | Auto-posting tanpa persetujuan manusia | Risiko ban akun dan risiko regulatorik terlalu tinggi |
| NG-4 | Nasihat investasi, rekomendasi beli/jual, atau pengelolaan dana | Bukan ranah produk; semua keluaran adalah materi edukasi/analisis skenario |
| NG-5 | Menjual data performa atau data pengguna ke pihak ketiga | Bukan model bisnis yang dituju |
| NG-6 | Community management otomatis (balas DM/komentar) di MVP | Risiko brand besar; dievaluasi di Fase 4 dengan guardrail ketat |
| NG-7 | Aplikasi mobile native | Web responsif + approval inbox yang mobile-friendly sudah cukup |

---

## 4. Pengguna & Persona

| Persona | Peran | Kebutuhan utama | Frekuensi pakai |
|---|---|---|---|
| **P-1 Owner/Operator** (pengguna utama saat ini) | Merencanakan, menyetujui, memutuskan | Lihat status hari ini dalam 10 detik; review dari HP; bisa override apa saja | Harian, 15–30 menit |
| **P-2 Admin/Klien** (calon pengguna saat dijual) | Memberi brief, menyetujui konten | Portal terbatas, tidak melihat prompt/biaya internal | Mingguan |
| **P-3 Auditor/Reviewer** (kondisi agensi dengan tim) | Memeriksa kepatuhan | Audit trail lengkap per post | Bulanan |
| **P-4 Pembeli SaaS** (Fase 4) | Menjalankan platform untuk brand-nya sendiri | Onboarding brand kit, isolasi data, batas biaya | Harian |

Implikasi desain: **P-1 harus dilayani lebih dulu**. Setiap fitur yang menambah klik pada jalur approve/reject harus dibenarkan secara eksplisit.

---

## 5. Keputusan Arsitektur yang Dikunci

Setiap keputusan di bawah ini ditulis sebagai catatan yang setara ADR. Jika ingin mengubahnya, ubah di sini dulu — bukan diam-diam saat menulis kode.

### ADR-01 — Teks dirender deterministik, bukan digenerate model gambar ✅ Dikunci

- **Keputusan:** LLM hanya menghasilkan **data terstruktur (JSON)**. Slide final dirender dari template HTML+CSS melalui headless Chromium (Playwright) menjadi PNG.
- **Alternatif yang ditolak:** meminta model gambar membuat slide berisi teks.
- **Alasan:** model difusi menghasilkan glyph yang salah, font tidak konsisten, tidak ada layer teks, dan setiap revisi kata memerlukan regenerasi lengkap. Untuk konten edukasi finansial, satu angka salah = konten tidak layak tayang.
- **Konsekuensi:**
  - Perlu menyimpan definisi template dan versinya (`templates`, `template_versions`).
  - Revisi kata = ubah JSON, bukan regenerasi gambar. Murah dan cepat.
  - Satu slide spec bisa dirender ke banyak format (IG, Story, LinkedIn PDF) dengan biaya mendekati nol.
  - Environment render butuh Chromium → **worker terpisah, bukan serverless**.
- **Resiko yang diterima:** kualitas visual dibatasi oleh kualitas template. Mitigasi: galeri template yang diperbanyak bertahap, dan template pemenang disimpan di knowledge base.

### ADR-02 — Human gate wajib sebelum publish ✅ Dikunci

- **Keputusan:** Tidak ada jalur otomatis dari "draft selesai" ke "published". Semua publish melewati approval manusia.
- **Alasan:** risiko pembatasan akun platform dan risiko regulatorik pada niche finansial; satu post yang salah framing jauh lebih mahal daripada waktu review 2 menit.
- **Bentuk:** status `needs_review` adalah gerbang keras. Sistem boleh **mempersiapkan** segalanya, tetapi tidak boleh melewati gerbang ini.
- **Konsekuensi:** pipeline harus menyimpan siapa yang menyetujui, kapan, dan pada versi konten yang mana (`approvals`, `carousel_versions`).

### ADR-03 — Single-tenant dulu, skema tenant-ready ✅ Dikunci

- **Keputusan:** Pemakaian awal satu pengguna/satu brand, tetapi **semua tabel operasional punya `org_id`**, dan semua tabel konten punya `client_id`. Row-level isolation diberlakukan sejak awal.
- **Alasan:** pengguna menyatakan ada potensi dijual. Menambahkan `org_id` belakangan berarti migrasi data, refactor seluruh query, dan risiko kebocoran data antar tenant.
- **Konsekuensi:** setiap query wajib melewati helper tenant-scoped; tidak ada query mentah tanpa filter tenant di kode aplikasi. Ada test khusus "cross-tenant leak".

### ADR-04 — Virtual Agent Office 2D isometrik, dengan Task Board sebagai jalur utama kerja ✅ Dikunci

- **Keputusan:** Representasi visual kantor memakai 2D isometrik (PixiJS/Konva). Namun **Task Board fungsional tetap ada dan setara** — kantor adalah lapisan status, bukan satu-satunya cara kerja.
- **Alternatif yang ditolak:** 3D penuh (React Three Fiber).
- **Alasan:** 2D isometrik memberi ~80% dampak visual dengan ~20% effort, ringan di HP, dan status per agen lebih mudah dibaca. 3D menambah waktu pengembangan besar tanpa menambah kemampuan produksi.
- **Konsekuensi:** semua status kantor harus **diturunkan dari data nyata** (`agent_runs`, `pipeline_steps`). Dilarang menampilkan status palsu atau animasi yang tidak bermakna.

### ADR-05 — Keluaran image-only di MVP, arsitektur siap ke video ✅ Dikunci

- **Keputusan:** MVP hanya menghasilkan PNG + PDF. Namun `slides` menyimpan data terstruktur yang cukup untuk menurunkan video (durasi, narasi, urutan) di Fase 4.
- **Alasan:** slide spec adalah aset jangka panjang; menambah video nanti seharusnya hanya menambah renderer, bukan mengubah model data.

### ADR-06 — Compliance memakai rule engine + LLM, bukan LLM saja ✅ Dikunci

- **Keputusan:** Pemeriksaan kepatuhan dua lapis: (1) rule engine deterministik (regex/presence/struktur) yang tidak bisa di-bypass prompt injection, (2) penilaian LLM untuk nuansa (klaim tersirat, framing). Hasil rule engine bersifat **blocking**.
- **Alasan:** LLM bisa dibujuk dan tidak deterministik. Aturan yang bersifat mutlak (disclaimer wajib ada, frasa terlarang) harus dijalankan kode.
- **Konsekuensi:** aturan disimpan sebagai data (`compliance_rules`) agar bisa ditambah tanpa deploy.

### ADR-07 — Format unggulan tetap gambar, video sebagai rencana lantai berikutnya ✅ Dikunci

- **Catatan jujur:** carousel sangat baik untuk save dan edukasi, tetapi jangkauan organik umumnya lebih besar pada video. Karena itu renderer dirancang agar video bisa ditambahkan dari slide spec yang sama. Namun video **tidak dikerjakan di MVP** agar produk bisa segera berproduksi.

---

## 6. Ruang Lingkup

### 6.1 Fase 1 — Content Engine (MVP, wajib ada)

| Termasuk | Alasan |
|---|---|
| 5 template dasar (satu per kategori) + 3 template cadangan | Cukup untuk mulai produksi nyata |
| Brand kit & editor token merek | Konsistensi visual |
| AI Copywriter + Carousel Composer | Inti produksi |
| Renderer HTML→PNG/PDF (Playwright) | ADR-01 |
| Rule engine compliance dasar | ADR-02, ADR-06 |
| Dashboard minimal: queue board + approvals inbox + carousel preview | Perlu untuk menyetujui |
| Export & download (PNG per slide, ZIP, PDF) | Jalur publish manual |

**Definisi selesai Fase 1:** pemilik proyek dapat menghasilkan satu carousel lengkap yang layak tayang untuk setiap dari 5 kategori, sepenuhnya dari dalam platform, tanpa membuka alat desain lain.

### 6.2 Fase 2 — Dashboard Penuh + Virtual Agent Office

Kalender & scheduler, Knowledge Base, Analytics dasar, agent trace viewer, Virtual Agent Office 2D isometrik, Clients & Brand Kit multi-brand, cost meter, audit log.

### 6.3 Fase 3 — Distribusi & Umpan Balik

Publish API (mulai Facebook Page, lalu Instagram), penarikan metrik, auto-report, feedback loop ke Strategist, notifikasi.

### 6.4 Fase 4 — Skala & Komersialisasi

Multi-tenant onboarding, portal klien, billing/metering kredit, video engine, Community Agent dengan guardrail, office 3D (opsional).

### 6.5 Di Luar Cakupan (semua fase saat ini)

Analisis pasar real-time berlisensi, eksekusi order, data harga tingkat institusional berbayar, aplikasi mobile native, dan fitur apa pun yang mengandung nasihat investasi (NG-4).

---

## 7. Arsitektur Sistem

### 7.1 Gambaran Komponen

```
┌──────────────────────────────────────────────────────────────────────┐
│  WEB APP (Next.js 15 · App Router · TS · Tailwind · shadcn/ui)       │
│  Dashboard · Kanban · Calendar · Carousel Studio · Approvals         │
│  Agent Office (PixiJS canvas) · Knowledge · Analytics · Settings     │
└───────────────┬──────────────────────────────────────────────────────┘
                │  REST/tRPC (tenant-scoped)
┌───────────────▼──────────────────────────────────────────────────────┐
│  API LAYER                                                           │
│  Auth (Clerk/NextAuth) · RBAC · Audit interceptor · Validation(Zod)  │
└───┬───────────────┬───────────────────┬──────────────────┬───────────┘
    │               │                   │                  │
┌───▼──────┐  ┌─────▼──────┐  ┌─────────▼────────┐  ┌──────▼─────────┐
│ POSTGRES │  │  REDIS +   │  │  AGENT WORKER    │  │ RENDER WORKER  │
│ (Prisma) │  │  BullMQ    │  │  LLM orchestration│ │ Playwright     │
│          │  │  job queue │  │  9 agen · retry  │  │ Chromium→PNG   │
└──────────┘  └────────────┘  │  · cost ledger   │  │ →PDF           │
    ▲              ▲          └────────┬─────────┘  └────────┬───────┘
    │              │                   │                     │
    │              │           ┌───────▼─────────┐           │
    │              └───────────┤ LLM PROVIDER    │           │
    │                          │ (routing by task)│          │
    │                          └─────────────────┘           │
┌───┴──────────────────────────────────────────────────────▼───────┐
│  OBJECT STORAGE (S3 / Supabase Storage)  →  assets, PNG, PDF, ZIP │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Tanggung Jawab Komponen

| Komponen | Tanggung jawab | Yang **tidak** dilakukan |
|---|---|---|
| Web App | UI, state, preview, approval | Tidak memanggil LLM langsung; tidak merender PNG di serverless |
| API Layer | Validasi, RBAC, tenant scoping, audit, enqueue | Tidak menjalankan pekerjaan panjang secara sinkron |
| Agent Worker | Menjalankan pipeline LLM, menyimpan trace & biaya, retry, escalation | Tidak menyentuh filesystem render |
| Render Worker | HTML→PNG/PDF, upload ke storage | Tidak memanggil LLM |
| Postgres | Sumber kebenaran semua state | Bukan queue |
| Redis/BullMQ | Antrean job, rate limit, lock | Bukan sumber kebenaran; kehilangan isi queue tidak boleh menghilangkan data |
| Object Storage | Aset biner | Bukan basis data |

### 7.3 Tiga Alur Utama

**Alur A — Generate carousel**
`brief` → enqueue `pipeline_run` → Research (ambil fakta + timestamp) → Copywriter (caption + hook) → Composer (slide spec JSON, divalidasi schema) → masing-masing langkah menulis `agent_runs` + `agent_messages` + `cost_ledger` → render job per format → `assets` + `carousel_assets` → compliance checks → status `needs_review`.

**Alur B — Review & approve**
Approvals Inbox → tampilan slide yang sudah dirender → temuan compliance ditampilkan sebagai blok/warning → approve / minta revisi (dengan komentar per slide) → `approvals` + `approval_comments` → snapshot ke `carousel_versions` → status `approved`.

**Alur C — Publish**
Jika `publish_mode=manual_export` → ZIP + caption siap salin + deep link + reminder (Fase 1). Jika `publish_mode=auto` (Fase 3) → enqueue per platform → `post_variants` → `publish_attempts` → status per platform terpisah (sebagian gagal tidak menggagalkan semuanya) → penarikan metrik terjadwal.

### 7.4 Stack & Alasan

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js 15 App Router + TypeScript | Ekosistem, SSR untuk halaman berat data |
| Styling | Tailwind + shadcn/ui | Kecepatan; komponen aksesibel bawaan |
| Data fetching | React Query + Zustand | Cache server + state UI lokal yang sederhana |
| Chart | Recharts | Cukup untuk KPI dashboard dan equity curve |
| Office canvas | PixiJS (alternatif: Konva) | PixiJS unggul untuk sprite/animated tile dan jumlah objek besar |
| ORM/DB | Prisma + PostgreSQL | Migrasi terkelola, tipe aman, JSONB untuk spec |
| Queue | Redis + BullMQ | Retry, backoff, scheduled job, rate limit per platform |
| Auth | Clerk (alternatif NextAuth) | Lebih cepat; bila ingin tanpa vendor, NextAuth |
| Renderer | Node worker + Playwright Chromium | Kontrol font, ukuran pasti, PDF output untuk LinkedIn |
| Storage | S3-compatible / Supabase Storage | Aset biner besar |
| Deploy | Vercel (app) + Railway/Fly.io (worker) | Render worker butuh memori dan Chromium |
| Observability | Sentry + structured log + `agent_runs` sebagai trace | Melacak kegagalan per langkah |

---

## 8. Model Domain Ringkas

Entitas inti (detail kolom ada di `docs/SKEMA-DATABASE.md`):

- **Tenancy:** `orgs`, `users`, `memberships`, `api_keys`
- **Brand & taksonomi:** `clients`, `brand_kits`, `brand_assets`, `categories`, `disclaimers`
- **Template:** `templates`, `template_versions`
- **Perencanaan:** `content_plans`, `plan_items`, `briefs`
- **Produksi:** `carousels`, `slides`, `carousel_versions`, `captions`
- **Agen:** `agent_definitions`, `pipeline_runs`, `pipeline_steps`, `agent_runs`, `agent_messages`
- **Render:** `render_jobs`, `assets`, `carousel_assets`, `market_snapshots`
- **Kepatuhan:** `compliance_rules`, `compliance_checks`, `approvals`, `approval_comments`
- **Distribusi:** `social_accounts`, `posts`, `post_variants`, `publish_attempts`
- **Analitik & biaya:** `metrics_snapshots`, `kpi_daily`, `cost_ledger`, `agent_performance_daily`
- **Pengetahuan:** `knowledge_items`
- **Operasional:** `integrations`, `notifications`, `audit_logs`, `job_dead_letters`
- **Kantor agen:** `office_layouts`, `office_presence`

**Prinsip skema:**
1. Semua tabel operasional punya `org_id`; semua tabel konten punya `client_id`.
2. Semua primary key `uuid`. Semua tabel punya `created_at`; tabel yang bisa berubah punya `updated_at`.
3. Penghapusan lunak (`deleted_at`) untuk entitas yang punya nilai audit (client, carousel, post, knowledge). Hard delete hanya untuk data sementara (mis. `office_presence`).
4. Data spesifikasi (slide spec, brand token, metrik mentah) memakai `jsonb` dengan validasi schema di application layer.
5. Riwayat versi disimpan eksplisit (`template_versions`, `carousel_versions`) agar audit kepatuhan bisa membuktikan versi mana yang disetujui.
6. Uang & biaya disimpan sebagai `numeric(12,6)`; jangan `float`.

---

## 9. Spesifikasi Fungsional

Setiap item memuat requirement bernomor dan kriteria penerimaan yang bisa diuji.

### FR-1 Command Center (Dashboard)

| ID | Requirement |
|---|---|
| FR-1.1 | Menampilkan antrean hari ini: konten yang harus direview, yang terjadwal, dan yang gagal terbit |
| FR-1.2 | Menampilkan status 9 agen (idle/working/waiting/blocked) yang berasal dari `agent_runs` aktif |
| FR-1.3 | Kartu KPI: post terbit minggu ini, rata-rata waktu review, compliance first-pass rate, autonomy rate |
| FR-1.4 | Panel alert: post ditolak, publish gagal, event pasar berdampak tinggi mendekat, biaya melewati ambang |
| FR-1.5 | Aksi cepat: "Buat carousel baru", "Review berikutnya", "Lihat kantor" |
| FR-1.6 | Seluruh halaman dapat dipakai di layar 390px tanpa horizontal scroll |

**Kriteria penerimaan:** dari halaman ini, satu carousel yang menunggu review bisa dibuka dan disetujui dalam ≤ 3 interaksi. Semua angka di kartu KPI dapat ditelusuri ke query yang menampilkan sumber datanya (tooltip "dari mana angka ini").

### FR-2 Content Pipeline (Kanban)

| ID | Requirement |
|---|---|
| FR-2.1 | Kolom: Brief → Research → Draft → Design → Review → Approved → Scheduled → Published |
| FR-2.2 | Kartu menampilkan kategori, klien, agen pemegang, SLA, versi, jumlah slide |
| FR-2.3 | Drag antar kolom memicu transisi state yang tervalidasi (transisi ilegal ditolak dengan pesan jelas) |
| FR-2.4 | Filter: kategori, klien, rentang tanggal, status kepatuhan, pencarian teks |
| FR-2.5 | Klik kartu membuka drawer: preview slide, caption, temuan compliance, log agen, biaya, tombol retry |
| FR-2.6 | Mendukung operasi massal terbatas: retry render, minta review, jadwalkan |
| FR-2.7 | Task Board adalah tampilan default kerja; Agent Office adalah tampilan alternatif (ADR-04) |

**Kriteria penerimaan:** memindahkan kartu ke `Approved` tanpa approval record ditolak; setiap perubahan status tercatat di `audit_logs`.

### FR-3 Carousel Studio

| ID | Requirement |
|---|---|
| FR-3.1 | Galeri template dengan thumbnail, penyaring kategori dan rasio |
| FR-3.2 | Editor brand kit: warna (primary/secondary/accent/background/text), font (heading/body, unggah file), logo, margin, radius, gaya sudut |
| FR-3.3 | Editor per slide: headline, body, bullet, penekanan, pemilihan template, jenis visual |
| FR-3.4 | **Live preview** di samping editor dengan rasio target yang benar |
| FR-3.5 | Validasi realtime: overflow teks, kontras warna, jumlah kata per slide, aturan "satu slide satu ide" |
| FR-3.6 | Tombol "Render ulang slide ini" (tidak merender seluruh carousel) |
| FR-3.7 | Ekspor: PNG per slide (1080×1350, 1080×1080, 1080×1920), ZIP, dan PDF (untuk LinkedIn) |
| FR-3.8 | Setiap slide menyimpan sumbernya (slide spec JSON) sehingga bisa dirender ulang kapan pun |
| FR-3.9 | Peringatan keras bila pengguna mencoba menaruh teks ke dalam gambar hasil AI generation (lihat FR-3.10) |
| FR-3.10 | AI image generation dibatasi untuk latar/tekstur/ilustrasi tanpa teks, dengan label "AI generated" tersimpan di metadata aset |

**Kriteria penerimaan:** mengubah satu kata pada satu slide lalu render ulang menghasilkan PNG dengan teks tepat, tanpa perlu menyentuh slide lain. Ekspor PDF valid dan dapat diunggah ke LinkedIn sebagai document post.

### FR-4 Calendar & Scheduler

| ID | Requirement |
|---|---|
| FR-4.1 | Tampilan bulan dan minggu dengan slot per platform |
| FR-4.2 | Deteksi bentrok: dua konten kategori sama pada hari sama, atau jeda terlalu dekat |
| FR-4.3 | Deteksi duplikasi konten (kemiripan judul/hook/isi) di seluruh periode |
| FR-4.4 | Saran waktu tayang berdasarkan data metrik historis; default wajar jika belum ada data |
| FR-4.5 | Penjadwalan mengisi `posts.scheduled_at` + timezone klien |
| FR-4.6 | Kalender rencana (editorial plan) terpisah dari kalender jadwal tayang |
| FR-4.7 | Peringatan bila slot kosong pada kategori berjadwal rutin |

**Kriteria penerimaan:** kalender menolak penjadwalan yang melanggar aturan jeda minimal dengan pesan yang menyebut aturan mana yang dilanggar.

### FR-5 Clients & Brand Kit

| ID | Requirement |
|---|---|
| FR-5.1 | CRUD klien: nama, timezone, bahasa, approver, kategori aktif, kontak |
| FR-5.2 | CRUD brand kit dan tokennya, dengan riwayat perubahan dan tombol "aktifkan versi ini" |
| FR-5.3 | Pengelolaan teks disclaimer per kategori dan per platform |
| FR-5.4 | Pengaturan frekuensi per kategori (mis. Edukasi Trading 2×/minggu) |
| FR-5.5 | Batas biaya bulanan per klien |

**Kriteria penerimaan:** menghapus brand kit yang sedang dipakai template aktif ditolak; mengganti brand kit tidak mengubah carousel yang sudah approved (karena versi tersimpan).

### FR-6 Approvals Inbox

| ID | Requirement |
|---|---|
| FR-6.1 | Daftar item menunggu review, diurutkan berdasarkan tenggat dan risiko |
| FR-6.2 | Tampilan review: slide galeri, caption final, hashtag, temuan compliance, sumber riset dengan timestamp |
| FR-6.3 | Aksi: Approve, Minta Revisi, Tolak — masing-masing menyimpan alasan |
| FR-6.4 | Komentar per slide (menempel pada posisi slide) |
| FR-6.5 | Approve massal untuk carousel serupa risiko rendah diperbolehkan; approve massal untuk kategori Outlook/Signal dilarang |
| FR-6.6 | Karakteristik mobile-first: geser untuk melihat slide, tombol besar, tidak perlu zoom |
| FR-6.7 | Menampilkan versi yang akan disetujui; jika isi berubah setelah approve, status otomatis kembali ke `needs_review` |
| FR-6.8 | Notifikasi (in-app + opsional email) saat item baru menunggu review |

**Kriteria penerimaan:** approve dari ponsel dapat diselesaikan tanpa scroll horizontal dan tanpa membuka halaman lain. Perubahan substansi setelah approve otomatis membatalkan approval (tidak boleh ada kondisi "approved tapi isi sudah berubah").

### FR-7 Knowledge Base

| ID | Requirement |
|---|---|
| FR-7.1 | Menyimpan: hook bank, lexicon (pilihan kata khas brand), daftar frasa terlarang, glosarium, template pemenang, catatan kompetitor, catatan post-mortem |
| FR-7.2 | Pencarian teks dan pencarian semantik (embedding) |
| FR-7.3 | Skor dan jumlah pemakaian; hook dengan performa terbaik ditandai |
| FR-7.4 | Agent dapat menyumbang item baru (mis. hook yang menang) dengan status usulan yang perlu dikonfirmasi |
| FR-7.5 | Sinkronisasi dua arah dengan `compliance_rules` untuk frasa terlarang |

**Kriteria penerimaan:** menambahkan frasa terlarang di knowledge base langsung memengaruhi hasil compliance check pada carousel berikutnya tanpa deploy.

### FR-8 Analytics & Report

| ID | Requirement |
|---|---|
| FR-8.1 | Performa per kategori, per platform, per template, per hook |
| FR-8.2 | Leaderboard template dan hook berdasarkan save rate / engagement rate |
| FR-8.3 | Produktivitas agen: jumlah run, tingkat sukses, latency, override manusia |
| FR-8.4 | Biaya: per carousel, per agen, per bulan, dan tren |
| FR-8.5 | Ekspor laporan bulanan (PDF) dan CSV mentah |
| FR-8.6 | Perbandingan periode (bulan ini vs bulan lalu) |

**Kriteria penerimaan:** setiap grafik menyertakan kesimpulan satu kalimat dan definisi metriknya; tidak ada grafik tanpa definisi.

### FR-9 Settings & Integrations

| ID | Requirement |
|---|---|
| FR-9.1 | Role & permission: owner, admin, editor, reviewer, viewer, client-viewer |
| FR-9.2 | Koneksi akun sosial dengan status kesehatan token dan tanggal kedaluwarsa |
| FR-9.3 | Batas anggaran & peringatan biaya |
| FR-9.4 | Preferensi notifikasi |
| FR-9.5 | Audit log yang dapat difilter berdasarkan aktor, aksi, objek, dan tanggal |
| FR-9.6 | Pengelolaan API key (hash saja yang disimpan) |

**Kriteria penerimaan:** seluruh tindakan yang mengubah status konten atau kepatuhan tercatat di `audit_logs` dengan aktor dan nilai sebelum/sesudah.

### FR-10 Virtual Agent Office

| ID | Requirement |
|---|---|
| FR-10.1 | Lima zona: Brief Room, Research Lab, Writing Desk, Design Studio, Review/Compliance Room, Publish Desk |
| FR-10.2 | Setiap agen tampil di zonanya dengan status yang berasal dari `agent_runs`/`pipeline_steps` |
| FR-10.3 | Klik agen/meja membuka drawer: prompt, tool call, output, token, biaya, tombol retry/escalate |
| FR-10.4 | Status `blocked: butuh manusia` dibedakan jelas secara visual (warna + ikon), untuk semua jenis kepatuhan aksesibilitas |
| FR-10.5 | Mode "War Room" saat volatilitas pasar tinggi: semua agen menampilkan keadaan siaga dan prioritas berubah |
| FR-10.6 | Live ticker di Research Lab dari sumber data yang benar (jika belum ada sumber, tampilkan placeholder jujur, bukan angka palsu) |
| FR-10.7 | Daily standup pukul 08:00 waktu klien: ringkasan rencana hari itu |
| FR-10.8 | Drag brief card ke meja = penugasan manual |
| FR-10.9 | Kinerja: canvas tetap ≥ 30 FPS pada perangkat kelas menengah; animasi berhenti saat tab tidak aktif |
| FR-10.10 | Hormati `prefers-reduced-motion`; tersedia tombol "matikan animasi" |
| FR-10.11 | Tampilan alternatif berbasis daftar selalu tersedia (fallback aksesibilitas dan kinerja) |

**Kriteria penerimaan:** tidak ada elemen status di kantor yang tidak dapat ditelusuri ke sebuah baris data. Dengan animasi dimatikan, seluruh informasi tetap terbaca.

### FR-11 Notifikasi & Otomasi Terjadwal

| ID | Requirement |
|---|---|
| FR-11.1 | Notifikasi: item menunggu review, review disetujui/ditolak, render gagal, publish gagal, anggaran hampir habis, event pasar mendekat |
| FR-11.2 | Ringkasan harian pagi dan rekap mingguan |
| FR-11.3 | Job terjadwal: generate rencana bulanan, sync metrik, pembersihan aset yatim, health-check token |
| FR-11.4 | Semua kegagalan job masuk `job_dead_letters` dan dapat dijalankan ulang dari UI |

**Kriteria penerimaan:** kegagalan berulang tidak pernah hilang diam-diam; selalu terlihat di Command Center.

---

## 10. Spesifikasi AI Agent

### 10.1 Roster

| # | Agen | Input | Output | Model policy | Blocking? |
|---|---|---|---|---|---|
| 1 | **Strategist** | Brand kit, kategori aktif, performa historis, kalender | `content_plan` + `brief` (angle, tujuan, audiens, key messages) | Model kuat, suhu rendah | Tidak |
| 2 | **Research & Market** | Brief, daftar sumber RSS/API, kalender ekonomi | `fact_sheet`: klaim + sumber + timestamp + tingkat keyakinan | Model kuat + tool fetch | Tidak |
| 3 | **Copywriter** | Brief + fact sheet + brand tone | `caption_set` per platform, 3 varian hook, hashtag, CTA | Model menengah | Tidak |
| 4 | **Carousel Composer** | Caption + fact sheet + template schema | `slide_spec` JSON (jumlah slide, peran, teks, visual, penekanan) | Model menengah, output schema ketat | Tidak |
| 5 | **Visual Renderer** | slide spec + template version + brand token | PNG per slide, PDF | **Bukan LLM** (Playwright) | Tidak |
| 6 | **Compliance Reviewer** | slide spec + caption + `compliance_rules` | temuan (severity, evidence, rujukan aturan) | Rule engine (blocking) + LLM (advisory) | **Ya** |
| 7 | **Brand Guardian** | Aset terender + brand kit | temuan (kontras, font, logo, margin, tone) | Rule engine + CV sederhana | **Ya** |
| 8 | **Scheduler** | Post approved + preferensi waktu + metrik historis | waktu tayang per platform | Rule/statistik, tanpa LLM | Tidak |
| 9 | **Analyst Agent** | Metrik + riwayat produksi | laporan, umpan balik ke Strategist, usulan hook baru | Model kuat | Tidak |

### 10.2 Kontrak Output

Semua agen LLM **wajib** mengembalikan JSON yang tervalidasi schema (Zod → tabel `agent_definitions.output_schema`). Output bebas teks hanya diizinkan untuk langkah penjelasan, bukan untuk data yang dipakai pipeline.

Aturan:
1. Output tidak valid → perbaikan otomatis maksimum 2 kali dengan pesan galat schema disertakan.
2. Masih gagal → status `awaiting_human` dengan opsi retry/manual edit. **Jangan** memakai output yang tidak tervalidasi.
3. Setiap klaim faktual wajib punya `source_ref` dan `as_of`. Klaim tanpa sumber ditandai dan tidak boleh muncul di slide final tanpa konfirmasi manusia.
4. Tidak ada agen yang boleh menulis ke tabel produksi secara langsung; semua melalui API layer dengan validasi.

### 10.3 Kebijakan Prompt & Guardrail

| Aturan | Keterangan |
|---|---|
| System prompt berversi | Disimpan di `agent_definitions`; perubahan prompt tercatat di `audit_logs` |
| Pelarangan klaim | Instruksi eksplisit melarang klaim profit terjamin, hasil tanpa risiko, atau status berlisensi tanpa dasar |
| Penandaan spekulasi | Konten prospektif wajib dibingkai sebagai skenario, bukan kepastian |
| Sitasi untuk angka | Setiap angka statistik wajib berasal dari fact sheet |
| Pertahanan prompt injection | Konten dari web/berita diperlakukan sebagai data, bukan instruksi; agen tidak menerima perintah dari konten yang diambil |
| Batas biaya | Setiap agent run punya plafon token; melewati plafon → berhenti dan eskalasi |
| Idempotensi | Mengulang langkah yang sama tidak boleh menggandakan aset atau biaya yang tidak perlu (dipakai cache berdasarkan hash input) |

### 10.4 Routing Model & Kendali Biaya

Prinsip: **model mahal hanya untuk keputusan, model murah untuk transformasi.**

| Pekerjaan | Kelas model | Catatan |
|---|---|---|
| Strategi bulanan, analisis akhir, penilaian kepatuhan | Tinggi | Frekuensi rendah, dampak besar |
| Riset & perangkuman sumber, penulisan caption, penyusunan slide spec | Menengah | Frekuensi tinggi |
| Klasifikasi kategori, ekstraksi entitas, pembuatan tag, penyusunan hashtag | Rendah/cepat | Harus paling murah |

Kendali biaya: caching per hash input, plafon per run, batas harian per klien, dan `cost_ledger` yang selalu terisi. Dashboard biaya tidak boleh dianggap fitur sekunder — ini yang menentukan margin jika produk dijual.

---

## 11. Content Engine: Slide Spec & Template

### 11.1 Prinsip Anatomi Carousel

- Panjang ideal **6–10 slide**; batas keras yang direkomendasikan 5–12.
- Slide 1 (hook) menentukan sebagian besar performa; hook harus bisa dibaca dalam < 1,5 detik.
- **Satu slide satu ide.** Validator menolak slide dengan > 2 ide.
- Teks: 40–60 kata per slide body, heading ≤ 8 kata, font minimum 32px pada lebar 1080px.
- Struktur standar: Hook → Isi → Bukti/Contoh → Kesalahan umum → Checklist → Rekap → CTA → Disclaimer (disclaimer dapat digabung ke slide terakhir atau CTA).
- Judul dan teks tidak boleh berada di area aman yang tertutup UI platform.

### 11.2 Struktur Slide Spec (kontrak data)

```jsonc
{
  "carousel_id": "uuid",
  "locale": "id-ID",
  "category_key": "edukasi_propfirm",
  "theme": { "brand_kit_version": 3, "template_slug": "propfirm-rules-table" },
  "slides": [
    {
      "position": 1,
      "role": "hook",                 // hook|body|example|checklist|recap|cta|disclaimer
      "headline": "3 Aturan Drawdown yang Sering Disalahpahami",
      "body": null,
      "bullets": [],
      "emphasis": ["3 Aturan Drawdown"],
      "visual": { "type": "none" },    // none|abstract_bg|chart_snapshot|table|stat_tile
      "template_key": "hook-bold",
      "source_refs": ["fact_14"]
    },
    {
      "position": 2,
      "role": "body",
      "headline": "Static vs Trailing",
      "body": "Static dihitung dari saldo awal; trailing mengikuti ekuitas tertinggi.",
      "bullets": [],
      "visual": { "type": "table", "columns": ["Jenis", "Dasar Hitung"], "rows": [["Static", "Saldo awal"], ["Trailing", "Ekuitas tertinggi"]] },
      "template_key": "table-two-col"
    }
  ],
  "disclaimer_key": "default_finansial",
  "meta": { "generated_by_run": "uuid", "as_of": "2026-10-02T08:00:00+07:00" }
}
```

Aturan validasi schema: `position` berurutan tanpa celah; `role` terisi; `headline` non-kosong; total kata per slide ≤ batas; setiap slide bertipe `example`/`body` yang memuat angka wajib punya `source_refs`.

### 11.3 Definisi Template

Sebuah `template_version` memuat:
1. **HTML + CSS** dengan slot bertipe (`{{headline}}`, `{{body}}`, `{{bullets}}`, `{{table}}`, `{{stat}}`, `{{logo}}`, `{{brand.*}}`).
2. **`schema_json`** yang mendeklarasikan slot mana wajib, batas panjang, dan varian yang diizinkan. Composer hanya boleh mengisi sesuai schema ini.
3. **Thumbnail** hasil render contoh.
4. **Changelog** dan pencipta.

Pembatasan yang disengaja: template **tidak** menerima HTML arbitrer dari LLM. LLM mengisi data; template menentukan tampilan. Ini yang menjamin konsistensi dan keamanan (tidak ada injeksi markup).

### 11.4 Paket Template Awal (Fase 1)

| Slug | Kategori utama | Ciri |
|---|---|---|
| `hook-bold` | Semua | Hook besar, satu aksen warna, ruang kosong luas |
| `concept-one-idea` | Edukasi Trading | Heading + penjelasan singkat + ilustrasi abstrak |
| `propfirm-rules-table` | Edukasi Propfirm | Tabel perbandingan, paling cocok untuk save |
| `journal-stat-tile` | Jurnal Trading | Grid statistik (R-multiple, win rate, equity curve) |
| `news-why-it-matters` | Market Info/News | Struktur: apa terjadi → kenapa penting → dampak, dengan label `as of` |
| `scenario-outlook` | Market Outlook/Signal | Skenario A/B, level invalidasi, kotak disclaimer menonjol |
| `checklist-numbered` | Semua | Daftar bernomor, cocok untuk slide checklist |
| `recap-takeaway` | Semua | 3 poin kesimpulan + CTA |

### 11.5 Profil Keluaran Render

| Profil | Ukuran | Untuk | Catatan |
|---|---|---|---|
| `ig_portrait` | 1080×1350 | Instagram/Facebook carousel | Utama; desain acuan |
| `square` | 1080×1080 | Feed, Threads | Toleransi overflow lebih ketat |
| `story` | 1080×1920 | Story/TikTok photo mode | Perlu area aman UI |
| `linkedin_pdf` | A4 lanskap per slide | LinkedIn document post | LinkedIn tidak lagi mendukung carousel gambar; PDF adalah jalur resminya |
| `pinterest` | 1000×1500 | Pinterest | Format panjang lebih menonjol |

Catatan: seluruh detail kebijakan platform di dokumen ini adalah pemahaman umum dan **wajib diverifikasi ke dokumentasi resmi masing-masing platform** saat implementasi, karena kebijakan berubah tanpa pemberitahuan panjang.

### 11.6 Pipeline Render

1. Ambil `slides` + `template_version` + brand token aktif.
2. Validasi terhadap `schema_json` template → jika gagal, kembalikan ke Composer dengan pesan galat.
3. Bangun HTML per slide pada viewport target; tunggu `document.fonts.ready`.
4. Deteksi overflow (`scrollHeight > clientHeight`) → jika ya, **gagalkan dan minta penyesuaian teks**, jangan memotong teks diam-diam.
5. Screenshot `deviceScaleFactor=2` → PNG.
6. Susun PDF untuk profil yang memerlukan.
7. Unggah ke storage, catat `assets`, isi `carousel_assets`.
8. Sukses/gagal dicatat di `render_jobs` dengan pesan galat yang bisa dibaca manusia.

---

## 12. Virtual Agent Office (2D Isometrik)

### 12.1 Peta Zona

| Zona | Agen | Elemen visual bermakna |
|---|---|---|
| Brief Room | Strategist | Papan brief, kalender, papan rencana bulan |
| Research Lab | Research & Market | Dinding monitor berisi ticker & feed berita nyata, kalender ekonomi |
| Writing Desk | Copywriter | Meja tulis dengan daftar hook, varian caption |
| Design Studio | Carousel Composer + Visual Renderer | Dinding preview carousel yang benar-benar terender |
| Review/Compliance Room | Compliance Reviewer + Brand Guardian | Gerbang visual; item yang diblokir tampak tertahan di gerbang |
| Publish Desk | Scheduler | Konveyor antrean menuju platform |
| Library | Analyst Agent | Arsip aset pemenang, hook bank |

### 12.2 Pemetaan Status (data → visual)

| Status `agent_runs` | Visual | Warna |
|---|---|---|
| `queued` | Duduk, menunggu | Netral |
| `running` | Bekerja di meja, ada indikator progres | Biru |
| `awaiting_human` | Berdiri di gerbang dengan ikon tanda seru | Kuning |
| `failed` (setelah retry) | Meja dengan penanda peringatan | Merah, dengan teks sebab |
| `succeeded` | Idle, menyerahkan hasil ke zona berikutnya | Hijau sesaat |

### 12.3 Interaksi

- Hover: tooltip ringkas (agen, tugas, durasi).
- Klik agen/meja: drawer detail (prompt, tool call, output, token, biaya, tombol retry/escalate/assign).
- Klik item di gerbang compliance: langsung ke temuan dengan evidence.
- Drag brief card ke meja: penugasan manual (membuat `pipeline_run` baru).
- Tombol War Room: menaikkan prioritas konten kategori News/Outlook dan menampilkan semua agen dalam keadaan siaga.

### 12.4 Aturan Kejujuran Data

1. **Dilarang** menampilkan aktivitas agen yang tidak punya jejak di database.
2. Jika sebuah zona tidak punya data (mis. ticker belum dikonfigurasi), tampilkan keadaan kosong yang jujur, bukan angka contoh.
3. Setiap elemen status harus dapat diklik untuk menuju buktinya.
4. Kantor tidak pernah menggantikan kemampuan kerja: semua aksi tersedia di Task Board.

### 12.5 Kinerja & Aksesibilitas

- Hanya zona yang terlihat yang dirender aktif; sisanya di-pause.
- Animasi berhenti saat tab tidak aktif atau saat pengguna memilih reduced motion.
- Info penting tidak pernah disampaikan hanya lewat warna (ADR-04, FR-10.4).
- Target: ≥ 30 FPS pada perangkat kelas menengah dengan 9 agen aktif.

---

## 13. Kepatuhan & Guardrail

### 13.1 Prinsip

Sistem ini memproduksi materi **edukasi dan analisis skenario**, bukan nasihat keuangan. Niche trading propfirm berada di wilayah yang pengaturannya berbeda-beda antar yurisdiksi dan dapat berubah; karena itu framing harus konservatif dan seluruh klaim atributif (mis. "terdaftar", "berlisensi") dilarang tanpa dasar yang dapat diverifikasi. Ketentuan di bawah adalah praktik minimun produk dan **bukan pengganti nasihat hukum profesional**; sebelum dipakai secara komersial, verifikasi ke penasihat hukum di yurisdiksi sasaran.

### 13.2 Lapisan Pemeriksaan

| Lapis | Sifat | Contoh |
|---|---|---|
| L1 — Struktur wajib | Blocking | Disclaimer ada, slide CTA ada, jumlah slide dalam rentang, `as_of` ada untuk konten berita |
| L2 — Frasa terlarang | Blocking | Daftar regex dari `knowledge_items` jenis `banned_phrase` |
| L3 — Klaim angka | Blocking bila tak bersumber | Angka statistik wajib punya `source_ref` |
| L4 — Nuansa & framing | Advisory (butuh konfirmasi manusia) | Klaim tersirat, nada terlalu persuasif, framing berlebihan |
| L5 — Brand | Blocking | Kontras, font, logo, margin, ukuran teks minimum |

### 13.3 Daftar Frasa Terlarang Awal (contoh, dikelola sebagai data)

Pola yang harus diblokir antara lain: janji keuntungan pasti, jaminan payout, klaim profit tanpa kerugian, klaim berlisensi/terdaftar tanpa bukti, ajakan menaruh dana pada instrumen tertentu, dan klaim hasil personal yang tidak dapat dibuktikan. Daftar lengkapnya hidup di `knowledge_items` (FR-7.5) supaya bisa diperbarui tanpa deploy.

### 13.4 Disclaimer Standar

Setiap carousel memuat, pada slide terakhir atau di dalam kotak disclaimer template:
> Materi ini bersifat edukasi dan bukan nasihat keuangan. Trading mengandung risiko kehilangan modal. Kinerja masa lalu tidak menjamin hasil di masa depan.

Untuk konten Outlook/Signal ditambah:
> Ini adalah analisis skenario, bukan ajakan bertransaksi. Selalu gunakan manajemen risiko Anda sendiri.

Untuk konten yang menyebut program evaluasi propfirm:
> Program dapat berubah. Selalu cek aturan resmi di situs penyelenggara sebelum mengambil keputusan mengikuti program.

### 13.5 Jejak Audit

Untuk setiap post tersimpan: versi slide (`carousel_versions`), seluruh hasil pemeriksaan (`compliance_checks`), siapa menyetujui dan kapan (`approvals`), serta hash aset yang disetujui. Tujuan: dapat dibuktikan bahwa apa yang terbit adalah persis apa yang diperiksa. Ini melindungi pemilik dan, bila produk dijual, melindungi klien.

---

## 14. Requirement Non-Fungsional

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Kinerja halaman dashboard | Muat awal < 2,5 detik pada koneksi 4G; interaksi < 200 ms |
| NFR-2 | Kinerja render | 1 carousel 8 slide × 3 profil < 90 detik di worker standar |
| NFR-3 | Skalabilitas | Desain untuk 10.000 carousel/tahun tanpa perubahan skema |
| NFR-4 | Isolasi tenant | Tidak ada kebocoran lintas `org_id`/`client_id`; ada test otomatis khusus |
| NFR-5 | Keamanan | Token sosial media terenkripsi at-rest; rahasia tidak pernah masuk log; API key disimpan sebagai hash |
| NFR-6 | Ketersediaan | 99,5% per bulan untuk app; kegagalan worker tidak menghentikan akses data |
| NFR-7 | Observabilitas | Setiap kegagalan punya jejak langkah, input ringkas, dan pesan galat yang bisa dibaca manusia |
| NFR-8 | Aksesibilitas | WCAG 2.1 AA pada seluruh halaman kerja (kantor memberi alternatif non-visual) |
| NFR-9 | Duplikasi & idempotensi | Mengulang job tidak menggandakan aset/post |
| NFR-10 | Retensi | Aset dan jejak audit disimpan ≥ 24 bulan; pembersihan aset yatim terjadwal |
| NFR-11 | Biaya | Biaya LLM per carousel dipantau; ambang peringatan per klien |
| NFR-12 | Portabilitas data | Ekspor seluruh data klien (JSON + aset) tersedia kapan pun |
| NFR-13 | Bahasa | UI dan keluaran konten Indonesia; skema mendukung `locale` untuk perluasan |
| NFR-14 | Lokalisasi waktu | Semua waktu disimpan UTC, ditampilkan dalam timezone klien |

---

## 15. Integrasi Platform

| Platform | Dukungan carousel gambar | Jalur MVP | Jalur Fase 3 | Catatan |
|---|---|---|---|---|
| Instagram | Ya | Export manual | Graph API (butuh akun Business + proses review aplikasi) | App review punya waktu tunggu; jangan jadikan penghalang peluncuran |
| Facebook Page | Ya (multi-foto) | Export manual | Graph API | Jalur API paling mudah; kandidat pertama |
| Threads | Ya | Export manual | API tersedia | — |
| LinkedIn | Hanya PDF/document | Export PDF manual | API document post | Carousel gambar tidak didukung; PDF adalah format resmi |
| TikTok | Photo mode | Export manual | Content Posting API (akses terbatas) | Ketersediaan API perlu diverifikasi; jangan diandalkan di awal |
| X | Maksimum 4 gambar | Export manual | Terbatas | Bukan prioritas MVP |
| Pinterest | Ya | Export manual | API | Cocok untuk konten edukasi finansial |

**Keputusan penting:** Fase 1 **tidak menunggu API**. Jalur manual (ZIP + caption siap salin + deep link + pengingat) sudah memenuhi kebutuhan produksi nyata dan menghilangkan ketergantungan pada proses review pihak ketiga.

---

## 16. Roadmap & Milestone

| Fase | Durasi perkiraan | Isi | Milestone terverifikasi |
|---|---|---|---|
| **0 — Fondasi** | 1–2 hari | Kunci ADR, finalisasi skema, setup repo & environment | Skema DB dimigrasikan; aplikasi kosong berjalan |
| **1 — Content Engine** | 2–3 minggu | Brand kit, 8 template, Composer, Copywriter, renderer Playwright, rule engine, queue board, approvals, export | **5 carousel produksi nyata** (satu per kategori) terbit manual di platform |
| **2 — Dashboard & Office** | 2–3 minggu | Kalender, scheduler, knowledge base, analytics dasar, trace viewer, kantor 2D isometrik, cost meter | 1 bulan konten terkelola penuh dari dalam platform; biaya per carousel terukur |
| **3 — Distribusi** | 3 minggu | Publish FB → IG, penarikan metrik, auto-report, feedback loop | ≥ 80% publish otomatis; metrik tersinkron harian |
| **4 — Skala** | Berkelanjutan | Multi-tenant, portal klien, billing/metering, video engine, office 3D | Klien pertama memakai platform sendiri |

**Aturan urutan yang tidak boleh dilanggar:** Content Engine lebih dulu, Virtual Agent Office kemudian. Kantor adalah lapisan presentasi dari proses yang sudah bekerja; membangunnya lebih dulu menghasilkan demo tanpa produksi.

---

## 17. KPI Produk

| Kategori | Metrik | Target awal |
|---|---|---|
| Volume | Carousel terbit per minggu | 5–7 |
| Efisiensi | Waktu kerja manusia per carousel (di luar review) | ≤ 5 menit |
| Efisiensi | Waktu brief → siap review | ≤ 30 menit |
| Kepatuhan | Compliance first-pass rate | ≥ 85% |
| Kepatuhan | Insiden konten berisiko terbit | 0 |
| Kualitas | Save rate rata-rata per kategori | Naik dari bulan ke bulan |
| Kepercayaan | Tingkat override manusia atas keputusan agen | Menurun seiring waktu |
| Otonomi | Persentase tugas yang selesai tanpa rework | Naik dari bulan ke bulan |
| Ekonomi | Biaya LLM + render per carousel | Dipantau; ambang peringatan ditetapkan |
| Kecepatan | Median waktu review | ≤ 2 menit per carousel |

Catatan penting: **autonomy rate dan override rate** adalah dua metrik yang menunjukkan apakah AI-nya benar-benar bekerja. Jumlah post yang banyak tanpa dua metrik ini bisa menyembunyikan kerja manual besar.

---

## 18. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Konten signal/outlook memicu pembatasan akun | Kehilangan kanal | Framing skenario, disclaimer wajib, human gate, batas frekuensi, hindari klaim aksi |
| Kebijakan API platform berubah atau review lama | Distribusi terhambat | Jalur manual selalu tersedia; jangan bergantung pada satu platform |
| Teks tidak muat dan terpotong pada tampilan platform | Konten rusak | Validator overflow yang menggagalkan render, bukan memotong teks |
| Biaya LLM membengkak | Margin negatif | Caching, routing model, plafon per run, ledger biaya, peringatan anggaran |
| Kualitas template terasa generik | Kredibilitas turun | Galeri template bertambah bertahap; template pemenang diangkat dari analitik |
| Data riset kadaluarsa atau salah | Konten menyesatkan | `as_of` wajib + sitasi sumber + label keyakinan; konten berita punya masa simpan |
| Virtual Agent Office jadi beban perawatan | Waktu habis untuk memoles UI | Kantor dibangun di Fase 2, informasi status diturunkan dari data yang sudah ada |
| Ketergantungan pada satu vendor LLM | Harga/kebijakan berubah | Lapisan abstraksi provider; prompt dan schema tidak terikat vendor |
| Skema tidak siap multi-tenant saat dijual | Refactor besar | ADR-03: `org_id` sejak awal + test isolasi |
| Pengguna tunggal kelelahan review | Konten menumpuk | Approve massal untuk risiko rendah, ringkasan pagi, keputusan dalam ≤ 3 interaksi |

---

## 19. Estimasi Biaya (Indikatif)

Angka berikut adalah perkiraan kasar untuk perencanaan, bukan penawaran.

**Biaya pengembangan:** dikerjakan sendiri dengan bantuan AI coding agent. Perkiraan total sampai akhir Fase 2: 4–6 minggu kerja efektif. Fase 3 menambah 3 minggu.

**Biaya operasional per bulan (estimasi, 40 carousel/bulan ≈ 320 slide):**

| Komponen | Perkiraan |
|---|---|
| LLM (routing bertingkat, dengan caching) | US$5–20 |
| Render worker (Railway/Fly.io kecil) | US$5–15 |
| Database + storage | US$0–25 (tier awal biasanya cukup) |
| App hosting (Vercel) | US$0–20 |
| Domain & lain-lain | US$2–5 |
| **Total** | **± US$12–85 per bulan** |

Yang paling berpengaruh pada biaya adalah panjang carousel, jumlah varian caption, dan seberapa sering langkah riset diulang. `cost_ledger` ada tepat untuk mengukur ini secara nyata, bukan menebak.

---

## 20. Pertanyaan Terbuka & Keputusan Berikutnya

Pertanyaan yang belum terjawab dan perlu keputusan sebelum atau selama Fase 1:

| # | Pertanyaan | Mengapa penting | Perlu dijawab sebelum |
|---|---|---|---|
| Q-1 | Platform mana yang menjadi kanal utama pertama? | Menentukan profil render prioritas dan bentuk export | Akhir Fase 1 |
| Q-2 | Apakah akan ada afiliasi propfirm? | Bila ya, wajib disclosure dan aturan tambahan | Fase 2 |
| Q-3 | Sumber data pasar/fakta pakai apa (RSS, API gratis, API berbayar)? | Menentukan kemampuan dan biaya Research Agent | Fase 1 (langkah riset) |
| Q-4 | Bahasa konten: Indonesia saja, atau dua bahasa? | Menentukan cakupan template dan validasi teks | Fase 1 |
| Q-5 | Berapa batas biaya bulanan yang dapat diterima? | Menentukan plafon per run dan routing model | Fase 1 |
| Q-6 | Apakah ada kebutuhan domain/wajah brand (logo, font berlisensi)? | Menentukan asset library | Fase 1 |
| Q-7 | Jika dijual, model harga apa (langganan, per carousel, kredit)? | Menentukan kebutuhan metering di skema | Fase 3 (namun skema sudah disiapkan) |

---

## Lampiran A — Enum Utama

| Enum | Nilai |
|---|---|
| `risk_level` (kategori) | `low`, `medium`, `high` |
| `brief.status` | `draft`, `approved`, `converted`, `cancelled` |
| `carousel.status` | `briefed`, `researching`, `drafting`, `designing`, `rendering`, `needs_review`, `changes_requested`, `approved`, `scheduled`, `published`, `failed`, `archived` |
| `slide.role` | `hook`, `body`, `example`, `checklist`, `recap`, `cta`, `disclaimer` |
| `slide.visual_type` | `none`, `abstract_bg`, `chart_snapshot`, `table`, `stat_tile` |
| `agent_run.status` | `queued`, `running`, `succeeded`, `failed`, `awaiting_human`, `cancelled` |
| `pipeline_step.status` | `pending`, `running`, `succeeded`, `failed`, `skipped`, `blocked` |
| `render_job.status` | `queued`, `rendering`, `succeeded`, `failed` |
| `asset.kind` | `slide_png`, `carousel_pdf`, `zip`, `chart_snapshot`, `logo`, `font`, `texture`, `upload` |
| `asset.source` | `rendered`, `ai_generated`, `uploaded`, `licenced` |
| `compliance.severity` | `block`, `warn`, `info` |
| `compliance.result` | `pass`, `fail`, `warn`, `skipped` |
| `approval.subject_type` | `carousel`, `post`, `brief` |
| `approval.status` | `pending`, `approved`, `rejected`, `changes_requested`, `expired` |
| `post.status` | `draft`, `needs_review`, `approved`, `scheduled`, `queued`, `publishing`, `published`, `partially_failed`, `failed`, `cancelled` |
| `post_variant.status` | `pending`, `uploaded`, `published`, `failed` |
| `platform` | `instagram`, `facebook`, `threads`, `linkedin`, `tiktok`, `x`, `pinterest` |
| `knowledge.kind` | `hook_bank`, `lexicon`, `banned_phrase`, `glossary`, `winning_template`, `competitor_note`, `post_mortem` |
| `membership.role` | `owner`, `admin`, `editor`, `reviewer`, `viewer`, `client_viewer` |
| `actor_type` | `user`, `system`, `agent` |
| `office_zone` | `brief_room`, `research_lab`, `writing_desk`, `design_studio`, `review_room`, `publish_desk`, `library` |

---

## Lampiran B — Glosarium

| Istilah | Arti dalam dokumen ini |
|---|---|
| **Carousel** | Satu set slide gambar yang tayang sebagai satu post |
| **Slide spec** | Representasi data carousel (JSON) yang menjadi sumber render |
| **Hook** | Slide pertama yang tugasnya menghentikan scroll |
| **Propfirm** | Penyelenggara program evaluasi/simulasi untuk trader (bukan broker); pengaturannya berbeda antar yurisdiksi |
| **Drawdown** | Batas penurunan ekuitas yang diizinkan aturan program |
| **Human gate** | Titik di mana pekerjaan otomatis berhenti dan menunggu keputusan manusia |
| **Pipeline run** | Satu instance proses produksi untuk satu brief/carousel |
| **Agent run** | Satu eksekusi satu agen, dengan input, output, biaya, dan durasi |
| **Autonomy rate** | Persentase tugas agen yang diterima tanpa perbaikan manusia |
| **Compliance first-pass rate** | Persentase carousel yang lolos pemeriksaan tanpa revisi |
| **Tenant** | Satu organisasi pengguna platform (konsep untuk skema multi-klien) |
