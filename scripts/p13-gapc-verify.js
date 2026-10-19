// P13 Gap C — verify Mode B (DLD API) end-to-end with a stub DLD base URL.
// Steps:
// 1. Login as admin
// 2. Find an Ejari case with status != certificate_issued
// 3. PATCH the case to set mode=dld_api (so we test the real Mode B path)
// 4. POST /api/ejari/cases/{id}/dld-register with contract data
// 5. Capture: outbound request JSON (via /mock-dld/ejari/register response), the
//    resulting EjariCase row with dldReference set + certificate_issued status
// 6. Print everything
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// 1. Login
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const login = await loginR.json();
const token = login.token;
const csrfToken = login.csrfToken;
console.log(`Logged in: ${login.user.name} (${login.user.role})`);
console.log(`CSRF token: ${csrfToken.slice(0, 12)}...`);

// 2. Pick an Ejari case
const ejariCase = await db.ejariCase.findFirst({
  where: { status: { not: "certificate_issued" } },
  orderBy: { createdAt: "desc" },
});
if (!ejariCase) throw new Error("No Ejari case available for testing");
console.log(`\nEjari case: ${ejariCase.caseNumber} (id=${ejariCase.id})`);
console.log(`  status: ${ejariCase.status}, mode: ${ejariCase.mode}, dldRef: ${ejariCase.dldReference ?? "NULL"}`);

// 3. Force mode=dld_api (so the test is deterministic regardless of seed state)
await db.ejariCase.update({ where: { id: ejariCase.id }, data: { mode: "dld_api" } });
console.log(`  → mode updated to dld_api for test`);

// 4. Build contract data + call dld-register
const contractData = {
  contractNumber: `CNT-${Date.now()}`,
  tenantEmiratesId: "784-1980-1234567-8",
  landlordEmiratesId: "784-1975-9876543-2",
  propertyUnit: "Marina Tower, Unit 1804",
  startDate: "2026-11-01",
  endDate: "2027-10-31",
  annualRent: 95000,
  paymentTerms: "Two cheques",
};
console.log(`\n=== Outbound request JSON (POST /mock-dld/ejari/register) ===`);
console.log(JSON.stringify(contractData, null, 2));

console.log(`\nCalling POST /api/ejari/cases/${ejariCase.id}/dld-register...`);
const r = await fetch(`${BASE}/api/ejari/cases/${ejariCase.id}/dld-register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
  body: JSON.stringify({ contractData }),
});
const j = await r.json();
console.log(`HTTP ${r.status}`);
console.log(`Response:`);
console.log(JSON.stringify(j, null, 2));

// 5. Re-query the EjariCase
const updated = await db.ejariCase.findUnique({ where: { id: ejariCase.id } });
console.log(`\n=== Resulting EjariCase row ===`);
console.log(`id:                ${updated.id}`);
console.log(`caseNumber:        ${updated.caseNumber}`);
console.log(`status:            ${updated.status}`);
console.log(`mode:              ${updated.mode}`);
console.log(`dldReference:      ${updated.dldReference ?? "NULL"}`);
console.log(`certificateUrl:    ${updated.certificateUrl ?? "NULL"}`);
console.log(`certificateIssuedAt: ${updated.certificateIssuedAt?.toISOString() ?? "NULL"}`);

// 6. Status history
const history = await db.ejariStatusHistory.findMany({
  where: { ejariCaseId: ejariCase.id },
  orderBy: { createdAt: "desc" },
  take: 5,
});
console.log(`\n=== Recent EjariStatusHistory rows ===`);
for (const h of history) {
  console.log(`- ${h.createdAt.toISOString()} ${h.fromStatus ?? "n/a"} → ${h.toStatus}: ${h.reason ?? "n/a"}`);
}

// 7. Audit entries
const audits = await db.auditLog.findMany({
  where: { action: "EJARI_REGISTERED_VIA_DLD_API", entityId: ejariCase.id },
  orderBy: { createdAt: "desc" },
  take: 3,
});
console.log(`\n=== Audit entries (EJARI_REGISTERED_VIA_DLD_API) ===`);
for (const a of audits) {
  console.log(`- ${a.createdAt.toISOString()}: ${a.details}`);
}

console.log(`\n=== PASS/FAIL ===`);
const pass = updated.dldReference !== null && updated.status === "certificate_issued";
console.log(pass ? "✓ PASS — EjariCase dldReference set + status=certificate_issued" : "✗ FAIL");

await db.$disconnect();
process.exit(pass ? 0 : 1);
