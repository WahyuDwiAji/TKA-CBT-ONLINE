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
  downloadQuestionImportTemplate,
  parseQuestionDelimitedText,
  parseQuestionSpreadsheetFile,
  type BulkImportParseResult,
} from '../lib/questionImport';
import type { Question, QuestionBank } from '../types/cbt';
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_SHORT,
  TKA_SD_OFFICIAL_TYPES,
} from '../types/cbt';

interface BulkQuestionImportModalProps {
  questionBanks: QuestionBank[];
  defaultBankId: string | null;
  onImportComplete: () => void;
  onClose: () => void;
}

export const BulkQuestionImportModal: React.FC<BulkQuestionImportModalProps> = ({
  questionBanks,
  defaultBankId,
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
      let finalBankId = targetBankId;

      if (destinationMode === 'new') {
        if (!newBankForm.code.trim() || !newBankForm.name.trim()) {
          setSubmitError('Kode dan Nama Bank Soal baru wajib diisi.');
          setSubmitting(false);
          return;
        }
        const createRes = await fetch('/api/question-banks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: newBankForm.code.trim(),
            name: newBankForm.name.trim(),
            subject: newBankForm.subject.trim() || 'Umum',
            targetClass: newBankForm.targetClass.trim() || 'KELAS 6 A',
            targetCounts: parseResult?.byType,
          }),
        });
        if (!createRes.ok) {
          const errBody = await createRes.json().catch(() => ({}));
          throw new Error(errBody.error || 'Gagal membuat bank soal baru.');
        }
        const createdBank = (await createRes.json()) as QuestionBank;
        finalBankId = createdBank.id;

        if (newBankForm.activateNow) {
          await fetch(`/api/question-banks/${finalBankId}/activate`, {
            method: 'POST',
          });
        }
      }

      const importRes = await fetch('/api/questions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId: finalBankId,
          replaceExisting: destinationMode === 'existing' && replaceExisting,
          questions: validQuestions.map((q) => ({ ...q, bankId: finalBankId })),
        }),
      });

      if (!importRes.ok) {
        const errBody = await importRes.json().catch(() => ({}));
        throw new Error(errBody.error || 'Gagal mengimpor butir soal ke server.');
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Massal Bank Soal (Excel .xlsx / .xls & CSV)
              </h2>
              <p className="text-xs text-slate-500">
                Validasi otomatis standar TKA SD: Pilihan Ganda (PG), Pilihan Ganda Kompleks (PGK B/S), dan MCMA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            aria-label="Tutup modal impor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/70">
          {submitError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Step 1: Destination Bank + Template Download */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Pilih Bank Soal Tujuan
                </h3>
                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDestinationMode('existing')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      destinationMode === 'existing'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Bank Soal Tersedia
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationMode('new')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      destinationMode === 'new'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Buat Bank Soal Baru
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
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>
                      Ganti seluruh soal lama di bank ini (kosongkan jika ingin menambahkan ke soal yang sudah ada)
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
                      className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
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
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
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
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
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
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={newBankForm.activateNow}
                      onChange={(e) =>
                        setNewBankForm((p) => ({ ...p, activateNow: e.target.checked }))
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Langsung aktifkan bank soal ini untuk ujian siswa</span>
                  </label>
                </div>
              )}
            </div>

            {/* Template & Format Guide Box */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Unduh Template Soal TKA SD
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Gunakan template standar TKA SD agar kolom <span className="font-mono">PG</span> (Pilihan Ganda),{' '}
                  <span className="font-mono">PGK</span> (Pilihan Ganda Kompleks Benar/Salah), dan{' '}
                  <span className="font-mono">MCMA</span> (Multi-Jawaban) untuk Matematika &amp; Bahasa Indonesia langsung tervalidasi otomatis.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadQuestionImportTemplate('xlsx')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Template Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => downloadQuestionImportTemplate('csv')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  Template CSV (.csv)
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: File Upload or Paste Input */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                2. Unggah File Excel / CSV atau Tempel Data
              </h3>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    inputMode === 'file'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unggah File (.xlsx / .xls / .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    inputMode === 'paste'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tempel Teks / Salin dari Excel
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
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-400'
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
                <Upload className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800">
                  {parsing
                    ? 'Membaca dan memvalidasi soal...'
                    : 'Tarik & lepas file Excel (.xlsx / .xls) atau CSV ke sini'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Mendukung sheet Excel pertama dengan header kolom standar 3 jenis soal TKA (PG, PGK, MCMA).
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Pilih File dari Komputer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Tempel data tabel langsung dari Excel (dipisah Tab), CSV dengan header, atau format cepat per baris:{' '}
                  <code className="font-mono text-slate-800">
                    JENIS | Mapel | Pertanyaan | Opsi A | Opsi B | Opsi C | Opsi D | Kunci
                  </code>
                </p>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`PG | Matematika SD | Hasil dari $12 \\times 8$ adalah... | 84 | 96 | 104 | 108 | B\nMCMA | Matematika SD | Pilih bilangan prima antara 10 dan 25: | 11 | 15 | 17 | 21 | A,C\nPGK | Matematika SD | Tentukan nilai kebenaran pernyataan berikut: | $5^2 = 25$ [Benar]; $3+4=8$ [Salah]`}
                  className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParsePaste}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Validasi Data Tempel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Live Validation Preview & Per-Type Summary */}
          {parseResult && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
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
                            ? 'text-red-700 font-semibold'
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
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      Render Rumus &amp; Arab
                    </label>
                    <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                      {(['all', 'valid', 'invalid'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setResultFilter(f)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                            resultFilter === f
                              ? 'bg-white text-slate-900 shadow-xs'
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

                {/* Question Type Breakdown Strip (3 TKA Types) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {TKA_SD_OFFICIAL_TYPES.map((qt) => (
                    <div
                      key={qt}
                      className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-700">
                        {QUESTION_TYPE_LABELS[qt]}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-blue-700">
                        {parseResult.byType[qt]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {parseResult.rows.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  File tidak memiliki baris data soal di bawah header. Pastikan baris pertama adalah judul kolom.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
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
                          className={row.valid ? 'hover:bg-slate-50' : 'bg-red-50/60'}
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
                              className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                                getDifficultyTone(row.difficulty).bgClass
                              } ${getDifficultyTone(row.difficulty).textClass}`}
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
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-800 align-top">
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
                                    className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md whitespace-nowrap"
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
                                    className="inline-flex items-start gap-1 text-red-700 font-medium"
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
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {parseResult
              ? parseResult.invalidCount > 0
                ? `${parseResult.validCount} soal valid akan diimpor; ${parseResult.invalidCount} baris error akan dilewati.`
                : `${parseResult.validCount} butir soal valid siap masuk ke bank soal.`
              : 'Unggah file .xlsx/.csv atau tempel data terlebih dahulu untuk validasi.'}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting || validQuestions.length === 0}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg"
            >
              <Upload className="w-4 h-4" />
              {submitting
                ? 'Menyimpan...'
                : `Import ${validQuestions.length} Soal Valid`}
            </button>
          </div>
        </div>
      </div>

      {previewingQuestion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Soal Baris #{previewingQuestion.rowNumber} (Tampilan Siswa)
                </h3>
                <p className="text-xs text-slate-500">
                  Verifikasi tata letak, rumus, dan pilihan jawaban sebelum soal diimpor ke bank ujian.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingQuestion(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-slate-50">
              <QuestionStudentPreview
                question={previewingQuestion.question}
                questionNumber={previewingQuestion.rowNumber}
                defaultShowAnswerKey
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewingQuestion(null)}
                className="h-9 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
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
