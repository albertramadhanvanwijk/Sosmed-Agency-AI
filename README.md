# PropDesk AI

**AI Social Media Agency OS untuk niche Trading Propfirm**

Platform operasi sosial media berbasis AI untuk konten carousel: **dashboard produksi**, **9 agen AI**, dan **Virtual Agent Office 2D isometrik** dengan status yang berasal dari data nyata.

Berjalan penuh di satu mesin lokal. Teks konten dari **9Router** (`localhost:20128`), gambar slide dirender lokal dari template HTML. **Tidak ada unggahan otomatis** — hasil produksi disimpan di folder `output/` untuk diunggah manual.

---

## Bukti bahwa ini berjalan

| Yang diuji | Hasil |
|---|---|
| Render HTML → PNG | 9 template, 0 teks terpotong, 2160×2700 piksel per slide |
| Uji unit kepatuhan | **20/20 lulus** |
| Uji integrasi pipeline | **13/13 lulus** |
| Produksi nyata 5 kategori | 5/5 berhasil via 9Router, biaya nyata tercatat |
| Antarmuka Studio | 6 tab, 0 galat konsol, 0 permintaan gagal |

---

## Mulai cepat

```powershell
npm install                 # hanya playwright-core yang wajib

# Siapkan berkas .env.local di akar proyek dengan dua pengaturan:
#   1. kunci akses 9Router — nilainya disalin dari aplikasi 9Router, menu API Keys
#   2. alamat dasar 9Router  — misalnya http://127.0.0.1:20128/v1
#
# Nama variabel yang dikenali ada di dalam packages/llm/client.ts, dan
# contoh lengkapnya tersedia di .env.local.example.

npm run probe:models        # periksa model 9Router mana yang aktif
npm run studio              # buka http://127.0.0.1:4321
```

Perintah lain:

```powershell
npm run carousel:demo       # hasilkan contoh tanpa memanggil model
npm run carousel:all        # produksi nyata satu carousel per kategori
npm test                    # 20 uji unit kepatuhan
npm run test:integration    # 13 uji integrasi pipeline (merender PNG sungguhan)
npm run llm:smoke           # uji koneksi 9Router
npm run render:check        # uji seluruh template
typecheck                   # npm run typecheck
```

---

## Alur Produksi

```
Ide
 │
 ├─ 1. Strategist         → sudut pandang dan pesan kunci
 ├─ 2. Research           → fakta bersumber + penanda waktu
 ├─ 3. Copywriter         → caption per platform
 ├─ 4. Carousel Composer  → slide spec (DATA terstruktur)
 │
 ├─ 5. Mesin Kepatuhan    → aturan KODE (dapat MEMBLOKIR)  ← gerbang
 ├─ 6. Peninjau Nuansa    → penilaian MODEL (peringatan saja)
 │
 ├─ 7. Visual Renderer    → HTML → PNG/PDF (Chromium, bukan model gambar)
 ├─ 8. Scheduler          → saran waktu tayang
 └─ 9. Analyst            → penilaian dan aset yang layak disimpan
                            │
                            ▼
                  needs_review  ← PEMILIK PROYEK MENYETUJUI DI SINI
                            │
                            ▼
                   output/  (diunggah manual)
```

**Tidak ada jalur otomatis dari produksi ke publikasi.** Gerbang kepatuhan bahkan muncul sebelum gambar dibuat.

---

## Keputusan Arsitektur yang Dikunci

Tujuh keputusan yang paling mahal jika diubah belakangan. Detail dan alasannya di [`docs/PRD-PropDesk-AI.md`](docs/PRD-PropDesk-AI.md) §5.

| ID | Keputusan | Bukti di kode |
|---|---|---|
| ADR-01 | Teks dirender deterministik, **bukan** digenerate model gambar | `packages/templates/`, `packages/renderer/` |
| ADR-02 | Human gate **wajib** sebelum publish | `packages/studio/db.ts` → `decideCarousel` menolak menyetujui carousel yang diblokir |
| ADR-03 | Skema **tenant-ready** sejak awal | `org_id` dan `client_id` di semua tabel |
| ADR-04 | Kantor 2D isometrik, Task Board tetap jalur kerja utama | `packages/studio/ui.ts`, status dari `agent_runs` |
| ADR-05 | Image-only di MVP, model data siap untuk video | `CarouselSpec.slides` menyimpan seluruh data yang diperlukan |
| ADR-06 | Kepatuhan = rule engine (blocking) + model (advisory) | `packages/compliance/engine.ts` |
| ADR-07 | Format unggulan gambar; video adalah rencana berikutnya | — |

---

## Mengapa teks dirender, bukan digenerate gambar

Keputusan ini yang paling menentukan kualitas produk:

| | Model gambar | Template HTML |
|---|---|---|
| Teks | Sering salah huruf | Tepat huruf per huruf |
| Revisi satu kata | Regenerasi seluruh gambar | Ubah data, render ulang |
| Format lain | Buat ulang | Hampir gratis |
| Pemeriksaan otomatis | Tidak mungkin | Overflow, kontras, jumlah kata |
| Jejak audit | Tidak ada | Slide spec tersimpan |

Konsekuensinya: satu slide spec dapat dirender ke **Instagram, Story, Square, LinkedIn PDF, dan Pinterest** tanpa biaya tambahan. Inilah leverage utama produk ini.

### Pelajaran penting: satu profile rasio sempat mematahkan yang lain

Ukuran font template memakai satuan yang mengikuti **lebar** kanvas, sedangkan yang berbeda antar profil adalah **tinggi**-nya. Akibatnya slide yang muat di Instagram 4:5 (1080×1350) meluap di Square 1:1 (1080×1080) — dan karena render menolak memotong teks, seluruh carousel gagal setelah puluhan panggilan model terlanjur dibayar.

Dua perbaikan yang dilakukan:

1. **Skala tipografi mengikuti tinggi kanvas.** Ruang tata letak selalu disetel setinggi acuan (1350px), lalu hasilnya diperkecil ke ukuran keluaran. Dengan begitu satu slide spec muat di semua profil tanpa mengubah teksnya.
2. **Anggaran teks diperiksa sebelum biaya dikeluarkan.** `packages/templates/text-budget.ts` menjadi satu-satunya sumber kebenaran batas teks per peran slide dan per profil, dan angka itu yang dikirim ke model. Sebelumnya daftar batas ditulis ulang di pipeline, sehingga bisa menyimpang dari kenyataan.

Pemeriksaannya tersedia lewat `npm run check:budget`, yang menguji **seluruh kombinasi kategori × peran slide × 5 profil rasio** dengan perkiraan kasus terburuk.

---

## Kepatuhan Dua Lapis

Ini bukan satu pemeriksaan, melainkan dua dengan sifat berbeda.

**Lapis kode (memblokir, tidak bisa dibujuk):**

| Aturan | Sifat |
|---|---|
| Disclaimer wajib ada | BLOKIR |
| Tidak ada judul/isi kosong | BLOKIR |
| Disclaimer dapat diselesaikan | BLOKIR |
| Klaim profit pasti, bebas risiko, cepat kaya | BLOKIR |
| Ajakan bertransaksi langsung | BLOKIR |
| Ajakan menyetor dana | BLOKIR |
| Klaim lisensi tanpa dasar | BLOKIR |
| Angka tanpa rujukan sumber | BLOKIR |
| Slide pertama bukan hook | peringatan |
| Klaim penghasilan pribadi | peringatan |
| Frasa "tanpa kerugian" | peringatan (perlu tinjauan manusia) |

**Lapis model (peringatan saja):** menemukan klaim tersirat. Contoh nyata dari produksi ini — model menandai kalimat *"Pemilihan yang tepat mencegah kegagalan evaluasi"* karena menjanjikan hasil, padahal tidak ada satu kata pun yang terlarang di dalamnya. Lapis kode tidak akan pernah menemukan itu.

Pemeriksa teks juga menangkap upaya penyamaran: spasi berlebih, huruf lebar penuh, karakter tak terlihat, dan pemisahan antar huruf (`p.a.s.t.i`).

---

## Virtual Agent Office

2D isometrik dengan **proyeksi terhitung**, bukan ruang tiga dimensi. Tujuh zona berurutan mengikuti alur produksi: Ruang Brief → Laboratorium Riset → Meja Penulisan → Studio Desain → Ruang Peninjauan → Meja Terbit → Arsip Pengetahuan.

Aturan yang ditegakkan:

1. **Setiap status berasal dari baris `agent_runs`.** Tidak ada status palsu atau angka contoh.
2. **Zona tanpa aktivitas ditampilkan sebagai keadaan kosong yang jujur**, bukan disembunyikan.
3. **Informasi penting tidak pernah hanya disampaikan lewat warna.** Agen gagal memakai label teks `GAGAL`, agen dengan temuan memakai `N TEMUAN`.
4. **Tersedia Mode Teks** — tabel berisi informasi yang sama, untuk pembaca layar dan perangkat lambat.
5. **Menghormati `prefers-reduced-motion`** dan menyediakan sakelar animasi.
6. **Task Board tetap lengkap.** Kantor adalah lapisan status, bukan satu-satunya cara bekerja.

---

## Struktur Proyek

```
packages/
  shared/      Tipe domain, 5 kategori, brand kit, tema, profil rasio
  llm/         Klien 9Router: routing model, retry, cache, validasi keluaran
  agents/      Prompt 9 agen + pipeline produksi
  templates/   9 template HTML/CSS + registry + validator + anggaran teks
  renderer/    Chromium → PNG/PDF, pengukuran overflow, penggabung PDF
  compliance/  Rule engine deterministik + daftar aturan
  studio/      Server dashboard, basis data, antarmuka web
  cli/         Perintah produksi baris perintah
tests/
  unit/        20 uji kepatuhan
  integration/ 13 uji pipeline (merender PNG sungguhan)
docs/
  PRD-PropDesk-AI.md       Spesifikasi produk lengkap
  SKEMA-DATABASE.md        DDL PostgreSQL untuk versi multi-klien
output/                    Hasil produksi (tidak diunggah otomatis)
storage/                   Cache model dan basis data Studio
```

---

## Basis Data

Studio memakai **`node:sqlite` bawaan Node 24**, sehingga tidak memerlukan server basis data untuk dijalankan. Bentuk tabelnya sengaja dibuat sama dengan [`docs/SKEMA-DATABASE.md`](docs/SKEMA-DATABASE.md) (PostgreSQL): setiap tabel operasional punya `org_id`, setiap tabel konten punya `client_id`.

Memindahkan ke PostgreSQL untuk versi multi-klien nanti hanya perlu penyesuaian tipe, bukan perancangan ulang.

Tabel `approvals` dan `audit_log` bukan hiasan — keduanya yang membuat klaim "tidak ada publikasi tanpa persetujuan manusia" dapat **dibuktikan**, bukan hanya dijanjikan.

---

## Konfigurasi Model

Routing ditentukan dari hasil `npm run probe:models` pada mesin ini, bukan dari asumsi. Model yang ada di katalog tetapi tidak lolos probe sengaja tidak dicantumkan, supaya kegagalan tidak terulang di produksi.

| Kelas tugas | Model utama | Untuk apa |
|---|---|---|
| `decision` | `My_Agents` | Strategi, penilaian kepatuhan, analisis akhir |
| `transform` | `gemini/gemini-3.5-flash-lite` | Riset, caption, slide spec |
| `extract` | `ollama/gpt-oss:120b` | Tugas ringan, paling cepat |

Catatan penting: **9Router di mesin ini tidak memiliki satu pun model penghasil gambar** (0 dari 106 model). Ini justru mengonfirmasi ADR-01 — teks dan gambar memang harus dipisahkan.

Model dapat diubah di `packages/llm/client.ts` → `MODEL_ROUTING`.

---

## Yang Belum Ada

Batasan yang perlu diketahui sebelum memakainya:

- **Grafik pasar tidak dibuat otomatis.** `chart_snapshot` hanya menandai tempat; tangkapan grafik disiapkan manusia. Sistem tidak memiliki akses data pasar berlisensi, dan mengarang level harga jauh lebih berbahaya daripada mengosongkan tempatnya.
- **Unggahan sepenuhnya manual**, sesuai keputusan proyek.
- **Multi-klien belum aktif.** Skemanya sudah siap, tetapi antarmuka masih satu pengguna.
- **Portal klien, billing, dan video belum dikerjakan** (Fase 3-4 di PRD).
- **Kategori berita belum tersambung ke sumber berita nyata.** Agen riset akan jujur menyatakan keterbatasan datanya ketimbang mengarang.

---

## Catatan Kepatuhan

Produk ini menghasilkan materi **edukasi dan analisis skenario**, bukan nasihat keuangan. Niche trading propfirm diatur berbeda-beda antar yurisdiksi dan ketentuannya dapat berubah.

Praktik minimum yang diterapkan platform adalah *recommended practice*, **bukan pengganti nasihat hukum profesional**. Verifikasi ke penasihat hukum di yurisdiksi sasaran sebelum dipakai secara komersial.

Disklaimer standar yang dipakai platform ada di `packages/shared/brand.ts` → `DEFAULT_DISCLAIMERS`.
