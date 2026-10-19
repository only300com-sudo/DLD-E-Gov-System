// Phase 16 — Data migration: backfill Client.phoneE164 from Client.mobile
// + set status='active' for all existing clients + set lastActivityAt
// + write ClientAuditLog 'created' entries for existing clients (backdated)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const clients = await db.client.findMany({ select: { id: true, internalId: true, fullNameEn: true, mobile: true, phoneE164: true, status: true, createdAt: true } });
console.log(`=== Backfilling ${clients.length} clients ===`);

let updated = 0;
for (const c of clients) {
  const updates: any = {};
  // Backfill phoneE164 from mobile if not already set
  if (!c.phoneE164 && c.mobile) {
    updates.phoneE164 = c.mobile;
  }
  // Set status to active if null (default is 'active' but existing rows may have null)
  if (!c.status) {
    updates.status = "active";
  }
  // Set lastActivityAt to createdAt if not set
  updates.lastActivityAt = c.createdAt;

  if (Object.keys(updates).length > 0) {
    await db.client.update({ where: { id: c.id }, data: updates });
    updated++;
    console.log(`  ✓ ${c.internalId} (${c.fullNameEn}) — phoneE164=${updates.phoneE164 ?? c.phoneE164 ?? "null"}, status=${updates.status ?? c.status ?? "active"}`);
  }

  // Write a backdated 'created' audit entry if none exists
  const existingAudit = await db.clientAuditLog.findFirst({
    where: { clientId: c.id, action: "created" },
  });
  if (!existingAudit) {
    await db.clientAuditLog.create({
      data: {
        clientId: c.id,
        action: "created",
        actorId: "system",
        actorRole: "system",
        reason: `Backfilled audit entry during Phase 16 migration. Original creation: ${c.createdAt.toISOString()}.`,
        createdAt: c.createdAt,
      },
    });
    console.log(`    └ ClientAuditLog 'created' entry backdated to ${c.createdAt.toISOString()}`);
  }
}

console.log(`\n=== Migration complete ===`);
console.log(`Clients updated: ${updated}/${clients.length}`);
console.log(`Phone E.164 backfilled: ${clients.filter((c) => !c.phoneE164 && c.mobile).length}`);

// Verify no orphan cases
const orphanCases = await db.case.count({
  where: { NOT: { client: { id: { not: undefined } } } },
});
console.log(`Orphan cases (no client FK): ${orphanCases} (expected 0)`);

// Verify unique constraints work — try to find duplicate EIDs
const eidDups = await db.client.groupBy({
  by: ["emiratesId"],
  where: { emiratesId: { not: null } },
  _count: { emiratesId: true },
  having: { emiratesId: { _count: { gt: 1 } } },
});
console.log(`Duplicate emiratesIds: ${eidDups.length} (expected 0 — @unique constraint is safe)`);

await db.$disconnect();
