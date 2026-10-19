const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cases = await p.case.findMany({
    select: { id: true, caseRef: true, status: true, trusteeOfficerId: true, trusteeManagerId: true, receptionAdminId: true, delegationMode: true },
    take: 20,
  });
  console.log("Cases — assignment state:");
  for (const c of cases) {
    console.log(`  ${c.caseRef} | status=${c.status} | officer=${c.trusteeOfficerId ? c.trusteeOfficerId.slice(-6) : 'NULL'} | manager=${c.trusteeManagerId ? c.trusteeManagerId.slice(-6) : 'NULL'} | reception=${c.receptionAdminId ? c.receptionAdminId.slice(-6) : 'NULL'} | delegMode=${c.delegationMode}`);
  }
  // Find officer user
  const officer = await p.user.findFirst({ where: { role: 'TRUSTEE_OFFICER' }, select: { id: true, name: true } });
  console.log("\nOfficer user:", officer ? `${officer.name} (id=${officer.id})` : 'none');
  await p.$disconnect();
})();
