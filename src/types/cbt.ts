export type QuestionType =
  | 'multiple_choice'
  | 'complex_multiple_choice'
  | 'mcma'
  | 'matching'
  | 'true_false'
  | 'essay';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type TextDirection = 'ltr' | 'rtl' | 'auto';

export interface ChoiceOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface TrueFalseStatement {
  id: string;
  text: string;
  isTrue: boolean;
}

export interface BaseQuestion {
  id: string;
  bankId?: string;
  type: QuestionType;
  subject: string;
  difficulty?: QuestionDifficulty;
  prompt: string;
  imageUrl?: string;
  imageCaption?: string;
  points: number;
  direction?: TextDirection;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple_choice';
  options: ChoiceOption[];
  correctOptionId: string;
}

export interface ComplexMultipleChoiceQuestion extends BaseQuestion {
  type: 'complex_multiple_choice';
  options: ChoiceOption[];
  correctOptionIds: string[];
}

export interface McmaQuestion extends BaseQuestion {
  type: 'mcma';
  options: ChoiceOption[];
  correctOptionIds: string[];
  scoringMode?: 'partial' | 'exact';
}

export interface MatchingQuestion extends BaseQuestion {
  type: 'matching';
  pairs: MatchingPair[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'true_false';
  statements: TrueFalseStatement[];
}

export interface EssayQuestion extends BaseQuestion {
  type: 'essay';
  expectedKeywords: string[];
  sampleAnswer: string;
}

export type Question =
  | MultipleChoiceQuestion
  | ComplexMultipleChoiceQuestion
  | McmaQuestion
  | MatchingQuestion
  | TrueFalseQuestion
  | EssayQuestion;

export type StudentAnswerValue =
  | string
  | string[]
  | Record<string, string>
  | Record<string, boolean>;

export type StudentStatus =
  | 'active'
  | 'suspended'
  | 'violation_locked'
  | 'force_stopped'
  | 'submitted';

export interface ViolationLog {
  id: string;
  studentId: string;
  studentName: string;
  nis: string;
  reason: string;
  timestamp: string;
  resolved: boolean;
}

export interface QuestionGradeResult {
  questionId: string;
  type: QuestionType;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean;
  feedback: string;
}

export interface ExamGradeSummary {
  totalScore: number;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  totalQuestions: number;
  breakdown: QuestionGradeResult[];
  gradedAt: string;
}

export interface StudentSession {
  id: string;
  name: string;
  nis: string;
  status: StudentStatus;
  answers: Record<string, StudentAnswerValue>;
  doubtfulIds: string[];
  violations: ViolationLog[];
  connected: boolean;
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  remainingSeconds: number;
  gradeSummary?: ExamGradeSummary;
  manualEssayOverrides?: Record<string, number>;
  suspendReason?: string;
}

export interface StudentMaster {
  id: string;
  name: string;
  nis: string;
  kelas: string;
  phone: string;
}

export interface TeacherMaster {
  id: string;
  name: string;
  nip: string;
  subjects: string[];
  classes: string[];
  phone: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  level: string;
  homeroomTeacher: string;
}

export interface SubjectMaster {
  id: string;
  code: string;
  name: string;
  category: string;
}

export interface QuestionBank {
  id: string;
  code: string;
  name: string;
  subject: string;
  targetClass: string;
  isActive: boolean;
  targetCounts?: Record<QuestionType, number>;
}

export interface ElearningMaterial {
  id: string;
  title: string;
  subject: string;
  targetClass: string;
  summary: string;
  content: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'guru' | 'proktor';
  active: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: string;
}

export interface ExamConfig {
  id: string;
  title: string;
  subtitle: string;
  schoolName?: string;
  durationMinutes: number;
  kkm?: number;
  antiCheatEnabled: boolean;
  globalSuspended: boolean;
  maxViolationsBeforeLock: number;
  shuffleQuestions?: boolean;
  showResultToStudent?: boolean;
  requireRegisteredNis?: boolean;
  requireSessionCode?: boolean;
  proctorPin?: string;
  scheduleDate?: string;
  startTime?: string;
  endTime?: string;
  sessionCode?: string;
  roomName?: string;
}

export interface ServerSnapshot {
  examConfig: ExamConfig;
  questions: Question[];
  sessions: StudentSession[];
  recentViolations: ViolationLog[];
  masterStudents: StudentMaster[];
  masterTeachers: TeacherMaster[];
  classes: ClassRoom[];
  subjects: SubjectMaster[];
  questionBanks: QuestionBank[];
  materials: ElearningMaterial[];
  users: UserAccount[];
  announcements: Announcement[];
}

export const TKA_SD_OFFICIAL_TYPES: QuestionType[] = [
  'multiple_choice',
  'true_false',
  'mcma',
];

export const TKA_SD_SUBJECTS = [
  'Matematika',
  'Bahasa Indonesia',
  'Matematika — Bilangan',
  'Matematika — Geometri & Pengukuran',
  'Matematika — Data',
  'Bahasa Indonesia — Teks Informasi',
  'Bahasa Indonesia — Teks Fiksi',
] as const;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Pilihan Ganda (PG)',
  true_false: 'Pilihan Ganda Kompleks (Benar/Salah)',
  mcma: 'MCMA (Multiple Choice Multiple Answer)',
  complex_multiple_choice: 'MCMA (Multiple Answer)',
  matching: 'Menjodohkan',
  essay: 'Esai / Uraian',
};

export const QUESTION_TYPE_SHORT: Record<QuestionType, string> = {
  multiple_choice: 'PG',
  true_false: 'PGK',
  mcma: 'MCMA',
  complex_multiple_choice: 'MCMA',
  matching: 'Jodoh',
  essay: 'Esai',
};

export const QUESTION_DIFFICULTY_ORDER: QuestionDifficulty[] = [
  'easy',
  'medium',
  'hard',
];

export const QUESTION_DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
};

