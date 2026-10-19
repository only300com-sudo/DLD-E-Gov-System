// lib/auth/password.ts
// Argon2id password hashing with legacy migration.
//
// Legacy hashes start with "h" (the demo hash function from Phase 1).
// Argon2id hashes start with "$argon2id$".
// On login: if the stored hash is legacy, verify with legacy algorithm,
// then re-hash with Argon2id + persist (transparent migration).

import argon2 from "argon2";

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

const LEGACY_PREFIX = "h";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (!storedHash) return false;
  // Argon2id path
  if (storedHash.startsWith("$argon2")) {
    try {
      return await argon2.verify(storedHash, plain, ARGON2_OPTS);
    } catch {
      return false;
    }
  }
  // Legacy hash path (Phase 1 demo hash) — same algorithm as the old hashPassword()
  if (storedHash.startsWith(LEGACY_PREFIX)) {
    let h = 0;
    for (let i = 0; i < plain.length; i++) {
      h = (h << 5) - h + plain.charCodeAt(i);
      h |= 0;
    }
    return storedHash === `${LEGACY_PREFIX}${h}`;
  }
  return false;
}

export function isLegacyHash(storedHash: string): boolean {
  return !!storedHash && storedHash.startsWith(LEGACY_PREFIX);
}

/**
 * Returns true if the stored hash needs migration to Argon2id.
 */
export function needsArgon2Migration(storedHash: string): boolean {
  return isLegacyHash(storedHash);
}

// Synchronous legacy hash — kept only for tests / seed compatibility.
export function hashPasswordLegacy(plain: string): string {
  let h = 0;
  for (let i = 0; i < plain.length; i++) {
    h = (h << 5) - h + plain.charCodeAt(i);
    h |= 0;
  }
  return `${LEGACY_PREFIX}${h}`;
}
