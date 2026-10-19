// P13 Gap A — pre-check: find EjariCases + EjariDocuments to use for verification
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const r = await db.ejariCase.findMany({
  include: { _count: { select: { documents: true, statusHistory: true } } },
  orderBy: { createdAt: "desc" },
  take: 10,
});
console.log("=== EjariCases ===");
for (const c of r) {
  console.log(`- ${c.caseNumber} (${c.id}) serviceType=${c.serviceType} mode=${c.mode} status=${c.status} dldRef=${c.dldReference ?? "NULL"} docs=${c._count.documents}`);
}
console.log("\n=== EjariDocuments (first 20) ===");
const docs = await db.ejariDocument.findMany({ take: 20, orderBy: { uploadedAt: "desc" }, include: { ejariCase: { select: { caseNumber: true } } } });
for (const d of docs) {
  console.log(`- docId=${d.id} case=${d.ejariCase?.caseNumber} type=${d.documentType} status=${d.verificationStatus} docRegisterId=${d.documentRegisterId ?? "NULL"}`);
}
console.log("\n=== SecureLinks ===");
const sl = await db.secureLink.findMany({ take: 10, orderBy: { createdAt: "desc" } });
for (const s of sl) {
  console.log(`- token=${s.token.slice(0,12)}... case=${s.caseNumber ?? "NULL"} purpose=${s.purpose} used=${s.usedCount}/${s.maxUses} revoked=${s.isRevoked}`);
}
await db.$disconnect();
