const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const officerUser = await p.user.findFirst({ where: { role: 'TRUSTEE_OFFICER' }, select: { id: true, name: true } });
  console.log("Officer:", officerUser);
  if (officerUser) {
    const officerCases = await p.case.findMany({
      where: { trusteeOfficerId: officerUser.id },
      select: { id: true, caseRef: true, status: true, delegationMode: true, reDelegatedAt: true, lastReturnReason: true },
      take: 10,
    });
    console.log("Officer cases count:", officerCases.length);
    for (const c of officerCases) console.log("  ", c.caseRef, c.status, c.delegationMode);
  }
  await p.$disconnect();
})();
