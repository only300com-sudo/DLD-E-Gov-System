// Phase 16.6-16.7 verification — all remaining routes + duplicate check + 18 acceptance criteria
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

async function login(email, password = "trustee123") {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return await r.json();
}
function hdr(t, c) { return { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "X-CSRF-Token": c }; }
function formHdr(t, c) { return { Authorization: `Bearer ${t}`, "X-CSRF-Token": c }; }

const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`${pass ? "✓" : "✗"} ${name}\n   ${evidence}\n`);
}

console.log("=== Phase 16.6-16.7 Verification ===\n");

// ── 16.6 — Duplicate Prevention Final ──────────────────────────────────
const adminL = await login("admin@trustee.ae");

// Item 1: GET /api/clients/[id]/check-duplicate?emiratesId=784-1985-1234567-1 → exists
const dupCheckR = await fetch(`${BASE}/api/clients/cmusc06hj001fojp3btje4xxe/check-duplicate?emiratesId=784-1985-1234567-1`, {
  headers: { Authorization: `Bearer ${adminL.token}` },
});
const dupCheckJ = await dupCheckR.json();
console.log("1. Duplicate check (existing EID):", dupCheckJ);
record("Duplicate check returns exists=true for existing EID",
  dupCheckJ.exists === true && dupCheckJ.clientCode === "C-2026-0001",
  `HTTP ${dupCheckR.status} | exists=${dupCheckJ.exists} | clientCode=${dupCheckJ.clientCode}`);

// Item 2: GET /api/clients/[id]/check-duplicate?emiratesId=784-9999-9999999-9 → not exists
const noDupR = await fetch(`${BASE}/api/clients/cmusc06hj001fojp3btje4xxe/check-duplicate?emiratesId=784-9999-9999999-9`, {
  headers: { Authorization: `Bearer ${adminL.token}` },
});
const noDupJ = await noDupR.json();
console.log("2. Duplicate check (non-existing EID):", noDupJ);
record("Duplicate check returns exists=false for new EID",
  noDupJ.exists === false,
  `HTTP ${noDupR.status} | exists=${noDupJ.exists}`);

// ── 16.7 — PATCH /api/clients/[id] — update with field-level audit ─────
// Pick a client to update
const testClient = await db.client.findFirst({ where: { internalId: "C-2026-0003" }, select: { id: true, internalId: true, phoneE164: true } });
console.log("\n3. Using test client:", testClient);

const patchR = await fetch(`${BASE}/api/clients/${testClient.id}`, {
  method: "PATCH",
  headers: hdr(adminL.token, adminL.csrfToken),
  body: JSON.stringify({ phoneE164: "+971-54-555-0001", email: "updated@example.ae" }),
});
const patchJ = await patchR.json();
console.log("PATCH response:", { ok: patchJ.ok, changedFields: patchJ.changedFields?.map((f: any) => `${f.field}: ${f.oldValue} → ${f.newValue}`) });

// Verify DB row
const patchedClient = await db.client.findUnique({ where: { id: testClient.id }, select: { phoneE164: true, email: true } });
console.log("DB row after patch:", patchedClient);

// Verify ClientAuditLog
const auditEntries = await db.clientAuditLog.findMany({
  where: { clientId: testClient.id, action: "updated" },
  orderBy: { createdAt: "desc" }, take: 2,
});
console.log("Audit entries:", auditEntries.map((a) => ({ field: a.field, old: a.oldValue, new: a.newValue, actor: a.actorRole })));

record("PATCH /api/clients/[id] — update with field-level audit",
  patchR.status === 200 && patchJ.ok === true && patchedClient.phoneE164 === "+971-54-555-0001" && auditEntries.length >= 2,
  `HTTP ${patchR.status} | changedFields=${patchJ.changedFields?.length} | DB phoneE164=${patchedClient.phoneE164} | audit entries=${auditEntries.length} (field=${auditEntries[0]?.field}, old→new: ${auditEntries[0]?.oldValue}→${auditEntries[0]?.newValue})`);

// Restore the original value
await db.client.update({ where: { id: testClient.id }, data: { phoneE164: testClient.phoneE164, email: "gulf@example.ae" } });

// ── PATCH /api/clients/[id]/status — lifecycle status change ────────────
const statusClient = await db.client.findFirst({ where: { internalId: "C-2026-0004" }, select: { id: true, internalId: true, status: true } });
const oldStatus = statusClient.status;
console.log("\n4. Using status test client:", statusClient, "oldStatus:", oldStatus);

const statusR = await fetch(`${BASE}/api/clients/${statusClient.id}/status`, {
  method: "PATCH",
  headers: hdr(adminL.token, adminL.csrfToken),
  body: JSON.stringify({ status: "inactive", reason: "Phase 16.7 verification test — temporarily inactive" }),
});
const statusJ = await statusR.json();
console.log("Status response:", { ok: statusJ.ok, oldStatus: statusJ.oldStatus, newStatus: statusJ.newStatus });

// Verify DB
const statusAfter = await db.client.findUnique({ where: { id: statusClient.id }, select: { status: true, statusReason: true, statusChangedBy: true } });
const statusAudit = await db.clientAuditLog.findFirst({
  where: { clientId: statusClient.id, action: "status_changed" },
  orderBy: { createdAt: "desc" },
});
console.log("DB after status change:", statusAfter);
console.log("Audit entry:", { field: statusAudit?.field, old: statusAudit?.oldValue, new: statusAudit?.newValue, reason: statusAudit?.reason });

record("PATCH /api/clients/[id]/status — lifecycle status change",
  statusR.status === 200 && statusJ.ok === true && statusAfter.status === "inactive" && statusAudit?.oldValue === "active" && statusAudit?.newValue === "inactive",
  `HTTP ${statusR.status} | oldStatus=${statusJ.oldStatus} | newStatus=${statusJ.newStatus} | DB status=${statusAfter.status} | audit: ${statusAudit?.oldValue}→${statusAudit?.newValue} reason="${statusAudit?.reason?.slice(0, 50)}"`);

// Restore status
await fetch(`${BASE}/api/clients/${statusClient.id}/status`, {
  method: "PATCH", headers: hdr(adminL.token, adminL.csrfToken),
  body: JSON.stringify({ status: "active", reason: "Restored after Phase 16.7 test" }),
});

// ── POST /api/clients/[id]/documents — upload client document ──────────
const docClient = await db.client.findFirst({ where: { internalId: "C-2026-0001" }, select: { id: true, internalId: true } });
console.log("\n5. Using document test client:", docClient);

const formData = new FormData();
const fileBuffer = Buffer.from(`%PDF-1.4 Test Emirates ID document for ${docClient.internalId}`);
formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), "test_emirates_id.pdf");
formData.append("documentType", "emirates_id");

const docR = await fetch(`${BASE}/api/clients/${docClient.id}/documents`, {
  method: "POST",
  headers: formHdr(adminL.token, adminL.csrfToken),
  body: formData,
});
const docJ = await docR.json();
console.log("Document upload response:", { ok: docJ.ok, documentId: docJ.document?.id, checksum: docJ.document?.checksum?.slice(0, 16) });

// Verify DB
const docRow = await db.clientDocument.findUnique({ where: { id: docJ.document?.id }, select: { id: true, documentType: true, fileName: true, checksum: true, verificationStatus: true } });
const docAudit = await db.clientAuditLog.findFirst({
  where: { clientId: docClient.id, action: "document_uploaded" },
  orderBy: { createdAt: "desc" },
});
console.log("ClientDocument row:", docRow);
console.log("Audit entry:", { action: docAudit?.action, field: docAudit?.field, newValue: docAudit?.newValue?.slice(0, 100) });

record("POST /api/clients/[id]/documents — upload with checksum + audit",
  docR.status === 201 && docJ.ok === true && docRow?.checksum?.length === 64 && docRow?.documentType === "emirates_id" && docAudit?.action === "document_uploaded",
  `HTTP ${docR.status} | documentId=${docRow?.id?.slice(-6)} | checksum=${docRow?.checksum?.slice(0, 16)}... (64 chars) | type=${docRow?.documentType} | audit: document_uploaded`);

// ── Regression + Lint ───────────────────────────────────────────────────
const { exec } = await import("node:child_process");
const { promisify } = await import("node:util");
const execAsync = promisify(exec);
try {
  const { stdout } = await execAsync("node /home/z/my-project/scripts/regression-23.js", { cwd: "/home/z/my-project" });
  const lastLine = stdout.trim().split("\n").pop();
  record("Regression 23/23", lastLine.includes("23/23 OK"), lastLine);
} catch (e) { record("Regression 23/23", false, e.message); }
try {
  const { stdout, stderr } = await execAsync("bunx eslint .", { cwd: "/home/z/my-project" });
  record("Lint 0/0", stdout === "" && stderr === "", `exit_code=0`);
} catch (e) { record("Lint 0/0", false, `exit_code=${e.code}`); }

// Summary
console.log("\n=== SUMMARY ===");
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;
console.log(`PASS: ${pass}/${pass + fail} | FAIL: ${fail}/${pass + fail}`);
for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}`);

await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
