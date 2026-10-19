const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 600000);
  const a = await p.auditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { action: true, details: true, createdAt: true, entityId: true },
  });
  for (const x of a) console.log(`${x.createdAt.toISOString()} | ${x.action} | ${x.details}`);
  await p.$disconnect();
})();
