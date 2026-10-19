// tests/workflow/bulk-active-guard.integration.spec.ts
// Part 7 Review / Critical Gap 3 — Test that the bulk-active in-use guard works.
//
// Verifies:
//   1. Deactivating a procedure that has ACTIVE cases (workflowState not terminal)
//      is blocked with HTTP 409.
//   2. Activating the same procedure succeeds (no in-use guard on activation).
//   3. Deactivating a procedure whose cases are ALL terminal (completed,
//      cancelled, rejected) succeeds — the guard only blocks live cases.
//   4. The guard uses Prisma-native `in` operator (no raw SQL ANY($1))
//      — runs identically on SQLite and PostgreSQL.
//
// Calls the route handler DIRECTLY (no live dev server) — same pattern as
// the Gap 4 regression refactor.

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

// Construct a NextRequest-like object the route handler can accept.
function makeReq(method: string, url: string, body: any, headers: Record<string, string> = {}): any {
  const u = new URL(url, "http://localhost:3000");
  return {
    method,
    nextUrl: u,
    url: u.toString(),
    headers: new Headers(headers),
    json: async () => body,
    cookies: { get: () => undefined },
  } as any;
}

async function main() {
  console.log("=== Bulk-active in-use guard integration tests ===\n");

  // ── Setup: find (or create) a test procedure + a test case ──
  // Use an existing P1 procedure that we can safely toggle.
  const testProcedure = await db.procedureCatalog.findFirst({
    where: { id: "SALE-001" },
  });
  if (!testProcedure) {
    console.error("Setup failed: SALE-001 not found in ProcedureCatalog");
    process.exit(1);
  }

  // Find (or create) a case with serviceId pointing at a service that maps to SALE-001.
  // We can reuse an existing case for the test — we'll restore its state afterward.
  const service = await db.serviceCatalogItem.findFirst({
    where: { procedureCatalogId: "SALE-001" },
  });
  if (!service) {
    console.error("Setup failed: no ServiceCatalogItem maps to SALE-001 (run scripts/migrate-service-to-catalog.ts first)");
    process.exit(1);
  }

  // Find an existing case using this service
  let testCase = await db.case.findFirst({
    where: { serviceId: service.id },
    select: { id: true, caseRef: true, workflowState: true, status: true, serviceId: true },
  });
  if (!testCase) {
    console.error("Setup failed: no Case uses this service. The guard test requires at least one case linked to SALE-001.");
    process.exit(1);
  }

  console.log(`Using procedure: ${testProcedure.id} (isActive=${testProcedure.isActive})`);
  console.log(`Using test case:  ${testCase.caseRef} (workflowState=${testCase.workflowState})\n`);

  // Save original state for restoration
  const originalWorkflowState = testCase.workflowState;
  const originalIsActive = testProcedure.isActive;

  // ── Load the route handler module ──
  // We import the route module directly and call its PATCH function.
  // This avoids the HTTP layer entirely (Gap 4 pattern).
  const routeModule = await import("../../src/app/api/procedures/catalog/bulk-active/route");
  const PATCH = routeModule.PATCH;

  // ── Test 1: Deactivation blocked when case is ACTIVE ──
  console.log("Test 1: Deactivation blocked when case has active workflowState");
  // Set the case to "received" (active, not terminal)
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: "received" } });

  // We need an admin user to satisfy requireRole. The PATCH handler uses
  // getUserFromToken — we need to either seed a session OR mock it. Since the
  // route uses getUserFromToken which does a DB lookup, we'll seed a real
  // session token via the existing createSession helper.
  const { createSession } = await import("../../src/lib/auth");
  const adminUser = await db.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (!adminUser) {
    console.error("Setup failed: no active admin user in DB");
    process.exit(1);
  }
  const session = await createSession({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
    branchId: adminUser.branchId ?? undefined,
  });

  const req1 = makeReq(
    "PATCH",
    "http://localhost:3000/api/procedures/catalog/bulk-active",
    { ids: ["SALE-001"], isActive: false },
    {
      "authorization": `Bearer ${session.token}`,
      "x-csrf-token": session.csrfToken ?? "",
      "content-type": "application/json",
    },
  );
  const res1 = await PATCH(req1);
  assert("HTTP status = 409 (blocked)", res1.status === 409, `got ${res1.status}`);
  if (res1.status === 409) {
    const body = await res1.json();
    assert("error mentions active cases", body.error?.includes("active cases"), `got: ${body.error}`);
    assert("inUse array contains SALE-001", Array.isArray(body.inUse) && body.inUse.includes("SALE-001"), `got: ${JSON.stringify(body.inUse)}`);
    assert("affectedCaseCount >= 1", (body.affectedCaseCount ?? 0) >= 1, `got: ${body.affectedCaseCount}`);
  }

  // Verify the procedure was NOT deactivated
  const procAfter1 = await db.procedureCatalog.findUnique({ where: { id: "SALE-001" }, select: { isActive: true } });
  assert("Procedure NOT deactivated (still active or unchanged)", procAfter1?.isActive !== false, `isActive=${procAfter1?.isActive}`);

  // ── Test 2: Activation succeeds (no in-use guard on activation) ──
  console.log("\nTest 2: Activation succeeds (no in-use guard)");
  // First, mark the procedure inactive so we have something to activate
  await db.procedureCatalog.update({ where: { id: "SALE-001" }, data: { isActive: false } });

  const req2 = makeReq(
    "PATCH",
    "http://localhost:3000/api/procedures/catalog/bulk-active",
    { ids: ["SALE-001"], isActive: true },
    {
      "authorization": `Bearer ${session.token}`,
      "x-csrf-token": session.csrfToken ?? "",
      "content-type": "application/json",
    },
  );
  const res2 = await PATCH(req2);
  assert("HTTP status = 200", res2.status === 200, `got ${res2.status}`);
  if (res2.status === 200) {
    const body = await res2.json();
    assert("ok = true", body.ok === true);
    assert("updated = 1", body.updated === 1, `got ${body.updated}`);
    // Verify the DB was updated
    const procAfter2 = await db.procedureCatalog.findUnique({ where: { id: "SALE-001" }, select: { isActive: true } });
    assert("Procedure isActive = true in DB", procAfter2?.isActive === true, `isActive=${procAfter2?.isActive}`);
  }

  // ── Test 3: Deactivation succeeds when ALL cases are terminal ──
  console.log("\nTest 3: Deactivation succeeds when all SALE-001 cases are terminal (completed)");
  // Set ALL cases using ANY service that maps to SALE-001 to "completed".
  // Multiple services may map to the same procedure (e.g. PSR-001 and PTR-002
  // both → SALE-001). The guard checks ALL of them.
  const allServicesForSale001 = await db.serviceCatalogItem.findMany({
    where: { procedureCatalogId: "SALE-001" },
    select: { id: true, internalCode: true },
  });
  console.log(`  (${allServicesForSale001.length} services map to SALE-001: ${allServicesForSale001.map(s => s.internalCode).join(", ")})`);
  const allCases = await db.case.findMany({
    where: { serviceId: { in: allServicesForSale001.map(s => s.id) } },
    select: { id: true, caseRef: true },
  });
  console.log(`  (Found ${allCases.length} cases using these services — setting all to completed)`);
  for (const c of allCases) {
    await db.case.update({ where: { id: c.id }, data: { workflowState: "completed" } });
  }

  // Make the procedure active first so we can test deactivation
  await db.procedureCatalog.update({ where: { id: "SALE-001" }, data: { isActive: true } });

  const req3 = makeReq(
    "PATCH",
    "http://localhost:3000/api/procedures/catalog/bulk-active",
    { ids: ["SALE-001"], isActive: false },
    {
      "authorization": `Bearer ${session.token}`,
      "x-csrf-token": session.csrfToken ?? "",
      "content-type": "application/json",
    },
  );
  const res3 = await PATCH(req3);
  assert("HTTP status = 200 (not blocked)", res3.status === 200, `got ${res3.status}`);
  if (res3.status === 200) {
    const body = await res3.json();
    assert("ok = true", body.ok === true);
    assert("updated = 1", body.updated === 1, `got ${body.updated}`);
    const procAfter3 = await db.procedureCatalog.findUnique({ where: { id: "SALE-001" }, select: { isActive: true } });
    assert("Procedure isActive = false in DB", procAfter3?.isActive === false, `isActive=${procAfter3?.isActive}`);
  }

  // ── Test 4: Same tests for "cancelled" and "rejected" terminal states ──
  console.log("\nTest 4: Deactivation succeeds for 'cancelled' and 'rejected' terminal cases");
  for (const terminalState of ["cancelled", "rejected"]) {
    // Reset procedure + set ALL cases to this terminal state
    await db.procedureCatalog.update({ where: { id: "SALE-001" }, data: { isActive: true } });
    for (const c of allCases) {
      await db.case.update({ where: { id: c.id }, data: { workflowState: terminalState } });
    }

    const reqTerm = makeReq(
      "PATCH",
      "http://localhost:3000/api/procedures/catalog/bulk-active",
      { ids: ["SALE-001"], isActive: false },
      {
        "authorization": `Bearer ${session.token}`,
        "x-csrf-token": session.csrfToken ?? "",
        "content-type": "application/json",
      },
    );
    const resTerm = await PATCH(reqTerm);
    assert(`HTTP 200 when all cases are ${terminalState}`, resTerm.status === 200, `got ${resTerm.status} for ${terminalState}`);
  }

  // ── Test 5: Verify the guard uses Prisma-native operators (no raw SQL) ──
  console.log("\nTest 5: Route source uses Prisma-native in/notIn (no raw SQL ANY)");
  const fs = await import("fs");
  const routeSource = fs.readFileSync(
    "/home/z/my-project/src/app/api/procedures/catalog/bulk-active/route.ts",
    "utf-8",
  );
  // Strip comments before checking (so a comment mentioning "ANY($1)" as a
  // warning doesn't false-positive). Simple strip: remove lines starting with //
  // and block content between /* */.
  const stripped = routeSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*/gm, "");
  assert("route uses `in: body.ids` operator", stripped.includes("in: body.ids"), "expected Prisma `in:` operator");
  assert("route uses `notIn: [...TERMINAL_WORKFLOW_STATES]` operator", stripped.includes("notIn: [...TERMINAL_WORKFLOW_STATES]"), "expected Prisma `notIn:` operator");
  assert("route does NOT use raw SQL ANY($1) in code", !stripped.includes("ANY($1)"), "raw SQL ANY($1) found in actual code — should use Prisma in instead");
  assert("route does NOT use db.$executeRaw in code", !stripped.includes("$executeRaw"), "$executeRaw found in actual code — should use Prisma query builder");

  // ── Cleanup: restore original state ──
  // Restore each case's workflowState individually
  await db.case.update({ where: { id: testCase.id }, data: { workflowState: originalWorkflowState } });
  // For the other cases, set them back to "draft" (the safest non-terminal state)
  for (const c of allCases) {
    if (c.id !== testCase.id) {
      await db.case.update({ where: { id: c.id }, data: { workflowState: "draft" } });
    }
  }
  await db.procedureCatalog.update({ where: { id: "SALE-001" }, data: { isActive: originalIsActive } });

  // Clean up the test session
  await db.session.deleteMany({ where: { token: session.token } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
