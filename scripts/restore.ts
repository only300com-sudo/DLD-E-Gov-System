#!/usr/bin/env bun
// scripts/restore.ts
// CLI: bun run restore --file=/path/to/trustee-{timestamp}.db.enc
//   Decrypts + verifies the backup, then writes to the target DB path.
//   Default target: /home/z/my-project/db/custom.db (the live DB).
//   Use --target=/some/other/path.db to write elsewhere.
//   Use --verify-only to just run a test-restore (no write).

import { restore, testRestore, listBackups, BACKUP_CONFIG } from "@/lib/backup/backup";

async function main() {
  console.log("=== Trustee Operations Portal — Restore CLI ===");
  console.log("");

  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith("--file="));
  const targetArg = args.find(a => a.startsWith("--target="));
  const verifyOnly = args.includes("--verify-only");
  const listOnly = args.includes("--list");

  if (listOnly) {
    console.log("Listing all backups:");
    const backups = await listBackups();
    if (backups.length === 0) {
      console.log("  (no backups found)");
    }
    for (const b of backups) {
      console.log(`  - ${b.backupFile.split("/").pop()}`);
      console.log(`      timestamp: ${b.meta?.timestamp ?? "?"}`);
      console.log(`      size: ${b.sizeBytes} bytes`);
      console.log(`      checksum: ${b.meta?.checksum.slice(0, 24) ?? "?"}…`);
      console.log("");
    }
    process.exit(0);
  }

  if (!fileArg) {
    console.error("Error: --file= argument required");
    console.error("Usage: bun run restore --file=/path/to/backup.db.enc [--target=/path/to/out.db] [--verify-only] [--list]");
    process.exit(1);
  }
  const backupFile = fileArg.replace("--file=", "");

  if (verifyOnly) {
    console.log(`Verify-only mode: running test-restore on ${backupFile}`);
    console.log("(NEVER touches the live DB)");
    console.log("");
    const result = await testRestore(backupFile);
    if (result.ok) {
      console.log(`✅ Test restore passed`);
      console.log(`  Checksum verified: ${result.checksumVerified}`);
      console.log(`  Integrity check: ${result.integrityCheck}`);
      console.log(`  Table count: ${Object.keys(result.tableCounts).length}`);
      process.exit(0);
    } else {
      console.error(`❌ Test restore failed:`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  }

  const target = (targetArg?.replace("--target=", "")) || "/home/z/my-project/db/custom.db";
  console.log(`Restoring backup:`);
  console.log(`  Source: ${backupFile}`);
  console.log(`  Target: ${target}`);
  console.log("");

  // Confirm
  console.log("⚠️  This will OVERWRITE the target DB. Continue? (y/N)");
  const stdin = Bun.stdin.stream();
  const reader = stdin.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  const answer = (new TextDecoder().decode(value)).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    console.log("Restore aborted.");
    process.exit(0);
  }

  const result = await restore(backupFile, target);
  if (result.ok) {
    console.log(`✅ Restore succeeded`);
    console.log(`  Checksum verified: ${result.checksumVerified}`);
    console.log(`  Target: ${target}`);
    process.exit(0);
  } else {
    console.error(`❌ Restore failed:`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}

main();
