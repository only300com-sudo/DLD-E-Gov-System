const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cases = await p.case.findMany({ select: { caseRef: true, createdAt: true, status: true } });
  console.log("Cases:")
  for (const c of cases) console.log(`  ${c.caseRef} | ${c.createdAt.toISOString()} | ${c.status}`);
  console.log("Now:", new Date().toISOString());
  console.log("Now - 1 day:", new Date(Date.now() - 1*86400000).toISOString());
  await p.$disconnect();
})();
