// Phase 16 — Fix backdated audit entries per user's review.
// Change action from 'created' to 'migration_backfill' with createdAt=now()
// and newValue containing the original creation metadata.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Find all 'created' audit entries that were backdated during the migration
const backdated = await db.clientAuditLog.findMany({
  where: { action: "created", actorId: "system", actorRole: "system" },
});
console.log(`Found ${backdated.length} backdated 'created' entries to fix`);

for (const entry of backdated) {
  // Look up the client to get the original createdAt + createdBy
  const client = await db.client.findUnique({
    where: { id: entry.clientId },
    select: { internalId: true, fullNameEn: true, createdAt: true },
  });

  // Update the audit entry: action → 'migration_backfill', createdAt → now(), newValue → JSON with original metadata
  await db.clientAuditLog.update({
    where: { id: entry.id },
    data: {
      action: "migration_backfill",
      reason: "Audit log initialized during Phase 16 migration. No prior audit entries existed — this row establishes the baseline.",
      createdAt: new Date(),
      newValue: JSON.stringify({
        originalCreatedAt: client?.createdAt.toISOString(),
        originalCreatedBy: "system (seed data)",
        clientInternalId: client?.internalId,
        clientFullNameEn: client?.fullNameEn,
      }),
    },
  });
  console.log(`  ✓ Fixed ${client?.internalId} (${client?.fullNameEn}) — action='migration_backfill', createdAt=now()`);
}

// Verify the fix
const fixed = await db.clientAuditLog.findMany({
  where: { action: "migration_backfill" },
  select: { id: true, action: true, reason: true, newValue: true, createdAt: true },
});
console.log(`\n=== Verified: ${fixed.length} migration_backfill entries ===`);
for (const f of fixed) {
  console.log(`  - id=${f.id} | createdAt=${f.createdAt.toISOString()} | newValue=${f.newValue?.slice(0, 120)}...`);
}

await db.$disconnect();
