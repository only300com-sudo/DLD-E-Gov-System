# Daily Operations

## Morning Checks (daily, 15 min)

### 1. Health Check
```bash
curl http://localhost:3000/api/health | python3 -m json.tool
```
- Verify `status: "ok"`
- If `degraded`: investigate the failed sub-checks

### 2. Overnight Backup
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/backup | python3 -m json.tool
```
- Verify the most recent backup is < 24h old
- Check the file size is reasonable (~700 KB)

### 3. Retention Job
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/retention/run -X POST -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" -d '{}' | python3 -m json.tool
```
- Verify no errors in the response
- Check `rowsSkippedLegalHold` count (should be > 0 for audit logs)

### 4. System Logs
- Navigate to Configuration → System Logs (if implemented)
- Filter by `level=error`
- Investigate any new errors

## Weekly Tasks (Monday, 30 min)

### 1. Review Open DSRs
- Navigate to Configuration → Data Subject Requests
- Check for DSRs approaching the 30-day SLA deadline
- Escalate any DSRs past the 25-day mark

### 2. Review Fee Aging
- Navigate to Finance
- Check the aging report for fees in the 31-60 and 61-90 buckets
- Follow up on long-outstanding fees

### 3. Review Manager Analytics
- Navigate to Analytics
- Check the SLA compliance % and re-delegation rate
- Review officer performance table for anomalies

## Monthly Tasks (1st of month, 1 hour)

### 1. Restore Drill
```bash
bun run restore --file=$(ls -t /home/z/my-project/backups/*.db.enc | head -1) --verify-only
```
- Verify the restore test passes
- Document the result in the worklog

### 2. Review Retention Rules
- Navigate to Configuration → Retention Rules
- Verify all 6 categories have rules
- Confirm retention periods still align with legal requirements (if updated by legal adviser)

### 3. Review KPIs
- Navigate to Analytics
- Export CSV/JSON
- Compare to previous month
- Report to management

### 4. Review Audit Log
- Navigate to Audit Log
- Filter for security events: `RATE_LIMIT_EXCEEDED`, `CSRF_INVALID`, `LOGIN_FAILED`, `FIELD_CONFLICT_DETECTED`
- Investigate any anomalies

### 5. Log Cleanup
```bash
# Clean up old log files (app logs > 30 days, error logs > 90 days)
bun /home/z/my-project/scripts/cleanup-logs.ts
```

## Quarterly Tasks (Q1/Q2/Q3/Q4, 2 hours)

### 1. Rotate Backup Encryption Key
- Follow procedure in `download/phase-specs/BACKUP-KEY-ROTATION.md`

### 2. Full System Audit
- Review all user accounts → deactivate stale ones
- Review all sessions → clear old ones
- Review all audit log entries for the quarter
- Generate compliance report
