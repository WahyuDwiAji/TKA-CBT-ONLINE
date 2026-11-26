# Security Specification — CBT Online SD Pedak (Tryout TKA SD)

## 1. Data Invariants
1. **Admin Authority & Verified Email**: Only users with `request.auth.token.email_verified == true` AND either the bootstrapped runtime admin email (`exsaravan@gmail.com`) or an active entry in `/admins/{uid}` or `/adminEmails/{email}` may mutate exam configuration, question banks, question keys, master data, or other students' sessions.
2. **Exam Session Ownership**: A student's `examSessions/{sessionId}` document MUST use `sessionId == request.auth.uid` and `ownerUid == request.auth.uid` on creation; `ownerUid` and `createdAt` are immutable forever.
3. **Terminal State Locking**: Once an `examSessions/{uid}` reaches `'submitted'` or `'force_stopped'`, the student can no longer change `answers`, `doubtfulIds`, `status`, `remainingSeconds`, `violations`, or `manualEssayOverrides`. Only a proctor/admin can reset/regrade/override.
4. **Answer Key Isolation During Active Exam**: Answer keys and explanations live in `/questionKeys/{questionId}` rather than `/questions/{questionId}`. Students cannot `list` `/questionKeys` and can only `get` a key document once their own `examSessions/{uid}` is in `'submitted'` or `'force_stopped'`.
5. **PII & Secret Isolation**: `/masterStudents`, `/masterTeachers`, `/users`, and `/privateConfig` (PIN Proktor, raw sessionCode) are readable/writable ONLY by `isAdmin()`.
6. **Strict Schema & Bounds**: Every write validates required + allowed keys (`hasAll` + `hasOnly`), type safety, bounded string lengths (including compressed question image data URLs <= 350,000 chars), bounded arrays, valid IDs (`^[a-zA-Z0-9_\-]+$`), and server timestamps (`request.time`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Identity Spoofing on Session Create**: Student A (`uid-a`) attempts to `setDoc` `/examSessions/uid-b` with `ownerUid: "uid-b"`.
2. **Shadow Field Injection on Session Create**: Student A attempts to create `/examSessions/uid-a` with extra ghost field `isAdmin: true` or pre-populated `gradeSummary`.
3. **Unverified Email Admin Spoof**: Attacker signs in with `email: "exsaravan@gmail.com"` and `email_verified: false` and tries to read `/privateConfig/exam`.
4. **Post-Submit Answer Tampering**: Student A has `status: "submitted"` and attempts to `updateDoc` `answers` or revert `status` back to `"active"`.
5. **Client Score / Essay Override Forgery**: Student A attempts to set or modify `manualEssayOverrides` on `/examSessions/uid-a` while active or after submit.
6. **Active-Exam Key Scraping (List)**: Student A with `status: "active"` tries `getDocs(collection(db, "questionKeys"))`.
7. **Active-Exam Key Scraping (Single Get)**: Student A with `status: "active"` tries `getDoc(doc(db, "questionKeys", "tka-sd-1"))`.
8. **PII Scraping on Master Students**: Student A tries `getDocs(collection(db, "masterStudents"))` or `getDoc(doc(db, "masterStudents", "ms-1"))`.
9. **Proctor Secret Read by Student**: Student A tries `getDoc(doc(db, "privateConfig", "exam"))` to read `proctorPin` or `sessionCode`.
10. **ID Poisoning**: Attacker tries to create `/examSessions/../../../etc/passwd` or a 500-char document ID.
11. **Timestamp Forgery**: Student A attempts to create `/examSessions/uid-a` with `createdAt` set to a past client timestamp instead of `serverTimestamp()`.
12. **Privilege Escalation**: Student A attempts to write `/admins/uid-a` or `/adminEmails/attacker@gmail.com` to grant themselves proctor access.
