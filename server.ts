import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_EXAM_CONFIG, DEFAULT_QUESTIONS } from './src/data/defaultQuestions.ts';
import { gradeExam } from './src/lib/grading.ts';
import type {
  Announcement,
  ClassRoom,
  ElearningMaterial,
  ExamConfig,
  Question,
  QuestionBank,
  ServerSnapshot,
  StudentAnswerValue,
  StudentMaster,
  StudentSession,
  SubjectMaster,
  TeacherMaster,
  UserAccount,
  ViolationLog,
} from './src/types/cbt.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'cbt-store.json');

let examConfig: ExamConfig = {
  ...DEFAULT_EXAM_CONFIG,
  schoolName: 'SD Negeri Lentera Nusantara 01',
  kkm: 75,
  shuffleQuestions: false,
  showResultToStudent: true,
  requireRegisteredNis: false,
  requireSessionCode: false,
  proctorPin: '123456',
  roomName: 'Ruang CBT 01 · Sesi Pagi',
  scheduleDate: new Date().toISOString().slice(0, 10),
  startTime: '07:30',
  endTime: '09:30',
  sessionCode: 'TKA-SD-01',
};

let questionBanks: QuestionBank[] = [
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

let questions: Question[] = structuredClone(DEFAULT_QUESTIONS).map((q) => ({
  ...q,
  bankId: 'bank-tka-sd',
}));

const sessions = new Map<string, StudentSession>();
let recentViolations: ViolationLog[] = [];

let masterStudents: StudentMaster[] = [
  { id: 'ms-1', name: 'Siti Aminah', nis: '6001', kelas: 'KELAS 6 A', phone: '081234567801' },
  { id: 'ms-2', name: 'Budi Santoso', nis: '6002', kelas: 'KELAS 6 A', phone: '081234567802' },
  { id: 'ms-3', name: 'Rina Marlina', nis: '6003', kelas: 'KELAS 6 B', phone: '081234567803' },
  { id: 'ms-4', name: 'Ahmad Rizky', nis: '6004', kelas: 'KELAS 6 B', phone: '081234567804' },
  { id: 'ms-5', name: 'Dewi Kartika', nis: '6005', kelas: 'KELAS 6 A', phone: '081234567805' },
  { id: 'ms-6', name: 'Fajar Nugroho', nis: '6006', kelas: 'KELAS 6 C', phone: '081234567806' },
];

let masterTeachers: TeacherMaster[] = [
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

let classes: ClassRoom[] = [
  { id: 'cls-1', name: 'KELAS 6 A', level: 'Tingkat 6 SD', homeroomTeacher: 'Nurfajri, S.Pd.' },
  { id: 'cls-2', name: 'KELAS 6 B', level: 'Tingkat 6 SD', homeroomTeacher: 'Nuramalia, S.Pd.' },
  { id: 'cls-3', name: 'KELAS 6 C', level: 'Tingkat 6 SD', homeroomTeacher: 'H. Ahmad Fauzan, M.Pd.' },
];

let subjects: SubjectMaster[] = [
  { id: 'sub-1', code: 'MTK-BIL', name: 'Matematika — Bilangan', category: 'Numerasi TKA SD' },
  { id: 'sub-2', code: 'MTK-GEO', name: 'Matematika — Geometri & Pengukuran', category: 'Numerasi TKA SD' },
  { id: 'sub-3', code: 'MTK-DAT', name: 'Matematika — Data', category: 'Numerasi TKA SD' },
  { id: 'sub-4', code: 'BIN-INF', name: 'Bahasa Indonesia — Teks Informasi', category: 'Literasi TKA SD' },
  { id: 'sub-5', code: 'BIN-FIK', name: 'Bahasa Indonesia — Teks Fiksi', category: 'Literasi TKA SD' },
];

let materials: ElearningMaterial[] = [
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

let users: UserAccount[] = [
  { id: 'usr-1', name: 'Administrator Utama', username: 'admin', role: 'admin', active: true },
  { id: 'usr-2', name: 'Nurfajri, S.Pd.', username: 'nurfajri', role: 'guru', active: true },
  { id: 'usr-3', name: 'Nuramalia, S.Pd.', username: 'nuramalia', role: 'proktor', active: true },
];

let announcements: Announcement[] = [
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

interface ClientMeta {
  ws: WebSocket;
  role: 'student' | 'proctor' | 'unknown';
  studentId?: string;
}

const clients = new Map<WebSocket, ClientMeta>();

let persistTimer: NodeJS.Timeout | null = null;

function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload: ServerSnapshot = {
      examConfig,
      questions,
      sessions: Array.from(sessions.values()),
      recentViolations: recentViolations.slice(0, 100),
      masterStudents,
      masterTeachers,
      classes,
      subjects,
      questionBanks,
      materials,
      users,
      announcements,
    };
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist CBT state:', err);
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 250);
}

function loadPersistedState(): void {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ServerSnapshot>;

    const isLegacyUneditedSeed =
      (parsed.sessions?.length ?? 0) === 0 &&
      Array.isArray(parsed.questions) &&
      parsed.questions.some(
        (q) => q.id === 'tka-sd-2' && q.subject.includes('Bahasa Arab')
      );

    if (isLegacyUneditedSeed) {
      console.log('Migrating untouched legacy seed store to official TKA SD defaults.');
      persistNow();
      return;
    }

    if (parsed.examConfig) {
      examConfig = { ...examConfig, ...parsed.examConfig };
    }
    if (Array.isArray(parsed.questionBanks) && parsed.questionBanks.length > 0) {
      questionBanks = parsed.questionBanks;
    }
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      questions = parsed.questions;
    }
    if (Array.isArray(parsed.sessions)) {
      sessions.clear();
      for (const s of parsed.sessions) {
        if (s && s.id) {
          sessions.set(s.id, { ...s, connected: false });
        }
      }
    }
    if (Array.isArray(parsed.recentViolations)) {
      recentViolations = parsed.recentViolations;
    }
    if (Array.isArray(parsed.masterStudents)) masterStudents = parsed.masterStudents;
    if (Array.isArray(parsed.masterTeachers)) masterTeachers = parsed.masterTeachers;
    if (Array.isArray(parsed.classes)) classes = parsed.classes;
    if (Array.isArray(parsed.subjects)) subjects = parsed.subjects;
    if (Array.isArray(parsed.materials)) materials = parsed.materials;
    if (Array.isArray(parsed.users)) users = parsed.users;
    if (Array.isArray(parsed.announcements)) announcements = parsed.announcements;
    console.log(`Loaded persisted CBT store (${sessions.size} sessions, ${questions.length} questions).`);
  } catch (err) {
    console.error('Failed to load persisted CBT store, using defaults:', err);
  }
}

function findSessionByNis(nis: string): StudentSession | undefined {
  const norm = nis.trim().toLowerCase();
  if (!norm) return undefined;
  for (const s of sessions.values()) {
    if (s.nis.trim().toLowerCase() === norm) {
      return s;
    }
  }
  return undefined;
}

loadPersistedState();

function getActiveQuestions(): Question[] {
  const activeBank = questionBanks.find((b) => b.isActive);
  if (!activeBank) return questions;
  return questions.filter((q) => !q.bankId || q.bankId === activeBank.id);
}

function getSnapshot(): ServerSnapshot {
  return {
    examConfig,
    questions,
    sessions: Array.from(sessions.values()).sort((a, b) =>
      b.lastActiveAt.localeCompare(a.lastActiveAt)
    ),
    recentViolations: recentViolations.slice(0, 50),
    masterStudents,
    masterTeachers,
    classes,
    subjects,
    questionBanks,
    materials,
    users,
    announcements,
  };
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToProctors(payload: unknown): void {
  for (const meta of clients.values()) {
    if (meta.role === 'proctor') {
      sendJson(meta.ws, payload);
    }
  }
}

function sendToStudent(studentId: string, payload: unknown): void {
  for (const meta of clients.values()) {
    if (meta.role === 'student' && meta.studentId === studentId) {
      sendJson(meta.ws, payload);
    }
  }
}

function broadcastAll(payload: unknown): void {
  for (const meta of clients.values()) {
    sendJson(meta.ws, payload);
  }
}

function broadcastQuestions(): void {
  broadcastToProctors({ type: 'questions:updated', questions });
  const activeQs = getActiveQuestions();
  for (const meta of clients.values()) {
    if (meta.role === 'student') {
      sendJson(meta.ws, { type: 'questions:updated', questions: activeQs });
    }
  }
}

let timerTickCounter = 0;

setInterval(() => {
  if (examConfig.globalSuspended) return;
  const activeQs = getActiveQuestions();
  let hasActive = false;
  let completedNow = false;

  for (const session of sessions.values()) {
    if (session.status === 'active' && session.connected) {
      hasActive = true;
      if (session.remainingSeconds > 0) {
        session.remainingSeconds -= 1;
        if (session.remainingSeconds === 0) {
          completedNow = true;
          session.status = 'submitted';
          session.endedAt = new Date().toISOString();
          session.gradeSummary = gradeExam(
            activeQs,
            session.answers,
            session.manualEssayOverrides
          );
          sendToStudent(session.id, { type: 'session:updated', session });
          broadcastToProctors({ type: 'session:updated', session });
        }
      }
    }
  }

  timerTickCounter += 1;
  if (completedNow) {
    persistNow();
  } else if (hasActive && timerTickCounter % 10 === 0) {
    schedulePersist();
  }
}, 1000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  app.post('/api/uploads/question-image', (req, res) => {
    const dataUrl = String(req.body?.dataUrl || '').trim();
    const match = dataUrl.match(
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-zA-Z0-9+/=]+)$/i
    );
    if (!match) {
      res.status(400).json({
        error: 'Format gambar tidak valid. Gunakan PNG, JPG, WebP, atau GIF.',
      });
      return;
    }

    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({
        error: 'Ukuran gambar setelah diproses harus di bawah 5 MB.',
      });
      return;
    }

    try {
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      const filename = `qimg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      res.status(201).json({ url: `/uploads/${filename}` });
    } catch (err) {
      console.error('Failed to save question image:', err);
      res.status(500).json({ error: 'Gagal menyimpan file gambar di server.' });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeSessions: sessions.size, persisted: fs.existsSync(STORE_PATH) });
  });

  app.get('/api/public-config', (_req, res) => {
    res.json({
      title: examConfig.title,
      subtitle: examConfig.subtitle,
      schoolName: examConfig.schoolName,
      roomName: examConfig.roomName,
      scheduleDate: examConfig.scheduleDate,
      startTime: examConfig.startTime,
      requireRegisteredNis: Boolean(examConfig.requireRegisteredNis),
      requireSessionCode: Boolean(examConfig.requireSessionCode),
    });
  });

  app.post('/api/student/auth', (req, res) => {
    const rawName = String(req.body?.name || '').trim();
    const rawNis = String(req.body?.nis || '').trim();
    const rawSessionCode = String(req.body?.sessionCode || '').trim();

    if (!rawName || !rawNis) {
      res.status(400).json({ error: 'Nama lengkap dan NIS wajib diisi.' });
      return;
    }

    if (examConfig.requireSessionCode) {
      const expectedCode = (examConfig.sessionCode || '').trim().toUpperCase();
      if (!expectedCode || rawSessionCode.toUpperCase() !== expectedCode) {
        res.status(403).json({
          error: 'Kode sesi / token ujian tidak valid. Periksa kembali token dari proktor.',
        });
        return;
      }
    }

    let finalName = rawName;
    if (examConfig.requireRegisteredNis) {
      const matched = masterStudents.find(
        (m) => m.nis.trim().toLowerCase() === rawNis.toLowerCase()
      );
      if (!matched) {
        res.status(403).json({
          error: `NIS "${rawNis}" tidak terdaftar pada Data Siswa ujian ini.`,
        });
        return;
      }
      finalName = matched.name;
    }

    const existing = findSessionByNis(rawNis);
    if (existing) {
      res.json({
        ok: true,
        studentId: existing.id,
        studentName: finalName || existing.name,
        nis: existing.nis,
        resumed: true,
      });
      return;
    }

    const cleanNis = rawNis.replace(/[^a-zA-Z0-9]/g, '') || 'peserta';
    const studentId = `stu-${cleanNis}-${Date.now().toString(36)}`;
    res.json({
      ok: true,
      studentId,
      studentName: finalName,
      nis: rawNis,
      resumed: false,
    });
  });

  app.post('/api/proctor/auth', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const pin = String(req.body?.pin || '').trim();
    const expectedPin = (examConfig.proctorPin || '123456').trim();

    if (!pin || pin !== expectedPin) {
      res.status(401).json({ error: 'PIN Proktor / Guru tidak sesuai.' });
      return;
    }

    if (username) {
      const account = users.find((u) => u.username.toLowerCase() === username);
      if (account && !account.active) {
        res.status(403).json({ error: `Akun "${username}" sedang dinonaktifkan oleh admin.` });
        return;
      }
      res.json({
        ok: true,
        userName: account?.name || username,
        role: account?.role || 'proktor',
      });
      return;
    }

    res.json({ ok: true, userName: 'Administrator Utama', role: 'admin' });
  });

  app.get('/api/state', (_req, res) => {
    res.json(getSnapshot());
  });

  // Question Banks CRUD
  app.post('/api/question-banks', (req, res) => {
    const body = req.body as Partial<QuestionBank>;
    if (!body.code || !body.name) {
      res.status(400).json({ error: 'Kode dan nama bank soal wajib diisi.' });
      return;
    }
    const created: QuestionBank = {
      id: `bank-${Date.now()}`,
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      subject: body.subject?.trim() || 'Umum',
      targetClass: body.targetClass?.trim() || 'KELAS 6 A',
      isActive: false,
      targetCounts: body.targetCounts || {
        multiple_choice: 15,
        mcma: 10,
        true_false: 5,
        complex_multiple_choice: 0,
        matching: 0,
        essay: 0,
      },
    };
    questionBanks = [...questionBanks, created];
    broadcastToProctors({ type: 'banks:updated', questionBanks });
    schedulePersist();
    res.status(201).json(created);
  });

  app.put('/api/question-banks/:id', (req, res) => {
    const idx = questionBanks.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Bank soal tidak ditemukan.' });
      return;
    }
    questionBanks[idx] = { ...questionBanks[idx], ...req.body, id: req.params.id };
    broadcastToProctors({ type: 'banks:updated', questionBanks });
    schedulePersist();
    res.json(questionBanks[idx]);
  });

  app.post('/api/question-banks/:id/activate', (req, res) => {
    const { id } = req.params;
    questionBanks = questionBanks.map((b) => ({ ...b, isActive: b.id === id }));
    broadcastToProctors({ type: 'banks:updated', questionBanks });
    broadcastQuestions();
    schedulePersist();
    res.json({ ok: true });
  });

  app.delete('/api/question-banks/:id', (req, res) => {
    if (questionBanks.length <= 1) {
      res.status(400).json({ error: 'Minimal harus ada 1 bank soal.' });
      return;
    }
    const targetId = req.params.id;
    questionBanks = questionBanks.filter((b) => b.id !== targetId);
    if (!questionBanks.some((b) => b.isActive)) {
      questionBanks[0].isActive = true;
    }
    questions = questions.filter((q) => q.bankId !== targetId);
    broadcastToProctors({ type: 'banks:updated', questionBanks });
    broadcastQuestions();
    schedulePersist();
    res.json({ ok: true });
  });

  const normalizeDifficulty = (raw?: unknown): 'easy' | 'medium' | 'hard' => {
    if (raw === 'easy' || raw === 'hard' || raw === 'medium') return raw;
    return 'medium';
  };

  // Question Bank CRUD
  app.post('/api/questions', (req, res) => {
    const newQ = req.body as Question;
    if (!newQ || !newQ.id || !newQ.type || (!newQ.prompt && !newQ.imageUrl)) {
      res.status(400).json({ error: 'Data soal tidak lengkap.' });
      return;
    }
    const activeBank = questionBanks.find((b) => b.isActive);
    const enriched: Question = {
      ...newQ,
      difficulty: normalizeDifficulty(newQ.difficulty),
      bankId: newQ.bankId || activeBank?.id || 'bank-tka-sd',
    };
    questions = [...questions, enriched];
    broadcastQuestions();
    schedulePersist();
    res.status(201).json(enriched);
  });

  app.post('/api/questions/import', (req, res) => {
    const items = Array.isArray(req.body?.questions) ? (req.body.questions as Question[]) : [];
    const bankId = String(req.body?.bankId || questionBanks.find((b) => b.isActive)?.id || 'bank-tka-sd');
    const replaceExisting = Boolean(req.body?.replaceExisting);
    const valid = items
      .filter((q) => q && q.type && q.prompt)
      .map((q, idx) => ({
        ...q,
        id: q.id || `q-imp-${Date.now()}-${idx}`,
        difficulty: normalizeDifficulty(q.difficulty),
        bankId,
      }));
    if (replaceExisting) {
      questions = [...questions.filter((q) => q.bankId !== bankId), ...valid];
    } else {
      questions = [...questions, ...valid];
    }
    broadcastQuestions();
    schedulePersist();
    res.status(201).json({ imported: valid.length, bankId });
  });

  app.post('/api/questions/assign-batch', (req, res) => {
    const ids = Array.isArray(req.body?.questionIds)
      ? (req.body.questionIds as string[])
      : [];
    const activeBank = questionBanks.find((b) => b.isActive);
    const targetBankId = String(req.body?.targetBankId || activeBank?.id || 'bank-tka-sd');
    const mode = req.body?.mode === 'move' ? 'move' : 'copy';

    if (ids.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu soal.' });
      return;
    }

    const idSet = new Set(ids);
    let assignedCount = 0;

    if (mode === 'move') {
      questions = questions.map((q) => {
        if (idSet.has(q.id)) {
          assignedCount += 1;
          return { ...q, bankId: targetBankId };
        }
        return q;
      });
    } else {
      const additions: Question[] = [];
      for (const q of questions) {
        if (!idSet.has(q.id)) continue;
        if (q.bankId === targetBankId) continue;
        assignedCount += 1;
        additions.push({
          ...structuredClone(q),
          id: `q-ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          difficulty: normalizeDifficulty(q.difficulty),
          bankId: targetBankId,
        });
      }
      questions = [...questions, ...additions];
    }

    broadcastQuestions();
    schedulePersist();
    res.json({ ok: true, assignedCount, targetBankId });
  });

  app.post('/api/questions/:id/assign-bank', (req, res) => {
    const { id } = req.params;
    const source = questions.find((q) => q.id === id);
    if (!source) {
      res.status(404).json({ error: 'Soal tidak ditemukan.' });
      return;
    }
    const activeBank = questionBanks.find((b) => b.isActive);
    const targetBankId = String(req.body?.targetBankId || activeBank?.id || 'bank-tka-sd');
    const mode = req.body?.mode === 'move' ? 'move' : 'copy';

    if (source.bankId === targetBankId) {
      res.json({ ok: true, alreadyInBank: true, question: source, targetBankId });
      return;
    }

    if (mode === 'move') {
      const moved: Question = {
        ...source,
        difficulty: normalizeDifficulty(source.difficulty),
        bankId: targetBankId,
      };
      questions = questions.map((q) => (q.id === id ? moved : q));
      broadcastQuestions();
      schedulePersist();
      res.json({ ok: true, question: moved, targetBankId });
      return;
    }

    const cloned: Question = {
      ...structuredClone(source),
      id: `q-ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      difficulty: normalizeDifficulty(source.difficulty),
      bankId: targetBankId,
    };
    questions = [...questions, cloned];
    broadcastQuestions();
    schedulePersist();
    res.status(201).json({ ok: true, question: cloned, targetBankId });
  });

  app.post('/api/questions/weights', (req, res) => {
    const weights = req.body?.weights as Record<string, number> | undefined;
    if (!weights) {
      res.status(400).json({ error: 'Bobot tidak valid.' });
      return;
    }
    questions = questions.map((q) =>
      typeof weights[q.id] === 'number' && weights[q.id] > 0
        ? { ...q, points: weights[q.id] }
        : q
    );
    broadcastQuestions();
    schedulePersist();
    res.json({ ok: true });
  });

  app.put('/api/questions/:id', (req, res) => {
    const { id } = req.params;
    const updated = req.body as Partial<Question>;
    const idx = questions.findIndex((q) => q.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Soal tidak ditemukan.' });
      return;
    }
    const merged = {
      ...questions[idx],
      ...updated,
      id,
      difficulty: normalizeDifficulty(updated.difficulty ?? questions[idx].difficulty),
    } as Question;
    questions[idx] = merged;
    broadcastQuestions();
    schedulePersist();
    res.json(questions[idx]);
  });

  app.delete('/api/questions/:id', (req, res) => {
    questions = questions.filter((q) => q.id !== req.params.id);
    broadcastQuestions();
    schedulePersist();
    res.json({ ok: true });
  });

  // Master Students CRUD + Import
  app.post('/api/master/students', (req, res) => {
    const item = req.body as StudentMaster;
    if (!item?.name || !item?.nis) {
      res.status(400).json({ error: 'Nama dan NIS wajib diisi.' });
      return;
    }
    const created: StudentMaster = {
      id: item.id || `ms-${Date.now()}`,
      name: item.name.trim(),
      nis: item.nis.trim(),
      kelas: item.kelas?.trim() || 'KELAS 6 A',
      phone: item.phone?.trim() || '-',
    };
    masterStudents = [created, ...masterStudents];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.post('/api/master/students/import', (req, res) => {
    const items = Array.isArray(req.body?.students) ? (req.body.students as Partial<StudentMaster>[]) : [];
    const created: StudentMaster[] = items
      .filter((s) => s.name && s.nis)
      .map((s, idx) => ({
        id: `ms-imp-${Date.now()}-${idx}`,
        name: String(s.name).trim(),
        nis: String(s.nis).trim(),
        kelas: String(s.kelas || 'KELAS 6 A').trim(),
        phone: String(s.phone || '-').trim(),
      }));
    masterStudents = [...created, ...masterStudents];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json({ imported: created.length });
  });

  app.put('/api/master/students/:id', (req, res) => {
    const idx = masterStudents.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      return;
    }
    masterStudents[idx] = { ...masterStudents[idx], ...req.body, id: req.params.id };
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json(masterStudents[idx]);
  });

  app.delete('/api/master/students/:id', (req, res) => {
    masterStudents = masterStudents.filter((s) => s.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // Master Teachers CRUD + Import
  app.post('/api/master/teachers', (req, res) => {
    const item = req.body as TeacherMaster;
    if (!item?.name || !item?.nip) {
      res.status(400).json({ error: 'Nama dan NIP/Username wajib diisi.' });
      return;
    }
    const created: TeacherMaster = {
      id: item.id || `mt-${Date.now()}`,
      name: item.name.trim(),
      nip: item.nip.trim(),
      subjects: Array.isArray(item.subjects) ? item.subjects : [],
      classes: Array.isArray(item.classes) ? item.classes : [],
      phone: item.phone?.trim() || '-',
    };
    masterTeachers = [created, ...masterTeachers];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.post('/api/master/teachers/import', (req, res) => {
    const items = Array.isArray(req.body?.teachers)
      ? (req.body.teachers as Partial<TeacherMaster>[])
      : [];
    const created: TeacherMaster[] = items
      .filter((t) => t.name && t.nip)
      .map((t, idx) => ({
        id: `mt-imp-${Date.now()}-${idx}`,
        name: String(t.name).trim(),
        nip: String(t.nip).trim(),
        subjects: Array.isArray(t.subjects) ? t.subjects : ['Umum'],
        classes: Array.isArray(t.classes) ? t.classes : ['KELAS 6 A'],
        phone: String(t.phone || '-').trim(),
      }));
    masterTeachers = [...created, ...masterTeachers];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json({ imported: created.length });
  });

  app.put('/api/master/teachers/:id', (req, res) => {
    const idx = masterTeachers.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Guru tidak ditemukan.' });
      return;
    }
    masterTeachers[idx] = { ...masterTeachers[idx], ...req.body, id: req.params.id };
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json(masterTeachers[idx]);
  });

  app.delete('/api/master/teachers/:id', (req, res) => {
    masterTeachers = masterTeachers.filter((t) => t.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // Classes CRUD
  app.post('/api/master/classes', (req, res) => {
    const item = req.body as Partial<ClassRoom>;
    if (!item?.name) {
      res.status(400).json({ error: 'Nama kelas wajib diisi.' });
      return;
    }
    const created: ClassRoom = {
      id: `cls-${Date.now()}`,
      name: item.name.trim().toUpperCase(),
      level: item.level?.trim() || 'Tingkat 6 SD',
      homeroomTeacher: item.homeroomTeacher?.trim() || '-',
    };
    classes = [...classes, created];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.delete('/api/master/classes/:id', (req, res) => {
    classes = classes.filter((c) => c.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // Subjects CRUD
  app.post('/api/master/subjects', (req, res) => {
    const item = req.body as Partial<SubjectMaster>;
    if (!item?.code || !item?.name) {
      res.status(400).json({ error: 'Kode dan nama mata pelajaran wajib diisi.' });
      return;
    }
    const created: SubjectMaster = {
      id: `sub-${Date.now()}`,
      code: item.code.trim().toUpperCase(),
      name: item.name.trim(),
      category: item.category?.trim() || 'Umum',
    };
    subjects = [...subjects, created];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.delete('/api/master/subjects/:id', (req, res) => {
    subjects = subjects.filter((s) => s.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // E-Learning Materials CRUD
  app.post('/api/materials', (req, res) => {
    const item = req.body as Partial<ElearningMaterial>;
    if (!item?.title || !item?.content) {
      res.status(400).json({ error: 'Judul dan isi materi wajib diisi.' });
      return;
    }
    const created: ElearningMaterial = {
      id: `mat-${Date.now()}`,
      title: item.title.trim(),
      subject: item.subject?.trim() || 'Umum',
      targetClass: item.targetClass?.trim() || 'KELAS 6',
      summary: item.summary?.trim() || '',
      content: item.content.trim(),
      createdAt: new Date().toISOString(),
    };
    materials = [created, ...materials];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.delete('/api/materials/:id', (req, res) => {
    materials = materials.filter((m) => m.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // Users CRUD
  app.post('/api/users', (req, res) => {
    const item = req.body as Partial<UserAccount>;
    if (!item?.name || !item?.username) {
      res.status(400).json({ error: 'Nama dan username wajib diisi.' });
      return;
    }
    const created: UserAccount = {
      id: `usr-${Date.now()}`,
      name: item.name.trim(),
      username: item.username.trim().toLowerCase(),
      role: item.role || 'guru',
      active: true,
    };
    users = [...users, created];
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.status(201).json(created);
  });

  app.patch('/api/users/:id/toggle', (req, res) => {
    users = users.map((u) =>
      u.id === req.params.id ? { ...u, active: !u.active } : u
    );
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  app.delete('/api/users/:id', (req, res) => {
    users = users.filter((u) => u.id !== req.params.id);
    broadcastToProctors({ type: 'state:snapshot', snapshot: getSnapshot() });
    schedulePersist();
    res.json({ ok: true });
  });

  // Announcements CRUD
  app.post('/api/announcements', (req, res) => {
    const body = req.body as Partial<Announcement>;
    if (!body.title || !body.content) {
      res.status(400).json({ error: 'Judul dan isi pengumuman wajib diisi.' });
      return;
    }
    const created: Announcement = {
      id: `ann-${Date.now()}`,
      title: body.title.trim(),
      content: body.content.trim(),
      author: body.author?.trim() || 'Administrator Utama',
      createdAt: new Date().toISOString(),
    };
    announcements = [created, ...announcements];
    broadcastAll({ type: 'announcements:updated', announcements });
    schedulePersist();
    res.status(201).json(created);
  });

  app.delete('/api/announcements/:id', (req, res) => {
    announcements = announcements.filter((a) => a.id !== req.params.id);
    broadcastAll({ type: 'announcements:updated', announcements });
    schedulePersist();
    res.json({ ok: true });
  });

  app.patch('/api/config', (req, res) => {
    examConfig = { ...examConfig, ...req.body };
    broadcastAll({ type: 'exam:updated', examConfig });
    schedulePersist();
    res.json(examConfig);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.set(ws, { ws, role: 'unknown' });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');
      const meta = clients.get(ws);
      if (!meta) return;

      if (type === 'proctor:join') {
        meta.role = 'proctor';
        sendJson(ws, { type: 'state:snapshot', snapshot: getSnapshot() });
        return;
      }

      if (type === 'student:join') {
        const requestedId = String(msg.studentId || '').trim();
        const name = String(msg.name || 'Peserta').trim();
        const nis = String(msg.nis || '0000').trim();
        if (!requestedId) return;

        // Deduplicate by NIS so refreshing/relogging in never spawns duplicate sessions
        const existingByNis = findSessionByNis(nis);
        const sessionId = existingByNis ? existingByNis.id : requestedId;

        meta.role = 'student';
        meta.studentId = sessionId;

        let session = sessions.get(sessionId);
        if (!session) {
          const now = new Date().toISOString();
          session = {
            id: sessionId,
            name,
            nis,
            status: examConfig.globalSuspended ? 'suspended' : 'active',
            answers: {},
            doubtfulIds: [],
            violations: [],
            connected: true,
            startedAt: now,
            lastActiveAt: now,
            remainingSeconds: examConfig.durationMinutes * 60,
            suspendReason: examConfig.globalSuspended
              ? 'Ujian ruang sedang ditangguhkan oleh proktor.'
              : undefined,
          };
          sessions.set(sessionId, session);
        } else {
          session.name = name || session.name;
          session.nis = nis || session.nis;
          session.connected = true;
          session.lastActiveAt = new Date().toISOString();
        }

        sendJson(ws, {
          type: 'student:init',
          examConfig,
          questions: getActiveQuestions(),
          session,
        });
        broadcastToProctors({ type: 'session:updated', session });
        schedulePersist();
        return;
      }

      if (type === 'student:answer') {
        const studentId = meta.studentId || String(msg.studentId || '');
        const session = sessions.get(studentId);
        if (!session) return;
        if (session.status !== 'active' || examConfig.globalSuspended) return;

        const questionId = String(msg.questionId || '');
        const value = msg.value as StudentAnswerValue;
        session.answers[questionId] = value;
        session.lastActiveAt = new Date().toISOString();

        broadcastToProctors({ type: 'session:updated', session });
        sendJson(ws, {
          type: 'answer:ack',
          questionId,
          savedAt: session.lastActiveAt,
        });
        schedulePersist();
        return;
      }

      if (type === 'student:toggle_doubtful') {
        const studentId = meta.studentId || String(msg.studentId || '');
        const session = sessions.get(studentId);
        if (!session || session.status !== 'active') return;
        const questionId = String(msg.questionId || '');
        const exists = session.doubtfulIds.includes(questionId);
        session.doubtfulIds = exists
          ? session.doubtfulIds.filter((id) => id !== questionId)
          : [...session.doubtfulIds, questionId];
        session.lastActiveAt = new Date().toISOString();
        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({ type: 'session:updated', session });
        return;
      }

      if (type === 'student:violation') {
        const studentId = meta.studentId || String(msg.studentId || '');
        const session = sessions.get(studentId);
        if (!session) return;
        if (session.status === 'submitted' || session.status === 'force_stopped') {
          return;
        }

        const reason = String(
          msg.reason || 'Berpindah halaman / membuka aplikasi lain'
        );
        const violation: ViolationLog = {
          id: `vio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId: session.id,
          studentName: session.name,
          nis: session.nis,
          reason,
          timestamp: new Date().toISOString(),
          resolved: false,
        };

        session.violations = [violation, ...session.violations];
        session.lastActiveAt = violation.timestamp;

        if (examConfig.antiCheatEnabled) {
          session.status = 'violation_locked';
        }

        recentViolations = [violation, ...recentViolations].slice(0, 100);

        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({
          type: 'violation:alert',
          violation,
          session,
        });
        schedulePersist();
        return;
      }

      if (type === 'student:submit') {
        const studentId = meta.studentId || String(msg.studentId || '');
        const session = sessions.get(studentId);
        if (!session) return;
        if (session.status === 'force_stopped' || session.status === 'submitted') {
          sendToStudent(session.id, { type: 'session:updated', session });
          return;
        }

        session.status = 'submitted';
        session.endedAt = new Date().toISOString();
        session.lastActiveAt = session.endedAt;
        session.gradeSummary = gradeExam(
          getActiveQuestions(),
          session.answers,
          session.manualEssayOverrides
        );

        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({ type: 'session:updated', session });
        persistNow();
        return;
      }

      if (type === 'proctor:suspend') {
        const targetId = String(msg.studentId || '');
        const session = sessions.get(targetId);
        if (
          !session ||
          session.status === 'submitted' ||
          session.status === 'force_stopped'
        ) {
          return;
        }
        session.status = 'suspended';
        session.suspendReason = String(
          msg.reason || 'Ujian ditangguhkan sementara oleh proktor.'
        );
        session.lastActiveAt = new Date().toISOString();
        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({ type: 'session:updated', session });
        return;
      }

      if (type === 'proctor:resume' || type === 'proctor:unlock_violation') {
        const targetId = String(msg.studentId || '');
        const session = sessions.get(targetId);
        if (
          !session ||
          session.status === 'submitted' ||
          session.status === 'force_stopped'
        ) {
          return;
        }
        session.status = examConfig.globalSuspended ? 'suspended' : 'active';
        session.suspendReason = undefined;
        if (type === 'proctor:unlock_violation') {
          session.violations = session.violations.map((v) => ({
            ...v,
            resolved: true,
          }));
          recentViolations = recentViolations.map((v) =>
            v.studentId === targetId ? { ...v, resolved: true } : v
          );
        }
        session.lastActiveAt = new Date().toISOString();
        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({
          type: 'state:snapshot',
          snapshot: getSnapshot(),
        });
        return;
      }

      if (type === 'proctor:force_stop') {
        const targetId = String(msg.studentId || '');
        const session = sessions.get(targetId);
        if (!session) return;

        session.status = 'force_stopped';
        session.endedAt = new Date().toISOString();
        session.lastActiveAt = session.endedAt;
        session.suspendReason = String(
          msg.reason || 'Ujian dihentikan secara paksa oleh proktor.'
        );
        session.gradeSummary = gradeExam(
          getActiveQuestions(),
          session.answers,
          session.manualEssayOverrides
        );

        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({ type: 'session:updated', session });
        persistNow();
        return;
      }

      if (type === 'proctor:suspend_all') {
        examConfig.globalSuspended = true;
        for (const session of sessions.values()) {
          if (session.status === 'active') {
            session.status = 'suspended';
            session.suspendReason =
              'Seluruh ruang ujian ditangguhkan sementara oleh proktor.';
            sendToStudent(session.id, { type: 'session:updated', session });
          }
        }
        broadcastAll({ type: 'exam:updated', examConfig });
        broadcastToProctors({
          type: 'state:snapshot',
          snapshot: getSnapshot(),
        });
        schedulePersist();
        return;
      }

      if (type === 'proctor:resume_all') {
        examConfig.globalSuspended = false;
        for (const session of sessions.values()) {
          if (session.status === 'suspended') {
            session.status = 'active';
            session.suspendReason = undefined;
            sendToStudent(session.id, { type: 'session:updated', session });
          }
        }
        broadcastAll({ type: 'exam:updated', examConfig });
        broadcastToProctors({
          type: 'state:snapshot',
          snapshot: getSnapshot(),
        });
        schedulePersist();
        return;
      }

      if (type === 'proctor:adjust_essay_score') {
        const targetId = String(msg.studentId || '');
        const questionId = String(msg.questionId || '');
        const score = Number(msg.score);
        const session = sessions.get(targetId);
        if (!session || Number.isNaN(score)) return;
        session.manualEssayOverrides = {
          ...(session.manualEssayOverrides || {}),
          [questionId]: score,
        };
        if (session.status === 'submitted' || session.status === 'force_stopped') {
          session.gradeSummary = gradeExam(
            getActiveQuestions(),
            session.answers,
            session.manualEssayOverrides
          );
        }
        sendToStudent(session.id, { type: 'session:updated', session });
        broadcastToProctors({ type: 'session:updated', session });
        schedulePersist();
        return;
      }

      if (type === 'proctor:reset_session') {
        const targetId = String(msg.studentId || '');
        sessions.delete(targetId);
        recentViolations = recentViolations.filter(
          (v) => v.studentId !== targetId
        );
        sendToStudent(targetId, { type: 'student:reset' });
        broadcastToProctors({
          type: 'state:snapshot',
          snapshot: getSnapshot(),
        });
        persistNow();
        return;
      }

      if (type === 'proctor:clear_violations') {
        recentViolations = [];
        broadcastToProctors({
          type: 'state:snapshot',
          snapshot: getSnapshot(),
        });
        schedulePersist();
      }
    });

    ws.on('close', () => {
      const meta = clients.get(ws);
      clients.delete(ws);
      if (meta?.role === 'student' && meta.studentId) {
        const session = sessions.get(meta.studentId);
        if (session) {
          let stillConnected = false;
          for (const other of clients.values()) {
            if (other.role === 'student' && other.studentId === meta.studentId) {
              stillConnected = true;
              break;
            }
          }
          session.connected = stillConnected;
          broadcastToProctors({ type: 'session:updated', session });
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lentera CBT server listening on http://localhost:${PORT}`);
  });

  process.on('SIGINT', () => {
    persistNow();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    persistNow();
    process.exit(0);
  });
}

startServer();
