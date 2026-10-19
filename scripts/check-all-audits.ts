import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const since = new Date(Date.now() - 5 * 60_000);
const audits = await p.auditLog.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: "desc" },
  take: 15,
  select: { id: true, action: true, details: true, createdAt: true, entityId: true, caseId: true },
});
console.log(`Recent audits (last 5 min): ${audits.length}`);
for (const a of audits) {
  console.log(`  ${a.createdAt.toISOString()} | ${a.action} | entityId=${a.entityId?.slice(-6) ?? "n/a"} | caseId=${a.caseId?.slice(-6) ?? "n/a"} | ${a.details?.slice(0, 100)}`);
}
await p.$disconnect();
