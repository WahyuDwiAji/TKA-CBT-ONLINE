import * as XLSX from 'xlsx';
import type {
  ChoiceOption,
  Question,
  QuestionDifficulty,
  QuestionType,
  StudentMaster,
  TeacherMaster,
  TextDirection,
  TrueFalseStatement,
} from '../types/cbt';
import { QUESTION_DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../types/cbt';

export interface ImportParsedRow {
  rowNumber: number;
  rawType: string;
  detectedType: QuestionType | null;
  subject: string;
  difficulty: QuestionDifficulty;
  prompt: string;
  points: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  question: Question | null;
  summaryText: string;
}

export interface BulkImportParseResult {
  rows: ImportParsedRow[];
  validCount: number;
  invalidCount: number;
  byType: Record<QuestionType, number>;
  sourceLabel: string;
}

function normalizeHeader(h: unknown): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getField(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const val = record[alias];
    if (val !== undefined && String(val).trim().length > 0) {
      return String(val).trim();
    }
  }
  return '';
}

export function detectQuestionType(raw: string): QuestionType | null {
  const norm = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (
    norm === 'pg' ||
    norm === 'multiple_choice' ||
    norm === 'pilihan_ganda' ||
    norm === 'pilgan' ||
    norm === 'mc'
  ) {
    return 'multiple_choice';
  }
  if (
    norm === 'mcma' ||
    norm === 'multiple_choice_multiple_answer' ||
    norm === 'multiple_answer' ||
    norm === 'multi_answer' ||
    norm === 'pilihan_ganda_banyak_jawaban'
  ) {
    return 'mcma';
  }
  if (
    norm === 'pgk' ||
    norm === 'pilihan_ganda_kompleks' ||
    norm === 'pg_kompleks' ||
    norm === 'kompleks' ||
    norm === 'bs' ||
    norm === 'b_s' ||
    norm === 'true_false' ||
    norm === 'benar_salah' ||
    norm === 'benar_atau_salah' ||
    norm === 'pgk_kategori' ||
    norm === 'pg_kompleks_kategori' ||
    norm === 'kategori' ||
    norm === 'sesuai_tidak_sesuai' ||
    norm === 'tf'
  ) {
    return 'true_false';
  }
  return null;
}

function detectDirection(raw: string, prompt: string): TextDirection {
  const norm = raw.trim().toLowerCase();
  if (norm === 'rtl' || norm === 'arab' || norm === 'kanan_kiri') return 'rtl';
  if (norm === 'ltr' || norm === 'kiri_kanan') return 'ltr';
  if (/[\u0600-\u06FF]/.test(prompt)) return 'rtl';
  return 'auto';
}

export function detectDifficulty(raw: string): QuestionDifficulty {
  const norm = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (norm === 'mudah' || norm === 'easy' || norm === 'rendah' || norm === 'lots' || norm === 'c1' || norm === 'c2') {
    return 'easy';
  }
  if (norm === 'sulit' || norm === 'hard' || norm === 'sukar' || norm === 'hots' || norm === 'tinggi' || norm === 'c5' || norm === 'c6') {
    return 'hard';
  }
  return 'medium';
}

function splitMultiEntries(raw: string): string[] {
  if (!raw.trim()) return [];
  if (raw.includes('\n')) {
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (raw.includes(';')) {
    return raw
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (raw.includes('|')) {
    return raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [raw.trim()];
}

function buildOptionsFromRow(record: Record<string, string>): ChoiceOption[] {
  const cols: Array<{ id: string; aliases: string[] }> = [
    { id: 'a', aliases: ['opsi_a', 'pilihan_a', 'option_a', 'a'] },
    { id: 'b', aliases: ['opsi_b', 'pilihan_b', 'option_b', 'b'] },
    { id: 'c', aliases: ['opsi_c', 'pilihan_c', 'option_c', 'c'] },
    { id: 'd', aliases: ['opsi_d', 'pilihan_d', 'option_d', 'd'] },
    { id: 'e', aliases: ['opsi_e', 'pilihan_e', 'option_e', 'e'] },
  ];

  const collected: ChoiceOption[] = [];
  for (const col of cols) {
    const val = getField(record, col.aliases);
    if (val) {
      collected.push({ id: col.id, text: val });
    }
  }
  if (collected.length > 0) return collected;

  const combined = getField(record, ['opsi', 'pilihan', 'options']);
  if (combined) {
    return splitMultiEntries(combined).map((text, idx) => ({
      id: String.fromCharCode(97 + idx),
      text,
    }));
  }
  return [];
}


function parseTrueFalseStatements(
  record: Record<string, string>
): { statements: TrueFalseStatement[]; invalidEntries: string[] } {
  const raw = getField(record, [
    'pernyataan',
    'statements',
    'kunci',
    'kunci_jawaban',
    'jawaban',
  ]);
  const entries: string[] = raw
    ? splitMultiEntries(raw)
    : [
        getField(record, ['opsi_a', 'pilihan_a', 'a']),
        getField(record, ['opsi_b', 'pilihan_b', 'b']),
        getField(record, ['opsi_c', 'pilihan_c', 'c']),
        getField(record, ['opsi_d', 'pilihan_d', 'd']),
        getField(record, ['opsi_e', 'pilihan_e', 'e']),
      ].filter(Boolean);

  const statements: TrueFalseStatement[] = [];
  const invalidEntries: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Support: "Teks [Benar]" or "Teks (Salah)" or "Teks = Benar" or "Teks :: B"
    const bracketMatch = entry.match(/^(.+?)\s*[\[(]\s*(benar|salah|true|false|b|s|t|f)\s*[\])]\s*$/i);
    const sepMatch = entry.match(/^(.+?)\s*(?:=>|->|::|=)\s*(benar|salah|true|false|b|s|t|f)\s*$/i);
    const match = bracketMatch || sepMatch;

    if (!match) {
      invalidEntries.push(entry);
      continue;
    }

    const text = match[1].trim();
    const flag = match[2].trim().toLowerCase();
    const isTrue = flag === 'benar' || flag === 'true' || flag === 'b' || flag === 't';
    if (text) {
      statements.push({ id: `s${statements.length + 1}`, text, isTrue });
    }
  }

  return { statements, invalidEntries };
}

function validateAndConvertRecords(
  records: Array<{ rowNumber: number; fields: Record<string, string> }>,
  sourceLabel: string,
  bankId?: string
): BulkImportParseResult {
  const rows: ImportParsedRow[] = [];
  const byType: Record<QuestionType, number> = {
    multiple_choice: 0,
    complex_multiple_choice: 0,
    mcma: 0,
    matching: 0,
    true_false: 0,
    essay: 0,
  };

  for (const { rowNumber, fields } of records) {
    const rawType = getField(fields, [
      'jenis',
      'jenis_soal',
      'type',
      'tipe',
      'tipe_soal',
    ]);
    const subject =
      getField(fields, ['mapel', 'mata_pelajaran', 'subject', 'topik']) || 'Umum';
    const rawDifficulty = getField(fields, [
      'tingkat_kesulitan',
      'kesulitan',
      'difficulty',
      'level',
    ]);
    const difficulty = detectDifficulty(rawDifficulty);
    const prompt = getField(fields, [
      'pertanyaan',
      'soal',
      'prompt',
      'teks_soal',
      'question',
    ]);
    const rawPoints = getField(fields, ['bobot', 'points', 'poin', 'skor']);
    const rawDirection = getField(fields, ['arah', 'direction', 'arah_teks']);

    const errors: string[] = [];
    const warnings: string[] = [];

    const detectedType = detectQuestionType(rawType);
    if (!rawType) {
      errors.push('Kolom "jenis" wajib diisi (PG, PGK, atau MCMA).');
    } else if (!detectedType) {
      errors.push(
        `Jenis soal "${rawType}" tidak tersedia untuk TKA. Gunakan hanya: PG (Pilihan Ganda), PGK (Pilihan Ganda Kompleks Benar/Salah), atau MCMA.`
      );
    }

    if (!prompt) {
      errors.push('Kolom "pertanyaan" tidak boleh kosong.');
    }

    let points = 10;
    if (!rawPoints) {
      warnings.push('Bobot kosong, otomatis diatur 10 poin.');
    } else {
      const parsedNum = Number(rawPoints.replace(',', '.'));
      if (Number.isNaN(parsedNum) || parsedNum <= 0 || parsedNum > 100) {
        errors.push(`Bobot "${rawPoints}" tidak valid (harus angka 1–100).`);
      } else {
        points = Math.round(parsedNum * 100) / 100;
      }
    }

    const direction = detectDirection(rawDirection, prompt);
    const id = `q-imp-${Date.now()}-${rowNumber}-${Math.random().toString(36).slice(2, 5)}`;

    let question: Question | null = null;
    let summaryText = '—';

    if (detectedType === 'multiple_choice') {
      const options = buildOptionsFromRow(fields);
      if (options.length < 2) {
        errors.push('Pilihan Ganda memerlukan minimal 2 opsi jawaban (opsi_a, opsi_b, dst.).');
      }
      const rawKey = getField(fields, ['kunci', 'kunci_jawaban', 'jawaban', 'answer']);
      const normalizedKey = rawKey.toLowerCase();
      let matchedOpt = options.find((o) => o.id === normalizedKey);
      if (!matchedOpt && rawKey) {
        // Check numeric 1..5 or text match
        const idxMatch = /^[1-5]$/.test(rawKey)
          ? options[Number(rawKey) - 1]
          : options.find((o) => o.text.toLowerCase() === normalizedKey);
        if (idxMatch) matchedOpt = idxMatch;
      }
      if (!rawKey) {
        errors.push('Kunci jawaban PG wajib diisi (misal: A, B, C, D, atau E).');
      } else if (!matchedOpt && options.length >= 2) {
        errors.push(
          `Kunci "${rawKey}" tidak cocok dengan opsi yang tersedia (${options
            .map((o) => o.id.toUpperCase())
            .join(', ')}).`
        );
      }

      if (errors.length === 0 && matchedOpt) {
        question = {
          id,
          bankId,
          type: 'multiple_choice',
          subject,
          difficulty,
          prompt,
          points,
          direction,
          options,
          correctOptionId: matchedOpt.id,
        };
        summaryText = `${options.length} opsi · Kunci: ${matchedOpt.id.toUpperCase()}`;
      }
    } else if (detectedType === 'mcma') {
      const options = buildOptionsFromRow(fields);
      if (options.length < 2) {
        errors.push('MCMA memerlukan minimal 2 opsi jawaban (opsi_a, opsi_b, dst.).');
      }
      const rawKey = getField(fields, ['kunci', 'kunci_jawaban', 'jawaban', 'answer']);
      const keyTokens = rawKey
        .split(/[,;|/\s]+/)
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      const validOptionIds = new Set(options.map((o) => o.id));
      const matchedKeys = Array.from(
        new Set(keyTokens.filter((k) => validOptionIds.has(k)))
      );
      const unknownKeys = keyTokens.filter((k) => !validOptionIds.has(k));

      if (!rawKey || keyTokens.length === 0) {
        errors.push('Kunci MCMA wajib diisi (pisahkan koma, misal: A,C,D).');
      } else if (unknownKeys.length > 0) {
        errors.push(
          `Kunci "${unknownKeys.join(', ').toUpperCase()}" tidak ada pada opsi (${options
            .map((o) => o.id.toUpperCase())
            .join(', ')}).`
        );
      } else if (matchedKeys.length === 1) {
        warnings.push('MCMA hanya memiliki 1 kunci benar.');
      }

      if (errors.length === 0 && matchedKeys.length > 0) {
        question = {
          id,
          bankId,
          type: 'mcma',
          subject,
          difficulty,
          prompt,
          points,
          direction,
          options,
          correctOptionIds: matchedKeys,
          scoringMode: 'partial',
        };
        summaryText = `${options.length} opsi · Kunci: ${matchedKeys
          .map((k) => k.toUpperCase())
          .join(', ')}`;
      }
    } else if (detectedType === 'true_false') {
      const { statements, invalidEntries } = parseTrueFalseStatements(fields);
      if (invalidEntries.length > 0) {
        errors.push(
          `Format pernyataan Pilihan Ganda Kompleks (B/S) tidak valid: "${invalidEntries[0]}". Gunakan format "Pernyataan 1 [Benar]; Pernyataan 2 [Salah]".`
        );
      }
      if (statements.length < 1) {
        errors.push(
          'Pilihan Ganda Kompleks (PGK) memerlukan minimal 1 pernyataan dengan tanda [Benar] atau [Salah] (atau gunakan jenis MCMA untuk soal pilihan ganda banyak jawaban).'
        );
      }
      if (errors.length === 0) {
        question = {
          id,
          bankId,
          type: 'true_false',
          subject,
          difficulty,
          prompt,
          points,
          direction,
          statements,
        };
        summaryText = `${statements.length} pernyataan (${statements
          .map((s) => (s.isTrue ? 'B' : 'S'))
          .join('/')})`;
      }
    }

    const valid = errors.length === 0 && question !== null;
    if (valid && detectedType) {
      byType[detectedType] += 1;
    }

    rows.push({
      rowNumber,
      rawType: rawType || '—',
      detectedType,
      subject,
      difficulty,
      prompt: prompt || '—',
      points,
      valid,
      errors,
      warnings,
      question,
      summaryText,
    });
  }

  return {
    rows,
    validCount: rows.filter((r) => r.valid).length,
    invalidCount: rows.filter((r) => !r.valid).length,
    byType,
    sourceLabel,
  };
}

export async function parseQuestionSpreadsheetFile(
  file: File,
  bankId?: string
): Promise<BulkImportParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      byType: {
        multiple_choice: 0,
        complex_multiple_choice: 0,
        mcma: 0,
        matching: 0,
        true_false: 0,
        essay: 0,
      },
      sourceLabel: file.name,
    };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      byType: {
        multiple_choice: 0,
        complex_multiple_choice: 0,
        mcma: 0,
        matching: 0,
        true_false: 0,
        essay: 0,
      },
      sourceLabel: file.name,
    };
  }

  const headers = matrix[0].map(normalizeHeader);
  const records: Array<{ rowNumber: number; fields: Record<string, string> }> = [];

  for (let i = 1; i < matrix.length; i++) {
    const rowArr = matrix[i];
    if (!rowArr || rowArr.every((cell) => String(cell ?? '').trim() === '')) {
      continue;
    }
    const fields: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      if (h) {
        fields[h] = String(rowArr[colIdx] ?? '').trim();
      }
    });
    records.push({ rowNumber: i + 1, fields });
  }

  return validateAndConvertRecords(records, file.name, bankId);
}

export function parseQuestionDelimitedText(
  rawText: string,
  bankId?: string
): BulkImportParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      rows: [],
      validCount: 0,
      invalidCount: 0,
      byType: {
        multiple_choice: 0,
        complex_multiple_choice: 0,
        mcma: 0,
        matching: 0,
        true_false: 0,
        essay: 0,
      },
      sourceLabel: 'Teks Tempel',
    };
  }

  // Detect tab-delimited (Excel copy-paste) or CSV
  const firstLine = trimmed.split(/\r?\n/)[0] || '';
  if (firstLine.includes('\t') || (firstLine.includes(',') && /jenis|pertanyaan|type|prompt/i.test(firstLine))) {
    const wb = XLSX.read(trimmed, {
      type: 'string',
      FS: firstLine.includes('\t') ? '\t' : ',',
    });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    if (matrix.length > 1) {
      const headers = matrix[0].map(normalizeHeader);
      const records: Array<{ rowNumber: number; fields: Record<string, string> }> = [];
      for (let i = 1; i < matrix.length; i++) {
        const rowArr = matrix[i];
        if (!rowArr || rowArr.every((c) => String(c ?? '').trim() === '')) continue;
        const fields: Record<string, string> = {};
        headers.forEach((h, colIdx) => {
          if (h) fields[h] = String(rowArr[colIdx] ?? '').trim();
        });
        records.push({ rowNumber: i + 1, fields });
      }
      return validateAndConvertRecords(records, 'Teks Spreadsheet', bankId);
    }
  }

  // Fallback: Pipe-delimited quick format supporting the 3 official TKA types:
  // PG | Mapel | Pertanyaan | Opsi A | Opsi B | Opsi C | Opsi D | Kunci
  // MCMA | Mapel | Pertanyaan | Opsi A | Opsi B | Opsi C | Opsi D | A,C
  // PGK | Mapel | Pertanyaan | Pernyataan 1 [Benar]; Pernyataan 2 [Salah]
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const records: Array<{ rowNumber: number; fields: Record<string, string> }> = lines.map(
    (line, idx) => {
      const parts = line.split('|').map((p) => p.trim());
      const firstAsType = detectQuestionType(parts[0] || '');
      if (firstAsType) {
        const fields: Record<string, string> = {
          jenis: parts[0],
          mapel: parts[1] || 'Umum',
          pertanyaan: parts[2] || '',
          bobot: '10',
        };
        if (firstAsType === 'multiple_choice' || firstAsType === 'mcma') {
          const optSlice = parts.slice(3, Math.max(3, parts.length - 1));
          ['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e'].forEach((col, oi) => {
            if (optSlice[oi]) fields[col] = optSlice[oi];
          });
          fields.kunci = parts[parts.length - 1] || '';
        } else if (firstAsType === 'true_false') {
          fields.pernyataan = parts[3] || '';
          if (parts[4]) fields.bobot = parts[4];
        }
        return { rowNumber: idx + 1, fields };
      }

      // Legacy PG quick line: Pertanyaan | A | B | C | D | Kunci
      const fields: Record<string, string> = {
        jenis: 'PG',
        mapel: 'Umum',
        pertanyaan: parts[0] || '',
        bobot: '10',
      };
      const optSlice = parts.slice(1, Math.max(1, parts.length - 1));
      ['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e'].forEach((col, oi) => {
        if (optSlice[oi]) fields[col] = optSlice[oi];
      });
      fields.kunci = parts[parts.length - 1] || '';
      return { rowNumber: idx + 1, fields };
    }
  );

  return validateAndConvertRecords(records, 'Input Teks Baris', bankId);
}

const TEMPLATE_HEADERS = [
  'jenis',
  'mapel',
  'tingkat_kesulitan',
  'pertanyaan',
  'bobot',
  'arah',
  'opsi_a',
  'opsi_b',
  'opsi_c',
  'opsi_d',
  'opsi_e',
  'kunci',
  'pernyataan',
];

const TEMPLATE_SAMPLE_ROWS: string[][] = [
  [
    'PG',
    'Matematika — Bilangan',
    'Sedang',
    'Ibu membeli $\\frac{3}{4}$ kg gula pasir, lalu membeli lagi $1\\frac{1}{2}$ kg. Jika $\\frac{5}{8}$ kg sudah digunakan, berapakah sisa gula pasir Ibu?',
    '15',
    'ltr',
    '$1\\frac{3}{8}$ kg',
    '$1\\frac{5}{8}$ kg',
    '$1\\frac{7}{8}$ kg',
    '$2\\frac{1}{8}$ kg',
    '',
    'B',
    '',
  ],
  [
    'PG',
    'Bahasa Indonesia — Teks Informasi',
    'Mudah',
    'Hutan bakau di pesisir pantai menahan abrasi gelombang laut serta menjadi tempat berlindung ikan kecil dan udang. Manfaat akar bakau bagi biota laut adalah...',
    '15',
    'ltr',
    'Tempat berlindung ikan kecil dan udang',
    'Memperbesar gelombang laut di pesisir',
    'Menggantikan sumber air tawar warga',
    'Mempercepat pengikisan tanah pantai',
    '',
    'A',
    '',
  ],
  [
    'MCMA',
    'Matematika — Bilangan',
    'Mudah',
    'Manakah bilangan berikut yang termasuk bilangan prima antara 10 dan 25?',
    '20',
    'ltr',
    '11',
    '15',
    '17',
    '21',
    '23',
    'A,C,E',
    '',
  ],
  [
    'MCMA',
    'Bahasa Indonesia — Teks Fiksi',
    'Sedang',
    'Bima rajin merawat kebun sayurnya dan membagikan hasil panen secara gratis kepada tetangga saat kemarau. Sikap terpuji tokoh Bima adalah...',
    '20',
    'ltr',
    'Peduli dan suka berbagi dengan tetangga',
    'Tekun dan rajin merawat tanaman',
    'Menjual hasil panen dengan harga tinggi',
    'Membiarkan tanaman layu saat kemarau',
    '',
    'A,B',
    '',
  ],
  [
    'PGK',
    'Matematika — Geometri & Pengukuran',
    'Sulit',
    'Tentukan nilai Benar atau Salah untuk pernyataan bangun datar berikut:',
    '15',
    'ltr',
    '',
    '',
    '',
    '',
    '',
    '',
    'Luas persegi sisi 12 cm adalah $144\\text{ cm}^2$ [Benar]; Jumlah sudut segitiga adalah $360^\\circ$ [Salah]; Keliling persegi panjang 10x6 cm adalah $32\\text{ cm}$ [Benar]',
  ],
  [
    'PGK',
    'Bahasa Indonesia — Teks Informasi',
    'Sulit',
    'Program Bank Sampah SD Nusantara memilah sampah plastik dan kertas tiap Jumat untuk membeli buku pojok baca. Tentukan Benar (Sesuai) atau Salah (Tidak Sesuai):',
    '15',
    'ltr',
    '',
    '',
    '',
    '',
    '',
    '',
    'Pemilahan sampah dilakukan setiap hari Jumat [Benar]; Sisa makanan basah juga ditimbang di Bank Sampah [Salah]; Hasil daur ulang dipakai membeli buku pojok baca [Benar]',
  ],
];

export function downloadQuestionImportTemplate(format: 'xlsx' | 'csv'): void {
  const aoa = [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 16 },
    { wch: 48 },
    { wch: 8 },
    { wch: 8 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 52 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Format_Soal_TKA_SD');

  if (format === 'xlsx') {
    const guideAoa = [
      ['Panduan Pengisian Template Soal Tryout TKA SD (Pusmendik)'],
      ['Kolom', 'Wajib Pada', 'Aturan & Contoh'],
      ['jenis', 'Semua', 'Jenis soal resmi TKA: PG (Pilihan Ganda), PGK / B/S (Pilihan Ganda Kompleks Benar/Salah), dan MCMA (Multiple Choice Multiple Answer)'],
      ['mapel', 'Semua', 'Mata pelajaran TKA SD: Matematika (Bilangan, Geometri & Pengukuran, Data) atau Bahasa Indonesia (Teks Informasi, Teks Fiksi)'],
      ['tingkat_kesulitan', 'Opsional', 'Isi Mudah, Sedang, atau Sulit (default: Sedang)'],
      ['pertanyaan', 'Semua', 'Teks stimulus bacaan / soal. Mendukung rumus LaTeX ($...$ / $$...$$)'],
      ['bobot', 'Semua', 'Angka bobot poin (1 - 100), default 10'],
      ['arah', 'Opsional', 'ltr, auto, atau rtl'],
      ['opsi_a..opsi_e', 'PG, MCMA', 'Isi pilihan jawaban A sampai E (minimal 2 opsi terisi)'],
      ['kunci', 'PG, MCMA', 'Untuk PG isi 1 huruf (misal: B). Untuk MCMA pisahkan koma (misal: A,C,E)'],
      ['pernyataan', 'PGK (B/S)', 'Format: Pernyataan 1 [Benar]; Pernyataan 2 [Salah] (pisahkan titik koma ;)'],
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideAoa);
    guideSheet['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 82 }];
    XLSX.utils.book_append_sheet(wb, guideSheet, 'Panduan_TKA_SD');
    XLSX.writeFile(wb, 'template-import-soal-tka-sd.xlsx');
  } else {
    XLSX.writeFile(wb, 'template-import-soal-tka-sd.csv', { bookType: 'csv' });
  }
}

export function exportQuestionsToXlsx(questions: Question[], filenamePrefix: string): void {
  const rows = questions.map((q) => {
    const typeShort =
      q.type === 'multiple_choice'
        ? 'PG'
        : q.type === 'true_false'
          ? 'PGK'
          : q.type === 'mcma' || q.type === 'complex_multiple_choice'
            ? 'MCMA'
            : q.type === 'matching'
              ? 'JODOH'
              : 'ESAI';

    const opts =
      q.type === 'multiple_choice' ||
      q.type === 'complex_multiple_choice' ||
      q.type === 'mcma'
        ? q.options
        : [];
    const kunci =
      q.type === 'multiple_choice'
        ? q.correctOptionId.toUpperCase()
        : q.type === 'complex_multiple_choice' || q.type === 'mcma'
          ? q.correctOptionIds.map((id) => id.toUpperCase()).join(',')
          : '';
    const pernyataan =
      q.type === 'true_false'
        ? q.statements.map((s) => `${s.text} [${s.isTrue ? 'Benar' : 'Salah'}]`).join('; ')
        : '';
    const diffLabel = QUESTION_DIFFICULTY_LABELS[q.difficulty || 'medium'];

    return [
      typeShort,
      q.subject,
      diffLabel,
      q.prompt,
      String(q.points),
      q.direction || 'auto',
      opts[0]?.text || '',
      opts[1]?.text || '',
      opts[2]?.text || '',
      opts[3]?.text || '',
      opts[4]?.text || '',
      kunci,
      pernyataan,
    ];
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Bank_Soal');

  const summaryRows = [
    ['No', 'Jenis Soal', 'Mata Pelajaran', 'Tingkat Kesulitan', 'Bobot', 'Pertanyaan'],
    ...questions.map((q, i) => [
      i + 1,
      QUESTION_TYPE_LABELS[q.type],
      q.subject,
      QUESTION_DIFFICULTY_LABELS[q.difficulty || 'medium'],
      q.points,
      q.prompt,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Ringkasan');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}-${dateStr}.xlsx`);
}

export async function parseStudentsSpreadsheetFile(
  file: File
): Promise<Array<Partial<StudentMaster>>> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (matrix.length === 0) return [];

  const firstHeaders = matrix[0].map(normalizeHeader);
  const hasHeader =
    firstHeaders.some((h) => h.includes('nama') || h === 'name') &&
    firstHeaders.some((h) => h.includes('nis') || h.includes('id'));

  const startRow = hasHeader ? 1 : 0;
  const parsed: Array<Partial<StudentMaster>> = [];

  for (let i = startRow; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    if (hasHeader) {
      const rec: Record<string, string> = {};
      firstHeaders.forEach((h, idx) => {
        if (h) rec[h] = String(row[idx] ?? '').trim();
      });
      const name = getField(rec, ['nama', 'nama_siswa', 'name']);
      const nis = getField(rec, ['nis', 'nisn', 'nomor_peserta', 'id']);
      const kelas = getField(rec, ['kelas', 'class', 'rombel']) || 'KELAS 6 A';
      const phone = getField(rec, ['no_hp', 'hp', 'telepon', 'phone']) || '-';
      if (name && nis) parsed.push({ name, nis, kelas, phone });
    } else {
      const name = String(row[0] ?? '').trim();
      const nis = String(row[1] ?? '').trim();
      const kelas = String(row[2] ?? 'KELAS 6 A').trim();
      const phone = String(row[3] ?? '-').trim();
      if (name && nis) parsed.push({ name, nis, kelas, phone });
    }
  }
  return parsed;
}

export async function parseTeachersSpreadsheetFile(
  file: File
): Promise<Array<Partial<TeacherMaster>>> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (matrix.length === 0) return [];

  const firstHeaders = matrix[0].map(normalizeHeader);
  const hasHeader = firstHeaders.some((h) => h.includes('nama') || h === 'name');
  const startRow = hasHeader ? 1 : 0;
  const parsed: Array<Partial<TeacherMaster>> = [];

  for (let i = startRow; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;
    if (hasHeader) {
      const rec: Record<string, string> = {};
      firstHeaders.forEach((h, idx) => {
        if (h) rec[h] = String(row[idx] ?? '').trim();
      });
      const name = getField(rec, ['nama', 'nama_guru', 'nama_pengajar', 'name']);
      const nip = getField(rec, ['nip', 'username', 'nip_username', 'id']);
      const subs = getField(rec, ['mapel', 'mata_pelajaran', 'subjects']);
      const cls = getField(rec, ['kelas', 'kelas_ampu', 'classes']);
      const phone = getField(rec, ['no_hp', 'hp', 'phone']) || '-';
      if (name && nip) {
        parsed.push({
          name,
          nip,
          subjects: subs ? subs.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : ['Umum'],
          classes: cls ? cls.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : ['KELAS 6 A'],
          phone,
        });
      }
    } else {
      const name = String(row[0] ?? '').trim();
      const nip = String(row[1] ?? '').trim();
      const subs = String(row[2] ?? 'Umum').trim();
      const cls = String(row[3] ?? 'KELAS 6 A').trim();
      const phone = String(row[4] ?? '-').trim();
      if (name && nip) {
        parsed.push({
          name,
          nip,
          subjects: subs.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
          classes: cls.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
          phone,
        });
      }
    }
  }
  return parsed;
}
