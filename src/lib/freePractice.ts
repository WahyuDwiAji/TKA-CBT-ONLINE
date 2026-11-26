import type { ExamConfig } from '../types/cbt';

export type FreePracticeState =
  | 'manual'
  | 'scheduled_active'
  | 'scheduled_upcoming'
  | 'scheduled_expired'
  | 'inactive';

export interface FreePracticeStatus {
  active: boolean;
  state: FreePracticeState;
  label: string;
  description: string;
}

export function parseFreePracticeDate(value?: string | null): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isFreePracticeActive(
  config: Partial<ExamConfig> | null | undefined,
  now: Date = new Date()
): boolean {
  if (!config) return false;
  if (config.freePracticeEnabled) return true;
  if (!config.freePracticeScheduled) return false;

  const start = parseFreePracticeDate(config.freePracticeStartAt);
  const end = parseFreePracticeDate(config.freePracticeEndAt);
  if (!start && !end) return false;
  if (start && end && start.getTime() > end.getTime()) return false;

  const nowMs = now.getTime();
  if (start && nowMs < start.getTime()) return false;
  if (end && nowMs > end.getTime()) return false;
  return true;
}

export function formatFreePracticeDateTime(value?: string | null): string {
  const d = parseFreePracticeDate(value);
  if (!d) return '—';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getFreePracticeStatus(
  config: Partial<ExamConfig> | null | undefined,
  now: Date = new Date()
): FreePracticeStatus {
  if (!config) {
    return {
      active: false,
      state: 'inactive',
      label: 'Nonaktif',
      description: 'Mode Latihan Bebas belum diaktifkan.',
    };
  }

  if (config.freePracticeEnabled) {
    return {
      active: true,
      state: 'manual',
      label: 'Aktif (Manual)',
      description:
        'Siswa dapat langsung masuk dan mencoba sistem tanpa kode sesi hingga mode ini dimatikan.',
    };
  }

  if (!config.freePracticeScheduled) {
    return {
      active: false,
      state: 'inactive',
      label: 'Nonaktif',
      description:
        'Aktifkan secara langsung atau jadwalkan rentang waktu Latihan Bebas.',
    };
  }

  const start = parseFreePracticeDate(config.freePracticeStartAt);
  const end = parseFreePracticeDate(config.freePracticeEndAt);

  if (!start && !end) {
    return {
      active: false,
      state: 'inactive',
      label: 'Jadwal Belum Diisi',
      description: 'Tentukan waktu mulai atau selesai untuk mengaktifkan jadwal otomatis.',
    };
  }

  if (start && end && start.getTime() > end.getTime()) {
    return {
      active: false,
      state: 'inactive',
      label: 'Jadwal Tidak Valid',
      description: 'Waktu mulai harus lebih awal daripada waktu selesai.',
    };
  }

  const nowMs = now.getTime();
  if (start && nowMs < start.getTime()) {
    return {
      active: false,
      state: 'scheduled_upcoming',
      label: 'Terjadwal',
      description: `Otomatis dibuka pada ${formatFreePracticeDateTime(config.freePracticeStartAt)}.`,
    };
  }

  if (end && nowMs > end.getTime()) {
    return {
      active: false,
      state: 'scheduled_expired',
      label: 'Jadwal Selesai',
      description: `Sesi latihan bebas telah berakhir pada ${formatFreePracticeDateTime(config.freePracticeEndAt)}.`,
    };
  }

  return {
    active: true,
    state: 'scheduled_active',
    label: 'Aktif (Terjadwal)',
    description: end
      ? `Terbuka tanpa kode sesi hingga ${formatFreePracticeDateTime(config.freePracticeEndAt)}.`
      : 'Terbuka otomatis tanpa kode sesi sesuai jadwal.',
  };
}

export function toDateTimeLocalInputValue(isoValue?: string | null): string {
  const d = parseFreePracticeDate(isoValue);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalInputValue(localValue: string): string {
  if (!localValue || !localValue.trim()) return '';
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}
