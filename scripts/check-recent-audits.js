const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.auditLog.findMany({
    where: { createdAt: { gt: new Date('2026-10-01T07:27:00Z') } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, details: true, createdAt: true },
  });
  console.log('Audits after 07:27:');
  for (const x of a) console.log(`  ${x.createdAt.toISOString()} | ${x.action} | ${x.details.slice(0, 130)}`);
  await p.$disconnect();
})();
