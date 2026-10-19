const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Look for ALL secure_upload_request messages on Ahmed's conversation ordered by createdAt
  const msgs = await p.waMessage.findMany({
    where: { conversationId: 'cmup6o5a5008bphbu2ig2k6a9', templateName: 'secure_upload_request' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, direction: true, content: true, externalMessageId: true, deliveryStatus: true, sentAt: true, createdAt: true },
  });
  console.log('All secure_upload_request messages on Ahmed conv:');
  for (const m of msgs) console.log(`  ${m.createdAt.toISOString()} | ${m.direction} | id=${m.id} | ext=${m.externalMessageId} | status=${m.deliveryStatus}`);
  console.log(`Total: ${msgs.length}`);

  // Also check audit log for SECURE_LINK_UPLOAD_RECEIVED on TOP-2026-0001
  const a = await p.auditLog.findMany({
    where: { action: { contains: 'SECURE_LINK' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, details: true, createdAt: true, entityId: true },
  });
  console.log('\nRecent SECURE_LINK audits:');
  for (const x of a) console.log(`  ${x.createdAt.toISOString()} | ${x.action} | ${x.details.slice(0, 100)}`);

  await p.$disconnect();
})();
