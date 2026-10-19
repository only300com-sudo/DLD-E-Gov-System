// tests/workflow/preparation-sheet.integration.spec.ts
// Part 8B — Integration test for the preparation-sheet API.
//
// Tests:
//   1. GET returns the active template + null sheet for a fresh case
//   2. POST creates a new draft sheet with filled data
//   3. POST again updates the draft (status stays draft)
//   4. GET returns the saved sheet data
//   5. PATCH submit transitions draft → submitted (officer)
//   6. PATCH reject transitions submitted → draft (auditor) with reason
//   7. PATCH submit again → PATCH verify transitions submitted → verified (auditor)
//   8. PATCH verify fails for officer (role gate)
//   9. POST fails for submitted sheet (locked)
//  10. PATCH reopen transitions verified → draft (admin only)
//  11. GET returns "no template" for a procedure with no template seeded
//
// Run: npx tsx tests/workflow/preparation-sheet.integration.spec.ts

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

function makeReq(method: string, path: string, body: any, token: string, csrf: string): any {
  const u = new URL(path, "http://localhost:3000");
  return {
    method,
    nextUrl: u,
    url: u.toString(),
    headers: new Headers({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-CSRF-Token": csrf,
    }),
    cookies: { get: () => undefined },
    json: async () => body,
  } as any;
}

async function main() {
  console.log("=== Part 8B — Preparation Sheet API integration tests ===\n");

  // ── Setup: find a case with SALE-001 service mapping ──
  // SALE-001 has 2 services (PSR-001, PTR-002) both → SALE-001
  const service = await db.serviceCatalogItem.findFirst({
    where: { procedureCatalogId: "SALE-001" },
  });
  if (!service) {
    console.error("Setup failed: no service for SALE-001");
    process.exit(1);
  }
  const client = await db.client.findFirst({ select: { id: true } });
  if (!client) {
    console.error("Setup failed: no client");
    process.exit(1);
  }

  // Create a test case
  const ts = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const testCase = await db.case.create({
    data: {
      id: `prep-test-${ts}-${suffix}`,
      caseRef: `PREP-TEST-${ts}`,
      clientId: client.id,
      serviceId: service.id,
      status: "DRAFT",
      priority: "NORMAL",
      workflowState: "draft",
    },
    select: { id: true, caseRef: true },
  });
  console.log(`Created test case ${testCase.caseRef} (id=${testCase.id})`);

  // ── Create sessions for officer, auditor, admin ──
  const { createSession } = await import("../../src/lib/auth");
  // Query each role separately — using `take: 3` doesn't guarantee an admin
  // is in the result set, and the fallback `?? users[N]` would pick the wrong user.
  const officerUser = await db.user.findFirst({ where: { active: true, role: "TRUSTEE_OFFICER" } });
  const auditorUser = await db.user.findFirst({ where: { active: true, role: "TRUSTEE_MANAGER" } });
  const adminUser = await db.user.findFirst({ where: { active: true, role: "ADMIN" } });
  if (!officerUser || !auditorUser || !adminUser) {
    console.error(`Setup failed: need at least one of each role. officer=${!!officerUser} auditor=${!!auditorUser} admin=${!!adminUser}`);
    process.exit(1);
  }

  const officerSession = await createSession({
    id: officerUser.id, email: officerUser.email, name: officerUser.name,
    role: officerUser.role, branchId: officerUser.branchId ?? undefined,
  });
  const auditorSession = await createSession({
    id: auditorUser.id, email: auditorUser.email, name: auditorUser.name,
    role: auditorUser.role, branchId: auditorUser.branchId ?? undefined,
  });
  const adminSession = await createSession({
    id: adminUser.id, email: adminUser.email, name: adminUser.name,
    role: adminUser.role, branchId: adminUser.branchId ?? undefined,
  });

  // Load the route module
  const routeMod = await import("../../src/app/api/cases/[id]/preparation-sheet/route");

  // ── Test 1: GET returns active template + null sheet ──
  console.log("\nTest 1: GET returns active template + null sheet for fresh case");
  const getReq1 = makeReq("GET", `/api/cases/${testCase.id}/preparation-sheet`, {}, officerSession.token, officerSession.csrfToken ?? "");
  const getRes1 = await routeMod.GET(getReq1, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 200", getRes1.status === 200, `got ${getRes1.status}`);
  if (getRes1.status === 200) {
    const body = await getRes1.json();
    assert("ok = true", body.ok === true);
    assert("template is non-null", body.template !== null);
    assert("template.version = 1", body.template?.version === 1, `got ${body.template?.version}`);
    assert("template has 4 sections (property/seller/buyer/financials)", body.template?.schema?.sections?.length === 4, `got ${body.template?.schema?.sections?.length}`);
    assert("sheet is null (fresh case)", body.sheet === null, `got ${JSON.stringify(body.sheet)}`);
    assert("procedureCatalog.id = SALE-001", body.procedureCatalog?.id === "SALE-001");
  }

  // ── Test 2: POST creates new draft sheet ──
  console.log("\nTest 2: POST creates new draft sheet with filled data");
  const postData2 = {
    filledData: {
      title_deed_number: "TD-12345",
      title_deed_year: 2024,
      property_area: 1200,
      property_type: "unit",
      seller_name: "Ahmed Ali",
      seller_emirates_id: "784-1980-1234567-1",
      buyer_name: "John Smith",
      buyer_emirates_id: "784-1990-7654321-9",
      sale_value: 1500000,
      payment_method: "bank_transfer",
    },
    createIfMissing: true,
  };
  const postReq2 = makeReq("POST", `/api/cases/${testCase.id}/preparation-sheet`, postData2, officerSession.token, officerSession.csrfToken ?? "");
  const postRes2 = await routeMod.POST(postReq2, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 200", postRes2.status === 200, `got ${postRes2.status}`);
  if (postRes2.status === 200) {
    const body = await postRes2.json();
    assert("ok = true", body.ok === true);
    assert("status = draft", body.sheet?.status === "draft", `got ${body.sheet?.status}`);
    assert("sheet.id is set", !!body.sheet?.id);
  }

  // ── Test 3: POST updates the draft ──
  console.log("\nTest 3: POST updates the draft (status stays draft)");
  const postData3 = { ...postData2, filledData: { ...postData2.filledData, sale_value: 1600000 } };
  const postReq3 = makeReq("POST", `/api/cases/${testCase.id}/preparation-sheet`, postData3, officerSession.token, officerSession.csrfToken ?? "");
  const postRes3 = await routeMod.POST(postReq3, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 200", postRes3.status === 200, `got ${postRes3.status}`);
  if (postRes3.status === 200) {
    const body = await postRes3.json();
    assert("status still = draft", body.sheet?.status === "draft", `got ${body.sheet?.status}`);
  }

  // ── Test 4: GET returns the saved sheet ──
  console.log("\nTest 4: GET returns the saved sheet data");
  const getReq4 = makeReq("GET", `/api/cases/${testCase.id}/preparation-sheet`, {}, officerSession.token, officerSession.csrfToken ?? "");
  const getRes4 = await routeMod.GET(getReq4, { params: Promise.resolve({ id: testCase.id }) });
  if (getRes4.status === 200) {
    const body = await getRes4.json();
    assert("sheet is non-null now", body.sheet !== null);
    assert("sheet.status = draft", body.sheet?.status === "draft");
    assert("sheet.data.sale_value = 1600000", body.sheet?.data?.sale_value === 1600000, `got ${body.sheet?.data?.sale_value}`);
    assert("sheet.data.title_deed_number = TD-12345", body.sheet?.data?.title_deed_number === "TD-12345");
  }

  // ── Test 5: PATCH submit (officer) ──
  console.log("\nTest 5: PATCH submit transitions draft → submitted (officer)");
  const patchReq5 = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "submit" }, officerSession.token, officerSession.csrfToken ?? "");
  const patchRes5 = await routeMod.PATCH(patchReq5, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 200", patchRes5.status === 200, `got ${patchRes5.status}`);
  if (patchRes5.status === 200) {
    const body = await patchRes5.json();
    assert("status = submitted", body.sheet?.status === "submitted", `got ${body.sheet?.status}`);
    assert("submittedBy set", body.sheet?.submittedBy !== null);
    assert("submittedAt set", body.sheet?.submittedAt !== null);
  }

  // ── Test 6: POST fails for submitted sheet (locked) ──
  console.log("\nTest 6: POST fails for submitted sheet (locked)");
  const postReq6 = makeReq("POST", `/api/cases/${testCase.id}/preparation-sheet`, postData2, officerSession.token, officerSession.csrfToken ?? "");
  const postRes6 = await routeMod.POST(postReq6, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 409 (locked)", postRes6.status === 409, `got ${postRes6.status}`);

  // ── Test 7: PATCH reject (auditor) with reason ──
  console.log("\nTest 7: PATCH reject transitions submitted → draft (auditor) with reason");
  const patchReq7 = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "reject", rejectionReason: "Missing NOC letter" }, auditorSession.token, auditorSession.csrfToken ?? "");
  const patchRes7 = await routeMod.PATCH(patchReq7, { params: Promise.resolve({ id: testCase.id }) });
  assert("HTTP 200", patchRes7.status === 200, `got ${patchRes7.status}`);
  if (patchRes7.status === 200) {
    const body = await patchRes7.json();
    assert("status = draft (back to draft)", body.sheet?.status === "draft", `got ${body.sheet?.status}`);
    assert("rejectionReason set", body.sheet?.rejectionReason === "Missing NOC letter");
  }

  // ── Test 8: PATCH submit again, then verify (auditor) ──
  console.log("\nTest 8: PATCH submit again → PATCH verify transitions submitted → verified (auditor)");
  // Re-submit
  const patchReq8a = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "submit" }, officerSession.token, officerSession.csrfToken ?? "");
  await routeMod.PATCH(patchReq8a, { params: Promise.resolve({ id: testCase.id }) });
  // Verify
  const patchReq8b = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "verify" }, auditorSession.token, auditorSession.csrfToken ?? "");
  const patchRes8b = await routeMod.PATCH(patchReq8b, { params: Promise.resolve({ id: testCase.id }) });
  assert("verify HTTP 200 (auditor)", patchRes8b.status === 200, `got ${patchRes8b.status}`);
  if (patchRes8b.status === 200) {
    const body = await patchRes8b.json();
    assert("status = verified", body.sheet?.status === "verified", `got ${body.sheet?.status}`);
    assert("verifiedBy set", body.sheet?.verifiedBy !== null);
  }

  // ── Test 9: PATCH verify fails for officer (role gate) ──
  console.log("\nTest 9: PATCH verify fails for officer (role gate)");
  // Reopen first (admin only)
  const patchReq9a = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "reopen" }, adminSession.token, adminSession.csrfToken ?? "");
  const patchRes9a = await routeMod.PATCH(patchReq9a, { params: Promise.resolve({ id: testCase.id }) });
  assert("reopen HTTP 200 (admin)", patchRes9a.status === 200, `got ${patchRes9a.status}`);
  // Re-submit
  const patchReq9b = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "submit" }, officerSession.token, officerSession.csrfToken ?? "");
  await routeMod.PATCH(patchReq9b, { params: Promise.resolve({ id: testCase.id }) });
  // Officer tries to verify → should fail
  const patchReq9c = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "verify" }, officerSession.token, officerSession.csrfToken ?? "");
  const patchRes9c = await routeMod.PATCH(patchReq9c, { params: Promise.resolve({ id: testCase.id }) });
  assert("verify HTTP 403 (officer denied)", patchRes9c.status === 403, `got ${patchRes9c.status}`);

  // ── Test 10: PATCH reopen (admin only) ──
  console.log("\nTest 10: PATCH reopen transitions verified → draft (admin only)");
  // Auditor verifies again
  const patchReq10a = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "verify" }, auditorSession.token, auditorSession.csrfToken ?? "");
  await routeMod.PATCH(patchReq10a, { params: Promise.resolve({ id: testCase.id }) });
  // Officer tries to reopen → should fail
  const patchReq10b = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "reopen" }, officerSession.token, officerSession.csrfToken ?? "");
  const patchRes10b = await routeMod.PATCH(patchReq10b, { params: Promise.resolve({ id: testCase.id }) });
  assert("reopen HTTP 403 (officer denied)", patchRes10b.status === 403, `got ${patchRes10b.status}`);
  // Admin reopens
  const patchReq10c = makeReq("PATCH", `/api/cases/${testCase.id}/preparation-sheet`, { action: "reopen" }, adminSession.token, adminSession.csrfToken ?? "");
  const patchRes10c = await routeMod.PATCH(patchReq10c, { params: Promise.resolve({ id: testCase.id }) });
  assert("reopen HTTP 200 (admin)", patchRes10c.status === 200, `got ${patchRes10c.status}`);
  if (patchRes10c.status === 200) {
    const body = await patchRes10c.json();
    assert("status = draft (reopened)", body.sheet?.status === "draft", `got ${body.sheet?.status}`);
  }

  // ── Test 11: GET for case with no template (use MORT-REL-001, no template seeded) ──
  console.log("\nTest 11: GET returns null template for procedure with no template seeded");
  // Find/create a case with MORT-REL-001 (no template)
  const mortRelService = await db.serviceCatalogItem.findFirst({
    where: { procedureCatalogId: "MORT-REL-001" },
  });
  if (mortRelService) {
    const noTemplateCase = await db.case.create({
      data: {
        id: `prep-notpl-${ts}-${suffix}`,
        caseRef: `PREP-NOTPL-${ts}`,
        clientId: client.id,
        serviceId: mortRelService.id,
        status: "DRAFT",
        priority: "NORMAL",
        workflowState: "draft",
      },
    });
    const getReq11 = makeReq("GET", `/api/cases/${noTemplateCase.id}/preparation-sheet`, {}, officerSession.token, officerSession.csrfToken ?? "");
    const getRes11 = await routeMod.GET(getReq11, { params: Promise.resolve({ id: noTemplateCase.id }) });
    assert("HTTP 200 (not 404 — graceful)", getRes11.status === 200, `got ${getRes11.status}`);
    if (getRes11.status === 200) {
      const body = await getRes11.json();
      assert("ok = true", body.ok === true);
      assert("template = null", body.template === null);
      assert("message indicates no template", typeof body.message === "string");
    }
    // Cleanup
    await db.case.delete({ where: { id: noTemplateCase.id } }).catch(() => {});
  } else {
    console.log("    (skipped — no service for MORT-REL-001)");
  }

  // ── Cleanup ──
  await db.preparationSheet.deleteMany({ where: { caseId: testCase.id } }).catch(() => {});
  await db.case.delete({ where: { id: testCase.id } }).catch(() => {});
  await db.session.deleteMany({ where: { token: { in: [officerSession.token, auditorSession.token, adminSession.token] } } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
