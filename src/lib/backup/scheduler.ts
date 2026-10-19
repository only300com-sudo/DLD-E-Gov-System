// lib/backup/scheduler.ts
// In-process cron-style scheduler. Daily backup at 02:00 UTC.
// Retention: 7 daily + 4 weekly + 12 monthly (90-day window enforced in v1).
// On backup failure: notifies Manager via in-app notification.

import { createBackup, applyRetentionPolicy, listBackups } from "./backup";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const BACKUP_HOUR_UTC = 2; // 02:00 UTC daily
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // check every 15 min if it's time for the daily backup

let schedulerStarted = false;
let lastBackupAt: Date | null = null;

export function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.info("[BACKUP-SCHEDULER] Started. Daily backup at 02:00 UTC.");
  const interval = setInterval(async () => {
    try {
      await maybeRunDailyBackup();
    } catch (e) {
      console.error("[BACKUP-SCHEDULER] Error during scheduled backup check:", e);
    }
  }, CHECK_INTERVAL_MS);
  // Don't keep the process alive solely for the scheduler
  if (interval.unref) interval.unref();
}

async function maybeRunDailyBackup() {
  const now = new Date();
  // Check if it's 02:00 UTC (within 15 min window)
  if (now.getUTCHours() !== BACKUP_HOUR_UTC) return;
  // If we already ran today, skip
  if (lastBackupAt && lastBackupAt.getUTCFullYear() === now.getUTCFullYear() &&
      lastBackupAt.getUTCMonth() === now.getUTCMonth() &&
      lastBackupAt.getUTCDate() === now.getUTCDate()) {
    return;
  }
  console.info(`[BACKUP-SCHEDULER] Running scheduled daily backup at ${now.toISOString()}.`);
  try {
    const result = await createBackup({ triggeredBy: "scheduler" });
    lastBackupAt = new Date();
    console.info(`[BACKUP-SCHEDULER] Backup completed: ${result.backupFile}`);
    // Apply retention policy
    const retention = await applyRetentionPolicy();
    console.info(`[BACKUP-SCHEDULER] Retention applied: ${retention.kept} kept, ${retention.deleted} deleted.`);
  } catch (e) {
    console.error("[BACKUP-SCHEDULER] Scheduled backup failed:", e);
    // Notify Manager via in-app notification
    try {
      const managers = await db.user.findMany({ where: { role: "TRUSTEE_MANAGER", active: true }, select: { id: true } });
      for (const m of managers) {
        await db.notification.create({
          data: {
            caseId: null,
            clientId: null,
            templateId: null,
            templateName: "system-backup-failure",
            recipientName: m.id,
            recipientContact: null,
            channel: "IN_APP",
            subject: "Scheduled backup failed",
            body: `The automated daily backup failed at ${now.toISOString()}. Error: ${(e as Error).message}. Please investigate manually.`,
            attachments: null,
            sentById: null,
            status: "DRAFT",
            queuedAt: new Date(),
            sentAt: null,
            deliveredAt: null,
            readAt: null,
            followUpDueAt: null,
          },
        });
      }
      await logAudit({
        action: "BACKUP_FAILED_SCHEDULED",
        entity: "Backup",
        entityId: "scheduled",
        details: `Scheduled daily backup failed: ${(e as Error).message}`,
      });
    } catch (notifyErr) {
      console.error("[BACKUP-SCHEDULER] Failed to notify managers:", notifyErr);
    }
  }
}

export function getSchedulerStatus() {
  return {
    started: schedulerStarted,
    lastBackupAt: lastBackupAt?.toISOString() ?? null,
    backupCount: 0, // populated by listBackups() if needed
  };
}
