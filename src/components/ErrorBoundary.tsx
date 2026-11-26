import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function parseErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Terjadi kesalahan sistem.');
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
    if (parsed && typeof parsed === 'object' && parsed.error) {
      if (parsed.error.includes('Quota exceeded')) {
        return 'Kuota baca/tulis Firestore harian telah tercapai. Kuota akan diperbarui kembali besok.';
      }
      if (parsed.error.includes('Missing or insufficient permissions')) {
        return `Akses ditolak Firestore (${parsed.operationType || 'read'} pada ${parsed.path || 'dokumen'}). Pastikan Anda masuk dengan akun Google yang sesuai.`;
      }
      return parsed.error;
    }
  } catch {
    // plain message
  }
  return raw;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: parseErrorMessage(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/70 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Terjadi Gangguan Koneksi / Izin Data
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                  {this.state.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
