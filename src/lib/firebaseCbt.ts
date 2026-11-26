import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { DEFAULT_EXAM_CONFIG, DEFAULT_QUESTIONS } from '../data/defaultQuestions';
import { isFreePracticeActive } from './freePractice';
import {
  gradeExam,
  normalizeQuestionPoints,
  sanitizeStudentAnswer,
  type GradingOptions,
} from './grading';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import type {
  Announcement,
  AuditLogEntry,
  ClassRoom,
  ElearningMaterial,
  ExamConfig,
  ExamGradeSummary,
  Question,
  QuestionBank,
  QuestionDifficulty,
  QuestionType,
  StudentAnswerValue,
  StudentMaster,
  StudentSession,
  SubjectMaster,
  TeacherMaster,
  UserAccount,
  ViolationLog,
} from '../types/cbt';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'exsaravan@gmail.com';
export const DEFAULT_ACTIVE_BANK_ID = 'bank-tka-sd';

export const DEFAULT_PUBLIC_EXAM_CONFIG: ExamConfig & { activeBankId: string } = {
  ...DEFAULT_EXAM_CONFIG,
  schoolName: 'SD Pedak',
  kkm: 75,
  shuffleQuestions: false,
  showResultToStudent: true,
  requireRegisteredNis: false,
  requireSessionCode: false,
  freePracticeEnabled: false,
  freePracticeScheduled: false,
  roomName: 'Ruang CBT 01 · Sesi Pagi',
  scheduleDate: new Date().toISOString().slice(0, 10),
  startTime: '07:30',
  endTime: '09:30',
  activeBankId: DEFAULT_ACTIVE_BANK_ID,
};

export const DEFAULT_PRIVATE_CONFIG = {
  proctorPin: '123456',
  sessionCode: 'TKA-SD-01',
};

const DEFAULT_QUESTION_BANKS: QuestionBank[] = [
  {
    id: 'bank-tka-sd',
    code: 'TKA-SD-01',
    name: 'Paket Tryout TKA SD Utama (Literasi & Numerasi)',
    subject: 'Bahasa Indonesia & Matematika',
    targetClass: 'KELAS 6 A - 6 C',
    isActive: true,
    targetCounts: {
      multiple_choice: 15,
      mcma: 10,
      true_false: 5,
      complex_multiple_choice: 0,
      matching: 0,
      essay: 0,
    },
  },
  {
    id: 'bank-tka-mtk',
    code: 'TKA-MTK-02',
    name: 'Tryout TKA SD — Matematika (Numerasi)',
    subject: 'Matematika',
    targetClass: 'KELAS 6 A',
    isActive: false,
    targetCounts: {
      multiple_choice: 15,
      mcma: 10,
      true_false: 5,
      complex_multiple_choice: 0,
      matching: 0,
      essay: 0,
    },
  },
  {
    id: 'bank-tka-bin',
    code: 'TKA-BIN-03',
    name: 'Tryout TKA SD — Bahasa Indonesia (Literasi)',
    subject: 'Bahasa Indonesia',
    targetClass: 'KELAS 6 A - 6 C',
    isActive: false,
    targetCounts: {
      multiple_choice: 15,
      mcma: 10,
      true_false: 5,
      complex_multiple_choice: 0,
      matching: 0,
      essay: 0,
    },
  },
];

const DEFAULT_MASTER_STUDENTS: StudentMaster[] = [
  { id: 'ms-1', name: 'Siti Aminah', nis: '6001', kelas: 'KELAS 6 A', phone: '081234567801' },
  { id: 'ms-2', name: 'Budi Santoso', nis: '6002', kelas: 'KELAS 6 A', phone: '081234567802' },
  { id: 'ms-3', name: 'Rina Marlina', nis: '6003', kelas: 'KELAS 6 B', phone: '081234567803' },
  { id: 'ms-4', name: 'Ahmad Rizky', nis: '6004', kelas: 'KELAS 6 B', phone: '081234567804' },
  { id: 'ms-5', name: 'Dewi Kartika', nis: '6005', kelas: 'KELAS 6 A', phone: '081234567805' },
  { id: 'ms-6', name: 'Fajar Nugroho', nis: '6006', kelas: 'KELAS 6 C', phone: '081234567806' },
];

const DEFAULT_MASTER_TEACHERS: TeacherMaster[] = [
  {
    id: 'mt-1',
    name: 'Nurfajri, S.Pd.',
    nip: '198801122015031001',
    subjects: ['Matematika — Bilangan', 'Matematika — Geometri & Pengukuran'],
    classes: ['KELAS 6 A', 'KELAS 6 B'],
    phone: '081355001122',
  },
  {
    id: 'mt-2',
    name: 'Nuramalia, S.Pd.',
    nip: '199004212018022004',
    subjects: ['Bahasa Indonesia — Teks Informasi', 'Bahasa Indonesia — Teks Fiksi'],
    classes: ['KELAS 6 A', 'KELAS 6 C'],
    phone: '081355003344',
  },
  {
    id: 'mt-3',
    name: 'H. Ahmad Fauzan, M.Pd.',
    nip: '198506152010011009',
    subjects: ['Matematika — Data', 'Bahasa Indonesia — Teks Informasi'],
    classes: ['KELAS 6 B', 'KELAS 6 C'],
    phone: '081355007788',
  },
];

const DEFAULT_CLASSES: ClassRoom[] = [
  { id: 'cls-1', name: 'KELAS 6 A', level: 'Tingkat 6 SD', homeroomTeacher: 'Nurfajri, S.Pd.' },
  { id: 'cls-2', name: 'KELAS 6 B', level: 'Tingkat 6 SD', homeroomTeacher: 'Nuramalia, S.Pd.' },
  { id: 'cls-3', name: 'KELAS 6 C', level: 'Tingkat 6 SD', homeroomTeacher: 'H. Ahmad Fauzan, M.Pd.' },
];

const DEFAULT_SUBJECTS: SubjectMaster[] = [
  { id: 'sub-1', code: 'MTK-BIL', name: 'Matematika — Bilangan', category: 'Numerasi TKA SD' },
  { id: 'sub-2', code: 'MTK-GEO', name: 'Matematika — Geometri & Pengukuran', category: 'Numerasi TKA SD' },
  { id: 'sub-3', code: 'MTK-DAT', name: 'Matematika — Data', category: 'Numerasi TKA SD' },
  { id: 'sub-4', code: 'BIN-INF', name: 'Bahasa Indonesia — Teks Informasi', category: 'Literasi TKA SD' },
  { id: 'sub-5', code: 'BIN-FIK', name: 'Bahasa Indonesia — Teks Fiksi', category: 'Literasi TKA SD' },
];

const DEFAULT_MATERIALS: ElearningMaterial[] = [
  {
    id: 'mat-1',
    title: 'Kisi-Kisi Numerasi TKA SD: Bilangan, Pecahan & Geometri',
    subject: 'Matematika',
    targetClass: 'KELAS 6',
    summary: 'Pembahasan operasi pecahan campuran, bilangan prima, serta rumus keliling & luas bangun datar.',
    content:
      'TKA Matematika SD menguji elemen Bilangan, Geometri & Pengukuran, serta Data melalui soal Pilihan Ganda Sederhana, PG Kompleks MCMA, dan PGK Kategori (Benar/Salah). Contoh pecahan: $\\frac{3}{4} + 1\\frac{1}{2} - \\frac{5}{8} = 1\\frac{5}{8}$. Luas persegi: $L = s^2$, keliling persegi panjang: $K = 2(p + l)$.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mat-2',
    title: 'Kisi-Kisi Literasi Membaca TKA SD: Teks Informasi & Teks Fiksi',
    subject: 'Bahasa Indonesia',
    targetClass: 'KELAS 6',
    summary: 'Strategi memahami ide pokok, informasi tersurat, inferensi, serta evaluasi teks bacaan TKA SD.',
    content:
      'TKA Bahasa Indonesia SD mengukur keterampilan membaca pada Teks Informasi dan Teks Fiksi meliputi pemahaman tekstual, inferensial, serta evaluasi/apresiasi. Cermati kata kunci setiap paragraf sebelum menentukan pilihan MCMA maupun kategori Benar/Salah.',
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_USERS: UserAccount[] = [
  { id: 'usr-1', name: 'Administrator Utama', username: BOOTSTRAPPED_ADMIN_EMAIL, role: 'admin', active: true },
  { id: 'usr-2', name: 'Nurfajri, S.Pd.', username: 'nurfajri', role: 'guru', active: true },
  { id: 'usr-3', name: 'Nuramalia, S.Pd.', username: 'nuramalia', role: 'proktor', active: true },
];

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Jadwal Tryout TKA SD Sesi 1',
    content: 'Mohon seluruh peserta masuk ke Exam Browser 10 menit sebelum jadwal dimulai.',
    createdAt: new Date().toISOString(),
    author: 'Administrator Utama',
  },
  {
    id: 'ann-2',
    title: 'Tata Tertib Sistem Anti-Curang CBT',
    content: 'Siswa dilarang berpindah tab atau membuka aplikasi lain saat ujian berlangsung. Pelanggaran otomatis mengunci layar ujian.',
    createdAt: new Date().toISOString(),
    author: 'Proktor Ruang',
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUndefined<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return input;
}

export function makeSafeDocId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
  if (cleaned) return cleaned;
  return `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function clampStr(raw: unknown, maxLen: number, fallback = ''): string {
  const str = typeof raw === 'string' ? raw : raw == null ? fallback : String(raw);
  return str.slice(0, maxLen);
}

function normalizeDifficulty(raw?: unknown): QuestionDifficulty {
  if (raw === 'easy' || raw === 'hard' || raw === 'medium') return raw;
  return 'medium';
}

export interface PublicQuestionDoc {
  id: string;
  bankId: string;
  isActiveBank: boolean;
  type: QuestionType;
  subject: string;
  topic?: string;
  difficulty?: QuestionDifficulty;
  prompt: string;
  imageUrl?: string;
  imageCaption?: string;
  points: number;
  direction?: 'ltr' | 'rtl' | 'auto';
  scoringMode?: 'partial' | 'exact';
  options?: { id: string; text: string; imageUrl?: string }[];
  pairs?: { id: string; left: string; right: string }[];
  statements?: { id: string; text: string }[];
  updatedAt: string;
}

export interface QuestionKeyDoc {
  id: string;
  bankId: string;
  type: QuestionType;
  correctOptionId?: string;
  correctOptionIds?: string[];
  statementKeys?: Record<string, boolean>;
  expectedKeywords?: string[];
  sampleAnswer?: string;
  explanation?: string;
  updatedAt: string;
}

export function toPublicQuestionDoc(
  q: Question,
  isActiveBank: boolean,
  updatedAt = new Date().toISOString()
): PublicQuestionDoc {
  const id = makeSafeDocId(q.id, 'q');
  const bankId = makeSafeDocId(q.bankId || DEFAULT_ACTIVE_BANK_ID, 'bank');
  const base: PublicQuestionDoc = {
    id,
    bankId,
    isActiveBank,
    type: q.type,
    subject: clampStr(q.subject || 'Umum', 120) || 'Umum',
    topic: q.topic ? clampStr(q.topic, 120) : undefined,
    difficulty: normalizeDifficulty(q.difficulty),
    prompt: clampStr(q.prompt || '', 15000),
    imageUrl: q.imageUrl ? clampStr(q.imageUrl, 350000) : undefined,
    imageCaption: q.imageCaption ? clampStr(q.imageCaption, 300) : undefined,
    points: normalizeQuestionPoints(q.points) || 1,
    direction: q.direction || 'ltr',
    updatedAt,
  };

  if (q.type === 'multiple_choice' || q.type === 'complex_multiple_choice' || q.type === 'mcma') {
    base.options = (q.options || []).slice(0, 12).map((o) =>
      stripUndefined({
        id: clampStr(o.id, 64),
        text: clampStr(o.text, 2000),
        imageUrl: o.imageUrl ? clampStr(o.imageUrl, 350000) : undefined,
      })
    );
    if (q.type === 'mcma') {
      base.scoringMode = q.scoringMode || 'partial';
    }
  } else if (q.type === 'matching') {
    base.pairs = (q.pairs || []).slice(0, 12).map((p) => ({
      id: clampStr(p.id, 64),
      left: clampStr(p.left, 1000),
      right: clampStr(p.right, 1000),
    }));
  } else if (q.type === 'true_false') {
    base.statements = (q.statements || []).slice(0, 12).map((s) => ({
      id: clampStr(s.id, 64),
      text: clampStr(s.text, 2000),
    }));
  }

  return stripUndefined(base);
}

export function toQuestionKeyDoc(
  q: Question,
  updatedAt = new Date().toISOString()
): QuestionKeyDoc {
  const id = makeSafeDocId(q.id, 'q');
  const bankId = makeSafeDocId(q.bankId || DEFAULT_ACTIVE_BANK_ID, 'bank');
  const keyDoc: QuestionKeyDoc = {
    id,
    bankId,
    type: q.type,
    explanation: q.explanation ? clampStr(q.explanation, 10000) : undefined,
    updatedAt,
  };

  if (q.type === 'multiple_choice') {
    keyDoc.correctOptionId = clampStr(q.correctOptionId || '', 64);
  } else if (q.type === 'complex_multiple_choice' || q.type === 'mcma') {
    keyDoc.correctOptionIds = (q.correctOptionIds || []).slice(0, 12).map((item) => clampStr(item, 64));
  } else if (q.type === 'true_false') {
    const map: Record<string, boolean> = {};
    for (const st of q.statements || []) {
      map[st.id] = Boolean(st.isTrue);
    }
    keyDoc.statementKeys = map;
  } else if (q.type === 'essay') {
    keyDoc.expectedKeywords = (q.expectedKeywords || [])
      .slice(0, 30)
      .map((kw) => clampStr(kw, 120));
    keyDoc.sampleAnswer = clampStr(q.sampleAnswer || '', 10000);
  }

  return stripUndefined(keyDoc);
}

export function mergePublicAndKeyQuestion(
  pub: PublicQuestionDoc,
  key?: QuestionKeyDoc
): Question {
  const base = {
    id: pub.id,
    bankId: pub.bankId,
    type: pub.type,
    subject: pub.subject,
    topic: pub.topic,
    difficulty: pub.difficulty,
    prompt: pub.prompt,
    imageUrl: pub.imageUrl,
    imageCaption: pub.imageCaption,
    explanation: key?.explanation,
    points: pub.points,
    direction: pub.direction,
  };

  switch (pub.type) {
    case 'multiple_choice':
      return {
        ...base,
        type: 'multiple_choice',
        options: pub.options || [],
        correctOptionId: key?.correctOptionId || '',
      };
    case 'complex_multiple_choice':
      return {
        ...base,
        type: 'complex_multiple_choice',
        options: pub.options || [],
        correctOptionIds: key?.correctOptionIds || [],
      };
    case 'mcma':
      return {
        ...base,
        type: 'mcma',
        options: pub.options || [],
        correctOptionIds: key?.correctOptionIds || [],
        scoringMode: pub.scoringMode || 'partial',
      };
    case 'matching':
      return {
        ...base,
        type: 'matching',
        pairs: pub.pairs || [],
      };
    case 'true_false':
      return {
        ...base,
        type: 'true_false',
        statements: (pub.statements || []).map((st) => ({
          id: st.id,
          text: st.text,
          isTrue: Boolean(key?.statementKeys?.[st.id]),
        })),
      };
    case 'essay':
      return {
        ...base,
        type: 'essay',
        expectedKeywords: key?.expectedKeywords || [],
        sampleAnswer: key?.sampleAnswer || '',
      };
  }
}

export function buildPublicConfigPayload(
  cfg: ExamConfig & { activeBankId?: string },
  updatedAt = new Date().toISOString()
) {
  return stripUndefined({
    id: makeSafeDocId(cfg.id || 'tryout-tka-sd-2026', 'exam'),
    title: clampStr(cfg.title || DEFAULT_PUBLIC_EXAM_CONFIG.title, 200) || DEFAULT_PUBLIC_EXAM_CONFIG.title,
    subtitle: clampStr(cfg.subtitle || '', 400),
    schoolName: clampStr(cfg.schoolName || 'SD Pedak', 120) || 'SD Pedak',
    roomName: clampStr(cfg.roomName || '', 120),
    activeBankId: makeSafeDocId(cfg.activeBankId || DEFAULT_ACTIVE_BANK_ID, 'bank'),
    durationMinutes: Math.max(1, Math.min(600, Number(cfg.durationMinutes) || 90)),
    kkm: Math.max(0, Math.min(100, Number(cfg.kkm ?? 75))),
    antiCheatEnabled: Boolean(cfg.antiCheatEnabled),
    globalSuspended: Boolean(cfg.globalSuspended),
    maxViolationsBeforeLock: Math.max(1, Math.min(20, Number(cfg.maxViolationsBeforeLock) || 3)),
    violationPolicy: cfg.violationPolicy === 'force_submit' ? 'force_submit' : 'lock',
    shuffleQuestions: Boolean(cfg.shuffleQuestions),
    shuffleOptions: Boolean(cfg.shuffleOptions),
    preventBackNavigation: Boolean(cfg.preventBackNavigation),
    negativeMarking: Boolean(cfg.negativeMarking),
    negativePenaltyRatio: Math.max(0, Math.min(1, Number(cfg.negativePenaltyRatio ?? 0.25))),
    watermarkEnabled: cfg.watermarkEnabled !== false,
    showResultToStudent: cfg.showResultToStudent !== false,
    requireRegisteredNis: Boolean(cfg.requireRegisteredNis),
    requireSessionCode: Boolean(cfg.requireSessionCode),
    freePracticeEnabled: Boolean(cfg.freePracticeEnabled),
    freePracticeScheduled: Boolean(cfg.freePracticeScheduled),
    freePracticeStartAt: cfg.freePracticeStartAt ? clampStr(cfg.freePracticeStartAt, 64) : undefined,
    freePracticeEndAt: cfg.freePracticeEndAt ? clampStr(cfg.freePracticeEndAt, 64) : undefined,
    scheduleDate: cfg.scheduleDate ? clampStr(cfg.scheduleDate, 32) : undefined,
    startTime: cfg.startTime ? clampStr(cfg.startTime, 16) : undefined,
    endTime: cfg.endTime ? clampStr(cfg.endTime, 16) : undefined,
    updatedAt,
  });
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  const email = (user.email || '').trim().toLowerCase();
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) return true;

  try {
    const uidSnap = await getDoc(doc(db, 'admins', user.uid));
    if (uidSnap.exists()) return true;
  } catch {
    // non-admin or missing
  }

  if (email) {
    try {
      const emailSnap = await getDoc(doc(db, 'adminEmails', email));
      if (emailSnap.exists() && emailSnap.data()?.active !== false) {
        return true;
      }
    } catch {
      // non-admin or missing
    }
  }
  return false;
}

export function subscribePublicExamConfig(
  onUpdate: (config: ExamConfig & { activeBankId?: string }) => void,
  onReachable?: (reachable: boolean) => void
): Unsubscribe {
  const ref = doc(db, 'publicConfig', 'exam');
  return onSnapshot(
    ref,
    (snap) => {
      onReachable?.(true);
      if (snap.exists()) {
        onUpdate({
          ...DEFAULT_PUBLIC_EXAM_CONFIG,
          ...(snap.data() as Partial<ExamConfig & { activeBankId?: string }>),
        });
      } else {
        onUpdate(DEFAULT_PUBLIC_EXAM_CONFIG);
      }
    },
    (error) => {
      onReachable?.(false);
      // Public config read failure shouldn't crash portal screen if offline
      console.warn('Public config snapshot notice:', error);
    }
  );
}

async function commitBatchedWrites(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>
): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + CHUNK_SIZE);
    for (const op of slice) {
      op(batch);
    }
    await batch.commit();
  }
}

export async function ensureInitialSeedData(): Promise<void> {
  const pubRef = doc(db, 'publicConfig', 'exam');
  try {
    const pubSnap = await getDoc(pubRef);
    const existingPrivateSnap = await getDoc(doc(db, 'privateConfig', 'exam'));
    if (pubSnap.exists() && existingPrivateSnap.exists()) {
      return;
    }

    const nowIso = new Date().toISOString();
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    ops.push((b) => b.set(pubRef, buildPublicConfigPayload(DEFAULT_PUBLIC_EXAM_CONFIG, nowIso)));
    ops.push((b) =>
      b.set(doc(db, 'privateConfig', 'exam'), {
        ...DEFAULT_PRIVATE_CONFIG,
        updatedAt: nowIso,
      })
    );

    const codeUpper = DEFAULT_PRIVATE_CONFIG.sessionCode.toUpperCase();
    ops.push((b) =>
      b.set(doc(db, 'sessionCodes', makeSafeDocId(codeUpper, 'code')), {
        code: makeSafeDocId(codeUpper, 'code'),
        active: true,
        updatedAt: nowIso,
      })
    );

    for (const bank of DEFAULT_QUESTION_BANKS) {
      ops.push((b) =>
        b.set(doc(db, 'questionBanks', bank.id), {
          ...bank,
          updatedAt: nowIso,
        })
      );
    }

    for (const rawQ of DEFAULT_QUESTIONS) {
      const q: Question = { ...rawQ, bankId: DEFAULT_ACTIVE_BANK_ID };
      ops.push((b) =>
        b.set(doc(db, 'questions', q.id), toPublicQuestionDoc(q, true, nowIso))
      );
      ops.push((b) =>
        b.set(doc(db, 'questionKeys', q.id), toQuestionKeyDoc(q, nowIso))
      );
    }

    for (const stu of DEFAULT_MASTER_STUDENTS) {
      ops.push((b) => b.set(doc(db, 'masterStudents', stu.id), stu));
      const nisId = makeSafeDocId(stu.nis.toLowerCase(), 'nis');
      ops.push((b) =>
        b.set(doc(db, 'nisRegistry', nisId), {
          nis: stu.nis,
          name: stu.name,
          registered: true,
          updatedAt: nowIso,
        })
      );
    }

    for (const t of DEFAULT_MASTER_TEACHERS) {
      ops.push((b) => b.set(doc(db, 'masterTeachers', t.id), t));
    }
    for (const cls of DEFAULT_CLASSES) {
      ops.push((b) => b.set(doc(db, 'classes', cls.id), cls));
    }
    for (const sub of DEFAULT_SUBJECTS) {
      ops.push((b) => b.set(doc(db, 'subjects', sub.id), sub));
    }
    for (const mat of DEFAULT_MATERIALS) {
      ops.push((b) => b.set(doc(db, 'materials', mat.id), mat));
    }
    for (const u of DEFAULT_USERS) {
      ops.push((b) => b.set(doc(db, 'users', u.id), u));
    }
    for (const ann of DEFAULT_ANNOUNCEMENTS) {
      ops.push((b) =>
        b.set(doc(db, 'announcements', ann.id), {
          ...ann,
          published: true,
        })
      );
    }

    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'publicConfig/exam');
  }
}

export async function verifyProctorPinAccess(
  user: User,
  username: string,
  pin: string
): Promise<{ ok: boolean; error?: string; userName?: string }> {
  const isAdmin = await checkUserIsAdmin(user);
  if (!isAdmin) {
    return {
      ok: false,
      error: `Akun Google (${user.email || 'tidak diketahui'}) belum memiliki izin Guru / Proktor.`,
    };
  }

  await ensureInitialSeedData();

  try {
    const privSnap = await getDoc(doc(db, 'privateConfig', 'exam'));
    const expectedPin = String(
      privSnap.exists() ? privSnap.data()?.proctorPin || '123456' : '123456'
    ).trim();
    if (pin.trim() !== expectedPin) {
      return { ok: false, error: 'PIN Proktor / Guru tidak sesuai.' };
    }

    const normUser = username.trim().toLowerCase();
    if (normUser) {
      const usersSnap = await getDocs(collection(db, 'users'));
      const matched = usersSnap.docs
        .map((d) => d.data() as UserAccount)
        .find((u) => u.username.toLowerCase() === normUser);
      if (matched && !matched.active) {
        return { ok: false, error: `Akun "${username}" sedang dinonaktifkan oleh admin.` };
      }
      if (matched) {
        return { ok: true, userName: matched.name };
      }
    }

    return {
      ok: true,
      userName: user.displayName || user.email || 'Administrator Utama',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'privateConfig/exam');
  }
}

export async function verifyStudentExamEntry(params: {
  user: User;
  name: string;
  nis: string;
  sessionCode: string;
  publicConfig: ExamConfig;
}): Promise<{
  ok: boolean;
  error?: string;
  studentId?: string;
  studentName?: string;
  nis?: string;
}> {
  const { user, name, nis, sessionCode, publicConfig } = params;
  const trimmedName = name.trim();
  const trimmedNis = nis.trim();
  if (!trimmedName || !trimmedNis) {
    return { ok: false, error: 'Nama lengkap dan NIS wajib diisi.' };
  }
  if (!user.emailVerified) {
    return { ok: false, error: 'Akun Google belum terverifikasi emailnya.' };
  }

  const freePracticeActive = isFreePracticeActive(publicConfig);
  if (publicConfig.requireSessionCode && !freePracticeActive) {
    const cleanCode = makeSafeDocId(sessionCode.trim().toUpperCase(), 'invalid');
    if (!sessionCode.trim()) {
      return { ok: false, error: 'Masukkan kode sesi / token ujian yang diberikan proktor.' };
    }
    try {
      const codeSnap = await getDoc(doc(db, 'sessionCodes', cleanCode));
      if (!codeSnap.exists() || codeSnap.data()?.active !== true) {
        return {
          ok: false,
          error: 'Kode sesi / token ujian tidak valid. Periksa kembali token dari proktor.',
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `sessionCodes/${cleanCode}`);
    }
  }

  let verifiedName = trimmedName;
  if (publicConfig.requireRegisteredNis) {
    const cleanNisId = makeSafeDocId(trimmedNis.toLowerCase(), 'nis');
    try {
      const nisSnap = await getDoc(doc(db, 'nisRegistry', cleanNisId));
      if (!nisSnap.exists() || nisSnap.data()?.registered !== true) {
        return {
          ok: false,
          error: `NIS "${trimmedNis}" tidak terdaftar pada Data Siswa ujian ini.`,
        };
      }
      verifiedName = String(nisSnap.data()?.name || trimmedName);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `nisRegistry/${cleanNisId}`);
    }
  }

  return {
    ok: true,
    studentId: user.uid,
    studentName: verifiedName,
    nis: trimmedNis,
  };
}

function fromFirestoreSession(raw: Record<string, unknown>, id: string): StudentSession {
  return {
    id,
    name: String(raw.name || 'Peserta'),
    nis: String(raw.nis || ''),
    status: (raw.status as StudentSession['status']) || 'active',
    answers: (raw.answers as Record<string, StudentAnswerValue>) || {},
    doubtfulIds: Array.isArray(raw.doubtfulIds) ? (raw.doubtfulIds as string[]) : [],
    violations: Array.isArray(raw.violations) ? (raw.violations as ViolationLog[]) : [],
    connected: Boolean(raw.connected),
    startedAt: String(raw.startedAt || new Date().toISOString()),
    lastActiveAt: String(raw.lastActiveAt || new Date().toISOString()),
    endedAt: raw.endedAt ? String(raw.endedAt) : undefined,
    remainingSeconds: Number(raw.remainingSeconds ?? 0),
    gradeSummary: raw.gradeSummary as ExamGradeSummary | undefined,
    manualEssayOverrides: raw.manualEssayOverrides as Record<string, number> | undefined,
    suspendReason: raw.suspendReason ? String(raw.suspendReason) : undefined,
  };
}

export async function recordAuditLogEntry(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const nowIso = new Date().toISOString();
  const id = makeSafeDocId(`aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'aud');
  try {
    await setDoc(
      doc(db, 'auditLogs', id),
      stripUndefined({
        id,
        ownerUid: uid,
        timestamp: nowIso,
        actor: clampStr(entry.actor || 'Sistem', 120) || 'Sistem',
        action: entry.action,
        studentId: entry.studentId ? makeSafeDocId(entry.studentId, 'stu') : undefined,
        studentName: entry.studentName ? clampStr(entry.studentName, 120) : undefined,
        nis: entry.nis ? clampStr(entry.nis, 64) : undefined,
        detail: clampStr(entry.detail || '-', 600) || '-',
        createdAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `auditLogs/${id}`);
  }
}

export async function joinOrResumeStudentSession(params: {
  uid: string;
  name: string;
  nis: string;
  publicConfig: ExamConfig;
}): Promise<StudentSession> {
  const { uid, name, nis, publicConfig } = params;
  const sessRef = doc(db, 'examSessions', uid);
  const nowIso = new Date().toISOString();

  try {
    const snap = await getDoc(sessRef);
    if (!snap.exists()) {
      const created: StudentSession = {
        id: uid,
        name: clampStr(name.trim() || 'Peserta', 120) || 'Peserta',
        nis: clampStr(nis.trim() || '0000', 64) || '0000',
        status: publicConfig.globalSuspended ? 'suspended' : 'active',
        answers: {},
        doubtfulIds: [],
        violations: [],
        connected: true,
        startedAt: nowIso,
        lastActiveAt: nowIso,
        remainingSeconds: Math.max(60, (Number(publicConfig.durationMinutes) || 90) * 60),
        suspendReason: publicConfig.globalSuspended
          ? 'Ujian ruang sedang ditangguhkan oleh proktor.'
          : undefined,
      };
      await setDoc(
        sessRef,
        stripUndefined({
          ...created,
          ownerUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await recordAuditLogEntry({
        actor: created.name,
        action: 'join',
        studentId: uid,
        studentName: created.name,
        nis: created.nis,
        detail: 'Memulai sesi ujian baru.',
      });
      return created;
    }

    const existing = fromFirestoreSession(snap.data() as Record<string, unknown>, uid);
    if (existing.status !== 'submitted' && existing.status !== 'force_stopped') {
      await updateDoc(sessRef, {
        connected: true,
        name: clampStr(name.trim() || existing.name, 120),
        nis: clampStr(nis.trim() || existing.nis, 64),
        lastActiveAt: nowIso,
        remainingSeconds: existing.remainingSeconds,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLogEntry({
        actor: existing.name,
        action: 'resume',
        studentId: uid,
        studentName: existing.name,
        nis: existing.nis,
        detail: `Memulihkan sesi (sisa ${Math.floor(existing.remainingSeconds / 60)}m).`,
      });
    }
    return existing;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `examSessions/${uid}`);
  }
}

export async function syncStudentAnswers(params: {
  uid: string;
  answers: Record<string, StudentAnswerValue>;
  remainingSeconds: number;
}): Promise<void> {
  const { uid, answers, remainingSeconds } = params;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'examSessions', uid), {
      answers,
      remainingSeconds: Math.max(0, Math.floor(remainingSeconds)),
      connected: true,
      lastActiveAt: nowIso,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `examSessions/${uid}`);
  }
}

export async function syncStudentDoubtful(params: {
  uid: string;
  doubtfulIds: string[];
}): Promise<void> {
  const { uid, doubtfulIds } = params;
  try {
    await updateDoc(doc(db, 'examSessions', uid), {
      doubtfulIds: doubtfulIds.slice(0, 200),
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `examSessions/${uid}`);
  }
}

export async function setStudentOfflinePresence(
  uid: string,
  remainingSeconds: number
): Promise<void> {
  try {
    await updateDoc(doc(db, 'examSessions', uid), {
      connected: false,
      remainingSeconds: Math.max(0, Math.floor(remainingSeconds)),
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // ignore unload race
  }
}

export async function reportStudentViolation(params: {
  session: StudentSession;
  examConfig: ExamConfig;
  reason: string;
}): Promise<{
  violation: ViolationLog;
  warningOnly: boolean;
  count: number;
  max: number;
  nextStatus: StudentSession['status'];
}> {
  const { session, examConfig, reason } = params;
  const nowIso = new Date().toISOString();
  const vioId = makeSafeDocId(`vio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'vio');
  const violation: ViolationLog = {
    id: vioId,
    studentId: session.id,
    studentName: session.name,
    nis: session.nis,
    reason: clampStr(reason, 500) || 'Pelanggaran terdeteksi',
    timestamp: nowIso,
    resolved: false,
  };

  const nextViolations = [violation, ...session.violations].slice(0, 100);
  const threshold = Math.max(1, Number(examConfig.maxViolationsBeforeLock) || 3);
  const totalViolations = nextViolations.length;
  let nextStatus: StudentSession['status'] = session.status;
  let endedAt: string | undefined;
  let suspendReason: string | undefined;
  let warningOnly = false;

  if (examConfig.antiCheatEnabled) {
    if (totalViolations < threshold) {
      warningOnly = true;
    } else if (examConfig.violationPolicy === 'force_submit') {
      nextStatus = 'force_stopped';
      endedAt = nowIso;
      suspendReason = clampStr(
        `Ujian dihentikan otomatis setelah ${totalViolations} pelanggaran (${violation.reason}).`,
        500
      );
    } else {
      nextStatus = 'violation_locked';
    }
  }

  try {
    await updateDoc(
      doc(db, 'examSessions', session.id),
      stripUndefined({
        violations: nextViolations,
        status: nextStatus,
        endedAt,
        suspendReason,
        lastActiveAt: nowIso,
        updatedAt: serverTimestamp(),
      })
    );

    await setDoc(doc(db, 'violations', vioId), {
      ...violation,
      ownerUid: session.id,
      createdAt: serverTimestamp(),
    });

    await recordAuditLogEntry({
      actor: warningOnly ? session.name : 'Sistem Anti-Curang',
      action: warningOnly
        ? 'violation_warning'
        : nextStatus === 'force_stopped'
          ? 'force_stop'
          : 'violation_lock',
      studentId: session.id,
      studentName: session.name,
      nis: session.nis,
      detail: warningOnly
        ? `Peringatan pelanggaran (${totalViolations}/${threshold}): ${violation.reason}`
        : nextStatus === 'force_stopped'
          ? `Kumpul paksa otomatis setelah mencapai batas ${threshold} pelanggaran: ${violation.reason}`
          : `Layar dikunci (${totalViolations}/${threshold}): ${violation.reason}`,
    });

    return {
      violation,
      warningOnly,
      count: totalViolations,
      max: threshold,
      nextStatus,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `examSessions/${session.id}`);
  }
}

export async function fetchUnlockedQuestionKeys(
  questions: Question[]
): Promise<Question[]> {
  if (questions.length === 0) return [];
  try {
    const keySnaps = await Promise.all(
      questions.map((q) => getDoc(doc(db, 'questionKeys', q.id)))
    );
    const keyMap = new Map<string, QuestionKeyDoc>();
    for (const ks of keySnaps) {
      if (ks.exists()) {
        keyMap.set(ks.id, ks.data() as QuestionKeyDoc);
      }
    }
    return questions.map((q) =>
      mergePublicAndKeyQuestion(
        toPublicQuestionDoc(q, true, new Date().toISOString()),
        keyMap.get(q.id)
      )
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'questionKeys');
  }
}

export async function submitAndGradeStudentExam(params: {
  session: StudentSession;
  activeQuestions: Question[];
  examConfig: ExamConfig;
  remainingSeconds: number;
}): Promise<ExamGradeSummary | null> {
  const { session, activeQuestions, examConfig, remainingSeconds } = params;
  const sessRef = doc(db, 'examSessions', session.id);
  const nowIso = new Date().toISOString();

  try {
    if (session.status !== 'submitted' && session.status !== 'force_stopped') {
      await updateDoc(sessRef, {
        answers: session.answers,
        status: 'submitted',
        endedAt: nowIso,
        lastActiveAt: nowIso,
        remainingSeconds: Math.max(0, Math.floor(remainingSeconds)),
        updatedAt: serverTimestamp(),
      });
    }

    const fullQs = await fetchUnlockedQuestionKeys(activeQuestions);
    const summary = gradeExam(fullQs, session.answers, session.manualEssayOverrides, {
      negativeMarking: examConfig.negativeMarking,
      negativePenaltyRatio: examConfig.negativePenaltyRatio,
      kkm: examConfig.kkm ?? 75,
    });

    if (!session.gradeSummary) {
      await updateDoc(sessRef, {
        gradeSummary: stripUndefined(summary),
        updatedAt: serverTimestamp(),
      });
    }

    await recordAuditLogEntry({
      actor: session.name,
      action: 'submit',
      studentId: session.id,
      studentName: session.name,
      nis: session.nis,
      detail: `Mengumpulkan ujian (Skor: ${summary.totalScore}).`,
    });

    return summary;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `examSessions/${session.id}`);
  }
}

export function subscribeStudentExamRealtime(params: {
  uid: string;
  onConfig: (config: ExamConfig) => void;
  onQuestions: (questions: Question[]) => void;
  onSession: (session: StudentSession | null, exists: boolean) => void;
  onAnnouncements: (announcements: Announcement[]) => void;
  onLiveAnnouncement?: (ann: Announcement) => void;
}): Unsubscribe {
  const { uid, onConfig, onQuestions, onSession, onAnnouncements, onLiveAnnouncement } = params;
  const unsubs: Unsubscribe[] = [];
  let knownAnnIds: Set<string> | null = null;

  unsubs.push(
    onSnapshot(
      doc(db, 'publicConfig', 'exam'),
      (snap) => {
        if (snap.exists()) {
          onConfig({
            ...DEFAULT_PUBLIC_EXAM_CONFIG,
            ...(snap.data() as Partial<ExamConfig>),
          });
        } else {
          onConfig(DEFAULT_PUBLIC_EXAM_CONFIG);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'publicConfig/exam')
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'questions'), where('isActiveBank', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((d) => mergePublicAndKeyQuestion(d.data() as PublicQuestionDoc))
          .sort((a, b) => a.id.localeCompare(b.id));
        onQuestions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'examSessions', uid),
      (snap) => {
        if (!snap.exists()) {
          onSession(null, false);
          return;
        }
        onSession(fromFirestoreSession(snap.data() as Record<string, unknown>, snap.id), true);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `examSessions/${uid}`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'announcements'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Announcement)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (knownAnnIds === null) {
          knownAnnIds = new Set(list.map((a) => a.id));
        } else {
          for (const ann of list) {
            if (!knownAnnIds.has(ann.id)) {
              knownAnnIds.add(ann.id);
              onLiveAnnouncement?.(ann);
            }
          }
        }
        onAnnouncements(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

// =======================
// PROCTOR DASHBOARD LAYER
// =======================

export interface ProctorSnapshotHandlers {
  onConfig: (config: ExamConfig) => void;
  onQuestionBanks: (banks: QuestionBank[]) => void;
  onQuestions: (questions: Question[]) => void;
  onSessions: (sessions: StudentSession[]) => void;
  onViolations: (violations: ViolationLog[]) => void;
  onAuditLogs: (logs: AuditLogEntry[]) => void;
  onAnnouncements: (anns: Announcement[]) => void;
  onMasterStudents: (list: StudentMaster[]) => void;
  onMasterTeachers: (list: TeacherMaster[]) => void;
  onClasses: (list: ClassRoom[]) => void;
  onSubjects: (list: SubjectMaster[]) => void;
  onMaterials: (list: ElearningMaterial[]) => void;
  onUsers: (list: UserAccount[]) => void;
  onLiveViolation?: (v: ViolationLog, s?: StudentSession) => void;
}

export function subscribeProctorDashboardRealtime(
  handlers: ProctorSnapshotHandlers
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  let publicCfg: Partial<ExamConfig> = { ...DEFAULT_PUBLIC_EXAM_CONFIG };
  let privateCfg: Partial<ExamConfig> = { ...DEFAULT_PRIVATE_CONFIG };
  let pubQuestions: PublicQuestionDoc[] = [];
  let keyMap = new Map<string, QuestionKeyDoc>();
  let latestSessions: StudentSession[] = [];
  let knownViolationIds: Set<string> | null = null;

  const emitConfig = () => {
    handlers.onConfig({
      ...DEFAULT_PUBLIC_EXAM_CONFIG,
      ...publicCfg,
      ...privateCfg,
    });
  };

  const emitMergedQuestions = () => {
    const merged = pubQuestions
      .map((pq) => mergePublicAndKeyQuestion(pq, keyMap.get(pq.id)))
      .sort((a, b) => a.id.localeCompare(b.id));
    handlers.onQuestions(merged);
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'publicConfig', 'exam'),
      (snap) => {
        if (snap.exists()) {
          publicCfg = snap.data() as Partial<ExamConfig>;
          emitConfig();
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'publicConfig/exam')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'privateConfig', 'exam'),
      (snap) => {
        if (snap.exists()) {
          privateCfg = snap.data() as Partial<ExamConfig>;
          emitConfig();
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'privateConfig/exam')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'questionBanks'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as QuestionBank);
        handlers.onQuestionBanks(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questionBanks')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'questions'),
      (snap) => {
        pubQuestions = snap.docs.map((d) => d.data() as PublicQuestionDoc);
        emitMergedQuestions();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'questionKeys'),
      (snap) => {
        const nextMap = new Map<string, QuestionKeyDoc>();
        snap.docs.forEach((d) => nextMap.set(d.id, d.data() as QuestionKeyDoc));
        keyMap = nextMap;
        emitMergedQuestions();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'questionKeys')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'examSessions'),
      (snap) => {
        latestSessions = snap.docs
          .map((d) => fromFirestoreSession(d.data() as Record<string, unknown>, d.id))
          .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
        handlers.onSessions(latestSessions);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'examSessions')
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'violations'), orderBy('timestamp', 'desc'), limit(60)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ViolationLog);
        if (knownViolationIds === null) {
          knownViolationIds = new Set(list.map((v) => v.id));
        } else {
          for (const v of list) {
            if (!knownViolationIds.has(v.id)) {
              knownViolationIds.add(v.id);
              const matchedSession = latestSessions.find((s) => s.id === v.studentId);
              handlers.onLiveViolation?.(v, matchedSession);
              break;
            }
          }
        }
        handlers.onViolations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'violations')
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200)),
      (snap) => {
        handlers.onAuditLogs(snap.docs.map((d) => d.data() as AuditLogEntry));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'announcements'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Announcement)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        handlers.onAnnouncements(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'masterStudents'),
      (snap) => {
        handlers.onMasterStudents(snap.docs.map((d) => d.data() as StudentMaster));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'masterStudents')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'masterTeachers'),
      (snap) => {
        handlers.onMasterTeachers(snap.docs.map((d) => d.data() as TeacherMaster));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'masterTeachers')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'classes'),
      (snap) => {
        handlers.onClasses(snap.docs.map((d) => d.data() as ClassRoom));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'classes')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'subjects'),
      (snap) => {
        handlers.onSubjects(snap.docs.map((d) => d.data() as SubjectMaster));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'subjects')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'materials'),
      (snap) => {
        handlers.onMaterials(snap.docs.map((d) => d.data() as ElearningMaterial));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'users'),
      (snap) => {
        handlers.onUsers(snap.docs.map((d) => d.data() as UserAccount));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function updateExamConfigInFirestore(params: {
  currentConfig: ExamConfig;
  patch: Partial<ExamConfig>;
  activeQuestions: Question[];
  sessions: StudentSession[];
}): Promise<void> {
  const { currentConfig, patch, activeQuestions, sessions } = params;
  const merged = { ...currentConfig, ...patch };
  const nowIso = new Date().toISOString();

  try {
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    ops.push((b) =>
      b.set(doc(db, 'publicConfig', 'exam'), buildPublicConfigPayload(merged, nowIso))
    );

    if (patch.proctorPin !== undefined || patch.sessionCode !== undefined) {
      const nextPin = clampStr(merged.proctorPin || '123456', 64) || '123456';
      const nextCode = clampStr(merged.sessionCode || 'TKA-SD-01', 64);
      ops.push((b) =>
        b.set(doc(db, 'privateConfig', 'exam'), {
          proctorPin: nextPin,
          sessionCode: nextCode,
          updatedAt: nowIso,
        })
      );
      if (nextCode.trim()) {
        const codeId = makeSafeDocId(nextCode.trim().toUpperCase(), 'code');
        ops.push((b) =>
          b.set(doc(db, 'sessionCodes', codeId), {
            code: codeId,
            active: true,
            updatedAt: nowIso,
          })
        );
      }
    }

    const gradingChanged =
      patch.kkm !== undefined ||
      patch.negativeMarking !== undefined ||
      patch.negativePenaltyRatio !== undefined;

    if (gradingChanged) {
      const opts: GradingOptions = {
        kkm: merged.kkm ?? 75,
        negativeMarking: merged.negativeMarking,
        negativePenaltyRatio: merged.negativePenaltyRatio,
      };
      for (const s of sessions) {
        if (s.status === 'submitted' || s.status === 'force_stopped') {
          const summary = gradeExam(activeQuestions, s.answers, s.manualEssayOverrides, opts);
          ops.push((b) =>
            b.update(doc(db, 'examSessions', s.id), {
              gradeSummary: stripUndefined(summary),
              updatedAt: serverTimestamp(),
            })
          );
        }
      }
    }

    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'publicConfig/exam');
  }
}

export async function createQuestionBankInFirestore(input: {
  code: string;
  name: string;
  subject: string;
  targetClass: string;
  targetCounts?: Record<QuestionType, number>;
}): Promise<QuestionBank> {
  const nowIso = new Date().toISOString();
  const id = makeSafeDocId(`bank-${Date.now()}`, 'bank');
  const created: QuestionBank = {
    id,
    code: clampStr(input.code.trim().toUpperCase(), 64),
    name: clampStr(input.name.trim(), 200),
    subject: clampStr(input.subject.trim() || 'Umum', 120),
    targetClass: clampStr(input.targetClass.trim() || 'KELAS 6 A', 80),
    isActive: false,
    targetCounts: input.targetCounts || {
      multiple_choice: 15,
      mcma: 10,
      true_false: 5,
      complex_multiple_choice: 0,
      matching: 0,
      essay: 0,
    },
  };
  try {
    await setDoc(doc(db, 'questionBanks', id), {
      ...created,
      updatedAt: nowIso,
    });
    return created;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `questionBanks/${id}`);
  }
}

export async function activateQuestionBankInFirestore(params: {
  bankId: string;
  banks: QuestionBank[];
  questions: Question[];
  examConfig: ExamConfig;
  sessions: StudentSession[];
}): Promise<void> {
  const { bankId, banks, questions, examConfig, sessions } = params;
  const nowIso = new Date().toISOString();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  for (const bank of banks) {
    ops.push((b) =>
      b.update(doc(db, 'questionBanks', bank.id), {
        isActive: bank.id === bankId,
        updatedAt: nowIso,
      })
    );
  }

  for (const q of questions) {
    const belongs = !q.bankId || q.bankId === bankId;
    ops.push((b) =>
      b.update(doc(db, 'questions', q.id), {
        isActiveBank: belongs,
        updatedAt: nowIso,
      })
    );
  }

  ops.push((b) =>
    b.set(
      doc(db, 'publicConfig', 'exam'),
      buildPublicConfigPayload({ ...examConfig, activeBankId: bankId } as ExamConfig & {
        activeBankId: string;
      }, nowIso)
    )
  );

  const activeQs = questions.filter((q) => !q.bankId || q.bankId === bankId);
  const opts: GradingOptions = {
    kkm: examConfig.kkm ?? 75,
    negativeMarking: examConfig.negativeMarking,
    negativePenaltyRatio: examConfig.negativePenaltyRatio,
  };
  for (const s of sessions) {
    if (s.status === 'submitted' || s.status === 'force_stopped') {
      const summary = gradeExam(activeQs, s.answers, s.manualEssayOverrides, opts);
      ops.push((b) =>
        b.update(doc(db, 'examSessions', s.id), {
          gradeSummary: stripUndefined(summary),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questionBanks/${bankId}`);
  }
}

export async function deleteQuestionBankInFirestore(params: {
  bankId: string;
  banks: QuestionBank[];
  questions: Question[];
  examConfig: ExamConfig;
}): Promise<void> {
  const { bankId, banks, questions, examConfig } = params;
  if (banks.length <= 1) return;
  const remaining = banks.filter((b) => b.id !== bankId);
  const nextActive = remaining.find((b) => b.isActive) || remaining[0];
  const nowIso = new Date().toISOString();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  ops.push((b) => b.delete(doc(db, 'questionBanks', bankId)));
  if (nextActive && !remaining.some((b) => b.isActive)) {
    ops.push((b) =>
      b.update(doc(db, 'questionBanks', nextActive.id), {
        isActive: true,
        updatedAt: nowIso,
      })
    );
  }
  if (nextActive) {
    ops.push((b) =>
      b.set(
        doc(db, 'publicConfig', 'exam'),
        buildPublicConfigPayload({ ...examConfig, activeBankId: nextActive.id } as ExamConfig & {
          activeBankId: string;
        }, nowIso)
      )
    );
  }

  for (const q of questions) {
    if (q.bankId === bankId) {
      ops.push((b) => b.delete(doc(db, 'questions', q.id)));
      ops.push((b) => b.delete(doc(db, 'questionKeys', q.id)));
    } else if (nextActive && (!q.bankId || q.bankId === nextActive.id)) {
      ops.push((b) =>
        b.update(doc(db, 'questions', q.id), {
          isActiveBank: true,
          updatedAt: nowIso,
        })
      );
    }
  }

  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `questionBanks/${bankId}`);
  }
}

export async function saveQuestionInFirestore(params: {
  question: Question;
  activeBankId: string;
  sessions?: StudentSession[];
  activeQuestions?: Question[];
  examConfig?: ExamConfig;
}): Promise<void> {
  const { question, activeBankId, sessions, activeQuestions, examConfig } = params;
  const safeId = makeSafeDocId(question.id || `q-${Date.now()}`, 'q');
  const bankId = makeSafeDocId(question.bankId || activeBankId || DEFAULT_ACTIVE_BANK_ID, 'bank');
  const enriched: Question = {
    ...question,
    id: safeId,
    bankId,
    points: normalizeQuestionPoints(question.points) || 1,
    difficulty: normalizeDifficulty(question.difficulty),
  };
  const isActiveBank = bankId === activeBankId;
  const nowIso = new Date().toISOString();

  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [
    (b) => b.set(doc(db, 'questions', safeId), toPublicQuestionDoc(enriched, isActiveBank, nowIso)),
    (b) => b.set(doc(db, 'questionKeys', safeId), toQuestionKeyDoc(enriched, nowIso)),
  ];

  if (sessions && activeQuestions && examConfig && isActiveBank) {
    const nextActiveQs = activeQuestions.some((item) => item.id === safeId)
      ? activeQuestions.map((item) => (item.id === safeId ? enriched : item))
      : [...activeQuestions, enriched];
    const opts: GradingOptions = {
      kkm: examConfig.kkm ?? 75,
      negativeMarking: examConfig.negativeMarking,
      negativePenaltyRatio: examConfig.negativePenaltyRatio,
    };
    for (const s of sessions) {
      if (s.status === 'submitted' || s.status === 'force_stopped') {
        const summary = gradeExam(nextActiveQs, s.answers, s.manualEssayOverrides, opts);
        ops.push((b) =>
          b.update(doc(db, 'examSessions', s.id), {
            gradeSummary: stripUndefined(summary),
            updatedAt: serverTimestamp(),
          })
        );
      }
    }
  }

  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questions/${safeId}`);
  }
}

export async function deleteQuestionInFirestore(id: string): Promise<void> {
  const safeId = makeSafeDocId(id, 'q');
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'questions', safeId));
    batch.delete(doc(db, 'questionKeys', safeId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `questions/${safeId}`);
  }
}

export async function importQuestionsBatchInFirestore(params: {
  bankId: string;
  activeBankId: string;
  replaceExisting: boolean;
  existingQuestionsInBank?: Question[];
  questions: Question[];
}): Promise<number> {
  const { bankId, activeBankId, replaceExisting, existingQuestionsInBank = [], questions } = params;
  const nowIso = new Date().toISOString();
  const isActiveBank = bankId === activeBankId;
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  if (replaceExisting) {
    for (const oldQ of existingQuestionsInBank) {
      ops.push((b) => b.delete(doc(db, 'questions', oldQ.id)));
      ops.push((b) => b.delete(doc(db, 'questionKeys', oldQ.id)));
    }
  }

  const valid = questions.filter((q) => q && q.type && (q.prompt || q.imageUrl));
  valid.forEach((q, idx) => {
    const safeId = makeSafeDocId(q.id || `q-imp-${Date.now()}-${idx}`, 'q');
    const enriched: Question = {
      ...q,
      id: safeId,
      bankId,
      points: normalizeQuestionPoints(q.points) || 1,
      difficulty: normalizeDifficulty(q.difficulty),
    };
    ops.push((b) =>
      b.set(doc(db, 'questions', safeId), toPublicQuestionDoc(enriched, isActiveBank, nowIso))
    );
    ops.push((b) =>
      b.set(doc(db, 'questionKeys', safeId), toQuestionKeyDoc(enriched, nowIso))
    );
  });

  try {
    await commitBatchedWrites(ops);
    return valid.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'questions');
  }
}

export async function assignQuestionsToBankInFirestore(params: {
  sourceQuestions: Question[];
  targetBankId: string;
  activeBankId: string;
  mode?: 'copy' | 'move';
}): Promise<{ assignedCount: number; alreadyInBank: boolean }> {
  const { sourceQuestions, targetBankId, activeBankId, mode = 'copy' } = params;
  const nowIso = new Date().toISOString();
  const isActiveBank = targetBankId === activeBankId;
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  let assignedCount = 0;

  for (const src of sourceQuestions) {
    if (src.bankId === targetBankId) continue;
    assignedCount += 1;
    if (mode === 'move') {
      const moved: Question = { ...src, bankId: targetBankId };
      ops.push((b) =>
        b.set(doc(db, 'questions', moved.id), toPublicQuestionDoc(moved, isActiveBank, nowIso))
      );
      ops.push((b) =>
        b.set(doc(db, 'questionKeys', moved.id), toQuestionKeyDoc(moved, nowIso))
      );
    } else {
      const cloned: Question = {
        ...structuredClone(src),
        id: makeSafeDocId(`q-ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'q'),
        bankId: targetBankId,
      };
      ops.push((b) =>
        b.set(doc(db, 'questions', cloned.id), toPublicQuestionDoc(cloned, isActiveBank, nowIso))
      );
      ops.push((b) =>
        b.set(doc(db, 'questionKeys', cloned.id), toQuestionKeyDoc(cloned, nowIso))
      );
    }
  }

  if (ops.length === 0) {
    return { assignedCount: 0, alreadyInBank: sourceQuestions.length === 1 };
  }

  try {
    await commitBatchedWrites(ops);
    return { assignedCount, alreadyInBank: false };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'questions');
  }
}

export async function updateQuestionWeightsInFirestore(params: {
  weights: Record<string, number>;
  questions: Question[];
  activeBankId: string;
  sessions: StudentSession[];
  examConfig: ExamConfig;
}): Promise<void> {
  const { weights, questions, activeBankId, sessions, examConfig } = params;
  const nowIso = new Date().toISOString();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  const updatedAll = questions.map((q) => {
    const normalized = normalizeQuestionPoints(weights[q.id]);
    if (normalized > 0 && normalized !== q.points) {
      const nextQ = { ...q, points: normalized };
      ops.push((b) =>
        b.update(doc(db, 'questions', q.id), {
          points: normalized,
          updatedAt: nowIso,
        })
      );
      return nextQ;
    }
    return q;
  });

  const activeQs = updatedAll.filter((q) => !q.bankId || q.bankId === activeBankId);
  const opts: GradingOptions = {
    kkm: examConfig.kkm ?? 75,
    negativeMarking: examConfig.negativeMarking,
    negativePenaltyRatio: examConfig.negativePenaltyRatio,
  };
  for (const s of sessions) {
    if (s.status === 'submitted' || s.status === 'force_stopped') {
      const summary = gradeExam(activeQs, s.answers, s.manualEssayOverrides, opts);
      ops.push((b) =>
        b.update(doc(db, 'examSessions', s.id), {
          gradeSummary: stripUndefined(summary),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'questions');
  }
}

// Master Data CRUD
export async function saveMasterStudentInFirestore(
  item: Omit<StudentMaster, 'id'> & { id?: string }
): Promise<void> {
  const id = makeSafeDocId(item.id || `ms-${Date.now()}`, 'ms');
  const payload: StudentMaster = {
    id,
    name: clampStr(item.name.trim(), 120),
    nis: clampStr(item.nis.trim(), 64),
    kelas: clampStr(item.kelas?.trim() || 'KELAS 6 A', 64),
    phone: clampStr(item.phone?.trim() || '-', 40),
  };
  const nisId = makeSafeDocId(payload.nis.toLowerCase(), 'nis');
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'masterStudents', id), payload);
    batch.set(doc(db, 'nisRegistry', nisId), {
      nis: payload.nis,
      name: payload.name,
      registered: true,
      updatedAt: nowIso,
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `masterStudents/${id}`);
  }
}

export async function importMasterStudentsInFirestore(
  items: Array<Partial<StudentMaster>>
): Promise<void> {
  const nowIso = new Date().toISOString();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  items
    .filter((s) => s.name && s.nis)
    .forEach((s, idx) => {
      const id = makeSafeDocId(`ms-imp-${Date.now()}-${idx}`, 'ms');
      const payload: StudentMaster = {
        id,
        name: clampStr(String(s.name).trim(), 120),
        nis: clampStr(String(s.nis).trim(), 64),
        kelas: clampStr(String(s.kelas || 'KELAS 6 A').trim(), 64),
        phone: clampStr(String(s.phone || '-').trim(), 40),
      };
      const nisId = makeSafeDocId(payload.nis.toLowerCase(), 'nis');
      ops.push((b) => b.set(doc(db, 'masterStudents', id), payload));
      ops.push((b) =>
        b.set(doc(db, 'nisRegistry', nisId), {
          nis: payload.nis,
          name: payload.name,
          registered: true,
          updatedAt: nowIso,
        })
      );
    });
  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'masterStudents');
  }
}

export async function deleteMasterStudentInFirestore(student: StudentMaster): Promise<void> {
  const nisId = makeSafeDocId(student.nis.toLowerCase(), 'nis');
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'masterStudents', student.id));
    batch.delete(doc(db, 'nisRegistry', nisId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `masterStudents/${student.id}`);
  }
}

export async function saveMasterTeacherInFirestore(
  item: Omit<TeacherMaster, 'id'> & { id?: string }
): Promise<void> {
  const id = makeSafeDocId(item.id || `mt-${Date.now()}`, 'mt');
  const payload: TeacherMaster = {
    id,
    name: clampStr(item.name.trim(), 120),
    nip: clampStr(item.nip.trim(), 64),
    subjects: (item.subjects || []).slice(0, 30).map((s) => clampStr(s, 120)),
    classes: (item.classes || []).slice(0, 30).map((c) => clampStr(c, 64)),
    phone: clampStr(item.phone?.trim() || '-', 40),
  };
  try {
    await setDoc(doc(db, 'masterTeachers', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `masterTeachers/${id}`);
  }
}

export async function importMasterTeachersInFirestore(
  items: Array<Partial<TeacherMaster>>
): Promise<void> {
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  items
    .filter((t) => t.name && t.nip)
    .forEach((t, idx) => {
      const id = makeSafeDocId(`mt-imp-${Date.now()}-${idx}`, 'mt');
      const payload: TeacherMaster = {
        id,
        name: clampStr(String(t.name).trim(), 120),
        nip: clampStr(String(t.nip).trim(), 64),
        subjects: Array.isArray(t.subjects) ? t.subjects.slice(0, 30).map((s) => clampStr(s, 120)) : [],
        classes: Array.isArray(t.classes) ? t.classes.slice(0, 30).map((c) => clampStr(c, 64)) : [],
        phone: clampStr(String(t.phone || '-').trim(), 40),
      };
      ops.push((b) => b.set(doc(db, 'masterTeachers', id), payload));
    });
  try {
    await commitBatchedWrites(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'masterTeachers');
  }
}

export async function deleteMasterTeacherInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'masterTeachers', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `masterTeachers/${id}`);
  }
}

export async function createClassRoomInFirestore(input: Omit<ClassRoom, 'id'>): Promise<void> {
  const id = makeSafeDocId(`cls-${Date.now()}`, 'cls');
  try {
    await setDoc(doc(db, 'classes', id), {
      id,
      name: clampStr(input.name.trim(), 80),
      level: clampStr(input.level.trim(), 80),
      homeroomTeacher: clampStr(input.homeroomTeacher.trim(), 120),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `classes/${id}`);
  }
}

export async function deleteClassRoomInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'classes', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `classes/${id}`);
  }
}

export async function createSubjectInFirestore(input: Omit<SubjectMaster, 'id'>): Promise<void> {
  const id = makeSafeDocId(`sub-${Date.now()}`, 'sub');
  try {
    await setDoc(doc(db, 'subjects', id), {
      id,
      code: clampStr(input.code.trim(), 40),
      name: clampStr(input.name.trim(), 120),
      category: clampStr(input.category.trim(), 120),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `subjects/${id}`);
  }
}

export async function deleteSubjectInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'subjects', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `subjects/${id}`);
  }
}

export async function createMaterialInFirestore(
  input: Omit<ElearningMaterial, 'id' | 'createdAt'>
): Promise<void> {
  const id = makeSafeDocId(`mat-${Date.now()}`, 'mat');
  try {
    await setDoc(doc(db, 'materials', id), {
      id,
      title: clampStr(input.title.trim(), 200),
      subject: clampStr(input.subject.trim(), 120),
      targetClass: clampStr(input.targetClass.trim(), 80),
      summary: clampStr(input.summary.trim(), 500),
      content: clampStr(input.content.trim(), 20000),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `materials/${id}`);
  }
}

export async function deleteMaterialInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'materials', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `materials/${id}`);
  }
}

export async function createProctorUserInFirestore(
  input: Omit<UserAccount, 'id' | 'active'>
): Promise<void> {
  const id = makeSafeDocId(`usr-${Date.now()}`, 'usr');
  const username = clampStr(input.username.trim(), 120);
  const payload: UserAccount = {
    id,
    name: clampStr(input.name.trim(), 120),
    username,
    role: input.role,
    active: true,
  };
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', id), payload);
    if (username.includes('@')) {
      const emailLower = username.toLowerCase();
      batch.set(doc(db, 'adminEmails', emailLower), {
        email: emailLower,
        role: input.role,
        active: true,
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${id}`);
  }
}

export async function toggleProctorUserInFirestore(user: UserAccount): Promise<void> {
  const nextActive = !user.active;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.id), { active: nextActive });
    if (user.username.includes('@')) {
      const emailLower = user.username.toLowerCase();
      batch.set(doc(db, 'adminEmails', emailLower), {
        email: emailLower,
        role: user.role,
        active: nextActive,
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
  }
}

export async function deleteProctorUserInFirestore(user: UserAccount): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.id));
    if (user.username.includes('@') && user.username.toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL) {
      batch.delete(doc(db, 'adminEmails', user.username.toLowerCase()));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${user.id}`);
  }
}

export async function createAnnouncementInFirestore(input: {
  title: string;
  content: string;
  author?: string;
}): Promise<void> {
  const id = makeSafeDocId(`ann-${Date.now()}`, 'ann');
  const title = clampStr(input.title.trim() || 'Pengumuman Pengawas', 200);
  const content = clampStr(input.content.trim(), 2000);
  const author = clampStr(input.author?.trim() || 'Administrator Utama', 120);
  if (!content) return;
  try {
    await setDoc(doc(db, 'announcements', id), {
      id,
      title,
      content,
      author,
      published: true,
      createdAt: new Date().toISOString(),
    });
    await recordAuditLogEntry({
      actor: author,
      action: 'announcement',
      detail: `Siaran langsung ke siswa: "${title}" — ${content}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
  }
}

export async function deleteAnnouncementInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
  }
}

// Proctor Real-Time Session Commands
export async function executeProctorCommand(
  command: Record<string, unknown>,
  ctx: {
    examConfig: ExamConfig;
    activeQuestions: Question[];
    allQuestions: Question[];
    sessions: StudentSession[];
    violations: ViolationLog[];
  }
): Promise<void> {
  const type = String(command.type || '');
  const nowIso = new Date().toISOString();
  const { examConfig, activeQuestions, allQuestions, sessions, violations } = ctx;
  const gradingOpts: GradingOptions = {
    kkm: examConfig.kkm ?? 75,
    negativeMarking: examConfig.negativeMarking,
    negativePenaltyRatio: examConfig.negativePenaltyRatio,
  };

  try {
    if (type === 'proctor:suspend') {
      const targetId = String(command.studentId || '');
      const s = sessions.find((item) => item.id === targetId);
      if (!s || s.status === 'submitted' || s.status === 'force_stopped') return;
      const reason = clampStr(
        command.reason || 'Ujian ditangguhkan sementara oleh proktor.',
        500
      );
      await updateDoc(doc(db, 'examSessions', s.id), {
        status: 'suspended',
        suspendReason: reason,
        lastActiveAt: nowIso,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLogEntry({
        actor: String(command.actor || 'Proktor'),
        action: 'suspend',
        studentId: s.id,
        studentName: s.name,
        nis: s.nis,
        detail: reason,
      });
      return;
    }

    if (type === 'proctor:resume' || type === 'proctor:unlock_violation') {
      const targetId = String(command.studentId || '');
      const s = sessions.find((item) => item.id === targetId);
      if (!s || s.status === 'submitted' || s.status === 'force_stopped') return;
      const reason = clampStr(command.reason || '', 400);
      const actor = String(command.actor || 'Proktor').trim();
      const nextStatus: StudentSession['status'] = examConfig.globalSuspended
        ? 'suspended'
        : 'active';

      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      const nextViolations =
        type === 'proctor:unlock_violation'
          ? s.violations.map((v) => ({ ...v, resolved: true }))
          : s.violations;

      ops.push((b) =>
        b.update(doc(db, 'examSessions', s.id), {
          status: nextStatus,
          suspendReason: '',
          violations: nextViolations,
          lastActiveAt: nowIso,
          updatedAt: serverTimestamp(),
        })
      );

      if (type === 'proctor:unlock_violation') {
        for (const v of violations) {
          if (v.studentId === targetId && !v.resolved) {
            ops.push((b) => b.update(doc(db, 'violations', v.id), { resolved: true }));
          }
        }
      }

      await commitBatchedWrites(ops);
      await recordAuditLogEntry({
        actor,
        action: type === 'proctor:unlock_violation' ? 'unlock' : 'resume',
        studentId: s.id,
        studentName: s.name,
        nis: s.nis,
        detail:
          type === 'proctor:unlock_violation'
            ? reason
              ? `Buka kunci pelanggaran — Alasan: ${reason}`
              : 'Buka kunci pelanggaran oleh proktor.'
            : reason || 'Sesi ujian dilanjutkan kembali oleh proktor.',
      });
      return;
    }

    if (type === 'proctor:add_time') {
      const targetId = String(command.studentId || '');
      const s = sessions.find((item) => item.id === targetId);
      if (!s || s.status === 'submitted' || s.status === 'force_stopped') return;
      const minutes = Math.max(1, Math.min(120, Number(command.minutes) || 5));
      const reason = clampStr(
        command.reason || `Penambahan waktu +${minutes} menit`,
        400
      );
      const actor = String(command.actor || 'Proktor').trim();
      await updateDoc(doc(db, 'examSessions', s.id), {
        remainingSeconds: Math.min(86400, s.remainingSeconds + minutes * 60),
        lastActiveAt: nowIso,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLogEntry({
        actor,
        action: 'add_time',
        studentId: s.id,
        studentName: s.name,
        nis: s.nis,
        detail: `+${minutes} menit (${reason})`,
      });
      return;
    }

    if (type === 'proctor:broadcast_announcement') {
      await createAnnouncementInFirestore({
        title: String(command.title || 'Pengumuman Pengawas'),
        content: String(command.content || ''),
        author: String(command.author || 'Proktor Ruang'),
      });
      return;
    }

    if (type === 'proctor:force_stop') {
      const targetId = String(command.studentId || '');
      const s = sessions.find((item) => item.id === targetId);
      if (!s) return;
      const reason = clampStr(
        command.reason || 'Ujian dihentikan secara paksa oleh proktor.',
        500
      );
      const summary = gradeExam(
        activeQuestions,
        s.answers,
        s.manualEssayOverrides,
        gradingOpts
      );
      await updateDoc(doc(db, 'examSessions', s.id), {
        status: 'force_stopped',
        endedAt: nowIso,
        lastActiveAt: nowIso,
        suspendReason: reason,
        gradeSummary: stripUndefined(summary),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLogEntry({
        actor: String(command.actor || 'Proktor'),
        action: 'force_stop',
        studentId: s.id,
        studentName: s.name,
        nis: s.nis,
        detail: reason,
      });
      return;
    }

    if (type === 'proctor:suspend_all') {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) =>
        b.set(
          doc(db, 'publicConfig', 'exam'),
          buildPublicConfigPayload({ ...examConfig, globalSuspended: true }, nowIso)
        )
      );
      for (const s of sessions) {
        if (s.status === 'active') {
          ops.push((b) =>
            b.update(doc(db, 'examSessions', s.id), {
              status: 'suspended',
              suspendReason: 'Seluruh ruang ujian ditangguhkan sementara oleh proktor.',
              updatedAt: serverTimestamp(),
            })
          );
        }
      }
      await commitBatchedWrites(ops);
      await recordAuditLogEntry({
        actor: 'Proktor',
        action: 'suspend',
        detail: 'Menangguhkan seluruh ruang ujian secara serentak.',
      });
      return;
    }

    if (type === 'proctor:resume_all') {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) =>
        b.set(
          doc(db, 'publicConfig', 'exam'),
          buildPublicConfigPayload({ ...examConfig, globalSuspended: false }, nowIso)
        )
      );
      for (const s of sessions) {
        if (s.status === 'suspended') {
          ops.push((b) =>
            b.update(doc(db, 'examSessions', s.id), {
              status: 'active',
              suspendReason: '',
              updatedAt: serverTimestamp(),
            })
          );
        }
      }
      await commitBatchedWrites(ops);
      await recordAuditLogEntry({
        actor: 'Proktor',
        action: 'resume',
        detail: 'Melanjutkan seluruh ruang ujian secara serentak.',
      });
      return;
    }

    if (type === 'proctor:adjust_essay_score') {
      const targetId = String(command.studentId || '');
      const questionId = String(command.questionId || '');
      const s = sessions.find((item) => item.id === targetId);
      const qObj = allQuestions.find((q) => q.id === questionId);
      if (!s || !qObj) return;

      const maxPts = normalizeQuestionPoints(qObj.points);
      const nextOverrides = { ...(s.manualEssayOverrides || {}) };
      let auditDetail = '';

      if (command.resetOverride === true || command.score === null) {
        delete nextOverrides[questionId];
        auditDetail = `Mengembalikan soal ${questionId} ke penilaian otomatis.`;
      } else {
        const rawScore = Number(command.score);
        if (!Number.isFinite(rawScore)) return;
        const clamped = Number(Math.max(0, Math.min(maxPts, rawScore)).toFixed(2));
        nextOverrides[questionId] = clamped;
        auditDetail = `Menyesuaikan skor soal (${clamped}/${maxPts} poin).`;
      }

      const nextGrade =
        s.status === 'submitted' || s.status === 'force_stopped'
          ? gradeExam(activeQuestions, s.answers, nextOverrides, gradingOpts)
          : s.gradeSummary;

      await updateDoc(
        doc(db, 'examSessions', s.id),
        stripUndefined({
          manualEssayOverrides: nextOverrides,
          gradeSummary: nextGrade,
          updatedAt: serverTimestamp(),
        })
      );
      await recordAuditLogEntry({
        actor: String(command.actor || 'Proktor'),
        action: 'grade_override',
        studentId: s.id,
        studentName: s.name,
        nis: s.nis,
        detail: auditDetail,
      });
      return;
    }

    if (type === 'proctor:regrade_all') {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      for (const s of sessions) {
        if (s.status === 'submitted' || s.status === 'force_stopped') {
          const summary = gradeExam(
            activeQuestions,
            s.answers,
            s.manualEssayOverrides,
            gradingOpts
          );
          ops.push((b) =>
            b.update(doc(db, 'examSessions', s.id), {
              gradeSummary: stripUndefined(summary),
              updatedAt: serverTimestamp(),
            })
          );
        }
      }
      await commitBatchedWrites(ops);
      await recordAuditLogEntry({
        actor: String(command.actor || 'Proktor'),
        action: 'regrade',
        detail: 'Menghitung ulang seluruh nilai peserta sesuai kunci, bobot, dan aturan aktif.',
      });
      return;
    }

    if (type === 'proctor:reset_session') {
      const targetId = String(command.studentId || '');
      const existing = sessions.find((item) => item.id === targetId);
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      ops.push((b) => b.delete(doc(db, 'examSessions', targetId)));
      for (const v of violations) {
        if (v.studentId === targetId) {
          ops.push((b) => b.delete(doc(db, 'violations', v.id)));
        }
      }
      await commitBatchedWrites(ops);
      if (existing) {
        await recordAuditLogEntry({
          actor: String(command.actor || 'Proktor'),
          action: 'reset',
          studentId: existing.id,
          studentName: existing.name,
          nis: existing.nis,
          detail: 'Mereset sesi untuk izin pengerjaan ulang (remedial).',
        });
      }
      return;
    }

    if (type === 'proctor:clear_violations') {
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      for (const v of violations) {
        ops.push((b) => b.delete(doc(db, 'violations', v.id)));
      }
      await commitBatchedWrites(ops);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'examSessions');
  }
}

export { sanitizeStudentAnswer };
