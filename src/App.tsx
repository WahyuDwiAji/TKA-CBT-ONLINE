import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  GraduationCap,
  KeyRound,
  Monitor,
  UserCheck,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ProctorDashboard } from './components/ProctorDashboard';
import { StudentExamView } from './components/StudentExamView';
import { ThemeToggleButton } from './components/ThemeToggleButton';
import { formatFreePracticeDateTime } from './lib/freePractice';
import {
  LOGIN_DRAFT_KEYS,
  readLocalDraft,
  writeLocalDraft,
} from './lib/loginDraft';
import { playTestBeep, unlockAudio } from './lib/sound';

type AppRole = 'portal' | 'student' | 'proctor';
type EntryTab = 'student' | 'proctor';

interface PublicConfig {
  title: string;
  subtitle: string;
  schoolName?: string;
  roomName?: string;
  requireRegisteredNis: boolean;
  requireSessionCode: boolean;
  configuredRequireSessionCode?: boolean;
  freePracticeActive?: boolean;
  freePracticeEnabled?: boolean;
  freePracticeScheduled?: boolean;
  freePracticeStartAt?: string;
  freePracticeEndAt?: string;
}

function getInitialRole(): AppRole {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'student') return 'student';
  if (role === 'proctor') return 'proctor';
  return 'portal';
}

export default function App() {
  const [role, setRole] = useState<AppRole>(getInitialRole);
  const [entryTab, setEntryTab] = useState<EntryTab>(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.portalTab) === 'proctor' ? 'proctor' : 'student'
  );
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = readLocalDraft(LOGIN_DRAFT_KEYS.theme);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
  });

  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  const [name, setName] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentName)
  );
  const [nis, setNis] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentNis)
  );
  const [sessionCodeInput, setSessionCodeInput] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode)
  );
  const [studentSubmitting, setStudentSubmitting] = useState(false);

  const [proctorAuthed, setProctorAuthed] = useState(
    () => sessionStorage.getItem('cbt_proctor_authed') === '1'
  );
  const [proctorUsername, setProctorUsername] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.proctorUsername, 'admin')
  );
  const [proctorPin, setProctorPin] = useState('');
  const [proctorSubmitting, setProctorSubmitting] = useState(false);

  const [formError, setFormError] = useState('');
  const [audioChecked, setAudioChecked] = useState(false);
  const [serverOnline, setServerOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    writeLocalDraft(LOGIN_DRAFT_KEYS.theme, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleDarkMode = () => setIsDark((prev) => !prev);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.studentName, name);
  }, [name]);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.studentNis, nis);
  }, [nis]);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode, sessionCodeInput);
  }, [sessionCodeInput]);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.portalTab, entryTab);
  }, [entryTab]);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.proctorUsername, proctorUsername);
  }, [proctorUsername]);

  useEffect(() => {
    const onPopState = () => setRole(getInitialRole());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    const loadPublicConfig = () => {
      fetch('/api/public-config', { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('Config unreachable');
          return res.json();
        })
        .then((data) => {
          if (active) {
            setPublicConfig(data as PublicConfig);
            setServerOnline(true);
          }
        })
        .catch(() => {
          if (active) setServerOnline(false);
        });
    };

    const pingHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (active) setServerOnline(false);
        return;
      }
      try {
        const res = await fetch('/api/heartbeat', { cache: 'no-store' });
        if (active) setServerOnline(res.ok);
      } catch {
        if (active) setServerOnline(false);
      }
    };

    const onOnline = () => {
      void pingHeartbeat();
      loadPublicConfig();
    };
    const onOffline = () => {
      if (active) setServerOnline(false);
    };

    loadPublicConfig();
    void pingHeartbeat();
    window.addEventListener('focus', loadPublicConfig);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const intervalId =
      role === 'portal'
        ? window.setInterval(() => {
            loadPublicConfig();
            void pingHeartbeat();
          }, 10000)
        : null;

    return () => {
      active = false;
      window.removeEventListener('focus', loadPublicConfig);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [role]);

  const navigateRole = (next: AppRole) => {
    const url = new URL(window.location.href);
    if (next === 'portal') {
      url.searchParams.delete('role');
    } else {
      url.searchParams.set('role', next);
    }
    window.history.pushState({}, '', url.toString());
    setRole(next);
  };

  const handleStudentStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !nis.trim()) {
      setFormError('Lengkapi nama lengkap dan NIS terlebih dahulu.');
      return;
    }
    const requiresToken =
      Boolean(publicConfig?.requireSessionCode) && !publicConfig?.freePracticeActive;
    if (requiresToken && !sessionCodeInput.trim()) {
      setFormError('Masukkan kode sesi / token ujian yang diberikan proktor.');
      return;
    }

    setFormError('');
    setStudentSubmitting(true);
    try {
      const res = await fetch('/api/student/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nis: nis.trim(),
          sessionCode: sessionCodeInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Gagal memverifikasi peserta.');
        return;
      }

      unlockAudio();
      const verifiedName = String(data.studentName || name.trim());
      const verifiedNis = String(data.nis || nis.trim());
      setName(verifiedName);
      setNis(verifiedNis);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentName, verifiedName);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentNis, verifiedNis);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode, sessionCodeInput.trim());
      sessionStorage.setItem('cbt_active_student_id', String(data.studentId));
      sessionStorage.setItem('cbt_auto_join', '1');
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      navigateRole('student');
    } catch {
      setFormError('Tidak dapat terhubung ke server CBT. Periksa jaringan Anda.');
    } finally {
      setStudentSubmitting(false);
    }
  };

  const handleProctorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proctorPin.trim()) {
      setFormError('Masukkan PIN Guru / Proktor terlebih dahulu.');
      return;
    }
    setFormError('');
    setProctorSubmitting(true);
    try {
      const res = await fetch('/api/proctor/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: proctorUsername.trim(),
          pin: proctorPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'PIN Proktor / Guru tidak valid.');
        return;
      }
      unlockAudio();
      sessionStorage.setItem('cbt_proctor_authed', '1');
      setProctorAuthed(true);
      setProctorPin('');
      navigateRole('proctor');
    } catch {
      setFormError('Gagal menghubungi server autentikasi proktor.');
    } finally {
      setProctorSubmitting(false);
    }
  };

  if (role === 'student') {
    return (
      <StudentExamView
        onExitToPortal={() => navigateRole('portal')}
        isDark={isDark}
        onToggleDarkMode={toggleDarkMode}
      />
    );
  }

  if (role === 'proctor') {
    if (!proctorAuthed) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#F7F8FC] via-indigo-50/40 to-sky-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
          <header className="px-6 h-14 flex items-center justify-between max-w-5xl w-full mx-auto">
            <span className="inline-flex items-center gap-2.5 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white inline-flex items-center justify-center shadow-xs">
                <GraduationCap className="w-4 h-4" />
              </span>
              CBT Online
            </span>
            <ThemeToggleButton isDark={isDark} onToggle={toggleDarkMode} showLabel />
          </header>

          <div className="flex-1 flex items-center justify-center p-4">
            <form
              onSubmit={handleProctorLogin}
              className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Masuk Guru &amp; Proktor
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Masukkan username dan PIN dashboard.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-xl text-xs text-rose-700 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={proctorUsername}
                    onChange={(e) => setProctorUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full h-10 px-3.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    PIN Proktor / Admin
                  </label>
                  <input
                    type="password"
                    value={proctorPin}
                    onChange={(e) => setProctorPin(e.target.value)}
                    placeholder="Masukkan PIN"
                    className="w-full h-10 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigateRole('portal')}
                  className="h-10 px-4 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={proctorSubmitting}
                  className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shadow-xs"
                >
                  {proctorSubmitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return (
      <ProctorDashboard
        onExitToPortal={() => {
          sessionStorage.removeItem('cbt_proctor_authed');
          setProctorAuthed(false);
          navigateRole('portal');
        }}
        isDark={isDark}
        onToggleDarkMode={toggleDarkMode}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F7F8FC] via-indigo-50/35 to-sky-50/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Minimal Top Bar */}
      <header className="px-6 h-14 flex items-center justify-between max-w-5xl w-full mx-auto">
        <span className="inline-flex items-center gap-2.5 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white inline-flex items-center justify-center shadow-xs">
            <GraduationCap className="w-4 h-4" />
          </span>
          CBT Online
        </span>

        <div className="flex items-center gap-2">
          <span
            title={
              serverOnline
                ? 'Koneksi ke server CBT terhubung'
                : 'Koneksi ke server CBT terputus'
            }
            className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-xl border transition-colors ${
              serverOnline
                ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
            }`}
          >
            {serverOnline ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{serverOnline ? 'Online' : 'Offline'}</span>
          </span>
          <ThemeToggleButton isDark={isDark} onToggle={toggleDarkMode} showLabel />
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              playTestBeep();
              setAudioChecked(true);
            }}
            className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-xl border transition-colors ${
              audioChecked
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                : 'bg-white/80 dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            {audioChecked ? 'Audio Aktif' : 'Uji Suara'}
          </button>
        </div>
      </header>

      {/* Calm, Focused, Intuitive Center Login */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Concise Exam Header */}
          <div className="text-center space-y-1.5">
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {publicConfig?.schoolName || 'Tryout TKA SD'} ·{' '}
              {publicConfig?.roomName || 'Ruang CBT Online'}
            </p>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance leading-snug">
              {publicConfig?.title || 'Tryout TKA SD Online'}
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Pilih peran Anda untuk masuk ke ujian atau ruang proktor.
            </p>
          </div>

          {/* Focused Pastel Entry Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-7 shadow-sm space-y-5">
            {/* Clear Segmented Role Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-indigo-50/75 dark:bg-slate-800 border border-indigo-100/80 dark:border-slate-700 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setEntryTab('student');
                  setFormError('');
                }}
                className={`h-10 flex items-center justify-center gap-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  entryTab === 'student'
                    ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Murid / Peserta
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryTab('proctor');
                  setFormError('');
                }}
                className={`h-10 flex items-center justify-center gap-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  entryTab === 'proctor'
                    ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                Guru / Proktor
              </button>
            </div>

            {formError && (
              <div className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-xl text-xs text-rose-700 dark:text-rose-300">
                {formError}
              </div>
            )}

            {entryTab === 'student' ? (
              <form onSubmit={handleStudentStart} className="space-y-4">
                {publicConfig?.freePracticeActive && (
                  <div className="px-3.5 py-2.5 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Mode Latihan Bebas Aktif
                    </p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      Siswa dapat langsung mencoba sistem CBT tanpa memerlukan kode sesi.
                      {!publicConfig.freePracticeEnabled && publicConfig.freePracticeEndAt
                        ? ` Berlaku hingga ${formatFreePracticeDateTime(publicConfig.freePracticeEndAt)}.`
                        : ''}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="cth. Siti Aminah"
                    className="w-full h-11 px-3.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    NIS / Nomor Peserta
                  </label>
                  <input
                    type="text"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="cth. 6001"
                    className="w-full h-11 px-3.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                {publicConfig?.requireSessionCode && !publicConfig?.freePracticeActive && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Token / Kode Sesi
                    </label>
                    <input
                      type="text"
                      value={sessionCodeInput}
                      onChange={(e) => setSessionCodeInput(e.target.value)}
                      placeholder="cth. TKA-SD-01"
                      className="w-full h-11 px-3.5 text-sm font-mono uppercase text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={studentSubmitting}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shadow-xs mt-1"
                >
                  {studentSubmitting
                    ? 'Memverifikasi...'
                    : publicConfig?.freePracticeActive
                      ? 'Mulai Latihan Bebas'
                      : 'Mulai Ujian'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : proctorAuthed ? (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl space-y-1">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Sesi Proktor Aktif
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    Anda sudah login sebagai Guru / Proktor.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    navigateRole('proctor');
                  }}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors whitespace-nowrap shadow-xs"
                >
                  Buka Dashboard Proktor
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('cbt_proctor_authed');
                    setProctorAuthed(false);
                  }}
                  className="w-full h-9 inline-flex items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                >
                  Ganti Akun Proktor
                </button>
              </div>
            ) : (
              <form onSubmit={handleProctorLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Username Guru / Admin
                  </label>
                  <input
                    type="text"
                    value={proctorUsername}
                    onChange={(e) => setProctorUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full h-11 px-3.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    PIN Proktor
                  </label>
                  <input
                    type="password"
                    value={proctorPin}
                    onChange={(e) => setProctorPin(e.target.value)}
                    placeholder="PIN bawaan: 123456"
                    className="w-full h-11 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={proctorSubmitting}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shadow-xs mt-1"
                >
                  {proctorSubmitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Asesmen TKA SD · Pilihan Ganda · PG Kompleks · MCMA
          </p>
        </div>
      </main>
    </div>
  );
}
