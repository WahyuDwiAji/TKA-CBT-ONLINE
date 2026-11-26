import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ExamProgressBarProps {
  answeredCount: number;
  totalCount: number;
  doubtfulCount?: number;
  variant?: 'banner' | 'compact';
}

export const ExamProgressBar: React.FC<ExamProgressBarProps> = ({
  answeredCount,
  totalCount,
  doubtfulCount = 0,
  variant = 'banner',
}) => {
  const safeTotal = Math.max(0, totalCount);
  const safeAnswered = Math.min(Math.max(0, answeredCount), safeTotal);
  const remainingCount = Math.max(0, safeTotal - safeAnswered);
  const percentage =
    safeTotal > 0 ? Math.round((safeAnswered / safeTotal) * 100) : 0;

  const isComplete = safeTotal > 0 && safeAnswered === safeTotal;
  const isNearComplete = percentage >= 75 && !isComplete;

  const fillGradientClass = isComplete
    ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400'
    : isNearComplete
      ? 'bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400'
      : 'bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400';

  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Daftar Soal
          </h2>
          <span
            className={`text-xs font-mono tabular-nums font-semibold ${
              isComplete
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-indigo-700 dark:text-indigo-300'
            }`}
          >
            {safeAnswered}/{safeTotal} ({percentage}%)
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Progres pengerjaan soal"
          aria-valuenow={safeAnswered}
          aria-valuemin={0}
          aria-valuemax={safeTotal}
          className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${fillGradientClass}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Progres Pengerjaan Ujian"
      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-4 py-3 md:px-5 md:py-3.5 shadow-2xs space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isComplete
                ? 'bg-emerald-400'
                : safeAnswered > 0
                  ? 'bg-indigo-400'
                  : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Progres Pengerjaan
          </span>
          <span className="text-slate-300 dark:text-slate-600 text-xs" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            <strong className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {safeAnswered}
            </strong>{' '}
            dari{' '}
            <strong className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {safeTotal}
            </strong>{' '}
            soal dijawab
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs shrink-0">
          {doubtfulCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-mono tabular-nums">{doubtfulCount}</span> ragu
            </span>
          )}
          {remainingCount > 0 ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-rose-300 dark:bg-rose-400" />
              <span className="font-mono tabular-nums">{remainingCount}</span> belum
            </span>
          ) : (
            safeTotal > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Lengkap
              </span>
            )
          )}
          <span
            className={`px-2.5 py-0.5 rounded-lg font-mono tabular-nums text-xs font-semibold border ${
              isComplete
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70'
                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/70'
            }`}
          >
            {percentage}%
          </span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Progres soal terjawab"
        aria-valuenow={safeAnswered}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${fillGradientClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </section>
  );
};
