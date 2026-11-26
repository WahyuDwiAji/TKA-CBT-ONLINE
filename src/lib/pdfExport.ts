import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gradeQuestion, isQuestionAnswered } from './grading';
import {
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_SHORT,
  TKA_SD_OFFICIAL_TYPES,
  type ExamConfig,
  type Question,
  type QuestionType,
  type StudentMaster,
  type StudentSession,
  type StudentStatus,
} from '../types/cbt';

const ALL_TYPES: QuestionType[] = TKA_SD_OFFICIAL_TYPES;

export type PdfScope = 'all_registered' | 'sessions_only' | 'finished_only';
export type PdfOrientation = 'portrait' | 'landscape';

export interface StudentResultReportRow {
  no: number;
  nis: string;
  name: string;
  kelas: string;
  status: StudentStatus | 'not_started';
  statusLabel: string;
  answeredCount: number;
  totalQuestions: number;
  violationsCount: number;
  typeScores: Record<QuestionType, { earned: number; max: number }>;
  earnedPoints: number;
  maxPoints: number;
  finalScore: number | null;
  kkmStatus: 'Tuntas' | 'Belum Tuntas' | 'Proses' | 'Belum Mulai';
}

export interface TypePerformanceSummary {
  type: QuestionType;
  shortLabel: string;
  label: string;
  questionCount: number;
  maxPoints: number;
  avgEarned: number;
  avgAccuracyPct: number;
}

export interface ExamResultReportSummary {
  rows: StudentResultReportRow[];
  totalRegistered: number;
  startedCount: number;
  finishedCount: number;
  gradedCount: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  passedCount: number;
  passRatePct: number;
  kkm: number;
  typePerformance: TypePerformanceSummary[];
}

export interface ExamPdfOptions {
  examConfig: ExamConfig;
  questions: Question[];
  sessions: StudentSession[];
  masterStudents: StudentMaster[];
  scope: PdfScope;
  classFilter: string;
  orientation: PdfOrientation;
  includeTypeBreakdown: boolean;
  includeTypeSummary: boolean;
  includeSignatures: boolean;
  principalName: string;
  proctorName: string;
  cityName: string;
}

function getStatusLabel(status: StudentStatus | 'not_started'): string {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'suspended':
      return 'Ditangguhkan';
    case 'violation_locked':
      return 'Terkunci';
    case 'force_stopped':
      return 'Dihentikan';
    case 'submitted':
      return 'Selesai';
    default:
      return 'Belum Mulai';
  }
}

export function buildExamResultReport(options: {
  examConfig: ExamConfig;
  questions: Question[];
  sessions: StudentSession[];
  masterStudents: StudentMaster[];
  scope: PdfScope;
  classFilter: string;
}): ExamResultReportSummary {
  const { examConfig, questions, sessions, masterStudents, scope, classFilter } = options;
  const kkm = examConfig.kkm ?? 75;

  const sessionByNis = new Map<string, StudentSession>();
  for (const s of sessions) {
    sessionByNis.set(s.nis, s);
  }

  const maxPointsAll = questions.reduce((sum, q) => sum + q.points, 0);
  const typeMaxTotals: Record<QuestionType, number> = {
    multiple_choice: 0,
    complex_multiple_choice: 0,
    mcma: 0,
    matching: 0,
    true_false: 0,
    essay: 0,
  };
  const typeQuestionCounts: Record<QuestionType, number> = {
    multiple_choice: 0,
    complex_multiple_choice: 0,
    mcma: 0,
    matching: 0,
    true_false: 0,
    essay: 0,
  };
  for (const q of questions) {
    typeMaxTotals[q.type] += q.points;
    typeQuestionCounts[q.type] += 1;
  }

  type RawEntry = {
    nis: string;
    name: string;
    kelas: string;
    session: StudentSession | null;
  };

  const entries: RawEntry[] = [];
  const seenNis = new Set<string>();

  for (const s of sessions) {
    const ms = masterStudents.find((m) => m.nis === s.nis);
    seenNis.add(s.nis);
    entries.push({
      nis: s.nis,
      name: s.name,
      kelas: ms?.kelas || 'Peserta Langsung',
      session: s,
    });
  }

  if (scope === 'all_registered') {
    for (const ms of masterStudents) {
      if (!seenNis.has(ms.nis)) {
        entries.push({
          nis: ms.nis,
          name: ms.name,
          kelas: ms.kelas,
          session: null,
        });
      }
    }
  }

  const filteredEntries = entries.filter((entry) => {
    if (classFilter !== 'all' && entry.kelas !== classFilter) return false;
    if (scope === 'finished_only') {
      return (
        entry.session !== null &&
        (entry.session.status === 'submitted' || entry.session.status === 'force_stopped')
      );
    }
    if (scope === 'sessions_only') {
      return entry.session !== null;
    }
    return true;
  });

  // Sort by class then name
  filteredEntries.sort((a, b) => {
    const clsCmp = a.kelas.localeCompare(b.kelas, 'id');
    if (clsCmp !== 0) return clsCmp;
    return a.name.localeCompare(b.name, 'id');
  });

  const rows: StudentResultReportRow[] = filteredEntries.map((entry, index) => {
    const s = entry.session;
    const typeScores: Record<QuestionType, { earned: number; max: number }> = {
      multiple_choice: { earned: 0, max: typeMaxTotals.multiple_choice },
      complex_multiple_choice: { earned: 0, max: typeMaxTotals.complex_multiple_choice },
      mcma: { earned: 0, max: typeMaxTotals.mcma },
      matching: { earned: 0, max: typeMaxTotals.matching },
      true_false: { earned: 0, max: typeMaxTotals.true_false },
      essay: { earned: 0, max: typeMaxTotals.essay },
    };

    if (!s) {
      return {
        no: index + 1,
        nis: entry.nis,
        name: entry.name,
        kelas: entry.kelas,
        status: 'not_started',
        statusLabel: getStatusLabel('not_started'),
        answeredCount: 0,
        totalQuestions: questions.length,
        violationsCount: 0,
        typeScores,
        earnedPoints: 0,
        maxPoints: maxPointsAll,
        finalScore: null,
        kkmStatus: 'Belum Mulai',
      };
    }

    let answeredCount = 0;
    let earnedLive = 0;

    for (const q of questions) {
      const ans = s.answers[q.id];
      if (isQuestionAnswered(q, ans)) answeredCount += 1;
      const g = gradeQuestion(
        q,
        ans,
        s.manualEssayOverrides?.[q.id],
        {
          negativeMarking: examConfig.negativeMarking,
          negativePenaltyRatio: examConfig.negativePenaltyRatio,
          kkm,
        }
      );
      typeScores[q.type].earned += g.earnedPoints;
      earnedLive += g.earnedPoints;
    }

    const clampedLiveEarned = Math.max(0, earnedLive);
    const isFinished = s.status === 'submitted' || s.status === 'force_stopped';
    const earnedPoints = s.gradeSummary
      ? s.gradeSummary.earnedPoints
      : Number(clampedLiveEarned.toFixed(1));
    const maxPoints = s.gradeSummary ? s.gradeSummary.maxPoints : maxPointsAll;
    const computedScore =
      s.gradeSummary !== undefined
        ? s.gradeSummary.totalScore
        : maxPoints > 0
          ? Number(((clampedLiveEarned / maxPoints) * 100).toFixed(1))
          : 0;

    let kkmStatus: StudentResultReportRow['kkmStatus'] = 'Proses';
    if (isFinished || s.gradeSummary) {
      kkmStatus = computedScore >= kkm ? 'Tuntas' : 'Belum Tuntas';
    }

    return {
      no: index + 1,
      nis: entry.nis,
      name: entry.name,
      kelas: entry.kelas,
      status: s.status,
      statusLabel: getStatusLabel(s.status),
      answeredCount,
      totalQuestions: questions.length,
      violationsCount: s.violations.length,
      typeScores,
      earnedPoints: Number(earnedPoints.toFixed(1)),
      maxPoints,
      finalScore: isFinished || s.gradeSummary ? computedScore : computedScore,
      kkmStatus,
    };
  });

  const startedRows = rows.filter((r) => r.status !== 'not_started');
  const finishedRows = rows.filter(
    (r) => r.status === 'submitted' || r.status === 'force_stopped'
  );
  const gradedRows = rows.filter(
    (r) => r.status !== 'not_started' && r.finalScore !== null
  );

  const scores = gradedRows.map((r) => r.finalScore as number);
  const averageScore =
    scores.length > 0
      ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
      : null;
  const highestScore = scores.length > 0 ? Number(Math.max(...scores).toFixed(1)) : null;
  const lowestScore = scores.length > 0 ? Number(Math.min(...scores).toFixed(1)) : null;
  const passedCount = gradedRows.filter((r) => (r.finalScore ?? 0) >= kkm).length;
  const passRatePct =
    gradedRows.length > 0 ? Math.round((passedCount / gradedRows.length) * 100) : 0;

  const typePerformance: TypePerformanceSummary[] = ALL_TYPES.map((qt) => {
    const qCount = typeQuestionCounts[qt];
    const maxPts = typeMaxTotals[qt];
    if (startedRows.length === 0 || qCount === 0 || maxPts === 0) {
      return {
        type: qt,
        shortLabel: QUESTION_TYPE_SHORT[qt],
        label: QUESTION_TYPE_LABELS[qt],
        questionCount: qCount,
        maxPoints: maxPts,
        avgEarned: 0,
        avgAccuracyPct: 0,
      };
    }
    const sumEarned = startedRows.reduce((acc, r) => acc + r.typeScores[qt].earned, 0);
    const avgEarned = Number((sumEarned / startedRows.length).toFixed(1));
    const avgAccuracyPct = Math.round((avgEarned / maxPts) * 100);
    return {
      type: qt,
      shortLabel: QUESTION_TYPE_SHORT[qt],
      label: QUESTION_TYPE_LABELS[qt],
      questionCount: qCount,
      maxPoints: maxPts,
      avgEarned,
      avgAccuracyPct,
    };
  });

  return {
    rows,
    totalRegistered: rows.length,
    startedCount: startedRows.length,
    finishedCount: finishedRows.length,
    gradedCount: gradedRows.length,
    averageScore,
    highestScore,
    lowestScore,
    passedCount,
    passRatePct,
    kkm,
    typePerformance,
  };
}

function sanitizePdfText(value: string): string {
  // jsPDF standard Helvetica supports Latin-1; normalize whitespace cleanly
  return value.replace(/\s+/g, ' ').trim();
}

export function exportExamResultsPdf(options: ExamPdfOptions): void {
  const report = buildExamResultReport(options);
  const {
    examConfig,
    orientation,
    includeTypeBreakdown,
    includeTypeSummary,
    includeSignatures,
    principalName,
    proctorName,
    cityName,
    classFilter,
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const generatedAt = new Date();
  const formattedDate = generatedAt.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const formattedTime = generatedAt.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // 1. Kop Surat / Institutional Header
  const schoolName = sanitizePdfText(
    (examConfig.schoolName || 'SD PEDAK').toUpperCase()
  );
  const examTitle = sanitizePdfText(examConfig.title || 'Tryout TKA SD');
  const examSubtitle = sanitizePdfText(examConfig.subtitle || 'Ujian Berbasis Komputer (CBT Online)');

  doc.setFillColor(30, 58, 138); // #1E3A8A
  doc.rect(marginX, 11, 4, 17, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(schoolName, marginX + 7, 16);

  doc.setFontSize(10.5);
  doc.setTextColor(30, 58, 138);
  doc.text('LAPORAN REKAPITULASI HASIL UJIAN CBT ONLINE', marginX + 7, 21.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${examTitle} · ${examSubtitle}`, marginX + 7, 26.5);

  // Right-side metadata box in header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const metaRight = [
    `Tanggal Ujian: ${examConfig.scheduleDate || formattedDate}`,
    `Sesi / Ruang: ${examConfig.sessionCode || '-'} · ${examConfig.roomName || 'Ruang CBT'}`,
    `Filter Kelas: ${classFilter === 'all' ? 'Semua Kelas' : classFilter} · KKM: ${report.kkm}`,
  ];
  doc.text(metaRight, pageWidth - marginX, 15.5, { align: 'right', lineHeightFactor: 1.45 });

  // Double horizontal kop rule
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.7);
  doc.line(marginX, 31, pageWidth - marginX, 31);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(marginX, 32.2, pageWidth - marginX, 32.2);

  // 2. Summary KPI Strip (4 boxes)
  const kpiTop = 36;
  const kpiGap = 3.5;
  const kpiWidth = (contentWidth - kpiGap * 3) / 4;
  const kpiHeight = 16;

  const kpiCards = [
    {
      label: 'TOTAL PESERTA',
      value: `${report.totalRegistered} Siswa`,
      sub: `${report.finishedCount} selesai · ${report.startedCount} aktif/masuk`,
      accent: [37, 99, 235] as [number, number, number],
    },
    {
      label: 'RATA-RATA NILAI',
      value: report.averageScore !== null ? `${report.averageScore}` : '—',
      sub: `Dari ${report.gradedCount} peserta ternilai`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'TERTINGGI / TERENDAH',
      value:
        report.highestScore !== null && report.lowestScore !== null
          ? `${report.highestScore} / ${report.lowestScore}`
          : '—',
      sub: `Skala nilai 0 – 100`,
      accent: [217, 119, 6] as [number, number, number],
    },
    {
      label: `KETUNTASAN (KKM ${report.kkm})`,
      value: `${report.passedCount}/${report.gradedCount} (${report.passRatePct}%)`,
      sub: `${Math.max(0, report.gradedCount - report.passedCount)} perlu remedial`,
      accent: [5, 150, 105] as [number, number, number],
    },
  ];

  kpiCards.forEach((card, i) => {
    const x = marginX + i * (kpiWidth + kpiGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, kpiTop, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 3, kpiTop + 4.5);

    doc.setFontSize(11);
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.value, x + 3, kpiTop + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.sub, x + 3, kpiTop + 14);
  });

  // 3. Student Scores Table
  let currentY = kpiTop + kpiHeight + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('A. Rekapitulasi Nilai Peserta Ujian', marginX, currentY);
  currentY += 2.5;

  const headRow = includeTypeBreakdown
    ? [
        [
          'No',
          'NIS',
          'Nama Peserta',
          'Kelas',
          'Status',
          'Pel.',
          'PG',
          'PGK',
          'MCMA',
          'Poin',
          'Nilai',
          'Ket.',
        ],
      ]
    : [
        [
          'No',
          'NIS',
          'Nama Peserta',
          'Kelas',
          'Status',
          'Progres',
          'Pel.',
          'Total Poin',
          'Nilai Akhir',
          'Keterangan',
        ],
      ];

  const bodyRows =
    report.rows.length === 0
      ? [
          [
            {
              content: 'Belum ada data peserta untuk filter yang dipilih.',
              colSpan: headRow[0].length,
              styles: { halign: 'center' as const, textColor: [100, 116, 139] as [number, number, number] },
            },
          ],
        ]
      : report.rows.map((r) => {
          const isNotStarted = r.status === 'not_started';
          const fmtType = (qt: QuestionType) =>
            isNotStarted
              ? '—'
              : `${Number(r.typeScores[qt].earned.toFixed(1))}/${r.typeScores[qt].max}`;

          if (includeTypeBreakdown) {
            return [
              String(r.no),
              r.nis,
              sanitizePdfText(r.name),
              sanitizePdfText(r.kelas),
              r.statusLabel,
              isNotStarted ? '—' : String(r.violationsCount),
              fmtType('multiple_choice'),
              fmtType('true_false'),
              fmtType('mcma'),
              isNotStarted ? '—' : `${r.earnedPoints}/${r.maxPoints}`,
              r.finalScore !== null ? String(r.finalScore) : '—',
              r.kkmStatus,
            ];
          }

          return [
            String(r.no),
            r.nis,
            sanitizePdfText(r.name),
            sanitizePdfText(r.kelas),
            r.statusLabel,
            isNotStarted ? `0/${r.totalQuestions}` : `${r.answeredCount}/${r.totalQuestions}`,
            isNotStarted ? '—' : String(r.violationsCount),
            isNotStarted ? '—' : `${r.earnedPoints}/${r.maxPoints}`,
            r.finalScore !== null ? String(r.finalScore) : '—',
            r.kkmStatus,
          ];
        });

  autoTable(doc, {
    startY: currentY,
    head: headRow,
    body: bodyRows,
    margin: { left: marginX, right: marginX, top: 14, bottom: 16 },
    styles: {
      font: 'helvetica',
      fontSize: includeTypeBreakdown && orientation === 'portrait' ? 7.2 : 7.8,
      cellPadding: includeTypeBreakdown && orientation === 'portrait' ? 1.8 : 2.1,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: includeTypeBreakdown
      ? {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'center' },
          2: { halign: 'left', fontStyle: 'bold' },
          3: { halign: 'left' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right', fontStyle: 'bold' },
          11: { halign: 'center', fontStyle: 'bold' },
        }
      : {
          0: { halign: 'center', cellWidth: 9 },
          1: { halign: 'center' },
          2: { halign: 'left', fontStyle: 'bold' },
          3: { halign: 'left' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'right' },
          8: { halign: 'right', fontStyle: 'bold' },
          9: { halign: 'center', fontStyle: 'bold' },
        },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return;
      const lastColIndex = headRow[0].length - 1;
      const scoreColIndex = headRow[0].length - 2;
      const cellText = String(hookData.cell.raw || '');
      if (hookData.column.index === lastColIndex) {
        if (cellText === 'Tuntas') {
          hookData.cell.styles.textColor = [4, 120, 87];
        } else if (cellText === 'Belum Tuntas') {
          hookData.cell.styles.textColor = [190, 18, 60];
        } else if (cellText === 'Proses') {
          hookData.cell.styles.textColor = [180, 83, 9];
        } else {
          hookData.cell.styles.textColor = [100, 116, 139];
        }
      }
      if (hookData.column.index === scoreColIndex && cellText !== '—') {
        const num = Number(cellText);
        if (!Number.isNaN(num)) {
          hookData.cell.styles.textColor =
            num >= report.kkm ? [29, 78, 216] : [190, 18, 60];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = ((doc as any).lastAutoTable?.finalY ?? currentY + 20) + 7;

  // 4. Optional 5-Question-Type Performance Summary
  if (includeTypeSummary) {
    if (currentY > pageHeight - 52) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('B. Ringkasan Performa per Jenis Soal', marginX, currentY);
    currentY += 2.5;

    autoTable(doc, {
      startY: currentY,
      head: [['Jenis Soal', 'Jumlah Butir', 'Bobot Maksimal', 'Rata-rata Poin Peserta', 'Rata-rata Akurasi']],
      body: report.typePerformance.map((tp) => [
        `${tp.label} (${tp.shortLabel})`,
        `${tp.questionCount} butir`,
        `${tp.maxPoints} poin`,
        `${tp.avgEarned} poin`,
        `${tp.avgAccuracyPct}%`,
      ]),
      margin: { left: marginX, right: marginX, bottom: 16 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = ((doc as any).lastAutoTable?.finalY ?? currentY + 20) + 8;
  }

  // 5. Optional Signature Block
  if (includeSignatures) {
    if (currentY > pageHeight - 44) {
      doc.addPage();
      currentY = 18;
    }

    const leftSigX = marginX + 12;
    const rightSigX = pageWidth - marginX - 58;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Mengetahui,', leftSigX, currentY);
    doc.text(`${sanitizePdfText(cityName || 'Jakarta')}, ${formattedDate}`, rightSigX, currentY);

    doc.text('Kepala Sekolah', leftSigX, currentY + 4.5);
    doc.text('Proktor / Guru Pengampu', rightSigX, currentY + 4.5);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.line(leftSigX, currentY + 23, leftSigX + 48, currentY + 23);
    doc.line(rightSigX, currentY + 23, rightSigX + 48, currentY + 23);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(principalName || 'Kepala Sekolah'), leftSigX, currentY + 27.5);
    doc.text(sanitizePdfText(proctorName || 'Proktor / Guru CBT'), rightSigX, currentY + 27.5);
  }

  // 6. Add Page Numbers & Footer on Every Page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `CBT Online · Dicetak pada ${formattedDate} pukul ${formattedTime}`,
      marginX,
      pageHeight - 6.5
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 6.5, {
      align: 'right',
    });
  }

  const slug = (examConfig.sessionCode || 'cbt-tryout')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const dateSlug = generatedAt.toISOString().slice(0, 10);
  doc.save(`laporan-hasil-${slug}-${dateSlug}.pdf`);
}
