import type { Question, StudentSession } from '../types/cbt';
import { gradeQuestion, isQuestionAnswered, type GradingOptions } from './grading';

export interface ItemAnalysisRow {
  questionId: string;
  indexNumber: number;
  type: Question['type'];
  subject: string;
  topic: string;
  promptPreview: string;
  answeredCount: number;
  correctCount: number;
  difficultyIndex: number; // p-value 0..1
  difficultyLabel: 'Terlalu Mudah' | 'Ideal / Sedang' | 'Sulit' | 'Belum Cukup Data';
  discriminationIndex: number; // D-index -1..1
  discriminationLabel: 'Daya Beda Baik' | 'Cukup' | 'Perlu Revisi' | 'Belum Cukup Data';
  optionCounts: Record<string, number>;
  correctOptionId?: string;
}

export interface TopicMasteryRow {
  key: string;
  subject: string;
  topic: string;
  questionCount: number;
  averageMasteryPercent: number;
  needsReview: boolean;
}

export function computeItemAnalysis(
  questions: Question[],
  sessions: StudentSession[],
  gradingOptions?: GradingOptions
): ItemAnalysisRow[] {
  const gradedSessions = sessions
    .filter((s) => s.status === 'submitted' || s.status === 'force_stopped')
    .sort((a, b) => (b.gradeSummary?.totalScore ?? 0) - (a.gradeSummary?.totalScore ?? 0));

  const n = gradedSessions.length;
  const groupSize = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
  const upperGroup = groupSize > 0 ? gradedSessions.slice(0, groupSize) : [];
  const lowerGroup = groupSize > 0 ? gradedSessions.slice(-groupSize) : [];

  return questions.map((q, idx) => {
    let answeredCount = 0;
    let correctCount = 0;
    const optionCounts: Record<string, number> = {};

    for (const sess of gradedSessions) {
      const ans = sess.answers[q.id];
      if (isQuestionAnswered(q, ans)) {
        answeredCount++;
      }
      if (q.type === 'multiple_choice' && typeof ans === 'string' && ans) {
        optionCounts[ans] = (optionCounts[ans] || 0) + 1;
      } else if (
        (q.type === 'mcma' || q.type === 'complex_multiple_choice') &&
        Array.isArray(ans)
      ) {
        const seen = new Set<string>();
        for (const optId of ans) {
          if (typeof optId === 'string' && !seen.has(optId)) {
            seen.add(optId);
            optionCounts[optId] = (optionCounts[optId] || 0) + 1;
          }
        }
      }
      const res = gradeQuestion(
        q,
        ans,
        sess.manualEssayOverrides?.[q.id],
        gradingOptions
      );
      if (res.isCorrect) correctCount++;
    }

    const pValue = n > 0 ? correctCount / n : 0;
    let difficultyLabel: ItemAnalysisRow['difficultyLabel'] = 'Belum Cukup Data';
    if (n > 0) {
      if (pValue > 0.75) difficultyLabel = 'Terlalu Mudah';
      else if (pValue >= 0.3) difficultyLabel = 'Ideal / Sedang';
      else difficultyLabel = 'Sulit';
    }

    let dIndex = 0;
    let discriminationLabel: ItemAnalysisRow['discriminationLabel'] = 'Belum Cukup Data';
    if (groupSize > 0) {
      const upperCorrect = upperGroup.filter(
        (s) =>
          gradeQuestion(q, s.answers[q.id], s.manualEssayOverrides?.[q.id], gradingOptions)
            .isCorrect
      ).length;
      const lowerCorrect = lowerGroup.filter(
        (s) =>
          gradeQuestion(q, s.answers[q.id], s.manualEssayOverrides?.[q.id], gradingOptions)
            .isCorrect
      ).length;
      dIndex = Number(((upperCorrect - lowerCorrect) / groupSize).toFixed(2));
      if (dIndex >= 0.3) discriminationLabel = 'Daya Beda Baik';
      else if (dIndex >= 0.15) discriminationLabel = 'Cukup';
      else discriminationLabel = 'Perlu Revisi';
    }

    return {
      questionId: q.id,
      indexNumber: idx + 1,
      type: q.type,
      subject: q.subject,
      topic: q.topic?.trim() || 'Umum',
      promptPreview: q.prompt.replace(/\s+/g, ' ').slice(0, 90),
      answeredCount,
      correctCount,
      difficultyIndex: Number(pValue.toFixed(2)),
      difficultyLabel,
      discriminationIndex: dIndex,
      discriminationLabel,
      optionCounts,
      correctOptionId: q.type === 'multiple_choice' ? q.correctOptionId : undefined,
    };
  });
}

export function computeTopicMastery(
  questions: Question[],
  sessions: StudentSession[],
  kkm = 75,
  gradingOptions?: GradingOptions
): TopicMasteryRow[] {
  const gradedSessions = sessions.filter(
    (s) => s.status === 'submitted' || s.status === 'force_stopped'
  );
  const buckets = new Map<
    string,
    { subject: string; topic: string; questionCount: number; earned: number; max: number }
  >();

  for (const q of questions) {
    const topic = q.topic?.trim() || 'Umum';
    const key = `${q.subject}::${topic}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { subject: q.subject, topic, questionCount: 0, earned: 0, max: 0 };
      buckets.set(key, entry);
    }
    entry.questionCount += 1;
    for (const sess of gradedSessions) {
      const res = gradeQuestion(
        q,
        sess.answers[q.id],
        sess.manualEssayOverrides?.[q.id],
        gradingOptions
      );
      entry.earned += Math.max(0, res.earnedPoints);
      entry.max += res.maxPoints;
    }
  }

  return Array.from(buckets.entries()).map(([key, b]) => {
    const avg = b.max > 0 ? Number(((b.earned / b.max) * 100).toFixed(1)) : 0;
    return {
      key,
      subject: b.subject,
      topic: b.topic,
      questionCount: b.questionCount,
      averageMasteryPercent: avg,
      needsReview: gradedSessions.length > 0 && avg < kkm,
    };
  });
}
