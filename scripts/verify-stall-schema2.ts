import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const expected = [
  'stallReason', 'stallSince', 'stallNote',
  'lastClientContactAt', 'lastOfficerActionAt', 'nextFollowUpAt',
  'escalationLevel', 'formalAbandonmentAt', 'formalAbandonmentReason',
  'sellerLastContactAt', 'buyerLastContactAt', 'bankLastContactAt', 'developerLastContactAt',
];

const caseInfo = await db.$queryRawUnsafe('PRAGMA table_info("Case")');
console.log("=== All 13 expected stall fields present? ===");
for (const field of expected) {
  const found = caseInfo.find(c => c.name === field);
  console.log(`  ${field}: ${found ? '✓ (' + found.type + ')' : '✗ MISSING'}`);
}

await db.$disconnect();
