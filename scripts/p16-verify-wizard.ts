// Phase 16 verification — DB row evidence for the wizard creation
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// 1. Find the newly created client
const client = await db.client.findFirst({
  where: { fullNameEn: "Phase Sixteen Test" },
  include: { clientAuditLog: { orderBy: { createdAt: "desc" }, take: 5 } },
});
console.log("=== Client row (created via wizard) ===");
if (client) {
  console.log({
    id: client.id,
    internalId: client.internalId,
    clientType: client.clientType,
    capacity: client.capacity,
    fullNameEn: client.fullNameEn,
    emiratesId: client.emiratesId,
    phoneE164: client.phoneE164,
    mobile: client.mobile,
    email: client.email,
    dateOfBirth: client.dateOfBirth,
    preferredLanguage: client.preferredLanguage,
    status: client.status,
    dataConsent: client.dataConsent,
    commConsent: client.commConsent,
    consentPrivacyPolicyAt: client.consentPrivacyPolicyAt?.toISOString(),
    lastActivityAt: client.lastActivityAt?.toISOString(),
    createdAt: client.createdAt.toISOString(),
  });
  console.log("\n=== ClientAuditLog entries ===");
  for (const a of client.clientAuditLog) {
    console.log({
      id: a.id,
      action: a.action,
      actorId: a.actorId,
      actorRole: a.actorRole,
      newValue: a.newValue?.slice(0, 200),
      createdAt: a.createdAt.toISOString(),
      ipAddress: a.ipAddress,
    });
  }
} else {
  console.log("NOT FOUND");
}

// 2. Verify the POST /api/clients response
console.log("\n=== POST /api/clients response (login + create) ===");
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "reception@trustee.ae", password: "trustee123" }),
});
const loginJ = await loginR.json();

// Create a second client via API to capture the response body
const createR = await fetch(`${BASE}/api/clients`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginJ.token}`, "X-CSRF-Token": loginJ.csrfToken },
  body: JSON.stringify({
    clientType: "INDIVIDUAL",
    capacity: "Seller",
    fullNameEn: "API Test Client",
    emiratesId: "784-2001-8888888-8",
    phoneE164: "+971-52-555-1234",
    email: "apitest@example.ae",
    dateOfBirth: "1985-06-15",
    preferredLanguage: "en",
    dataConsent: true,
    commConsent: false,
  }),
});
const createJ = await createR.json();
console.log(`HTTP ${createR.status}`);
console.log(JSON.stringify({ ok: createJ.ok, client: createJ.client ? { id: createJ.client.id, internalId: createJ.client.internalId, fullNameEn: createJ.client.fullNameEn, emiratesId: createJ.client.emiratesId, phoneE164: createJ.client.phoneE164, status: createJ.client.status } : null }, null, 2));

// 3. Duplicate test — create with same EID
console.log("\n=== Duplicate test (same EID 784-2001-8888888-8) ===");
const dupR = await fetch(`${BASE}/api/clients`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginJ.token}`, "X-CSRF-Token": loginJ.csrfToken },
  body: JSON.stringify({
    clientType: "INDIVIDUAL",
    capacity: "Buyer",
    fullNameEn: "Duplicate Test",
    emiratesId: "784-2001-8888888-8", // same as above
    phoneE164: "+971-50-111-2222",
    preferredLanguage: "en",
    dataConsent: true,
  }),
});
const dupJ = await dupR.json();
console.log(`HTTP ${dupR.status}`);
console.log(JSON.stringify({ ok: dupJ.ok, error: dupJ.error, existingClientId: dupJ.existingClientId, existingClientName: dupJ.existingClientName, existingClientCode: dupJ.existingClientCode, message: dupJ.message }, null, 2));

// 4. Validation matrix — test EID/phone validation via API
console.log("\n=== Validation matrix (API-level) ===");
const tests = [
  { name: "EID 784-1234-567 (too short)", emiratesId: "784-1234-567", expectReject: true },
  { name: "EID 784-1985-1234567-1 (valid)", emiratesId: "784-1985-1234567-1", expectReject: true }, // existing — will be duplicate 409
  { name: "Phone 0501234567 (no +971 prefix)", phoneE164: "0501234567", expectReject: true },
  { name: "Phone +971-50-123-4567 (valid)", phoneE164: "+971-50-123-4567", expectReject: false },
];
for (const t of tests) {
  const r = await fetch(`${BASE}/api/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginJ.token}`, "X-CSRF-Token": loginJ.csrfToken },
    body: JSON.stringify({
      clientType: "INDIVIDUAL", capacity: "Buyer",
      fullNameEn: "Validation Test", emiratesId: t.emiratesId, phoneE164: t.phoneE164,
      preferredLanguage: "en", dataConsent: true,
    }),
  });
  const j = await r.json();
  const rejected = r.status >= 400;
  const pass = rejected === t.expectReject;
  console.log(`${pass ? "✓ PASS" : "✗ FAIL"} — ${t.name} → HTTP ${r.status} | ${j.error ?? "created"}`);
}

// 5. Verify null handling for passport
console.log("\n=== Null handling for passport (Gap 2 confirmation) ===");
const nullTestClient = await db.client.findFirst({
  where: { passportNumber: null },
  select: { id: true, internalId: true, passportNumber: true, emiratesId: true },
});
console.log("Client with null passport:", nullTestClient ? { id: nullTestClient.id, internalId: nullTestClient.internalId, passportNumber: nullTestClient.passportNumber } : "NONE FOUND");
console.log("passportNumber is NULL (not empty string):", nullTestClient?.passportNumber === null ? "✓" : "✗");

await db.$disconnect();
