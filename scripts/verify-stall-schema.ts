import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const caseInfo = await db.$queryRawUnsafe('PRAGMA table_info("Case")');
console.log("=== Case table columns (Phase 17.6 additions) ===");
const stallCols = caseInfo.filter(c => 
  c.name.includes('stall') || c.name.includes('escalation') || 
  c.name.includes('formalAbandonment') || c.name.includes('LastContactAt') || 
  c.name.includes('nextFollowUp') || c.name.includes('lastOfficerAction')
);
for (const c of stallCols) {
  console.log(`  ${c.name} (${c.type})`);
}

const stallEventInfo = await db.$queryRawUnsafe('PRAGMA table_info(CaseStallEvent)');
console.log("\n=== CaseStallEvent table columns ===");
for (const c of stallEventInfo) {
  console.log(`  ${c.name} (${c.type})`);
}

const caseCount = await db.case.count();
const stallEventCount = await db.caseStallEvent.count();
console.log(`\n=== Row counts (no data loss) ===`);
console.log(`Cases: ${caseCount}`);
console.log(`CaseStallEvents: ${stallEventCount} (expected 0 — no events yet)`);

await db.$disconnect();
