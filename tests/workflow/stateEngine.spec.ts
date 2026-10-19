// Phase 6.3 — Workflow State Engine Tests (P5-6)
// Tests the intersection rule: machine ∧ catalog ∧ role
// Run with: npx tsx tests/workflow/stateEngine.spec.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

async function setup() {
  const { initStateEngine } = await import("../../src/lib/workflow/rt/stateEngine");
  await initStateEngine();
}

async function getTransition(from: string, to: string) {
  const t = await db.workflowTransition.findFirst({
    where: { fromState: from, toState: to },
  });
  return t ? { requiresRole: t.requiresRole } : null;
}

async function getCatalog(id: string) {
  const p = await db.procedureCatalog.findUnique({ where: { id } });
  return p ? { workspaceStates: p.workspaceStates } : null;
}

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function runTests() {
  const { canTransition, isTerminal, initStateEngine } = await import("../../src/lib/workflow/rt/stateEngine");
  await initStateEngine();

  const saleRow = await getCatalog("SALE-001");         // standard sale — no pending_smart_app
  const preRow = await getCatalog("SALE-PRE-001");      // pre-reg — no not_received
  const smartRow = await getCatalog("SALE-DEL-001");   // smart-app — has pending_smart_app

  console.log("=== WorkflowStateEngine — Intersection Rule Tests ===\n");

  // Test 1: All three conditions pass
  console.log("Test 1: All three conditions pass (draft → received, officer, SALE-001)");
  const t1 = await getTransition("draft", "received");
  const r1 = canTransition("draft", "received", saleRow!.workspaceStates, "officer", t1);
  assert("machine ∧ catalog ∧ role all pass", r1.ok, !r1.ok ? (r1 as any).reason : "");

  // Test 2: Machine disallows (completed → draft)
  console.log("Test 2: Machine disallows (completed → draft)");
  const r2 = canTransition("completed", "draft", saleRow!.workspaceStates, "officer", null);
  assert("machine rejects completed → draft", !r2.ok, r2.ok ? "should have been rejected" : "");

  // Test 3: Catalog disallows (pre-reg → not_received — machine allows but catalog doesn't)
  console.log("Test 3: Catalog disallows even though machine allows (SALE-PRE-001 → not_received)");
  const t3 = await getTransition("draft", "not_received");
  const r3 = canTransition("draft", "not_received", preRow!.workspaceStates, "officer", t3);
  assert("catalog rejects not_received for pre-reg", !r3.ok, r3.ok ? "should have been rejected" : "");
  if (!r3.ok) assert("reason is catalog disallows", (r3 as any).reason?.includes("catalog disallows"), (r3 as any).reason);

  // Test 4: Role mismatch (auditor transition fired by officer)
  console.log("Test 4: Role mismatch (received → requires_modification requires auditor, fired by officer)");
  const t4 = await getTransition("received", "requires_modification");
  assert("transition requires auditor", t4?.requiresRole === "auditor", `got ${t4?.requiresRole}`);
  const r4 = canTransition("received", "requires_modification", saleRow!.workspaceStates, "officer", t4);
  assert("officer rejected for auditor-only transition", !r4.ok, r4.ok ? "should have been rejected" : "");

  // Test 5: Smart-app path only works for smart-app procedures
  console.log("Test 5: Smart-app path gating (EXTERNAL → pending_smart_app)");
  const t5 = await getTransition("EXTERNAL", "pending_smart_app");
  const r5a = canTransition("EXTERNAL", "pending_smart_app", smartRow!.workspaceStates, "officer", t5);
  const r5b = canTransition("EXTERNAL", "pending_smart_app", saleRow!.workspaceStates, "officer", t5);
  assert("smart-app procedure allows EXTERNAL → pending_smart_app", r5a.ok, !r5a.ok ? (r5a as any).reason : "");
  assert("non-smart-app procedure rejects EXTERNAL → pending_smart_app", !r5b.ok, r5b.ok ? "should have been rejected" : "");

  // Test 6: isTerminal
  console.log("Test 6: isTerminal returns true for terminal states");
  assert("completed is terminal", isTerminal("completed"));
  assert("cancelled is terminal", isTerminal("cancelled"));
  assert("rejected is terminal", isTerminal("rejected"));
  assert("received is NOT terminal", !isTerminal("received"));
  assert("draft is NOT terminal", !isTerminal("draft"));

  // Test 7: admin can bypass role checks
  console.log("Test 7: Admin can bypass role checks");
  const r7 = canTransition("received", "requires_modification", saleRow!.workspaceStates, "admin", t4);
  assert("admin bypasses auditor-only transition", r7.ok, !r7.ok ? (r7 as any).reason : "");

  // Test 8: cancelled/rejected from received now require admin (Item 2)
  console.log("Test 8: cancelled/rejected from received require admin (Item 2)");
  const t8a = await getTransition("received", "cancelled");
  const t8b = await getTransition("received", "rejected");
  assert("received→cancelled requires admin", t8a?.requiresRole === "admin", `got ${t8a?.requiresRole}`);
  assert("received→rejected requires admin", t8b?.requiresRole === "admin", `got ${t8b?.requiresRole}`);
  const r8a = canTransition("received", "cancelled", saleRow!.workspaceStates, "admin", t8a);
  const r8b = canTransition("received", "rejected", saleRow!.workspaceStates, "admin", t8b);
  assert("admin can cancel from received", r8a.ok, !r8a.ok ? (r8a as any).reason : "");
  assert("admin can reject from received", r8b.ok, !r8b.ok ? (r8b as any).reason : "");
  // Officer CANNOT cancel from received (was allowed before Item 2)
  const r8c = canTransition("received", "cancelled", saleRow!.workspaceStates, "officer", t8a);
  assert("officer CANNOT cancel from received (admin-only)", !r8c.ok, r8c.ok ? "should have been rejected" : "");

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
