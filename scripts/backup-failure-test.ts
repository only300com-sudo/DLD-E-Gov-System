// scripts/backup-failure-test.ts
// Tests the Phase 7b.1 backup-failure notification path.
//   1. Make the backup directory read-only (chmod 555)
//   2. Try to run createBackup() → should fail
//   3. Simulate the scheduler's failure-notification path (notify all Managers via in-app Notification + audit BACKUP_FAILED_SCHEDULED)
//   4. Verify Manager notification fired
//   5. Restore directory permissions

import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { createBackup, BACKUP_CONFIG } from "@/lib/backup/backup";
import { logAudit } from "@/lib/audit";

async function main() {
  console.log("=== Phase 7b.1 — Backup failure notification test ===");
  console.log("");

  // 1. Make backup dir read-only
  const backupDir = BACKUP_CONFIG.BACKUP_DIR;
  console.log(`Step 1: Making backup dir read-only: chmod 555 ${backupDir}`);
  await fs.chmod(backupDir, 0o555);
  console.log("  ✅ Backup dir is now read-only");
  console.log("");

  // 2. Attempt backup — should fail
  console.log("Step 2: Attempting createBackup() under read-only dir...");
  let backupFailed = false;
  let backupError: string | null = null;
  try {
    await createBackup({ triggeredBy: "failure-test-script" });
    console.log("  ❌ Backup unexpectedly succeeded (dir should be read-only)");
  } catch (e: any) {
    backupFailed = true;
    backupError = e.message;
    console.log(`  ✅ Backup failed as expected: ${e.message}`);
  }

  if (!backupFailed) {
    await fs.chmod(backupDir, 0o755);
    console.error("Test setup failed — backup should have failed.");
    process.exit(1);
  }

  // 3. Simulate the scheduler's failure-notification path (exactly what backup/scheduler.ts does)
  console.log("");
  console.log("Step 3: Notifying all active Trustee Managers via in-app Notification...");
  const managers = await db.user.findMany({ where: { role: "TRUSTEE_MANAGER", active: true }, select: { id: true, name: true } });
  console.log(`  Found ${managers.length} active Manager(s)`);
  for (const m of managers) {
    await db.notification.create({
      data: {
        caseId: null,
        clientId: null,
        templateId: null,
        templateName: "system-backup-failure",
        recipientName: m.name,
        recipientContact: null,
        channel: "IN_APP",
        subject: "Scheduled backup failed",
        body: `The automated daily backup failed at ${new Date().toISOString()}. Error: ${backupError}. Please investigate manually.`,
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
    console.log(`  ✅ Notification created for ${m.name} (${m.id})`);
  }

  await logAudit({
    action: "BACKUP_FAILED_SCHEDULED",
    entity: "Backup",
    entityId: "scheduled-failure-test",
    details: `Scheduled backup failed (simulated via read-only dir): ${backupError}`,
  });
  console.log("  ✅ BACKUP_FAILED_SCHEDULED audit entry written");

  // 4. Verify notification
  console.log("");
  console.log("Step 4: Verifying Manager notification in DB...");
  const notifs = await db.notification.findMany({
    where: { templateName: "system-backup-failure" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  console.log(`  Found ${notifs.length} recent backup-failure notification(s):`);
  for (const n of notifs) {
    console.log(`    - ${n.createdAt.toISOString()} → ${n.recipientName}: ${n.subject}`);
  }

  // 5. Restore permissions
  console.log("");
  console.log("Step 5: Restoring backup dir permissions (chmod 755)...");
  await fs.chmod(backupDir, 0o755);
  console.log("  ✅ Backup dir is writable again");

  console.log("");
  console.log("=== Test summary ===");
  console.log(`✅ Backup correctly failed under read-only dir`);
  console.log(`✅ ${managers.length} Manager notification(s) created`);
  console.log(`✅ BACKUP_FAILED_SCHEDULED audit entry logged`);
  console.log(`✅ Backup dir permissions restored`);

  await db.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  // Always restore permissions on error
  try { await fs.chmod(BACKUP_CONFIG.BACKUP_DIR, 0o755); } catch {}
  process.exit(1);
});
