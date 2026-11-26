import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import {
  buildExamResultReport,
  exportExamResultsPdf,
  type PdfOrientation,
  type PdfScope,
} from '../lib/pdfExport';
import type {
  ClassRoom,
  ExamConfig,
  Question,
  StudentMaster,
  StudentSession,
} from '../types/cbt';

interface ExamResultsPdfModalProps {
  open: boolean;
  onClose: () => void;
  examConfig: ExamConfig;
  questions: Question[];
  sessions: StudentSession[];
  masterStudents: StudentMaster[];
  classes: ClassRoom[];
}

export const ExamResultsPdfModal: React.FC<ExamResultsPdfModalProps> = ({
  open,
  onClose,
  examConfig,
  questions,
  sessions,
  masterStudents,
  classes,
}) => {
  const [scope, setScope] = useState<PdfScope>('sessions_only');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape');
  const [includeTypeBreakdown, setIncludeTypeBreakdown] = useState(true);
  const [includeTypeSummary, setIncludeTypeSummary] = useState(true);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [principalName, setPrincipalName] = useState('Kepala Sekolah');
  const [proctorName, setProctorName] = useState('Guru / Proktor CBT');
  const [cityName, setCityName] = useState('Jakarta');
  const [downloadedNotice, setDownloadedNotice] = useState(false);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of classes) {
      if (c.name.trim()) set.add(c.name.trim());
    }
    for (const s of masterStudents) {
      if (s.kelas.trim()) set.add(s.kelas.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [classes, masterStudents]);

  const report = useMemo(
    () =>
      buildExamResultReport({
        examConfig,
        questions,
        sessions,
        masterStudents,
        scope,
        classFilter,
      }),
    [examConfig, questions, sessions, masterStudents, scope, classFilter]
  );

  if (!open) return null;

  const formattedDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handleDownloadPdf = () => {
    exportExamResultsPdf({
      examConfig,
      questions,
      sessions,
      masterStudents,
      scope,
      classFilter,
      orientation,
      includeTypeBreakdown,
      includeTypeSummary,
      includeSignatures,
      principalName,
      proctorName,
      cityName,
    });
    setDownloadedNotice(true);
    window.setTimeout(() => setDownloadedNotice(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-2 md:p-4 print-modal-backdrop">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden print-modal-shell">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/60 via-sky-50/40 to-white no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Export PDF &amp; Cetak Laporan Hasil Ujian
              </h2>
              <p className="text-xs text-slate-500">
                Pratinjau tata letak A4 resmi sebelum mengunduh file PDF atau mencetak laporan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {downloadedNotice && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                PDF berhasil diunduh
              </span>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Browser
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl whitespace-nowrap shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh PDF (.pdf)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 rounded-lg"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Settings Sidebar + Live A4 Paper Preview */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Configuration Column */}
          <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200/80 p-4 space-y-4 overflow-y-auto bg-[#F7F8FC] no-print">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Cakupan Peserta
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as PdfScope)}
                className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                <option value="sessions_only">Peserta Aktif / Sudah Ujian ({sessions.length})</option>
                <option value="finished_only">Hanya yang Sudah Selesai</option>
                <option value="all_registered">Semua Peserta Terdaftar ({masterStudents.length})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Filter Kelas
              </label>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                <option value="all">Semua Kelas</option>
                {classOptions.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Orientasi Kertas A4
              </label>
              <div className="grid grid-cols-2 p-1 bg-indigo-50/80 border border-indigo-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`py-1.5 px-2.5 text-xs font-semibold rounded-lg transition-colors ${
                    orientation === 'landscape'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Landscape
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`py-1.5 px-2.5 text-xs font-semibold rounded-lg transition-colors ${
                    orientation === 'portrait'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/80">
              <p className="text-xs font-semibold text-slate-700">Komponen Laporan</p>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTypeBreakdown}
                  onChange={(e) => setIncludeTypeBreakdown(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600"
                />
                <span>Rincian skor 3 jenis soal TKA (PG, PGK, MCMA)</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTypeSummary}
                  onChange={(e) => setIncludeTypeSummary(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600"
                />
                <span>Tabel ringkasan performa per jenis soal</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSignatures}
                  onChange={(e) => setIncludeSignatures(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600"
                />
                <span>Blok pengesahan &amp; tanda tangan</span>
              </label>
            </div>

            {includeSignatures && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
                <p className="text-xs font-semibold text-slate-700">Penandatangan</p>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Kota / Lokasi</label>
                  <input
                    type="text"
                    value={cityName}
                    onChange={(e) => setCityName(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Nama Kepala Sekolah</label>
                  <input
                    type="text"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Nama Proktor / Guru</label>
                  <input
                    type="text"
                    value={proctorName}
                    onChange={(e) => setProctorName(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </aside>

          {/* Right Live Printable Paper Preview */}
          <div className="lg:col-span-9 bg-slate-200/60 p-4 md:p-6 overflow-y-auto print-sheet-container">
            <div
              className={`mx-auto bg-white shadow-md border border-slate-300 p-6 md:p-8 text-slate-900 print-only-sheet ${
                orientation === 'landscape' ? 'max-w-[1040px]' : 'max-w-[760px]'
              }`}
            >
              {/* Kop Surat */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b-2 border-slate-900">
                <div>
                  <p className="text-base font-bold tracking-tight text-slate-950 uppercase">
                    {examConfig.schoolName || 'SD PEDAK'}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 tracking-wide">
                    LAPORAN REKAPITULASI HASIL UJIAN CBT ONLINE
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {examConfig.title} · {examConfig.subtitle}
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-600 space-y-0.5 font-mono tabular-nums">
                  <p>Tanggal: {examConfig.scheduleDate || formattedDate}</p>
                  <p>
                    Sesi: {examConfig.sessionCode || '-'} · {examConfig.roomName || 'Ruang CBT'}
                  </p>
                  <p>
                    Kelas: {classFilter === 'all' ? 'Semua Kelas' : classFilter} · KKM: {report.kkm}
                  </p>
                </div>
              </div>
              <div className="h-px bg-slate-200 mt-0.5 mb-4" />

              {/* KPI Summary Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-sky-50/60 border border-sky-200/80 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-sky-800">
                    Total Peserta
                  </p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-950">
                    {report.totalRegistered} Siswa
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {report.finishedCount} selesai · {report.startedCount} masuk
                  </p>
                </div>
                <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-indigo-800">
                    Rata-Rata Nilai
                  </p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-950">
                    {report.averageScore !== null ? report.averageScore : '—'}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Dari {report.gradedCount} peserta ternilai
                  </p>
                </div>
                <div className="bg-amber-50/60 border border-amber-200/80 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-amber-800">
                    Tertinggi / Terendah
                  </p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-950">
                    {report.highestScore !== null && report.lowestScore !== null
                      ? `${report.highestScore} / ${report.lowestScore}`
                      : '—'}
                  </p>
                  <p className="text-[11px] text-slate-600">Skala nilai 0 – 100</p>
                </div>
                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-emerald-800">
                    Ketuntasan (KKM {report.kkm})
                  </p>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700">
                    {report.passedCount}/{report.gradedCount} ({report.passRatePct}%)
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {Math.max(0, report.gradedCount - report.passedCount)} perlu remedial
                  </p>
                </div>
              </div>

              {/* Section A: Student Results Table */}
              <div className="mb-5">
                <h3 className="text-xs font-bold text-slate-900 mb-2">
                  A. Rekapitulasi Nilai Peserta Ujian
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-800 text-white font-semibold">
                        <th className="py-2 px-2 text-center">No</th>
                        <th className="py-2 px-2">NIS</th>
                        <th className="py-2 px-2">Nama Peserta</th>
                        <th className="py-2 px-2">Kelas</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        {!includeTypeBreakdown && (
                          <th className="py-2 px-2 text-center">Progres</th>
                        )}
                        <th className="py-2 px-2 text-center">Pel.</th>
                        {includeTypeBreakdown && (
                          <>
                            <th className="py-2 px-2 text-right">PG</th>
                            <th className="py-2 px-2 text-right">PGK</th>
                            <th className="py-2 px-2 text-right">MCMA</th>
                          </>
                        )}
                        <th className="py-2 px-2 text-right">Poin</th>
                        <th className="py-2 px-2 text-right">Nilai</th>
                        <th className="py-2 px-2 text-center">Ket.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {report.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={includeTypeBreakdown ? 12 : 10}
                            className="py-6 text-center text-slate-500"
                          >
                            Belum ada data peserta untuk filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        report.rows.map((r, idx) => {
                          const notStarted = r.status === 'not_started';
                          return (
                            <tr
                              key={`${r.nis}-${idx}`}
                              className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                            >
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums text-slate-600">
                                {r.no}
                              </td>
                              <td className="py-1.5 px-2 font-mono tabular-nums text-slate-700">
                                {r.nis}
                              </td>
                              <td className="py-1.5 px-2 font-semibold text-slate-900">
                                {r.name}
                              </td>
                              <td className="py-1.5 px-2 text-slate-700">{r.kelas}</td>
                              <td className="py-1.5 px-2 text-center text-slate-700">
                                {r.statusLabel}
                              </td>
                              {!includeTypeBreakdown && (
                                <td className="py-1.5 px-2 text-center font-mono tabular-nums">
                                  {r.answeredCount}/{r.totalQuestions}
                                </td>
                              )}
                              <td className="py-1.5 px-2 text-center font-mono tabular-nums">
                                {notStarted ? '—' : r.violationsCount}
                              </td>
                              {includeTypeBreakdown && (
                                <>
                                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                    {notStarted
                                      ? '—'
                                      : `${Number(r.typeScores.multiple_choice.earned.toFixed(1))}/${r.typeScores.multiple_choice.max}`}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                    {notStarted
                                      ? '—'
                                      : `${Number(r.typeScores.true_false.earned.toFixed(1))}/${r.typeScores.true_false.max}`}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                    {notStarted
                                      ? '—'
                                      : `${Number(r.typeScores.mcma.earned.toFixed(1))}/${r.typeScores.mcma.max}`}
                                  </td>
                                </>
                              )}
                              <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                                {notStarted ? '—' : `${r.earnedPoints}/${r.maxPoints}`}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-right font-mono tabular-nums font-bold ${
                                  r.finalScore === null
                                    ? 'text-slate-400'
                                    : r.finalScore >= report.kkm
                                      ? 'text-slate-950'
                                      : 'text-rose-700'
                                }`}
                              >
                                {r.finalScore !== null ? r.finalScore : '—'}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-center font-semibold ${
                                  r.kkmStatus === 'Tuntas'
                                    ? 'text-emerald-700'
                                    : r.kkmStatus === 'Belum Tuntas'
                                      ? 'text-rose-700'
                                      : r.kkmStatus === 'Proses'
                                        ? 'text-amber-700'
                                        : 'text-slate-400'
                                }`}
                              >
                                {r.kkmStatus}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section B: Question Type Summary */}
              {includeTypeSummary && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-900 mb-2">
                    B. Ringkasan Performa per Jenis Soal
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-700 text-white font-semibold">
                          <th className="py-1.5 px-3">Jenis Soal</th>
                          <th className="py-1.5 px-3 text-right">Jumlah Butir</th>
                          <th className="py-1.5 px-3 text-right">Bobot Maksimal</th>
                          <th className="py-1.5 px-3 text-right">Rata-rata Poin</th>
                          <th className="py-1.5 px-3 text-right">Rata-rata Akurasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {report.typePerformance.map((tp) => (
                          <tr key={tp.type}>
                            <td className="py-1.5 px-3 font-semibold text-slate-800">
                              {tp.label} ({tp.shortLabel})
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                              {tp.questionCount} butir
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                              {tp.maxPoints} poin
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                              {tp.avgEarned} poin
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                              {tp.avgAccuracyPct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Section C: Signature Block */}
              {includeSignatures && (
                <div className="grid grid-cols-2 gap-8 pt-4 text-xs text-slate-700">
                  <div className="pl-4">
                    <p>Mengetahui,</p>
                    <p>Kepala Sekolah</p>
                    <div className="h-14" />
                    <p className="font-bold text-slate-900 underline underline-offset-4">
                      {principalName || 'Kepala Sekolah'}
                    </p>
                  </div>
                  <div className="pl-12">
                    <p>
                      {cityName || 'Jakarta'}, {formattedDate}
                    </p>
                    <p>Proktor / Guru Pengampu</p>
                    <div className="h-14" />
                    <p className="font-bold text-slate-900 underline underline-offset-4">
                      {proctorName || 'Guru / Proktor CBT'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
