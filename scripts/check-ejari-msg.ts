import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const msgs = await p.waMessage.findMany({
  where: { templateName: { contains: "ejari" } },
  orderBy: { createdAt: "desc" },
  take: 5,
  select: { id: true, templateName: true, content: true, externalMessageId: true, deliveryStatus: true, createdAt: true },
});
console.log(`Ejari-related WaMessages: ${msgs.length}`);
for (const m of msgs) console.log(`  ${m.createdAt.toISOString()} | ${m.templateName} | ${m.content?.slice(0, 100)} | ext=${m.externalMessageId}`);

// Also check the EjariCase we just created
const cases = await p.ejariCase.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 10 * 60000) } },
  select: { id: true, caseNumber: true, contactId: true, status: true, dldReference: true, certificateUrl: true },
  orderBy: { createdAt: "desc" },
  take: 5,
});
console.log(`\nRecent Ejari cases: ${cases.length}`);
for (const c of cases) console.log(`  ${c.caseNumber} | contactId=${c.contactId?.slice(-6) ?? "null"} | status=${c.status} | dldRef=${c.dldReference ?? "n/a"} | certUrl=${c.certificateUrl ?? "n/a"}`);
await p.$disconnect();
