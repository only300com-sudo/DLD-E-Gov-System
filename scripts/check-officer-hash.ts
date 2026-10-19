import { db } from "@/lib/db";
import { isLegacyHash } from "@/lib/auth/password";
const officer = await db.user.findUnique({ where: { email: "officer@trustee.ae" } });
if (!officer) {
  console.error("Officer not found");
  process.exit(1);
}
console.log("Officer password hash:", officer.passwordHash.substring(0, 60));
console.log("Is legacy hash?", isLegacyHash(officer.passwordHash));
console.log("Is Argon2id?", officer.passwordHash.startsWith("$argon2id$"));
await db.$disconnect();
process.exit(0);
