const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const l = await p.secureLink.findUnique({ where: { token: 'demo_active_link_token_123' }, select: { id: true, createdBy: true, contactId: true } });
  console.log('Link:', l);
  // Check if createdBy exists in User table
  if (l?.createdBy) {
    const u = await p.user.findUnique({ where: { id: l.createdBy }, select: { id: true, name: true, email: true } });
    console.log('Created by user:', u);
  }
  await p.$disconnect();
})();
