import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  Library,
  LogOut,
  Megaphone,
  Menu,
  OctagonX,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  School,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as XLSX from 'xlsx';
import { BulkQuestionImportModal } from './BulkQuestionImportModal';
import { ExamResultsPdfModal } from './ExamResultsPdfModal';
import { MathText } from './MathText';
import { QuestionEditorModal } from './QuestionEditorModal';
import {
  getDifficultyTone,
  getQuestionDifficulty,
  QuestionStudentPreview,
} from './QuestionStudentPreview';
import { gradeQuestion, isQuestionAnswered } from '../lib/grading';
import { sanitizeImageUrl } from '../lib/imageUpload';
import { exportExamResultsPdf } from '../lib/pdfExport';
import {
  exportQuestionsToXlsx,
  parseStudentsSpreadsheetFile,
  parseTeachersSpreadsheetFile,
} from '../lib/questionImport';
import { playProctorAlert, unlockAudio } from '../lib/sound';
import { createCbtSocket, type ManagedSocket } from '../lib/ws';
import type {
  Announcement,
  ClassRoom,
  ElearningMaterial,
  ExamConfig,
  Question,
  QuestionBank,
  QuestionDifficulty,
  QuestionType,
  ServerSnapshot,
  StudentMaster,
  StudentSession,
  StudentStatus,
  SubjectMaster,
  TeacherMaster,
  UserAccount,
  ViolationLog,
} from '../types/cbt';
import {
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_DIFFICULTY_ORDER,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_SHORT,
  TKA_SD_OFFICIAL_TYPES,
  TKA_SD_SUBJECTS,
} from '../types/cbt';

interface ProctorDashboardProps {
  onExitToPortal: () => void;
}

type NavSection =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'classes'
  | 'subjects'
  | 'exam_cards'
  | 'elearning'
  | 'questions'
  | 'monitoring'
  | 'schedule'
  | 'results'
  | 'announcements'
  | 'users';

const ALL_QUESTION_TYPES: QuestionType[] = TKA_SD_OFFICIAL_TYPES;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getStatusMeta(status: StudentStatus | 'not_started'): {
  label: string;
  textClass: string;
  bgClass: string;
  Icon: React.FC<{ className?: string }>;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Mengerjakan',
        textClass: 'text-emerald-700',
        bgClass: 'bg-emerald-50 border-emerald-200',
        Icon: CheckCircle2,
      };
    case 'suspended':
      return {
        label: 'Ditangguhkan',
        textClass: 'text-amber-700',
        bgClass: 'bg-amber-50 border-amber-200',
        Icon: PauseCircle,
      };
    case 'violation_locked':
      return {
        label: 'Terkunci',
        textClass: 'text-red-700',
        bgClass: 'bg-red-50 border-red-200',
        Icon: ShieldAlert,
      };
    case 'force_stopped':
      return {
        label: 'Dihentikan',
        textClass: 'text-red-800',
        bgClass: 'bg-red-100 border-red-300',
        Icon: OctagonX,
      };
    case 'submitted':
      return {
        label: 'Selesai',
        textClass: 'text-blue-700',
        bgClass: 'bg-blue-50 border-blue-200',
        Icon: CheckCircle2,
      };
    case 'not_started':
      return {
        label: 'Belum Masuk',
        textClass: 'text-slate-500',
        bgClass: 'bg-slate-100 border-slate-200',
        Icon: CircleDashed,
      };
  }
}

export const ProctorDashboard: React.FC<ProctorDashboardProps> = ({
  onExitToPortal,
}) => {
  const [section, setSection] = useState<NavSection>('dashboard');
  const [dataMasterOpen, setDataMasterOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [masterStudents, setMasterStudents] = useState<StudentMaster[]>([]);
  const [masterTeachers, setMasterTeachers] = useState<TeacherMaster[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<SubjectMaster[]>([]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [materials, setMaterials] = useState<ElearningMaterial[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [questionBankTab, setQuestionBankTab] = useState<'catalog' | 'banks'>('catalog');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuestionTarget, setPreviewQuestionTarget] = useState<{
    question: Question;
    indexNumber: number;
  } | null>(null);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [importQuestionsOpen, setImportQuestionsOpen] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionType | 'all'>('all');
  const [questionSubjectFilter, setQuestionSubjectFilter] = useState<string>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<
    QuestionDifficulty | 'all'
  >('all');
  const [catalogBankFilter, setCatalogBankFilter] = useState<string>('all');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<'all' | 'in_active' | 'not_in_active'>('all');
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [assignTargetBankId, setAssignTargetBankId] = useState<string>('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [weightsModalOpen, setWeightsModalOpen] = useState(false);
  const [weightsDraft, setWeightsDraft] = useState<Record<string, number>>({});

  const [liveAlert, setLiveAlert] = useState<ViolationLog | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState<
    StudentStatus | 'not_started' | 'all'
  >('all');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [nowClock, setNowClock] = useState(() => new Date());
  const [trendViewMode, setTrendViewMode] = useState<'students' | 'weekly'>('students');

  const [inspectedStudentId, setInspectedStudentId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [confirmForceStopTarget, setConfirmForceStopTarget] =
    useState<StudentSession | null>(null);

  // Modals for Master Data & Bank Soal
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentMaster | null>(null);
  const [stuForm, setStuForm] = useState({ name: '', nis: '', kelas: 'KELAS 6 A', phone: '' });
  const [importStudentsOpen, setImportStudentsOpen] = useState(false);
  const [importStudentsText, setImportStudentsText] = useState('');

  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherMaster | null>(null);
  const [teaForm, setTeaForm] = useState({
    name: '',
    nip: '',
    subjects: 'Matematika — Bilangan, Bahasa Indonesia — Teks Informasi',
    classes: 'KELAS 6 A, KELAS 6 B',
    phone: '',
  });
  const teacherFileInputRef = useRef<HTMLInputElement | null>(null);
  const studentFileInputRef = useRef<HTMLInputElement | null>(null);

  const [classForm, setClassForm] = useState({ name: '', level: 'Tingkat 6 SD', homeroomTeacher: '' });
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', category: 'Numerasi TKA SD' });
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    code: '',
    name: '',
    subject: 'Matematika',
    targetClass: 'KELAS 6 A',
    pg: 15,
    tf: 5,
    mcma: 10,
  });
  const [materialForm, setMaterialForm] = useState({ title: '', subject: 'Matematika', targetClass: 'KELAS 6', summary: '', content: '' });
  const [userForm, setUserForm] = useState({ name: '', username: '', role: 'guru' as 'admin' | 'guru' | 'proktor' });
  const [annForm, setAnnForm] = useState({ title: '', content: '' });

  const socketRef = useRef<ManagedSocket | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const id = window.setInterval(() => setNowClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sock = createCbtSocket({
      onOpen: (ws) => {
        ws.send(JSON.stringify({ type: 'proctor:join' }));
      },
      onStatusChange: (connected) => setWsConnected(connected),
      onMessage: (data) => {
        if (data.type === 'state:snapshot') {
          const snap = data.snapshot as ServerSnapshot;
          setExamConfig(snap.examConfig);
          setQuestions(snap.questions);
          setSessions(snap.sessions);
          setViolations(snap.recentViolations);
          setMasterStudents(snap.masterStudents || []);
          setMasterTeachers(snap.masterTeachers || []);
          setClasses(snap.classes || []);
          setSubjects(snap.subjects || []);
          setQuestionBanks(snap.questionBanks || []);
          setMaterials(snap.materials || []);
          setUsers(snap.users || []);
          setAnnouncements(snap.announcements || []);
          return;
        }
        if (data.type === 'session:updated') {
          const updated = data.session as StudentSession;
          setSessions((prev) => {
            const exists = prev.some((s) => s.id === updated.id);
            if (!exists) return [updated, ...prev];
            return prev.map((s) => (s.id === updated.id ? updated : s));
          });
          return;
        }
        if (data.type === 'violation:alert') {
          const violation = data.violation as ViolationLog;
          const updated = data.session as StudentSession;
          setViolations((prev) => [violation, ...prev].slice(0, 50));
          setLiveAlert(violation);
          setSessions((prev) => {
            const exists = prev.some((s) => s.id === updated.id);
            if (!exists) return [updated, ...prev];
            return prev.map((s) => (s.id === updated.id ? updated : s));
          });
          if (soundEnabledRef.current) {
            playProctorAlert();
          }
          return;
        }
        if (data.type === 'exam:updated') {
          setExamConfig(data.examConfig as ExamConfig);
          return;
        }
        if (data.type === 'questions:updated') {
          setQuestions(data.questions as Question[]);
          return;
        }
        if (data.type === 'banks:updated') {
          setQuestionBanks((data.questionBanks as QuestionBank[]) || []);
          return;
        }
        if (data.type === 'announcements:updated') {
          setAnnouncements((data.announcements as Announcement[]) || []);
        }
      },
    });

    socketRef.current = sock;
    return () => {
      sock.close();
      socketRef.current = null;
    };
  }, []);

  const activeBank = useMemo(
    () => questionBanks.find((b) => b.isActive) || questionBanks[0] || null,
    [questionBanks]
  );

  // Merged list of Subjects across Data Master, TKA SD defaults, and existing questions
  const availableSubjects = useMemo(() => {
    const set = new Set<string>([...TKA_SD_SUBJECTS]);
    subjects.forEach((s) => {
      if (s.name.trim()) set.add(s.name.trim());
    });
    questions.forEach((q) => {
      if (q.subject.trim()) set.add(q.subject.trim());
    });
    return Array.from(set);
  }, [subjects, questions]);

  // Active exam questions (from active bank)
  const activeExamQuestions = useMemo(() => {
    if (!activeBank) return questions;
    return questions.filter((q) => !q.bankId || q.bankId === activeBank.id);
  }, [questions, activeBank]);

  // Questions inside currently selected bank (for Bank Soal detail view)
  const currentBankQuestions = useMemo(() => {
    if (!selectedBankId) return activeExamQuestions;
    return questions.filter((q) => !q.bankId || q.bankId === selectedBankId);
  }, [questions, selectedBankId, activeExamQuestions]);

  const filteredBankQuestions = useMemo(() => {
    return currentBankQuestions.filter((q) => {
      if (questionTypeFilter !== 'all' && q.type !== questionTypeFilter) return false;
      if (questionSubjectFilter !== 'all' && q.subject !== questionSubjectFilter) return false;
      if (
        questionDifficultyFilter !== 'all' &&
        getQuestionDifficulty(q) !== questionDifficultyFilter
      ) {
        return false;
      }
      if (questionSearch.trim()) {
        const term = questionSearch.toLowerCase();
        return (
          q.prompt.toLowerCase().includes(term) ||
          q.subject.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [
    currentBankQuestions,
    questionTypeFilter,
    questionSubjectFilter,
    questionDifficultyFilter,
    questionSearch,
  ]);

  // Cross-bank Question Repository Catalog (for Question Bank Management)
  const filteredCatalogQuestions = useMemo(() => {
    return questions.filter((q) => {
      const qBankId = q.bankId || activeBank?.id || '';
      const isInActive = Boolean(activeBank && (!q.bankId || q.bankId === activeBank.id));
      if (questionTypeFilter !== 'all' && q.type !== questionTypeFilter) return false;
      if (questionSubjectFilter !== 'all' && q.subject !== questionSubjectFilter) return false;
      if (
        questionDifficultyFilter !== 'all' &&
        getQuestionDifficulty(q) !== questionDifficultyFilter
      ) {
        return false;
      }
      if (catalogBankFilter !== 'all' && qBankId !== catalogBankFilter) return false;
      if (catalogStatusFilter === 'in_active' && !isInActive) return false;
      if (catalogStatusFilter === 'not_in_active' && isInActive) return false;
      if (questionSearch.trim()) {
        const term = questionSearch.toLowerCase();
        return (
          q.prompt.toLowerCase().includes(term) ||
          q.subject.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [
    questions,
    activeBank,
    questionTypeFilter,
    questionSubjectFilter,
    questionDifficultyFilter,
    catalogBankFilter,
    catalogStatusFilter,
    questionSearch,
  ]);

  const difficultyBreakdown = useMemo(() => {
    const source = selectedBankId ? currentBankQuestions : questions;
    return {
      easy: source.filter((q) => getQuestionDifficulty(q) === 'easy').length,
      medium: source.filter((q) => getQuestionDifficulty(q) === 'medium').length,
      hard: source.filter((q) => getQuestionDifficulty(q) === 'hard').length,
    };
  }, [selectedBankId, currentBankQuestions, questions]);

  const filteredStudents = useMemo(() => {
    return masterStudents.filter((s) => {
      if (studentClassFilter !== 'all' && s.kelas !== studentClassFilter) return false;
      if (studentSearch.trim()) {
        const term = studentSearch.toLowerCase();
        return (
          s.name.toLowerCase().includes(term) ||
          s.nis.toLowerCase().includes(term) ||
          s.kelas.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [masterStudents, studentClassFilter, studentSearch]);

  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return masterTeachers;
    const term = teacherSearch.toLowerCase();
    return masterTeachers.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.nip.toLowerCase().includes(term) ||
        t.subjects.some((s) => s.toLowerCase().includes(term))
    );
  }, [masterTeachers, teacherSearch]);

  const inspectedStudent = useMemo(
    () => sessions.find((s) => s.id === inspectedStudentId) || null,
    [sessions, inspectedStudentId]
  );

  // Unified real-time student monitoring rows: merges live WebSocket sessions + registered masterStudents
  type UnifiedMonitorRow = {
    key: string;
    name: string;
    nis: string;
    kelas: string;
    session: StudentSession | null;
    status: StudentStatus | 'not_started';
    answered: number;
    total: number;
    percent: number;
    byType: Record<QuestionType, { answered: number; total: number }>;
  };

  const unifiedRows = useMemo<UnifiedMonitorRow[]>(() => {
    const typeTotals: Record<QuestionType, number> = {
      multiple_choice: 0,
      complex_multiple_choice: 0,
      mcma: 0,
      matching: 0,
      true_false: 0,
      essay: 0,
    };
    for (const q of activeExamQuestions) {
      typeTotals[q.type] += 1;
    }

    const sessionByNis = new Map<string, StudentSession>();
    for (const s of sessions) {
      sessionByNis.set(s.nis, s);
    }

    const rows: UnifiedMonitorRow[] = [];

    const buildRow = (
      key: string,
      name: string,
      nis: string,
      kelas: string,
      session: StudentSession | null
    ): UnifiedMonitorRow => {
      const byType: Record<QuestionType, { answered: number; total: number }> = {
        multiple_choice: { answered: 0, total: typeTotals.multiple_choice },
        complex_multiple_choice: { answered: 0, total: typeTotals.complex_multiple_choice },
        mcma: { answered: 0, total: typeTotals.mcma },
        matching: { answered: 0, total: typeTotals.matching },
        true_false: { answered: 0, total: typeTotals.true_false },
        essay: { answered: 0, total: typeTotals.essay },
      };

      let answered = 0;
      if (session) {
        for (const q of activeExamQuestions) {
          if (isQuestionAnswered(q, session.answers[q.id])) {
            answered += 1;
            byType[q.type].answered += 1;
          }
        }
      }
      const total = activeExamQuestions.length;
      const percent = total > 0 ? Math.round((answered / total) * 100) : 0;

      return {
        key,
        name,
        nis,
        kelas,
        session,
        status: session ? session.status : 'not_started',
        answered,
        total,
        percent,
        byType,
      };
    };

    for (const s of sessions) {
      const ms = masterStudents.find((m) => m.nis === s.nis);
      rows.push(buildRow(s.id, s.name, s.nis, ms?.kelas || 'Peserta Langsung', s));
    }

    for (const ms of masterStudents) {
      const matchedSession = sessionByNis.get(ms.nis);
      if (!matchedSession) {
        rows.push(buildRow(ms.id, ms.name, ms.nis, ms.kelas, null));
      }
    }

    return rows.filter((r) => {
      if (monitoringStatusFilter !== 'all' && r.status !== monitoringStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.nis.toLowerCase().includes(q) ||
          r.kelas.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sessions, masterStudents, activeExamQuestions, searchQuery, monitoringStatusFilter]);

  const metrics = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'active').length;
    const paused = sessions.filter(
      (s) => s.status === 'suspended' || s.status === 'violation_locked'
    ).length;
    const finished = sessions.filter(
      (s) => s.status === 'submitted' || s.status === 'force_stopped'
    ).length;
    const totalViolations = sessions.reduce((sum, s) => sum + s.violations.length, 0);
    return { active, paused, finished, totalViolations };
  }, [sessions]);

  const sendCommand = (payload: unknown) => {
    socketRef.current?.send(payload);
  };

  // Bank & Question CRUD
  const handleSaveQuestion = async (q: Question) => {
    const isEdit = questions.some((existing) => existing.id === q.id);
    const payload = {
      ...q,
      bankId: q.bankId || selectedBankId || assignTargetBankId || activeBank?.id || undefined,
    };
    await fetch(isEdit ? `/api/questions/${q.id}` : '/api/questions', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setEditorOpen(false);
    setEditingQuestion(null);
  };

  const handleQuickCategorizeQuestion = async (
    q: Question,
    patch: Partial<Pick<Question, 'subject' | 'difficulty'>>
  ) => {
    await fetch(`/api/questions/${q.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...q, ...patch }),
    });
  };

  const handleAssignQuestionToBank = async (
    questionId: string,
    targetId?: string
  ) => {
    const finalTargetId = targetId || assignTargetBankId || activeBank?.id;
    if (!finalTargetId) return;
    const res = await fetch(`/api/questions/${questionId}/assign-bank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetBankId: finalTargetId, mode: 'copy' }),
    });
    const data = await res.json().catch(() => ({}));
    const targetBank = questionBanks.find((b) => b.id === finalTargetId);
    if (data.alreadyInBank) {
      setImportToast(`Soal sudah ada di ${targetBank?.name || 'ujian aktif'}.`);
    } else {
      setImportToast(`Soal berhasil dimasukkan ke "${targetBank?.name || 'Ujian Aktif'}".`);
    }
  };

  const handleBatchAssignToBank = async () => {
    const finalTargetId = assignTargetBankId || activeBank?.id;
    if (!finalTargetId || selectedCatalogIds.length === 0) return;
    const res = await fetch('/api/questions/assign-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionIds: selectedCatalogIds,
        targetBankId: finalTargetId,
        mode: 'copy',
      }),
    });
    const data = await res.json().catch(() => ({}));
    const targetBank = questionBanks.find((b) => b.id === finalTargetId);
    setSelectedCatalogIds([]);
    setImportToast(
      `${data.assignedCount ?? 0} soal berhasil dimasukkan ke "${targetBank?.name || 'Ujian Aktif'}".`
    );
  };

  const handleDeleteQuestion = async (id: string) => {
    await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    setSelectedCatalogIds((prev) => prev.filter((item) => item !== id));
  };

  const handleDuplicateQuestion = async (q: Question) => {
    const clone: Question = {
      ...structuredClone(q),
      id: `q-dup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    };
    await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clone),
    });
  };

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/questions/weights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: weightsDraft }),
    });
    setWeightsModalOpen(false);
  };

  const handleExportQuestions = (format: 'xlsx' | 'json' | 'csv' | 'doc') => {
    setExportMenuOpen(false);
    const dateStr = new Date().toISOString().slice(0, 10);
    const exportList = currentBankQuestions;

    if (format === 'xlsx') {
      const bankCode =
        questionBanks.find((b) => b.id === selectedBankId)?.code || 'bank-soal-tka-sd';
      exportQuestionsToXlsx(exportList, bankCode.toLowerCase());
      return;
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify({ examConfig, questions: exportList }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-soal-tka-sd-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (format === 'csv') {
      const rows = [
        ['No', 'Jenis Soal', 'Mata Pelajaran', 'Bobot Poin', 'Pertanyaan', 'Kunci/Referensi'],
        ...exportList.map((q, idx) => {
          let keyInfo = '';
          if (q.type === 'multiple_choice') keyInfo = q.correctOptionId;
          else if (q.type === 'complex_multiple_choice' || q.type === 'mcma') keyInfo = q.correctOptionIds.join(';');
          else if (q.type === 'matching') keyInfo = q.pairs.map((p) => `${p.left}=${p.right}`).join('; ');
          else if (q.type === 'true_false') keyInfo = q.statements.map((s) => `${s.text} (${s.isTrue ? 'Benar' : 'Salah'})`).join('; ');
          else keyInfo = q.sampleAnswer;

          return [
            String(idx + 1),
            QUESTION_TYPE_LABELS[q.type],
            q.subject,
            String(q.points),
            q.prompt.replace(/\n/g, ' '),
            keyInfo.replace(/\n/g, ' '),
          ];
        }),
      ];
      const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-soal-tka-sd-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const htmlBody = exportList
      .map((q, idx) => {
        let extra = '';
        if (
          q.type === 'multiple_choice' ||
          q.type === 'complex_multiple_choice' ||
          q.type === 'mcma'
        ) {
          extra = `<ul>${q.options
            .map((o, oi) => `<li><strong>${String.fromCharCode(65 + oi)}.</strong> ${o.text}</li>`)
            .join('')}</ul>`;
        } else if (q.type === 'matching') {
          extra = `<ul>${q.pairs.map((p) => `<li>${p.left} &rarr; ${p.right}</li>`).join('')}</ul>`;
        } else if (q.type === 'true_false') {
          extra = `<ul>${q.statements
            .map((s) => `<li>${s.text} [<strong>${s.isTrue ? 'Benar' : 'Salah'}</strong>]</li>`)
            .join('')}</ul>`;
        } else {
          extra = `<p><em>Kata Kunci:</em> ${q.expectedKeywords.join(', ')}</p>`;
        }
        return `<div style="margin-bottom:16px;">
          <p><strong>${idx + 1}. (${QUESTION_TYPE_LABELS[q.type]} · ${q.subject} · ${q.points} poin)</strong></p>
          <p>${q.prompt.replace(/\n/g, '<br/>')}</p>
          ${extra}
        </div>`;
      })
      .join('');

    const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${examConfig?.title || 'Bank Soal'}</title></head><body style="font-family:Arial,sans-serif;line-height:1.5;"><h2>${examConfig?.title || 'Bank Soal Tryout TKA SD'}</h2><hr/>${htmlBody}</body></html>`;
    const blob = new Blob([docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naskah-soal-tka-sd-${dateStr}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Master CRUD Handlers
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuForm.name.trim() || !stuForm.nis.trim()) return;
    if (editingStudent) {
      await fetch(`/api/master/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stuForm),
      });
    } else {
      await fetch('/api/master/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stuForm),
      });
    }
    setStudentModalOpen(false);
    setEditingStudent(null);
  };

  const handleImportStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    const students = importStudentsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, nis, kelas, phone] = line.split(',').map((s) => s.trim());
        return { name, nis, kelas: kelas || 'KELAS 6 A', phone: phone || '-' };
      })
      .filter((s) => s.name && s.nis);
    if (students.length === 0) return;
    await fetch('/api/master/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    });
    setImportStudentsText('');
    setImportStudentsOpen(false);
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teaForm.name.trim() || !teaForm.nip.trim()) return;
    const payload = {
      name: teaForm.name.trim(),
      nip: teaForm.nip.trim(),
      subjects: teaForm.subjects.split(',').map((s) => s.trim()).filter(Boolean),
      classes: teaForm.classes.split(',').map((s) => s.trim()).filter(Boolean),
      phone: teaForm.phone.trim() || '-',
    };
    if (editingTeacher) {
      await fetch(`/api/master/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/master/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setTeacherModalOpen(false);
    setEditingTeacher(null);
  };

  const handleStudentsFileUpload = async (file: File) => {
    const parsed = await parseStudentsSpreadsheetFile(file);
    if (parsed.length === 0) return;
    await fetch('/api/master/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: parsed }),
    });
    setImportToast(`${parsed.length} data siswa berhasil diimpor dari ${file.name}.`);
  };

  const handleTeachersFileUpload = async (file: File) => {
    const parsed = await parseTeachersSpreadsheetFile(file);
    if (parsed.length === 0) return;
    await fetch('/api/master/teachers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teachers: parsed }),
    });
    setImportToast(`${parsed.length} data guru berhasil diimpor dari ${file.name}.`);
  };

  const handleUpdateConfig = async (patch: Partial<ExamConfig>) => {
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const exportExcelScores = () => {
    const rows = [
      ['Nama Murid', 'NIS', 'Status', 'Progres Soal', 'Pelanggaran', 'Poin', 'Maks Poin', 'Nilai Akhir', 'Keterangan KKM'],
      ...sessions.map((s) => {
        const answered = activeExamQuestions.filter((q) =>
          isQuestionAnswered(q, s.answers[q.id])
        ).length;
        const kkm = examConfig?.kkm ?? 75;
        const score = s.gradeSummary?.totalScore;
        return [
          s.name,
          s.nis,
          getStatusMeta(s.status).label,
          `${answered}/${activeExamQuestions.length}`,
          s.violations.length,
          s.gradeSummary ? s.gradeSummary.earnedPoints : 0,
          s.gradeSummary ? s.gradeSummary.maxPoints : 0,
          score !== undefined ? score : '-',
          score !== undefined ? (score >= kkm ? 'Tuntas' : 'Belum Tuntas') : '-',
        ];
      }),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Rekap_Nilai');
    XLSX.writeFile(
      wb,
      `rekap-nilai-tryout-tka-sd-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const exportCsvScores = () => {
    const rows = [
      ['Nama Murid', 'NIS', 'Status', 'Progres Soal', 'Pelanggaran', 'Nilai Akhir'],
      ...sessions.map((s) => {
        const answered = activeExamQuestions.filter((q) =>
          isQuestionAnswered(q, s.answers[q.id])
        ).length;
        return [
          s.name,
          s.nis,
          getStatusMeta(s.status).label,
          `${answered}/${activeExamQuestions.length}`,
          String(s.violations.length),
          s.gradeSummary ? String(s.gradeSummary.totalScore) : '-',
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-nilai-tryout-tka-sd-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navTo = (target: NavSection) => {
    setSection(target);
    if (target !== 'questions') setSelectedBankId(null);
    setMobileSidebarOpen(false);
  };

  const renderSidebarContent = () => {
    const getMenuItemClasses = (active: boolean) =>
      `w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-xs'
          : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
      }`;

    const getIconClasses = (active: boolean, semanticColor: string) =>
      `w-4 h-4 shrink-0 transition-colors ${active ? 'text-white' : semanticColor}`;

    const getCountClasses = (active: boolean) =>
      `text-[11px] font-mono tabular-nums font-semibold ${
        active ? 'text-blue-100' : 'text-slate-400'
      }`;

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Top Sidebar Brand Header (h-16 aligns cleanly with main topbar) */}
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight truncate">
                CBT Online
              </p>
              <p className="text-[11px] font-medium text-slate-500 leading-tight truncate">
                Tryout TKA SD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Tutup Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MENU UTAMA (Always Open, Clean Semantic Color Icons) */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-0.5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Menu Utama
          </p>

          <button
            type="button"
            onClick={() => navTo('dashboard')}
            className={getMenuItemClasses(section === 'dashboard')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <BarChart3 className={getIconClasses(section === 'dashboard', 'text-blue-600')} />
              <span className="truncate">Dashboard</span>
            </span>
          </button>

          <div>
            <button
              type="button"
              onClick={() => setDataMasterOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Database className="w-4 h-4 shrink-0 text-indigo-600" />
                <span>Data Master</span>
              </span>
              {dataMasterOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {dataMasterOpen && (
              <div className="mt-0.5 pl-4 space-y-0.5">
                <button
                  type="button"
                  onClick={() => navTo('students')}
                  className={getMenuItemClasses(section === 'students')}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Users className={getIconClasses(section === 'students', 'text-sky-600')} />
                    <span className="truncate">Data Siswa</span>
                  </span>
                  <span className={getCountClasses(section === 'students')}>
                    {masterStudents.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navTo('teachers')}
                  className={getMenuItemClasses(section === 'teachers')}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <GraduationCap
                      className={getIconClasses(section === 'teachers', 'text-emerald-600')}
                    />
                    <span className="truncate">Data Guru</span>
                  </span>
                  <span className={getCountClasses(section === 'teachers')}>
                    {masterTeachers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navTo('classes')}
                  className={getMenuItemClasses(section === 'classes')}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <School className={getIconClasses(section === 'classes', 'text-teal-600')} />
                    <span className="truncate">Data Kelas</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navTo('subjects')}
                  className={getMenuItemClasses(section === 'subjects')}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Library className={getIconClasses(section === 'subjects', 'text-cyan-600')} />
                    <span className="truncate">Mata Pelajaran</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navTo('exam_cards')}
            className={getMenuItemClasses(section === 'exam_cards')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <CreditCard
                className={getIconClasses(section === 'exam_cards', 'text-amber-500')}
              />
              <span className="truncate">Peserta Ujian</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('elearning')}
            className={getMenuItemClasses(section === 'elearning')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FileText
                className={getIconClasses(section === 'elearning', 'text-fuchsia-600')}
              />
              <span className="truncate">E-Learning</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('questions')}
            className={getMenuItemClasses(section === 'questions')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <BookOpen className={getIconClasses(section === 'questions', 'text-violet-600')} />
              <span className="truncate">Bank Soal</span>
            </span>
            <span className={getCountClasses(section === 'questions')}>
              {questions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('monitoring')}
            className={getMenuItemClasses(section === 'monitoring')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Activity className={getIconClasses(section === 'monitoring', 'text-orange-500')} />
              <span className="truncate">Status Peserta</span>
            </span>
            <span className={getCountClasses(section === 'monitoring')}>
              {sessions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('schedule')}
            className={getMenuItemClasses(section === 'schedule')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <CalendarClock
                className={getIconClasses(section === 'schedule', 'text-rose-600')}
              />
              <span className="truncate">Menu Ujian</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('results')}
            className={getMenuItemClasses(section === 'results')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FileSpreadsheet
                className={getIconClasses(section === 'results', 'text-emerald-600')}
              />
              <span className="truncate">Nilai &amp; Cetak</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navTo('announcements')}
            className={getMenuItemClasses(section === 'announcements')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Megaphone
                className={getIconClasses(section === 'announcements', 'text-amber-600')}
              />
              <span className="truncate">Pengumuman</span>
            </span>
            <span className={getCountClasses(section === 'announcements')}>
              {announcements.length}
            </span>
          </button>

          <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pengaturan Sistem
          </p>

          <button
            type="button"
            onClick={() => navTo('users')}
            className={getMenuItemClasses(section === 'users')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <UserCog className={getIconClasses(section === 'users', 'text-slate-600')} />
              <span className="truncate">Manajemen User</span>
            </span>
          </button>
        </nav>

        <div className="p-3 border-t border-slate-200 bg-white space-y-2.5 shrink-0">
          <a
            href="?role=student"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-9 inline-flex items-center justify-center px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap"
          >
            Buka Exam Browser Siswa ↗
          </a>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navTo('schedule')}
              className={`h-9 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
                section === 'schedule'
                  ? 'bg-cyan-600 border-cyan-600 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span>Pengaturan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('cbt_proctor_authed');
                onExitToPortal();
              }}
              className="h-9 px-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-0.5">
            <span>Sinkronisasi</span>
            <span
              className={`font-medium ${
                wsConnected ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {wsConnected ? 'Real-Time Aktif' : 'Menghubungkan...'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const completionTrendData = useMemo<
    Array<{
      name: string;
      fullName: string;
      penyelesaian: number;
      skor: number;
      partisipasi: number;
    }>
  >(() => {
    const avgLiveCompletion =
      unifiedRows.length > 0
        ? Math.round(
            unifiedRows.reduce((sum, r) => sum + r.percent, 0) / unifiedRows.length
          )
        : 0;

    if (trendViewMode === 'weekly') {
      const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Hari Ini'];
      const fullLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Hari Ini (Real-Time)'];
      const histCompletion = [42, 56, 61, 68, 74, 79, avgLiveCompletion];
      const histParticipants = [18, 24, 29, 34, 41, 38, Math.max(sessions.length, unifiedRows.length)];
      return labels.map((label, i) => ({
        name: label,
        fullName: fullLabels[i],
        penyelesaian: histCompletion[i],
        skor: 0,
        partisipasi: histParticipants[i],
      }));
    }

    if (unifiedRows.length === 0) {
      return [
        {
          name: 'Belum Ada',
          fullName: 'Belum ada peserta terdaftar',
          penyelesaian: 0,
          skor: 0,
          partisipasi: 0,
        },
      ];
    }

    return unifiedRows.slice(0, 12).map((row) => {
      const s = row.session;
      let scorePct = 0;
      if (s && activeExamQuestions.length > 0) {
        const earned = activeExamQuestions.reduce(
          (sum, q) =>
            sum +
            gradeQuestion(
              q,
              s.answers[q.id],
              q.type === 'essay' ? s.manualEssayOverrides?.[q.id] : undefined
            ).earnedPoints,
          0
        );
        const maxPts = activeExamQuestions.reduce((sum, q) => sum + q.points, 0);
        scorePct = maxPts > 0 ? Math.round((earned / maxPts) * 100) : 0;
      }
      return {
        name: row.name.split(' ')[0],
        fullName: `${row.name} (${row.nis})`,
        penyelesaian: row.percent,
        skor: scorePct,
        partisipasi: 0,
      };
    });
  }, [trendViewMode, unifiedRows, sessions.length, activeExamQuestions]);

  const questionTypeStats = useMemo(() => {
    return ALL_QUESTION_TYPES.map((qt) => {
      const qs = activeExamQuestions.filter((q) => q.type === qt);
      const questionCount = qs.length;
      const totalPoints = qs.reduce((sum, q) => sum + q.points, 0);

      if (questionCount === 0 || sessions.length === 0) {
        return {
          type: qt,
          short: QUESTION_TYPE_SHORT[qt],
          label: QUESTION_TYPE_LABELS[qt],
          questionCount,
          totalPoints,
          completionRate: 0,
          accuracyRate: 0,
        };
      }

      let answeredSlots = 0;
      const totalSlots = questionCount * sessions.length;
      let earnedSum = 0;
      let maxSum = 0;

      for (const s of sessions) {
        for (const q of qs) {
          const ans = s.answers[q.id];
          if (isQuestionAnswered(q, ans)) {
            answeredSlots += 1;
          }
          const g = gradeQuestion(
            q,
            ans,
            q.type === 'essay' ? s.manualEssayOverrides?.[q.id] : undefined
          );
          earnedSum += g.earnedPoints;
          maxSum += g.maxPoints;
        }
      }

      return {
        type: qt,
        short: QUESTION_TYPE_SHORT[qt],
        label: QUESTION_TYPE_LABELS[qt],
        questionCount,
        totalPoints,
        completionRate: totalSlots > 0 ? Math.round((answeredSlots / totalSlots) * 100) : 0,
        accuracyRate: maxSum > 0 ? Math.round((earnedSum / maxSum) * 100) : 0,
      };
    });
  }, [activeExamQuestions, sessions]);

  const avgCompletionPercent = useMemo(() => {
    if (unifiedRows.length === 0) return 0;
    return Math.round(
      unifiedRows.reduce((sum, r) => sum + r.percent, 0) / unifiedRows.length
    );
  }, [unifiedRows]);

  const finishedCount100 = useMemo(
    () => unifiedRows.filter((r) => r.percent === 100).length,
    [unifiedRows]
  );

  const dateFormatted = nowClock.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFormatted = nowClock.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Always-Open Sidebar on Tablet/Desktop (md+) */}
      <aside className="hidden md:block w-64 border-r border-slate-200 bg-white shrink-0 sticky top-0 h-screen no-print">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-900/50 no-print">
          <div className="w-64 h-full bg-white shadow-xl">
            {renderSidebarContent()}
          </div>
          <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 min-w-0 flex flex-col ${pdfExportOpen ? 'no-print' : ''}`}>
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 md:px-6 h-16 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden w-9 h-9 inline-flex items-center justify-center text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl shrink-0"
              aria-label="Buka Menu Utama"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 leading-tight">Selamat Datang,</p>
              <p className="text-sm font-bold text-slate-900 truncate leading-tight mt-0.5">
                Guru &amp; Administrator Utama
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden lg:inline text-xs text-slate-500 mr-1">
              {dateFormatted}
            </span>
            <span className="h-9 px-3.5 inline-flex items-center bg-blue-600 text-white text-xs font-mono tabular-nums font-semibold rounded-xl whitespace-nowrap">
              {timeFormatted} WIB
            </span>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setSoundEnabled((v) => !v);
              }}
              className="w-9 h-9 inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors shrink-0"
              title="Toggle suara notifikasi"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-blue-600" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        </header>

        {/* Live Violation Alert */}
        {liveAlert && (
          <div className="px-4 md:px-6 pt-4">
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-900">
                    Pelanggaran: {liveAlert.studentName} ({liveAlert.nis})
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    {liveAlert.reason} ·{' '}
                    {new Date(liveAlert.timestamp).toLocaleTimeString('id-ID')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sendCommand({
                      type: 'proctor:unlock_violation',
                      studentId: liveAlert.studentId,
                    });
                    setLiveAlert(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-100"
                >
                  Buka Kunci
                </button>
                <button
                  type="button"
                  onClick={() => setLiveAlert(null)}
                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast feedback for imports & actions */}
        {importToast && (
          <div className="px-4 md:px-6 pt-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs font-medium text-emerald-800">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {importToast}
              </span>
              <button
                type="button"
                onClick={() => setImportToast(null)}
                className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 1. DASHBOARD OVERVIEW */}
        {section === 'dashboard' && (
          <main className="p-4 md:p-6 space-y-6 max-w-[1440px] w-full mx-auto">
            {/* Subtle Session Context Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
              <p>
                <span className="font-semibold text-slate-800">
                  {examConfig?.schoolName || 'CBT Online'}
                </span>
                {' · '}
                Sesi Aktif: {examConfig?.title}
              </p>
              <p className="text-slate-500">
                Token Sesi:{' '}
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {examConfig?.sessionCode}
                </span>
              </p>
            </div>

            {/* Clean, Spacious Hero Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 rounded-2xl p-6 md:p-7 text-white shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                    CBT Online · Tryout TKA SD
                  </h1>
                  <p className="text-sm text-blue-100 mt-0.5">
                    Ujian Digital, Prestasi Maksimal · Literasi &amp; Numerasi SD
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSection('questions')}
                  className="h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold bg-white text-blue-700 hover:bg-blue-50 rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-4 h-4" />
                  Kelola Bank Soal
                </button>
                <button
                  type="button"
                  onClick={() => setImportQuestionsOpen(true)}
                  className="h-10 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import Soal Excel/CSV
                </button>
              </div>
            </div>

            {/* 4 Balanced Gradient KPI Cards with Visual Icon Anchors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setSection('students')}
                className="text-left rounded-2xl p-5 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-blue-100">Total Siswa</p>
                  <p className="mt-1 text-3xl font-bold font-mono tabular-nums leading-none">
                    {masterStudents.length}
                  </p>
                  <p className="mt-2 text-xs text-blue-100/90 truncate">
                    Terdaftar di {classes.length} kelas
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSection('teachers')}
                className="text-left rounded-2xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-emerald-100">Total Guru</p>
                  <p className="mt-1 text-3xl font-bold font-mono tabular-nums leading-none">
                    {masterTeachers.length}
                  </p>
                  <p className="mt-2 text-xs text-emerald-100/90 truncate">
                    {subjects.length} mata pelajaran
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSection('questions')}
                className="text-left rounded-2xl p-5 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-violet-100">Bank Soal</p>
                  <p className="mt-1 text-3xl font-bold font-mono tabular-nums leading-none">
                    {questionBanks.length}
                  </p>
                  <p className="mt-2 text-xs text-violet-100/90 truncate">
                    {questions.length} butir soal tersedia
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSection('monitoring')}
                className="text-left rounded-2xl p-5 bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-orange-100">Ujian Aktif</p>
                  <p className="mt-1 text-3xl font-bold font-mono tabular-nums leading-none">
                    {metrics.active}
                  </p>
                  <p className="mt-2 text-xs text-orange-100/90 truncate">
                    {metrics.finished} selesai · {metrics.totalViolations} pelanggaran
                  </p>
                </div>
              </button>
            </div>

            {/* Compact Quick-Jump Menu on Mobile Only (since sidebar is always open on md+) */}
            <div className="md:hidden bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Menu Utama
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="text-xs font-semibold text-blue-600"
                >
                  Semua Menu →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navTo('questions')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-800"
                >
                  <BookOpen className="w-4 h-4 text-violet-600 shrink-0" />
                  <span className="truncate">Bank Soal</span>
                </button>
                <button
                  type="button"
                  onClick={() => navTo('monitoring')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-800"
                >
                  <Activity className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="truncate">Status Peserta</span>
                </button>
                <button
                  type="button"
                  onClick={() => navTo('schedule')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-800"
                >
                  <CalendarClock className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="truncate">Menu Ujian</span>
                </button>
                <button
                  type="button"
                  onClick={() => navTo('results')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-800"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Nilai &amp; Cetak</span>
                </button>
              </div>
            </div>

            {/* Row 1 Charts: Student Completion Trends (Recharts AreaChart) + Announcements */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Tren Penyelesaian Siswa
                    </h2>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      Rata-rata: {avgCompletionPercent}% · Tuntas 100%: {finishedCount100}/{unifiedRows.length} siswa
                    </p>
                  </div>
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTrendViewMode('students')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        trendViewMode === 'students'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Progres Peserta
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendViewMode('weekly')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        trendViewMode === 'weekly'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      7 Hari Terakhir
                    </button>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={completionTrendData}
                      margin={{ top: 10, right: trendViewMode === 'weekly' ? 4 : 12, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="cbtCompletionGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="cbtScoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={{ stroke: '#E2E8F0' }}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      {trendViewMode === 'weekly' && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: '#0284C7' }}
                          axisLine={false}
                          tickLine={false}
                          width={32}
                        />
                      )}
                      <Tooltip
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload?.fullName || String(_label)
                        }
                        formatter={(value: unknown, name: unknown) => [
                          name === 'partisipasi' ? `${value} peserta` : `${value}%`,
                          name === 'penyelesaian'
                            ? 'Penyelesaian (%)'
                            : name === 'skor'
                              ? 'Estimasi Skor (%)'
                              : 'Partisipasi',
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={(value) =>
                          value === 'penyelesaian'
                            ? 'Penyelesaian (%)'
                            : value === 'skor'
                              ? 'Skor Real-Time (%)'
                              : 'Jumlah Peserta'
                        }
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="penyelesaian"
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        fill="url(#cbtCompletionGrad)"
                        activeDot={{ r: 5 }}
                      />
                      {trendViewMode === 'students' ? (
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="skor"
                          stroke="#10B981"
                          strokeWidth={2}
                          fill="url(#cbtScoreGrad)"
                          activeDot={{ r: 4 }}
                        />
                      ) : (
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="partisipasi"
                          stroke="#0EA5E9"
                          strokeWidth={2}
                          fill="url(#cbtScoreGrad)"
                          activeDot={{ r: 4 }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Pengumuman Terbaru</h2>
                  <button
                    type="button"
                    onClick={() => setSection('announcements')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Lihat Semua →
                  </button>
                </div>
                {announcements.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 text-xs text-slate-400">
                    Belum ada pengumuman terbaru
                  </div>
                ) : (
                  <div className="space-y-3 flex-1">
                    {announcements.slice(0, 3).map((ann) => (
                      <div key={ann.id} className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{ann.title}</p>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {new Date(ann.createdAt).toLocaleDateString('id-ID')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{ann.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2 Charts: Question Type Performance Statistics (Recharts BarChart + Breakdown Table) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Statistik Performa per Jenis Soal
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Perbandingan tingkat penyelesaian dan rata-rata akurasi nilai peserta pada bank soal aktif.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('monitoring')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    Pantau Detail →
                  </button>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={questionTypeStats}
                      margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis
                        dataKey="short"
                        tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                        axisLine={{ stroke: '#E2E8F0' }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload?.label || String(_label)
                        }
                        formatter={(value: unknown, name: unknown) => [
                          `${value}%`,
                          name === 'completionRate' ? 'Dijawab (%)' : 'Akurasi Skor (%)',
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={(value) =>
                          value === 'completionRate' ? 'Tingkat Dijawab (%)' : 'Akurasi Skor (%)'
                        }
                      />
                      <Bar
                        dataKey="completionRate"
                        fill="#2563EB"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={36}
                      />
                      <Bar
                        dataKey="accuracyRate"
                        fill="#10B981"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    Rekap Komposisi Jenis Soal
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {activeExamQuestions.length} butir
                  </span>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-2 pr-2">Jenis Soal</th>
                        <th className="py-2 px-2 text-right">Soal</th>
                        <th className="py-2 px-2 text-right">Bobot</th>
                        <th className="py-2 px-2 text-right">Dijawab</th>
                        <th className="py-2 pl-2 text-right">Akurasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {questionTypeStats.map((row) => (
                        <tr key={row.type} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-2 font-medium text-slate-800">
                            {row.label}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                            {row.questionCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                            {row.totalPoints}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-blue-700">
                            {row.completionRate}%
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            {row.accuracyRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sessions.length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    Persentase dijawab dan akurasi otomatis terisi saat murid mulai mengerjakan ujian.
                  </p>
                )}
              </div>
            </div>
          </main>
        )}

        {/* 2. DATA MASTER SISWA */}
        {section === 'students' && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Data Master Siswa</h1>
                <p className="text-xs text-slate-500 mt-0.5">Kelola data peserta didik Tryout TKA SD ({filteredStudents.length} siswa)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama / NIS..."
                    className="h-9 pl-8 pr-3 text-xs border border-slate-300 bg-slate-50 focus:bg-white rounded-xl w-44"
                  />
                </div>
                <select
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                  className="h-9 px-3 text-xs border border-slate-300 bg-white rounded-xl"
                >
                  <option value="all">Semua Kelas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  ref={studentFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleStudentsFileUpload(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => studentFileInputRef.current?.click()}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => setImportStudentsOpen(true)}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  Tempel Teks
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingStudent(null);
                    setStuForm({ name: '', nis: '', kelas: 'KELAS 6 A', phone: '' });
                    setStudentModalOpen(true);
                  }}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Siswa
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 w-12">No</th>
                      <th className="py-3 px-4">Nama Siswa</th>
                      <th className="py-3 px-4">NIS</th>
                      <th className="py-3 px-4">Kelas</th>
                      <th className="py-3 px-4">No HP</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((stu, idx) => (
                      <tr key={stu.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{stu.name}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-emerald-700 font-medium">{stu.nis}</td>
                        <td className="py-3 px-4 text-xs text-cyan-700 font-semibold">{stu.kelas}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">{stu.phone}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStudent(stu);
                                setStuForm({ name: stu.name, nis: stu.nis, kelas: stu.kelas, phone: stu.phone });
                                setStudentModalOpen(true);
                              }}
                              title="Edit siswa"
                              className="w-8 h-8 inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/master/students/${stu.id}`, { method: 'DELETE' });
                              }}
                              title="Hapus siswa"
                              className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        )}

        {/* 3. DATA MASTER GURU */}
        {section === 'teachers' && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Data Master Guru</h1>
                <p className="text-xs text-slate-500 mt-0.5">Kelola data pengajar / tenaga pendidik sekolah</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    placeholder="Cari guru / NIP..."
                    className="h-9 pl-8 pr-3 text-xs border border-slate-300 bg-slate-50 focus:bg-white rounded-xl w-44"
                  />
                </div>
                <input
                  ref={teacherFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleTeachersFileUpload(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => teacherFileInputRef.current?.click()}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import Excel / CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeacher(null);
                    setTeaForm({ name: '', nip: '', subjects: 'Matematika SD', classes: 'KELAS 6 A', phone: '' });
                    setTeacherModalOpen(true);
                  }}
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Guru
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4 w-12">No</th>
                      <th className="py-3 px-4">Nama Pengajar</th>
                      <th className="py-3 px-4">NIP / Username</th>
                      <th className="py-3 px-4">Mata Pelajaran</th>
                      <th className="py-3 px-4">Kelas Ampu</th>
                      <th className="py-3 px-4">No HP</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTeachers.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{t.name}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-emerald-700 font-medium">{t.nip}</td>
                        <td className="py-3 px-4 text-xs text-blue-700 font-medium">{t.subjects.join(' · ')}</td>
                        <td className="py-3 px-4 text-xs text-cyan-700 font-medium">{t.classes.join(' · ')}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">{t.phone}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeacher(t);
                                setTeaForm({
                                  name: t.name,
                                  nip: t.nip,
                                  subjects: t.subjects.join(', '),
                                  classes: t.classes.join(', '),
                                  phone: t.phone,
                                });
                                setTeacherModalOpen(true);
                              }}
                              title="Edit guru"
                              className="w-8 h-8 inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/master/teachers/${t.id}`, { method: 'DELETE' });
                              }}
                              title="Hapus guru"
                              className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        )}

        {/* 4. DATA KELAS */}
        {section === 'classes' && (
          <main className="p-4 md:p-6 space-y-5 max-w-4xl">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!classForm.name.trim()) return;
                await fetch('/api/master/classes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(classForm),
                });
                setClassForm({ name: '', level: 'Tingkat 6 SD', homeroomTeacher: '' });
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama Kelas</label>
                <input
                  type="text"
                  required
                  value={classForm.name}
                  onChange={(e) => setClassForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="cth. KELAS 6 D"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tingkat</label>
                <input
                  type="text"
                  value={classForm.level}
                  onChange={(e) => setClassForm((p) => ({ ...p, level: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Wali Kelas</label>
                <input
                  type="text"
                  value={classForm.homeroomTeacher}
                  onChange={(e) => setClassForm((p) => ({ ...p, homeroomTeacher: e.target.value }))}
                  placeholder="Nama guru"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <button
                type="submit"
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Kelas
              </button>
            </form>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Nama Kelas</th>
                    <th className="py-3 px-4">Tingkat</th>
                    <th className="py-3 px-4">Wali Kelas</th>
                    <th className="py-3 px-4 text-right">Siswa</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classes.map((cls, idx) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-cyan-800">{cls.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{cls.level}</td>
                      <td className="py-3 px-4 text-xs text-slate-800">{cls.homeroomTeacher}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                        {masterStudents.filter((s) => s.kelas === cls.name).length}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/master/classes/${cls.id}`, { method: 'DELETE' });
                          }}
                          title="Hapus kelas"
                          className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}

        {/* 5. MATA PELAJARAN */}
        {section === 'subjects' && (
          <main className="p-4 md:p-6 space-y-5 max-w-4xl">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!subjectForm.code.trim() || !subjectForm.name.trim()) return;
                await fetch('/api/master/subjects', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(subjectForm),
                });
                setSubjectForm({ code: '', name: '', category: 'Umum' });
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kode Mapel</label>
                <input
                  type="text"
                  required
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="cth. PKN-SD"
                  className="w-full h-10 px-3 text-sm font-mono uppercase border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama Mata Pelajaran</label>
                <input
                  type="text"
                  required
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Pendidikan Pancasila"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
                <input
                  type="text"
                  value={subjectForm.category}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <button
                type="submit"
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Mapel
              </button>
            </form>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Kode</th>
                    <th className="py-3 px-4">Mata Pelajaran</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjects.map((sub, idx) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">{sub.code}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{sub.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{sub.category}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/master/subjects/${sub.id}`, { method: 'DELETE' });
                          }}
                          title="Hapus mapel"
                          className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}

        {/* 6. PESERTA UJIAN (KARTU PESERTA CETAK) */}
        {section === 'exam_cards' && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Kartu Peserta Ujian</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cetak kartu login peserta · Token Sesi: <strong className="font-mono">{examConfig?.sessionCode}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                Cetak Kartu Peserta
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {masterStudents.map((stu) => (
                <div
                  key={stu.id}
                  className="bg-white border border-slate-300 rounded-xl p-5 space-y-3"
                >
                  <div className="pb-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700">KARTU PESERTA CBT</span>
                    <span className="text-[11px] font-mono text-slate-500">{examConfig?.sessionCode}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p><span className="text-slate-500">Nama:</span> <strong className="text-slate-900">{stu.name}</strong></p>
                    <p><span className="text-slate-500">NIS / ID Login:</span> <strong className="font-mono text-slate-900">{stu.nis}</strong></p>
                    <p><span className="text-slate-500">Kelas:</span> <strong>{stu.kelas}</strong></p>
                    <p><span className="text-slate-500">Ujian:</span> {examConfig?.title}</p>
                    <p><span className="text-slate-500">Jadwal:</span> {examConfig?.scheduleDate} · {examConfig?.startTime} WIB</p>
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}

        {/* 7. E-LEARNING MATERI */}
        {section === 'elearning' && (
          <main className="p-4 md:p-6 space-y-5 max-w-5xl">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!materialForm.title.trim() || !materialForm.content.trim()) return;
                await fetch('/api/materials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(materialForm),
                });
                setMaterialForm({ title: '', subject: 'Matematika SD', targetClass: 'KELAS 6', summary: '', content: '' });
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <h1 className="text-base font-bold text-slate-900">Tambah Materi E-Learning / Pengayaan</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={materialForm.title}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Judul Materi..."
                  className="md:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  value={materialForm.subject}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Mata Pelajaran"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <textarea
                rows={3}
                required
                value={materialForm.content}
                onChange={(e) => setMaterialForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="Isi materi atau ringkasan rumus (mendukung LaTeX $...$)..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                + Terbitkan Materi
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {materials.map((mat) => (
                <div key={mat.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">{mat.subject} · {mat.targetClass}</p>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">{mat.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/materials/${mat.id}`, { method: 'DELETE' });
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <MathText text={mat.content} />
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}

        {/* 8. KELOLA BANK SOAL & KATALOG KATEGORISASI SOAL */}
        {section === 'questions' && !selectedBankId && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            {/* Header + Segmented View Switch */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Manajemen Bank Soal &amp; Kategorisasi
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kelompokkan butir soal berdasarkan mata pelajaran dan tingkat kesulitan, lalu pratinjau tampilan siswa sebelum dimasukkan ke ujian.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImportQuestionsOpen(true)}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Import Excel / CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportQuestions('xlsx')}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Export Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuestion(null);
                      setEditorOpen(true);
                    }}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Soal Baru
                  </button>
                  <button
                    type="button"
                    onClick={() => setBankModalOpen(true)}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Layers className="w-4 h-4 text-blue-600" />
                    Buat Paket Bank
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setQuestionBankTab('catalog')}
                    className={`h-8 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      questionBankTab === 'catalog'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Katalog &amp; Kategorisasi Soal ({questions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionBankTab('banks')}
                    className={`h-8 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      questionBankTab === 'banks'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Library className="w-3.5 h-3.5" />
                    Daftar Paket Bank ({questionBanks.length})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span>Ujian Aktif:</span>
                  <span className="font-semibold text-emerald-700">
                    {activeBank ? `[${activeBank.code}] ${activeBank.name}` : 'Semua Bank'}
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {activeExamQuestions.length} soal aktif
                  </span>
                </div>
              </div>
            </div>

            {questionBankTab === 'catalog' ? (
              <>
                {/* Difficulty Distribution KPI Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    type="button"
                    onClick={() => setQuestionDifficultyFilter('all')}
                    className={`text-left bg-white border rounded-2xl p-4 transition-colors ${
                      questionDifficultyFilter === 'all'
                        ? 'border-blue-500 ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-500">Total Soal Repositori</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {questions.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {availableSubjects.length} kategori mata pelajaran
                    </p>
                  </button>

                  {QUESTION_DIFFICULTY_ORDER.map((diff) => {
                    const tone = getDifficultyTone(diff);
                    const count = difficultyBreakdown[diff];
                    const selected = questionDifficultyFilter === diff;
                    return (
                      <button
                        key={diff}
                        type="button"
                        onClick={() =>
                          setQuestionDifficultyFilter((prev) => (prev === diff ? 'all' : diff))
                        }
                        className={`text-left bg-white border rounded-2xl p-4 transition-colors ${
                          selected
                            ? 'border-blue-500 ring-1 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-500">
                            Tingkat {tone.label}
                          </p>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${tone.bgClass} ${tone.textClass}`}
                          >
                            {tone.label}
                          </span>
                        </div>
                        <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                          {count}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {questions.length > 0
                            ? `${Math.round((count / questions.length) * 100)}% dari total bank`
                            : '0%'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Multi-Filter & Target Exam Insertion Bar */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                    <div className="relative lg:col-span-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={questionSearch}
                        onChange={(e) => setQuestionSearch(e.target.value)}
                        placeholder="Cari teks pertanyaan atau mapel..."
                        className="w-full h-9 pl-8 pr-3 text-xs border border-slate-300 bg-slate-50 focus:bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <select
                      value={questionSubjectFilter}
                      onChange={(e) => setQuestionSubjectFilter(e.target.value)}
                      className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="all">Semua Mata Pelajaran</option>
                      {availableSubjects.map((subj) => (
                        <option key={subj} value={subj}>
                          {subj}
                        </option>
                      ))}
                    </select>

                    <select
                      value={questionDifficultyFilter}
                      onChange={(e) =>
                        setQuestionDifficultyFilter(e.target.value as QuestionDifficulty | 'all')
                      }
                      className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="all">Semua Tingkat Kesulitan</option>
                      {QUESTION_DIFFICULTY_ORDER.map((diff) => (
                        <option key={diff} value={diff}>
                          {QUESTION_DIFFICULTY_LABELS[diff]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={questionTypeFilter}
                      onChange={(e) =>
                        setQuestionTypeFilter(e.target.value as QuestionType | 'all')
                      }
                      className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="all">Semua Jenis Soal</option>
                      {ALL_QUESTION_TYPES.map((qt) => (
                        <option key={qt} value={qt}>
                          {QUESTION_TYPE_LABELS[qt]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={catalogBankFilter}
                      onChange={(e) => setCatalogBankFilter(e.target.value)}
                      className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="all">Semua Paket Bank</option>
                      {questionBanks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          [{bank.code}] {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={catalogStatusFilter}
                        onChange={(e) =>
                          setCatalogStatusFilter(
                            e.target.value as 'all' | 'in_active' | 'not_in_active'
                          )
                        }
                        className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        <option value="all">Status Ujian: Semua</option>
                        <option value="in_active">Sudah di Ujian Aktif</option>
                        <option value="not_in_active">Belum di Ujian Aktif</option>
                      </select>

                      {(questionSearch ||
                        questionSubjectFilter !== 'all' ||
                        questionDifficultyFilter !== 'all' ||
                        questionTypeFilter !== 'all' ||
                        catalogBankFilter !== 'all' ||
                        catalogStatusFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuestionSearch('');
                            setQuestionSubjectFilter('all');
                            setQuestionDifficultyFilter('all');
                            setQuestionTypeFilter('all');
                            setCatalogBankFilter('all');
                            setCatalogStatusFilter('all');
                          }}
                          className="h-8 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          Reset Filter
                        </button>
                      )}

                      <span className="text-xs text-slate-500 font-mono tabular-nums ml-1">
                        Menampilkan {filteredCatalogQuestions.length} dari {questions.length} soal
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Target Ujian:</span>
                      <select
                        value={assignTargetBankId || activeBank?.id || ''}
                        onChange={(e) => setAssignTargetBankId(e.target.value)}
                        className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg max-w-[230px]"
                      >
                        {questionBanks.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            [{bank.code}] {bank.name}
                            {bank.isActive ? ' (Aktif)' : ''}
                          </option>
                        ))}
                      </select>
                      {selectedCatalogIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleBatchAssignToBank}
                          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Masukkan {selectedCatalogIds.length} Soal ke Ujian
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Categorized Question Repository List */}
                {filteredCatalogQuestions.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      Tidak ada soal yang cocok dengan filter kategori dan tingkat kesulitan ini.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionSearch('');
                        setQuestionSubjectFilter('all');
                        setQuestionDifficultyFilter('all');
                        setQuestionTypeFilter('all');
                        setCatalogBankFilter('all');
                        setCatalogStatusFilter('all');
                      }}
                      className="h-9 px-4 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                    >
                      Tampilkan Semua Soal
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4 w-10">
                              <input
                                type="checkbox"
                                checked={
                                  filteredCatalogQuestions.length > 0 &&
                                  filteredCatalogQuestions.every((q) =>
                                    selectedCatalogIds.includes(q.id)
                                  )
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCatalogIds(
                                      filteredCatalogQuestions.map((q) => q.id)
                                    );
                                  } else {
                                    setSelectedCatalogIds([]);
                                  }
                                }}
                                aria-label="Pilih semua soal"
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                            </th>
                            <th className="py-3 px-3 w-14">No</th>
                            <th className="py-3 px-3">Pertanyaan &amp; Tipe</th>
                            <th className="py-3 px-3 w-52">Kategori Mapel</th>
                            <th className="py-3 px-3 w-36">Kesulitan</th>
                            <th className="py-3 px-3 w-40">Bank &amp; Status</th>
                            <th className="py-3 px-4 text-right w-56">Pratinjau &amp; Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredCatalogQuestions.map((q, idx) => {
                            const difficulty = getQuestionDifficulty(q);
                            const diffTone = getDifficultyTone(difficulty);
                            const originBank = questionBanks.find(
                              (b) => b.id === (q.bankId || activeBank?.id)
                            );
                            const targetId = assignTargetBankId || activeBank?.id || '';
                            const isInTargetBank = Boolean(
                              targetId && (!q.bankId || q.bankId === targetId)
                            );
                            const checked = selectedCatalogIds.includes(q.id);

                            return (
                              <tr key={q.id} className="hover:bg-slate-50/70 align-top">
                                <td className="py-3.5 px-4">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      setSelectedCatalogIds((prev) =>
                                        e.target.checked
                                          ? [...prev, q.id]
                                          : prev.filter((id) => id !== q.id)
                                      );
                                    }}
                                    aria-label={`Pilih soal ${idx + 1}`}
                                    className="w-4 h-4 text-blue-600 rounded mt-0.5"
                                  />
                                </td>
                                <td className="py-3.5 px-3 font-mono text-xs text-slate-500">
                                  {idx + 1}
                                </td>
                                <td className="py-3.5 px-3 max-w-md space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 font-semibold rounded">
                                      {QUESTION_TYPE_SHORT[q.type]}
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-500">
                                      {q.points} poin
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-2.5">
                                    {sanitizeImageUrl(q.imageUrl) && (
                                      <img
                                        src={sanitizeImageUrl(q.imageUrl) || ''}
                                        alt={q.imageCaption || 'Gambar soal'}
                                        className="w-12 h-10 rounded-md border border-slate-200 bg-white object-cover shrink-0"
                                      />
                                    )}
                                    <div className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                                      {q.prompt ? (
                                        <MathText text={q.prompt} direction={q.direction} />
                                      ) : (
                                        <span className="italic text-slate-500">[Soal bergambar]</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-3">
                                  <select
                                    value={q.subject}
                                    onChange={(e) =>
                                      void handleQuickCategorizeQuestion(q, {
                                        subject: e.target.value,
                                      })
                                    }
                                    aria-label="Ubah mata pelajaran soal"
                                    className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                  >
                                    {Array.from(
                                      new Set([...availableSubjects, q.subject])
                                    ).map((subj) => (
                                      <option key={subj} value={subj}>
                                        {subj}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3.5 px-3">
                                  <select
                                    value={difficulty}
                                    onChange={(e) =>
                                      void handleQuickCategorizeQuestion(q, {
                                        difficulty: e.target.value as QuestionDifficulty,
                                      })
                                    }
                                    aria-label="Ubah tingkat kesulitan soal"
                                    className={`w-full h-8 px-2 text-xs font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 ${diffTone.bgClass} ${diffTone.textClass}`}
                                  >
                                    {QUESTION_DIFFICULTY_ORDER.map((d) => (
                                      <option key={d} value={d}>
                                        {QUESTION_DIFFICULTY_LABELS[d]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3.5 px-3 text-xs space-y-1">
                                  <p className="font-mono font-semibold text-slate-700">
                                    {originBank?.code || 'UMUM'}
                                  </p>
                                  {isInTargetBank ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Di Target Ujian
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">
                                      Belum di target
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewQuestionTarget({
                                          question: q,
                                          indexNumber: idx + 1,
                                        })
                                      }
                                      className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg whitespace-nowrap"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Pratinjau
                                    </button>
                                    {!isInTargetBank && (
                                      <button
                                        type="button"
                                        onClick={() => void handleAssignQuestionToBank(q.id)}
                                        title="Masukkan soal ini ke bank ujian target"
                                        className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Ujian
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingQuestion(q);
                                        setEditorOpen(true);
                                      }}
                                      title="Edit soal"
                                      className="w-8 h-8 inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 rounded-lg transition-colors"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteQuestion(q.id)}
                                      title="Hapus soal"
                                      className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4 w-12">No</th>
                        <th className="py-3 px-4">Kode &amp; Nama Bank</th>
                        <th className="py-3 px-4">Mata Pelajaran</th>
                        <th className="py-3 px-4">Kelas Target</th>
                        <th className="py-3 px-4">Target Soal TKA SD</th>
                        <th className="py-3 px-4">Soal Terinput</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {questionBanks.map((bank, idx) => {
                        const bankQs = questions.filter((q) => !q.bankId || q.bankId === bank.id);
                        const targets = bank.targetCounts || {
                          multiple_choice: 15,
                          mcma: 10,
                          true_false: 5,
                          complex_multiple_choice: 0,
                          matching: 0,
                          essay: 0,
                        };
                        const counts: Record<QuestionType, number> = {
                          multiple_choice: bankQs.filter((q) => q.type === 'multiple_choice').length,
                          mcma: bankQs.filter((q) => q.type === 'mcma').length,
                          true_false: bankQs.filter((q) => q.type === 'true_false').length,
                          complex_multiple_choice: bankQs.filter((q) => q.type === 'complex_multiple_choice').length,
                          matching: bankQs.filter((q) => q.type === 'matching').length,
                          essay: bankQs.filter((q) => q.type === 'essay').length,
                        };
                        return (
                          <tr key={bank.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <span className="text-xs font-mono font-bold text-blue-700">{bank.code}</span>
                              <p className="font-semibold text-slate-900">{bank.name}</p>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-700">{bank.subject}</td>
                            <td className="py-3 px-4 text-xs font-semibold text-slate-700">{bank.targetClass}</td>
                            <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500">
                              PG:{targets.multiple_choice ?? 0} · PGK:{targets.true_false ?? 0} · MCMA:{targets.mcma ?? 0}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-800 font-medium">
                              PG:{counts.multiple_choice} · PGK:{counts.true_false} · MCMA:{counts.mcma}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {bank.isActive ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Aktif
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await fetch(`/api/question-banks/${bank.id}/activate`, { method: 'POST' });
                                  }}
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  Aktifkan
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBankId(bank.id)}
                                  className="h-8 px-3 inline-flex items-center justify-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
                                >
                                  Kelola Soal ({bankQs.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBankId(bank.id);
                                    setImportQuestionsOpen(true);
                                  }}
                                  title="Import Excel / CSV ke bank ini"
                                  className="w-8 h-8 inline-flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded-lg transition-colors"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                </button>
                                {questionBanks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await fetch(`/api/question-banks/${bank.id}`, { method: 'DELETE' });
                                    }}
                                    title="Hapus bank soal"
                                    className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        )}

        {/* 8B. KELOLA BUTIR SOAL DETAIL */}
        {section === 'questions' && selectedBankId && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBankId(null);
                      setQuestionTypeFilter('all');
                      setQuestionSubjectFilter('all');
                      setQuestionDifficultyFilter('all');
                      setQuestionSearch('');
                    }}
                    className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Kembali ke Bank Soal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTargetBankId(selectedBankId);
                      setSelectedBankId(null);
                      setQuestionBankTab('catalog');
                    }}
                    className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl whitespace-nowrap"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Ambil Soal dari Katalog
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={questionSubjectFilter}
                    onChange={(e) => setQuestionSubjectFilter(e.target.value)}
                    className="h-9 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">Semua Mata Pelajaran</option>
                    {availableSubjects.map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>

                  <select
                    value={questionDifficultyFilter}
                    onChange={(e) =>
                      setQuestionDifficultyFilter(e.target.value as QuestionDifficulty | 'all')
                    }
                    className="h-9 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">Semua Kesulitan</option>
                    {QUESTION_DIFFICULTY_ORDER.map((diff) => (
                      <option key={diff} value={diff}>
                        {QUESTION_DIFFICULTY_LABELS[diff]} ({difficultyBreakdown[diff]})
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      placeholder="Cari isi soal / mapel..."
                      className="h-9 pl-8 pr-3 text-xs border border-slate-300 bg-slate-50 focus:bg-white rounded-xl w-52"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Kelola Soal: {questionBanks.find((b) => b.id === selectedBankId)?.name}
                  </h1>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    Total Soal: {currentBankQuestions.length} · Total Bobot:{' '}
                    {currentBankQuestions.reduce((s, q) => s + q.points, 0)} poin · Mudah:{' '}
                    {difficultyBreakdown.easy} · Sedang: {difficultyBreakdown.medium} · Sulit:{' '}
                    {difficultyBreakdown.hard}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-teal-600" />
                    Preview Semua ({filteredBankQuestions.length})
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen((v) => !v)}
                      className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-600" />
                      Export Soal
                    </button>
                    {exportMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30">
                        <button
                          type="button"
                          onClick={() => handleExportQuestions('xlsx')}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Export Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportQuestions('doc')}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Export Word (.doc)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportQuestions('csv')}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Export CSV (.csv)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportQuestions('json')}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Export Backup (.json)
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const init: Record<string, number> = {};
                      currentBankQuestions.forEach((q) => {
                        init[q.id] = q.points;
                      });
                      setWeightsDraft(init);
                      setWeightsModalOpen(true);
                    }}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Scale className="w-3.5 h-3.5 text-slate-600" />
                    Atur Bobot
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportQuestionsOpen(true)}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Import Excel / CSV
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuestion(null);
                      setEditorOpen(true);
                    }}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Soal
                  </button>
                </div>
              </div>

              {/* Filter by Question Types */}
              <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuestionTypeFilter('all')}
                  className={`h-8 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    questionTypeFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({currentBankQuestions.length})
                </button>
                {ALL_QUESTION_TYPES.map((qt) => {
                  const count = currentBankQuestions.filter((q) => q.type === qt).length;
                  return (
                    <button
                      key={qt}
                      type="button"
                      onClick={() => setQuestionTypeFilter(qt)}
                      className={`h-8 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        questionTypeFilter === qt
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {QUESTION_TYPE_LABELS[qt]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredBankQuestions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-700">
                  Belum ada soal yang sesuai pada filter ini.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImportQuestionsOpen(true)}
                    className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Import Massal Excel/CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuestion(null);
                      setEditorOpen(true);
                    }}
                    className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Soal Manual
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBankQuestions.map((q, idx) => {
                  const difficulty = getQuestionDifficulty(q);
                  const diffTone = getDifficultyTone(difficulty);
                  return (
                  <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="px-2 py-0.5 bg-blue-600 text-white font-mono font-bold rounded-md">
                          No. {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {QUESTION_TYPE_LABELS[q.type]}
                        </span>
                        <select
                          value={q.subject}
                          onChange={(e) =>
                            void handleQuickCategorizeQuestion(q, { subject: e.target.value })
                          }
                          aria-label="Kategori mata pelajaran"
                          className="h-7 px-2 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-700"
                        >
                          {Array.from(new Set([...availableSubjects, q.subject])).map((subj) => (
                            <option key={subj} value={subj}>
                              {subj}
                            </option>
                          ))}
                        </select>
                        <select
                          value={difficulty}
                          onChange={(e) =>
                            void handleQuickCategorizeQuestion(q, {
                              difficulty: e.target.value as QuestionDifficulty,
                            })
                          }
                          aria-label="Tingkat kesulitan"
                          className={`h-7 px-2 text-xs font-semibold border rounded-md ${diffTone.bgClass} ${diffTone.textClass}`}
                        >
                          {QUESTION_DIFFICULTY_ORDER.map((d) => (
                            <option key={d} value={d}>
                              {QUESTION_DIFFICULTY_LABELS[d]}
                            </option>
                          ))}
                        </select>
                        <span className="font-mono tabular-nums">{q.points} poin</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewQuestionTarget({ question: q, indexNumber: idx + 1 })
                          }
                          title="Pratinjau tampilan siswa"
                          className="h-8 px-2.5 inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Pratinjau
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(q)}
                          title="Duplikat soal"
                          className="w-8 h-8 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(q);
                            setEditorOpen(true);
                          }}
                          title="Edit soal"
                          className="w-8 h-8 inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Hapus soal"
                          className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {sanitizeImageUrl(q.imageUrl) && (
                      <div className="space-y-1">
                        <img
                          src={sanitizeImageUrl(q.imageUrl) || ''}
                          alt={q.imageCaption || 'Gambar soal'}
                          className="max-h-48 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                        />
                        {q.imageCaption && (
                          <p className="text-[11px] text-slate-500">{q.imageCaption}</p>
                        )}
                      </div>
                    )}

                    <div className="text-sm text-slate-800">
                      <MathText text={q.prompt} direction={q.direction} />
                    </div>

                    {/* Full Type-Specific Details Preview */}
                    {(q.type === 'multiple_choice' ||
                      q.type === 'complex_multiple_choice' ||
                      q.type === 'mcma') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {q.options.map((opt, oi) => {
                          const isKey =
                            q.type === 'multiple_choice'
                              ? q.correctOptionId === opt.id
                              : q.correctOptionIds.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                                isKey
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-mono font-bold uppercase">
                                {String.fromCharCode(65 + oi)}.
                              </span>
                              <span className="flex-1">
                                <MathText text={opt.text} direction={q.direction} />
                              </span>
                              {isKey && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'matching' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {q.pairs.map((p) => (
                          <div
                            key={p.id}
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-2"
                          >
                            <span className="text-slate-800 font-medium">
                              <MathText text={p.left} />
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-emerald-700 font-semibold">
                              <MathText text={p.right} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'true_false' && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        {q.statements.map((st) => (
                          <div
                            key={st.id}
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between gap-3"
                          >
                            <span className="text-slate-800">
                              <MathText text={st.text} />
                            </span>
                            <span
                              className={`font-semibold shrink-0 ${
                                st.isTrue ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {st.isTrue ? 'Benar' : 'Salah'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'essay' && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                        <p>
                          <strong className="text-slate-800">Kata Kunci:</strong>{' '}
                          {q.expectedKeywords.join(', ') || '—'}
                        </p>
                        {q.sampleAnswer && (
                          <p>
                            <strong className="text-slate-800">Rubrik Referensi:</strong>{' '}
                            {q.sampleAnswer}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* 9. STATUS PESERTA: REAL-TIME TABLE WITH % PROGRESS & QUESTION-TYPE INDICATORS */}
        {section === 'monitoring' && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-base font-bold text-slate-900">
                      Monitoring Aktivitas &amp; Progres Peserta Ujian (Real-Time)
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Menampilkan seluruh siswa, persentase penyelesaian, dan status per jenis soal.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari siswa / NIS..."
                        className="h-9 pl-8 pr-3 text-xs border border-slate-300 bg-slate-50 focus:bg-white rounded-xl w-44"
                      />
                    </div>
                    {examConfig?.globalSuspended ? (
                      <button
                        type="button"
                        onClick={() => sendCommand({ type: 'proctor:resume_all' })}
                        className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Aktifkan Semua
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendCommand({ type: 'proctor:suspend_all' })}
                        className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 rounded-xl whitespace-nowrap shrink-0"
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        Suspend Semua Ruang
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Filter Bar */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ['all', 'Semua'],
                      ['active', 'Mengerjakan'],
                      ['violation_locked', 'Terkunci'],
                      ['suspended', 'Ditangguhkan'],
                      ['submitted', 'Selesai'],
                      ['not_started', 'Belum Masuk'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMonitoringStatusFilter(val)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        monitoringStatusFilter === val
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Peserta & Status</th>
                      <th className="py-3 px-4 min-w-[160px]">Progres (%)</th>
                      {ALL_QUESTION_TYPES.map((qt) => (
                        <th key={qt} className="py-3 px-2.5 text-center whitespace-nowrap">
                          {QUESTION_TYPE_SHORT[qt]}
                        </th>
                      ))}
                      <th className="py-3 px-3 text-right">Pelanggaran</th>
                      <th className="py-3 px-3 text-right">Nilai</th>
                      <th className="py-3 px-4 text-right">Kontrol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {unifiedRows.map((row) => {
                      const meta = getStatusMeta(row.status);
                      const StatusIcon = meta.Icon;
                      const sess = row.session;
                      const isFinished =
                        row.status === 'submitted' || row.status === 'force_stopped';

                      return (
                        <tr key={row.key} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-900">{row.name}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                              <span className="font-mono tabular-nums text-slate-500">
                                {row.nis}
                              </span>
                              <span className={`inline-flex items-center gap-1 font-semibold ${meta.textClass}`}>
                                <StatusIcon className="w-3.5 h-3.5" />
                                {meta.label}
                              </span>
                              {sess && (
                                <span className="font-mono tabular-nums text-slate-400">
                                  · {formatClock(sess.remainingSeconds)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Progress Percentage & Bar */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                                <span className="font-semibold text-slate-800">{row.percent}%</span>
                                <span className="text-slate-500">
                                  {row.answered}/{row.total}
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    row.percent === 100
                                      ? 'bg-emerald-600'
                                      : row.percent > 0
                                        ? 'bg-blue-600'
                                        : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${row.percent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Individual Status Indicators for Each of the 3 TKA Question Types */}
                          {ALL_QUESTION_TYPES.map((qt) => {
                            const stat = row.byType[qt];
                            const hasQuestions = stat.total > 0;
                            const done = hasQuestions && stat.answered === stat.total;
                            const partial = hasQuestions && stat.answered > 0 && stat.answered < stat.total;
                            return (
                              <td key={qt} className="py-3 px-2.5 text-center">
                                {!hasQuestions ? (
                                  <span className="text-xs text-slate-300">—</span>
                                ) : (
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    <span
                                      className={`inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-bold ${
                                        done
                                          ? 'text-emerald-700'
                                          : partial
                                            ? 'text-amber-700'
                                            : 'text-red-600'
                                      }`}
                                    >
                                      {done ? (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      ) : partial ? (
                                        <Clock className="w-3.5 h-3.5" />
                                      ) : (
                                        <CircleDashed className="w-3.5 h-3.5" />
                                      )}
                                      {stat.answered}/{stat.total}
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          <td className="py-3 px-3 text-right font-mono tabular-nums text-xs">
                            <span
                              className={
                                sess && sess.violations.length > 0
                                  ? 'font-bold text-red-700'
                                  : 'text-slate-400'
                              }
                            >
                              {sess ? sess.violations.length : 0}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {sess?.gradeSummary ? sess.gradeSummary.totalScore : '—'}
                          </td>

                          <td className="py-3 px-4 text-right">
                            {!sess ? (
                              <span className="text-xs text-slate-400">Menunggu login</span>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectedStudentId(sess.id)}
                                  className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100"
                                >
                                  Detail
                                </button>
                                {sess.status === 'violation_locked' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendCommand({
                                        type: 'proctor:unlock_violation',
                                        studentId: sess.id,
                                      })
                                    }
                                    className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700"
                                  >
                                    Buka
                                  </button>
                                )}
                                {sess.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendCommand({
                                        type: 'proctor:suspend',
                                        studentId: sess.id,
                                      })
                                    }
                                    className="px-2 py-1 text-xs font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200"
                                  >
                                    Suspend
                                  </button>
                                )}
                                {sess.status === 'suspended' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendCommand({
                                        type: 'proctor:resume',
                                        studentId: sess.id,
                                      })
                                    }
                                    className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700"
                                  >
                                    Aktifkan
                                  </button>
                                )}
                                {!isFinished && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmForceStopTarget(sess)}
                                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                                  >
                                    Hentikan
                                  </button>
                                )}
                                {isFinished && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendCommand({
                                        type: 'proctor:reset_session',
                                        studentId: sess.id,
                                      })
                                    }
                                    className="p-1 text-slate-500 hover:text-slate-900"
                                    title="Reset sesi"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Violation Log */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Log Pelanggaran Anti-Curang
                </h2>
                {violations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => sendCommand({ type: 'proctor:clear_violations' })}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              {violations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Belum ada aktivitas mencurigakan yang tercatat.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {violations.map((v) => (
                    <div key={v.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {v.studentName} ({v.nis})
                        </span>{' '}
                        — <span className="text-red-700">{v.reason}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400">
                          {new Date(v.timestamp).toLocaleTimeString('id-ID')}
                        </span>
                        {!v.resolved && (
                          <button
                            type="button"
                            onClick={() =>
                              sendCommand({
                                type: 'proctor:unlock_violation',
                                studentId: v.studentId,
                              })
                            }
                            className="font-medium text-blue-600 hover:underline"
                          >
                            Buka Kunci
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {/* 10. JADWAL, SESI & PENGATURAN UJIAN */}
        {section === 'schedule' && examConfig && (
          <main className="p-4 md:p-6 space-y-6 max-w-5xl">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Pengaturan Jadwal, Sesi &amp; Keamanan Ujian
                  </h1>
                  <p className="text-xs text-slate-500">
                    Konfigurasi identitas sekolah, token sesi, durasi, KKM, dan kebijakan anti-curang.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const token = `TKA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                    handleUpdateConfig({ sessionCode: token });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Acak Token Sesi
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Judul Ujian</label>
                  <input
                    type="text"
                    value={examConfig.title}
                    onChange={(e) => handleUpdateConfig({ title: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Nama Sekolah / Lembaga</label>
                  <input
                    type="text"
                    value={examConfig.schoolName || ''}
                    onChange={(e) => handleUpdateConfig({ schoolName: e.target.value })}
                    placeholder="SDN Nusantara 01"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tanggal Pelaksanaan</label>
                  <input
                    type="date"
                    value={examConfig.scheduleDate || ''}
                    onChange={(e) => handleUpdateConfig({ scheduleDate: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Kode Sesi / Token</label>
                  <input
                    type="text"
                    value={examConfig.sessionCode || ''}
                    onChange={(e) => handleUpdateConfig({ sessionCode: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Ruang / Gelombang</label>
                  <input
                    type="text"
                    value={examConfig.roomName || ''}
                    onChange={(e) => handleUpdateConfig({ roomName: e.target.value })}
                    placeholder="Ruang CBT 01"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Jam Mulai</label>
                  <input
                    type="time"
                    value={examConfig.startTime || '07:30'}
                    onChange={(e) => handleUpdateConfig({ startTime: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Durasi (Menit)</label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={examConfig.durationMinutes}
                    onChange={(e) =>
                      handleUpdateConfig({
                        durationMinutes: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">KKM (Nilai Tuntas)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={examConfig.kkm ?? 75}
                    onChange={(e) =>
                      handleUpdateConfig({
                        kkm: Math.max(1, Math.min(100, Number(e.target.value))),
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    PIN Login Guru / Proktor
                  </label>
                  <input
                    type="text"
                    value={examConfig.proctorPin || '123456'}
                    onChange={(e) => handleUpdateConfig({ proctorPin: e.target.value })}
                    placeholder="123456"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Dipakai untuk masuk ke Dashboard Guru &amp; Admin.
                  </p>
                </div>

                <div className="flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateConfig({
                        requireRegisteredNis: !examConfig.requireRegisteredNis,
                      })
                    }
                    className={`inline-flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border ${
                      examConfig.requireRegisteredNis
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    <span>Validasi NIS Terdaftar</span>
                    <span>{examConfig.requireRegisteredNis ? 'Wajib' : 'Bebas'}</span>
                  </button>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Jika aktif, hanya NIS pada Data Siswa yang dapat masuk ujian.
                  </p>
                </div>

                <div className="flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateConfig({
                        requireSessionCode: !examConfig.requireSessionCode,
                      })
                    }
                    className={`inline-flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border ${
                      examConfig.requireSessionCode
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    <span>Validasi Token Sesi Murid</span>
                    <span>{examConfig.requireSessionCode ? 'Wajib' : 'Bebas'}</span>
                  </button>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Jika aktif, murid wajib memasukkan kode sesi ({examConfig.sessionCode || '-'}).
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateConfig({ antiCheatEnabled: !examConfig.antiCheatEnabled })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border ${
                    examConfig.antiCheatEnabled
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Sistem Anti-Curang: {examConfig.antiCheatEnabled ? 'Aktif' : 'Nonaktif'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateConfig({ shuffleQuestions: !examConfig.shuffleQuestions })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border ${
                    examConfig.shuffleQuestions
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  Acak Soal: {examConfig.shuffleQuestions ? 'Ya' : 'Tidak'}
                </button>

                {examConfig.globalSuspended ? (
                  <button
                    type="button"
                    onClick={() => sendCommand({ type: 'proctor:resume_all' })}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Aktifkan Semua Ujian
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendCommand({ type: 'proctor:suspend_all' })}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg"
                  >
                    <PauseCircle className="w-4 h-4" />
                    Suspend Semua Ruang
                  </button>
                )}
              </div>
            </div>
          </main>
        )}

        {/* 11. NILAI & CETAK */}
        {section === 'results' && (
          <main className="p-4 md:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
            {/* Grade Analytics Strip */}
            {(() => {
              const graded = sessions
                .filter((s) => s.gradeSummary)
                .map((s) => s.gradeSummary!.totalScore);
              const kkm = examConfig?.kkm ?? 75;
              const avg =
                graded.length > 0
                  ? (graded.reduce((a, b) => a + b, 0) / graded.length).toFixed(1)
                  : '—';
              const highest = graded.length > 0 ? Math.max(...graded).toFixed(1) : '—';
              const lowest = graded.length > 0 ? Math.min(...graded).toFixed(1) : '—';
              const passed = graded.filter((v) => v >= kkm).length;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs text-slate-500">Rata-Rata Nilai</p>
                    <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700">{avg}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs text-slate-500">Nilai Tertinggi</p>
                    <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">{highest}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs text-slate-500">Nilai Terendah</p>
                    <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">{lowest}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs text-slate-500">Tuntas KKM ({kkm})</p>
                    <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {passed}/{graded.length}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-base font-bold text-slate-900">
                    Hasil Ujian &amp; Rekap Nilai Otomatis
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">{examConfig?.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfExportOpen(true)}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    Preview &amp; Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!examConfig) return;
                      exportExamResultsPdf({
                        examConfig,
                        questions: activeExamQuestions,
                        sessions,
                        masterStudents,
                        scope: 'sessions_only',
                        classFilter: 'all',
                        orientation: 'landscape',
                        includeTypeBreakdown: true,
                        includeTypeSummary: true,
                        includeSignatures: true,
                        principalName: 'Kepala Sekolah',
                        proctorName: 'Guru / Proktor CBT',
                        cityName: 'Jakarta',
                      });
                      setImportToast('Laporan hasil ujian PDF berhasil diunduh.');
                    }}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <FileText className="w-4 h-4" />
                    Unduh PDF
                  </button>
                  <button
                    type="button"
                    onClick={exportExcelScores}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Export Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={exportCsvScores}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Unduh CSV
                  </button>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada peserta ujian yang masuk atau selesai.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Nama Murid</th>
                        <th className="py-3 px-4">NIS</th>
                        <th className="py-3 px-4">Kelas</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Pelanggaran</th>
                        <th className="py-3 px-4 text-right">Poin</th>
                        <th className="py-3 px-4 text-right">Nilai Akhir</th>
                        <th className="py-3 px-4 text-center">Ket. KKM</th>
                        <th className="py-3 px-4 text-right">Koreksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.map((s) => {
                        const ms = masterStudents.find((m) => m.nis === s.nis);
                        const kkm = examConfig?.kkm ?? 75;
                        const finalScore = s.gradeSummary?.totalScore;
                        const isPassed = finalScore !== undefined && finalScore >= kkm;
                        return (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">{s.nis}</td>
                            <td className="py-3 px-4 text-xs text-slate-600">{ms?.kelas || 'Peserta Langsung'}</td>
                            <td className="py-3 px-4 text-xs">{getStatusMeta(s.status).label}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{s.violations.length}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                              {s.gradeSummary ? `${s.gradeSummary.earnedPoints}/${s.gradeSummary.maxPoints}` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-blue-700">
                              {finalScore !== undefined ? finalScore : '—'}
                            </td>
                            <td className="py-3 px-4 text-center text-xs font-semibold">
                              {finalScore === undefined ? (
                                <span className="text-slate-400">Proses</span>
                              ) : isPassed ? (
                                <span className="text-emerald-700">Tuntas</span>
                              ) : (
                                <span className="text-rose-700">Belum Tuntas</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setInspectedStudentId(s.id)}
                                className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
                              >
                                Koreksi / Detail
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        )}

        {/* 12. PENGUMUMAN */}
        {section === 'announcements' && (
          <main className="p-4 md:p-6 space-y-5 max-w-4xl">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!annForm.title.trim() || !annForm.content.trim()) return;
                await fetch('/api/announcements', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(annForm),
                });
                setAnnForm({ title: '', content: '' });
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h1 className="text-base font-bold text-slate-900">Buat Pengumuman Baru</h1>
              <input
                type="text"
                value={annForm.title}
                onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Judul pengumuman..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <textarea
                rows={3}
                value={annForm.content}
                onChange={(e) => setAnnForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="Isi pengumuman untuk siswa dan guru..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Terbitkan Pengumuman
              </button>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {announcements.map((ann) => (
                <div key={ann.id} className="p-5 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">{ann.title}</p>
                    <p className="text-xs text-slate-600">{ann.content}</p>
                    <p className="text-[11px] text-slate-400">
                      {ann.author} · {new Date(ann.createdAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/announcements/${ann.id}`, { method: 'DELETE' });
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </main>
        )}

        {/* 13. MANAJEMEN USER */}
        {section === 'users' && (
          <main className="p-4 md:p-6 space-y-5 max-w-4xl">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!userForm.name.trim() || !userForm.username.trim()) return;
                await fetch('/api/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(userForm),
                });
                setUserForm({ name: '', username: '', role: 'guru' });
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama Pengguna</label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nama lengkap"
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={userForm.username}
                  onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="cth. proktor2"
                  className="w-full h-10 px-3 text-sm font-mono border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Peran</label>
                <select
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm((p) => ({ ...p, role: e.target.value as 'admin' | 'guru' | 'proktor' }))
                  }
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  <option value="guru">Guru</option>
                  <option value="proktor">Proktor</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <button
                type="submit"
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah User
              </button>
            </form>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Nama</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.username}</td>
                      <td className="py-3 px-4 text-xs uppercase font-semibold text-blue-700">{u.role}</td>
                      <td className="py-3 px-4 text-xs">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/users/${u.id}/toggle`, { method: 'PATCH' });
                          }}
                          className={u.active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}
                        >
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
                          }}
                          title="Hapus user"
                          className="w-8 h-8 inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}
      </div>

      {/* Answer Inspection Drawer */}
      {inspectedStudent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Jawaban Real-Time: {inspectedStudent.name}
                </h2>
                <p className="text-xs text-slate-500">
                  NIS {inspectedStudent.nis} · {getStatusMeta(inspectedStudent.status).label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedStudentId(null)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 flex-1">
              {activeExamQuestions.map((q, idx) => {
                const ans = inspectedStudent.answers[q.id];
                const previewGrade = gradeQuestion(
                  q,
                  ans,
                  q.type === 'essay' ? inspectedStudent.manualEssayOverrides?.[q.id] : undefined
                );
                return (
                  <div key={q.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Soal {idx + 1} · {QUESTION_TYPE_LABELS[q.type]}</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {previewGrade.earnedPoints}/{previewGrade.maxPoints} poin
                      </span>
                    </div>
                    {sanitizeImageUrl(q.imageUrl) && (
                      <img
                        src={sanitizeImageUrl(q.imageUrl) || ''}
                        alt={q.imageCaption || 'Gambar soal'}
                        className="max-h-40 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                      />
                    )}
                    <div className="text-sm text-slate-800">
                      <MathText text={q.prompt} direction={q.direction} />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 space-y-2">
                      <div>
                        <span className="font-semibold text-slate-600">Jawaban: </span>
                        {ans === undefined ? (
                          <span className="text-slate-400">Belum dijawab</span>
                        ) : typeof ans === 'string' ? (
                          <span>{ans || 'Kosong'}</span>
                        ) : Array.isArray(ans) ? (
                          <span>{ans.join(', ') || 'Kosong'}</span>
                        ) : (
                          <span className="font-mono">{JSON.stringify(ans)}</span>
                        )}
                        <p className="mt-1 text-slate-500">{previewGrade.feedback}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Single Question Pre-Exam Preview Modal */}
      {previewQuestionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="max-w-3xl w-full bg-white rounded-2xl border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Pratinjau Soal Sebelum Dimasukkan ke Ujian
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tampilan interaktif sesuai Exam Browser Siswa — coba jawab atau cek kunci sebelum menambahkan ke ujian.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuestionTarget(null)}
                className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50/70">
              <QuestionStudentPreview
                question={previewQuestionTarget.question}
                questionNumber={previewQuestionTarget.indexNumber}
                interactive
                defaultShowAnswerKey={false}
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Target Ujian:</span>
                <select
                  value={assignTargetBankId || activeBank?.id || ''}
                  onChange={(e) => setAssignTargetBankId(e.target.value)}
                  className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  {questionBanks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      [{bank.code}] {bank.name}
                      {bank.isActive ? ' (Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const q = previewQuestionTarget.question;
                    setPreviewQuestionTarget(null);
                    setEditingQuestion(q);
                    setEditorOpen(true);
                  }}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Soal
                </button>
                {(() => {
                  const targetId = assignTargetBankId || activeBank?.id || '';
                  const alreadyIn = Boolean(
                    targetId &&
                      (!previewQuestionTarget.question.bankId ||
                        previewQuestionTarget.question.bankId === targetId)
                  );
                  if (alreadyIn) {
                    return (
                      <span className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Sudah di Bank Target
                      </span>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleAssignQuestionToBank(
                          previewQuestionTarget.question.id,
                          targetId
                        );
                        setPreviewQuestionTarget(null);
                      }}
                      className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Masukkan ke Ujian Ini
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Semua Soal Modal (Student Exam View Preview) */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="max-w-4xl w-full bg-white rounded-2xl border border-slate-200 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Preview Soal Tampilan Siswa ({filteredBankQuestions.length} Soal)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulasi tampilan Exam Browser untuk seluruh soal yang sedang difilter pada paket bank ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/70">
              {filteredBankQuestions.map((q, idx) => (
                <QuestionStudentPreview
                  key={q.id}
                  question={q}
                  questionNumber={idx + 1}
                  interactive
                  defaultShowAnswerKey={false}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV / Excel Import Modal (3 TKA Question Types) */}
      {importQuestionsOpen && (
        <BulkQuestionImportModal
          questionBanks={questionBanks}
          defaultBankId={selectedBankId}
          onImportComplete={() => {
            setImportToast('Soal dari file CSV/Excel berhasil divalidasi dan diimpor ke bank soal.');
          }}
          onClose={() => setImportQuestionsOpen(false)}
        />
      )}

      {/* Atur Bobot Modal */}
      {weightsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveWeights}
            className="max-w-lg w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4 max-h-[80vh] overflow-y-auto"
          >
            <h2 className="text-base font-bold text-slate-900">Atur Bobot Nilai Soal</h2>
            <div className="space-y-2.5">
              {currentBankQuestions.map((q, idx) => (
                <div key={q.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate flex-1">
                    <strong>No. {idx + 1}</strong> ({QUESTION_TYPE_SHORT[q.type]}) · {q.subject}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={weightsDraft[q.id] ?? q.points}
                    onChange={(e) =>
                      setWeightsDraft((p) => ({ ...p, [q.id]: Number(e.target.value) }))
                    }
                    className="w-20 px-2.5 py-1.5 font-mono border border-slate-300 rounded"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWeightsModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg"
              >
                Simpan Bobot
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bank Soal Modal */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!bankForm.code.trim() || !bankForm.name.trim()) return;
              await fetch('/api/question-banks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: bankForm.code,
                  name: bankForm.name,
                  subject: bankForm.subject,
                  targetClass: bankForm.targetClass,
                  targetCounts: {
                    multiple_choice: bankForm.pg,
                    true_false: bankForm.tf,
                    mcma: bankForm.mcma,
                    complex_multiple_choice: 0,
                    matching: 0,
                    essay: 0,
                  },
                }),
              });
              setBankForm({
                code: '',
                name: '',
                subject: 'Matematika',
                targetClass: 'KELAS 6 A',
                pg: 15,
                tf: 5,
                mcma: 10,
              });
              setBankModalOpen(false);
            }}
            className="max-w-lg w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Buat Bank Soal TKA SD</h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={bankForm.code}
                onChange={(e) => setBankForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="Kode Bank (cth. TKA-MTK-04)"
                className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={bankForm.targetClass}
                onChange={(e) => setBankForm((p) => ({ ...p, targetClass: e.target.value }))}
                placeholder="Kelas Target"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <input
              type="text"
              required
              value={bankForm.name}
              onChange={(e) => setBankForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nama Paket (cth. Tryout TKA Matematika Paket 2)"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={bankForm.subject}
              onChange={(e) => setBankForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Mata Pelajaran (Matematika / Bahasa Indonesia)"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Target Jumlah per Jenis Soal TKA</p>
                <button
                  type="button"
                  onClick={() =>
                    setBankForm((p) => ({
                      ...p,
                      pg: 15,
                      tf: 5,
                      mcma: 10,
                    }))
                  }
                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                >
                  Preset Resmi TKA SD (15 PG · 5 PGK · 10 MCMA)
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {(
                  [
                    ['pg', 'Pilihan Ganda (PG)'],
                    ['tf', 'PG Kompleks (B/S)'],
                    ['mcma', 'MCMA'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
                    <input
                      type="number"
                      min={0}
                      value={bankForm[key]}
                      onChange={(e) =>
                        setBankForm((p) => ({ ...p, [key]: Number(e.target.value) }))
                      }
                      className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBankModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg"
              >
                Simpan Bank
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import Students Modal */}
      {importStudentsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleImportStudents}
            className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Import Data Siswa (CSV/Teks)</h2>
            <p className="text-xs text-slate-500">Format per baris: Nama, NIS, Kelas, NoHP</p>
            <textarea
              rows={5}
              required
              value={importStudentsText}
              onChange={(e) => setImportStudentsText(e.target.value)}
              placeholder="Dewi Lestari, 6005, KELAS 6 A, 08123456789"
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportStudentsOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg"
              >
                Import Siswa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Student Master Add/Edit Modal */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveStudent}
            className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">
              {editingStudent ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
            </h2>
            <input
              type="text"
              required
              value={stuForm.name}
              onChange={(e) => setStuForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nama Lengkap Siswa"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={stuForm.nis}
                onChange={(e) => setStuForm((p) => ({ ...p, nis: e.target.value }))}
                placeholder="NIS"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={stuForm.kelas}
                onChange={(e) => setStuForm((p) => ({ ...p, kelas: e.target.value }))}
                placeholder="Kelas"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <input
              type="text"
              value={stuForm.phone}
              onChange={(e) => setStuForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="No HP"
              className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teacher Master Add/Edit Modal */}
      {teacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveTeacher}
            className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">
              {editingTeacher ? 'Edit Data Guru' : 'Tambah Guru Baru'}
            </h2>
            <input
              type="text"
              required
              value={teaForm.name}
              onChange={(e) => setTeaForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nama Pengajar"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={teaForm.nip}
              onChange={(e) => setTeaForm((p) => ({ ...p, nip: e.target.value }))}
              placeholder="NIP / Username"
              className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={teaForm.subjects}
              onChange={(e) => setTeaForm((p) => ({ ...p, subjects: e.target.value }))}
              placeholder="Mata Pelajaran (pisahkan koma)"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={teaForm.classes}
              onChange={(e) => setTeaForm((p) => ({ ...p, classes: e.target.value }))}
              placeholder="Kelas Ampu (pisahkan koma)"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Force Stop Confirmation Modal */}
      {confirmForceStopTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Hentikan Paksa Ujian Murid?
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Sesi untuk <strong>{confirmForceStopTarget.name}</strong> akan ditutup permanen dan dinilai otomatis.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmForceStopTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  sendCommand({
                    type: 'proctor:force_stop',
                    studentId: confirmForceStopTarget.id,
                    reason: 'Ujian dihentikan secara paksa oleh guru / proktor.',
                  });
                  setConfirmForceStopTarget(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Hentikan Paksa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Editor Modal */}
      {editorOpen && (
        <QuestionEditorModal
          initialQuestion={editingQuestion}
          availableSubjects={availableSubjects}
          targetBankLabel={
            questionBanks.find(
              (b) => b.id === (editingQuestion?.bankId || selectedBankId || assignTargetBankId || activeBank?.id)
            )?.name
          }
          onSave={handleSaveQuestion}
          onClose={() => {
            setEditorOpen(false);
            setEditingQuestion(null);
          }}
        />
      )}

      {/* Printable PDF Report Preview & Export Modal */}
      {examConfig && (
        <ExamResultsPdfModal
          open={pdfExportOpen}
          onClose={() => setPdfExportOpen(false)}
          examConfig={examConfig}
          questions={activeExamQuestions}
          sessions={sessions}
          masterStudents={masterStudents}
          classes={classes}
        />
      )}
    </div>
  );
};
