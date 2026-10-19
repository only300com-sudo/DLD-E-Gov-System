# Incident Runbook

## Contact Escalation Path
1. **L1 — Officer/Reception:** initial detection + triage
2. **L2 — Trustee Manager:** decision authority for case-blocking issues
3. **L3 — System Administrator:** infrastructure + DB + security
4. **L4 — DPO:** if data breach or PDPL-related

## Common Incidents + Playbooks

### 1. Database Corruption
**Symptoms:** `PRAGMA integrity_check` returns non-"ok", API 500s on case detail.
**Playbook:**
1. Stop the dev server: `pkill -f "next dev"`
2. List backups: `bun run restore --list`
3. Verify the most recent backup: `bun run restore --file=... --verify-only`
4. If verify passes: `bun run restore --file=... --target=/home/z/my-project/db/custom.db`
5. Restart: `bun run dev`
6. Verify: `curl http://localhost:3000/api/health`

### 2. Rate Limit False Positives
**Symptoms:** Legitimate users getting 429 on login.
**Playbook:**
1. Check audit log for `RATE_LIMIT_EXCEEDED` entries
2. If pattern is legit traffic, temporarily increase thresholds:
   - Set env: `RATE_LIMIT_LOGIN=20` (or disable temporarily)
3. Restart dev server
4. Investigate root cause (bot? shared IP? UI retry loop?)

### 3. SSE Stream Down
**Symptoms:** Real-time updates not propagating, presence bar shows "Offline".
**Playbook:**
1. Check `/api/health` — verify `sseConnections` check
2. Check dev log for SSE errors
3. Restart dev server (subscribers are in-memory, will reconnect on restart)
4. Verify: open two sessions, check presence bar

### 4. Backup Failure
**Symptoms:** No new backup in > 36h, Manager notification "Scheduled backup failed".
**Playbook:**
1. Check backup dir permissions: `ls -la /home/z/my-project/backups/`
2. Check disk space: `df -h /`
3. Check `BACKUP_ENCRYPTION_KEY` in `.env`
4. Run manual backup: `bun run backup`
5. If VACUUM INTO fails: check WAL size + run `PRAGMA wal_checkpoint(TRUNCATE)`

### 5. Login Lockout
**Symptoms:** User locked out after 5 failed attempts.
**Playbook:**
1. Check audit log for `LOGIN_FAILED` entries
2. Reset lockout via direct DB:
   ```sql
   UPDATE User SET failedAttempts=0, lockedUntil=NULL WHERE email='user@trustee.ae';
   ```
3. If user forgot password: Admin can reset via `/api/users/[id]` PATCH (if implemented) or direct DB update + Argon2id rehash

### 6. Lost Password / TOTP Backup Codes
**Symptoms:** User can't login — forgot password, lost TOTP device, out of backup codes.
**Playbook:**
1. Verify user identity via alternative channel (in-person, phone)
2. Admin resets TOTP via direct DB:
   ```sql
   UPDATE User SET totpEnabled=false, totpSecret=NULL, totpBackupCodes=NULL WHERE email='user@trustee.ae';
   DELETE FROM Session WHERE userId=(SELECT id FROM User WHERE email='user@trustee.ae');
   ```
3. User logs in with password only → re-enables TOTP via `/api/auth/totp/setup`

### 7. WAL Growth Unbounded
**Symptoms:** WAL file > 100 MB, health check reports `degraded`.
**Playbook:**
1. Check WAL scheduler: `grep WAL-SCHEDULER dev.log`
2. Run manual checkpoint: the scheduler runs every 15 min automatically
3. If still growing: check for long-running transactions
4. Temporary fix: `bun /home/z/my-project/scripts/wal-debug.ts`

### 8. Retention Job Failure
**Symptoms:** No `RETENTION_JOB_RUN` audit in > 48h.
**Playbook:**
1. Check scheduler: `grep RETENTION-SCHEDULER dev.log`
2. Run manually: `curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-CSRF-Token: $CSRF" http://localhost:3000/api/retention/run`
3. Check for errors in the response
4. Check `RetentionJobLog` table for per-category results
