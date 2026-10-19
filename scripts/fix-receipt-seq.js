const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Bump lastValue to match the actual max receipt (RCPT-2026-000004 → lastValue=4)
  await p.receiptSequence.upsert({
    where: { year: 2026 },
    create: { year: 2026, lastValue: 4 },
    update: { lastValue: 4 },
  });
  const seq = await p.receiptSequence.findMany();
  console.log("After fix:", JSON.stringify(seq, null, 2));
  await p.$disconnect();
})();
