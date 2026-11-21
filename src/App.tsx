import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  Lock,
  Menu,
  Monitor,
  Smartphone,
  UserCheck,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { ProctorDashboard } from './components/ProctorDashboard';
import { StudentExamView } from './components/StudentExamView';
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
}

function getInitialRole(): AppRole {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'student') return 'student';
  if (role === 'proctor') return 'proctor';
  return 'portal';
}

const FEATURES_MENU = [
  {
    title: 'Dashboard Modern & Informatif',
    desc: 'Ringkasan total siswa, guru, bank soal, ujian aktif, grafik Recharts, dan pengumuman.',
    Icon: Monitor,
  },
  {
    title: 'Manajemen Data Siswa & Guru',
    desc: 'Kelola dan import Excel/CSV data master murid dan pengajar/proktor secara terstruktur.',
    Icon: Users,
  },
  {
    title: 'Pengelolaan & Export Bank Soal',
    desc: 'Import massal CSV/Excel, tambah, edit, hapus, serta export soal ke Excel (.xlsx), Word (.doc), CSV, dan JSON.',
    Icon: BookOpen,
  },
  {
    title: 'Sesuai Jenis Soal TKA SD Resmi',
    desc: 'Pilihan Ganda, Pilihan Ganda Kompleks (Benar/Salah), & MCMA untuk Bahasa Indonesia & Matematika.',
    Icon: CheckCircle2,
  },
  {
    title: 'Pengaturan Jadwal, Token & Keamanan',
    desc: 'Atur tanggal, durasi, token sesi, validasi NIS, PIN Proktor, dan proteksi anti-curang.',
    Icon: CalendarClock,
  },
  {
    title: 'Ujian Online Real-Time & Tahan Restart',
    desc: 'Jawaban murid langsung tersinkronisasi melalui WebSocket dan tersimpan persisten di server.',
    Icon: Zap,
  },
  {
    title: 'Koreksi & Penilaian Otomatis',
    desc: 'Timer hitung mundur otomatis mengumpulkan & menilai saat waktu habis.',
    Icon: Award,
  },
  {
    title: 'Hasil Ujian & Export PDF Resmi',
    desc: 'Laporan hasil tryout lengkap dengan pratinjau cetak A4 PDF resmi, Excel (.xlsx), dan CSV.',
    Icon: FileSpreadsheet,
  },
  {
    title: 'Monitoring Aktivitas Peserta Ujian',
    desc: 'Pantau progres per jenis soal, notifikasi pelanggaran, suspend, dan hentikan paksa.',
    Icon: Lock,
  },
  {
    title: 'Tampilan Responsif Semua Perangkat',
    desc: 'Optimal di komputer, laptop, tablet, maupun smartphone.',
    Icon: Smartphone,
  },
];

export default function App() {
  const [role, setRole] = useState<AppRole>(getInitialRole);
  const [entryTab, setEntryTab] = useState<EntryTab>('student');
  const [menuOpen, setMenuOpen] = useState(false);

  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  const [name, setName] = useState(
    () => localStorage.getItem('cbt_student_name') || ''
  );
  const [nis, setNis] = useState(
    () => localStorage.getItem('cbt_student_nis') || ''
  );
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [studentSubmitting, setStudentSubmitting] = useState(false);

  const [proctorAuthed, setProctorAuthed] = useState(
    () => sessionStorage.getItem('cbt_proctor_authed') === '1'
  );
  const [proctorUsername, setProctorUsername] = useState('admin');
  const [proctorPin, setProctorPin] = useState('');
  const [proctorSubmitting, setProctorSubmitting] = useState(false);

  const [formError, setFormError] = useState('');
  const [audioChecked, setAudioChecked] = useState(false);

  useEffect(() => {
    const onPopState = () => setRole(getInitialRole());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    fetch('/api/public-config')
      .then((res) => res.json())
      .then((data) => setPublicConfig(data as PublicConfig))
      .catch(() => {});
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
      setFormError('Lengkapi nama murid dan nomor peserta/NIS terlebih dahulu.');
      return;
    }
    if (publicConfig?.requireSessionCode && !sessionCodeInput.trim()) {
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
      localStorage.setItem('cbt_student_name', String(data.studentName || name.trim()));
      localStorage.setItem('cbt_student_nis', String(data.nis || nis.trim()));
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
    return <StudentExamView onExitToPortal={() => navigateRole('portal')} />;
  }

  if (role === 'proctor') {
    if (!proctorAuthed) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleProctorLogin}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900">
                  Autentikasi Guru &amp; Proktor
                </h1>
                <p className="text-xs text-slate-500">
                  Masukkan username dan PIN untuk membuka dashboard.
                </p>
              </div>
            </div>

            {formError && (
              <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Username Akun
              </label>
              <input
                type="text"
                value={proctorUsername}
                onChange={(e) => setProctorUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                PIN Proktor / Admin
              </label>
              <input
                type="password"
                value={proctorPin}
                onChange={(e) => setProctorPin(e.target.value)}
                placeholder="Masukkan PIN (bawaan: 123456)"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigateRole('portal')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={proctorSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg"
              >
                {proctorSubmitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
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
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Blue CBT Header Matching Dashboard Theme */}
      <header className="bg-gradient-to-r from-blue-700 to-blue-600 text-white px-6 h-16 flex items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">
            CBT Online · Tryout TKA SD
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="h-9 inline-flex items-center gap-2 px-3.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <Menu className="w-4 h-4" />
          Menu Fitur
        </button>
      </header>

      {/* Clean Focused Login Box */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {publicConfig?.title || 'Tryout TKA SD Online'}
            </h1>
            <p className="text-sm text-slate-600">
              {publicConfig?.schoolName
                ? `${publicConfig.schoolName} · Pilih peran masuk di bawah ini.`
                : 'Ujian Digital, Prestasi Maksimal · Pilih peran masuk di bawah ini.'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setEntryTab('student');
                  setFormError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all ${
                  entryTab === 'student'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Murid
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryTab('proctor');
                  setFormError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all ${
                  entryTab === 'proctor'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-4 h-4" />
                Guru / Admin
              </button>
            </div>

            {entryTab === 'student' ? (
              <form onSubmit={handleStudentStart} className="space-y-4">
                {formError && (
                  <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nama Lengkap Murid
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="cth. Siti Aminah"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    NIS / Nomor Peserta Tryout
                  </label>
                  <input
                    type="text"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="cth. 6001"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {publicConfig?.requireSessionCode && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Kode Sesi / Token Ujian
                    </label>
                    <input
                      type="text"
                      value={sessionCodeInput}
                      onChange={(e) => setSessionCodeInput(e.target.value)}
                      placeholder="cth. TKA-SD-01"
                      className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}

                <div className="pt-1 space-y-2">
                  <button
                    type="submit"
                    disabled={studentSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
                  >
                    {studentSubmitting
                      ? 'Memverifikasi Peserta...'
                      : 'Masuk Exam Browser & Mulai'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      playTestBeep();
                      setAudioChecked(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {audioChecked
                      ? 'Audio peringatan anti-curang aktif'
                      : 'Uji suara peringatan anti-curang'}
                  </button>
                </div>
              </form>
            ) : proctorAuthed ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Sesi autentikasi Guru / Proktor Anda masih aktif. Lanjutkan langsung ke Dashboard atau kunci kembali akses.
                </p>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      navigateRole('proctor');
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Buka Dashboard Guru &amp; Admin
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.removeItem('cbt_proctor_authed');
                      setProctorAuthed(false);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Kunci &amp; Ganti Akun Proktor
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProctorLogin} className="space-y-4">
                {formError && (
                  <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Username Guru / Admin
                  </label>
                  <input
                    type="text"
                    value={proctorUsername}
                    onChange={(e) => setProctorUsername(e.target.value)}
                    placeholder="cth. admin atau nurfajri"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    PIN Proktor / Guru
                  </label>
                  <input
                    type="password"
                    value={proctorPin}
                    onChange={(e) => setProctorPin(e.target.value)}
                    placeholder="PIN bawaan: 123456"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={proctorSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {proctorSubmitting
                    ? 'Memverifikasi PIN...'
                    : 'Masuk Dashboard Guru & Admin'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Slide-Over Menu Fitur */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="w-full max-w-md bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Fitur Unggulan CBT Online
                </h2>
                <p className="text-xs text-slate-500">
                  Lengkap untuk Tryout TKA SD &amp; Evaluasi Sekolah
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="space-y-1.5">
                <p className="px-2 text-xs font-semibold text-slate-400">
                  Akses Cepat
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEntryTab('student');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 rounded-lg"
                >
                  <span>Exam Browser Murid</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEntryTab('proctor');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 rounded-lg"
                >
                  <span>Dashboard Guru &amp; Administrator</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-100">
                <p className="px-2 text-xs font-semibold text-slate-400">
                  Fitur Unggulan Aktif
                </p>
                <div className="divide-y divide-slate-100">
                  {FEATURES_MENU.map((feat) => {
                    const Icon = feat.Icon;
                    return (
                      <div key={feat.title} className="py-3 px-2 flex items-start gap-3">
                        <Icon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {feat.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            {feat.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
