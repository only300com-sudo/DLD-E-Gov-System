const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const seq = await p.receiptSequence.findMany();
  console.log("ReceiptSequence:", JSON.stringify(seq, null, 2));
  const maxReceipt = await p.feeReceipt.findFirst({
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });
  console.log("Max existing receipt:", maxReceipt);
  await p.$disconnect();
})();
