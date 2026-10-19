# Metabase Deployment Guide

## Overview

Metabase provides self-service BI dashboards that query a **read-only reporting replica** of the Trustee Center SQLite database. The replica is refreshed nightly at 01:00 UTC via `VACUUM INTO`.

## Docker Compose

```yaml
# docker-compose.metabase.yml
version: "3.8"
services:
  metabase:
    image: metabase/metabase:latest
    ports:
      - "3001:3000"
    environment:
      - MB_DB_TYPE=sqlite
      - MB_DB_FILE=/metabase-data/metabase.db
      - MB_SITE_URL=https://trustee.ae/metabase
    volumes:
      - ./metabase-data:/metabase-data
      - /TrusteeCenterData/reporting:/reporting:ro
    restart: unless-stopped
```

## Setup Steps

1. **Start Metabase**: `docker-compose -f docker-compose.metabase.yml up -d`
2. **Initial admin setup**: Navigate to `http://localhost:3001` and create admin account
3. **Add database connection**:
   - Database type: SQLite
   - Database file path: `/reporting/replica-latest.db` (symlink to newest replica)
   - Name: `Trustee Center Replica`

4. **Create a symlink to the latest replica**:
   ```bash
   ln -sf $(ls -t /TrusteeCenterData/reporting/replica-*.db | head -1) /TrusteeCenterData/reporting/replica-latest.db
   ```

5. **Set up embedding**:
   - Admin → Settings → Embedding → Enable embedding
   - Copy the embedding secret
   - Store in `BI_CONNECTION.embedSecret` via the Configuration → BI Integration UI

6. **Create dashboards** using the SQL from `KpiDefinition.metabaseSql` — see the 4 curated dashboards:
   - Executive Management Pack
   - Financial Deep-Dive
   - Operational Analytics
   - Audit & Compliance

## Environment Variables

```env
# Metabase connection (stored in BiConnection table, not env)
# The following env vars are for the Docker container:
MB_SITE_URL=https://trustee.ae/metabase
MB_DB_TYPE=sqlite
MB_DB_FILE=/metabase-data/metabase.db
```

## Backup Procedure

Metabase's own DB stores dashboard definitions, users, and settings:

```bash
# Backup Metabase DB
docker-compose -f docker-compose.metabase.yml exec metabase \
  sqlite3 /metabase-data/metabase.db ".backup '/metabase-data/metabase-backup-$(date +%Y%m%d).db'"

# Restore
docker-compose -f docker-compose.metabase.yml exec metabase \
  cp /metabase-data/metabase-backup-YYYYMMDD.db /metabase-data/metabase.db
```

## Row-Level Security

- **Reception/Admin**: Sees own-branch data only (filter: `branch_id = user.branchId`)
- **Trustee Officer**: Sees own cases only (filter: `trusteeOfficerId = user.id`)
- **Manager/Admin**: Sees all data (no filter)

JWT embedding passes the `branch_id` parameter in the signed payload. Metabase applies this as a locked parameter on the dashboard's SQL queries.

## Replica Refresh Schedule

- **Nightly at 01:00 UTC** — `VACUUM INTO` creates a new replica
- **Retention**: Last 7 replicas kept; older ones auto-deleted
- **Size**: ~50-200 MB depending on data volume
- **Audit**: Every replica creation writes `REPORTING_REPLICA_CREATED` audit entry

## Non-Goals

- No production Metabase deployment unless Trustee Center has Docker infrastructure
- No real embedding in production without a proper reverse proxy + HTTPS
- Dashboard IDs are stored in `BiConnection.dashboardIds` (JSON) and must be set after initial Metabase setup
