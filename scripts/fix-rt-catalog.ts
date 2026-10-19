// scripts/fix-rt-catalog.ts
// Part 4 Correction 1 — Per-procedure state variation (not all procedures have all states)
// Part 4 Correction 2 — t-009 becomes a user action (Option A)
//
// Only 3 procedures get pending_smart_app: SALE-DEL-001, LTO-REG-001, CMP-SALE-MORT-001
// 4 pre-registration procedures lose not_received: SALE-PRE-001, GRANT-PRE-001, LTO-REG-PRE-001, MORT-REG-PRE-001

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const PRE_REGISTRATION_IDS = new Set([
  "SALE-PRE-001",
  "GRANT-PRE-001",
  "LTO-REG-PRE-001",
  "MORT-REG-PRE-001",
]);

const SMART_APP_ENABLED_IDS = new Set([
  "SALE-DEL-001",
  "LTO-REG-001",
  "CMP-SALE-MORT-001",
]);

function statesFor(procId: string): string[] {
  const isPreReg = PRE_REGISTRATION_IDS.has(procId);
  const isSmartApp = SMART_APP_ENABLED_IDS.has(procId);

  const states: string[] = ["draft"];

  if (isSmartApp) states.push("pending_smart_app");
  states.push("requires_modification");
  if (!isPreReg) states.push("not_received");
  states.push("received", "completed", "cancelled", "rejected");

  return states;
}

async function main() {
  // ── CORRECTION 1: Fix per-procedure workspaceStates ──────────
  console.log("=== Correction 1: Per-procedure state variation ===");
  
  const procedures = await db.procedureCatalog.findMany();
  let updated = 0;
  for (const p of procedures) {
    const correctStates = statesFor(p.id);
    const correctJson = JSON.stringify(correctStates);
    if (p.workspaceStates !== correctJson) {
      await db.procedureCatalog.update({
        where: { id: p.id },
        data: { workspaceStates: correctJson },
      });
      console.log(`  ${p.id}: ${correctStates.length} states → ${correctStates.join(", ")}`);
      updated++;
    }
  }
  console.log(`Updated ${updated} procedures`);

  // ── CORRECTION 2: Fix t-009 to Option A (user action) ────────
  console.log("\n=== Correction 2: t-009 → Option A (user action) ===");
  await db.workflowTransition.upsert({
    where: { id: "t-009" },
    create: {
      id: "t-009",
      fromState: "draft",
      toState: "pending_smart_app",
      triggerType: "click",
      triggerId: "btnSendToSmartApp",
      mixpanelEvent: "procedure_sent_to_smart_app",
      requiresRole: "officer",
    },
    update: {
      triggerType: "click",
      triggerId: "btnSendToSmartApp",
      mixpanelEvent: "procedure_sent_to_smart_app",
      requiresRole: "officer",
    },
  });
  console.log("  t-009 updated: draft → pending_smart_app | click/btnSendToSmartApp | officer | procedure_sent_to_smart_app");

  // Add new mixpanel event key
  await db.mixpanelEventMap.upsert({
    where: { key: "procedure_sent_to_smart_app" },
    create: {
      key: "procedure_sent_to_smart_app",
      displayLabel: "Procedure Sent to Smart App",
      category: "rt_employee",
      firedFrom: "RT",
      transitions: JSON.stringify(["t-009"]),
    },
    update: {
      displayLabel: "Procedure Sent to Smart App",
      category: "rt_employee",
      firedFrom: "RT",
      transitions: JSON.stringify(["t-009"]),
    },
  });
  console.log("  Added event key: procedure_sent_to_smart_app");

  // ── VERIFICATION ──────────────────────────────────────────────
  console.log("\n=== Verification ===");
  
  const smartAppProcs = await db.procedureCatalog.findMany({
    where: { workspaceStates: { contains: "pending_smart_app" } },
  });
  console.log(`Procedures with pending_smart_app: ${smartAppProcs.length} (expected 3)`);
  for (const p of smartAppProcs) {
    console.log(`  ✓ ${p.id} — ${p.nameEn}`);
  }

  const preRegWithNotReceived = await db.procedureCatalog.findMany({
    where: {
      id: { contains: "-PRE-" },
      workspaceStates: { contains: "not_received" },
    },
  });
  console.log(`Pre-registration with not_received: ${preRegWithNotReceived.length} (expected 0)`);

  const transitionCount = await db.workflowTransition.count();
  console.log(`Total transitions: ${transitionCount} (expected 19)`);

  const eventCount = await db.mixpanelEventMap.count();
  console.log(`Total event keys: ${eventCount} (expected 12)`);

  // Detailed state distribution
  console.log("\n=== Per-procedure state distribution ===");
  for (const p of await db.procedureCatalog.findMany({ orderBy: { id: "asc" } })) {
    const states = JSON.parse(p.workspaceStates) as string[];
    console.log(`  ${p.id}: ${states.length} states — ${states.join(", ")}`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
