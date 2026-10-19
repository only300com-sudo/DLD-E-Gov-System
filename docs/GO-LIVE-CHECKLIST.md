# Go-Live Checklist

## Pre-Flight Steps (in order)

### 1. Legal Review (manual — requires UAE-qualified legal adviser)
- [ ] Privacy policy reviewed and approved
- [ ] Retention rules reviewed and approved
- [ ] Consent wording reviewed and approved
- [ ] DSR response templates reviewed and approved

### 2. Security Verification
- [ ] Argon2id password hashing active: `grep Argon2id dev.log`
- [ ] TOTP MFA enforced for all Manager users
- [ ] Last backup < 24h: check `/api/admin/backup`
- [ ] Last backup restore test < 30 days
- [ ] Security headers active: `curl -I http://localhost:3000/`
- [ ] Rate limiting active: attempt 6 rapid logins → expect 429 on 6th

### 3. Operational Verification
- [ ] All service workflows published + active (check `/api/workflows`)
- [ ] DPO contact configured (check `/api/dpo`)
- [ ] Incident runbook reviewed (see `INCIDENT-RUNBOOK.md`)
- [ ] Rollback plan tested (see `ROLLBACK-PLAN.md`)

### 4. Production Cleanup
- [ ] Seed/demo data cleared from production DB
- [ ] Admin default password changed
- [ ] Notification provider configured OR marked as simulated

### 5. Go-Live
- [ ] All auto-verified items pass (check `/api/preflight`)
- [ ] All manual items checked
- [ ] Go-Live button enabled on Configuration → Go-Live Readiness

## Verification Commands

```bash
# Security headers
curl -I http://localhost:3000/

# Health check
curl http://localhost:3000/api/health

# Pre-flight checklist
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/preflight

# Backup list
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/backup

# Argon2id active
grep Argon2id /home/z/my-project/dev.log
```
