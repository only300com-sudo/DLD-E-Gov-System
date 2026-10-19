// P13 Gap A — verify secure-link → EjariDocument auto-link.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
const db = new PrismaClient();

const BASE = "http://localhost:3000";

function fakePdf(name, docType) {
  const body = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 90 >> stream
BT /F1 18 Tf 50 700 Td (Ejari secure-link upload — ${name} — ${docType}) Tj ET
endstream endobj
trailer << /Root 1 0 R >>
%%EOF`;
  const buffer = Buffer.from(body, "utf-8");
  return { name: `${name}.pdf`, type: "application/pdf", buffer };
}

async function pickTarget() {
  // Find an EJA- case that has at least 4 documents (so we can re-use existing types)
  const ejariCase = await db.ejariCase.findFirst({
    where: { caseNumber: { startsWith: "EJA-" }, status: { not: "rejected" } },
    include: { documents: true },
    orderBy: { createdAt: "desc" },
  });
  if (!ejariCase) throw new Error("No EjariCase found");
  // Create a fresh secure link for this case
  const token = crypto.randomBytes(32).toString("base64url");
  const link = await db.secureLink.create({
    data: {
      token,
      caseNumber: ejariCase.caseNumber,
      contactId: ejariCase.contactId,
      purpose: "document_upload",
      expiresAt: new Date(Date.now() + 72 * 3600_000),
      maxUses: 5,
      createdBy: "system",
    },
  });
  return { link, ejariCase };
}

async function upload(link, docType) {
  const file = fakePdf(`${docType}_gapA`, docType);
  const fd = new FormData();
  fd.append("file", new Blob([file.buffer], { type: file.type }), file.name);
  fd.append("documentType", docType);
  const r = await fetch(`${BASE}/api/secure-links/${link.token}/upload`, { method: "POST", body: fd });
  return { status: r.status, json: await r.json() };
}

async function run() {
  const { link, ejariCase } = await pickTarget();
  console.log("=== Gap A verification ===");
  console.log(`EjariCase: ${ejariCase.caseNumber} (${ejariCase.id})`);
  console.log(`SecureLink: ${link.token.slice(0, 12)}... (maxUses=5)`);
  console.log(`\nExisting EjariDocuments on case (before uploads):`);
  for (const d of ejariCase.documents) {
    console.log(`  - type=${d.documentType} status=${d.verificationStatus} docRegId=${d.documentRegisterId ?? "NULL"}`);
  }

  // Test 1: existing EjariDocument path
  const existingType = ejariCase.documents[0]?.documentType;
  console.log(`\n--- Test 1: existing EjariDocument row (type=${existingType}) ---`);
  console.log(`Before: docRegisterId=${ejariCase.documents[0]?.documentRegisterId ?? "NULL"}`);
  const r1 = await upload(link, existingType);
  console.log(`Upload response (${r1.status}):`, JSON.stringify(r1.json, null, 2));
  const updated = await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: existingType } });
  console.log(`After:  EjariDocument id=${updated?.id} docRegisterId=${updated?.documentRegisterId ?? "NULL"} status=${updated?.verificationStatus}`);

  // Test 2: brand-new EjariDocument path
  const newType = "supplementary_letter";
  console.log(`\n--- Test 2: brand-new EjariDocument row (type=${newType}) ---`);
  const before2 = await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: newType } });
  console.log(`Before: ${before2 ? "EXISTS" : "DOES NOT EXIST (will be created)"}`);
  const r2 = await upload(link, newType);
  console.log(`Upload response (${r2.status}):`, JSON.stringify(r2.json, null, 2));
  const created = await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: newType } });
  console.log(`After:  EjariDocument id=${created?.id} docRegisterId=${created?.documentRegisterId ?? "NULL"} status=${created?.verificationStatus}`);

  // Final summary
  console.log(`\n=== Final EjariDocument rows on ${ejariCase.caseNumber} ===`);
  const finalDocs = await db.ejariDocument.findMany({ where: { ejariCaseId: ejariCase.id }, orderBy: { uploadedAt: "asc" } });
  for (const d of finalDocs) {
    console.log(`  - id=${d.id} type=${d.documentType} status=${d.verificationStatus} docRegisterId=${d.documentRegisterId ?? "NULL"}`);
  }

  console.log(`\n=== Audit entries (EJARI_DOCUMENT_LINKED_VIA_SECURE_UPLOAD) ===`);
  const audits = await db.auditLog.findMany({
    where: { action: "EJARI_DOCUMENT_LINKED_VIA_SECURE_UPLOAD" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const a of audits) {
    console.log(`  - ${a.createdAt.toISOString()} entityId=${a.entityId}`);
    console.log(`    ${a.details}`);
  }

  console.log(`\n=== PASS/FAIL ===`);
  const pass1 = updated?.documentRegisterId !== null && updated?.documentRegisterId !== undefined;
  const pass2 = created?.documentRegisterId !== null && created?.documentRegisterId !== undefined;
  console.log(`Test 1 (existing row updated):  ${pass1 ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`Test 2 (new row created):        ${pass2 ? "✓ PASS" : "✗ FAIL"}`);

  await db.$disconnect();
  process.exit(pass1 && pass2 ? 0 : 1);
}

run().catch((e) => { console.error("ERROR:", e); process.exit(1); });
