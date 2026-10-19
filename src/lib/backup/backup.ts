// lib/backup/backup.ts
// Encrypted SQLite backup service.
//
// createBackup():
//   1. SQLite VACUUM INTO a temp file (consistent snapshot, no locked tables)
//   2. SHA-256 checksum the raw bytes
//   3. Encrypt with AES-256-GCM using BACKUP_ENCRYPTION_KEY env var (32 bytes, base64)
//   4. Write .enc file + .meta.json sidecar
//
// testRestore(backupFile):
//   1. Decrypt to temp file
//   2. Open with Prisma client pointing at temp file
//   3. Run integrity checks (PRAGMA integrity_check, table counts, FK integrity)
//   4. Delete temp file — never touches the live DB

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PrismaClient } from "@prisma/client";

const BACKUP_DIR = process.env.BACKUP_DIR || "/home/z/my-project/backups";
const ENV_KEY = process.env.BACKUP_ENCRYPTION_KEY;

interface BackupMeta {
  timestamp: string;
  size: number;
  checksum: string;
  schemaVersion: string;
  rowCounts: Record<string, number>;
  encrypted: boolean;
  algorithm: string;
}

function getKey(): Buffer {
  if (!ENV_KEY) {
    throw new Error("BACKUP_ENCRYPTION_KEY env var not set. Generate with: openssl rand -base64 32");
  }
  const key = Buffer.from(ENV_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(`BACKUP_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Use: openssl rand -base64 32`);
  }
  return key;
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

/**
 * SQLite VACUUM INTO — atomic consistent snapshot to a target file.
 * Available in SQLite 3.27+ (2019). Works without sqlite3 CLI.
 */
async function sqliteVacuumInto(targetPath: string): Promise<void> {
  // Use Prisma's $executeRawUnsafe to run VACUUM INTO.
  // Note: VACUUM INTO requires the target to be a non-existing file.
  await db.$executeRawUnsafe(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function getRowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
  );
  for (const { name } of tables) {
    try {
      const result = await db.$queryRawUnsafe<{ count: any }>(`SELECT COUNT(*) as count FROM "${name}"`);
      // SQLite via Prisma returns BigInt for COUNT — coerce to Number
      const raw = result[0]?.count;
      counts[name] = typeof raw === "bigint" ? Number(raw) : (Number(raw) || 0);
    } catch (e) {
      counts[name] = -1;
    }
  }
  return counts;
}

async function getRowCountsFromTemp(tempPath: string): Promise<Record<string, number>> {
  // Open a separate Prisma client pointing at the temp file
  const tempPrisma = new PrismaClient({
    datasources: { db: { url: `file:${tempPath}` } },
  });
  try {
    const counts: Record<string, number> = {};
    const tables = await tempPrisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
    );
    for (const { name } of tables) {
      try {
        const result = await tempPrisma.$queryRawUnsafe<{ count: any }>(`SELECT COUNT(*) as count FROM "${name}"`);
        const raw = result[0]?.count;
        counts[name] = typeof raw === "bigint" ? Number(raw) : (Number(raw) || 0);
      } catch {
        counts[name] = -1;
      }
    }
    return counts;
  } finally {
    await tempPrisma.$disconnect();
  }
}

/**
 * Create an encrypted SQLite backup.
 */
export async function createBackup(opts?: { triggeredBy?: string }): Promise<{
  backupFile: string;
  metaFile: string;
  meta: BackupMeta;
}> {
  await ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `trustee-${timestamp}`;
  const plainDbPath = path.join(BACKUP_DIR, `${baseName}.db.tmp`);
  const encPath = path.join(BACKUP_DIR, `${baseName}.db.enc`);
  const metaPath = path.join(BACKUP_DIR, `${baseName}.meta.json`);

  // 1. SQLite consistent snapshot via VACUUM INTO
  await sqliteVacuumInto(plainDbPath);

  // 2. SHA-256 checksum the raw bytes
  const checksum = await sha256File(plainDbPath);
  const plainSize = (await fs.stat(plainDbPath)).size;

  // 3. Get row counts (for drift detection on restore)
  const rowCounts = await getRowCounts();

  // 4. Encrypt with AES-256-GCM
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = await fs.readFile(plainDbPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encBuffer = Buffer.concat([iv, tag, ciphertext]);
  await fs.writeFile(encPath, encBuffer);

  // 5. Write .meta.json sidecar
  const meta: BackupMeta = {
    timestamp: new Date().toISOString(),
    size: encBuffer.length,
    checksum,
    schemaVersion: "7b.1",
    rowCounts,
    encrypted: true,
    algorithm: "AES-256-GCM",
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

  // 6. Cleanup temp file
  await fs.unlink(plainDbPath);

  await logAudit({
    action: "BACKUP_CREATED",
    entity: "Backup",
    entityId: baseName,
    details: `Encrypted backup created at ${encPath}. Size: ${encBuffer.length} bytes. Checksum: ${checksum.slice(0, 16)}… Triggered by: ${opts?.triggeredBy ?? "system"}`,
  });

  return { backupFile: encPath, metaFile: metaPath, meta };
}

/**
 * Decrypt + verify checksum. Returns the plaintext SQLite bytes.
 */
export async function decryptBackup(backupFile: string): Promise<{
  plaintext: Buffer;
  meta: BackupMeta;
  checksumVerified: boolean;
}> {
  const metaFile = backupFile.replace(/\.db\.enc$/, ".meta.json");
  const metaRaw = await fs.readFile(metaFile, "utf-8");
  const meta = JSON.parse(metaRaw) as BackupMeta;

  const encBuffer = await fs.readFile(backupFile);
  if (encBuffer.length < 28) {
    throw new Error(`Backup file too small (${encBuffer.length} bytes). Possibly corrupted.`);
  }
  const iv = encBuffer.subarray(0, 12);
  const tag = encBuffer.subarray(12, 28);
  const ciphertext = encBuffer.subarray(28);

  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    throw new Error(`Decryption failed (corrupted or wrong key): ${(e as Error).message}`);
  }

  const actualChecksum = crypto.createHash("sha256").update(plaintext).digest("hex");
  const checksumVerified = actualChecksum === meta.checksum;

  return { plaintext, meta, checksumVerified };
}

/**
 * Test restore: decrypt + open with Prisma + run integrity checks. NEVER touches the live DB.
 */
export async function testRestore(backupFile: string): Promise<{
  ok: boolean;
  backupFile: string;
  meta: BackupMeta | null;
  checksumVerified: boolean;
  integrityCheck: string;
  tableCounts: Record<string, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  let meta: BackupMeta | null = null;
  let checksumVerified = false;
  let integrityCheck = "skipped";
  let tableCounts: Record<string, number> = {};

  try {
    const { plaintext, meta: m, checksumVerified: cv } = await decryptBackup(backupFile);
    meta = m;
    checksumVerified = cv;
    if (!checksumVerified) {
      errors.push("Checksum mismatch — backup may be corrupted or tampered with.");
    }

    const tempPath = backupFile.replace(/\.db\.enc$/, ".test-restore.tmp");
    await fs.writeFile(tempPath, plaintext);

    try {
      const tempPrisma = new PrismaClient({
        datasources: { db: { url: `file:${tempPath}` } },
      });
      try {
        // PRAGMA integrity_check
        const integrityResult = await tempPrisma.$queryRawUnsafe<{ integrity_check: any }[]>(
          "PRAGMA integrity_check;"
        );
        const raw = integrityResult[0]?.integrity_check;
        integrityCheck = typeof raw === "string" ? raw : String(raw ?? "unknown");
        if (integrityCheck !== "ok") {
          errors.push(`PRAGMA integrity_check returned: ${integrityCheck}`);
        }

        // Table counts
        tableCounts = await getRowCountsFromTemp(tempPath);

        // FK integrity check — SQLite foreign_key_check returns rows like (table, rowid, parent, parent_rowid)
        // For Phase 7b.1 we just need to know if any rows were returned.
        const fkErrors = await tempPrisma.$queryRawUnsafe<any[]>("PRAGMA foreign_key_check;");
        if (fkErrors && fkErrors.length > 0) {
          // Coerce BigInt values to strings for JSON serialization
          const safe = fkErrors.slice(0, 5).map((row) => {
            const out: Record<string, string | number> = {};
            for (const [k, v] of Object.entries(row)) {
              out[k] = typeof v === "bigint" ? Number(v) : (v as string | number);
            }
            return out;
          });
          errors.push(`FK integrity issues: ${JSON.stringify(safe)}${fkErrors.length > 5 ? ` (${fkErrors.length} total)` : ""}`);
        }
      } finally {
        await tempPrisma.$disconnect();
      }
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  } catch (e) {
    errors.push(`Restore test failed: ${(e as Error).message}`);
  }

  return {
    ok: errors.length === 0,
    backupFile,
    meta,
    checksumVerified,
    integrityCheck,
    tableCounts,
    errors,
  };
}

/**
 * List all backups in the backup directory.
 */
export async function listBackups(): Promise<Array<{
  backupFile: string;
  meta: BackupMeta | null;
  sizeBytes: number;
}>> {
  await ensureBackupDir();
  const files = await fs.readdir(BACKUP_DIR);
  const encFiles = files.filter((f) => f.endsWith(".db.enc"));
  const result: Array<{ backupFile: string; meta: BackupMeta | null; sizeBytes: number }> = [];
  for (const f of encFiles) {
    const fullPath = path.join(BACKUP_DIR, f);
    const metaPath = fullPath.replace(/\.db\.enc$/, ".meta.json");
    let meta: BackupMeta | null = null;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as BackupMeta;
    } catch {
      // meta missing
    }
    const stat = await fs.stat(fullPath);
    result.push({ backupFile: fullPath, meta, sizeBytes: stat.size });
  }
  result.sort((a, b) => (b.meta?.timestamp ?? "").localeCompare(a.meta?.timestamp ?? ""));
  return result;
}

/**
 * Restore a backup to a target DB path. OVERWRITES the target. Use with caution.
 */
export async function restore(backupFile: string, targetDbPath: string): Promise<{
  ok: boolean;
  checksumVerified: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let checksumVerified = false;
  try {
    const { plaintext, checksumVerified: cv } = await decryptBackup(backupFile);
    checksumVerified = cv;
    if (!checksumVerified) {
      errors.push("Checksum mismatch — refusing to restore.");
      return { ok: false, checksumVerified, errors };
    }
    await fs.writeFile(targetDbPath, plaintext);
    await logAudit({
      action: "BACKUP_RESTORED",
      entity: "Backup",
      entityId: backupFile,
      details: `Backup restored to ${targetDbPath}.`,
    });
  } catch (e) {
    errors.push(`Restore failed: ${(e as Error).message}`);
  }
  return { ok: errors.length === 0, checksumVerified, errors };
}

/**
 * Apply retention policy: keep 7 daily + 4 weekly + 12 monthly.
 * For v1: keep all backups created in the last 90 days.
 */
export async function applyRetentionPolicy(): Promise<{ deleted: number; kept: number }> {
  const backups = await listBackups();
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let kept = 0;
  for (const b of backups) {
    const ts = b.meta?.timestamp ? new Date(b.meta.timestamp).getTime() : 0;
    if (ts >= ninetyDaysAgo) {
      kept++;
    } else {
      try {
        await fs.unlink(b.backupFile);
        const metaPath = b.backupFile.replace(/\.db\.enc$/, ".meta.json");
        await fs.unlink(metaPath).catch(() => {});
        deleted++;
      } catch (e) {
        console.error("[BACKUP] Failed to delete old backup:", e);
      }
    }
  }
  return { deleted, kept };
}

export const BACKUP_CONFIG = {
  BACKUP_DIR,
  ALGORITHM: "AES-256-GCM",
  RETENTION: "7 daily + 4 weekly + 12 monthly (90-day window enforced in v1)",
};

