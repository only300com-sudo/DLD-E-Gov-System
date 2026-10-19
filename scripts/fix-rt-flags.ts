// scripts/fix-rt-flags.ts
// Fix Flag 1: Add 8 new transition rows for cancelled/rejected inbound edges
// Fix Flag 2: Add pending_smart_app to applicable P1 procedures
// Fix: Update state machine allowedNext to include cancelled/rejected

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // ── FLAG 1: Update state machine allowedNext ────────────────────
  // Add "cancelled" and "rejected" to allowedNext of all non-terminal states
  console.log("=== Flag 1: Updating state machine ===");
  
  const stateUpdates = [
    { id: "ws-001", allowedNext: JSON.stringify(["not_received", "received", "cancelled", "rejected"]) }, // draft
    { id: "ws-002", allowedNext: JSON.stringify(["received", "cancelled"]) }, // requires_modification
    { id: "ws-003", allowedNext: JSON.stringify(["received", "cancelled"]) }, // pending_smart_app
    { id: "ws-004", allowedNext: JSON.stringify(["received", "cancelled", "rejected"]) }, // not_received
    { id: "ws-005", allowedNext: JSON.stringify(["completed", "requires_modification", "cancelled", "rejected"]) }, // received
  ];
  for (const s of stateUpdates) {
    await db.procedureWorkflowState.update({ where: { id: s.id }, data: { allowedNext: s.allowedNext } });
  }
  console.log(`  Updated ${stateUpdates.length} states with cancelled/rejected in allowedNext`);

  // ── FLAG 1: Add 8 new transition rows (t-012 through t-019) ──────
  const newTransitions = [
    { id: "t-012", fromState: "draft", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
    { id: "t-013", fromState: "requires_modification", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
    { id: "t-014", fromState: "pending_smart_app", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
    { id: "t-015", fromState: "not_received", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
    { id: "t-016", fromState: "received", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
    { id: "t-017", fromState: "draft", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "auditor" },
    { id: "t-018", fromState: "not_received", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "auditor" },
    { id: "t-019", fromState: "received", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "auditor" },
  ];
  for (const t of newTransitions) {
    await db.workflowTransition.upsert({ where: { id: t.id }, create: t, update: t });
  }
  console.log(`  Added ${newTransitions.length} new transition rows (t-012 through t-019)`);

  // ── FLAG 2: Add pending_smart_app to applicable P1 procedures ────
  console.log("\n=== Flag 2: Adding pending_smart_app to catalog ===");
  
  const procedures = await db.procedureCatalog.findMany();
  let updated = 0;
  for (const p of procedures) {
    const states = JSON.parse(p.workspaceStates) as string[];
    if (!states.includes("pending_smart_app")) {
      // Add pending_smart_app between draft and the next state
      // For procedures with not_received: draft, pending_smart_app, requires_modification, not_received, received, completed
      // For procedures without not_received: draft, pending_smart_app, requires_modification, received, completed
      states.splice(1, 0, "pending_smart_app"); // insert after draft
      await db.procedureCatalog.update({
        where: { id: p.id },
        data: { workspaceStates: JSON.stringify(states) },
      });
      updated++;
    }
  }
  console.log(`  Updated ${updated} procedures to include pending_smart_app`);

  // ── Verify ──
  console.log("\n=== Verification ===");
  const transitionCount = await db.workflowTransition.count();
  const stateCount = await db.procedureWorkflowState.count();
  const catalogCount = await db.procedureCatalog.count();
  const eventCount = await db.mixpanelEventMap.count();
  
  console.log(`WorkflowTransition: ${transitionCount} (expected 21)`);
  console.log(`ProcedureWorkflowState: ${stateCount} (expected 8)`);
  console.log(`ProcedureCatalog: ${catalogCount} (expected 13)`);
  console.log(`MixpanelEventMap: ${eventCount} (expected 11)`);
  
  // Verify pending_smart_app is now in at least one procedure
  const procsWithSmartApp = await db.procedureCatalog.findMany({
    where: { workspaceStates: { contains: "pending_smart_app" } },
  });
  console.log(`Procedures with pending_smart_app: ${procsWithSmartApp.length} (expected 13)`);
  
  // Verify transitions for cancelled
  const cancelledTransitions = await db.workflowTransition.findMany({
    where: { toState: "cancelled" },
  });
  console.log(`Transitions → cancelled: ${cancelledTransitions.length} (expected 5)`);
  
  // Verify transitions for rejected
  const rejectedTransitions = await db.workflowTransition.findMany({
    where: { toState: "rejected" },
  });
  console.log(`Transitions → rejected: ${rejectedTransitions.length} (expected 3)`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
