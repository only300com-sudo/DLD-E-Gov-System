// Quick check: are Ejari cases linked to regular Cases?
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ejariCases = await db.ejariCase.findMany({ take: 5, orderBy: { createdAt: "desc" }, select: { caseNumber: true, id: true, contactId: true, clientCode: true } });
for (const ec of ejariCases) {
  const regularCase = await db.case.findFirst({ where: { caseRef: ec.caseNumber }, select: { id: true, caseRef: true } });
  console.log(`Ejari ${ec.caseNumber}: regularCase=${regularCase ? regularCase.id : "NONE"}`);
}
// Count EjariCases + Documents
const ejariCount = await db.ejariCase.count();
const ejariDocCount = await db.ejariDocument.count();
const docCount = await db.document.count();
console.log(`\nTotals: EjariCases=${ejariCount}, EjariDocuments=${ejariDocCount}, Documents=${docCount}`);
await db.$disconnect();
