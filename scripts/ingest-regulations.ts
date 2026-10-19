// scripts/ingest-regulations.ts
// Part 12B-REG + 12C — Ingest DLD/RERA regulations into the knowledge base.
//
// Ingests:
//   1. 3 PDFs already on disk (practitioner reference, circulars, en-legislation)
//   2. HTML-fetched laws (Law 14/2008, Law 13/2008, Law 6/2019, Law 27/2007, Res 30/2013)
//   3. Supersession link: Law 6/2019 → supersedes Law 27/2007
//
// Each regulation is stored as a KnowledgeDoc with:
//   - sourceUrl, sourceType, jurisdiction, libraryCategory set
//   - Text extracted into DocChunks (via extractText)
//   - Status set to 'extracted' (chunks ready for LLM rule extraction)
//
// Run: npx tsx scripts/ingest-regulations.ts
// Idempotent — upserts by fileHash, skips if already ingested.

import { PrismaClient } from "@prisma/client";
import { extractText, saveUploadedFile } from "../src/lib/knowledge/extract";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const db = new PrismaClient();

const UPLOAD_DIR = "/home/z/my-project/upload";
const KB_DIR = "/home/z/my-project/data/knowledge-base";

// Regulations to ingest from disk (PDFs already uploaded)
const DISK_PDFS = [
  {
    filePath: path.join(UPLOAD_DIR, "Dubai-Land-Department-DLD-complete-practitioner-reference.pdf"),
    title: "DLD Complete Practitioner Reference",
    docType: "procedure_manual",
    issuer: "DLD",
    language: "en",
    libraryCategory: "general",
    sourceType: "pdf_disk",
    jurisdiction: "DLD",
  },
  {
    filePath: path.join(UPLOAD_DIR, "Full DLD Circulers and guides.pdf"),
    title: "Full DLD Circulars and Guides",
    docType: "circular",
    issuer: "DLD",
    language: "en",
    libraryCategory: "general",
    sourceType: "pdf_disk",
    jurisdiction: "DLD",
  },
  {
    filePath: path.join(UPLOAD_DIR, "en-legislation.pdf"),
    title: "English Legislation Compilation",
    docType: "regulation",
    issuer: "DLD",
    language: "en",
    libraryCategory: "general",
    sourceType: "pdf_disk",
    jurisdiction: "DLD",
  },
];

// Regulations to fetch from URL (HTML content stored as text/plain)
const URL_REGULATIONS = [
  {
    title: "Law No. 14 of 2008 — Mortgages",
    url: "https://www.dubailand.gov.ae/en/laws-and-legislations/laws/law-no-14-of-2008-morgages#.html",
    docType: "regulation",
    issuer: "DLD",
    language: "en",
    libraryCategory: "mortgage",
    sourceType: "html",
    jurisdiction: "DLD",
    effectiveDate: "2008-01-01",
  },
  {
    title: "Law No. 13 of 2008 — Oqood (Off-Plan)",
    url: "https://www.dubailand.gov.ae/en/laws-and-legislations/laws/law-no-13-of-2008-pertaining-to-the-interim-real-estate-register-in-the-emirate-of-dubai#.html",
    docType: "regulation",
    issuer: "DLD",
    language: "en",
    libraryCategory: "oqood",
    sourceType: "html",
    jurisdiction: "DLD",
    effectiveDate: "2008-01-01",
  },
  {
    title: "Law No. 6 of 2019 — JOPOA (supersedes Law 27/2007)",
    url: "https://www.dubailand.gov.ae/en/laws-and-legislations/laws/law-no-6-of-2019-concerning-the-profile-of-the-jointly-owned-real-property#.html",
    docType: "regulation",
    issuer: "DLD",
    language: "en",
    libraryCategory: "general",
    sourceType: "html",
    jurisdiction: "DLD",
    effectiveDate: "2019-01-01",
    supersedes: "Law No. 27 of 2007 — Jointly Owned Property",
  },
  {
    title: "Law No. 27 of 2007 — Jointly Owned Property (superseded by Law 6/2019)",
    url: "https://www.dubailand.gov.ae/en/laws-and-legislations/laws/law-no-27-of-2007-on-jointly-owned-real-properties#.html",
    docType: "regulation",
    issuer: "DLD",
    language: "en",
    libraryCategory: "general",
    sourceType: "html",
    jurisdiction: "DLD",
    effectiveDate: "2007-01-01",
    supersededBy: "Law No. 6 of 2019 — JOPOA",
  },
  {
    title: "Resolution No. 30 of 2013 — Fees",
    url: "https://www.dubailand.gov.ae/en/laws-and-legislations/resolutions/resolution-no-30-of-2013#.html",
    docType: "fee_schedule",
    issuer: "DLD",
    language: "en",
    libraryCategory: "fees",
    sourceType: "html",
    jurisdiction: "DLD",
    effectiveDate: "2013-01-01",
  },
];

async function main() {
  console.log("=== Regulation Ingestion ===\n");

  await fs.mkdir(KB_DIR, { recursive: true });
  let ingested = 0;
  let skipped = 0;
  let failed = 0;

  // ── 1. Ingest PDFs from disk ──
  console.log("Phase 1: Ingesting PDFs from disk...\n");
  for (const pdf of DISK_PDFS) {
    try {
      const exists = await fs.access(pdf.filePath).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`  ⚠ SKIP (file not found): ${pdf.title} — ${pdf.filePath}`);
        failed++;
        continue;
      }

      const buffer = await fs.readFile(pdf.filePath);
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

      const existing = await db.knowledgeDoc.findUnique({ where: { fileHash } });
      if (existing) {
        console.log(`  ⏭ SKIP (already ingested): ${pdf.title}`);
        skipped++;
        continue;
      }

      const savedPath = await saveUploadedFile(buffer, fileHash, path.basename(pdf.filePath));

      // Extract text into chunks
      const chunks = await extractText(savedPath, "application/pdf");
      if (chunks.length === 0) {
        console.log(`  ⚠ SKIP (0 chunks extracted): ${pdf.title}`);
        failed++;
        continue;
      }

      const doc = await db.knowledgeDoc.create({
        data: {
          title: pdf.title,
          docType: pdf.docType,
          issuer: pdf.issuer,
          language: pdf.language,
          filePath: savedPath,
          fileHash,
          fileSize: buffer.length,
          mimeType: "application/pdf",
          status: "extracted",
          uploadedBy: "ingestion-script",
          sourceUrl: null,
          sourceType: pdf.sourceType,
          jurisdiction: pdf.jurisdiction,
          libraryCategory: pdf.libraryCategory,
        },
      });

      // Persist chunks
      const BATCH = 50;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        await db.docChunk.createMany({
          data: batch.map(c => ({
            docId: doc.id,
            sequence: c.sequence,
            pageNumber: c.pageNumber,
            sectionHeading: c.sectionHeading,
            text: c.text,
            tokenCount: c.tokenCount,
          })),
        });
      }

      console.log(`  ✓ INGESTED: ${pdf.title} (${chunks.length} chunks, ${(buffer.length / 1024).toFixed(0)}KB)`);
      ingested++;
    } catch (e: any) {
      console.error(`  ✗ FAILED: ${pdf.title} — ${e.message?.substring(0, 100)}`);
      failed++;
    }
  }

  // ── 2. Ingest regulations from URLs (HTML) ──
  console.log("\nPhase 2: Ingesting regulations from URLs...\n");
  const titleToDocId: Record<string, string> = {};

  for (const reg of URL_REGULATIONS) {
    try {
      // Fetch HTML content
      let htmlContent: string;
      try {
        const res = await fetch(reg.url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          console.log(`  ⚠ SKIP (HTTP ${res.status}): ${reg.title}`);
          failed++;
          continue;
        }
        htmlContent = await res.text();
      } catch (fetchErr: any) {
        console.log(`  ⚠ SKIP (fetch failed): ${reg.title} — ${fetchErr.message?.substring(0, 80)}`);
        failed++;
        continue;
      }

      // Strip HTML tags to get plain text
      const textContent = htmlContent
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (textContent.length < 100) {
        console.log(`  ⚠ SKIP (content too short: ${textContent.length} chars): ${reg.title}`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(textContent, "utf-8");
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

      const existing = await db.knowledgeDoc.findUnique({ where: { fileHash } });
      if (existing) {
        console.log(`  ⏭ SKIP (already ingested): ${reg.title}`);
        titleToDocId[reg.title] = existing.id;
        skipped++;
        continue;
      }

      const savedPath = await saveUploadedFile(buffer, fileHash, `${reg.title}.txt`);

      // Extract text into chunks (treat as text/plain)
      const chunks = await extractText(savedPath, "text/plain");
      if (chunks.length === 0) {
        console.log(`  ⚠ SKIP (0 chunks): ${reg.title}`);
        failed++;
        continue;
      }

      const doc = await db.knowledgeDoc.create({
        data: {
          title: reg.title,
          docType: reg.docType,
          issuer: reg.issuer,
          language: reg.language,
          effectiveDate: reg.effectiveDate ? new Date(reg.effectiveDate) : null,
          filePath: savedPath,
          fileHash,
          fileSize: buffer.length,
          mimeType: "text/plain",
          status: "extracted",
          uploadedBy: "ingestion-script",
          sourceUrl: reg.url,
          sourceType: reg.sourceType,
          jurisdiction: reg.jurisdiction,
          libraryCategory: reg.libraryCategory,
          supersededBy: reg.supersededBy ?? null,
        },
      });

      titleToDocId[reg.title] = doc.id;

      // Persist chunks
      for (let i = 0; i < chunks.length; i += 50) {
        const batch = chunks.slice(i, i + 50);
        await db.docChunk.createMany({
          data: batch.map(c => ({
            docId: doc.id,
            sequence: c.sequence,
            pageNumber: c.pageNumber,
            sectionHeading: c.sectionHeading,
            text: c.text,
            tokenCount: c.tokenCount,
          })),
        });
      }

      console.log(`  ✓ INGESTED: ${reg.title} (${chunks.length} chunks, ${(buffer.length / 1024).toFixed(0)}KB)`);
      ingested++;
    } catch (e: any) {
      console.error(`  ✗ FAILED: ${reg.title} — ${e.message?.substring(0, 100)}`);
      failed++;
    }
  }

  // ── 3. Establish supersession link ──
  console.log("\nPhase 3: Establishing supersession links...\n");
  const law62019 = await db.knowledgeDoc.findFirst({ where: { title: { contains: "Law No. 6 of 2019" } } });
  const law272007Fixed = await db.knowledgeDoc.findFirst({ where: { title: { contains: "Law No. 27 of 2007" } } });

  if (law62019 && law272007Fixed) {
    // Mark Law 27/2007 as superseded by Law 6/2019
    await db.knowledgeDoc.update({
      where: { id: law272007Fixed.id },
      data: {
        supersededAt: new Date("2019-01-01"),
        supersededBy: law62019.id,
      },
    });
    console.log(`  ✓ SUPERSESSION: Law 27/2007 (${law272007Fixed.id.substring(0, 8)}) → superseded by Law 6/2019 (${law62019.id.substring(0, 8)})`);
  } else {
    console.log("  ⚠ Supersession link not established (one or both docs not found)");
  }

  // ── Summary ──
  const totalDocs = await db.knowledgeDoc.count();
  const totalChunks = await db.docChunk.count();
  const byCategory = await db.knowledgeDoc.groupBy({
    by: ["libraryCategory"],
    _count: { _all: true },
  });

  console.log("\n=== Ingestion Summary ===");
  console.log(`Ingested: ${ingested} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Total KnowledgeDoc rows: ${totalDocs}`);
  console.log(`Total DocChunk rows: ${totalChunks}`);
  console.log("\nBy category:");
  for (const cat of byCategory) {
    console.log(`  ${(cat.libraryCategory ?? "uncategorized").padEnd(15)} ${cat._count._all} doc(s)`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
