const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.auditLog.findMany({
    where: { action: 'WHATSAPP_MESSAGE_SENT', createdAt: { gt: new Date('2026-10-01T07:25:00Z') } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { action: true, details: true, createdAt: true },
  });
  console.log('WHATSAPP_MESSAGE_SENT audits after 07:25:');
  for (const x of a) console.log(`  ${x.createdAt.toISOString()} | ${x.details}`);
  await p.$disconnect();
})();
