const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const a = await p.auditLog.findMany({
    where: { createdAt: { gte: since }, action: { startsWith: "AI_" } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, details: true, createdAt: true, entityId: true },
  });
  console.log(`AI-related audit entries in last 30 min: ${a.length}`);
  for (const x of a) console.log(`  ${x.createdAt.toISOString()} | ${x.action} | ${x.details?.slice(0, 130)}`);
  await p.$disconnect();
})();
