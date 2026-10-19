// tests/workflow/dld-manifest.integration.spec.ts
// Part 9.2 — Integration tests for the DLD Submission Manifest endpoint.
//
// 5 tests:
//   1. Complete sale case → manifest with all fields + 4% DLD fee
//   2. Complete grant case → 0.125% + AED 2,000 floor
//   3. Complete mortgage case → 0.25% (NOT 0.4%)
//   4. Incomplete case (no prep sheet) → manifest still generated, fees empty
//   5. Unauthorized → HTTP 401
//
// Calls route handlers DIRECTLY (no live dev server needed).

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

function makeReq(method: string, path: string, token: string): any {
  const u = new URL(path, "http://localhost:3000");
  return {
    method,
    nextUrl: u,
    url: u.toString(),
    headers: new Headers({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    cookies: { get: () => undefined },
    json: async () => ({}),
  } as any;
}

async function createTestCase(procedureCatalogId: string, prepSheetData?: Record<string, any>): Promise<{ id: string; caseRef: string }> {
  // Find or create a service mapping for this procedure
  let service = await db.serviceCatalogItem.findFirst({
    where: { procedureCatalogId },
    select: { id: true },
  });
  if (!service) {
    const created = await db.serviceCatalogItem.create({
      data: {
        internalCode: `E2E-MANIFEST-${procedureCatalogId}-${Date.now()}`,
        serviceName: `[E2E MANIFEST] ${procedureCatalogId}`,
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
    service = created;
  }

  const client = await db.client.findFirst({ select: { id: true } });
  if (!client) throw new Error("No client in DB");

  const ts = Date.now();
  const suffix = Math.random().toString(36).slice(2, 6);
  const created = await db.case.create({
    data: {
      id: `manifest-${ts}-${suffix}`,
      caseRef: `MANIFEST-${ts}`,
      clientId: client.id,
      serviceId: service.id,
      status: "DRAFT",
      priority: "NORMAL",
      workflowState: "draft",
    },
    select: { id: true, caseRef: true },
  });

  // If prep sheet data is provided, create a prep sheet
  if (prepSheetData) {
    const template = await db.preparationSheetTemplate.findFirst({
      where: { procedureCatalogId, isActive: true },
      select: { id: true },
    });
    if (template) {
      await db.preparationSheet.create({
        data: {
          caseId: created.id,
          templateId: template.id,
          filledDataJson: JSON.stringify(prepSheetData),
          status: "submitted",
          submittedBy: "test",
          submittedAt: new Date(),
        },
      });
    }
  }

  return created;
}

async function main() {
  console.log("=== Part 9.2 — DLD Submission Manifest tests ===\n");

  // Setup: create admin session
  const { createSession } = await import("../../src/lib/auth");
  const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (!admin) { console.error("Setup failed: no admin"); process.exit(1); }
  const session = await createSession({
    id: admin.id, email: admin.email, name: admin.name,
    role: admin.role, branchId: admin.branchId ?? undefined,
  });

  // Load route handler
  const manifestMod = await import("../../src/app/api/cases/[id]/dld-manifest/route");

  // ── Test 1: Complete sale case → 4% DLD fee ──
  console.log("Test 1: Complete sale case (SALE-001) → manifest with 4% DLD fee");
  const saleCase = await createTestCase("SALE-001", {
    sale_value: 1_000_000,          // AED 1M
    payment_method: "bank_transfer",
    title_deed_number: "TD-12345",
    property_type: "unit",
  });
  console.log(`  (created case ${saleCase.caseRef})`);

  const req1 = makeReq("GET", `/api/cases/${saleCase.id}/dld-manifest?format=json`, session.token);
  const res1 = await manifestMod.GET(req1, { params: Promise.resolve({ id: saleCase.id }) });
  assert("HTTP 200", res1.status === 200, `got ${res1.status}`);

  if (res1.status === 200) {
    const body = await res1.json();
    const m = body.manifest;
    assert("manifest has case_ref", m.case_ref === saleCase.caseRef);
    assert("manifest has procedure.id = SALE-001", m.procedure.id === "SALE-001");
    assert("manifest has procedure.name_en", !!m.procedure.name_en);
    assert("manifest has parties array", Array.isArray(m.parties) && m.parties.length > 0);
    assert("manifest has financials.fees array", Array.isArray(m.financials.fees));
    assert("manifest has financials.total_fees", typeof m.financials.total_fees === "number");

    // Verify the DLD_REGISTRATION_SALE fee = 4% = 40,000 AED
    const dldFee = m.financials.fees.find((f: any) => f.code === "DLD_REGISTRATION_SALE");
    assert("DLD_REGISTRATION_SALE fee present", !!dldFee);
    if (dldFee) {
      assert("DLD_REGISTRATION_SALE baseAmount = 40,000 (4% of 1M)", dldFee.baseAmount === 40000, `got ${dldFee.baseAmount}`);
      assert("DLD_REGISTRATION_SALE NOT 4,000 (would be 0.4% rate)", dldFee.baseAmount !== 4000);
    }

    assert("manifest has preparation_sheet", m.preparation_sheet !== null);
    assert("prep sheet status = submitted", m.preparation_sheet?.status === "submitted");
    assert("manifest has documents array", Array.isArray(m.documents));
    assert("manifest has biometric_verifications array", Array.isArray(m.biometric_verifications));
    assert("manifest has generated_at", !!m.generated_at);
  }

  // ── Test 2: Complete grant case → 0.125% + floor AED 2,000 ──
  console.log("\nTest 2: Complete grant case (GRANT-001) → 0.125% with floor AED 2,000");
  const grantCase = await createTestCase("GRANT-001", {
    property_value: 1_000_000,       // AED 1M → 0.125% = 1,250 < floor 2,000 → floor applies
  });
  const req2 = makeReq("GET", `/api/cases/${grantCase.id}/dld-manifest`, session.token);
  const res2 = await manifestMod.GET(req2, { params: Promise.resolve({ id: grantCase.id }) });
  assert("HTTP 200", res2.status === 200, `got ${res2.status}`);

  if (res2.status === 200) {
    const body = await res2.json();
    const m = body.manifest;
    assert("procedure.id = GRANT-001", m.procedure.id === "GRANT-001");
    const giftFee = m.financials.fees.find((f: any) => f.code === "DLD_REGISTRATION_GIFT");
    assert("DLD_REGISTRATION_GIFT fee present", !!giftFee);
    if (giftFee) {
      // 0.125% of 1M = 1,250 < floor 2,000 → floor applies → 2,000
      assert("DLD_REGISTRATION_GIFT baseAmount = 2,000 (floor applies)", giftFee.baseAmount === 2000, `got ${giftFee.baseAmount}`);
      assert("DLD_REGISTRATION_GIFT NOT 1,250 (would be without floor)", giftFee.baseAmount !== 1250);
      assert("DLD_REGISTRATION_GIFT NOT 40,000 (would be 4% — wrong rate)", giftFee.baseAmount !== 40000);
    }
  }

  // ── Test 3: Complete mortgage case → 0.25% (NOT 0.4%) ──
  console.log("\nTest 3: Complete mortgage case (MORT-REG-001) → 0.25% (NOT 0.4%)");
  const mortCase = await createTestCase("MORT-REG-001", {
    mortgage_amount: 1_000_000,      // AED 1M → 0.25% = 2,500
  });
  const req3 = makeReq("GET", `/api/cases/${mortCase.id}/dld-manifest`, session.token);
  const res3 = await manifestMod.GET(req3, { params: Promise.resolve({ id: mortCase.id }) });
  assert("HTTP 200", res3.status === 200, `got ${res3.status}`);

  if (res3.status === 200) {
    const body = await res3.json();
    const m = body.manifest;
    assert("procedure.id = MORT-REG-001", m.procedure.id === "MORT-REG-001");
    const mortFee = m.financials.fees.find((f: any) => f.code === "DLD_REGISTRATION_MORTGAGE");
    assert("DLD_REGISTRATION_MORTGAGE fee present", !!mortFee);
    if (mortFee) {
      // 0.25% of 1M = 2,500 (NOT 4,000 which would be 0.4%)
      assert("DLD_REGISTRATION_MORTGAGE baseAmount = 2,500 (0.25%)", mortFee.baseAmount === 2500, `got ${mortFee.baseAmount}`);
      assert("DLD_REGISTRATION_MORTGAGE NOT 4,000 (would be 0.4% — wrong rate)", mortFee.baseAmount !== 4000);
    }
  }

  // ── Test 4: Incomplete case (no prep sheet) → manifest still generated ──
  console.log("\nTest 4: Incomplete case (no prep sheet) → manifest generated with empty fees");
  const incompleteCase = await createTestCase("SALE-001", undefined); // no prep sheet
  const req4 = makeReq("GET", `/api/cases/${incompleteCase.id}/dld-manifest`, session.token);
  const res4 = await manifestMod.GET(req4, { params: Promise.resolve({ id: incompleteCase.id }) });
  assert("HTTP 200 (incomplete case still works)", res4.status === 200, `got ${res4.status}`);

  if (res4.status === 200) {
    const body = await res4.json();
    const m = body.manifest;
    assert("manifest has case_ref", !!m.case_ref);
    assert("manifest has procedure", !!m.procedure);
    assert("preparation_sheet = null (no prep sheet)", m.preparation_sheet === null);
    assert("financials.fees is array (may be empty)", Array.isArray(m.financials.fees));
    // Without a prep sheet, sale_value is null → percentage fees have no base → 0 AED
    // But fixed fees (KNOWLEDGE_FEE, INNOVATION_FEE, DUBAI_MUNI_MAP) should still appear
    const fixedFees = m.financials.fees.filter((f: any) => f.baseAmount > 0);
    assert("at least 1 fixed fee appears (knowledge/innovation/map)", fixedFees.length > 0, `got ${fixedFees.length} fees with baseAmount > 0`);
  }

  // ── Test 5: Unauthorized → HTTP 401 ──
  console.log("\nTest 5: Unauthorized (no token) → HTTP 401");
  const req5 = makeReq("GET", `/api/cases/${saleCase.id}/dld-manifest`, "");
  // Override the Authorization header to be empty
  (req5 as any).headers = new Headers({ "Content-Type": "application/json" });
  const res5 = await manifestMod.GET(req5, { params: Promise.resolve({ id: saleCase.id }) });
  assert("HTTP 401 (Unauthorized)", res5.status === 401, `got ${res5.status}`);

  // ── Bonus: CSV format test ──
  console.log("\nBonus: CSV format — verify CSV matches JSON data");
  const reqCsv = makeReq("GET", `/api/cases/${saleCase.id}/dld-manifest?format=csv`, session.token);
  const resCsv = await manifestMod.GET(reqCsv, { params: Promise.resolve({ id: saleCase.id }) });
  assert("CSV: HTTP 200", resCsv.status === 200, `got ${resCsv.status}`);
  if (resCsv.status === 200) {
    const csvText = await resCsv.text();
    assert("CSV has Content-Type text/csv", resCsv.headers.get("content-type")?.includes("text/csv"));
    assert("CSV contains case_ref field", csvText.includes("case_ref"));
    assert("CSV contains procedure_id field", csvText.includes("procedure_id"));
    assert("CSV contains sale_value field", csvText.includes("sale_value"));
    assert("CSV contains fee_DLD_REGISTRATION_SALE_base field", csvText.includes("fee_DLD_REGISTRATION_SALE_base"));
    assert("CSV has the case ref value", csvText.includes(saleCase.caseRef));
  }

  // ── Cleanup ──
  for (const c of [saleCase, grantCase, mortCase, incompleteCase]) {
    await db.preparationSheet.deleteMany({ where: { caseId: c.id } }).catch(() => {});
    await db.procedureWorkflowHistory.deleteMany({ where: { procedureId: c.caseRef } }).catch(() => {});
    await db.case.delete({ where: { id: c.id } }).catch(() => {});
  }
  await db.session.deleteMany({ where: { token: session.token } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
