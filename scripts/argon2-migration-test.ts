import { db } from "@/lib/db";
import { hashPassword, hashPasswordLegacy, verifyPassword, isLegacyHash } from "@/lib/auth/password";

async function main() {
  // Find the Officer user
  const officer = await db.user.findUnique({ where: { email: "officer@trustee.ae" } });
  if (!officer) {
    console.error("Officer user not found");
    process.exit(1);
  }
  console.log("=== BEFORE migration test ===");
  console.log("Officer password hash prefix:", officer.passwordHash.substring(0, 30));
  console.log("Is legacy hash?", isLegacyHash(officer.passwordHash));

  // Revert to legacy hash
  const legacyHash = hashPasswordLegacy("trustee123");
  console.log("Legacy hash would be:", legacyHash);

  // Verify the legacy hash works with verifyPassword
  const legacyVerifies = await verifyPassword(legacyHash, "trustee123");
  console.log("Legacy hash verifies with verifyPassword:", legacyVerifies);

  // Persist the legacy hash for Officer
  await db.user.update({
    where: { id: officer.id },
    data: { passwordHash: legacyHash },
  });
  console.log("✅ Reverted Officer's password hash to legacy:", legacyHash);

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
