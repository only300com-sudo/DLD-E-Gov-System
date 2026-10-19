// tests/workflow/transition.integration.spec.ts
// Phase 6.3 — Integration tests for transition() atomicity (Item 4)
// Tests the actual DB transaction — state update + history write atomically.

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function resetCase(caseId: string) {
  await db.case.update({ where: { id: caseId }, data: { workflowState: "draft" } });
  await db.procedureWorkflowHistory.deleteMany({
    where: { procedureId: { in: await db.case.findMany({ where: { id: caseId }, select: { caseRef: true } }).then(c => c.map(x => x.caseRef)) } },
  }).catch(() => {});
}

async function main() {
  const { transition, getWorkflowHistory } = await import("../../src/lib/workflow/rt/transition");
  const { initStateEngine } = await import("../../src/lib/workflow/rt/stateEngine");
  await initStateEngine();

  // Find a DRAFT case
  const testCase = await db.case.findFirst({
    where: { status: "DRAFT" },
    select: { id: true, caseRef: true },
  });
  if (!testCase) {
    console.error("No DRAFT case found — skipping");
    process.exit(0);
  }

  const ACTOR = "test-atomic-user";

  console.log("=== transition() — Atomicity Integration Tests ===\n");
  console.log(`Using case: ${testCase.caseRef}\n`);

  // ── Test 1: Success — draft → received (t-002, officer) ──
  console.log("Test 1: Success — draft → received (officer)");
  await resetCase(testCase.id);
  // Clean history by caseRef
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    const r = await transition(testCase.id, "received", ACTOR + "-1", "officer", "integration test");
    assert("returns fromState=draft", r.fromState === "draft", `got ${r.fromState}`);
    assert("returns toState=received", r.toState === "received", `got ${r.toState}`);
    assert("returns mixpanelEvent=procedure_submitted_to_tabu", r.mixpanelEvent === "procedure_submitted_to_tabu", `got ${r.mixpanelEvent}`);

    // Check state was updated on the Case
    const caseAfter = await db.case.findUnique({ where: { id: testCase.id }, select: { workflowState: true } });
    assert("Case.workflowState=received", caseAfter?.workflowState === "received", `got ${caseAfter?.workflowState}`);

    // Check history was written
    const history = await getWorkflowHistory(testCase.caseRef);
    assert("history has 1 row", history.length === 1, `got ${history.length}`);
    if (history.length > 0) {
      assert("history fromState=draft", history[0].fromState === "draft", `got ${history[0].fromState}`);
      assert("history toState=received", history[0].toState === "received", `got ${history[0].toState}`);
      assert("history actor=ACTOR-1", history[0].actorUserId === ACTOR + "-1", `got ${history[0].actorUserId}`);
      assert("history reason=integration test", history[0].reason === "integration test", `got ${history[0].reason}`);
    }
  } catch (e: any) {
    assert("transition succeeded", false, e.message);
  }

  // ── Test 2: Role denial — officer tries received → requires_modification (auditor-only) ──
  console.log("\nTest 2: Role denial — officer tries received → requires_modification");
  await resetCase(testCase.id);
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // First transition to received
  await transition(testCase.id, "received", ACTOR + "-2a", "officer", "setup");
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // Now officer tries auditor-only transition
  try {
    await transition(testCase.id, "requires_modification", ACTOR + "-2b", "officer", "should be denied");
    assert("transition should have thrown", false, "did not throw");
  } catch (e: any) {
    assert("transition threw error", true, e.message);
    assert("error mentions role", e.message.includes("role") || e.message.includes("not permitted"), `got: ${e.message}`);
  }

  // Check state did NOT change
  const caseAfterDenial = await db.case.findUnique({ where: { id: testCase.id }, select: { workflowState: true } });
  assert("Case.workflowState still=received (no change)", caseAfterDenial?.workflowState === "received", `got ${caseAfterDenial?.workflowState}`);

  // Check denial history was written
  const denialHistory = await getWorkflowHistory(testCase.caseRef);
  assert("denial history has 1 row", denialHistory.length === 1, `got ${denialHistory.length}`);
  if (denialHistory.length > 0) {
    assert("denial toState=received (no change)", denialHistory[0].toState === "received", `got ${denialHistory[0].toState}`);
    assert("denial reason contains denied", denialHistory[0].reason?.includes("denied") || denialHistory[0].reason?.includes("role"), `got: ${denialHistory[0].reason}`);
  }

  // ── Test 3: Admin override — admin fires auditor-only transition ──
  console.log("\nTest 3: Admin override — admin fires received → requires_modification");
  await resetCase(testCase.id);
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // First transition to received
  await transition(testCase.id, "received", ACTOR + "-3a", "officer", "setup");
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // Admin fires auditor-only transition (should succeed with admin_override logging)
  try {
    const r = await transition(testCase.id, "requires_modification", ACTOR + "-3b", "admin", "admin override test");
    assert("admin transition succeeded", true, `from=${r.fromState} to=${r.toState}`);
    assert("returns toState=requires_modification", r.toState === "requires_modification", `got ${r.toState}`);

    const overrideHistory = await getWorkflowHistory(testCase.caseRef);
    assert("override history has 1 row", overrideHistory.length === 1, `got ${overrideHistory.length}`);
    if (overrideHistory.length > 0) {
      assert("override reason contains admin_override", overrideHistory[0].reason?.includes("admin_override"), `got: ${overrideHistory[0].reason}`);
      assert("override reason contains acting as auditor", overrideHistory[0].reason?.includes("acting as auditor"), `got: ${overrideHistory[0].reason}`);
    }
  } catch (e: any) {
    assert("admin transition succeeded", false, e.message);
  }

  // ── Test 4: Admin can cancel from received (t-016 admin-only) ──
  console.log("\nTest 4: Admin can cancel from received (t-016 admin-only)");
  await resetCase(testCase.id);
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // First transition to received
  await transition(testCase.id, "received", ACTOR + "-4a", "officer", "setup");
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    const r = await transition(testCase.id, "cancelled", ACTOR + "-4b", "admin", "admin cancel test");
    assert("admin cancel from received succeeded", true, `from=${r.fromState} to=${r.toState}`);
    assert("returns mixpanelEvent=procedure_cancelled", r.mixpanelEvent === "procedure_cancelled", `got ${r.mixpanelEvent}`);

    // Check state was updated
    const caseAfterCancel = await db.case.findUnique({ where: { id: testCase.id }, select: { workflowState: true } });
    assert("Case.workflowState=cancelled", caseAfterCancel?.workflowState === "cancelled", `got ${caseAfterCancel?.workflowState}`);

    const cancelHistory = await getWorkflowHistory(testCase.caseRef);
    assert("cancel history has 1 row", cancelHistory.length === 1, `got ${cancelHistory.length}`);
    if (cancelHistory.length > 0) {
      assert("cancel toState=cancelled", cancelHistory[0].toState === "cancelled", `got ${cancelHistory[0].toState}`);
      assert("cancel mixpanelEvent=procedure_cancelled", cancelHistory[0].mixpanelEvent === "procedure_cancelled", `got ${cancelHistory[0].mixpanelEvent}`);
    }
  } catch (e: any) {
    assert("admin cancel from received succeeded", false, e.message);
  }

  // ── Test 5: Officer CANNOT cancel from received (t-016 admin-only) ──
  console.log("\nTest 5: Officer CANNOT cancel from received (t-016 admin-only)");
  await resetCase(testCase.id);
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // First transition to received
  await transition(testCase.id, "received", ACTOR + "-5a", "officer", "setup");
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    // Officer tries to cancel from received — should be denied (t-016 requires admin)
    await transition(testCase.id, "cancelled", ACTOR + "-5b", "officer", "officer cancel attempt");
    assert("officer cancel should have thrown", false, "did not throw");
  } catch (e: any) {
    assert("officer cancel threw error", true, e.message);
    assert("error mentions role or not permitted", e.message.includes("role") || e.message.includes("not permitted"), `got: ${e.message}`);
  }

  // Check state did NOT change
  const caseAfterOfficerCancel = await db.case.findUnique({ where: { id: testCase.id }, select: { workflowState: true } });
  assert("Case.workflowState still=received (officer denied)", caseAfterOfficerCancel?.workflowState === "received", `got ${caseAfterOfficerCancel?.workflowState}`);

  // ── Cleanup ──
  await resetCase(testCase.id);
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
