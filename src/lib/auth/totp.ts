// lib/auth/totp.ts
// TOTP MFA service using otplib. Generates a per-user secret, returns a QR code URI,
// verifies 6-digit codes, and manages 10 single-use backup codes.

import { authenticator } from "otplib";
import crypto from "crypto";

const ISSUER = "Trustee Operations Portal";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8; // chars (alphanumeric, no ambiguous chars)

// Generate a new base32 secret for a user. Returns the raw secret + the otpauth:// URI
// for QR code generation (client-side via qrcode library).
export function generateTotpSecret(userEmail: string): { secret: string; otpauthUri: string } {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(userEmail, ISSUER, secret);
  return { secret, otpauthUri };
}

// Verify a 6-digit TOTP code against a stored secret.
export function verifyTotpCode(token: string, secret: string): boolean {
  try {
    // Allow ±1 window (30s drift tolerance)
    authenticator.options = { window: 1 };
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

// Generate 10 single-use backup codes. Returns array of plain codes + array of
// { hash, used } for storage. The plain codes are returned once for display.
export function generateBackupCodes(): { plain: string[]; storage: Array<{ hash: string; used: boolean }> } {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  const plain: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let code = "";
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    plain.push(code);
  }
  const storage = plain.map((code) => ({
    hash: hashBackupCode(code),
    used: false,
  }));
  return { plain, storage };
}

// Hash a backup code with sha256 + per-app salt. The hash is what's stored.
const BACKUP_SALT = "trustee-portal-backup-salt-v1";
export function hashBackupCode(plain: string): string {
  return crypto.createHash("sha256").update(BACKUP_SALT + plain.toUpperCase().trim()).digest("hex");
}

// Verify a backup code against the stored JSON array. If matched, mark as used.
// Returns true if matched + consumed; false if not found or already used.
export function consumeBackupCode(storedJson: string, plain: string): { consumed: boolean; updatedJson: string | null } {
  try {
    const arr = JSON.parse(storedJson) as Array<{ hash: string; used: boolean }>;
    const candidateHash = hashBackupCode(plain);
    for (const entry of arr) {
      if (!entry.used && entry.hash === candidateHash) {
        entry.used = true;
        return { consumed: true, updatedJson: JSON.stringify(arr) };
      }
    }
    return { consumed: false, updatedJson: null };
  } catch {
    return { consumed: false, updatedJson: null };
  }
}

// Count remaining backup codes (for display)
export function countRemainingBackupCodes(storedJson: string | null): number {
  if (!storedJson) return 0;
  try {
    const arr = JSON.parse(storedJson) as Array<{ hash: string; used: boolean }>;
    return arr.filter((e) => !e.used).length;
  } catch {
    return 0;
  }
}
