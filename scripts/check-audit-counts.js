const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const now = new Date();
  console.log("Now:", now.toISOString());
  for (const days of [1, 7, 14, 30, 90]) {
    const start = new Date(Date.now() - days * 86400000);
    const count = await p.auditLog.count({ where: { createdAt: { gte: start } } });
    console.log(`  Last ${days}d (${start.toISOString().slice(0,10)}): ${count} audit logs`);
  }
  await p.$disconnect();
})();
