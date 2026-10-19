#!/usr/bin/env bun
// scripts/backup.ts
// CLI: bun run backup
//   Creates an encrypted SQLite backup immediately.
//   Equivalent to POST /api/admin/backup with action=default.

import { createBackup, applyRetentionPolicy, BACKUP_CONFIG } from "@/lib/backup/backup";

async function main() {
  console.log("=== Trustee Operations Portal — Backup CLI ===");
  console.log(`Backup dir: ${BACKUP_CONFIG.BACKUP_DIR}`);
  console.log(`Algorithm: ${BACKUP_CONFIG.ALGORITHM}`);
  console.log("");

  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    console.error("Error: BACKUP_ENCRYPTION_KEY env var not set.");
    console.error("Generate one with: openssl rand -base64 32");
    process.exit(1);
  }

  try {
    const result = await createBackup({ triggeredBy: "CLI" });
    console.log(`✅ Backup created`);
    console.log(`  File: ${result.backupFile}`);
    console.log(`  Meta: ${result.metaFile}`);
    console.log(`  Size: ${result.meta.size} bytes`);
    console.log(`  Checksum: ${result.meta.checksum.slice(0, 24)}…`);
    console.log(`  Tables: ${Object.keys(result.meta.rowCounts).length}`);
    console.log("");

    // Apply retention
    const retention = await applyRetentionPolicy();
    console.log(`Retention: kept=${retention.kept}, deleted=${retention.deleted}`);
    process.exit(0);
  } catch (e: any) {
    console.error(`❌ Backup failed: ${e.message}`);
    process.exit(1);
  }
}

main();
