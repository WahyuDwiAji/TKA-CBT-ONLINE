import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  PauseCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { MathText } from './MathText';
import { isQuestionAnswered } from '../lib/grading';
import { sanitizeImageUrl } from '../lib/imageUpload';
import {
  playCheatAlarm,
  playProctorAlert,
  playTestBeep,
  unlockAudio,
} from '../lib/sound';
import { createCbtSocket, type ManagedSocket } from '../lib/ws';
import type {
  ExamConfig,
  MatchingQuestion,
  Question,
  StudentAnswerValue,
  StudentSession,
} from '../types/cbt';
import { QUESTION_TYPE_LABELS } from '../types/cbt';

interface StudentExamViewProps {
  onExitToPortal: () => void;
}

const ESSAY_SYMBOLS = ['$', '$$', '\\frac{a}{b}', '\\sqrt{x}', '±', '≤', '≥', '≠', '°', 'π'];

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function deterministicShuffle<T extends { id: string }>(
  items: T[],
  seed: string
): T[] {
  const arr = [...items];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 1664525 + 1013904223) | 0;
    const j = Math.abs(hash) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const StudentExamView: React.FC<StudentExamViewProps> = ({
  onExitToPortal,
}) => {
  const [studentName, setStudentName] = useState(
    () => localStorage.getItem('cbt_student_name') || ''
  );
  const [studentNis, setStudentNis] = useState(
    () => localStorage.getItem('cbt_student_nis') || ''
  );
  const [studentId, setStudentId] = useState<string | null>(
    () => sessionStorage.getItem('cbt_active_student_id')
  );

  const [joined, setJoined] = useState(() => {
    const autoJoin = sessionStorage.getItem('cbt_auto_join') === '1';
    const existingId = sessionStorage.getItem('cbt_active_student_id');
    return autoJoin && Boolean(existingId);
  });

  const [wsConnected, setWsConnected] = useState(false);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [session, setSession] = useState<StudentSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displaySeconds, setDisplaySeconds] = useState<number>(0);
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [fiveMinuteAlertVisible, setFiveMinuteAlertVisible] = useState(false);
  const [lastSavedText, setLastSavedText] = useState<string>('Tersinkron');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [mobileGridOpen, setMobileGridOpen] = useState(false);
  const [audioTested, setAudioTested] = useState(false);
  const [formError, setFormError] = useState('');
  const [largeFont, setLargeFont] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenGraceSeconds, setFullscreenGraceSeconds] = useState<number | null>(null);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');

  const socketRef = useRef<ManagedSocket | null>(null);
  const sessionRef = useRef<StudentSession | null>(null);
  const examConfigRef = useRef<ExamConfig | null>(null);
  const lastViolationAtRef = useRef<number>(0);
  const fiveMinuteWarnedRef = useRef<boolean>(false);
  const autoSubmittedRef = useRef<boolean>(false);
  const wasFullscreenRef = useRef<boolean>(false);
  const prevStatusRef = useRef<string | null>(null);

  const FULLSCREEN_GRACE_SECONDS = 10;
  const MAX_FULLSCREEN_WARNINGS = 3;

  const getFullscreenElement = (): Element | null => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  };

  const fullscreenSupported =
    typeof document !== 'undefined' &&
    Boolean(
      document.fullscreenEnabled ||
        (
          document as Document & {
            webkitFullscreenEnabled?: boolean;
          }
        ).webkitFullscreenEnabled ||
        document.documentElement.requestFullscreen
    );

  const enterFullscreen = useCallback(async () => {
    setFullscreenError('');
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
      if (getFullscreenElement()) {
        wasFullscreenRef.current = true;
        setIsFullscreen(true);
        setFullscreenGraceSeconds(null);
      }
    } catch {
      setFullscreenError(
        'Browser memblokir layar penuh otomatis. Klik tombol di atas atau tekan F11 secara manual.'
      );
    }
  }, []);

  const triggerViolation = useCallback((reason: string) => {
    const currentSess = sessionRef.current;
    const currentCfg = examConfigRef.current;
    if (!currentSess || !currentCfg?.antiCheatEnabled) return;
    if (currentSess.status !== 'active') return;

    const now = Date.now();
    if (now - lastViolationAtRef.current < 1500) return;
    lastViolationAtRef.current = now;

    setFullscreenGraceSeconds(null);
    playCheatAlarm();
    socketRef.current?.send({
      type: 'student:violation',
      studentId: currentSess.id,
      reason,
    });
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    const prevStatus = prevStatusRef.current;
    const nextStatus = session?.status ?? null;
    prevStatusRef.current = nextStatus;

    // Reset fullscreen tracking when proctor unlocks/resumes a locked session
    if (prevStatus && prevStatus !== 'active' && nextStatus === 'active') {
      const currentlyFs = Boolean(getFullscreenElement());
      setIsFullscreen(currentlyFs);
      wasFullscreenRef.current = currentlyFs;
      setFullscreenGraceSeconds(null);
    }

    if (nextStatus && nextStatus !== 'active') {
      setFullscreenGraceSeconds(null);
    }
  }, [session]);

  useEffect(() => {
    examConfigRef.current = examConfig;
  }, [examConfig]);

  // Monitor Fullscreen Entry & Exit
  useEffect(() => {
    const syncInitial = Boolean(getFullscreenElement());
    setIsFullscreen(syncInitial);
    if (syncInitial) {
      wasFullscreenRef.current = true;
    }

    const onFsChange = () => {
      const activeFs = Boolean(getFullscreenElement());
      setIsFullscreen(activeFs);

      if (activeFs) {
        wasFullscreenRef.current = true;
        setFullscreenGraceSeconds(null);
        setFullscreenError('');
        return;
      }

      const currentSess = sessionRef.current;
      const currentCfg = examConfigRef.current;
      const shouldEnforce =
        joined &&
        wasFullscreenRef.current &&
        currentSess?.status === 'active' &&
        Boolean(currentCfg?.antiCheatEnabled) &&
        !currentCfg?.globalSuspended;

      if (!shouldEnforce) return;

      setFullscreenExitCount((prev) => {
        const nextCount = prev + 1;
        if (nextCount >= MAX_FULLSCREEN_WARNINGS) {
          triggerViolation(
            `Berulang kali keluar dari mode layar penuh Exam Browser (${nextCount}x)`
          );
          return nextCount;
        }
        playProctorAlert();
        setFullscreenGraceSeconds(FULLSCREEN_GRACE_SECONDS);
        return nextCount;
      });
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [joined, triggerViolation]);

  // Countdown while out of fullscreen: auto-lock session when reaching 0
  useEffect(() => {
    if (fullscreenGraceSeconds === null) return;
    if (
      !joined ||
      session?.status !== 'active' ||
      !examConfig?.antiCheatEnabled ||
      examConfig?.globalSuspended
    ) {
      setFullscreenGraceSeconds(null);
      return;
    }

    if (fullscreenGraceSeconds <= 0) {
      triggerViolation(
        'Keluar dari mode layar penuh (Exam Browser) dan tidak segera kembali'
      );
      return;
    }

    const countdownId = window.setTimeout(() => {
      setFullscreenGraceSeconds((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(countdownId);
  }, [
    fullscreenGraceSeconds,
    joined,
    session?.status,
    examConfig?.antiCheatEnabled,
    examConfig?.globalSuspended,
    triggerViolation,
  ]);

  const toggleFullscreen = () => {
    if (!getFullscreenElement()) {
      void enterFullscreen();
    } else {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else {
        doc.webkitExitFullscreen?.();
      }
    }
  };

  const submitExam = useCallback(() => {
    const currentSess = sessionRef.current;
    if (!currentSess) return;
    setFullscreenGraceSeconds(null);
    setConfirmSubmitOpen(false);
    setMobileGridOpen(false);
    socketRef.current?.send({
      type: 'student:submit',
      studentId: currentSess.id,
    });
  }, []);

  useEffect(() => {
    if (!joined || !studentId) return;
    sessionStorage.removeItem('cbt_auto_join');

    const sock = createCbtSocket({
      onOpen: (ws) => {
        ws.send(
          JSON.stringify({
            type: 'student:join',
            studentId,
            name: studentName.trim() || 'Murid Tryout',
            nis: studentNis.trim() || '6001',
          })
        );
      },
      onStatusChange: (connected) => setWsConnected(connected),
      onMessage: (data) => {
        if (data.type === 'student:init') {
          const cfg = data.examConfig as ExamConfig;
          const qs = data.questions as Question[];
          const sess = data.session as StudentSession;
          setExamConfig(cfg);
          setQuestions(qs);
          setSession(sess);
          setDisplaySeconds(sess.remainingSeconds);
          setTimerInitialized(true);
          fiveMinuteWarnedRef.current = false;
          autoSubmittedRef.current = false;
          return;
        }
        if (data.type === 'session:updated') {
          const updated = data.session as StudentSession;
          setSession((prev) => {
            if (
              prev?.status !== 'violation_locked' &&
              updated.status === 'violation_locked'
            ) {
              playCheatAlarm();
            }
            return updated;
          });
          setDisplaySeconds(updated.remainingSeconds);
          return;
        }
        if (data.type === 'exam:updated') {
          setExamConfig(data.examConfig as ExamConfig);
          return;
        }
        if (data.type === 'questions:updated') {
          const nextQs = data.questions as Question[];
          setQuestions(nextQs);
          setCurrentIndex((prev) =>
            nextQs.length > 0 ? Math.min(prev, nextQs.length - 1) : 0
          );
          return;
        }
        if (data.type === 'answer:ack') {
          const savedAt = new Date(String(data.savedAt));
          setLastSavedText(
            `Tersimpan ${savedAt.toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}`
          );
          return;
        }
        if (data.type === 'student:reset') {
          sessionStorage.removeItem('cbt_active_student_id');
          setJoined(false);
          setSession(null);
          setStudentId(null);
          setTimerInitialized(false);
        }
      },
    });

    socketRef.current = sock;
    return () => {
      sock.close();
      socketRef.current = null;
    };
  }, [joined, studentId, studentName, studentNis]);

  // Global Countdown Timer Tick
  useEffect(() => {
    if (
      !timerInitialized ||
      !session ||
      session.status !== 'active' ||
      examConfig?.globalSuspended
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setDisplaySeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerInitialized, session?.status, examConfig?.globalSuspended]);

  // Alert at 5 minutes remaining (300s) & Auto-Submit at 0 seconds
  useEffect(() => {
    if (!timerInitialized || !session || session.status !== 'active') return;

    if (displaySeconds > 0 && displaySeconds <= 300 && !fiveMinuteWarnedRef.current) {
      fiveMinuteWarnedRef.current = true;
      setFiveMinuteAlertVisible(true);
      playProctorAlert();
    }

    if (displaySeconds === 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      submitExam();
    }
  }, [displaySeconds, timerInitialized, session, submitExam]);

  // Anti-Cheat Guard
  useEffect(() => {
    if (!joined) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('Membuka tab atau aplikasi lain saat ujian berlangsung');
      }
    };

    const handleWindowBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus() && sessionRef.current?.status === 'active') {
          triggerViolation('Keluar dari Exam Browser / pindah jendela lain');
        }
      }, 150);
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (sessionRef.current?.status === 'active') e.preventDefault();
    };

    const handleCopyOrCut = (e: ClipboardEvent) => {
      if (sessionRef.current?.status === 'active') {
        e.preventDefault();
        triggerViolation('Mencoba menyalin soal ujian');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionRef.current?.status !== 'active') return;
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === 'U')
      ) {
        e.preventDefault();
        triggerViolation('Mencoba membuka alat pengembang browser');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopyOrCut);
    document.addEventListener('cut', handleCopyOrCut);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopyOrCut);
      document.removeEventListener('cut', handleCopyOrCut);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [joined, triggerViolation]);

  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentNis.trim()) {
      setFormError('Nama murid dan NIS wajib diisi.');
      return;
    }
    setFormError('');
    unlockAudio();
    localStorage.setItem('cbt_student_name', studentName.trim());
    localStorage.setItem('cbt_student_nis', studentNis.trim());
    const id =
      studentId ||
      `stu-${studentNis.trim().replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString(36)}`;
    sessionStorage.setItem('cbt_active_student_id', id);
    setStudentId(id);
    setJoined(true);
    void enterFullscreen();
  };

  const sendAnswer = (questionId: string, value: StudentAnswerValue) => {
    if (!session || session.status !== 'active') return;
    setSession((prev) =>
      prev
        ? { ...prev, answers: { ...prev.answers, [questionId]: value } }
        : prev
    );
    socketRef.current?.send({
      type: 'student:answer',
      studentId: session.id,
      questionId,
      value,
    });
  };

  const toggleDoubtful = (questionId: string) => {
    if (!session || session.status !== 'active') return;
    socketRef.current?.send({
      type: 'student:toggle_doubtful',
      studentId: session.id,
      questionId,
    });
  };

  const currentQuestion = questions[currentIndex];

  const shuffledRightPairs = useMemo(() => {
    if (!currentQuestion || currentQuestion.type !== 'matching') return [];
    const mq = currentQuestion as MatchingQuestion;
    return deterministicShuffle(mq.pairs, `${studentId || 'seed'}-${mq.id}`);
  }, [currentQuestion, studentId]);

  const answeredCount = useMemo(() => {
    if (!session) return 0;
    return questions.filter((q) =>
      isQuestionAnswered(q, session.answers[q.id])
    ).length;
  }, [questions, session]);

  const unansweredCount = questions.length - answeredCount;

  // 1. Direct Entry Card
  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <header className="bg-blue-700 text-white px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onExitToPortal}
            className="inline-flex items-center gap-2 text-xs font-medium text-blue-100 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <span className="text-sm font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-300" />
            Exam Browser · Tryout TKA SD
          </span>
          <span className="w-16" />
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Masuk Exam Browser Murid
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Tryout TKA SD · Jangan berpindah tab atau aplikasi saat ujian berlangsung.
              </p>
            </div>

            <form onSubmit={handleStartExam} className="space-y-4">
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
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="cth. Siti Aminah"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  NIS / Nomor Peserta
                </label>
                <input
                  type="text"
                  value={studentNis}
                  onChange={(e) => setStudentNis(e.target.value)}
                  placeholder="cth. 6001"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Mulai Tryout Sekarang
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  playTestBeep();
                  setAudioTested(true);
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                <Volume2 className="w-3.5 h-3.5" />
                {audioTested ? 'Audio peringatan aktif' : 'Uji suara anti-curang'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  if (!session || !examConfig) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-sm w-full text-center space-y-3">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-900">
            Memuat Exam Browser & Soal Tryout...
          </p>
        </div>
      </div>
    );
  }

  // 2. Violation Lock Screen
  if (session.status === 'violation_locked') {
    const latestViolation = session.violations[0];
    return (
      <div className="min-h-screen bg-red-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-900/75 border border-red-700 rounded-xl p-7 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-red-800 rounded-lg shrink-0">
              <ShieldAlert className="w-6 h-6 text-red-100" />
            </div>
            <div>
              <p className="text-xs font-medium text-red-200">
                Exam Browser Terkunci · Pelanggaran #{session.violations.length}
              </p>
              <h1 className="mt-0.5 text-lg font-bold text-white">
                Halaman Ujian Ditutup Otomatis
              </h1>
            </div>
          </div>

          <div className="bg-red-950/75 border border-red-800 rounded-lg p-4 space-y-1.5 text-sm">
            <p className="font-medium text-white">
              {latestViolation?.reason || 'Berpindah halaman atau aplikasi lain'}
            </p>
            <p className="text-xs text-red-300 font-mono tabular-nums">
              {latestViolation
                ? new Date(latestViolation.timestamp).toLocaleTimeString('id-ID')
                : ''}{' '}
              · {session.name} ({session.nis})
            </p>
          </div>

          <p className="text-xs text-red-100 leading-relaxed">
            Laporan pelanggaran telah dikirim langsung ke Guru / Proktor. Silakan tunggu Guru membuka kunci ujian Anda.
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-red-800">
            <button
              type="button"
              onClick={() => playCheatAlarm()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-red-800 hover:bg-red-700 text-white rounded-lg"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Bunyikan Alarm
            </button>
            <span className="text-xs text-red-200">
              {wsConnected ? 'Menunggu Guru' : 'Menghubungkan...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Suspended Overlay
  if (session.status === 'suspended' || examConfig.globalSuspended) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-7 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500/20 rounded-lg shrink-0">
              <PauseCircle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-300">
                Ujian Ditangguhkan
              </p>
              <h1 className="mt-0.5 text-lg font-bold text-white">
                Dihentikan Sementara oleh Guru / Proktor
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            {session.suspendReason ||
              'Ujian dijeda sementara oleh Guru. Seluruh jawaban Anda sudah tersimpan aman.'}
          </p>

          <div className="bg-slate-900/70 border border-slate-700 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-slate-300">
            <span>{session.name}</span>
            <span className="font-mono tabular-nums">
              Sisa Waktu: {formatClock(displaySeconds)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 4. Completed / Force-Stopped Result Screen
  if (session.status === 'submitted' || session.status === 'force_stopped') {
    const grade = session.gradeSummary;
    const isForced = session.status === 'force_stopped';

    return (
      <div className="min-h-screen bg-slate-100">
        <header className="bg-blue-700 text-white px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-bold flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-300" />
            Hasil Tryout TKA SD
          </span>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
              sessionStorage.removeItem('cbt_active_student_id');
              onExitToPortal();
            }}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
          >
            Keluar Exam Browser
          </button>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {isForced && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-900">
                  Ujian Dihentikan Secara Paksa oleh Guru / Proktor
                </p>
                <p className="text-red-700 mt-0.5 text-xs">
                  {session.suspendReason ||
                    'Jawaban yang sudah dikerjakan tetap dinilai secara otomatis.'}
                </p>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {examConfig.title} · Penilaian Otomatis
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                {session.name}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                NIS {session.nis} · Pelanggaran: {session.violations.length}
              </p>
            </div>

            {grade && (
              <div className="flex items-center gap-5 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Nilai Tryout</p>
                  <p className="text-4xl font-bold font-mono tabular-nums text-blue-700">
                    {grade.totalScore}
                  </p>
                </div>
                <div className="h-10 w-px bg-slate-200" />
                <div className="text-xs space-y-1 text-slate-600 font-mono tabular-nums">
                  <p>
                    {grade.earnedPoints}/{grade.maxPoints} poin
                  </p>
                  <p>
                    {grade.correctCount}/{grade.totalQuestions} benar
                  </p>
                </div>
              </div>
            )}
          </div>

          {grade && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
              {questions.map((q, idx) => {
                const res = grade.breakdown.find((b) => b.questionId === q.id);
                return (
                  <div key={q.id} className="p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">
                        <strong className="font-mono text-slate-900">
                          Soal {idx + 1}
                        </strong>{' '}
                        · {QUESTION_TYPE_LABELS[q.type]}
                      </span>
                      {res && (
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            res.isCorrect ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {res.isCorrect ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span className="font-mono tabular-nums">
                            {res.earnedPoints}/{res.maxPoints} poin
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-800">
                      <MathText text={q.prompt} direction={q.direction} />
                    </div>
                    {res && (
                      <p className="text-xs text-slate-500">{res.feedback}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Reusable Daftar Soal Box Panel (Hijau = Sudah Dikerjakan, Merah = Belum Dikerjakan, Kuning = Ragu)
  const renderQuestionBoxes = (onSelect?: () => void) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Daftar Soal</h2>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          {answeredCount}/{questions.length} selesai
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, idx) => {
          const answered = isQuestionAnswered(q, session.answers[q.id]);
          const doubtful = session.doubtfulIds.includes(q.id);
          const active = idx === currentIndex;

          const boxColorClass = doubtful
            ? 'bg-amber-400 border-amber-500 text-slate-950'
            : answered
              ? 'bg-emerald-600 border-emerald-700 text-white'
              : 'bg-red-600 border-red-700 text-white';

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                setCurrentIndex(idx);
                onSelect?.();
              }}
              className={`h-10 rounded-md text-xs font-mono tabular-nums font-bold border transition-all ${boxColorClass} ${
                active ? 'ring-2 ring-offset-2 ring-slate-900 scale-105' : 'opacity-95 hover:opacity-100'
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" />
            Sudah dikerjakan
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {answeredCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-red-600 inline-block" />
            Belum dikerjakan
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {unansweredCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 inline-block" />
            Ragu-ragu
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900">
            {session.doubtfulIds.length}
          </span>
        </div>
      </div>
    </div>
  );

  // 5. Classic Indonesian CBT Exam Browser Workspace
  const isLowTime = displaySeconds <= 300;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Exam Browser Top Lock Bar */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-800 to-blue-700 text-white px-4 md:px-6 h-14 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-bold text-white truncate">
              {examConfig.title}
            </p>
            <p className="text-[11px] text-blue-100 truncate">
              {session.name} ({session.nis}) · {lastSavedText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-mono tabular-nums font-bold border ${
              isLowTime
                ? 'bg-red-600 border-red-400 text-white'
                : 'bg-slate-900/80 border-white/20 text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatClock(displaySeconds)}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh Exam Browser'}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-white/15 hover:bg-white/25 rounded-lg"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileGridOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-white/15 rounded-lg"
          >
            <LayoutGrid className="w-4 h-4" />
            Daftar Soal
          </button>

          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs md:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Selesai
          </button>
        </div>
      </header>

      {/* 5-Minute Warning Banner */}
      {fiveMinuteAlertVisible && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
          <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs md:text-sm font-semibold">
                Peringatan Waktu: Sisa waktu ujian kurang dari 5 menit ({formatClock(displaySeconds)}). Jawaban akan dikumpulkan otomatis saat waktu habis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiveMinuteAlertVisible(false)}
              className="p-1 text-amber-700 hover:bg-amber-100 rounded"
              aria-label="Tutup peringatan waktu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Enforcement Banner when not yet in fullscreen */}
      {examConfig.antiCheatEnabled &&
        fullscreenSupported &&
        !isFullscreen &&
        fullscreenGraceSeconds === null && (
          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-blue-950">
                <Maximize2 className="w-4 h-4 text-blue-700 shrink-0" />
                <p className="text-xs md:text-sm font-medium">
                  Mode Layar Penuh Exam Browser belum aktif. Aktifkan layar penuh agar sesi ujian tetap aman dan terproteksi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void enterFullscreen()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Aktifkan Layar Penuh
              </button>
            </div>
          </div>
        )}

      {/* Classic 2-Column CBT Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Main Question Paper */}
        <main className="lg:col-span-8 xl:col-span-9 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {currentQuestion ? (
            <>
              {/* CBT Question Sub-Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-600 text-white text-xs font-mono tabular-nums font-bold rounded">
                    SOAL NO. {currentIndex + 1}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {QUESTION_TYPE_LABELS[currentQuestion.type]} · {currentQuestion.subject}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 mr-1">Ukuran Huruf:</span>
                  <button
                    type="button"
                    onClick={() => setLargeFont(false)}
                    className={`px-2 py-1 text-xs rounded border ${
                      !largeFont
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setLargeFont(true)}
                    className={`px-2 py-1 text-sm font-bold rounded border ${
                      largeFont
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Question Body */}
              <div className="p-5 md:p-8 space-y-6">
                {sanitizeImageUrl(currentQuestion.imageUrl) && (
                  <figure className="space-y-2">
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImageUrl(sanitizeImageUrl(currentQuestion.imageUrl))
                      }
                      title="Klik untuk memperbesar gambar"
                      className="block group text-left"
                    >
                      <img
                        src={sanitizeImageUrl(currentQuestion.imageUrl) || ''}
                        alt={currentQuestion.imageCaption || 'Gambar soal'}
                        className="max-h-80 w-auto rounded-xl border border-slate-200 bg-white object-contain group-hover:border-blue-400 transition-colors"
                      />
                    </button>
                    {currentQuestion.imageCaption && (
                      <figcaption className="text-xs text-slate-500">
                        {currentQuestion.imageCaption}
                      </figcaption>
                    )}
                  </figure>
                )}

                {currentQuestion.prompt && (
                  <div
                    className={`text-slate-900 leading-relaxed ${
                      largeFont ? 'text-lg' : 'text-base'
                    }`}
                  >
                    <MathText
                      text={currentQuestion.prompt}
                      direction={currentQuestion.direction}
                    />
                  </div>
                )}

                {/* 1. Pilihan Ganda */}
                {currentQuestion.type === 'multiple_choice' && (
                  <div className="space-y-2.5">
                    {currentQuestion.options.map((opt, idx) => {
                      const selected = session.answers[currentQuestion.id] === opt.id;
                      const letter = String.fromCharCode(65 + idx);
                      const optImg = sanitizeImageUrl(opt.imageUrl);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => sendAnswer(currentQuestion.id, opt.id)}
                          className={`w-full text-left flex items-start gap-3.5 p-4 rounded-lg border transition-colors ${
                            selected
                              ? 'bg-emerald-50 border-emerald-600 text-slate-900'
                              : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded flex items-center justify-center text-sm font-mono font-bold shrink-0 ${
                              selected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 border border-slate-300 text-slate-700'
                            }`}
                          >
                            {letter}
                          </span>
                          <div
                            className={`flex-1 pt-0.5 space-y-2 ${
                              largeFont ? 'text-base' : 'text-sm md:text-base'
                            }`}
                          >
                            {opt.text && (
                              <MathText
                                text={opt.text}
                                direction={currentQuestion.direction}
                              />
                            )}
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`Gambar opsi ${letter}`}
                                className="max-h-36 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. Pilihan Ganda Kompleks / MCMA */}
                {(currentQuestion.type === 'complex_multiple_choice' ||
                  currentQuestion.type === 'mcma') && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-600">
                        {currentQuestion.type === 'mcma'
                          ? 'MCMA (Multiple Choice Multiple Answer) — Pilih semua jawaban yang benar (lebih dari satu):'
                          : 'Pilih semua jawaban yang benar (lebih dari satu):'}
                      </p>
                      {currentQuestion.type === 'mcma' && (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                          {currentQuestion.scoringMode === 'exact'
                            ? 'Penilaian: Tepat Semua'
                            : 'Penilaian: Parsial'}
                        </span>
                      )}
                    </div>
                    {currentQuestion.options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const currentArr = Array.isArray(
                        session.answers[currentQuestion.id]
                      )
                        ? (session.answers[currentQuestion.id] as string[])
                        : [];
                      const checked = currentArr.includes(opt.id);
                      const toggle = () => {
                        const next = checked
                          ? currentArr.filter((id) => id !== opt.id)
                          : [...currentArr, opt.id];
                        sendAnswer(currentQuestion.id, next);
                      };
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={toggle}
                          className={`w-full text-left flex items-start gap-3.5 p-4 rounded-lg border transition-colors ${
                            checked
                              ? 'bg-emerald-50 border-emerald-600 text-slate-900'
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
                          {currentQuestion.type === 'mcma' && (
                            <span
                              className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                                checked
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 border border-slate-300 text-slate-700'
                              }`}
                            >
                              {letter}
                            </span>
                          )}
                          <div
                            className={`flex-1 space-y-2 ${
                              largeFont ? 'text-base' : 'text-sm md:text-base'
                            }`}
                          >
                            {opt.text && (
                              <MathText
                                text={opt.text}
                                direction={currentQuestion.direction}
                              />
                            )}
                            {sanitizeImageUrl(opt.imageUrl) && (
                              <img
                                src={sanitizeImageUrl(opt.imageUrl) || ''}
                                alt={`Gambar opsi ${letter}`}
                                className="max-h-36 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3. Menjodohkan */}
                {currentQuestion.type === 'matching' && (
                  <div className="divide-y divide-slate-200 border border-slate-300 rounded-lg overflow-hidden">
                    {currentQuestion.pairs.map((pair, idx) => {
                      const currentMap =
                        session.answers[currentQuestion.id] &&
                        typeof session.answers[currentQuestion.id] === 'object' &&
                        !Array.isArray(session.answers[currentQuestion.id])
                          ? (session.answers[currentQuestion.id] as Record<
                              string,
                              string
                            >)
                          : {};
                      const selectedPairId = currentMap[pair.id] || '';
                      return (
                        <div
                          key={pair.id}
                          className="p-4 bg-white grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                        >
                          <div className="md:col-span-6 flex items-start gap-2.5 text-sm text-slate-900">
                            <span className="font-mono text-xs text-slate-500 mt-1">
                              {idx + 1}.
                            </span>
                            <MathText
                              text={pair.left}
                              direction={currentQuestion.direction}
                            />
                          </div>
                          <div className="md:col-span-6">
                            <select
                              value={selectedPairId}
                              onChange={(e) => {
                                const next = {
                                  ...currentMap,
                                  [pair.id]: e.target.value,
                                };
                                if (!e.target.value) delete next[pair.id];
                                sendAnswer(currentQuestion.id, next);
                              }}
                              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            >
                              <option value="">-- Pilih pasangan --</option>
                              {shuffledRightPairs.map((rp) => (
                                <option key={rp.id} value={rp.id}>
                                  {rp.right}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. PGK Kategori (Benar atau Salah / Sesuai atau Tidak Sesuai) */}
                {currentQuestion.type === 'true_false' && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-slate-600">
                      PGK Kategori — Tentukan apakah setiap pernyataan berikut <strong>Benar (Sesuai)</strong> atau <strong>Salah (Tidak Sesuai)</strong>:
                    </p>
                    <div className="border border-slate-300 rounded-lg overflow-hidden divide-y divide-slate-200">
                    {currentQuestion.statements.map((stmt, idx) => {
                      const currentMap =
                        session.answers[currentQuestion.id] &&
                        typeof session.answers[currentQuestion.id] === 'object' &&
                        !Array.isArray(session.answers[currentQuestion.id])
                          ? (session.answers[currentQuestion.id] as Record<
                              string,
                              boolean
                            >)
                          : {};
                      const val = currentMap[stmt.id];
                      const setChoice = (choice: boolean) => {
                        sendAnswer(currentQuestion.id, {
                          ...currentMap,
                          [stmt.id]: choice,
                        });
                      };
                      return (
                        <div
                          key={stmt.id}
                          className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-2.5 text-sm text-slate-900 flex-1">
                            <span className="font-mono text-xs text-slate-500 mt-1">
                              {idx + 1}.
                            </span>
                            <MathText
                              text={stmt.text}
                              direction={currentQuestion.direction}
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setChoice(true)}
                              className={`px-4 py-2 text-xs font-bold rounded border transition-colors ${
                                val === true
                                  ? 'bg-emerald-600 border-emerald-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Benar
                            </button>
                            <button
                              type="button"
                              onClick={() => setChoice(false)}
                              className={`px-4 py-2 text-xs font-bold rounded border transition-colors ${
                                val === false
                                  ? 'bg-red-600 border-red-700 text-white'
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

                {/* 5. Esai */}
                {currentQuestion.type === 'essay' && (
                  <div className="space-y-3">
                    <textarea
                      rows={6}
                      value={
                        typeof session.answers[currentQuestion.id] === 'string'
                          ? (session.answers[currentQuestion.id] as string)
                          : ''
                      }
                      dir={currentQuestion.direction === 'rtl' ? 'rtl' : 'ltr'}
                      onChange={(e) => sendAnswer(currentQuestion.id, e.target.value)}
                      placeholder="Tuliskan jawaban uraian Anda di sini..."
                      className="w-full p-4 text-sm text-slate-900 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 select-text"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-500 mr-1">Simbol:</span>
                      {ESSAY_SYMBOLS.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            const prev =
                              typeof session.answers[currentQuestion.id] === 'string'
                                ? (session.answers[currentQuestion.id] as string)
                                : '';
                            sendAnswer(
                              currentQuestion.id,
                              prev ? `${prev} ${sym}` : sym
                            );
                          }}
                          className="px-2 py-1 text-xs font-mono bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded"
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Classic CBT Bottom Navigation Bar */}
              <div className="bg-slate-50 border-t border-slate-200 px-5 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs md:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Soal Sebelumnya
                </button>

                <button
                  type="button"
                  onClick={() => toggleDoubtful(currentQuestion.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs md:text-sm font-semibold rounded-lg border transition-colors ${
                    session.doubtfulIds.includes(currentQuestion.id)
                      ? 'bg-amber-400 border-amber-500 text-slate-950'
                      : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  Ragu-ragu
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                    }
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs md:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Soal Selanjutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs md:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    Kumpulkan Jawaban
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-sm text-slate-500">
              Belum ada soal tersedia. Guru sedang menyiapkan soal.
            </div>
          )}
        </main>

        {/* Right Column: Classic CBT Green/Red Question Number Grid */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5">
            {renderQuestionBoxes()}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Exam Browser Terproteksi</span>
            </div>
            <p>
              Jangan berpindah tab atau keluar aplikasi. Pelanggaran tercatat:{' '}
              <strong className="font-mono text-slate-900">
                {session.violations.length}
              </strong>
              .
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile Daftar Soal Drawer */}
      {mobileGridOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 lg:hidden">
          <div className="w-full max-w-xs bg-white h-full overflow-y-auto p-5 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">
                Navigasi Daftar Soal
              </span>
              <button
                type="button"
                onClick={() => setMobileGridOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderQuestionBoxes(() => setMobileGridOpen(false))}
          </div>
        </div>
      )}

      {/* Fullscreen Exit Warning & Auto-Lock Blocking Overlay */}
      {fullscreenGraceSeconds !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-white border-2 border-red-500 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-red-100 text-red-700 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                  Peringatan Exam Browser · Ke-{fullscreenExitCount} dari {MAX_FULLSCREEN_WARNINGS}
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                  Anda Keluar dari Mode Layar Penuh!
                </h2>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <p className="text-xs text-red-900 leading-relaxed">
                Segera kembali ke mode layar penuh sebelum hitungan mundur habis, atau sesi ujian Anda akan <strong>dikunci otomatis</strong> dan dilaporkan ke Guru / Proktor.
              </p>
              <div className="shrink-0 w-16 h-16 rounded-xl bg-red-600 text-white flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-mono tabular-nums leading-none">
                  {fullscreenGraceSeconds}
                </span>
                <span className="text-[10px] font-medium text-red-100 mt-0.5">
                  detik
                </span>
              </div>
            </div>

            {fullscreenError && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {fullscreenError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void enterFullscreen()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors shadow-sm"
            >
              <Maximize2 className="w-4 h-4" />
              Kembali ke Layar Penuh Sekarang
            </button>

            <p className="text-[11px] text-center text-slate-500">
              Keluar layar penuh berulang ({MAX_FULLSCREEN_WARNINGS}x) akan langsung mengunci ujian tanpa hitungan mundur.
            </p>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Selesai & Kumpulkan Tryout?
            </h2>
            <p className="text-sm text-slate-600">
              Kotak hijau (sudah dijawab):{' '}
              <strong className="font-mono text-emerald-700">{answeredCount}</strong>{' '}
              · Kotak merah (belum dijawab):{' '}
              <strong className="font-mono text-red-700">{unansweredCount}</strong>.
              Nilai otomatis akan langsung tampil.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                onClick={submitExam}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}
      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setZoomedImageUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-900 text-white inline-flex items-center justify-center shadow-md hover:bg-slate-800"
              aria-label="Tutup gambar"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={zoomedImageUrl}
              alt="Perbesaran gambar soal"
              className="max-h-[84vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
