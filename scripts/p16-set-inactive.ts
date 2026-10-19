// Phase 16.4 — Set a client to inactive for the inactive-client screenshot test
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Set Sarah Williams (C-2026-0002) to inactive for the test
const updated = await db.client.update({
  where: { internalId: "C-2026-0002" },
  data: {
    status: "inactive",
    statusChangedAt: new Date(),
    statusChangedBy: "system",
    statusReason: "Phase 16.4 verification test — temporarily set to inactive",
  },
});
console.log("Updated client:", { internalId: updated.internalId, fullNameEn: updated.fullNameEn, status: updated.status });

// Also write a ClientAuditLog entry for the status change
await db.clientAuditLog.create({
  data: {
    clientId: updated.id,
    action: "status_changed",
    field: "status",
    oldValue: "active",
    newValue: "inactive",
    actorId: "system",
    actorRole: "system",
    reason: "Phase 16.4 verification test",
  },
});
console.log("ClientAuditLog entry created for status change");

await db.$disconnect();
