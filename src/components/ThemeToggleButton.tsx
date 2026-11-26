import React from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleButtonProps {
  isDark: boolean;
  onToggle: () => void;
  showLabel?: boolean;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  isDark,
  onToggle,
  showLabel = false,
}) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
      aria-pressed={isDark}
      title={isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
      className={`h-8 inline-flex items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors shrink-0 ${
        showLabel ? 'px-3' : 'w-8'
      } ${
        isDark
          ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
          : 'bg-white/85 border-slate-200/80 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/70'
      }`}
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5" />
      ) : (
        <Moon className="w-3.5 h-3.5" />
      )}
      {showLabel && (
        <span className="hidden sm:inline">
          {isDark ? 'Terang' : 'Gelap'}
        </span>
      )}
    </button>
  );
};
