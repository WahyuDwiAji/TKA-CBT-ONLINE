export const LOGIN_DRAFT_KEYS = {
  studentName: 'cbt_student_name',
  studentNis: 'cbt_student_nis',
  studentSessionCode: 'cbt_student_session_code',
  portalTab: 'cbt_portal_entry_tab',
  proctorUsername: 'cbt_proctor_username',
  theme: 'cbt_theme',
} as const;

export function readLocalDraft(key: string, fallback = ''): string {
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalDraft(key: string, value: string): void {
  try {
    if (value === '') {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Abaikan jika penyimpanan lokal dibatasi oleh mode privat browser
  }
}

export function clearStudentLoginDraft(): void {
  try {
    window.localStorage.removeItem(LOGIN_DRAFT_KEYS.studentName);
    window.localStorage.removeItem(LOGIN_DRAFT_KEYS.studentNis);
    window.localStorage.removeItem(LOGIN_DRAFT_KEYS.studentSessionCode);
  } catch {
    // Abaikan jika penyimpanan lokal dibatasi
  }
}
