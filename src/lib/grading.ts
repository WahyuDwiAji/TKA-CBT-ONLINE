import type {
  ExamGradeSummary,
  Question,
  QuestionGradeResult,
  StudentAnswerValue,
} from '../types/cbt';

export function isQuestionAnswered(
  question: Question,
  answer: StudentAnswerValue | undefined
): boolean {
  if (answer === undefined || answer === null) return false;

  switch (question.type) {
    case 'multiple_choice':
      return typeof answer === 'string' && answer.trim().length > 0;
    case 'complex_multiple_choice':
    case 'mcma':
      return Array.isArray(answer) && answer.length > 0;
    case 'matching':
      return (
        typeof answer === 'object' &&
        !Array.isArray(answer) &&
        Object.keys(answer).length > 0
      );
    case 'true_false':
      return (
        typeof answer === 'object' &&
        !Array.isArray(answer) &&
        Object.keys(answer).length > 0
      );
    case 'essay':
      return typeof answer === 'string' && answer.trim().length > 0;
  }
}

export function gradeQuestion(
  question: Question,
  answer: StudentAnswerValue | undefined,
  manualOverride?: number
): QuestionGradeResult {
  const maxPoints = question.points;

  if (typeof manualOverride === 'number' && !Number.isNaN(manualOverride)) {
    const clamped = Math.max(0, Math.min(maxPoints, manualOverride));
    return {
      questionId: question.id,
      type: question.type,
      earnedPoints: Number(clamped.toFixed(2)),
      maxPoints,
      isCorrect: clamped >= maxPoints * 0.6,
      feedback: `Nilai disesuaikan oleh proktor (${clamped}/${maxPoints} poin).`,
    };
  }

  switch (question.type) {
    case 'multiple_choice': {
      const selected = typeof answer === 'string' ? answer : '';
      const isCorrect = selected === question.correctOptionId;
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: isCorrect ? maxPoints : 0,
        maxPoints,
        isCorrect,
        feedback: isCorrect
          ? 'Jawaban tepat.'
          : selected
            ? 'Pilihan belum sesuai kunci jawaban.'
            : 'Tidak dijawab.',
      };
    }

    case 'complex_multiple_choice': {
      const selected = Array.isArray(answer) ? answer : [];
      if (selected.length === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          feedback: 'Tidak ada pilihan yang dipilih.',
        };
      }
      const correctSet = new Set(question.correctOptionIds);
      let hits = 0;
      let wrong = 0;
      for (const id of selected) {
        if (correctSet.has(id)) hits++;
        else wrong++;
      }
      const rawRatio =
        correctSet.size > 0 ? Math.max(0, (hits - wrong * 0.5) / correctSet.size) : 0;
      const earned = Number((rawRatio * maxPoints).toFixed(2));
      const isExact = hits === correctSet.size && wrong === 0;
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: isExact,
        feedback: isExact
          ? `Semua ${correctSet.size} pilihan benar.`
          : `${hits} benar, ${wrong} keliru dari ${correctSet.size} kunci.`,
      };
    }

    case 'mcma': {
      const selected = Array.isArray(answer) ? answer : [];
      if (selected.length === 0) {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: 0,
          maxPoints,
          isCorrect: false,
          feedback: 'Tidak ada pilihan MCMA yang dipilih.',
        };
      }
      const correctSet = new Set(question.correctOptionIds);
      let hits = 0;
      let wrong = 0;
      for (const id of selected) {
        if (correctSet.has(id)) hits++;
        else wrong++;
      }
      const isExact = hits === correctSet.size && wrong === 0;
      if (question.scoringMode === 'exact') {
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: isExact ? maxPoints : 0,
          maxPoints,
          isCorrect: isExact,
          feedback: isExact
            ? `Semua ${correctSet.size} jawaban MCMA tepat.`
            : `Skor penuh hanya jika seluruh ${correctSet.size} kunci dipilih tepat (${hits} benar, ${wrong} keliru).`,
        };
      }
      const rawRatio =
        correctSet.size > 0 ? Math.max(0, (hits - wrong * 0.5) / correctSet.size) : 0;
      const earned = Number((rawRatio * maxPoints).toFixed(2));
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: isExact,
        feedback: isExact
          ? `Semua ${correctSet.size} jawaban MCMA benar.`
          : `${hits} benar, ${wrong} keliru dari ${correctSet.size} kunci MCMA.`,
      };
    }

    case 'matching': {
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
          feedback: 'Tidak ada pasangan.',
        };
      }
      let matched = 0;
      for (const pair of question.pairs) {
        if (map[pair.id] === pair.id) {
          matched++;
        }
      }
      const earned = Number(((matched / total) * maxPoints).toFixed(2));
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: matched === total,
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
          feedback: 'Tidak ada pernyataan.',
        };
      }
      let correct = 0;
      for (const stmt of question.statements) {
        if (typeof map[stmt.id] === 'boolean' && map[stmt.id] === stmt.isTrue) {
          correct++;
        }
      }
      const earned = Number(((correct / total) * maxPoints).toFixed(2));
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: correct === total,
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
          feedback: 'Esai tidak dijawab.',
        };
      }
      const normalized = text.toLowerCase();
      const keywords = question.expectedKeywords.filter((k) => k.trim().length > 0);
      if (keywords.length === 0) {
        const earned = text.length >= 20 ? maxPoints : Number((maxPoints * 0.5).toFixed(2));
        return {
          questionId: question.id,
          type: question.type,
          earnedPoints: earned,
          maxPoints,
          isCorrect: true,
          feedback: 'Dinilai berdasarkan kelengkapan jawaban.',
        };
      }
      const matchedKeywords = keywords.filter((kw) =>
        normalized.includes(kw.trim().toLowerCase())
      );
      const ratio = Math.min(1, matchedKeywords.length / Math.max(1, Math.ceil(keywords.length * 0.6)));
      const earned = Number((ratio * maxPoints).toFixed(2));
      return {
        questionId: question.id,
        type: question.type,
        earnedPoints: earned,
        maxPoints,
        isCorrect: ratio >= 0.7,
        feedback: `Kata kunci terpenuhi: ${matchedKeywords.length}/${keywords.length} (${matchedKeywords.join(', ') || 'belum ada yang cocok'}).`,
      };
    }
  }
}

export function gradeExam(
  questions: Question[],
  answers: Record<string, StudentAnswerValue>,
  manualEssayOverrides?: Record<string, number>
): ExamGradeSummary {
  const breakdown: QuestionGradeResult[] = questions.map((q) =>
    gradeQuestion(
      q,
      answers[q.id],
      q.type === 'essay' ? manualEssayOverrides?.[q.id] : undefined
    )
  );

  const earnedPoints = Number(
    breakdown.reduce((sum, item) => sum + item.earnedPoints, 0).toFixed(2)
  );
  const maxPoints = breakdown.reduce((sum, item) => sum + item.maxPoints, 0);
  const totalScore =
    maxPoints > 0 ? Number(((earnedPoints / maxPoints) * 100).toFixed(1)) : 0;
  const correctCount = breakdown.filter((b) => b.isCorrect).length;

  return {
    totalScore,
    earnedPoints,
    maxPoints,
    correctCount,
    totalQuestions: questions.length,
    breakdown,
    gradedAt: new Date().toISOString(),
  };
}
