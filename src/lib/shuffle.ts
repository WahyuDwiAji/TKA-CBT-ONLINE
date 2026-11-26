import type { Question } from '../types/cbt';

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const arr = [...items];
  const rand = createRng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyStudentRandomization(
  questions: Question[],
  studentId: string,
  shuffleQuestions?: boolean,
  shuffleOptions?: boolean
): Question[] {
  let result = shuffleQuestions
    ? seededShuffle(questions, `qs:${studentId}`)
    : [...questions];

  if (shuffleOptions) {
    result = result.map((q) => {
      if (
        q.type === 'multiple_choice' ||
        q.type === 'mcma' ||
        q.type === 'complex_multiple_choice'
      ) {
        return {
          ...q,
          options: seededShuffle(q.options, `opt:${studentId}:${q.id}`),
        };
      }
      return q;
    });
  }

  return result;
}
