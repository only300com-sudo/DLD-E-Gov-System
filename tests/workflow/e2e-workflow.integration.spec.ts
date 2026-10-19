// tests/workflow/e2e-workflow.integration.spec.ts
// Part 8A — End-to-end workflow test.
//
// Exercises the full happy path + denial patterns + admin override + catalog
// gate as ONE integrated test suite. Verifies:
//   1. Happy path: draft → pending_smart_app → received → requires_modification → received → cancelled
//      (transitions t-009, t-008, t-006, t-003, t-016)
//   2. Role mismatch: officer tries auditor-only transition → state unchanged,
//      denial history written, NO mixpanel event emitted
//   3. Admin override: admin fires auditor-only transition → succeeds,
//      history logs effective_role, mixpanel event carries admin_override=true
//   4. Catalog gate: SALE-001 (no smart-app in workspaceStates) blocks
//      draft → pending_smart_app transition
//
// Ported from user's vitest+Drizzle spec to existing custom runner+Prisma:
//   - vi.spyOn(mixpanel, 'track') → __setTransportForTests() spy pattern
//   - db.select().from(cases).where(eq(...)) → db.case.findUnique({...})
//   - db.insert(cases).values(...) → db.case.create({data: {...}})
//   - caseNumber field → caseRef (this schema uses caseRef)
//   - status: 'ACTIVE' → status: 'DRAFT' (CaseStatus enum, default)
//
// Run: npx tsx tests/workflow/e2e-workflow.integration.spec.ts

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

// ── Helpers ──────────────────────────────────────────────────────────────

async function currentState(caseId: string): Promise<string | null> {
  const row = await db.case.findUnique({
    where: { id: caseId },
    select: { workflowState: true },
  });
  return row?.workflowState ?? null;
}

async function getHistory(caseRef: string) {
  return db.procedureWorkflowHistory.findMany({
    where: { procedureId: caseRef },
    orderBy: { occurredAt: "asc" },
  });
}

// Create a fresh test case linked to a real client + service.
// For test isolation, also creates a temporary ServiceCatalogItem row
// pointing at the requested procedureCatalogId — the 7 legacy services
// don't cover all 103 procedures, so SALE-DEL-001 (smart-app) has no
// service mapping. We create one for the test and clean it up after.
async function makeCase(procedureCatalogId: string): Promise<{ id: string; caseRef: string; serviceId: string }> {
  // Try to find an existing service mapping for this procedure
  let service = await db.serviceCatalogItem.findFirst({
    where: { procedureCatalogId },
    select: { id: true, internalCode: true },
  });

  let createdServiceId: string | null = null;
  if (!service) {
    // Create a temporary service row for this procedure
    const ts = Date.now();
    const suffix = Math.random().toString(36).slice(2, 8);
    const internalCode = `E2E-${procedureCatalogId}-${suffix}`;
    const created = await db.serviceCatalogItem.create({
      data: {
        internalCode,
        serviceName: `[E2E TEST] ${procedureCatalogId}`,
        dldCategory: "Test",
        applicableClientTypes: "[]",
        applicablePropertyTypes: "[]",
        requiredParties: "[]",
        mandatoryDocuments: "[]",
        optionalDocuments: "[]",
        conditionalDocuments: "[]",
        procedureCatalogId,
      },
      select: { id: true },
    });
    createdServiceId = created.id;
    service = { id: created.id, internalCode };
    console.log(`  (created temporary service ${internalCode} → ${procedureCatalogId})`);
  }

  const client = await db.client.findFirst({ select: { id: true } });
  if (!client) throw new Error("No client in DB — e2e test needs at least one client");

  const ts2 = Date.now();
  const suffix2 = Math.random().toString(36).slice(2, 8);
  const id = `e2e-${ts2}-${suffix2}`;
  const caseRef = `E2E-${ts2}`;

  const created = await db.case.create({
    data: {
      id,
      caseRef,
      clientId: client.id,
      serviceId: service.id,
      status: "DRAFT",
      priority: "NORMAL",
      workflowState: "draft",
    },
    select: { id: true, caseRef: true, serviceId: true },
  });
  // Attach serviceId for cleanup tracking
  (created as any).createdServiceId = createdServiceId;
  return created;
}

// ── Mixpanel spy ──────────────────────────────────────────────────────────
//
// The user's spec used vi.spyOn(mixpanel, 'track'). Since we don't use vitest,
// we use the __setTransportForTests / __restoreTransport API. The spy records
// every call to track() so we can assert on event keys + props.
const trackCalls: { eventKey: string; props: any }[] = [];

async function main() {
  // Install spy BEFORE importing transition
  const { __setTransportForTests, __restoreTransport } = await import("../../src/lib/analytics/mixpanel");
  __setTransportForTests((eventKey: string, props: any) => {
    trackCalls.push({ eventKey, props });
  });

  // Load transition + state engine
  const { transition } = await import("../../src/lib/workflow/rt/transition");
  const { initStateEngine } = await import("../../src/lib/workflow/rt/stateEngine");
  await initStateEngine();

  console.log("=== Part 8A — End-to-end workflow tests ===\n");

  // ── Test 1: Full happy path ────────────────────────────────────────────
  console.log("Test 1: Full happy path (draft → pending_smart_app → received → requires_modification → received → cancelled)");
  trackCalls.length = 0;
  const case1 = await makeCase("SALE-DEL-001");  // SALE-DEL-001 has pending_smart_app in workspaceStates
  console.log(`  (created case ${case1.caseRef})`);

  // t-009: draft → pending_smart_app (officer, btnSendToSmartApp)
  await transition(case1.id, "pending_smart_app", "officer-1", "officer", "send to smart app");
  assert("after t-009: state = pending_smart_app", await currentState(case1.id) === "pending_smart_app", `got ${await currentState(case1.id)}`);

  // t-008: pending_smart_app → received (system)
  await transition(case1.id, "received", "system", "system", "smart app submission received");
  assert("after t-008: state = received", await currentState(case1.id) === "received", `got ${await currentState(case1.id)}`);

  // t-006: received → requires_modification (auditor)
  await transition(case1.id, "requires_modification", "auditor-1", "auditor", "Missing SPA page 3");
  assert("after t-006: state = requires_modification", await currentState(case1.id) === "requires_modification", `got ${await currentState(case1.id)}`);

  // t-003: requires_modification → received (officer resends)
  await transition(case1.id, "received", "officer-1", "officer", "resubmitting after fix");
  assert("after t-003: state = received", await currentState(case1.id) === "received", `got ${await currentState(case1.id)}`);

  // t-016: received → cancelled (admin)
  await transition(case1.id, "cancelled", "admin-1", "admin", "Client withdrew");
  assert("after t-016: state = cancelled", await currentState(case1.id) === "cancelled", `got ${await currentState(case1.id)}`);

  // History assertions
  const history1 = await getHistory(case1.caseRef);
  assert("history has 5 rows", history1.length === 5, `got ${history1.length}`);

  const transitionIds1 = history1.map(h => h.transitionId).filter(Boolean).sort();
  const expectedIds = ["t-003", "t-006", "t-008", "t-009", "t-016"].sort();
  assert("transition IDs match [t-003, t-006, t-008, t-009, t-016]",
    JSON.stringify(transitionIds1) === JSON.stringify(expectedIds),
    `got ${JSON.stringify(transitionIds1)}`);

  // Mixpanel emission — 5 events
  assert("5 mixpanel events emitted", trackCalls.length === 5, `got ${trackCalls.length}`);

  const eventNames1 = trackCalls.map(c => c.eventKey).sort();
  const expectedEvents = [
    "notification_received",          // t-008
    "procedure_cancelled",            // t-016
    "procedure_returned",             // t-006
    "procedure_sent_to_smart_app",    // t-009
    "returned_procedure_resubmitted", // t-003
  ].sort();
  assert("event keys match expected set",
    JSON.stringify(eventNames1) === JSON.stringify(expectedEvents),
    `got ${JSON.stringify(eventNames1)}`);

  // Every event carries system_source: 'PORTAL'
  let allHaveSource = true;
  for (const call of trackCalls) {
    if (call.props.system_source !== "PORTAL") {
      allHaveSource = false;
      console.error(`    ✗ event ${call.eventKey} missing system_source (got ${call.props.system_source})`);
    }
  }
  assert("all 5 events carry system_source='PORTAL'", allHaveSource);

  // ── Test 2: Role mismatch ──────────────────────────────────────────────
  console.log("\nTest 2: Role mismatch — officer tries auditor-only transition (received → requires_modification)");
  trackCalls.length = 0;
  const case2 = await makeCase("SALE-DEL-001");
  console.log(`  (created case ${case2.caseRef})`);

  // Setup: move to received (officer can do draft → received via t-002)
  await transition(case2.id, "received", "officer-2", "officer", "setup for test 2");
  const beforeCount = trackCalls.length;

  // Officer tries auditor-only transition (t-006 requires auditor)
  let threw = false;
  let errMsg = "";
  try {
    await transition(case2.id, "requires_modification", "officer-2", "officer", "should be denied");
  } catch (e: any) {
    threw = true;
    errMsg = e.message;
  }
  assert("transition threw (denied)", threw, `error: ${errMsg}`);
  assert("error mentions role or 'not permitted'", errMsg.includes("role") || errMsg.includes("not permitted"), `got: ${errMsg}`);

  // State unchanged
  assert("state still = received (no change)", await currentState(case2.id) === "received", `got ${await currentState(case2.id)}`);

  // No new mixpanel event emitted
  assert("no new mixpanel event on denial", trackCalls.length === beforeCount, `before=${beforeCount}, after=${trackCalls.length}`);

  // Denial history written
  const history2 = await getHistory(case2.caseRef);
  const denial = history2.find(h => h.reason?.includes("denied"));
  assert("denial history row exists", !!denial, `history rows: ${history2.length}`);
  if (denial) {
    assert("denial fromState = received", denial.fromState === "received", `got ${denial.fromState}`);
    assert("denial toState = received (no change)", denial.toState === "received", `got ${denial.toState}`);
  }

  // ── Test 3: Admin override ─────────────────────────────────────────────
  console.log("\nTest 3: Admin override — admin fires auditor-only transition (received → requires_modification)");
  trackCalls.length = 0;
  const case3 = await makeCase("SALE-DEL-001");
  console.log(`  (created case ${case3.caseRef})`);

  // Setup: move to received
  await transition(case3.id, "received", "officer-3", "officer", "setup for test 3");
  const beforeCount3 = trackCalls.length;

  // Admin fires auditor-only transition (t-006 — should succeed with admin_override)
  await transition(case3.id, "requires_modification", "admin-1", "admin", "Compliance hold");

  // History row for admin action should mention admin_override + acting as auditor
  const history3 = await getHistory(case3.caseRef);
  const adminRow = history3.find(h => h.actorUserId === "admin-1");
  assert("admin history row exists", !!adminRow, `history rows: ${history3.length}`);
  if (adminRow) {
    assert("admin reason contains 'admin_override'", adminRow.reason?.includes("admin_override"), `got: ${adminRow.reason}`);
    assert("admin reason contains 'acting as auditor'", adminRow.reason?.includes("acting as auditor"), `got: ${adminRow.reason}`);
  }

  // Mixpanel: 1 new event with admin_override=true
  assert("1 new mixpanel event after admin override", trackCalls.length === beforeCount3 + 1, `before=${beforeCount3}, after=${trackCalls.length}`);

  if (trackCalls.length > beforeCount3) {
    const lastCall = trackCalls[trackCalls.length - 1];
    assert("event key = procedure_returned", lastCall.eventKey === "procedure_returned", `got ${lastCall.eventKey}`);
    assert("props.admin_override = true", lastCall.props.admin_override === true, `got ${lastCall.props.admin_override}`);
    assert("props.effective_role = auditor", lastCall.props.effective_role === "auditor", `got ${lastCall.props.effective_role}`);
  }

  // ── Test 4: Catalog gate ───────────────────────────────────────────────
  console.log("\nTest 4: Catalog gate — SALE-001 (no smart-app in workspaceStates) blocks draft → pending_smart_app");
  trackCalls.length = 0;
  const case4 = await makeCase("SALE-001");  // SALE-001 does NOT have pending_smart_app
  console.log(`  (created case ${case4.caseRef})`);

  let threw4 = false;
  let errMsg4 = "";
  try {
    await transition(case4.id, "pending_smart_app", "officer-4", "officer", "should be catalog-denied");
  } catch (e: any) {
    threw4 = true;
    errMsg4 = e.message;
  }
  assert("transition threw (catalog denial)", threw4, `error: ${errMsg4}`);
  assert("error mentions 'catalog disallows'", errMsg4.includes("catalog disallows"), `got: ${errMsg4}`);

  // State unchanged
  assert("state still = draft (catalog gate blocked)", await currentState(case4.id) === "draft", `got ${await currentState(case4.id)}`);

  // History: 1 denial row
  const history4 = await getHistory(case4.caseRef);
  assert("history has 1 row (denial)", history4.length === 1, `got ${history4.length}`);
  if (history4.length === 1) {
    assert("denial reason mentions 'catalog disallows'",
      history4[0].reason?.includes("catalog disallows"),
      `got: ${history4[0].reason}`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  // Delete all test cases + their history + any temporary services created
  for (const c of [case1, case2, case3, case4]) {
    await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: c.caseRef } }).catch(() => {});
    await db.case.delete({ where: { id: c.id } }).catch(() => {});
    // If we created a temporary service for this case, delete it now
    if ((c as any).createdServiceId) {
      await db.serviceCatalogItem.delete({ where: { id: (c as any).createdServiceId } }).catch(() => {});
    }
  }

  // Restore the mixpanel transport
  __restoreTransport();

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
