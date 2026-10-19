// lib/health/healthCheck.ts
// Phase 7b.2 — Health check service for /api/health endpoint.
// Runs all sub-checks and aggregates status.

import { db } from "@/lib/db";
import { listBackups } from "@/lib/backup/backup";
import fs from "fs/promises";
import path from "path";

export interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  checks: Record<string, HealthCheck>;
}

const THRESHOLDS = {
  lastBackupMaxAgeHours: 36,
  lastRetentionRunMaxAgeHours: 48,
  diskFreeMinBytes: 5 * 1024 * 1024 * 1024, // 5 GB
  walSizeMaxBytes: 100 * 1024 * 1024, // 100 MB
};

export async function runHealthCheck(): Promise<HealthReport> {
  const checks: Record<string, HealthCheck> = {};

  // 1. Database
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    checks.database = { name: "database", status: "ok", latencyMs };
  } catch (e: any) {
    checks.database = { name: "database", status: "down", details: { error: e.message } };
  }

  // 2. WAL
  try {
    const walPath = "/home/z/my-project/db/custom.db-wal";
    let sizeBytes = 0;
    try {
      const stat = await fs.stat(walPath);
      sizeBytes = stat.size;
    } catch {
      // WAL doesn't exist — clean state
      sizeBytes = 0;
    }
    const status = sizeBytes > THRESHOLDS.walSizeMaxBytes ? "degraded" : "ok";
    checks.wal = { name: "wal", status, details: { sizeBytes, maxBytes: THRESHOLDS.walSizeMaxBytes } };
  } catch (e: any) {
    checks.wal = { name: "wal", status: "degraded", details: { error: e.message } };
  }

  // 3. Disk space
  try {
    const stat: any = await fs.statfs("/");
    const freeBytes = stat.bavail * stat.bsize;
    const status = freeBytes < THRESHOLDS.diskFreeMinBytes ? "degraded" : "ok";
    checks.diskSpace = { name: "diskSpace", status, details: { freeBytes, minBytes: THRESHOLDS.diskFreeMinBytes } };
  } catch (e: any) {
    // statfs may not work on all platforms — degrade gracefully
    checks.diskSpace = { name: "diskSpace", status: "degraded", details: { error: e.message } };
  }

  // 4. Last backup
  try {
    const backups = await listBackups();
    if (backups.length === 0) {
      checks.lastBackup = { name: "lastBackup", status: "degraded", details: { ageHours: null, message: "No backups found" } };
    } else {
      const lastBackup = backups[0];
      const lastBackupTs = lastBackup.meta?.timestamp ? new Date(lastBackup.meta.timestamp).getTime() : 0;
      const ageHours = lastBackupTs ? (Date.now() - lastBackupTs) / (60 * 60 * 1000) : Infinity;
      const status = ageHours > THRESHOLDS.lastBackupMaxAgeHours ? "degraded" : "ok";
      checks.lastBackup = { name: "lastBackup", status, details: { ageHours, maxAgeHours: THRESHOLDS.lastBackupMaxAgeHours, file: path.basename(lastBackup.backupFile) } };
    }
  } catch (e: any) {
    checks.lastBackup = { name: "lastBackup", status: "degraded", details: { error: e.message } };
  }

  // 5. Last retention run
  try {
    const lastRun = await db.retentionJobLog.findFirst({
      orderBy: { runStartedAt: "desc" },
      select: { runStartedAt: true, triggeredBy: true },
    });
    if (!lastRun) {
      checks.lastRetentionRun = { name: "lastRetentionRun", status: "degraded", details: { ageHours: null, message: "No retention runs yet" } };
    } else {
      const ageHours = (Date.now() - lastRun.runStartedAt.getTime()) / (60 * 60 * 1000);
      const status = ageHours > THRESHOLDS.lastRetentionRunMaxAgeHours ? "degraded" : "ok";
      checks.lastRetentionRun = { name: "lastRetentionRun", status, details: { ageHours, maxAgeHours: THRESHOLDS.lastRetentionRunMaxAgeHours, triggeredBy: lastRun.triggeredBy } };
    }
  } catch (e: any) {
    checks.lastRetentionRun = { name: "lastRetentionRun", status: "degraded", details: { error: e.message } };
  }

  // 6. SSE connections (in-memory — approximated by active sessions in last 5 min)
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeSessions = await db.session.count({
      where: { lastActivityAt: { gt: fiveMinAgo } },
    });
    checks.sseConnections = { name: "sseConnections", status: "ok", details: { active: activeSessions } };
  } catch (e: any) {
    checks.sseConnections = { name: "sseConnections", status: "degraded", details: { error: e.message } };
  }

  // 7. Pending DLD actions — cases awaiting DLD outcome
  try {
    const pendingDld = await db.case.count({
      where: { status: { in: ["SUBMITTED_TO_DLD_MANUALLY", "DLD_PROCESSING_IN_PROGRESS"] } },
    });
    checks.pendingDldActions = { name: "pendingDldActions", status: "ok", details: { count: pendingDld } };
  } catch (e: any) {
    checks.pendingDldActions = { name: "pendingDldActions", status: "degraded", details: { error: e.message } };
  }

  // Aggregate status — worst of all sub-checks
  const statuses = Object.values(checks).map((c) => c.status);
  const overall: "ok" | "degraded" | "down" = statuses.includes("down") ? "down" : statuses.includes("degraded") ? "degraded" : "ok";

  // If degraded or down, log a HEALTH_CHECK_DEGRADED audit entry (rate-limited to 1/hour)
  if (overall !== "ok") {
    try {
      const { logAudit } = await import("@/lib/audit");
      // Check if we already logged in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existing = await db.auditLog.findFirst({
        where: { action: "HEALTH_CHECK_DEGRADED", createdAt: { gt: oneHourAgo } },
        select: { id: true },
      });
      if (!existing) {
        await logAudit({
          action: "HEALTH_CHECK_DEGRADED",
          entity: "Health",
          entityId: "system",
          details: `Health check overall status: ${overall}. Failed checks: ${statuses.filter((s) => s !== "ok").length}.`,
        });
      }
    } catch (e) {
      // Swallow — don't let audit failure break health check
    }
  }

  return {
    status: overall,
    timestamp: new Date().toISOString(),
    checks,
  };
}
