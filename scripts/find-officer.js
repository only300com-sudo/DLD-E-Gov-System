const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find ALL TRUSTEE_OFFICER users
  const officers = await p.user.findMany({ where: { role: 'TRUSTEE_OFFICER' }, select: { id: true, name: true, email: true } });
  console.log("All officers:", JSON.stringify(officers, null, 2));
  // Look at cases
  const cases = await p.case.findMany({ select: { id: true, caseRef: true, trusteeOfficerId: true }, take: 10 });
  console.log("Cases officer IDs:");
  for (const c of cases) console.log(`  ${c.caseRef} → ${c.trusteeOfficerId}`);
  await p.$disconnect();
})();
