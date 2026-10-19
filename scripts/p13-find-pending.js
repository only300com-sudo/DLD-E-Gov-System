import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ejariCase = await db.ejariCase.findFirst({
  where: { documents: { some: { verificationStatus: "pending" } } },
  include: { documents: true },
});
if (ejariCase) {
  console.log(`Found case with pending docs: ${ejariCase.caseNumber} (id=${ejariCase.id})`);
  for (const d of ejariCase.documents) console.log(`  - ${d.documentType} status=${d.verificationStatus}`);
} else {
  console.log("No case with pending docs — need to seed one");
}
await db.$disconnect();
