// tests/fixtures/idp/generate-pdfs.ts
// IDP Foundation — Generate synthetic test PDFs (no external files, no PII).
// Creates: text-pdf.pdf (digital text layer), image-pdf.pdf (empty, no text), contract.pdf (text content)

import { PDFDocument, StandardFonts } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

const OUT_DIR = "/home/z/my-project/tests/fixtures/idp";

export async function generateTextPdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Emirates ID — Dubai Land Department Trustee Office Test Document", {
    x: 50, y: 800, size: 12, font,
  });
  page.drawText("Name: AHMED MOHAMED ALI", { x: 50, y: 770, size: 12, font });
  page.drawText("ID Number: 784-1985-1234567-8", { x: 50, y: 740, size: 12, font });
  const bytes = await doc.save();
  const outPath = path.join(OUT_DIR, "text-pdf.pdf");
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

export async function generateImageOnlyPdf(): Promise<string> {
  // An "image-only" PDF has NO text layer — simulate by creating a PDF
  // with an embedded blank image instead of text.
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // blank page — no text content
  const bytes = await doc.save();
  const outPath = path.join(OUT_DIR, "image-pdf.pdf");
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

export async function generateContractPdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("PROPERTY SALE CONTRACT — ARTICLE 4", { x: 50, y: 800, size: 14, font });
  page.drawText("Seller: DUBAI PROPERTIES LLC", { x: 50, y: 770, size: 11, font });
  page.drawText("Buyer: INVESTMENT HOLDINGS FZ-LLC", { x: 50, y: 750, size: 11, font });
  page.drawText("Property: DUBAI MARINA, TOWER 5, UNIT 1203", { x: 50, y: 730, size: 11, font });
  page.drawText("Sale Price: AED 5,500,000", { x: 50, y: 710, size: 11, font });
  const bytes = await doc.save();
  const outPath = path.join(OUT_DIR, "contract.pdf");
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

// Auto-generate on import if not present
export async function ensureFixtures(): Promise<void> {
  if (!fs.existsSync(path.join(OUT_DIR, "text-pdf.pdf"))) await generateTextPdf();
  if (!fs.existsSync(path.join(OUT_DIR, "image-pdf.pdf"))) await generateImageOnlyPdf();
  if (!fs.existsSync(path.join(OUT_DIR, "contract.pdf"))) await generateContractPdf();
}
