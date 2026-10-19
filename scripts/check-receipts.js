const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const receipts = await p.feeReceipt.findMany({
    take: 10,
    select: { id: true, receiptNumber: true, feeLineId: true, caseNumber: true, amountFils: true, paymentMethod: true, attachmentDocumentId: true, paidAt: true },
    orderBy: { paidAt: 'desc' },
  });
  console.log("All FeeReceipts (top 10):");
  for (const r of receipts) {
    console.log(`  ${r.receiptNumber} | amountFils=${r.amountFils} | method=${r.paymentMethod} | attachmentDocId=${r.attachmentDocumentId ?? 'NULL'}`);
  }
  await p.$disconnect();
})();
