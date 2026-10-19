// tests/workflow/mixpanel-emission.integration.spec.ts
// Part 7 / Issue 4 — Tests that the canonical Mixpanel event keys actually fire
// on state transitions. The event keys are defined in mixpanel_event_map, but
// without these tests nothing confirms they're read and emitted.
//
// Strategy: use the `__setTransportForTests` API on the mixpanel module to
// install a spy that records every call. The transition module reads `track`
// at module load time, but because track dispatches through the swappable
// `_transport` variable, the spy receives every call.
//
// Run: npx tsx tests/workflow/mixpanel-emission.integration.spec.ts

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

// Capture every call to track() so we can assert on the args.
const trackCalls: { eventKey: string; props: any }[] = [];

async function main() {
  // Install the spy BEFORE the first transition() call. The mixpanel module's
  // `track()` dispatches through `_transport`, so once the spy is installed,
  // every subsequent call goes through our recorder.
  const { __setTransportForTests, __restoreTransport } = await import("../../src/lib/analytics/mixpanel");
  __setTransportForTests((eventKey: string, props: any) => {
    trackCalls.push({ eventKey, props });
  });

  // Now load the transition module. It imports `track` from the mixpanel module
  // at load time — but `track` itself dispatches through the swappable
  // transport, so our spy receives every call.
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

  const ACTOR = "test-mixpanel-user";

  console.log("=== transition() — Mixpanel Emission Tests ===\n");
  console.log(`Using case: ${testCase.caseRef}\n`);

  // ── Test 1: emits procedure_submitted_to_tabu on draft → not_received ──
  // Per Part 6 spec: t-001 fires "procedure_submitted_to_tabu" on draft → not_received.
  console.log("Test 1: emits procedure_submitted_to_tabu on draft → not_received (officer)");
  trackCalls.length = 0;
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: "draft" } });
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    const r = await transition(testCase.id, "not_received", ACTOR + "-1", "officer", "emission test 1");
    assert("transition succeeded", true, `from=${r.fromState} to=${r.toState}`);

    assert("track was called exactly once", trackCalls.length === 1, `got ${trackCalls.length} calls`);
    if (trackCalls.length >= 1) {
      const call = trackCalls[0];
      assert("event key = procedure_submitted_to_tabu", call.eventKey === "procedure_submitted_to_tabu", `got ${call.eventKey}`);
      assert("props.procedure_id = caseRef", call.props.procedure_id === testCase.caseRef, `got ${call.props.procedure_id}`);
      assert("props.actor_user_id = ACTOR-1", call.props.actor_user_id === ACTOR + "-1", `got ${call.props.actor_user_id}`);
      assert("props.actor_role = officer", call.props.actor_role === "officer", `got ${call.props.actor_role}`);
      assert("props.from_state = draft", call.props.from_state === "draft", `got ${call.props.from_state}`);
      assert("props.to_state = not_received", call.props.to_state === "not_received", `got ${call.props.to_state}`);
      assert("props.transition_id is set", typeof call.props.transition_id === "string", `got ${call.props.transition_id}`);
      assert("no admin_override on officer transition", call.props.admin_override !== true, "should not be set");
    }
  } catch (e: any) {
    assert("transition succeeded", false, e.message);
  }

  // ── Test 2: does NOT emit on role denial ──
  console.log("\nTest 2: does NOT emit on role denial (officer tries auditor-only transition)");
  trackCalls.length = 0;
  // Move to received first (officer can do this)
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: "received" } });
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    // Officer tries received → requires_modification (auditor-only per t-006)
    await transition(testCase.id, "requires_modification", ACTOR + "-2", "officer", "should be denied");
    assert("transition should have thrown", false, "did not throw");
  } catch (e: any) {
    assert("transition threw (denied)", true, e.message);
    assert("track was NOT called", trackCalls.length === 0, `got ${trackCalls.length} calls (should be 0)`);
  }

  // ── Test 3: emits with admin_override marker when admin bypasses role ──
  console.log("\nTest 3: emits with admin_override marker when admin bypasses role");
  trackCalls.length = 0;
  // Reset to received state, clear history
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: "received" } });
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  try {
    const r = await transition(testCase.id, "requires_modification", ACTOR + "-3", "admin", "admin override emission test");
    assert("admin transition succeeded", true, `from=${r.fromState} to=${r.toState}`);

    assert("track was called exactly once", trackCalls.length === 1, `got ${trackCalls.length} calls`);
    if (trackCalls.length >= 1) {
      const call = trackCalls[0];
      // The event key for received → requires_modification is "procedure_returned"
      assert("event key = procedure_returned", call.eventKey === "procedure_returned", `got ${call.eventKey}`);
      assert("props.admin_override = true", call.props.admin_override === true, `got ${call.props.admin_override}`);
      assert("props.effective_role = auditor", call.props.effective_role === "auditor", `got ${call.props.effective_role}`);
      assert("props.actor_role = admin", call.props.actor_role === "admin", `got ${call.props.actor_role}`);
      assert("props.from_state = received", call.props.from_state === "received", `got ${call.props.from_state}`);
      assert("props.to_state = requires_modification", call.props.to_state === "requires_modification", `got ${call.props.to_state}`);
    }
  } catch (e: any) {
    assert("admin transition succeeded", false, e.message);
  }

  // ── Cleanup ──
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: "draft" } });
  await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: testCase.caseRef } }).catch(() => {});

  // Restore the original transport
  __restoreTransport();

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
