import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
// Check what actions each case can do
const cases = await p.case.findMany({ select: { id: true, caseRef: true, status: true } });
for (const c of cases) {
  console.log(`  ${c.caseRef} | ${c.status}`);
}
await p.$disconnect();
