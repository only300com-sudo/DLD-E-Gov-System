import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.case.update({
  where: { caseRef: "TOP-2026-0005" },
  data: { status: "RETURNED_FOR_CORRECTION" },
});
const c = await p.case.findUnique({ where: { caseRef: "TOP-2026-0005" }, select: { caseRef: true, status: true } });
console.log(`Updated TOP-2026-0005 to: ${c?.status}`);
await p.$disconnect();
