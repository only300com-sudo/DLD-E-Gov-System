// tests/knowledge-base/upload.integration.spec.ts
// Part 12A — Integration test for the knowledge-base upload + list + detail APIs.
//
// Calls route handlers DIRECTLY (no live dev server needed) — same pattern
// as the regression-23 tests. Verifies:
//   1. Upload a TXT file → doc created with status 'uploaded' → async extraction
//      moves it to 'extracted' with chunks persisted
//   2. Duplicate upload by hash → HTTP 409 with existingId
//   3. Missing required fields → HTTP 400
//   4. Non-admin role → HTTP 403
//   5. List endpoint returns uploaded docs with chunk counts
//   6. Detail endpoint returns doc + paginated chunks
//   7. Delete endpoint removes doc + cascades chunks

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
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

function makeReq(method: string, path: string, opts: {
  token?: string;
  csrf?: string;
  body?: any;
  formData?: FormData;
} = {}): any {
  const u = new URL(path, "http://localhost:3000");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  if (opts.csrf) headers.set("X-CSRF-Token", opts.csrf);
  return {
    method,
    nextUrl: u,
    url: u.toString(),
    headers,
    cookies: { get: () => undefined },
    json: async () => opts.body ?? {},
    formData: async () => opts.formData ?? new FormData(),
  } as any;
}

async function main() {
  console.log("=== Part 12A — Knowledge Base API integration tests ===\n");

  const { createSession } = await import("../../src/lib/auth");
  const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true } });
  if (!admin) { console.error("Setup failed: no active admin user"); process.exit(1); }
  const session = await createSession({
    id: admin.id, email: admin.email, name: admin.name,
    role: admin.role, branchId: admin.branchId ?? undefined,
  });

  const officer = await db.user.findFirst({ where: { role: "TRUSTEE_OFFICER", active: true } });
  const officerSession = officer ? await createSession({
    id: officer.id, email: officer.email, name: officer.name,
    role: officer.role, branchId: officer.branchId ?? undefined,
  }) : null;

  const uploadMod = await import("../../src/app/api/knowledge-base/upload/route");
  const listMod = await import("../../src/app/api/knowledge-base/route");
  const detailMod = await import("../../src/app/api/knowledge-base/[id]/route");

  const testFileContent = `DLD Circular 2026-08 (Test)
Effective Date: 1 September 2026

4.1 Sale Registration Fee
The DLD sale registration fee remains at 4% of the property sale value,
calculated on the higher of the sale price or the DLD valuation.

4.2 Gift Registration Fee Threshold Change
Effective 1 September 2026, the trustee service partner threshold for gift
registrations shall be updated from AED 2,000,000 to AED 3,000,000. The
gift registration fee rate remains 0.125% with a minimum of AED 2,000.

4.3 Mortgage Registration Fee
The DLD mortgage registration fee is 0.25% of the mortgage amount. No
minimum applies. This rate is unchanged from the previous circular.

5. Required Documents Update
For GRANT-NM-001 (Non-Muslim Will Grant), a notarized copy of the will
is now required in addition to the standard title deed and identity
documents. This requirement is effective immediately.
`;

  // ── Test 1: Upload TXT file ──
  console.log("Test 1: Upload TXT file → doc created, extraction started");
  const formData = new FormData();
  const fileBlob = new Blob([testFileContent], { type: "text/plain" });
  formData.append("file", fileBlob, "sample-circular.txt");
  formData.append("title", "DLD Circular 2026-08 (Test)");
  formData.append("docType", "circular");
  formData.append("issuer", "DLD");
  formData.append("language", "en");
  formData.append("effectiveDate", "2026-09-01");

  const uploadReq = makeReq("POST", "/api/knowledge-base/upload", {
    token: session.token, csrf: session.csrfToken ?? "", formData,
  });
  const uploadRes = await uploadMod.POST(uploadReq, { params: Promise.resolve({}) });
  assert("Upload returns HTTP 200", uploadRes.status === 200, `got ${uploadRes.status}`);
  let docId: string | null = null;
  if (uploadRes.status === 200) {
    const body = await uploadRes.json();
    assert("Response has docId", !!body.docId);
    assert("Response status = 'uploaded'", body.status === "uploaded", `got ${body.status}`);
    docId = body.docId;
  }

  if (docId) {
    console.log("  (waiting 5s for async extraction...)");
    await new Promise(r => setTimeout(r, 5000));
    const doc = await db.knowledgeDoc.findUnique({
      where: { id: docId },
      include: { _count: { select: { chunks: true } } },
    });
    assert("Doc status moved to 'extracted'", doc?.status === "extracted", `got ${doc?.status}`);
    assert("Chunks persisted (count > 0)", (doc?._count.chunks ?? 0) > 0, `got ${doc?._count.chunks ?? 0}`);
    if ((doc?._count.chunks ?? 0) > 0) {
      console.log(`  ✓ ${doc?._count.chunks} chunks extracted`);
    }
  }

  // ── Test 2: Duplicate upload ──
  console.log("\nTest 2: Duplicate upload by hash → HTTP 409 with existingId");
  const formData2 = new FormData();
  formData2.append("file", new Blob([testFileContent], { type: "text/plain" }), "sample-circular.txt");
  formData2.append("title", "Duplicate Upload");
  formData2.append("docType", "circular");
  const dupReq = makeReq("POST", "/api/knowledge-base/upload", {
    token: session.token, csrf: session.csrfToken ?? "", formData: formData2,
  });
  const dupRes = await uploadMod.POST(dupReq, { params: Promise.resolve({}) });
  assert("Duplicate upload returns HTTP 409", dupRes.status === 409, `got ${dupRes.status}`);
  if (dupRes.status === 409) {
    const body = await dupRes.json();
    assert("409 body has existingId", !!body.existingId);
    assert("existingId matches the first upload", body.existingId === docId, `got ${body.existingId}`);
  }

  // ── Test 3: Missing required fields ──
  console.log("\nTest 3: Missing required fields → HTTP 400");
  const formData3 = new FormData();
  formData3.append("title", "No file provided");
  formData3.append("docType", "circular");
  const badReq = makeReq("POST", "/api/knowledge-base/upload", {
    token: session.token, csrf: session.csrfToken ?? "", formData: formData3,
  });
  const badRes = await uploadMod.POST(badReq, { params: Promise.resolve({}) });
  assert("Missing file returns HTTP 400", badRes.status === 400, `got ${badRes.status}`);

  // ── Test 4: Non-admin role → HTTP 403 ──
  console.log("\nTest 4: Officer (non-admin) upload → HTTP 403");
  if (officerSession) {
    const formData4 = new FormData();
    formData4.append("file", new Blob([testFileContent], { type: "text/plain" }), "officer-upload.txt");
    formData4.append("title", "Officer Upload Attempt");
    formData4.append("docType", "circular");
    const offReq = makeReq("POST", "/api/knowledge-base/upload", {
      token: officerSession.token, csrf: officerSession.csrfToken ?? "", formData: formData4,
    });
    const offRes = await uploadMod.POST(offReq, { params: Promise.resolve({}) });
    assert("Officer upload returns HTTP 403 (Forbidden)", offRes.status === 403, `got ${offRes.status}`);
  } else {
    console.log("  (skipped — no officer user)");
  }

  // ── Test 5: List endpoint ──
  console.log("\nTest 5: List endpoint returns uploaded docs with chunk counts");
  const listReq = makeReq("GET", "/api/knowledge-base", { token: session.token });
  const listRes = await listMod.GET(listReq, { params: Promise.resolve({}) });
  assert("List returns HTTP 200", listRes.status === 200, `got ${listRes.status}`);
  if (listRes.status === 200) {
    const body = await listRes.json();
    assert("List has at least 1 doc", body.docs.length >= 1, `got ${body.docs.length}`);
    const uploadedDoc = body.docs.find((d: any) => d.id === docId);
    assert("Uploaded doc is in the list", !!uploadedDoc);
    if (uploadedDoc) {
      assert("Doc chunkCount > 0", uploadedDoc.chunkCount > 0, `got ${uploadedDoc.chunkCount}`);
      assert("Doc status = 'extracted'", uploadedDoc.status === "extracted", `got ${uploadedDoc.status}`);
      assert("Doc title correct", uploadedDoc.title === "DLD Circular 2026-08 (Test)");
      assert("Doc docType = 'circular'", uploadedDoc.docType === "circular");
      assert("Doc issuer = 'DLD'", uploadedDoc.issuer === "DLD");
      assert("Doc language = 'en'", uploadedDoc.language === "en");
      assert("Doc effectiveDate is set", !!uploadedDoc.effectiveDate);
      assert("Doc fileSize > 0", uploadedDoc.fileSize > 0);
      assert("Doc mimeType = 'text/plain'", uploadedDoc.mimeType === "text/plain");
    }
  }

  // ── Test 6: Detail endpoint ──
  console.log("\nTest 6: Detail endpoint returns doc + paginated chunks");
  if (docId) {
    const detailReq = makeReq("GET", `/api/knowledge-base/${docId}?limit=10`, { token: session.token });
    const detailRes = await detailMod.GET(detailReq, { params: Promise.resolve({ id: docId }) });
    assert("Detail returns HTTP 200", detailRes.status === 200, `got ${detailRes.status}`);
    if (detailRes.status === 200) {
      const body = await detailRes.json();
      assert("Detail has doc.id", body.doc.id === docId);
      assert("Detail has chunks array", Array.isArray(body.chunks));
      assert("Chunks have sequence numbers", body.chunks.length > 0 && typeof body.chunks[0].sequence === "number");
      assert("Chunks have text", body.chunks.length > 0 && typeof body.chunks[0].text === "string");
      assert("Chunks have tokenCount", body.chunks.length > 0 && typeof body.chunks[0].tokenCount === "number");
      assert("Counts.chunks > 0", body.counts.chunks > 0, `got ${body.counts.chunks}`);
      assert("Pagination hasMore boolean", typeof body.pagination.hasMore === "boolean");
    }
  }

  // ── Test 7: Delete endpoint ──
  console.log("\nTest 7: Delete endpoint removes doc + cascades chunks");
  if (docId) {
    const chunkCountBefore = await db.docChunk.count({ where: { docId } });
    assert("Chunks exist before delete", chunkCountBefore > 0, `got ${chunkCountBefore}`);

    const delReq = makeReq("DELETE", `/api/knowledge-base/${docId}`, {
      token: session.token, csrf: session.csrfToken ?? "",
    });
    const delRes = await detailMod.DELETE(delReq, { params: Promise.resolve({ id: docId }) });
    assert("Delete returns HTTP 200", delRes.status === 200, `got ${delRes.status}`);

    if (delRes.status === 200) {
      const docAfter = await db.knowledgeDoc.findUnique({ where: { id: docId } });
      assert("Doc row deleted", !docAfter);
      const chunkCountAfter = await db.docChunk.count({ where: { docId } });
      assert("Chunks cascaded (count = 0)", chunkCountAfter === 0, `got ${chunkCountAfter}`);
    }
  }

  // ── Cleanup ──
  const tokens = [session.token, officerSession?.token].filter(Boolean) as string[];
  await db.session.deleteMany({ where: { token: { in: tokens } } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
