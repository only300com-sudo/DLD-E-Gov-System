// scripts/fix-rt-catalog-comprehensive.ts
// Part 8A pre-flight fix — comprehensive workspaceStates rebuild.
//
// fix-rt-catalog.ts only knew about 3 P1 smart-app procedures and 4 P1
// pre-reg procedures. Running it after the P2/P3 seeds wipes the corrections
// made by fix-p3-counts.ts (which only patched 1 procedure). This script
// rebuilds workspaceStates for ALL 103 procedures using the COMPLETE smart-app
// list (10 procedures, derived from seed-p2-procedures.ts SMART_APP_P2 +
// seed-p3-procedures.ts SMART_APP_P3 + the 3 P1 smart-app IDs).
//
// Rules:
//   - Smart-app procedures (10): include pending_smart_app
//     P1 (3): SALE-DEL-001, LTO-REG-001, CMP-SALE-MORT-001
//     P2 (5): SALE-PAY-001, SALE-DELC-001, LTO-MOD-001, LTO-TRF-001, FL-001
//     P2 (1, via fix-p3-counts.ts): USF-SALE-001  (was double-listed in spec)
//     P3 (1): USF-LTO-REG-001
//   - Pre-reg procedures (19, id contains "-PRE-"): EXCLUDE not_received
//
// Run: npx tsx scripts/fix-rt-catalog-comprehensive.ts
// Idempotent: safe to re-run.

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Complete list of 10 smart-app procedures (canonical — verified against
// seed-rt-workflow.ts, seed-p2-procedures.ts, seed-p3-procedures.ts,
// fix-p3-counts.ts). DO NOT EDIT unless the underlying seeds change.
const SMART_APP_IDS = new Set([
  // P1 smart-app (3)
  "SALE-DEL-001",
  "LTO-REG-001",
  "CMP-SALE-MORT-001",
  // P2 smart-app (5) — from seed-p2-procedures.ts SMART_APP_P2
  "SALE-PAY-001",
  "SALE-DELC-001",
  "LTO-MOD-001",
  "LTO-TRF-001",
  "FL-001",
  // P2 smart-app (1) — from fix-p3-counts.ts (USF-SALE-001 was double-listed
  // in spec; correct resolution: keep in P2 with pending_smart_app set)
  "USF-SALE-001",
  // P3 smart-app (1) — from seed-p3-procedures.ts SMART_APP_P3
  "USF-LTO-REG-001",
]);

// Build workspaceStates for a procedure based on its flags.
// Order: draft, [pending_smart_app], requires_modification, [not_received],
//        received, completed, cancelled, rejected
function statesFor(isSmartApp: boolean, isPreReg: boolean): string[] {
  const states: string[] = ["draft"];
  if (isSmartApp) states.push("pending_smart_app");
  states.push("requires_modification");
  if (!isPreReg) states.push("not_received");
  states.push("received", "completed", "cancelled", "rejected");
  return states;
}

async function main() {
  console.log("=== Comprehensive workspaceStates rebuild ===\n");
  console.log(`Smart-app IDs (canonical list, ${SMART_APP_IDS.size}):`);
  for (const id of SMART_APP_IDS) console.log(`  • ${id}`);
  console.log("");

  const procedures = await db.procedureCatalog.findMany();
  let updated = 0;
  let skipped = 0;
  const smartAppFound: string[] = [];
  const preRegFound: string[] = [];

  for (const p of procedures) {
    const isSmartApp = SMART_APP_IDS.has(p.id);
    const isPreReg = p.id.includes("-PRE-");

    if (isSmartApp) smartAppFound.push(p.id);
    if (isPreReg) preRegFound.push(p.id);

    const correctStates = statesFor(isSmartApp, isPreReg);
    const correctJson = JSON.stringify(correctStates);

    if (p.workspaceStates === correctJson) {
      skipped++;
      continue;
    }

    await db.procedureCatalog.update({
      where: { id: p.id },
      data: { workspaceStates: correctJson },
    });
    updated++;
  }

  console.log(`Smart-app procedures found in DB (${smartAppFound.length}):`);
  for (const id of smartAppFound) console.log(`  • ${id}`);
  console.log(`\nPre-reg procedures found in DB (${preRegFound.length})`);
  console.log(`\nUpdated: ${updated} | Skipped (already correct): ${skipped}`);

  // Sanity: every ID in SMART_APP_IDS should be present in the DB
  const missing = [...SMART_APP_IDS].filter(id => !smartAppFound.includes(id));
  if (missing.length > 0) {
    console.warn(`\n⚠ ${missing.length} canonical smart-app IDs not found in DB:`);
    for (const id of missing) console.warn(`  • ${id}`);
  }

  // Final verification
  const finalCount = await db.procedureCatalog.count();
  const finalSmartApp = await db.procedureCatalog.count({
    where: { workspaceStates: { contains: "pending_smart_app" } },
  });
  const finalPreRegWithNotReceived = await db.procedureCatalog.findMany({
    where: { id: { contains: "-PRE-" } },
    select: { id: true, workspaceStates: true },
  });
  const withNotReceived = finalPreRegWithNotReceived.filter(p =>
    JSON.parse(p.workspaceStates).includes("not_received")
  );

  console.log(`\n=== Final Verification ===`);
  console.log(`Total: ${finalCount} (expected 103) ✓=${finalCount === 103}`);
  console.log(`Smart-app: ${finalSmartApp} (expected 10) ✓=${finalSmartApp === 10}`);
  console.log(`Pre-reg WITH not_received: ${withNotReceived.length} (expected 0) ✓=${withNotReceived.length === 0}`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

