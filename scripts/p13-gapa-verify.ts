// P13 Gap A — verify secure-link → EjariDocument auto-link.
// Step 1: pick an existing Ejari case (EJA-...) that has a secure link (used 0/1)
// Step 2: pick a documentType that already has an EjariDocument row (existing-row path)
//         AND a documentType with NO existing EjariDocument row (create-row path)
// Step 3: POST /api/secure-links/[token]/upload with form-data: file + documentType
// Step 4: query EjariDocument row → assert documentRegisterId is populated (not NULL)
// Step 5: print both EjariDocument rows + audit entries
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const BASE = "http://localhost:3000";
const TOKEN = process.argv[2] || ""; // optional auth token (not needed — secure link IS the auth)

// Pick an Ejari case + secure link to use
async function pickTarget() {
  // Find a secure link tied to an EJA- case that hasn't been used yet
  const link = await db.secureLink.findFirst({
    where: { usedCount: 0, isRevoked: false, caseNumber: { startsWith: "EJA-" } },
    orderBy: { createdAt: "desc" },
  });
  if (!link) throw new Error("No available secure link tied to an EJA- case");
  const ejariCase = await db.ejariCase.findFirst({ where: { caseNumber: link.caseNumber! }, include: { documents: true } });
  if (!ejariCase) throw new Error(`EjariCase ${link.caseNumber} not found`);
  return { link, ejariCase };
}

// Generate a fake PDF in-memory (no external deps)
function fakePdf(name: string, docType: string): { name: string; type: string; buffer: Buffer } {
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

async function run() {
  const { link, ejariCase } = await pickTarget();
  console.log(`=== Gap A verification ===`);
  console.log(`EjariCase: ${ejariCase.caseNumber} (${ejariCase.id})`);
  console.log(`SecureLink: ${link.token.slice(0, 12)}... (used ${link.usedCount}/${link.maxUses})`);
  console.log(`Existing EjariDocuments on case:`);
  for (const d of ejariCase.documents) {
    console.log(`  - type=${d.documentType} status=${d.verificationStatus} docRegId=${d.documentRegisterId ?? "NULL"}`);
  }

  // === Test 1: existing EjariDocument path ===
  // Pick the first existing doc type (e.g. emirates_id_tenant)
  const existingType = ejariCase.documents[0]?.documentType;
  const existingBefore = ejariCase.documents.find((d) => d.documentType === existingType);
  console.log(`\n--- Test 1: existing EjariDocument (type=${existingType}) ---`);
  console.log(`Before: docRegisterId=${existingBefore?.documentRegisterId ?? "NULL"}, status=${existingBefore?.verificationStatus}`);

  const file1 = fakePdf(`${existingType}_gapA_existing`, existingType);
  const fd1 = new FormData();
  fd1.append("file", new Blob([file1.buffer], { type: file1.type }), file1.name);
  fd1.append("documentType", existingType);

  const r1 = await fetch(`${BASE}/api/secure-links/${link.token}/upload`, { method: "POST", body: fd1 });
  const j1 = await r1.json();
  console.log(`Upload response:`, JSON.stringify(j1, null, 2));

  // Verify EjariDocument updated
  const updated1 = await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: existingType } });
  console.log(`After: EjariDocument id=${updated1?.id} docRegisterId=${updated1?.documentRegisterId ?? "NULL"} status=${updated1?.verificationStatus}`);

  // === Test 2: brand-new EjariDocument (no existing row) ===
  // Use a docType that doesn't exist on this case yet
  const newType = "supplementary_letter";
  console.log(`\n--- Test 2: brand-new EjariDocument (type=${newType}) ---`);
  console.log(`Before: ${await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: newType } }) ? "exists" : "DOES NOT EXIST"}`);

  // Need a fresh secure link — original has maxUses=1 and now used=1
  // Create a new secure link with maxUses=2 (use slot 2 for this test)
  const { createSecureUploadLink } = await import("/home/z/my-project/src/lib/services/whatsapp/secureLinks.ts") as any;
  // Actually createSecureUploadLink isn't exported via ESM to a script context — use direct prisma call instead
  const crypto = await import("node:crypto");
  const newToken = crypto.randomBytes(32).toString("base64url");
  const newLink = await db.secureLink.create({
    data: {
      token: newToken,
      caseNumber: ejariCase.caseNumber,
      contactId: ejariCase.contactId,
      purpose: "document_upload",
      expiresAt: new Date(Date.now() + 72 * 3600_000),
      maxUses: 2,
      createdBy: "system",
    },
  });

  const file2 = fakePdf(`${newType}_gapA_new`, newType);
  const fd2 = new FormData();
  fd2.append("file", new Blob([file2.buffer], { type: file2.type }), file2.name);
  fd2.append("documentType", newType);

  const r2 = await fetch(`${BASE}/api/secure-links/${newLink.token}/upload`, { method: "POST", body: fd2 });
  const j2 = await r2.json();
  console.log(`Upload response:`, JSON.stringify(j2, null, 2));

  // Verify EjariDocument created
  const created = await db.ejariDocument.findFirst({ where: { ejariCaseId: ejariCase.id, documentType: newType } });
  console.log(`After: EjariDocument id=${created?.id} docRegisterId=${created?.documentRegisterId ?? "NULL"} status=${created?.verificationStatus}`);

  // Final summary
  console.log(`\n=== Final EjariDocument rows on ${ejariCase.caseNumber} ===`);
  const finalDocs = await db.ejariDocument.findMany({ where: { ejariCaseId: ejariCase.id }, orderBy: { uploadedAt: "asc" } });
  for (const d of finalDocs) {
    console.log(`  - id=${d.id} type=${d.documentType} status=${d.verificationStatus} docRegisterId=${d.documentRegisterId ?? "NULL"}`);
  }

  console.log(`\n=== Audit entries ===`);
  const audits = await db.auditLog.findMany({
    where: { action: "EJARI_DOCUMENT_LINKED_VIA_SECURE_UPLOAD", entityId: { in: [updated1?.id, created?.id].filter(Boolean) as string[] } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const a of audits) {
    console.log(`  - ${a.action} @ ${a.createdAt.toISOString()} entityId=${a.entityId}`);
    console.log(`    ${a.details}`);
  }

  await db.$disconnect();
}

run().catch((e) => { console.error("ERROR:", e); process.exit(1); });
