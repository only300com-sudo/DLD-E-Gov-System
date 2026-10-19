# Rollback Plan

## RTO/RPO Targets
- **RTO (Recovery Time Objective):** 30 minutes
- **RPO (Recovery Point Objective):** 24 hours (daily backup)

## Rollback Procedures

### 1. Database Restore from Backup
```bash
# Stop the dev server
pkill -f "next dev\|next-server"
sleep 3

# List available backups
bun run restore --list

# Restore from a specific backup (writes to temp DB first, then swaps)
bun run restore --file=/home/z/my-project/backups/trustee-{timestamp}.db.enc --target=/home/z/my-project/db/custom.db

# Or verify-only (never touches live DB)
bun run restore --file=... --verify-only

# Restart
cd /home/z/my-project && bun run dev
```

### 2. Schema Migration Rollback
```bash
# Restore from the pre-migration restore point
cp /home/z/my-project/restore-points/phase-{X}-verified/custom.db.bak /home/z/my-project/db/custom.db
cp /home/z/my-project/restore-points/phase-{X}-verified/schema.prisma.bak /home/z/my-project/prisma/schema.prisma
rsync -a --delete --exclude='node_modules' --exclude='.next' \
  /home/z/my-project/restore-points/phase-{X}-verified/src-snapshot/ /home/z/my-project/src/
cd /home/z/my-project && bun run db:push && bun run dev
```

### 3. Workflow Version Rollback
- Navigate to Configuration → Workflow Builder
- Open the workflow
- Click "Versions" to see history
- Select v(N-1) and v(N), click "Diff"
- To revert: PATCH the workflow with the v(N-1) definition — creates a new v(N+1) snapshot

### 4. Code Rollback (Git)
```bash
cd /home/z/my-project
git log --oneline -10
git revert HEAD
# Or hard reset to a known-good commit
git reset --hard <commit-hash>
```

## Restore Point Locations
- Phase 3.1: `/home/z/my-project/restore-points/phase-3.1-verified/`
- Phase 4: `/home/z/my-project/restore-points/phase-4-verified/`
- Phase 7a: `/home/z/my-project/restore-points/phase-7a-verified/`
- Phase 7b.1: `/home/z/my-project/restore-points/phase-7b.1-verified/`
