# PRD: Aplikasi Try Out Online dengan Mode Ujian Aman (Exam Browser)

Versi 1.0 · Draft · 26 November 2026

## 1. Ringkasan

Aplikasi ini memungkinkan guru, sekolah, atau lembaga bimbel menyelenggarakan try out online yang aman, mudah, dan hasilnya langsung terbaca. Siswa mengerjakan soal di dalam **mode ujian aman** (seperti Exam Browser / Safe Exam Browser): layar terkunci pada aplikasi ujian, tidak bisa membuka aplikasi lain, tidak bisa menyalin atau menangkap layar, dan aktivitas mencurigakan dicatat. Guru mendapat bank soal, penjadwalan, pemantauan langsung, dan analisis hasil otomatis.

**Nama kerja produk:** TryOut Aman (dapat diganti).

**Pernyataan produk:** "Ujian daring yang tertib dan jujur, dengan pengelolaan semudah membuat formulir."

## 2. Latar Belakang dan Masalah

Try out biasanya dilakukan di kertas atau lewat formulir daring biasa. Keduanya punya kelemahan:

- Kertas: koreksi lama, rekap nilai manual, biaya cetak, analisis butir soal sulit.
- Formulir daring biasa: siswa mudah membuka browser lain, mencari jawaban, atau berbagi tautan dan jawaban.
- Perangkat siswa beragam (HP Android, laptop, Chromebook) dan koneksi di banyak sekolah tidak stabil.
- Guru butuh laporan cepat: nilai per siswa, per kompetensi, dan soal mana yang paling sulit.

## 3. Tujuan dan Metrik Keberhasilan

| Tujuan | Metrik | Target (6 bulan setelah rilis) |
|---|---|---|
| Ujian tertib dan aman | Persentase sesi ujian selesai tanpa pelanggaran kritis | ≥ 90% |
| Mudah dipakai guru | Waktu membuat satu paket try out 30 soal | ≤ 15 menit |
| Andal di koneksi buruk | Sesi yang selesai walau koneksi putus sesaat | ≥ 98% |
| Hasil cepat | Waktu dari ujian selesai ke laporan tersedia | ≤ 1 menit |
| Adopsi | Sekolah/kelas aktif per bulan | 100 kelas |

## 4. Bukan Tujuan (Versi 1)

- Bukan sistem ujian resmi bertaruh tinggi (ujian akhir, seleksi nasional) yang butuh pengawasan ketat dan sertifikasi.
- Bukan sistem manajemen pembelajaran (LMS) lengkap.
- Pengawasan kamera/AI proctoring penuh belum masuk versi 1.
- Tidak menyediakan konten soal komersial; konten dibuat atau diimpor pengguna.

## 5. Pengguna dan Persona

**Guru / Pembuat soal.** Membuat soal, menjadwalkan, memantau, melihat hasil. Tidak selalu mahir teknologi; butuh alur sederhana.

**Siswa / Peserta.** Mengerjakan soal di HP atau laptop. Perlu tampilan jelas, tombol besar, dan tidak panik saat koneksi putus.

**Pengawas / Proktor.** Memantau ruang ujian secara langsung, membuka kunci peserta bila ada kendala teknis.

**Admin sekolah / lembaga.** Mengelola akun guru, kelas, dan peserta; melihat rekap.

**Orang tua (opsional, fase 2).** Melihat hasil anak.

## 6. Ruang Lingkup Platform

| Komponen | Teknologi/Platform | Keterangan |
|---|---|---|
| Aplikasi peserta (mode ujian aman) | Android (prioritas), Windows, Chromebook; iOS menyusul | Aplikasi native, bukan sekadar situs web |
| Dasbor guru/admin | Web responsif | Dipakai di laptop, nyaman juga di HP |
| Backend & API | Layanan cloud | Penyimpanan soal, jawaban, log |

Catatan penting: **situs web biasa tidak dapat mengunci perangkat.** Penguncian layar dan pemblokiran aplikasi lain hanya andal bila dilakukan oleh aplikasi native memakai fitur sistem operasi. Karena itu aplikasi peserta harus berupa aplikasi terpasang.

## 7. Kebutuhan Fungsional

Prioritas: **P0** = wajib MVP, **P1** = penting, **P2** = nanti.

### 7.1 Akun dan Manajemen Pengguna

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-101 | Guru dan admin masuk dengan email/kata sandi atau akun Google | P0 |
| F-102 | Admin membuat kelas dan mengimpor daftar siswa lewat CSV/Excel | P0 |
| F-103 | Siswa masuk dengan kode kelas + nama/NISN, atau PIN ujian sekali pakai (tanpa email, cocok untuk anak SD/SMP) | P0 |
| F-104 | Peran dan hak akses: admin, guru, pengawas, siswa | P0 |
| F-105 | Reset kata sandi/PIN oleh guru atau admin | P1 |

### 7.2 Bank Soal dan Pembuatan Paket

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-201 | Tipe soal: pilihan ganda, pilihan ganda kompleks, benar/salah, menjodohkan, isian singkat | P0 |
| F-202 | Uraian/esai dengan penilaian manual oleh guru | P1 |
| F-203 | Soal dapat berisi teks, gambar, tabel, rumus matematika | P0 |
| F-204 | Soal berbasis stimulus (satu bacaan, beberapa pertanyaan) | P1 |
| F-205 | Impor soal dari Word/Excel dengan templat baku | P0 |
| F-206 | Pengelompokan soal per mata pelajaran, topik, tingkat kesulitan, dan kompetensi | P1 |
| F-207 | Pembahasan/kunci penjelasan per soal, dapat ditampilkan setelah ujian | P1 |
| F-208 | Paket try out: pilih soal manual atau acak dari bank soal dengan aturan komposisi | P0 |
| F-209 | Acak urutan soal dan urutan opsi jawaban per peserta | P0 |
| F-210 | Bobot nilai per soal dan opsi nilai minus untuk jawaban salah | P1 |

### 7.3 Penjadwalan dan Pengaturan Ujian

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-301 | Jadwal: tanggal, jam buka, jam tutup, durasi pengerjaan | P0 |
| F-302 | Peserta per kelas atau pilihan individu | P0 |
| F-303 | Token/kode akses ujian yang ditampilkan pengawas pada hari-H | P0 |
| F-304 | Pengaturan: boleh kembali ke soal sebelumnya, tampilkan nilai langsung/tidak, jumlah percobaan | P1 |
| F-305 | Pengerjaan ulang (remedial) bagi peserta tertentu dengan izin guru | P1 |
| F-306 | Pengingat otomatis ke peserta (notifikasi) | P2 |

### 7.4 Pengerjaan Ujian oleh Siswa

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-401 | Tampilan soal satu per satu dengan navigasi nomor, penanda ragu-ragu, dan indikator terjawab | P0 |
| F-402 | Pewaktu mundur yang bersumber dari server (bukan jam perangkat) | P0 |
| F-403 | Simpan jawaban otomatis setiap kali memilih (autosave) | P0 |
| F-404 | Tetap bisa mengerjakan saat koneksi putus; jawaban disimpan lokal terenkripsi dan disinkronkan saat tersambung | P0 |
| F-405 | Pulihkan sesi bila aplikasi tertutup atau baterai habis; waktu tetap berjalan sesuai server | P0 |
| F-406 | Layar konfirmasi sebelum kumpul, menampilkan soal yang belum dijawab | P0 |
| F-407 | Kumpul otomatis saat waktu habis | P0 |
| F-408 | Ukuran huruf dapat diperbesar; kontras tinggi; dukungan layar kecil | P1 |

### 7.5 Mode Ujian Aman (Exam Browser)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-501 | Mode layar penuh terkunci; peserta tidak dapat pindah ke aplikasi lain selama ujian | P0 |
| F-502 | Blokir tangkapan layar dan perekaman layar | P0 |
| F-503 | Blokir salin-tempel, bagikan teks, dan menu konteks | P0 |
| F-504 | Deteksi keluar aplikasi, pindah jendela, atau layar terbagi; catat sebagai pelanggaran | P0 |
| F-505 | Kebijakan pelanggaran dapat diatur guru: peringatan, kunci sementara, atau kumpul paksa setelah N pelanggaran | P0 |
| F-506 | Deteksi mode pengembang, emulator, root/jailbreak, dan layar cermin (sebatas yang mungkin) | P1 |
| F-507 | Pengawas dapat membuka kunci peserta dengan kode dan alasan tercatat | P0 |
| F-508 | Notifikasi sistem dibungkam selama ujian | P1 |
| F-509 | Verifikasi versi aplikasi: versi lama atau yang dimodifikasi tidak diizinkan masuk | P1 |
| F-510 | Pemeriksaan kesiapan perangkat sebelum ujian (baterai, ruang, koneksi, izin) | P1 |

**Pendekatan teknis per platform (acuan awal):**

- **Android:** Lock Task Mode / screen pinning, `FLAG_SECURE` untuk blokir tangkapan layar, deteksi perubahan fokus. Mode kios penuh membutuhkan perangkat terkelola; untuk HP pribadi, gunakan screen pinning ditambah deteksi pelanggaran.
- **Windows:** aplikasi desktop dengan mode kios/penguncian, atau integrasi dengan Safe Exam Browser.
- **Chromebook:** aplikasi/ekstensi dalam sesi kios terkelola.
- **iOS:** Automatic Assessment Configuration atau Guided Access; kemampuan terbatas, jadi iOS ditunda ke fase berikutnya.

Penguncian di perangkat pribadi tidak pernah 100% kedap. Produk harus menggabungkan penguncian teknis, pencatatan pelanggaran, dan pengawasan manusia.

### 7.6 Pemantauan Langsung

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-601 | Dasbor langsung: siapa sudah masuk, sedang mengerjakan, selesai, terputus | P0 |
| F-602 | Progres per peserta (jumlah soal terjawab) dan sisa waktu | P0 |
| F-603 | Umpan pelanggaran langsung dengan tingkat keparahan | P0 |
| F-604 | Aksi pengawas: tambah waktu, buka kunci, keluarkan peserta, paksa kumpul | P0 |
| F-605 | Pengumuman ke seluruh peserta (misalnya "waktu tersisa 10 menit") | P1 |

### 7.7 Penilaian dan Laporan

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F-701 | Penilaian otomatis untuk tipe objektif segera setelah kumpul | P0 |
| F-702 | Antarmuka koreksi esai dengan rubrik sederhana | P1 |
| F-703 | Rekap nilai per kelas dan per siswa; ekspor ke Excel/PDF | P0 |
| F-704 | Analisis butir soal: tingkat kesulitan, daya pembeda, efektivitas pengecoh | P1 |
| F-705 | Analisis per kompetensi/topik untuk melihat materi yang perlu diperkuat | P1 |
| F-706 | Laporan individu siswa: nilai, jawaban, pembahasan, riwayat pelanggaran | P0 |
| F-707 | Perbandingan antar try out untuk melihat perkembangan | P2 |
| F-708 | Log audit lengkap per sesi (waktu masuk, jawaban, pelanggaran, aksi pengawas) | P1 |

## 8. Alur Pengguna Utama

**Guru membuat dan menjalankan try out**

1. Masuk ke dasbor, buat paket try out (impor soal atau pilih dari bank soal).
2. Atur jadwal, durasi, kelas peserta, dan kebijakan pelanggaran.
3. Hari-H: buka ruang ujian, bagikan token akses.
4. Pantau dasbor langsung; tangani kendala peserta.
5. Setelah ujian ditutup, tinjau hasil, koreksi esai, ekspor laporan.

**Siswa mengerjakan**

1. Buka aplikasi, masuk dengan kode kelas dan identitas.
2. Pemeriksaan kesiapan perangkat; masukkan token ujian.
3. Masuk mode aman, kerjakan soal; jawaban tersimpan otomatis.
4. Kumpulkan atau otomatis terkumpul saat waktu habis.
5. Lihat hasil sesuai pengaturan guru.

## 9. Kebutuhan Non-Fungsional

**Kinerja dan skala**

- Mendukung minimal 1.000 peserta serentak pada MVP, dengan jalur peningkatan hingga 10.000.
- Waktu muat soal ≤ 2 detik pada koneksi 3G/4G biasa; soal dan gambar dimuat di awal (prefetch) agar tidak tersendat.
- Aplikasi ringan: ukuran pemasangan ≤ 50 MB; jalan di Android 8 ke atas dengan RAM 2 GB.

**Keandalan**

- Ketersediaan layanan ≥ 99,5% pada jam ujian.
- Tidak ada kehilangan jawaban: setiap jawaban punya penanda waktu dan nomor urut untuk sinkronisasi aman.
- Mode luring tahan putus hingga 15 menit atau selama sisa durasi ujian.

**Keamanan**

- Soal dienkripsi saat transit dan saat disimpan; paket soal di perangkat dienkripsi dan hanya dibuka saat ujian dimulai.
- Token ujian berumur pendek; satu akun satu sesi aktif.
- Penanda air (nama/ID peserta) samar pada layar untuk mencegah pemotretan.
- Perlindungan terhadap manipulasi permintaan jaringan, pemutaran ulang, dan perubahan jam perangkat.

**Privasi dan kepatuhan**

- Mematuhi UU Pelindungan Data Pribadi (UU PDP). Data siswa di bawah umur diperlakukan khusus: kumpulkan seperlunya, butuh persetujuan sekolah/orang tua.
- Tidak ada perekaman kamera/mikrofon pada versi 1. Bila fase 2 menambahkannya, wajib persetujuan eksplisit dan masa simpan terbatas.
- Pengguna dapat meminta ekspor dan penghapusan data.

**Aksesibilitas dan bahasa**

- Bahasa Indonesia sebagai utama; struktur siap multibahasa.
- Kontras warna memadai, ukuran sentuh minimal 48 dp, dukungan pembaca layar dasar.

## 10. Arsitektur Tingkat Tinggi

- **Aplikasi peserta (native):** modul penguncian, penyimpanan lokal terenkripsi, mesin sinkronisasi, pewaktu berbasis offset server.
- **Dasbor web:** manajemen soal, jadwal, pemantauan, laporan.
- **API backend:** autentikasi, penyajian paket soal, penerimaan jawaban, penilaian, pelaporan.
- **Kanal waktu nyata:** WebSocket atau serupa untuk dasbor pemantauan dan perintah pengawas.
- **Basis data:** relasional untuk soal, ujian, hasil; penyimpanan objek untuk gambar dan ekspor.
- **Antrean tugas:** penilaian massal, pembuatan laporan, ekspor.

## 11. Model Data Garis Besar

- **Organisasi** → punya **Pengguna** (peran) dan **Kelas**.
- **Soal** (tipe, isi, opsi, kunci, pembahasan, topik, kesulitan) → dikelompokkan dalam **Paket**.
- **Ujian** (paket, jadwal, durasi, pengaturan, kebijakan) → ditugaskan ke **Kelas/Peserta**.
- **Sesi** (peserta, ujian, status, waktu mulai/selesai, perangkat) → memiliki **Jawaban** dan **Peristiwa** (pelanggaran, aksi pengawas).
- **Hasil** (nilai, rincian per soal/kompetensi).

## 12. Rencana Rilis

**Fase 1 (MVP, ± 3 bulan)**

- Akun guru/siswa, kelas, impor siswa.
- Pilihan ganda dan benar/salah, impor soal dari templat.
- Penjadwalan, token ujian, acak soal.
- Aplikasi Android dengan mode aman dasar, autosave dan pemulihan.
- Dasbor pemantauan langsung, nilai otomatis, ekspor Excel.

**Fase 2 (± 3 bulan berikutnya)**

- Windows dan Chromebook, tipe soal tambahan, esai dan rubrik.
- Analisis butir soal dan per kompetensi.
- Pemeriksaan integritas perangkat lebih ketat, notifikasi, remedial.

**Fase 3**

- iOS, portal orang tua, bank soal bersama antar guru.
- Opsi proctoring berbantuan AI dengan persetujuan eksplisit.
- Integrasi dengan Dapodik/rapor atau LMS.

## 13. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Perangkat pribadi tidak bisa dikunci penuh | Kecurangan lolos | Kombinasi penguncian, deteksi, pencatatan, dan pengawas manusia; jelaskan batasan ke guru |
| Koneksi sekolah buruk | Ujian terganggu | Prefetch soal, mode luring, sinkronisasi bertahap |
| Lonjakan peserta serentak | Server lambat | Uji beban, skala otomatis, antrean jawaban |
| Perbedaan perangkat Android | Fitur kunci tidak konsisten | Matriks perangkat uji, fallback deteksi pelanggaran |
| Kebocoran soal | Reputasi dan nilai produk turun | Enkripsi, penanda air, token berumur pendek, log audit |
| Data anak di bawah umur | Risiko hukum dan etika | Minimalisasi data, persetujuan, kebijakan retensi |
| Positif palsu pelanggaran (misalnya panggilan masuk) | Siswa dihukum tidak adil | Ambang toleransi, peninjauan pengawas, kebijakan peringatan dulu |

## 14. Kriteria Penerimaan Contoh

- **Autosave:** Jika koneksi putus saat siswa menjawab soal 12, lalu tersambung kembali 5 menit kemudian, seluruh jawaban soal 1 sampai 12 tampil lengkap di server dan tidak ada yang hilang.
- **Pewaktu:** Jika siswa menutup aplikasi 3 menit lalu membukanya lagi, sisa waktu berkurang 3 menit sesuai waktu server.
- **Penguncian:** Saat siswa menekan tombol Beranda atau membuka aplikasi lain, pelanggaran tercatat dalam 2 detik dan muncul di dasbor pengawas; kebijakan yang dipilih guru dijalankan.
- **Tangkapan layar:** Upaya tangkapan layar menghasilkan gambar hitam dan tercatat sebagai peristiwa.
- **Penilaian:** Setelah siswa mengumpulkan, nilai pilihan ganda muncul di laporan guru dalam 60 detik.

## 15. Pertanyaan Terbuka

1. Siapa target utama pertama: sekolah negeri, sekolah swasta, atau lembaga bimbel? Ini menentukan model bisnis dan perangkat yang dipakai.
2. Perangkat siswa: milik pribadi (BYOD), milik sekolah, atau keduanya? Ini menentukan seberapa ketat penguncian bisa dilakukan.
3. Model monetisasi: gratis untuk guru dengan batas peserta, langganan per sekolah, atau per ujian?
4. Apakah perlu kesesuaian dengan kurikulum tertentu (misalnya tag kompetensi Kurikulum Merdeka) sejak awal?
5. Apakah diperlukan mode luring penuh untuk sekolah tanpa internet saat ujian, misalnya server lokal di sekolah?
6. Seberapa jauh pengawasan kamera dibutuhkan dan dapat diterima secara hukum dan sosial?
