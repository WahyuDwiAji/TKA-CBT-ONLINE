import React, { useMemo, useRef, useState } from 'react';
import { Eye, ImagePlus, PencilLine, Plus, Trash2, Upload, X } from 'lucide-react';
import { MathText } from './MathText';
import { QuestionStudentPreview } from './QuestionStudentPreview';
import { sanitizeImageUrl, uploadQuestionImageFile } from '../lib/imageUpload';
import type {
  ChoiceOption,
  Question,
  QuestionDifficulty,
  QuestionType,
  TextDirection,
  TrueFalseStatement,
} from '../types/cbt';
import {
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_DIFFICULTY_ORDER,
  QUESTION_TYPE_LABELS,
  TKA_SD_OFFICIAL_TYPES,
  TKA_SD_SUBJECTS,
} from '../types/cbt';

interface QuestionEditorModalProps {
  initialQuestion?: Question | null;
  availableSubjects?: string[];
  targetBankLabel?: string;
  onSave: (question: Question) => void;
  onClose: () => void;
}

const MATH_SNIPPETS = [
  { label: 'Pecahan', code: '$\\frac{a}{b}$' },
  { label: 'Integral', code: '$$\\int_{a}^{b} f(x)\\,dx$$' },
  { label: 'Akar', code: '$\\sqrt{x^2 + y^2}$' },
  { label: 'Sigma', code: '$\\sum_{i=1}^{n} x_i$' },
  { label: 'Pangkat', code: '$x^{2} + y^{2} = r^{2}$' },
  { label: 'Sudut', code: '$\\sin^2(\\theta) + \\cos^2(\\theta) = 1$' },
];

const SPECIAL_CHARS = [
  { label: '±', value: '±' },
  { label: '≤', value: '≤' },
  { label: '≥', value: '≥' },
  { label: '≠', value: '≠' },
  { label: 'π', value: 'π' },
  { label: '°', value: '°' },
  { label: 'ꦲꦤꦕꦫꦏ', value: 'ꦲꦤꦕꦫꦏ' },
  { label: 'سُبْحَانَ اللَّهِ', value: 'سُبْحَانَ اللَّهِ' },
];

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  initialQuestion,
  availableSubjects = [],
  targetBankLabel,
  onSave,
  onClose,
}) => {
  const [modalTab, setModalTab] = useState<'editor' | 'preview'>('editor');

  const normalizeInitialType = (q?: Question | null): QuestionType => {
    if (!q) return 'multiple_choice';
    if (q.type === 'complex_multiple_choice') return 'mcma';
    if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'mcma') {
      return q.type;
    }
    return 'multiple_choice';
  };

  const [type, setType] = useState<QuestionType>(() => normalizeInitialType(initialQuestion));
  const [subject, setSubject] = useState(
    initialQuestion?.subject || TKA_SD_SUBJECTS[0]
  );
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(
    initialQuestion?.difficulty || 'medium'
  );
  const [prompt, setPrompt] = useState(initialQuestion?.prompt || '');
  const [imageUrl, setImageUrl] = useState(initialQuestion?.imageUrl || '');
  const [imageCaption, setImageCaption] = useState(initialQuestion?.imageCaption || '');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageDragOver, setImageDragOver] = useState(false);
  const [uploadingOptionId, setUploadingOptionId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [points, setPoints] = useState<number>(initialQuestion?.points || 15);
  const [direction, setDirection] = useState<TextDirection>(
    initialQuestion?.direction || 'auto'
  );

  // Type-specific states
  const [options, setOptions] = useState<ChoiceOption[]>(
    initialQuestion &&
      (initialQuestion.type === 'multiple_choice' ||
        initialQuestion.type === 'complex_multiple_choice' ||
        initialQuestion.type === 'mcma')
      ? initialQuestion.options
      : [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
          { id: 'c', text: '' },
          { id: 'd', text: '' },
        ]
  );

  const [correctOptionId, setCorrectOptionId] = useState<string>(
    initialQuestion?.type === 'multiple_choice'
      ? initialQuestion.correctOptionId
      : 'a'
  );

  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(
    initialQuestion?.type === 'complex_multiple_choice' ||
      initialQuestion?.type === 'mcma'
      ? initialQuestion.correctOptionIds
      : ['a']
  );

  const [mcmaScoringMode, setMcmaScoringMode] = useState<'partial' | 'exact'>(
    initialQuestion?.type === 'mcma' && initialQuestion.scoringMode
      ? initialQuestion.scoringMode
      : 'partial'
  );

  const [statements, setStatements] = useState<TrueFalseStatement[]>(
    initialQuestion?.type === 'true_false'
      ? initialQuestion.statements
      : [
          { id: 's1', text: '', isTrue: true },
          { id: 's2', text: '', isTrue: false },
        ]
  );

  const [errorMsg, setErrorMsg] = useState('');

  const mergedSubjectOptions = useMemo(() => {
    const set = new Set<string>([...TKA_SD_SUBJECTS, ...availableSubjects]);
    if (subject.trim()) set.add(subject.trim());
    return Array.from(set);
  }, [availableSubjects, subject]);

  const insertIntoPrompt = (snippet: string) => {
    setPrompt((prev) => (prev ? `${prev} ${snippet}` : snippet));
  };

  const handleQuestionImageFile = async (file: File) => {
    setImageError('');
    setImageUploading(true);
    try {
      const uploadedUrl = await uploadQuestionImageFile(file);
      setImageUrl(uploadedUrl);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Gagal mengunggah gambar soal.'
      );
    } finally {
      setImageUploading(false);
    }
  };

  const handleOptionImageFile = async (optionId: string, file: File) => {
    setImageError('');
    setUploadingOptionId(optionId);
    try {
      const uploadedUrl = await uploadQuestionImageFile(file);
      setOptions((prev) =>
        prev.map((o) => (o.id === optionId ? { ...o, imageUrl: uploadedUrl } : o))
      );
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Gagal mengunggah gambar opsi.'
      );
    } finally {
      setUploadingOptionId(null);
    }
  };

  const handlePromptPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          void handleQuestionImageFile(file);
          return;
        }
      }
    }
  };

  const buildDraftQuestion = (strict: boolean): { question: Question | null; error?: string } => {
    const cleanImageUrl = sanitizeImageUrl(imageUrl) || undefined;
    if (strict && imageUrl.trim() && !cleanImageUrl) {
      return {
        question: null,
        error: 'URL gambar tidak valid. Gunakan unggahan gambar atau link https:// / http://.',
      };
    }
    if (strict && !prompt.trim() && !cleanImageUrl) {
      return { question: null, error: 'Teks pertanyaan atau gambar soal wajib diisi.' };
    }

    const id =
      initialQuestion?.id ||
      `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const base = {
      id,
      bankId: initialQuestion?.bankId,
      subject: subject.trim() || 'Umum',
      difficulty,
      prompt: prompt.trim(),
      imageUrl: cleanImageUrl,
      imageCaption: cleanImageUrl && imageCaption.trim() ? imageCaption.trim() : undefined,
      points: Math.max(1, Number(points) || 10),
      direction,
    };

    if (type === 'multiple_choice') {
      const cleaned = strict
        ? options.filter((o) => o.text.trim().length > 0 || Boolean(sanitizeImageUrl(o.imageUrl)))
        : options;
      if (strict && cleaned.length < 2) {
        return { question: null, error: 'Minimal harus ada 2 pilihan jawaban yang terisi.' };
      }
      const validCorrect = cleaned.some((o) => o.id === correctOptionId)
        ? correctOptionId
        : cleaned[0]?.id || 'a';
      return {
        question: {
          ...base,
          type: 'multiple_choice',
          options: cleaned,
          correctOptionId: validCorrect,
        },
      };
    }

    if (type === 'mcma') {
      const cleaned = strict
        ? options.filter((o) => o.text.trim().length > 0 || Boolean(sanitizeImageUrl(o.imageUrl)))
        : options;
      if (strict && cleaned.length < 2) {
        return { question: null, error: 'Minimal harus ada 2 pilihan jawaban yang terisi.' };
      }
      const validCorrects = correctOptionIds.filter((cid) =>
        cleaned.some((o) => o.id === cid)
      );
      if (strict && validCorrects.length === 0) {
        return {
          question: null,
          error: 'Pilih minimal 1 jawaban benar untuk soal MCMA.',
        };
      }
      return {
        question: {
          ...base,
          type: 'mcma',
          options: cleaned,
          correctOptionIds: validCorrects,
          scoringMode: mcmaScoringMode,
        },
      };
    }

    const cleanedStatements = strict
      ? statements.filter((s) => s.text.trim().length > 0)
      : statements;
    if (strict && cleanedStatements.length < 1) {
      return {
        question: null,
        error: 'Minimal harus ada 1 pernyataan Benar atau Salah.',
      };
    }
    return {
      question: {
        ...base,
        type: 'true_false',
        statements: cleanedStatements,
      },
    };
  };

  const previewQuestion = useMemo(() => buildDraftQuestion(false).question, [
    initialQuestion?.id,
    initialQuestion?.bankId,
    type,
    subject,
    difficulty,
    prompt,
    imageUrl,
    imageCaption,
    points,
    direction,
    options,
    correctOptionId,
    correctOptionIds,
    mcmaScoringMode,
    statements,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const built = buildDraftQuestion(true);
    if (!built.question) {
      setErrorMsg(built.error || 'Data soal belum valid.');
      setModalTab('editor');
      return;
    }
    onSave(built.question);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header with Mode Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {initialQuestion ? 'Edit Butir Soal' : 'Tambah Butir Soal Baru'}
            </h2>
            {targetBankLabel && (
              <p className="text-xs text-slate-500 mt-0.5">
                Bank Tujuan: <span className="font-semibold text-slate-700">{targetBankLabel}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setModalTab('editor')}
                className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  modalTab === 'editor'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PencilLine className="w-3.5 h-3.5" />
                Editor &amp; Kategori
              </button>
              <button
                type="button"
                onClick={() => setModalTab('preview')}
                className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  modalTab === 'preview'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Pratinjau Soal Siswa
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
            {errorMsg && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            {modalTab === 'preview' && previewQuestion ? (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-blue-900">
                    Ini adalah simulasi tampilan persis seperti di <strong>Exam Browser Siswa</strong>. Anda dapat mencoba memilih jawaban sebelum menyimpan soal ini ke bank/ujian.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalTab('editor')}
                    className="h-8 px-3 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 rounded-lg whitespace-nowrap"
                  >
                    Kembali ke Editor
                  </button>
                </div>
                <QuestionStudentPreview
                  question={previewQuestion}
                  questionNumber={1}
                  interactive
                  defaultShowAnswerKey
                />
              </div>
            ) : (
              <div className="space-y-6 bg-white border border-slate-200 rounded-2xl p-5">
                {/* Categorization & Question Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Jenis Soal
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as QuestionType)}
                      className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {TKA_SD_OFFICIAL_TYPES.map((qt) => (
                        <option key={qt} value={qt}>
                          {QUESTION_TYPE_LABELS[qt]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Kategori Mata Pelajaran
                    </label>
                    <input
                      type="text"
                      list="tka-sd-subjects"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="cth. Matematika — Bilangan"
                      className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <datalist id="tka-sd-subjects">
                      {mergedSubjectOptions.map((subj) => (
                        <option key={subj} value={subj} />
                      ))}
                    </datalist>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Tingkat Kesulitan
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                      className="w-full h-10 px-3 text-sm font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {QUESTION_DIFFICULTY_ORDER.map((diff) => (
                        <option key={diff} value={diff}>
                          {QUESTION_DIFFICULTY_LABELS[diff]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Bobot
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={points}
                        onChange={(e) => setPoints(Number(e.target.value))}
                        className="w-full h-10 px-2.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Arah
                      </label>
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value as TextDirection)}
                        className="w-full h-10 px-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="auto">Auto</option>
                        <option value="ltr">LTR</option>
                        <option value="rtl">RTL</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Prompt & Live Math Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Pertanyaan (Mendukung LaTeX $...$ / $$...$$, Ctrl+V tempel gambar)
                    </label>
                    <textarea
                      rows={5}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onPaste={handlePromptPaste}
                      dir={direction === 'rtl' ? 'rtl' : 'ltr'}
                      placeholder="Tulis pertanyaan di sini... Gunakan $x^2$ untuk rumus atau Ctrl+V untuk menempel gambar langsung."
                      className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {MATH_SNIPPETS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => insertIntoPrompt(s.code)}
                          className="h-7 px-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition-colors whitespace-nowrap"
                        >
                          + {s.label}
                        </button>
                      ))}
                      {SPECIAL_CHARS.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => insertIntoPrompt(c.value)}
                          className="h-7 px-2 text-xs bg-slate-50 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition-colors whitespace-nowrap"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Pratinjau Cepat Teks &amp; Rumus
                    </label>
                    <div className="min-h-[144px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 space-y-3">
                      {prompt.trim() ? (
                        <MathText text={prompt} direction={direction} />
                      ) : (
                        <span className="text-slate-400">
                          Pratinjau rumus matematika, teks Arab RTL, atau Aksara Jawa akan tampil di sini.
                        </span>
                      )}
                      {sanitizeImageUrl(imageUrl) && (
                        <img
                          src={sanitizeImageUrl(imageUrl) || ''}
                          alt={imageCaption || 'Ilustrasi soal'}
                          className="max-h-40 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Question Stimulus Image Upload / URL Section */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-900">
                        Gambar / Ilustrasi Soal (Opsional)
                      </span>
                      <p className="text-xs text-slate-500">
                        Cocok untuk bangun datar, grafik, peta, atau stimulus bacaan bergambar (PNG, JPG, WebP, GIF maks. 10 MB).
                      </p>
                    </div>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl('');
                          setImageCaption('');
                          setImageError('');
                        }}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus Gambar
                      </button>
                    )}
                  </div>

                  {imageError && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                      {imageError}
                    </div>
                  )}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleQuestionImageFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setImageDragOver(true);
                      }}
                      onDragLeave={() => setImageDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setImageDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handleQuestionImageFile(file);
                      }}
                      className={`lg:col-span-6 border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                        imageDragOver
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-300 bg-slate-50 hover:border-blue-400'
                      }`}
                    >
                      {sanitizeImageUrl(imageUrl) ? (
                        <div className="space-y-3">
                          <img
                            src={sanitizeImageUrl(imageUrl) || ''}
                            alt={imageCaption || 'Pratinjau gambar soal'}
                            className="max-h-48 mx-auto rounded-lg border border-slate-200 bg-white object-contain"
                          />
                          <button
                            type="button"
                            disabled={imageUploading}
                            onClick={() => imageInputRef.current?.click()}
                            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {imageUploading ? 'Mengunggah...' : 'Ganti Gambar'}
                          </button>
                        </div>
                      ) : (
                        <div className="py-2 space-y-2">
                          <ImagePlus className="w-7 h-7 text-blue-600 mx-auto" />
                          <p className="text-xs font-semibold text-slate-700">
                            {imageUploading
                              ? 'Mengunggah dan mengoptimalkan gambar...'
                              : 'Tarik & lepas file gambar ke sini atau pilih dari perangkat'}
                          </p>
                          <button
                            type="button"
                            disabled={imageUploading}
                            onClick={() => imageInputRef.current?.click()}
                            className="h-8 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 rounded-lg"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Pilih File Gambar
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-6 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Atau Tempel Link URL Gambar (https://...)
                        </label>
                        <input
                          type="text"
                          value={imageUrl}
                          onChange={(e) => {
                            setImageUrl(e.target.value);
                            setImageError('');
                          }}
                          placeholder="https://contoh.com/bangun-datar.png"
                          className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Keterangan / Label Gambar (Opsional)
                        </label>
                        <input
                          type="text"
                          value={imageCaption}
                          onChange={(e) => setImageCaption(e.target.value)}
                          placeholder="cth. Gambar 1. Denah taman sekolah"
                          className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Type-specific Answer Key Builder */}
                {(type === 'multiple_choice' || type === 'mcma') && (
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {type === 'multiple_choice'
                          ? 'Opsi Pilihan Ganda (Tandai 1 kunci benar)'
                          : 'Opsi MCMA (Centang beberapa jawaban benar)'}
                      </span>
                      <div className="flex items-center gap-2">
                        {type === 'mcma' && (
                          <select
                            value={mcmaScoringMode}
                            onChange={(e) =>
                              setMcmaScoringMode(e.target.value as 'partial' | 'exact')
                            }
                            className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                            title="Sistem penilaian MCMA"
                          >
                            <option value="partial">Skor MCMA: Parsial Proporsional</option>
                            <option value="exact">Skor MCMA: Tepat Semua (All-or-Nothing)</option>
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((prev) => [
                              ...prev,
                              {
                                id: String.fromCharCode(97 + prev.length),
                                text: '',
                              },
                            ])
                          }
                          className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Tambah Opsi
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {options.map((opt, idx) => {
                        const isSelected =
                          type === 'multiple_choice'
                            ? correctOptionId === opt.id
                            : correctOptionIds.includes(opt.id);
                        const validOptImg = sanitizeImageUrl(opt.imageUrl);
                        return (
                          <div key={opt.id} className="space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              <input
                                type={type === 'multiple_choice' ? 'radio' : 'checkbox'}
                                name="correct-option"
                                checked={isSelected}
                                onChange={() => {
                                  if (type === 'multiple_choice') {
                                    setCorrectOptionId(opt.id);
                                  } else {
                                    setCorrectOptionIds((prev) =>
                                      prev.includes(opt.id)
                                        ? prev.filter((id) => id !== opt.id)
                                        : [...prev, opt.id]
                                    );
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 shrink-0"
                              />
                              <span className="w-6 text-xs font-mono uppercase text-slate-500 shrink-0">
                                {String.fromCharCode(65 + idx)}
                              </span>
                              <input
                                type="text"
                                value={opt.text}
                                dir={direction === 'rtl' ? 'rtl' : 'ltr'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setOptions((prev) =>
                                    prev.map((o) =>
                                      o.id === opt.id ? { ...o, text: val } : o
                                    )
                                  );
                                }}
                                placeholder={`Teks opsi ${String.fromCharCode(65 + idx)} (mendukung $rumus$)`}
                                className="flex-1 h-10 px-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              <label
                                title={`Tambah gambar pada opsi ${String.fromCharCode(65 + idx)}`}
                                className={`h-9 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-lg border cursor-pointer shrink-0 transition-colors ${
                                  validOptImg
                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <ImagePlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">
                                  {uploadingOptionId === opt.id ? '...' : 'Gambar'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  disabled={uploadingOptionId === opt.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleOptionImageFile(opt.id, file);
                                    e.target.value = '';
                                  }}
                                  className="hidden"
                                />
                              </label>
                              {options.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOptions((prev) =>
                                      prev.filter((o) => o.id !== opt.id)
                                    )
                                  }
                                  className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            {validOptImg && (
                              <div className="ml-14 flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-lg w-fit">
                                <img
                                  src={validOptImg}
                                  alt={`Gambar opsi ${String.fromCharCode(65 + idx)}`}
                                  className="h-14 w-auto rounded border border-slate-200 bg-white object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOptions((prev) =>
                                      prev.map((o) =>
                                        o.id === opt.id ? { ...o, imageUrl: undefined } : o
                                      )
                                    )
                                  }
                                  className="text-[11px] font-semibold text-rose-600 hover:underline px-1.5"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {type === 'true_false' && (
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        Pilihan Ganda Kompleks: Daftar Pernyataan (Benar/Salah atau Sesuai/Tidak Sesuai)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setStatements((prev) => [
                            ...prev,
                            { id: `s${Date.now()}`, text: '', isTrue: true },
                          ])
                        }
                        className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Tambah Pernyataan
                      </button>
                    </div>
                    <div className="space-y-2">
                      {statements.map((stmt, idx) => (
                        <div key={stmt.id} className="flex items-center gap-3">
                          <span className="w-6 text-xs font-mono text-slate-500">
                            {idx + 1}.
                          </span>
                          <input
                            type="text"
                            value={stmt.text}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStatements((prev) =>
                                prev.map((s) =>
                                  s.id === stmt.id ? { ...s, text: val } : s
                                )
                              );
                            }}
                            placeholder="Tulis pernyataan (mendukung $rumus$)"
                            className="flex-1 h-10 px-3 text-sm border border-slate-300 rounded-xl"
                          />
                          <select
                            value={stmt.isTrue ? 'true' : 'false'}
                            onChange={(e) => {
                              const val = e.target.value === 'true';
                              setStatements((prev) =>
                                prev.map((s) =>
                                  s.id === stmt.id ? { ...s, isTrue: val } : s
                                )
                              );
                            }}
                            className="h-10 px-3 text-sm border border-slate-300 rounded-xl bg-white"
                          >
                            <option value="true">Benar</option>
                            <option value="false">Salah</option>
                          </select>
                          {statements.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setStatements((prev) =>
                                  prev.filter((s) => s.id !== stmt.id)
                                )
                              }
                              className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-white">
            <button
              type="button"
              onClick={() =>
                setModalTab((t) => (t === 'editor' ? 'preview' : 'editor'))
              }
              className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl whitespace-nowrap"
            >
              {modalTab === 'editor' ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Pratinjau Sebelum Simpan
                </>
              ) : (
                <>
                  <PencilLine className="w-3.5 h-3.5" />
                  Edit Kembali
                </>
              )}
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="submit"
                className="h-9 px-5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Simpan Soal
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
