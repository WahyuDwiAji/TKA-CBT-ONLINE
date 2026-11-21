import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { MathText } from './MathText';
import { sanitizeImageUrl } from '../lib/imageUpload';
import type {
  Question,
  QuestionDifficulty,
  StudentAnswerValue,
} from '../types/cbt';
import {
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
} from '../types/cbt';

interface QuestionStudentPreviewProps {
  question: Question;
  questionNumber?: number;
  interactive?: boolean;
  defaultShowAnswerKey?: boolean;
  showMetadataHeader?: boolean;
}

export function getQuestionDifficulty(q: { difficulty?: QuestionDifficulty }): QuestionDifficulty {
  if (q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard') {
    return q.difficulty;
  }
  return 'medium';
}

export function getDifficultyTone(difficulty: QuestionDifficulty): {
  label: string;
  textClass: string;
  bgClass: string;
} {
  switch (difficulty) {
    case 'easy':
      return {
        label: QUESTION_DIFFICULTY_LABELS.easy,
        textClass: 'text-emerald-700',
        bgClass: 'bg-emerald-50 border-emerald-200',
      };
    case 'hard':
      return {
        label: QUESTION_DIFFICULTY_LABELS.hard,
        textClass: 'text-rose-700',
        bgClass: 'bg-rose-50 border-rose-200',
      };
    default:
      return {
        label: QUESTION_DIFFICULTY_LABELS.medium,
        textClass: 'text-amber-700',
        bgClass: 'bg-amber-50 border-amber-200',
      };
  }
}

export const QuestionStudentPreview: React.FC<QuestionStudentPreviewProps> = ({
  question,
  questionNumber = 1,
  interactive = true,
  defaultShowAnswerKey = false,
  showMetadataHeader = true,
}) => {
  const [largeFont, setLargeFont] = useState(false);
  const [showKey, setShowKey] = useState(defaultShowAnswerKey);
  const [trialAnswer, setTrialAnswer] = useState<StudentAnswerValue | undefined>(undefined);

  useEffect(() => {
    setTrialAnswer(undefined);
  }, [question.id, question.type]);

  const difficulty = getQuestionDifficulty(question);
  const diffTone = getDifficultyTone(difficulty);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Sub-Header matching Student Exam Browser */}
      {showMetadataHeader && (
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-600 text-white text-xs font-mono tabular-nums font-bold rounded-md">
              SOAL NO. {questionNumber}
            </span>
            <span className="text-xs font-semibold text-slate-800">
              {QUESTION_TYPE_LABELS[question.type]}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs font-medium text-slate-700">
              {question.subject || 'Umum'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${diffTone.bgClass} ${diffTone.textClass}`}
            >
              {diffTone.label}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {question.points} poin
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {interactive && trialAnswer !== undefined && (
              <button
                type="button"
                onClick={() => setTrialAnswer(undefined)}
                title="Reset simulasi jawaban"
                className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className={`h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap ${
                showKey
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showKey ? 'Sembunyikan Kunci' : 'Lihat Kunci'}
            </button>
            <div className="inline-flex items-center border border-slate-300 rounded-md overflow-hidden bg-white ml-1">
              <button
                type="button"
                onClick={() => setLargeFont(false)}
                className={`h-7 px-2 text-xs font-medium ${
                  !largeFont ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setLargeFont(true)}
                className={`h-7 px-2 text-xs font-bold ${
                  largeFont ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                A+
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Body matching StudentExamView */}
      <div className="p-5 md:p-6 space-y-5">
        {sanitizeImageUrl(question.imageUrl) && (
          <figure className="space-y-1.5">
            <img
              src={sanitizeImageUrl(question.imageUrl) || ''}
              alt={question.imageCaption || 'Gambar soal'}
              className="max-h-72 w-auto rounded-xl border border-slate-200 bg-white object-contain"
            />
            {question.imageCaption && (
              <figcaption className="text-xs text-slate-500">
                {question.imageCaption}
              </figcaption>
            )}
          </figure>
        )}

        <div
          className={`text-slate-900 leading-relaxed ${
            largeFont ? 'text-lg' : 'text-sm md:text-base'
          }`}
        >
          {question.prompt?.trim() ? (
            <MathText text={question.prompt} direction={question.direction} />
          ) : !sanitizeImageUrl(question.imageUrl) ? (
            <p className="italic text-slate-400">Teks pertanyaan belum diisi.</p>
          ) : null}
        </div>

        {/* 1. Multiple Choice */}
        {question.type === 'multiple_choice' && (
          <div className="space-y-2">
            {question.options.map((opt, idx) => {
              const selected = trialAnswer === opt.id;
              const isKey = showKey && question.correctOptionId === opt.id;
              const letter = String.fromCharCode(65 + idx);
              const optImg = sanitizeImageUrl(opt.imageUrl);
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!interactive}
                  onClick={() => interactive && setTrialAnswer(opt.id)}
                  className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                    selected
                      ? 'bg-emerald-50 border-emerald-600 text-slate-900'
                      : isKey
                        ? 'bg-emerald-50/60 border-emerald-400 text-slate-900'
                        : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                      selected || isKey
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 border border-slate-300 text-slate-700'
                    }`}
                  >
                    {letter}
                  </span>
                  <div className={`flex-1 pt-0.5 space-y-2 ${largeFont ? 'text-base' : 'text-sm'}`}>
                    {opt.text && <MathText text={opt.text} direction={question.direction} />}
                    {optImg && (
                      <img
                        src={optImg}
                        alt={`Gambar opsi ${letter}`}
                        className="max-h-36 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                      />
                    )}
                    {!opt.text && !optImg && <span>—</span>}
                  </div>
                  {isKey && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 shrink-0 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Kunci
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 2. Complex Multiple Choice & MCMA */}
        {(question.type === 'complex_multiple_choice' || question.type === 'mcma') && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-600">
                {question.type === 'mcma'
                  ? 'MCMA (Multiple Choice Multiple Answer) — Pilih semua jawaban yang benar:'
                  : 'Pilih semua jawaban yang benar (lebih dari satu):'}
              </p>
              {question.type === 'mcma' && (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                  {question.scoringMode === 'exact'
                    ? 'Penilaian: Tepat Semua'
                    : 'Penilaian: Parsial'}
                </span>
              )}
            </div>
            {question.options.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const currentArr = Array.isArray(trialAnswer) ? (trialAnswer as string[]) : [];
              const checked = currentArr.includes(opt.id);
              const isKey = showKey && question.correctOptionIds.includes(opt.id);
              const toggle = () => {
                if (!interactive) return;
                const next = checked
                  ? currentArr.filter((id) => id !== opt.id)
                  : [...currentArr, opt.id];
                setTrialAnswer(next);
              };
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!interactive}
                  onClick={toggle}
                  className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                    checked
                      ? 'bg-emerald-50 border-emerald-600 text-slate-900'
                      : isKey
                        ? 'bg-emerald-50/60 border-emerald-400 text-slate-900'
                        : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                      checked
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-400'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </span>
                  {question.type === 'mcma' && (
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                        checked || isKey
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 border border-slate-300 text-slate-700'
                      }`}
                    >
                      {letter}
                    </span>
                  )}
                  <div className={`flex-1 space-y-2 ${largeFont ? 'text-base' : 'text-sm'}`}>
                    {opt.text && <MathText text={opt.text} direction={question.direction} />}
                    {sanitizeImageUrl(opt.imageUrl) && (
                      <img
                        src={sanitizeImageUrl(opt.imageUrl) || ''}
                        alt={`Gambar opsi ${letter}`}
                        className="max-h-36 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                      />
                    )}
                    {!opt.text && !sanitizeImageUrl(opt.imageUrl) && <span>—</span>}
                  </div>
                  {isKey && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 shrink-0 pt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Kunci
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 3. Matching */}
        {question.type === 'matching' && (
          <div className="divide-y divide-slate-200 border border-slate-300 rounded-xl overflow-hidden">
            {question.pairs.map((pair, idx) => {
              const currentMap =
                trialAnswer && typeof trialAnswer === 'object' && !Array.isArray(trialAnswer)
                  ? (trialAnswer as Record<string, string>)
                  : {};
              const selectedPairId = currentMap[pair.id] || '';
              return (
                <div
                  key={pair.id}
                  className="p-3.5 bg-white grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                >
                  <div className="md:col-span-6 flex items-start gap-2.5 text-sm text-slate-900">
                    <span className="font-mono text-xs text-slate-500 mt-0.5">{idx + 1}.</span>
                    <MathText text={pair.left || '—'} direction={question.direction} />
                  </div>
                  <div className="md:col-span-6 space-y-1">
                    <select
                      disabled={!interactive}
                      value={selectedPairId}
                      onChange={(e) => {
                        const next = { ...currentMap, [pair.id]: e.target.value };
                        if (!e.target.value) delete next[pair.id];
                        setTrialAnswer(next);
                      }}
                      className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">-- Pilih pasangan --</option>
                      {[...question.pairs].reverse().map((rp) => (
                        <option key={rp.id} value={rp.id}>
                          {rp.right}
                        </option>
                      ))}
                    </select>
                    {showKey && (
                      <p className="text-[11px] font-medium text-emerald-700">
                        Kunci: {pair.right}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. True / False (PGK Kategori) */}
        {question.type === 'true_false' && (
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-slate-600">
              Pilihan Ganda Kompleks — Tentukan apakah setiap pernyataan berikut <strong>Benar (Sesuai)</strong> atau <strong>Salah (Tidak Sesuai)</strong>:
            </p>
            <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
              {question.statements.map((stmt, idx) => {
                const currentMap =
                  trialAnswer && typeof trialAnswer === 'object' && !Array.isArray(trialAnswer)
                    ? (trialAnswer as Record<string, boolean>)
                    : {};
                const val = currentMap[stmt.id];
                const setChoice = (choice: boolean) => {
                  if (!interactive) return;
                  setTrialAnswer({ ...currentMap, [stmt.id]: choice });
                };
                return (
                  <div
                    key={stmt.id}
                    className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 text-sm text-slate-900 flex-1">
                      <span className="font-mono text-xs text-slate-500 mt-0.5">{idx + 1}.</span>
                      <div className="space-y-1 flex-1">
                        <MathText text={stmt.text || '—'} direction={question.direction} />
                        {showKey && (
                          <p className="text-[11px] font-semibold text-emerald-700">
                            Kunci: {stmt.isTrue ? 'Benar' : 'Salah'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={() => setChoice(true)}
                        className={`h-8 px-3.5 text-xs font-bold rounded-lg border transition-colors ${
                          val === true
                            ? 'bg-emerald-600 border-emerald-700 text-white'
                            : showKey && stmt.isTrue
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Benar
                      </button>
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={() => setChoice(false)}
                        className={`h-8 px-3.5 text-xs font-bold rounded-lg border transition-colors ${
                          val === false
                            ? 'bg-rose-600 border-rose-700 text-white'
                            : showKey && !stmt.isTrue
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Salah
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Essay */}
        {question.type === 'essay' && (
          <div className="space-y-3">
            <textarea
              rows={4}
              readOnly={!interactive}
              value={typeof trialAnswer === 'string' ? trialAnswer : ''}
              onChange={(e) => interactive && setTrialAnswer(e.target.value)}
              dir={question.direction === 'rtl' ? 'rtl' : 'ltr'}
              placeholder="Area jawaban uraian siswa..."
              className="w-full p-3.5 text-sm text-slate-900 bg-slate-50 focus:bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {showKey && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                {question.expectedKeywords.length > 0 && (
                  <p>
                    <strong>Kata Kunci:</strong> {question.expectedKeywords.join(', ')}
                  </p>
                )}
                {question.sampleAnswer && (
                  <p>
                    <strong>Rubrik / Contoh Jawaban:</strong> {question.sampleAnswer}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
