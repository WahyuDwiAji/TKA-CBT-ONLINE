import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Battery,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  LayoutGrid,
  Lock,
  Maximize2,
  Megaphone,
  Minimize2,
  PauseCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { ExamProgressBar } from './ExamProgressBar';
import { MathText } from './MathText';
import { ThemeToggleButton } from './ThemeToggleButton';
import {
  formatFreePracticeDateTime,
  isFreePracticeActive,
} from '../lib/freePractice';
import { isQuestionAnswered } from '../lib/grading';
import { sanitizeImageUrl } from '../lib/imageUpload';
import {
  LOGIN_DRAFT_KEYS,
  readLocalDraft,
  writeLocalDraft,
} from '../lib/loginDraft';
import {
  clearOfflineExamState,
  loadOfflineExamState,
  saveOfflineExamState,
  type OfflineExamState,
} from '../lib/offlineSync';
import {
  playCheatAlarm,
  playProctorAlert,
  playTestBeep,
  unlockAudio,
} from '../lib/sound';
import { createCbtSocket, type ManagedSocket } from '../lib/ws';
import type {
  Announcement,
  ExamConfig,
  MatchingQuestion,
  Question,
  StudentAnswerValue,
  StudentSession,
} from '../types/cbt';
import { QUESTION_TYPE_LABELS } from '../types/cbt';

interface StudentExamViewProps {
  onExitToPortal: () => void;
  isDark?: boolean;
  onToggleDarkMode?: () => void;
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
  isDark = false,
  onToggleDarkMode,
}) => {
  const [studentName, setStudentName] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentName)
  );
  const [studentNis, setStudentNis] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentNis)
  );
  const [studentId, setStudentId] = useState<string | null>(
    () => sessionStorage.getItem('cbt_active_student_id')
  );

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.studentName, studentName);
  }, [studentName]);

  useEffect(() => {
    writeLocalDraft(LOGIN_DRAFT_KEYS.studentNis, studentNis);
  }, [studentNis]);

  const [joined, setJoined] = useState(() => {
    const autoJoin = sessionStorage.getItem('cbt_auto_join') === '1';
    const existingId = sessionStorage.getItem('cbt_active_student_id');
    return autoJoin && Boolean(existingId);
  });

  const [wsConnected, setWsConnected] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [heartbeatOk, setHeartbeatOk] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pendingOfflineSubmit, setPendingOfflineSubmit] = useState(false);
  const [batteryLabel, setBatteryLabel] = useState<string>('Terdeteksi');
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [session, setSession] = useState<StudentSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displaySeconds, setDisplaySeconds] = useState<number>(0);
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [fiveMinuteAlertVisible, setFiveMinuteAlertVisible] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<Announcement | null>(null);
  const [timeAddedNotice, setTimeAddedNotice] = useState<string | null>(null);
  const [violationWarningModal, setViolationWarningModal] = useState<{
    count: number;
    max: number;
    reason: string;
  } | null>(null);
  const [lastSavedText, setLastSavedText] = useState<string>('Tersinkron');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [mobileGridOpen, setMobileGridOpen] = useState(false);
  const [audioTested, setAudioTested] = useState(false);
  const [formError, setFormError] = useState('');
  const [entrySessionCode, setEntrySessionCode] = useState(() =>
    readLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode)
  );
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [publicConfig, setPublicConfig] = useState<{
    title?: string;
    requireSessionCode?: boolean;
    freePracticeActive?: boolean;
    freePracticeEnabled?: boolean;
    freePracticeEndAt?: string;
  } | null>(null);
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xlarge'>(() => {
    const saved = readLocalDraft('cbt_exam_font_scale');
    return saved === 'large' || saved === 'xlarge' ? saved : 'normal';
  });
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenGraceSeconds, setFullscreenGraceSeconds] = useState<number | null>(null);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [fullscreenError, setFullscreenError] = useState('');

  const socketRef = useRef<ManagedSocket | null>(null);
  const sessionRef = useRef<StudentSession | null>(null);
  const examConfigRef = useRef<ExamConfig | null>(null);
  const offlineStateRef = useRef<OfflineExamState | null>(null);
  const lastViolationAtRef = useRef<number>(0);
  const fiveMinuteWarnedRef = useRef<boolean>(false);
  const autoSubmittedRef = useRef<boolean>(false);
  const wasFullscreenRef = useRef<boolean>(false);
  const prevStatusRef = useRef<string | null>(null);

  const FULLSCREEN_GRACE_SECONDS = 10;
  const MAX_FULLSCREEN_WARNINGS = 3;
  const isConnectionHealthy = browserOnline && heartbeatOk && (joined ? wsConnected : true);

  useEffect(() => {
    writeLocalDraft('cbt_exam_font_scale', fontScale);
  }, [fontScale]);

  // Heartbeat API + online/offline network monitor
  useEffect(() => {
    let active = true;
    const pingHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (active) setHeartbeatOk(false);
        return;
      }
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 4500);
        const res = await fetch('/api/heartbeat', {
          cache: 'no-store',
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        if (active) setHeartbeatOk(res.ok);
      } catch {
        if (active) setHeartbeatOk(false);
      }
    };

    const handleOnline = () => {
      if (active) setBrowserOnline(true);
      void pingHeartbeat();
    };
    const handleOffline = () => {
      if (active) {
        setBrowserOnline(false);
        setHeartbeatOk(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void pingHeartbeat();
    const interval = window.setInterval(() => void pingHeartbeat(), 10000);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  // Optional battery readiness check on entry screen
  useEffect(() => {
    if (joined) return;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((b) => {
          const pct = Math.round((b.level || 0) * 100);
          setBatteryLabel(`${pct}%${b.charging ? ' (Mengisi)' : ''}`);
        })
        .catch(() => setBatteryLabel('Terdeteksi'));
    }
  }, [joined]);

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

  const flushOfflineQueue = useCallback((sock: ManagedSocket, sess: StudentSession) => {
    const cached = loadOfflineExamState(sess.id);
    if (!cached) {
      setPendingSyncCount(0);
      setPendingOfflineSubmit(false);
      return;
    }
    offlineStateRef.current = cached;
    if (sess.status === 'active') {
      for (const qId of cached.pendingAnswerIds) {
        if (cached.answers[qId] !== undefined) {
          sock.send({
            type: 'student:answer',
            studentId: sess.id,
            questionId: qId,
            value: cached.answers[qId],
          });
        }
      }
      if (cached.pendingSubmit) {
        sock.send({ type: 'student:submit', studentId: sess.id });
      }
    }
    setPendingSyncCount(cached.pendingAnswerIds.length);
    setPendingOfflineSubmit(Boolean(cached.pendingSubmit));
  }, []);

  const submitExam = useCallback(() => {
    const currentSess = sessionRef.current;
    if (!currentSess) return;
    setFullscreenGraceSeconds(null);
    setConfirmSubmitOpen(false);
    setMobileGridOpen(false);

    if (!browserOnline || !wsConnected) {
      const existing = offlineStateRef.current ||
        loadOfflineExamState(currentSess.id) || {
          studentId: currentSess.id,
          answers: currentSess.answers,
          pendingAnswerIds: [],
          doubtfulIds: currentSess.doubtfulIds,
          pendingDoubtfulSync: false,
          pendingSubmit: true,
          seq: 1,
          updatedAt: new Date().toISOString(),
        };
      const updatedOffline: OfflineExamState = {
        ...existing,
        pendingSubmit: true,
        seq: existing.seq + 1,
        updatedAt: new Date().toISOString(),
      };
      offlineStateRef.current = updatedOffline;
      saveOfflineExamState(updatedOffline);
      setPendingOfflineSubmit(true);
      setLastSavedText('Offline · Pengumpulan menunggu koneksi');
    }

    socketRef.current?.send({
      type: 'student:submit',
      studentId: currentSess.id,
    });
  }, [browserOnline, wsConnected]);

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
          const cached = loadOfflineExamState(sess.id);

          let mergedSess = sess;
          if (cached && sess.status === 'active' && cached.pendingAnswerIds.length > 0) {
            const mergedAnswers = { ...sess.answers };
            for (const qId of cached.pendingAnswerIds) {
              if (cached.answers[qId] !== undefined) {
                mergedAnswers[qId] = cached.answers[qId];
              }
            }
            mergedSess = { ...sess, answers: mergedAnswers };
          }

          setExamConfig(cfg);
          setQuestions(qs);
          setSession(mergedSess);
          setDisplaySeconds(mergedSess.remainingSeconds);
          setTimerInitialized(true);
          fiveMinuteWarnedRef.current = false;
          autoSubmittedRef.current = false;

          if (sess.status === 'submitted' || sess.status === 'force_stopped') {
            clearOfflineExamState(sess.id);
            setPendingSyncCount(0);
            setPendingOfflineSubmit(false);
          } else if (socketRef.current) {
            flushOfflineQueue(socketRef.current, mergedSess);
          }
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
          if (updated.status === 'submitted' || updated.status === 'force_stopped') {
            clearOfflineExamState(updated.id);
            setPendingSyncCount(0);
            setPendingOfflineSubmit(false);
          }
          return;
        }
        if (data.type === 'violation:warning') {
          setViolationWarningModal({
            count: Number(data.count || 1),
            max: Number(data.max || 3),
            reason: String(data.reason || 'Pelanggaran terdeteksi'),
          });
          return;
        }
        if (data.type === 'proctor:time_added') {
          const mins = Number(data.minutes || 5);
          const reason = String(data.reason || '');
          playProctorAlert();
          setTimeAddedNotice(
            `Proktor menambahkan +${mins} menit${reason ? ` (${reason})` : ''}.`
          );
          return;
        }
        if (data.type === 'announcement:live') {
          const ann = data.announcement as Announcement | undefined;
          if (ann) {
            playProctorAlert();
            setLiveAnnouncement(ann);
          }
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
          const ackQuestionId = String(data.questionId || '');
          const currentSess = sessionRef.current;
          if (currentSess && ackQuestionId) {
            const existing = offlineStateRef.current || loadOfflineExamState(currentSess.id);
            if (existing) {
              const nextPending = existing.pendingAnswerIds.filter((id) => id !== ackQuestionId);
              const nextState: OfflineExamState = {
                ...existing,
                pendingAnswerIds: nextPending,
                updatedAt: new Date().toISOString(),
              };
              offlineStateRef.current = nextState;
              saveOfflineExamState(nextState);
              setPendingSyncCount(nextPending.length);
            }
          }
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
          if (studentId) clearOfflineExamState(studentId);
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
  }, [joined, studentId, studentName, studentNis, flushOfflineQueue]);

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

  useEffect(() => {
    if (joined) return;
    let active = true;
    const loadPublicConfig = () => {
      fetch('/api/public-config')
        .then((res) => res.json())
        .then((data) => {
          if (active) setPublicConfig(data);
        })
        .catch(() => {});
    };
    loadPublicConfig();
    window.addEventListener('focus', loadPublicConfig);
    return () => {
      active = false;
      window.removeEventListener('focus', loadPublicConfig);
    };
  }, [joined]);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentNis.trim()) {
      setFormError('Nama murid dan NIS wajib diisi.');
      return;
    }
    const requiresToken =
      Boolean(publicConfig?.requireSessionCode) && !publicConfig?.freePracticeActive;
    if (requiresToken && !entrySessionCode.trim()) {
      setFormError('Masukkan kode sesi / token ujian yang diberikan proktor.');
      return;
    }
    setFormError('');
    setEntrySubmitting(true);
    try {
      const res = await fetch('/api/student/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: studentName.trim(),
          nis: studentNis.trim(),
          sessionCode: entrySessionCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Gagal memverifikasi peserta.');
        return;
      }

      unlockAudio();
      const verifiedName = String(data.studentName || studentName.trim());
      const verifiedNis = String(data.nis || studentNis.trim());
      setStudentName(verifiedName);
      setStudentNis(verifiedNis);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentName, verifiedName);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentNis, verifiedNis);
      writeLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode, entrySessionCode.trim());
      const id = String(data.studentId || studentId || `stu-${Date.now().toString(36)}`);
      sessionStorage.setItem('cbt_active_student_id', id);
      setStudentId(id);
      setJoined(true);
      void enterFullscreen();
    } catch {
      setFormError('Tidak dapat terhubung ke server CBT. Periksa jaringan Anda.');
    } finally {
      setEntrySubmitting(false);
    }
  };

  const sendAnswer = (questionId: string, value: StudentAnswerValue) => {
    if (!session || session.status !== 'active') return;
    const nextAnswers = { ...session.answers, [questionId]: value };
    setSession((prev) => (prev ? { ...prev, answers: nextAnswers } : prev));

    const prevOffline = offlineStateRef.current || loadOfflineExamState(session.id);
    const pendingSet = new Set(prevOffline?.pendingAnswerIds || []);
    pendingSet.add(questionId);
    const nextOffline: OfflineExamState = {
      studentId: session.id,
      answers: nextAnswers,
      pendingAnswerIds: Array.from(pendingSet),
      doubtfulIds: session.doubtfulIds,
      pendingDoubtfulSync: prevOffline?.pendingDoubtfulSync || false,
      pendingSubmit: prevOffline?.pendingSubmit || false,
      seq: (prevOffline?.seq || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    offlineStateRef.current = nextOffline;
    saveOfflineExamState(nextOffline);
    setPendingSyncCount(nextOffline.pendingAnswerIds.length);
    if (!isConnectionHealthy) {
      setLastSavedText(`Offline · Tersimpan lokal (${nextOffline.pendingAnswerIds.length})`);
    }

    socketRef.current?.send({
      type: 'student:answer',
      studentId: session.id,
      questionId,
      value,
    });
  };

  const toggleDoubtful = (questionId: string) => {
    if (!session || session.status !== 'active') return;
    const exists = session.doubtfulIds.includes(questionId);
    const nextDoubtful = exists
      ? session.doubtfulIds.filter((id) => id !== questionId)
      : [...session.doubtfulIds, questionId];
    setSession((prev) => (prev ? { ...prev, doubtfulIds: nextDoubtful } : prev));
    const prevOffline = offlineStateRef.current || loadOfflineExamState(session.id);
    if (prevOffline) {
      const nextOffline: OfflineExamState = {
        ...prevOffline,
        doubtfulIds: nextDoubtful,
        seq: prevOffline.seq + 1,
        updatedAt: new Date().toISOString(),
      };
      offlineStateRef.current = nextOffline;
      saveOfflineExamState(nextOffline);
    }
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
      <div className="min-h-screen bg-gradient-to-br from-[#F7F8FC] via-indigo-50/40 to-sky-50/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
        <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={onExitToPortal}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-300 inline-flex items-center justify-center">
              <Lock className="w-3.5 h-3.5" />
            </span>
            Exam Browser · Tryout TKA SD
          </span>
          <div className="flex items-center gap-2">
            <div
              title={
                isConnectionHealthy
                  ? 'Heartbeat API terhubung — siap mengirim jawaban'
                  : 'Koneksi server terputus — periksa jaringan Anda'
              }
              className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-xl text-[11px] font-semibold border ${
                isConnectionHealthy
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
              }`}
            >
              {isConnectionHealthy ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>{isConnectionHealthy ? 'Online' : 'Offline'}</span>
            </div>
            {onToggleDarkMode && (
              <ThemeToggleButton isDark={isDark} onToggle={onToggleDarkMode} />
            )}
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-[440px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-7 shadow-sm space-y-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/70 px-2.5 py-1 rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5" />
                Mode Layar Penuh Terproteksi
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 pt-1">
                Masuk Exam Browser Murid
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Tryout TKA SD · Jangan berpindah tab, keluar layar penuh, atau membuka aplikasi lain selama ujian berlangsung.
              </p>
            </div>

            <form onSubmit={handleStartExam} className="space-y-4">
              {publicConfig?.freePracticeActive && (
                <div className="px-3.5 py-2.5 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl space-y-0.5">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Mode Latihan Bebas Aktif
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    Anda dapat mencoba sistem langsung tanpa kode sesi.
                    {!publicConfig.freePracticeEnabled && publicConfig.freePracticeEndAt
                      ? ` Terjadwal hingga ${formatFreePracticeDateTime(publicConfig.freePracticeEndAt)}.`
                      : ''}
                  </p>
                </div>
              )}

              {formError && (
                <div className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Lengkap Murid
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="cth. Siti Aminah"
                  className="w-full h-11 px-3.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  NIS / Nomor Peserta
                </label>
                <input
                  type="text"
                  value={studentNis}
                  onChange={(e) => setStudentNis(e.target.value)}
                  placeholder="cth. 6001"
                  className="w-full h-11 px-3.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                />
              </div>

              {publicConfig?.requireSessionCode && !publicConfig?.freePracticeActive && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Token / Kode Sesi
                  </label>
                  <input
                    type="text"
                    value={entrySessionCode}
                    onChange={(e) => {
                      setEntrySessionCode(e.target.value);
                      writeLocalDraft(LOGIN_DRAFT_KEYS.studentSessionCode, e.target.value);
                    }}
                    placeholder="cth. TKA-SD-01"
                    className="w-full h-11 px-3.5 text-sm font-mono uppercase text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl focus:outline-none transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={entrySubmitting}
                className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-xs transition-colors"
              >
                {entrySubmitting
                  ? 'Memverifikasi...'
                  : publicConfig?.freePracticeActive
                    ? 'Mulai Latihan Bebas Sekarang'
                    : 'Mulai Tryout Sekarang'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  playTestBeep();
                  setAudioTested(true);
                }}
                className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/50 hover:bg-sky-100/70 dark:hover:bg-sky-900/60 border border-sky-200/70 dark:border-sky-800/70 rounded-xl transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                {audioTested ? 'Audio peringatan aktif' : 'Uji suara anti-curang'}
              </button>

              {/* Device Readiness Pre-Check (PRD F-510) */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-[11px]">
                <div className="px-2.5 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                  <span className="text-slate-500 dark:text-slate-400 block">Server</span>
                  <span
                    className={`font-semibold ${
                      isConnectionHealthy
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isConnectionHealthy ? 'Siap' : 'Offline'}
                  </span>
                </div>
                <div className="px-2.5 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                  <span className="text-slate-500 dark:text-slate-400 block">Layar Penuh</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {fullscreenSupported ? 'Didukung' : 'Terbatas'}
                  </span>
                </div>
                <div className="px-2.5 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Battery className="w-3 h-3" /> Baterai
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {batteryLabel}
                  </span>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  if (!session || !examConfig) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center space-y-3 shadow-xs">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Memuat Exam Browser &amp; Soal Tryout...
          </p>
        </div>
      </div>
    );
  }

  // 2. Violation Lock Screen
  if (session.status === 'violation_locked') {
    const latestViolation = session.violations[0];
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-7 space-y-5 shadow-2xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl shrink-0">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-rose-300">
                Exam Browser Terkunci · Pelanggaran #{session.violations.length}
              </p>
              <h1 className="mt-0.5 text-lg font-bold text-white">
                Halaman Ujian Ditutup Otomatis
              </h1>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-1.5 text-sm">
            <p className="font-medium text-white">
              {latestViolation?.reason || 'Berpindah halaman atau aplikasi lain'}
            </p>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {latestViolation
                ? new Date(latestViolation.timestamp).toLocaleTimeString('id-ID')
                : ''}{' '}
              · {session.name} ({session.nis})
            </p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Laporan pelanggaran telah dikirim langsung ke Guru / Proktor. Silakan tunggu Guru membuka kunci ujian Anda.
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => playCheatAlarm()}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Bunyikan Alarm
            </button>
            <span className="text-xs text-slate-400">
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
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-7 space-y-5 shadow-2xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl shrink-0">
              <PauseCircle className="w-5 h-5 text-amber-400" />
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

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-slate-300">
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
      <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950">
        <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-6 h-14 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center">
              <Award className="w-4 h-4" />
            </span>
            Hasil Tryout TKA SD
          </span>
          <div className="flex items-center gap-2">
            {onToggleDarkMode && (
              <ThemeToggleButton isDark={isDark} onToggle={onToggleDarkMode} />
            )}
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen?.().catch(() => {});
                }
                sessionStorage.removeItem('cbt_active_student_id');
                onExitToPortal();
              }}
              className="h-9 px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Keluar Exam Browser
            </button>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {isForced && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-rose-900 dark:text-rose-200">
                  Ujian Dihentikan Secara Paksa oleh Guru / Proktor
                </p>
                <p className="text-rose-700 dark:text-rose-300 mt-0.5 text-xs">
                  {session.suspendReason ||
                    'Jawaban yang sudah dikerjakan tetap dinilai secara otomatis.'}
                </p>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-emerald-50/80 via-sky-50/60 to-indigo-50/70 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 border border-indigo-100 dark:border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xs">
            <div>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {examConfig.title} · Penilaian Otomatis
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {session.name}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                NIS {session.nis} · Pelanggaran: {session.violations.length}
              </p>
            </div>

            {grade && (
              <div className="flex items-center gap-5 pt-4 sm:pt-0 border-t sm:border-t-0 border-indigo-200/60 dark:border-slate-700">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Nilai Tryout</p>
                  <p className="text-4xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                    {grade.totalScore}
                  </p>
                  {grade.predicate && (
                    <p
                      className={`text-[11px] font-semibold mt-0.5 ${
                        grade.passedKkm
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {grade.passedKkm ? 'Tuntas KKM' : 'Belum Tuntas'} · {grade.predicate}
                    </p>
                  )}
                </div>
                <div className="h-12 w-px bg-indigo-200/70 dark:bg-slate-700" />
                <div className="text-xs space-y-1 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                  <p>
                    {grade.earnedPoints}/{grade.maxPoints} poin
                  </p>
                  <p>
                    {grade.correctCount} benar
                    {(grade.partialCount ?? 0) > 0 ? ` · ${grade.partialCount} parsial` : ''}
                  </p>
                  {(grade.pendingManualCount ?? 0) > 0 && (
                    <p className="text-amber-700 dark:text-amber-400 font-sans font-semibold">
                      {grade.pendingManualCount} esai menunggu verifikasi guru
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {grade && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-2xs">
              {questions.map((q, idx) => {
                const res = grade.breakdown.find((b) => b.questionId === q.id);
                return (
                  <div key={q.id} className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        <strong className="font-mono text-slate-900 dark:text-slate-100">
                          Soal {idx + 1}
                        </strong>{' '}
                        · {QUESTION_TYPE_LABELS[q.type]}
                        {q.topic ? ` · ${q.topic}` : ''}
                      </span>
                      {res && (
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            res.pendingManualReview
                              ? 'text-amber-700 dark:text-amber-400'
                              : res.isCorrect
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : res.isPartial
                                  ? 'text-sky-700 dark:text-sky-400'
                                  : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {res.isCorrect ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : res.pendingManualReview || res.isPartial ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span className="font-mono tabular-nums">
                            {res.pendingManualReview
                              ? `Menunggu Koreksi (${res.earnedPoints}/${res.maxPoints})`
                              : `${res.earnedPoints}/${res.maxPoints} poin`}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-800 dark:text-slate-200">
                      <MathText text={q.prompt} direction={q.direction} />
                    </div>
                    {res && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{res.feedback}</p>
                    )}
                    {q.explanation && (
                      <div className="mt-2 p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/60 text-xs text-sky-950 dark:text-sky-200 space-y-1">
                        <p className="font-semibold text-sky-800 dark:text-sky-300">
                          Pembahasan:
                        </p>
                        <MathText text={q.explanation} direction={q.direction} />
                      </div>
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
      <ExamProgressBar
        answeredCount={answeredCount}
        totalCount={questions.length}
        doubtfulCount={session.doubtfulIds.length}
        variant="compact"
      />

      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, idx) => {
          const answered = isQuestionAnswered(q, session.answers[q.id]);
          const doubtful = session.doubtfulIds.includes(q.id);
          const active = idx === currentIndex;
          const lockedBack = Boolean(examConfig.preventBackNavigation) && idx < currentIndex;

          const boxColorClass = doubtful
            ? 'bg-amber-300 border-amber-400 text-amber-950'
            : answered
              ? 'bg-emerald-500 border-emerald-600 text-white'
              : 'bg-rose-500 border-rose-600 text-white';

          return (
            <button
              key={q.id}
              type="button"
              disabled={lockedBack}
              title={lockedBack ? 'Navigasi mundur dinonaktifkan oleh pengawas' : `Soal ${idx + 1}`}
              onClick={() => {
                if (lockedBack) return;
                setCurrentIndex(idx);
                onSelect?.();
              }}
              className={`h-9 rounded-lg text-xs font-mono tabular-nums font-semibold border transition-all ${boxColorClass} ${
                active ? 'ring-2 ring-offset-2 ring-indigo-600 scale-[1.04]' : 'opacity-90 hover:opacity-100'
              } ${lockedBack ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            Sudah dikerjakan
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {answeredCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
            Belum dikerjakan
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {unansweredCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-amber-300 inline-block" />
            Ragu-ragu
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {session.doubtfulIds.length}
          </span>
        </div>
      </div>
    </div>
  );

  // 5. Pastel Modern Minimalist Indonesian CBT Exam Browser Workspace
  const isLowTime = displaySeconds <= 300;

  return (
    <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950 flex flex-col select-none relative">
      {/* Subtle Student Identity Watermark Overlay */}
      {examConfig.watermarkEnabled !== false && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none fixed inset-0 z-10 overflow-hidden opacity-[0.035] dark:opacity-[0.045]"
        >
          <div className="grid grid-cols-3 gap-12 -rotate-12 scale-125 py-12">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="text-xs font-mono font-bold tracking-wider text-slate-900 dark:text-slate-100 whitespace-nowrap text-center"
              >
                {session.name} · NIS {session.nis} · {session.id.slice(-6)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam Browser Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 md:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {examConfig.title}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {session.name} ({session.nis}) ·{' '}
              {isFreePracticeActive(examConfig) ? 'Mode Latihan Bebas · ' : ''}
              {lastSavedText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`h-9 flex items-center gap-1.5 px-3 rounded-xl text-xs md:text-sm font-mono tabular-nums font-semibold border transition-colors ${
              isLowTime
                ? 'bg-rose-600 border-rose-600 text-white'
                : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200/80 dark:border-indigo-800/70 text-indigo-700 dark:text-indigo-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatClock(displaySeconds)}</span>
          </div>

          <div
            title={
              isConnectionHealthy
                ? 'Koneksi Online · Sinkronisasi real-time aktif'
                : 'Koneksi Offline · Jawaban diamankan di perangkat dan akan tersinkron otomatis'
            }
            className={`h-9 inline-flex items-center gap-1.5 px-2.5 rounded-xl text-[11px] font-semibold border transition-colors ${
              isConnectionHealthy
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
            }`}
          >
            {isConnectionHealthy ? (
              <Wifi className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isConnectionHealthy
                ? pendingSyncCount > 0
                  ? `Sinkron (${pendingSyncCount})`
                  : 'Online'
                : pendingSyncCount > 0
                  ? `Offline (${pendingSyncCount})`
                  : 'Offline'}
            </span>
          </div>

          {onToggleDarkMode && (
            <ThemeToggleButton isDark={isDark} onToggle={onToggleDarkMode} />
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh Exam Browser'}
            className="hidden sm:inline-flex w-9 h-9 items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50/70 dark:hover:bg-slate-700 rounded-xl transition-colors"
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
            className="lg:hidden h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl"
          >
            <LayoutGrid className="w-4 h-4" />
            Soal
          </button>

          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Selesai
          </button>
        </div>
      </header>

      {/* Offline / Pending Sync Alert Banner */}
      {(!isConnectionHealthy || pendingOfflineSubmit) && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
              <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs font-medium">
                {pendingOfflineSubmit
                  ? 'Pengumpulan ujian dijadwalkan. Jangan tutup halaman — sistem akan mengirim otomatis saat koneksi tersambung kembali.'
                  : `Koneksi ke server sedang terputus. Anda tetap dapat melanjutkan ujian; ${pendingSyncCount} jawaban tersimpan aman di perangkat dan akan disinkronkan otomatis saat online.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live Proctor Announcement Banner */}
      {liveAnnouncement && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
          <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 text-indigo-950 dark:text-indigo-100">
              <Megaphone className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold">
                  Pengumuman Pengawas: {liveAnnouncement.title}
                </p>
                <p className="text-indigo-800 dark:text-indigo-200">
                  {liveAnnouncement.content}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLiveAnnouncement(null)}
              className="p-1 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg"
              aria-label="Tutup pengumuman"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Extra Time Added Notice */}
      {timeAddedNotice && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{timeAddedNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setTimeAddedNotice(null)}
              className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 5-Minute Warning Banner */}
      {fiveMinuteAlertVisible && (
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs md:text-sm font-medium">
                Sisa waktu ujian kurang dari 5 menit ({formatClock(displaySeconds)}). Jawaban akan dikumpulkan otomatis saat waktu habis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiveMinuteAlertVisible(false)}
              className="p-1 text-amber-700 hover:bg-amber-100 rounded-lg"
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
            <div className="bg-sky-50/80 border border-sky-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sky-900">
                <Maximize2 className="w-4 h-4 text-sky-600 shrink-0" />
                <p className="text-xs md:text-sm font-medium">
                  Mode Layar Penuh Exam Browser belum aktif. Aktifkan layar penuh agar sesi ujian tetap aman.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void enterFullscreen()}
                className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Aktifkan Layar Penuh
              </button>
            </div>
          </div>
        )}

      {/* Visual Question Completion Progress Bar */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4 md:pt-5">
        <ExamProgressBar
          answeredCount={answeredCount}
          totalCount={questions.length}
          doubtfulCount={session.doubtfulIds.length}
          variant="banner"
        />
      </div>

      {/* Clean 2-Column CBT Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pt-4 md:pt-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Main Question Paper */}
        <main className="lg:col-span-8 xl:col-span-9 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
          {currentQuestion ? (
            <>
              {/* Pastel Question Sub-Header */}
              <div className="bg-gradient-to-r from-indigo-50/60 via-sky-50/40 to-white dark:from-slate-800/80 dark:via-slate-900 dark:to-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-5 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                    Soal {currentIndex + 1} dari {questions.length}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {QUESTION_TYPE_LABELS[currentQuestion.type]}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {currentQuestion.subject}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Huruf:</span>
                  <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                    {(
                      [
                        { id: 'normal', label: 'A' },
                        { id: 'large', label: 'A+' },
                        { id: 'xlarge', label: 'A++' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFontScale(opt.id)}
                        className={`h-7 px-2.5 text-xs font-semibold transition-colors ${
                          fontScale === opt.id
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Question Body */}
              <div
                className={`p-5 md:p-8 space-y-6 ${
                  fontScale === 'xlarge'
                    ? 'text-lg'
                    : fontScale === 'large'
                      ? 'text-base'
                      : 'text-sm md:text-base'
                }`}
              >
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
                        className="max-h-80 w-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white object-contain group-hover:border-indigo-400 transition-colors"
                      />
                    </button>
                    {currentQuestion.imageCaption && (
                      <figcaption className="text-xs text-slate-500 dark:text-slate-400">
                        {currentQuestion.imageCaption}
                      </figcaption>
                    )}
                  </figure>
                )}

                {currentQuestion.prompt && (
                  <div
                    className={`text-slate-900 dark:text-slate-100 leading-relaxed ${
                      fontScale === 'xlarge'
                        ? 'text-xl'
                        : fontScale === 'large'
                          ? 'text-lg'
                          : 'text-base'
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
                          className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors ${
                            selected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 text-slate-900 dark:text-slate-100'
                              : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-semibold shrink-0 transition-colors ${
                              selected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {letter}
                          </span>
                          <div
                            className={`flex-1 pt-0.5 space-y-2 ${
                              fontScale === 'xlarge'
                                ? 'text-lg'
                                : fontScale === 'large'
                                  ? 'text-base'
                                  : 'text-sm md:text-base'
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
                                className="max-h-36 w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 object-contain"
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
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {currentQuestion.type === 'mcma'
                          ? 'MCMA — Pilih semua jawaban yang benar (lebih dari satu):'
                          : 'Pilih semua jawaban yang benar (lebih dari satu):'}
                      </p>
                      {currentQuestion.type === 'mcma' && (
                        <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
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
                          className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors ${
                            checked
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 text-slate-900 dark:text-white'
                              : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                              checked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5" />}
                          </span>
                          {currentQuestion.type === 'mcma' && (
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono font-semibold shrink-0 ${
                                checked
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {letter}
                            </span>
                          )}
                          <div
                            className={`flex-1 space-y-2 ${
                              fontScale === 'xlarge'
                                ? 'text-lg'
                                : fontScale === 'large'
                                  ? 'text-base'
                                  : 'text-sm md:text-base'
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
                                className="max-h-36 w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 object-contain"
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
                  <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
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
                          className="p-4 bg-white dark:bg-slate-800/60 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                        >
                          <div className="md:col-span-6 flex items-start gap-2.5 text-sm text-slate-900 dark:text-slate-100">
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-1">
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
                              className="w-full h-10 px-3 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500"
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
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Pilihan Ganda Kompleks — Tentukan apakah setiap pernyataan berikut Benar (Sesuai) atau Salah (Tidak Sesuai):
                    </p>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-700">
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
                            className="p-4 bg-white dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="flex items-start gap-2.5 text-sm text-slate-900 dark:text-slate-100 flex-1">
                              <span className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-1">
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
                                className={`h-9 px-4 text-xs font-semibold rounded-lg border transition-colors ${
                                  val === true
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-200 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-300'
                                }`}
                              >
                                Benar
                              </button>
                              <button
                                type="button"
                                onClick={() => setChoice(false)}
                                className={`h-9 px-4 text-xs font-semibold rounded-lg border transition-colors ${
                                  val === false
                                    ? 'bg-rose-600 border-rose-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 hover:text-rose-700 dark:hover:text-rose-300'
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
                      className="w-full p-4 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 rounded-xl focus:outline-none select-text"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Simbol:</span>
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
                          className="px-2 py-1 text-xs font-mono bg-indigo-50/70 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 rounded-md"
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Clean CBT Bottom Navigation Bar */}
              <div className="bg-slate-50/80 dark:bg-slate-800/60 border-t border-slate-200/80 dark:border-slate-800 px-5 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0 || Boolean(examConfig.preventBackNavigation)}
                  title={
                    examConfig.preventBackNavigation
                      ? 'Navigasi mundur dinonaktifkan oleh pengawas'
                      : 'Kembali ke soal sebelumnya'
                  }
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="h-10 inline-flex items-center gap-1.5 px-4 text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>

                <button
                  type="button"
                  onClick={() => toggleDoubtful(currentQuestion.id)}
                  className={`h-10 inline-flex items-center gap-1.5 px-4 text-xs md:text-sm font-semibold rounded-xl border transition-colors ${
                    session.doubtfulIds.includes(currentQuestion.id)
                      ? 'bg-amber-300 border-amber-400 text-amber-950'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300'
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
                    className="h-10 inline-flex items-center gap-1.5 px-5 text-xs md:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
                  >
                    Selanjutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="h-10 inline-flex items-center gap-1.5 px-5 text-xs md:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                  >
                    Kumpulkan Jawaban
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-sm text-slate-500 dark:text-slate-400">
              Belum ada soal tersedia. Guru sedang menyiapkan soal.
            </div>
          )}
        </main>

        {/* Right Column: Pastel CBT Question Number Grid */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
            {renderQuestionBoxes()}
          </div>

          <div className="bg-emerald-50/75 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl p-4 space-y-1.5 text-xs text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2 font-semibold text-emerald-950 dark:text-emerald-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Exam Browser Terproteksi</span>
            </div>
            <p className="leading-relaxed text-emerald-800 dark:text-emerald-300">
              Jangan berpindah tab atau keluar aplikasi. Pelanggaran tercatat:{' '}
              <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                {session.violations.length}
              </strong>
              .
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile Daftar Soal Drawer */}
      {mobileGridOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[2px] lg:hidden">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 h-full overflow-y-auto p-5 space-y-5 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Navigasi Daftar Soal
              </span>
              <button
                type="button"
                onClick={() => setMobileGridOpen(false)}
                className="w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderQuestionBoxes(() => setMobileGridOpen(false))}
          </div>
        </div>
      )}

      {/* Fullscreen Exit Warning & Auto-Lock Blocking Overlay */}
      {fullscreenGraceSeconds !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-3xl shadow-xl p-6 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Peringatan Exam Browser · Ke-{fullscreenExitCount} dari {MAX_FULLSCREEN_WARNINGS}
                </p>
                <h2 className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">
                  Anda Keluar dari Mode Layar Penuh!
                </h2>
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 rounded-xl p-4 flex items-center justify-between gap-4">
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                Segera kembali ke mode layar penuh sebelum hitungan mundur habis, atau sesi ujian akan <strong>dikunci otomatis</strong>.
              </p>
              <div className="shrink-0 w-16 h-16 rounded-xl bg-rose-600 text-white flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-mono tabular-nums leading-none">
                  {fullscreenGraceSeconds}
                </span>
                <span className="text-[10px] font-medium text-rose-100 mt-0.5">
                  detik
                </span>
              </div>
            </div>

            {fullscreenError && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                {fullscreenError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void enterFullscreen()}
              className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
              Kembali ke Layar Penuh Sekarang
            </button>

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
              Keluar layar penuh berulang ({MAX_FULLSCREEN_WARNINGS}x) akan langsung mengunci ujian.
            </p>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4">
          <div className="max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Selesai &amp; Kumpulkan Tryout?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Sudah dijawab:{' '}
              <strong className="font-mono text-emerald-700 dark:text-emerald-400">{answeredCount}</strong>{' '}
              · Belum dijawab:{' '}
              <strong className="font-mono text-rose-700 dark:text-rose-400">{unansweredCount}</strong>.
              Nilai otomatis akan langsung tampil setelah dikumpulkan.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="h-9 px-4 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                onClick={submitExam}
                className="h-9 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progressive Violation Warning Modal */}
      {violationWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-3xl shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Peringatan Pelanggaran · {violationWarningModal.count} dari {violationWarningModal.max}
                </p>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  Aktivitas Mencurigakan Terdeteksi
                </h2>
              </div>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 rounded-xl px-3.5 py-2.5">
              {violationWarningModal.reason}. Jika mencapai batas{' '}
              <strong>{violationWarningModal.max}x</strong>, sesi ujian akan{' '}
              <strong>
                {examConfig.violationPolicy === 'force_submit'
                  ? 'dikumpulkan paksa secara otomatis'
                  : 'dikunci hingga dibuka proktor'}
              </strong>
              .
            </p>
            <button
              type="button"
              onClick={() => setViolationWarningModal(null)}
              className="w-full h-10 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              Saya Mengerti &amp; Lanjutkan Ujian
            </button>
          </div>
        </div>
      )}

      {/* Image Zoom Lightbox */}
      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-[2px] p-4"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setZoomedImageUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center shadow-md hover:bg-indigo-700"
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
