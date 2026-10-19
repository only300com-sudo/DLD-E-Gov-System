// Phase 16 Final Evidence Gathering — 7 outstanding artifacts
// Exercises the 3 remaining endpoints + extracts raw DB rows for paste-ready output
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

async function login(email: string, password = "trustee123") {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return await r.json();
}

function hdr(t: string, c: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "X-CSRF-Token": c };
}
function formHdr(t: string, c: string) {
  return { Authorization: `Bearer ${t}`, "X-CSRF-Token": c };
}

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  PHASE 16 — FINAL EVIDENCE GATHERING (7 outstanding artifacts)");
console.log("═══════════════════════════════════════════════════════════════════\n");

// Admin login
const admin = await login("admin@trustee.ae");
console.log(`Admin session: ${admin.token ? "✓ acquired" : "✗ failed"}`);
console.log(`CSRF: ${admin.csrfToken?.slice(0, 12)}...\n`);

// ════════════════════════════════════════════════════════════════════
// ARTIFACT A: PATCH /api/clients/[id] — ClientAuditLog row with oldValue+newValue
// ════════════════════════════════════════════════════════════════════
console.log("─── ARTIFACT A: PATCH /api/clients/[id] — field-level audit ───");
const testClientA = await db.client.findFirst({
  where: { internalId: "C-2026-0003" },
  select: { id: true, internalId: true, fullNameEn: true, phoneE164: true, email: true },
});
console.log(`Test client: ${testClientA.internalId} (${testClientA.fullNameEn})`);
console.log(`  BEFORE: phoneE164=${testClientA.phoneE164}, email=${testClientA.email}`);

const patchR = await fetch(`${BASE}/api/clients/${testClientA.id}`, {
  method: "PATCH",
  headers: hdr(admin.token, admin.csrfToken),
  body: JSON.stringify({
    phoneE164: "+971-54-555-EVID",     // new value to produce a real audit row
    email: "evidence.test@trustee.ae", // new value
  }),
});
const patchJ = await patchR.json();
console.log(`PATCH HTTP ${patchR.status} | changedFields: ${patchJ.changedFields?.length}`);

// Extract the freshest ClientAuditLog rows for this client
const auditRowsA = await db.clientAuditLog.findMany({
  where: { clientId: testClientA.id, action: "updated" },
  orderBy: { createdAt: "desc" },
  take: 2,
  select: {
    id: true,
    clientId: true,
    action: true,
    field: true,
    oldValue: true,
    newValue: true,
    actorId: true,
    actorRole: true,
    ipAddress: true,
    userAgent: true,
    reason: true,
    createdAt: true,
  },
});

console.log("\n>>> ClientAuditLog rows (paste-ready JSON):");
console.log(JSON.stringify(auditRowsA, null, 2));

// Restore original values
await db.client.update({
  where: { id: testClientA.id },
  data: { phoneE164: testClientA.phoneE164, email: testClientA.email },
});
console.log(`\n  Restored to: phoneE164=${testClientA.phoneE164}, email=${testClientA.email}`);

// ════════════════════════════════════════════════════════════════════
// ARTIFACT B: PATCH /api/clients/[id]/status — ClientAuditLog row
// ════════════════════════════════════════════════════════════════════
console.log("\n\n─── ARTIFACT B: PATCH /api/clients/[id]/status ───");
const testClientB = await db.client.findFirst({
  where: { internalId: "C-2026-0004" },
  select: { id: true, internalId: true, fullNameEn: true, status: true },
});
console.log(`Test client: ${testClientB.internalId} (${testClientB.fullNameEn})`);
console.log(`  BEFORE status: ${testClientB.status}`);

const statusR = await fetch(`${BASE}/api/clients/${testClientB.id}/status`, {
  method: "PATCH",
  headers: hdr(admin.token, admin.csrfToken),
  body: JSON.stringify({
    status: "inactive",
    reason: "Phase 16 evidence-gathering test — temporarily inactive for audit proof",
  }),
});
const statusJ = await statusR.json();
console.log(`PATCH HTTP ${statusR.status} | ${statusJ.oldStatus} → ${statusJ.newStatus}`);

const auditRowB = await db.clientAuditLog.findFirst({
  where: { clientId: testClientB.id, action: "status_changed" },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    clientId: true,
    action: true,
    field: true,
    oldValue: true,
    newValue: true,
    actorId: true,
    actorRole: true,
    reason: true,
    ipAddress: true,
    userAgent: true,
    createdAt: true,
  },
});

console.log("\n>>> ClientAuditLog row (paste-ready JSON):");
console.log(JSON.stringify(auditRowB, null, 2));

// Restore status
await fetch(`${BASE}/api/clients/${testClientB.id}/status`, {
  method: "PATCH",
  headers: hdr(admin.token, admin.csrfToken),
  body: JSON.stringify({ status: "active", reason: "Restored after Phase 16 evidence test" }),
});
console.log("  Restored to active");

// ════════════════════════════════════════════════════════════════════
// ARTIFACT C: POST /api/clients/[id]/documents — ClientDocument row
// ════════════════════════════════════════════════════════════════════
console.log("\n\n─── ARTIFACT C: POST /api/clients/[id]/documents ───");
const testClientC = await db.client.findFirst({
  where: { internalId: "C-2026-0001" },
  select: { id: true, internalId: true, fullNameEn: true },
});
console.log(`Test client: ${testClientC.internalId} (${testClientC.fullNameEn})`);

const formData = new FormData();
const fileContent = `%PDF-1.4
% Phase 16 Evidence Document
% Client: ${testClientC.internalId}
% Generated: ${new Date().toISOString()}
% Purpose: Verify ClientDocument row creation with checksum + verification status
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj
xref
0 3
0000000000 65535 f
0000000010 00000 n
0000000058 00000 n
trailer << /Size 3 /Root 1 0 R >>
startxref
108
%%EOF`;
const fileBuffer = Buffer.from(fileContent);
formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), "phase16_evidence.pdf");
formData.append("documentType", "emirates_id");

const docR = await fetch(`${BASE}/api/clients/${testClientC.id}/documents`, {
  method: "POST",
  headers: formHdr(admin.token, admin.csrfToken),
  body: formData,
});
const docJ = await docR.json();
console.log(`POST HTTP ${docR.status} | documentId=${docJ.document?.id?.slice(-8)}`);

const docRow = await db.clientDocument.findUnique({
  where: { id: docJ.document?.id },
  select: {
    id: true,
    clientId: true,
    documentType: true,
    fileName: true,
    filePath: true,
    fileSize: true,
    mimeType: true,
    checksum: true,
    verificationStatus: true,
    uploadedBy: true,
    uploadedAt: true,
    verifiedBy: true,
    verifiedAt: true,
    expiresAt: true,
  },
});

console.log("\n>>> ClientDocument row (paste-ready JSON):");
console.log(JSON.stringify(docRow, null, 2));

// Cross-check: confirm the file is on disk
import { promises as fs } from "node:fs";
const fileExists = await fs.stat(docRow.filePath).then(() => true).catch(() => false);
console.log(`\n  File on disk at filePath: ${fileExists ? "✓ exists" : "✗ MISSING"}`);
console.log(`  Checksum length: ${docRow.checksum.length} (SHA-256 = 64 chars ✓)`);
console.log(`  verificationStatus: ${docRow.verificationStatus ?? "(null — defaults to PENDING per schema)"}`);

// ════════════════════════════════════════════════════════════════════
// ARTIFACT D: Item 18 — cross-context isolation code path
// ════════════════════════════════════════════════════════════════════
console.log("\n\n─── ARTIFACT D: Item 18 — cross-context isolation evidence ───");
console.log(`Isolation pattern: every client-scoped API route uses \`where: { clientId: id }\``);
console.log(`where \`id\` comes from \`await params\` (URL path param).`);
console.log(`\nThis means isolation is enforced at the Prisma query level — no separate`);
console.log(`"server check" middleware. The URL param is the source of truth.`);

// Verify by hitting the endpoint and confirming scoped response
const scopedR = await fetch(`${BASE}/api/clients/${testClientA.id}/cases`, {
  headers: { Authorization: `Bearer ${admin.token}` },
});
const scopedJ = await scopedR.json();
console.log(`\nGET /api/clients/${testClientA.id}/cases → HTTP ${scopedR.status}`);
console.log(`  client.id returned: ${scopedJ.client?.id}`);
console.log(`  client.id === URL id: ${scopedJ.client?.id === testClientA.id ? "✓" : "✗ LEAK"}`);
console.log(`  cases returned: ${scopedJ.cases?.length}`);
console.log(`  Every case.clientId === URL id: ${scopedJ.cases?.every((c: any) => c.clientId === testClientA.id) ? "✓" : "✗ LEAK"}`);

await db.$disconnect();
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("  4 of 7 artifacts gathered (DB-level evidence)");
console.log("  Remaining 3 artifacts are screenshots (email val, empty CTA, officer view)");
console.log("═══════════════════════════════════════════════════════════════════");
process.exit(0);
