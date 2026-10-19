const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.auditLog.findMany({
    where: { action: 'WHATSAPP_MESSAGE_SENT' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, details: true, createdAt: true, entityId: true },
  });
  console.log('All WHATSAPP_MESSAGE_SENT audits (newest first):');
  for (const x of a) console.log(`  ${x.createdAt.toISOString()} | ${x.details.slice(0, 120)}`);
  await p.$disconnect();
})();
