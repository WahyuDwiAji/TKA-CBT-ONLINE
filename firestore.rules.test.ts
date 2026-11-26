/**
 * Firestore Security Rules Adversarial Test Suite ("Dirty Dozen" Verification)
 * Target: firestore.rules for CBT Online SD Pedak
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import fs from 'node:fs';

let testEnv: RulesTestEnvironment;

export async function runSecurityRulesSuite() {
  testEnv = await initializeTestEnvironment({
    projectId: 'organic-stage-vm4ph',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(doc(adminDb, 'publicConfig', 'exam'), {
      id: 'tryout-tka-sd-2026',
      title: 'Tryout TKA SD',
      schoolName: 'SD Pedak',
      activeBankId: 'bank-tka-sd',
      durationMinutes: 90,
      antiCheatEnabled: true,
      globalSuspended: false,
      maxViolationsBeforeLock: 3,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(adminDb, 'privateConfig', 'exam'), {
      proctorPin: '123456',
      sessionCode: 'TKA-SD-01',
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(adminDb, 'questionKeys', 'tka-sd-1'), {
      id: 'tka-sd-1',
      bankId: 'bank-tka-sd',
      type: 'multiple_choice',
      correctOptionId: 'b',
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(adminDb, 'masterStudents', 'ms-1'), {
      id: 'ms-1',
      name: 'Siti Aminah',
      nis: '6001',
      kelas: 'KELAS 6 A',
      phone: '081234567801',
    });
  });

  const studentA = testEnv.authenticatedContext('student-a', {
    email: 'siswa.a@gmail.com',
    email_verified: true,
  });
  const spoofedAdmin = testEnv.authenticatedContext('spoof-uid', {
    email: 'exsaravan@gmail.com',
    email_verified: false,
  });
  const realAdmin = testEnv.authenticatedContext('real-admin-uid', {
    email: 'exsaravan@gmail.com',
    email_verified: true,
  });

  const dbA = studentA.firestore();
  const dbSpoof = spoofedAdmin.firestore();
  const dbAdmin = realAdmin.firestore();

  // 1. Identity spoofing on session create
  await assertFails(
    setDoc(doc(dbA, 'examSessions', 'student-b'), {
      id: 'student-b',
      ownerUid: 'student-b',
      name: 'Impostor',
      nis: '9999',
      status: 'active',
      answers: {},
      doubtfulIds: [],
      violations: [],
      connected: true,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      remainingSeconds: 5400,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 2. Shadow field injection on session create
  await assertFails(
    setDoc(doc(dbA, 'examSessions', 'student-a'), {
      id: 'student-a',
      ownerUid: 'student-a',
      name: 'Siti Aminah',
      nis: '6001',
      status: 'active',
      answers: {},
      doubtfulIds: [],
      violations: [],
      connected: true,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      remainingSeconds: 5400,
      isAdmin: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 3. Unverified email admin spoof
  await assertFails(getDoc(doc(dbSpoof, 'privateConfig', 'exam')));

  // Valid create for student A
  await assertSucceeds(
    setDoc(doc(dbA, 'examSessions', 'student-a'), {
      id: 'student-a',
      ownerUid: 'student-a',
      name: 'Siti Aminah',
      nis: '6001',
      status: 'active',
      answers: {},
      doubtfulIds: [],
      violations: [],
      connected: true,
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      remainingSeconds: 5400,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 5. Client manualEssayOverrides forgery while active
  await assertFails(
    updateDoc(doc(dbA, 'examSessions', 'student-a'), {
      manualEssayOverrides: { 'tka-sd-1': 100 },
      updatedAt: serverTimestamp(),
    })
  );

  // 6 & 7. Active-exam key scraping (list & get)
  await assertFails(getDocs(collection(dbA, 'questionKeys')));
  await assertFails(getDoc(doc(dbA, 'questionKeys', 'tka-sd-1')));

  // 8. PII scraping on masterStudents
  await assertFails(getDocs(collection(dbA, 'masterStudents')));
  await assertFails(getDoc(doc(dbA, 'masterStudents', 'ms-1')));

  // 9. Proctor secret read by student
  await assertFails(getDoc(doc(dbA, 'privateConfig', 'exam')));

  // 10. ID poisoning
  await assertFails(
    setDoc(doc(dbA, 'examSessions', 'invalid id with spaces!'), {
      id: 'invalid',
      ownerUid: 'student-a',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // 11. Timestamp forgery
  await assertFails(
    updateDoc(doc(dbA, 'examSessions', 'student-a'), {
      answers: { 'tka-sd-1': 'b' },
      updatedAt: '2026-01-01T00:00:00Z',
    })
  );

  // 12. Privilege escalation
  await assertFails(
    setDoc(doc(dbA, 'admins', 'student-a'), {
      uid: 'student-a',
      role: 'admin',
    })
  );

  // Submit student A cleanly -> unlocks single-key get & locks answers
  await assertSucceeds(
    updateDoc(doc(dbA, 'examSessions', 'student-a'), {
      status: 'submitted',
      endedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    })
  );

  // 4. Post-submit answer tampering must fail
  await assertFails(
    updateDoc(doc(dbA, 'examSessions', 'student-a'), {
      answers: { 'tka-sd-1': 'b' },
      status: 'active',
      updatedAt: serverTimestamp(),
    })
  );

  // Post-submit key read succeeds for grading, admin read succeeds
  await assertSucceeds(getDoc(doc(dbA, 'questionKeys', 'tka-sd-1')));
  await assertSucceeds(getDoc(doc(dbAdmin, 'privateConfig', 'exam')));

  await testEnv.cleanup();
}
