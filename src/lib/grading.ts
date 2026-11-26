import type {
  ExamGradeSummary,
  Question,
  QuestionGradeResult,
  StudentAnswerValue,
} from '../types/cbt';

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function round1(n: number): number {
  return Number(n.toFixed(1));
}

export function normalizeQuestionPoints(rawPoints: unknown): number {
  const num = Number(rawPoints);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return round2(num);
}

export function validateQuestionIntegrity(question: Question): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (normalizeQuestionPoints(question.points) <= 0) {
    issues.push('Bobot poin harus lebih dari 0.');
  }

  switch (question.type) {
    case 'multiple_choice': {
      if (!question.options || question.options.length < 2) {
        issues.push('Pilihan ganda minimal memiliki 2 opsi.');
      }
      const optionIds = new Set((question.options || []).map((o) => o.id));
      if (!question.correctOptionId || !optionIds.has(question.correctOptionId)) {
        issues.push('Kunci jawaban PG belum valid atau tidak ada pada daftar opsi.');
      }
      break;
    }
    case 'complex_multiple_choice':
    case 'mcma': {
      if (!question.options || question.options.length < 2) {
        issues.push('Soal pilihan kompleks/MCMA minimal memiliki 2 opsi.');
      }
      const optionIds = new Set((question.options || []).map((o) => o.id));
      const validKeys = (question.correctOptionIds || []).filter((id) => optionIds.has(id));
      if (validKeys.length === 0) {
        issues.push('Minimal harus ada 1 kunci jawaban valid.');
      }
      break;
    }
    case 'true_false': {
      if (!question.statements || question.statements.length === 0) {
        issues.push('Soal Benar/Salah belum memiliki pernyataan.');
      }
      break;
    }
    case 'matching': {
      if (!question.pairs || question.pairs.length === 0) {
        issues.push('Soal menjodohkan belum memiliki pasangan.');
      }
      break;
    }
    case 'essay':
      break;
  }

  return { valid: issues.length === 0, issues };
}

export function sanitizeStudentAnswer(
  question: Question,
  rawAnswer: unknown
): StudentAnswerValue | undefined {
  if (rawAnswer === undefined || rawAnswer === null) return undefined;

  switch (question.type) {
    case 'multiple_choice': {
      if (typeof rawAnswer !== 'string') return undefined;
      const trimmed = rawAnswer.trim();
      if (!trimmed) return '';
      const validIds = new Set(question.options.map((o) => o.id));
      return validIds.has(trimmed) ? trimmed : undefined;
    }
    case 'complex_multiple_choice':
    case 'mcma': {
      if (!Array.isArray(rawAnswer)) return undefined;
      const validIds = new Set(question.options.map((o) => o.id));
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const item of rawAnswer) {
        if (typeof item === 'string' && validIds.has(item) && !seen.has(item)) {
          seen.add(item);
          unique.push(item);
        }
      }
      return unique;
    }
    case 'true_false': {
      if (typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) return undefined;
      const validStmtIds = new Set(question.statements.map((s) => s.id));
      const cleaned: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(rawAnswer as Record<string, unknown>)) {
        if (validStmtIds.has(k) && typeof v === 'boolean') {
          cleaned[k] = v;
        }
      }
      return cleaned;
    }
    case 'matching': {
      if (typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) return undefined;
      const validPairIds = new Set(question.pairs.map((p) => p.id));
      const cleaned: Record<string, string> = {};
      for (const [leftId, rightId] of Object.entries(rawAnswer as Record<string, unknown>)) {
        if (
          validPairIds.has(leftId) &&
          typeof rightId === 'string' &&
          validPairIds.has(rightId)
        ) {
          cleaned[leftId] = rightId;
        }
      }
      return cleaned;
    }
    case 'essay': {
      if (typeof rawAnswer !== 'string') return undefined;
      return rawAnswer.slice(0, 10000);
    }
  }
}

export function sanitizeQuestionForActiveStudent(question: Question): Question {
  const base = {
    ...question,
    explanation: undefined,
  };
  switch (base.type) {
    case 'multiple_choice':
      return { ...base, correctOptionId: '' };
    case 'complex_multiple_choice':
      return { ...base, correctOptionIds: [] };
    case 'mcma':
      return { ...base, correctOptionIds: [] };
    case 'true_false':
      return {
        ...base,
        statements: base.statements.map((s) => ({ ...s, isTrue: false })),
      };
    case 'matching':
      return base;
    case 'essay':
      return { ...base, expectedKeywords: [], sampleAnswer: '' };
  }
}

export function isQuestionAnswered(
  question: Question,
  answer: StudentAnswerValue | undefined
): boolean {
  if (answer === undefined || answer === null) return false;

  switch (question.type) {
    case 'multiple_choice': {
      if (typeof answer !== 'string' || !answer.trim()) return false;
      return question.options.some((o) => o.id === answer);
    }
    case 'complex_multiple_choice':
    case 'mcma': {
      if (!Array.isArray(answer) || answer.length === 0) return false;
      const validIds = new Set(question.options.map((o) => o.id));
      return answer.some((id) => validIds.has(id));
    }
    case 'matching': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const validIds = new Set(question.pairs.map((p) => p.id));
      return Object.entries(answer).some(
        ([k, v]) => validIds.has(k) && typeof v === 'string' && validIds.has(v)
      );
    }
    case 'true_false': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const validIds = new Set(question.statements.map((s) => s.id));
      return Object.entries(answer).some(
        ([k, v]) => validIds.has(k) && typeof v === 'boolean'
      );
    }
    case 'essay':
      return typeof answer === 'string' && answer.trim().length > 0;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesEssayKeyword(normalizedText: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  if (kw.includes(' ') || /[^a-z0-9]/i.test(kw)) {
    return normalizedText.includes(kw);
  }
  const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(kw)}($|[^a-z0-9])`, 'i');
  return regex.test(normalizedText);
}

export function getScorePredicate(totalScore: number, kkm = 75): string {
  if (totalScore >= 90) return 'Sangat Baik (A)';
  if (totalScore >= 80) return 'Baik (B)';
  if (totalScore >= kkm) return 'Cukup / Tuntas (C)';
  return 'Perlu Bimbingan (D)';
}

export interface GradingOptions {
  negativeMarking?: boolean;
  negativePenaltyRatio?: number;
  kkm?: number;
}

export function gradeQuestion(
  question: Question,
  answer: StudentAnswerValue | undefined,
  manualOverride?: number,
  options?: GradingOptions
): QuestionGradeResult {
  const maxPoints = normalizeQuestionPoints(question.points);
  const penaltyRatio =
    options?.negativeMarking && (options.negativePenaltyRatio ?? 0.25) > 0
      ? Math.min(1, Math.max(0, options.negativePenaltyRatio ?? 0.25))
      : 0;
  const answered = isQuestionAnswered(question, answer);

  if (typeof manualOverride === 'number' && Number.isFinite(manualOverride)) {
    const clamped = round2(Math.max(0, Math.min(maxPoints, manualOverride)));
    const isCorrect = maxPoints > 0 ? clamped >= maxPoints * 0.6 : clamped > 0;
    const isPartial = clamped > 0 && clamped < maxPoints;
    return {
      questionId: question.id,
      type: question.type,
      earnedPoints: clamped,
      maxPoints,
      isCorrect,
      isPartial,
      isAnswered: answered,
      pendingManualReview: false,
      manualOverridden: true,
      feedback: `Nilai diverifikasi oleh proktor (${clamped}/${maxPoints} poin).`,
    };
  }

  switch (question.type) {
    case 'multiple_choice': {
      const validIds = new Set(question.options.map((o) => o.id));
      const rawSelected = typeof answer === 'string' ? answer.trim() : '';
      const selected = validIds.has(rawSelected) ? rawSelected : '';
      if (!selected) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: false,
          feedback: 'Tidak dijawab.',
        };
      }
      const keyValid = Boolean(question.correctOptionId && validIds.has(question.correctOptionId));
      const isCorrect = keyValid && selected === question.correctOptionId;
      const earnedPoints = isCorrect
        ? maxPoints
        : keyValid && penaltyRatio > 0
          ? round2(-maxPoints * penaltyRatio)
          : 0;
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints,
        maxPoints,
        isCorrect,
        isPartial: false,
        isAnswered: true,
        feedback: !keyValid
          ? 'Kunci jawaban soal belum valid.'
          : isCorrect
            ? 'Jawaban tepat.'
            : penaltyRatio > 0
              ? `Pilihan keliru (penalti -${Math.round(penaltyRatio * 100)}%).`
              : 'Pilihan belum sesuai kunci jawaban.',
      };
    }

    case 'complex_multiple_choice':
    case 'mcma': {
      const validIds = new Set(question.options.map((o) => o.id));
      const selectedSet = new Set<string>(
        Array.isArray(answer)
          ? answer.filter((id): id is string => typeof id === 'string' && validIds.has(id))
          : []
      );
      if (selectedSet.size === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: false,
          feedback: 'Tidak ada pilihan yang dipilih.',
        };
      }

      const correctSet = new Set(
        question.correctOptionIds.filter((id) => validIds.has(id))
      );
      if (correctSet.size === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: true,
          feedback: 'Kunci jawaban soal belum valid.',
        };
      }

      let hits = 0;
      let wrong = 0;
      for (const id of selectedSet) {
        if (correctSet.has(id)) hits++;
        else wrong++;
      }

      const isExact = hits === correctSet.size && wrong === 0;
      const scoringMode =
        question.type === 'mcma' ? question.scoringMode || 'partial' : 'partial';

      if (scoringMode === 'exact') {
        const earned = isExact
          ? maxPoints
          : penaltyRatio > 0
            ? round2(-maxPoints * penaltyRatio)
            : 0;
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: earned,
          maxPoints,
          isCorrect: isExact,
          isPartial: false,
          isAnswered: true,
          feedback: isExact
            ? `Semua ${correctSet.size} pilihan benar.`
            : `Skor penuh hanya jika seluruh ${correctSet.size} kunci dipilih tepat (${hits} benar, ${wrong} keliru).`,
        };
      }

      // Psychometrically valid partial-credit formula:
      // Selecting all options gives (K/K - D/D) = 0, eliminating blind check-all guessing.
      const distractorCount = Math.max(0, question.options.length - correctSet.size);
      const gainRatio = hits / correctSet.size;
      const deductionRatio = distractorCount > 0 ? wrong / distractorCount : 0;
      const netRatio = Math.max(0, Math.min(1, gainRatio - deductionRatio));
      let earned = round2(netRatio * maxPoints);
      if (hits === 0 && wrong > 0 && penaltyRatio > 0) {
        earned = round2(-maxPoints * penaltyRatio);
      }

      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: isExact,
        isPartial: !isExact && earned > 0,
        isAnswered: true,
        feedback: isExact
          ? `Semua ${correctSet.size} pilihan benar.`
          : `${hits} benar, ${wrong} keliru dari ${correctSet.size} kunci.`,
      };
    }

    case 'matching': {
      const validIds = new Set(question.pairs.map((p) => p.id));
      const map =
        answer && typeof answer === 'object' && !Array.isArray(answer)
          ? (answer as Record<string, string>)
          : {};
      const total = question.pairs.length;
      if (total === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: answered,
          feedback: 'Tidak ada pasangan pada konfigurasi soal.',
        };
      }
      let matched = 0;
      let answeredPairs = 0;
      for (const pair of question.pairs) {
        const chosenRight = map[pair.id];
        if (typeof chosenRight === 'string' && validIds.has(chosenRight)) {
          answeredPairs++;
          if (chosenRight === pair.id) {
            matched++;
          }
        }
      }
      if (answeredPairs === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: false,
          feedback: 'Belum ada pasangan yang dipilih.',
        };
      }
      const earned = round2((matched / total) * maxPoints);
      const isExact = matched === total;
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: isExact,
        isPartial: !isExact && matched > 0,
        isAnswered: true,
        feedback: `${matched} dari ${total} pasangan cocok.`,
      };
    }

    case 'true_false': {
      const map =
        answer && typeof answer === 'object' && !Array.isArray(answer)
          ? (answer as Record<string, boolean>)
          : {};
      const total = question.statements.length;
      if (total === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: answered,
          feedback: 'Tidak ada pernyataan pada konfigurasi soal.',
        };
      }
      let correct = 0;
      let answeredCount = 0;
      for (const stmt of question.statements) {
        if (typeof map[stmt.id] === 'boolean') {
          answeredCount++;
          if (map[stmt.id] === stmt.isTrue) {
            correct++;
          }
        }
      }
      if (answeredCount === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: false,
          feedback: 'Belum ada pernyataan yang dijawab.',
        };
      }
      const earned = round2((correct / total) * maxPoints);
      const isExact = correct === total;
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: isExact,
        isPartial: !isExact && correct > 0,
        isAnswered: true,
        feedback: `${correct} dari ${total} pernyataan benar.`,
      };
    }

    case 'essay': {
      const text = typeof answer === 'string' ? answer.trim() : '';
      if (!text) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: false,
          pendingManualReview: false,
          feedback: 'Esai tidak dijawab.',
        };
      }
      const normalized = text.toLowerCase();
      const keywords = question.expectedKeywords
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      if (keywords.length === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          isPartial: false,
          isAnswered: true,
          pendingManualReview: true,
          feedback: 'Menunggu koreksi manual guru/proktor (tidak ada rubrik kata kunci otomatis).',
        };
      }
      const matchedKeywords = keywords.filter((kw) => matchesEssayKeyword(normalized, kw));
      const ratio = Math.min(1, matchedKeywords.length / keywords.length);
      const earned = round2(ratio * maxPoints);
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: ratio >= 0.75,
        isPartial: ratio > 0 && ratio < 0.75,
        isAnswered: true,
        pendingManualReview: true,
        feedback: `Estimasi kata kunci: ${matchedKeywords.length}/${keywords.length} (${matchedKeywords.join(', ') || 'belum ada yang cocok'}) — dapat diverifikasi proktor.`,
      };
    }
  }
}

export function gradeExam(
  questions: Question[],
  answers: Record<string, StudentAnswerValue>,
  manualOverrides?: Record<string, number>,
  options?: GradingOptions
): ExamGradeSummary {
  const kkm = typeof options?.kkm === 'number' && Number.isFinite(options.kkm) ? options.kkm : 75;
  const breakdown: QuestionGradeResult[] = questions.map((q) =>
    gradeQuestion(
      q,
      answers[q.id],
      manualOverrides?.[q.id],
      options
    )
  );

  const rawEarned = breakdown.reduce((sum, item) => sum + item.earnedPoints, 0);
  const earnedPoints = round2(Math.max(0, rawEarned));
  const maxPoints = round2(breakdown.reduce((sum, item) => sum + item.maxPoints, 0));
  const totalScore =
    maxPoints > 0
      ? Math.min(100, Math.max(0, round1((earnedPoints / maxPoints) * 100)))
      : 0;
  const correctCount = breakdown.filter((b) => b.isCorrect).length;
  const partialCount = breakdown.filter((b) => Boolean(b.isPartial)).length;
  const unansweredCount = breakdown.filter((b) => b.isAnswered === false).length;
  const incorrectCount = Math.max(
    0,
    breakdown.length - correctCount - partialCount - unansweredCount
  );
  const pendingManualCount = breakdown.filter((b) => Boolean(b.pendingManualReview)).length;

  return {
    totalScore,
    earnedPoints,
    maxPoints,
    correctCount,
    partialCount,
    incorrectCount,
    unansweredCount,
    pendingManualCount,
    passedKkm: totalScore >= kkm,
    kkmUsed: kkm,
    predicate: getScorePredicate(totalScore, kkm),
    negativeMarkingApplied: Boolean(options?.negativeMarking),
    totalQuestions: questions.length,
    breakdown,
    gradedAt: new Date().toISOString(),
  };
}
