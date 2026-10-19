import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const invs = await db.invoice.findMany({ select: { id: true, invoiceNumber: true, paymentStatus: true, caseNumber: true } });
for (const i of invs) console.log(`${i.invoiceNumber} | status=${i.paymentStatus} | case=${i.caseNumber}`);
await db.$disconnect();
