import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const convs = await p.waConversation.findMany({
    where: { status: "open" },
    include: { contact: { select: { fullName: true, consentStatus: true, preferredLanguage: true } } },
  });
  console.log("All open conversations:");
  for (const c of convs) {
    const linkedCase = c.caseNumber ? await p.case.findFirst({ where: { caseRef: c.caseNumber }, select: { status: true } }) : null;
    console.log(`  ${c.id.slice(-6)} | ${c.contact.fullName} | consent=${c.contact.consentStatus} | caseNumber=${c.caseNumber ?? 'none'} | case.status=${linkedCase?.status ?? 'n/a'}`);
  }
  await p.$disconnect();
})();
