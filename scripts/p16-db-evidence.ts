// Final DB verification for Phase 16 Section 16.2
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Find the client created via the wizard (Phase Sixteen Test)
const wizardClient = await db.client.findFirst({
  where: { fullNameEn: "Phase Sixteen Test" },
  include: { clientAuditLog: { orderBy: { createdAt: "desc" }, take: 3 } },
});
console.log("=== Client created via wizard ===");
if (wizardClient) {
  console.log({
    id: wizardClient.id,
    internalId: wizardClient.internalId,
    fullNameEn: wizardClient.fullNameEn,
    emiratesId: wizardClient.emiratesId,
    phoneE164: wizardClient.phoneE164,
    status: wizardClient.status,
    dataConsent: wizardClient.dataConsent,
    commConsent: wizardClient.commConsent,
    consentPrivacyPolicyAt: wizardClient.consentPrivacyPolicyAt?.toISOString(),
    lastActivityAt: wizardClient.lastActivityAt?.toISOString(),
    createdAt: wizardClient.createdAt.toISOString(),
  });
  console.log("\nClientAuditLog entries:");
  for (const a of wizardClient.clientAuditLog) {
    console.log({
      id: a.id,
      action: a.action,
      actorId: a.actorId,
      actorRole: a.actorRole,
      newValue: a.newValue?.slice(0, 200),
      createdAt: a.createdAt.toISOString(),
    });
  }
} else {
  console.log("NOT FOUND — checking all clients");
  const all = await db.client.findMany({ select: { id: true, internalId: true, fullNameEn: true, emiratesId: true, phoneE164: true, status: true } });
  for (const c of all) console.log(`  ${c.internalId} ${c.fullNameEn} | eid=${c.emiratesId} | phone=${c.phoneE164} | status=${c.status}`);
}

// Verify null passport (Gap 2 confirmation)
const nullPassport = await db.client.findFirst({
  where: { passportNumber: null },
  select: { internalId: true, passportNumber: true },
});
console.log("\n=== Gap 2 confirmation: null passport ===");
console.log("Client with null passport:", nullPassport ? { internalId: nullPassport.internalId, passportNumber: nullPassport.passportNumber } : "NONE");
console.log("passportNumber is NULL (not empty string):", nullPassport?.passportNumber === null ? "✓ CONFIRMED" : "✗");

// Verify migration_backfill audit entries (Gap 1 confirmation)
const backfillEntries = await db.clientAuditLog.findMany({
  where: { action: "migration_backfill" },
  select: { id: true, action: true, reason: true, newValue: true, createdAt: true },
});
console.log("\n=== Gap 1 confirmation: migration_backfill entries ===");
console.log(`Count: ${backfillEntries.length}`);
for (const b of backfillEntries) {
  console.log(`  - action=${b.action} | createdAt=${b.createdAt.toISOString()} | newValue=${b.newValue?.slice(0, 120)}...`);
}

await db.$disconnect();
