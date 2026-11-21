import type { Question, ExamConfig } from '../types/cbt';

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  id: 'tryout-tka-sd-2026',
  title: 'Tryout TKA SD — Tes Kemampuan Akademik',
  subtitle:
    'Bahasa Indonesia & Matematika · Pilihan Ganda, Pilihan Ganda Kompleks (Benar/Salah), & MCMA',
  durationMinutes: 90,
  antiCheatEnabled: true,
  globalSuspended: false,
  maxViolationsBeforeLock: 1,
};

export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'tka-sd-1',
    type: 'multiple_choice',
    subject: 'Matematika — Bilangan',
    difficulty: 'medium',
    prompt:
      'Ibu membeli $\\frac{3}{4}$ kg gula pasir untuk membuat kue, lalu membeli lagi $1\\frac{1}{2}$ kg di warung. Jika sebanyak $\\frac{5}{8}$ kg gula pasir telah digunakan untuk adonan, berapakah sisa gula pasir Ibu sekarang?',
    points: 15,
    direction: 'ltr',
    options: [
      { id: 'a', text: '$1\\frac{3}{8}$ kg' },
      { id: 'b', text: '$1\\frac{5}{8}$ kg' },
      { id: 'c', text: '$1\\frac{7}{8}$ kg' },
      { id: 'd', text: '$2\\frac{1}{8}$ kg' },
    ],
    correctOptionId: 'b',
  },
  {
    id: 'tka-sd-2',
    type: 'multiple_choice',
    subject: 'Bahasa Indonesia — Teks Informasi',
    difficulty: 'easy',
    prompt:
      'Bacalah teks berikut!\n\n"Hutan bakau (mangrove) di pesisir pantai berperan penting menahan abrasi akibat gelombang laut. Selain itu, akar-akar bakau yang rapat menjadi tempat berlindung bagi ikan kecil, udang, dan kepiting sebelum mencari makan di laut lepas."\n\nBerdasarkan teks tersebut, manfaat utama akar bakau yang rapat bagi biota laut adalah ....',
    points: 15,
    direction: 'ltr',
    options: [
      { id: 'a', text: 'Menjadi tempat berlindung ikan kecil, udang, dan kepiting' },
      { id: 'b', text: 'Menghasilkan gelombang laut yang lebih besar di pesisir' },
      { id: 'c', text: 'Menggantikan fungsi air tawar bagi penduduk sekitar pantai' },
      { id: 'd', text: 'Mempercepat pengikisan tanah di sepanjang garis pantai' },
    ],
    correctOptionId: 'a',
  },
  {
    id: 'tka-sd-3',
    type: 'mcma',
    subject: 'Matematika — Bilangan',
    difficulty: 'easy',
    prompt:
      'Perhatikan kelompok bilangan berikut: $11, 15, 17, 21, 23$.\nManakah di antara bilangan-bilangan tersebut yang merupakan **bilangan prima** antara $10$ dan $25$? (Pilih lebih dari satu jawaban yang benar)',
    points: 20,
    direction: 'ltr',
    scoringMode: 'partial',
    options: [
      { id: 'a', text: '$11$' },
      { id: 'b', text: '$15$' },
      { id: 'c', text: '$17$' },
      { id: 'd', text: '$21$' },
      { id: 'e', text: '$23$' },
    ],
    correctOptionIds: ['a', 'c', 'e'],
  },
  {
    id: 'tka-sd-4',
    type: 'mcma',
    subject: 'Bahasa Indonesia — Teks Fiksi',
    difficulty: 'medium',
    prompt:
      'Bacalah cuplikan cerita berikut!\n\n"Setiap pulang sekolah, Bima menyempatkan diri merawat kebun sayur kecil di belakang rumah bersama adiknya. Saat musim kemarau panjang tiba dan banyak tanaman tetangga layu, Bima membagikan hasil panen bayam dan tomatnya tanpa meminta bayaran. Ia juga mengajak teman-temannya menampung air cucian beras untuk menyiram tanaman."\n\nSikap terpuji yang ditunjukkan tokoh Bima dalam cerita tersebut adalah .... (Pilih lebih dari satu jawaban yang benar)',
    points: 20,
    direction: 'ltr',
    scoringMode: 'partial',
    options: [
      { id: 'a', text: 'Peduli terhadap lingkungan dengan memanfaatkan air bekas cucian beras' },
      { id: 'b', text: 'Suka berbagi hasil panen kepada tetangga saat kesulitan' },
      { id: 'c', text: 'Menjual seluruh hasil panen dengan harga tinggi ketika kemarau' },
      { id: 'd', text: 'Tekun dan rajin merawat tanaman bersama anggota keluarga' },
    ],
    correctOptionIds: ['a', 'b', 'd'],
  },
  {
    id: 'tka-sd-5',
    type: 'true_false',
    subject: 'Matematika — Geometri & Pengukuran',
    difficulty: 'hard',
    prompt:
      'Sebuah taman sekolah berbentuk gabungan persegi berukuran sisi $s = 12\\text{ m}$ dan kolam berbentuk persegi panjang berukuran $p = 10\\text{ m}$ dan $l = 6\\text{ m}$. Tentukan **Benar** atau **Salah** untuk setiap pernyataan berikut!',
    points: 15,
    direction: 'ltr',
    statements: [
      {
        id: 's1',
        text: 'Luas taman berbentuk persegi adalah $L = s^2 = 144\\text{ m}^2$.',
        isTrue: true,
      },
      {
        id: 's2',
        text: 'Jumlah besar sudut dalam sebuah bangun datar segitiga adalah $360^\\circ$.',
        isTrue: false,
      },
      {
        id: 's3',
        text: 'Keliling kolam persegi panjang adalah $K = 2(p+l) = 32\\text{ m}$.',
        isTrue: true,
      },
    ],
  },
  {
    id: 'tka-sd-6',
    type: 'true_false',
    subject: 'Bahasa Indonesia — Teks Informasi',
    difficulty: 'hard',
    prompt:
      'Bacalah teks informasi berikut!\n\n"Program Bank Sampah Sekolah Dasar Nusantara mengajak siswa memilah sampah plastik dan kertas setiap hari Jumat. Sampah yang terkumpul ditimbang dan dicatat ke dalam buku tabungan kelas. Dana hasil daur ulang digunakan untuk membeli buku bacaan di pojok baca kelas."\n\nBerdasarkan teks di atas, tentukan apakah setiap pernyataan berikut **Benar (Sesuai)** atau **Salah (Tidak Sesuai)**!',
    points: 15,
    direction: 'ltr',
    statements: [
      {
        id: 's1',
        text: 'Kegiatan pemilahan sampah di SD Nusantara dilaksanakan rutin setiap hari Jumat.',
        isTrue: true,
      },
      {
        id: 's2',
        text: 'Seluruh jenis sampah termasuk sisa makanan basah ditimbang di Bank Sampah.',
        isTrue: false,
      },
      {
        id: 's3',
        text: 'Hasil penjualan sampah daur ulang dimanfaatkan untuk menambah koleksi buku pojok baca kelas.',
        isTrue: true,
      },
    ],
  },
];
