import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Layers,
  Upload,
  X,
} from 'lucide-react';
import { MathText } from './MathText';
import {
  getDifficultyTone,
  QuestionStudentPreview,
} from './QuestionStudentPreview';
import {
  activateQuestionBankInFirestore,
  createQuestionBankInFirestore,
  DEFAULT_ACTIVE_BANK_ID,
  DEFAULT_PUBLIC_EXAM_CONFIG,
  importQuestionsBatchInFirestore,
} from '../lib/firebaseCbt';
import {
  downloadQuestionImportTemplate,
  parseQuestionDelimitedText,
  parseQuestionSpreadsheetFile,
  type BulkImportParseResult,
} from '../lib/questionImport';
import type { ExamConfig, Question, QuestionBank, StudentSession } from '../types/cbt';
import {
  QUESTION_TYPE_LABELS,
  TKA_SD_OFFICIAL_TYPES,
} from '../types/cbt';

interface BulkQuestionImportModalProps {
  questionBanks: QuestionBank[];
  defaultBankId: string | null;
  allQuestions?: Question[];
  examConfig?: ExamConfig | null;
  sessions?: StudentSession[];
  onImportComplete: () => void;
  onClose: () => void;
}

export const BulkQuestionImportModal: React.FC<BulkQuestionImportModalProps> = ({
  questionBanks,
  defaultBankId,
  allQuestions = [],
  examConfig,
  sessions = [],
  onImportComplete,
  onClose,
}) => {
  const activeOrFirstBankId =
    defaultBankId ||
    questionBanks.find((b) => b.isActive)?.id ||
    questionBanks[0]?.id ||
    '';

  const [destinationMode, setDestinationMode] = useState<'existing' | 'new'>('existing');
  const [targetBankId, setTargetBankId] = useState<string>(activeOrFirstBankId);
  const [newBankForm, setNewBankForm] = useState({
    code: '',
    name: '',
    subject: 'Terpadu (Matematika, IPA, Bahasa)',
    targetClass: 'KELAS 6 A',
    activateNow: true,
  });

  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [renderMathPreview, setRenderMathPreview] = useState(true);
  const [parseResult, setParseResult] = useState<BulkImportParseResult | null>(null);
  const [previewingQuestion, setPreviewingQuestion] = useState<{
    rowNumber: number;
    question: Question;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelected = async (file: File) => {
    setSubmitError('');
    setParsing(true);
    try {
      const parsed = await parseQuestionSpreadsheetFile(
        file,
        destinationMode === 'existing' ? targetBankId : undefined
      );
      setParseResult(parsed);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? `Gagal membaca file: ${err.message}`
          : 'Gagal memproses file CSV/Excel.'
      );
    } finally {
      setParsing(false);
    }
  };

  const handleParsePaste = () => {
    setSubmitError('');
    const parsed = parseQuestionDelimitedText(
      pasteText,
      destinationMode === 'existing' ? targetBankId : undefined
    );
    setParseResult(parsed);
  };

  const filteredRows = useMemo(() => {
    if (!parseResult) return [];
    if (resultFilter === 'valid') return parseResult.rows.filter((r) => r.valid);
    if (resultFilter === 'invalid') return parseResult.rows.filter((r) => !r.valid);
    return parseResult.rows;
  }, [parseResult, resultFilter]);

  const validQuestions: Question[] = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.rows
      .filter((r) => r.valid && r.question !== null)
      .map((r) => r.question as Question);
  }, [parseResult]);

  const handleConfirmImport = async () => {
    if (validQuestions.length === 0) {
      setSubmitError('Tidak ada butir soal valid untuk diimpor.');
      return;
    }
    setSubmitError('');
    setSubmitting(true);

    try {
      let finalBankId = targetBankId || DEFAULT_ACTIVE_BANK_ID;
      let activeBankId =
        questionBanks.find((b) => b.isActive)?.id ||
        questionBanks[0]?.id ||
        DEFAULT_ACTIVE_BANK_ID;

      if (destinationMode === 'new') {
        if (!newBankForm.code.trim() || !newBankForm.name.trim()) {
          setSubmitError('Kode dan Nama Bank Soal baru wajib diisi.');
          setSubmitting(false);
          return;
        }
        const createdBank = await createQuestionBankInFirestore({
          code: newBankForm.code.trim(),
          name: newBankForm.name.trim(),
          subject: newBankForm.subject.trim() || 'Umum',
          targetClass: newBankForm.targetClass.trim() || 'KELAS 6 A',
          targetCounts: parseResult?.byType,
        });
        finalBankId = createdBank.id;

        if (newBankForm.activateNow) {
          activeBankId = finalBankId;
          await activateQuestionBankInFirestore({
            bankId: finalBankId,
            banks: [...questionBanks, createdBank],
            questions: allQuestions,
            examConfig: examConfig || DEFAULT_PUBLIC_EXAM_CONFIG,
            sessions,
          });
        }
      }

      await importQuestionsBatchInFirestore({
        bankId: finalBankId,
        activeBankId,
        replaceExisting: destinationMode === 'existing' && replaceExisting,
        existingQuestionsInBank: allQuestions.filter((q) => q.bankId === finalBankId),
        questions: validQuestions.map((q) => ({ ...q, bankId: finalBankId })),
      });

      onImportComplete();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan impor soal.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-white border border-slate-200 rounded-3xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between gap-4 bg-gradient-to-r from-emerald-50/60 via-sky-50/40 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Import Massal Bank Soal (Excel &amp; CSV)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Validasi otomatis standar TKA SD: Pilihan Ganda (PG), PG Kompleks (B/S), dan MCMA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 rounded-lg transition-colors"
            aria-label="Tutup modal impor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F7F8FC]">
          {submitError && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Step 1: Destination Bank + Template Download */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Pilih Bank Soal Tujuan
                </h3>
                <div className="inline-flex p-1 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDestinationMode('existing')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      destinationMode === 'existing'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Bank Tersedia
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationMode('new')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      destinationMode === 'new'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Buat Bank Baru
                  </button>
                </div>
              </div>

              {destinationMode === 'existing' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Paket Bank Soal
                    </label>
                    <select
                      value={targetBankId}
                      onChange={(e) => setTargetBankId(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-slate-50/80 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    >
                      {questionBanks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          [{bank.code}] {bank.name} — {bank.subject} ({bank.targetClass})
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>
                      Ganti seluruh soal lama di bank ini (kosongkan jika ingin menambahkan)
                    </span>
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Kode Bank Soal
                    </label>
                    <input
                      type="text"
                      value={newBankForm.code}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, code: e.target.value }))
                      }
                      placeholder="cth. TKA-MTK-02"
                      className="w-full h-9 px-3 text-sm font-mono uppercase bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Kelas Target
                    </label>
                    <input
                      type="text"
                      value={newBankForm.targetClass}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, targetClass: e.target.value }))
                      }
                      placeholder="cth. KELAS 6 A"
                      className="w-full h-9 px-3 text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nama Paket Bank Soal
                    </label>
                    <input
                      type="text"
                      value={newBankForm.name}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="cth. Tryout Matematika Paket B"
                      className="w-full h-9 px-3 text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Mata Pelajaran
                    </label>
                    <input
                      type="text"
                      value={newBankForm.subject}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, subject: e.target.value }))
                      }
                      placeholder="cth. Matematika SD"
                      className="w-full h-9 px-3 text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={newBankForm.activateNow}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, activateNow: e.target.checked }))
                      }
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span>Langsung aktifkan bank soal ini untuk ujian siswa</span>
                  </label>
                </div>
              )}
            </div>

            {/* Template & Format Guide Box */}
            <div className="lg:col-span-5 bg-gradient-to-br from-emerald-50/70 to-sky-50/50 border border-emerald-200/70 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Unduh Template Soal TKA SD
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Gunakan template standar TKA SD agar kolom <span className="font-mono font-semibold text-sky-700">PG</span>,{' '}
                  <span className="font-mono font-semibold text-emerald-700">PGK</span> (Benar/Salah), dan{' '}
                  <span className="font-mono font-semibold text-violet-700">MCMA</span> langsung tervalidasi otomatis.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadQuestionImportTemplate('xlsx')}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  Template Excel
                </button>
                <button
                  type="button"
                  onClick={() => downloadQuestionImportTemplate('csv')}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl whitespace-nowrap transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  Template CSV
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: File Upload or Paste Input */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                2. Unggah File Excel / CSV atau Tempel Data
              </h3>
              <div className="inline-flex p-1 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    inputMode === 'file'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unggah File (.xlsx / .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    inputMode === 'paste'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tempel Teks / Excel
                </button>
              </div>
            </div>

            {inputMode === 'file' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileSelected(file);
                }}
                className={`border border-dashed rounded-2xl p-8 text-center transition-colors ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-50/70'
                    : 'border-indigo-200 bg-indigo-50/25 hover:border-indigo-300'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <div className="w-11 h-11 rounded-2xl bg-white border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {parsing
                    ? 'Membaca dan memvalidasi soal...'
                    : 'Tarik & lepas file Excel (.xlsx / .xls) atau CSV ke sini'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Mendukung sheet Excel pertama dengan header kolom standar TKA (PG, PGK, MCMA).
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 h-9 inline-flex items-center gap-2 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-2xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Pilih File dari Komputer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Tempel data tabel langsung dari Excel (dipisah Tab), CSV dengan header, atau format cepat per baris:{' '}
                  <code className="font-mono text-indigo-700">
                    JENIS | Mapel | Pertanyaan | Opsi A | Opsi B | Opsi C | Opsi D | Kunci
                  </code>
                </p>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`PG | Matematika SD | Hasil dari $12 \\times 8$ adalah... | 84 | 96 | 104 | 108 | B\nMCMA | Matematika SD | Pilih bilangan prima antara 10 dan 25: | 11 | 15 | 17 | 21 | A,C\nPGK | Matematika SD | Tentukan nilai kebenaran pernyataan berikut: | $5^2 = 25$ [Benar]; $3+4=8$ [Salah]`}
                  className="w-full p-3 text-xs font-mono bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParsePaste}
                    className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                  >
                    Validasi Data Tempel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Live Validation Preview & Per-Type Summary */}
          {parseResult && (
            <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-5 py-4 border-b border-slate-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      3. Hasil Validasi File: {parseResult.sourceLabel}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1 font-mono tabular-nums">
                      <span>Total Baris: {parseResult.rows.length}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-semibold">
                        Valid: {parseResult.validCount}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          parseResult.invalidCount > 0
                            ? 'text-rose-700 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        Bermasalah: {parseResult.invalidCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 mr-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={renderMathPreview}
                        onChange={(e) => setRenderMathPreview(e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded"
                      />
                      Render Rumus &amp; Arab
                    </label>
                    <div className="inline-flex p-1 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                      {(['all', 'valid', 'invalid'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setResultFilter(f)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap ${
                            resultFilter === f
                              ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {f === 'all'
                            ? `Semua (${parseResult.rows.length})`
                            : f === 'valid'
                              ? `Valid (${parseResult.validCount})`
                              : `Error (${parseResult.invalidCount})`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Question Type Breakdown Strip with Soft Pastel Tints */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {TKA_SD_OFFICIAL_TYPES.map((qt) => {
                    const cardTone =
                      qt === 'multiple_choice'
                        ? 'bg-sky-50/70 border-sky-200/70 text-sky-900'
                        : qt === 'true_false'
                          ? 'bg-emerald-50/70 border-emerald-200/70 text-emerald-900'
                          : 'bg-violet-50/70 border-violet-200/70 text-violet-900';
                    return (
                      <div
                        key={qt}
                        className={`px-3.5 py-2.5 border rounded-xl flex items-center justify-between text-xs ${cardTone}`}
                      >
                        <span className="font-semibold">
                          {QUESTION_TYPE_LABELS[qt]}
                        </span>
                        <span className="font-mono tabular-nums font-bold">
                          {parseResult.byType[qt]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {parseResult.rows.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  File tidak memiliki baris data soal di bawah header. Pastikan baris pertama adalah judul kolom.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-indigo-50/60 border-b border-slate-200 z-10">
                      <tr className="text-slate-600 font-semibold">
                        <th className="py-2.5 px-3 w-14">Baris</th>
                        <th className="py-2.5 px-3 w-36">Jenis Soal</th>
                        <th className="py-2.5 px-3">Pertanyaan &amp; Detail Kunci</th>
                        <th className="py-2.5 px-3 w-20 text-right">Bobot</th>
                        <th className="py-2.5 px-3 w-72">Status Validasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.valid ? 'hover:bg-indigo-50/20' : 'bg-rose-50/50'}
                        >
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-500 align-top">
                            #{row.rowNumber}
                          </td>
                          <td className="py-3 px-3 align-top space-y-1">
                            <p className="font-semibold text-slate-900">
                              {row.detectedType
                                ? QUESTION_TYPE_LABELS[row.detectedType]
                                : row.rawType}
                            </p>
                            <p className="text-[11px] text-slate-500">{row.subject}</p>
                            <span
                              className={`text-[11px] font-semibold ${getDifficultyTone(row.difficulty).textClass}`}
                            >
                              {getDifficultyTone(row.difficulty).label}
                            </span>
                          </td>
                          <td className="py-3 px-3 align-top max-w-md space-y-1">
                            <div className="text-slate-800 line-clamp-3">
                              {renderMathPreview ? (
                                <MathText text={row.prompt} />
                              ) : (
                                row.prompt
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {row.summaryText}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-800 align-top">
                            {row.points}
                          </td>
                          <td className="py-3 px-3 align-top space-y-1.5">
                            {row.valid ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  Siap Diimpor
                                </span>
                                {row.question && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewingQuestion({
                                        rowNumber: row.rowNumber,
                                        question: row.question as Question,
                                      })
                                    }
                                    className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg whitespace-nowrap"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Pratinjau
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {row.errors.map((err, idx) => (
                                  <p
                                    key={idx}
                                    className="inline-flex items-start gap-1 text-rose-700 font-medium"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>{err}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                            {row.warnings.map((warn, idx) => (
                              <p
                                key={idx}
                                className="inline-flex items-start gap-1 text-amber-700"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{warn}</span>
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="px-6 py-4 border-t border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {parseResult
              ? parseResult.invalidCount > 0
                ? `${parseResult.validCount} soal valid akan diimpor; ${parseResult.invalidCount} baris error akan dilewati.`
                : `${parseResult.validCount} butir soal valid siap masuk ke bank soal.`
              : 'Unggah file .xlsx/.csv atau tempel data terlebih dahulu untuk validasi.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting || validQuestions.length === 0}
              onClick={handleConfirmImport}
              className="h-9 inline-flex items-center gap-2 px-5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {submitting
                ? 'Menyimpan...'
                : `Import ${validQuestions.length} Soal Valid`}
            </button>
          </div>
        </div>
      </div>

      {previewingQuestion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-50/60 to-white">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Soal Baris #{previewingQuestion.rowNumber} (Tampilan Siswa)
                </h3>
                <p className="text-xs text-slate-500">
                  Verifikasi tata letak, rumus, dan pilihan jawaban sebelum soal diimpor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingQuestion(null)}
                className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-[#F7F8FC]">
              <QuestionStudentPreview
                question={previewingQuestion.question}
                questionNumber={previewingQuestion.rowNumber}
                defaultShowAnswerKey
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-200/80 bg-white flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewingQuestion(null)}
                className="h-9 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
