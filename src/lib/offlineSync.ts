import type { StudentAnswerValue } from '../types/cbt';

const STORAGE_PREFIX = 'cbt_offline_exam_v1_';

export interface OfflineExamState {
  studentId: string;
  answers: Record<string, StudentAnswerValue>;
  pendingAnswerIds: string[];
  doubtfulIds: string[];
  pendingDoubtfulSync: boolean;
  pendingSubmit: boolean;
  seq: number;
  updatedAt: string;
}

function xorObfuscate(input: string, key: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    out += String.fromCharCode(code);
  }
  return out;
}

function encodePayload(raw: string, studentId: string): string {
  const key = `tka-cbt-${studentId}-v1`;
  const xored = xorObfuscate(raw, key);
  const bytes = new TextEncoder().encode(xored);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodePayload(encoded: string, studentId: string): string | null {
  try {
    const key = `tka-cbt-${studentId}-v1`;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const xored = new TextDecoder().decode(bytes);
    return xorObfuscate(xored, key);
  } catch {
    return null;
  }
}

export function loadOfflineExamState(studentId: string): OfflineExamState | null {
  if (!studentId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${studentId}`);
    if (!raw) return null;
    const decoded = decodePayload(raw, studentId);
    if (!decoded) return null;
    const parsed = JSON.parse(decoded) as OfflineExamState;
    if (parsed && parsed.studentId === studentId) {
      return parsed;
    }
  } catch {
    // ignore corrupted local storage
  }
  return null;
}

export function saveOfflineExamState(state: OfflineExamState): void {
  if (!state.studentId || typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    const encoded = encodePayload(serialized, state.studentId);
    window.localStorage.setItem(`${STORAGE_PREFIX}${state.studentId}`, encoded);
  } catch {
    // ignore storage quota failures
  }
}

export function clearOfflineExamState(studentId: string): void {
  if (!studentId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${studentId}`);
  } catch {
    // ignore
  }
}
