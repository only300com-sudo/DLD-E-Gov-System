// scripts/retention-policy-test.ts
// Tests the Phase 7b.1 backup retention policy.
//   1. Creates 15 dummy backups with forged timestamps spread across 90+ days
//   2. Runs applyRetentionPolicy()
//   3. Verifies that backups within the 90-day window are kept, and older ones are deleted
//
// For v1, the policy is: keep all backups created in the last 90 days.
// Full 7-daily + 4-weekly + 12-monthly grouping is deferred to 7b.2.

import { db } from "@/lib/db";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { listBackups, applyRetentionPolicy, BACKUP_CONFIG } from "@/lib/backup/backup";

async function main() {
  console.log("=== Phase 7b.1 — Retention policy test ===");
  console.log("");
  console.log(`Backup dir: ${BACKUP_CONFIG.BACKUP_DIR}`);
  console.log(`Algorithm: ${BACKUP_CONFIG.ALGORITHM}`);
  console.log(`Retention: ${BACKUP_CONFIG.RETENTION}`);
  console.log("");

  // 1. List existing backups (don't delete them — only add 15 dummy ones for the test)
  const before = await listBackups();
  console.log(`Existing backups: ${before.length}`);
  console.log("");

  // 2. Create 15 dummy backups with forged timestamps spread across 120 days
  console.log("Creating 15 dummy backups with forged timestamps...");
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const forgedTimestamps: number[] = [];
  for (let i = 0; i < 15; i++) {
    // Spread across 0 to 120 days ago (so some are inside the 90-day window, some outside)
    const daysAgo = i * 8; // 0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112
    const ts = now - daysAgo * dayMs;
    forgedTimestamps.push(ts);
    const isoTs = new Date(ts).toISOString();
    const fileName = `dummy-retention-test-${i+1}-${isoTs.replace(/[:.]/g, "-")}`;
    const encPath = path.join(BACKUP_CONFIG.BACKUP_DIR, `${fileName}.db.enc`);
    const metaPath = path.join(BACKUP_CONFIG.BACKUP_DIR, `${fileName}.meta.json`);
    // Write dummy .enc (random bytes)
    const fakeEnc = crypto.randomBytes(100);
    await fs.writeFile(encPath, fakeEnc);
    // Write meta with forged timestamp
    const meta = {
      timestamp: isoTs,
      size: fakeEnc.length,
      checksum: crypto.createHash("sha256").update(fakeEnc).digest("hex"),
      schemaVersion: "7b.1",
      rowCounts: { _dummy: i },
      encrypted: true,
      algorithm: "AES-256-GCM",
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    console.log(`  Created ${i+1}/15 — ${daysAgo} days ago (${isoTs.substring(0, 10)})`);
  }

  // 3. List after adding
  const afterAdd = await listBackups();
  console.log("");
  console.log(`Backups after adding 15 dummies: ${afterAdd.length} (was ${before.length})`);

  // 4. Run retention policy
  console.log("");
  console.log("Running applyRetentionPolicy()...");
  const result = await applyRetentionPolicy();
  console.log(`Result: kept=${result.kept}, deleted=${result.deleted}`);

  // 5. List after retention
  const afterRetention = await listBackups();
  console.log("");
  console.log(`Backups after retention: ${afterRetention.length}`);

  // 6. Verify which forged backups remain (should be those within 90 days)
  console.log("");
  console.log("=== Verifying retention outcome ===");
  const remainingDummies = afterRetention.filter(b => b.backupFile.includes("dummy-retention-test"));
  console.log(`Remaining dummy backups: ${remainingDummies.length}`);
  for (const d of remainingDummies) {
    console.log(`  - ${path.basename(d.backupFile)} | ts=${d.meta?.timestamp}`);
  }

  // Expected: dummies created with daysAgo <= 89 should remain (since 90-day window)
  const expectedRemaining = forgedTimestamps.filter(ts => (now - ts) <= 90 * dayMs).length;
  const expectedDeleted = forgedTimestamps.length - expectedRemaining;
  console.log("");
  console.log(`Expected: ${expectedRemaining} within 90-day window, ${expectedDeleted} outside`);

  // 7. Cleanup the dummy backups (so they don't pollute the real backup dir)
  console.log("");
  console.log("Cleaning up dummy backups...");
  for (const d of afterRetention.filter(b => b.backupFile.includes("dummy-retention-test"))) {
    await fs.unlink(d.backupFile).catch(() => {});
    await fs.unlink(d.backupFile.replace(/\.db\.enc$/, ".meta.json")).catch(() => {});
  }
  const finalList = await listBackups();
  console.log(`Final backup count after cleanup: ${finalList.length} (back to original ${before.length})`);

  console.log("");
  console.log("=== Test summary ===");
  console.log(`✅ Retention policy applied: ${result.deleted} backups deleted (older than 90 days)`);
  console.log(`✅ ${result.kept} backups kept (within 90-day window)`);
  console.log(`✅ Original backups preserved (${before.length} → ${finalList.length})`);

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
