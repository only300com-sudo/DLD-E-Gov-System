import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const cases = await p.case.findMany({ select: { id: true, caseRef: true, status: true }, take: 10 });
for (const c of cases) console.log(`  ${c.caseRef} | ${c.status}`);
await p.$disconnect();
