// scripts/create-test-pdf.ts
// Generates a 3-page PDF with visible text content (so the watermark can be seen).
// Saves to /home/z/my-project/download/sample-3-page-document.pdf

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pagesContent = [
    "PAGE 1 — Trustee Operations Portal",
    "Confidential Document Sample\n\nThis is a sample 3-page PDF generated for watermark verification.\n\nThe watermark overlay should appear tiled across this page at 15% opacity,\nrotated 45°, with the text:\n  {viewerName} · {viewerRole} · {ISO timestamp} · {caseNumber}",
    "PAGE 2 — Multi-page test content\n\nEach page should receive the watermark overlay independently.\n\nThis page is intentionally text-heavy to demonstrate the tiled watermark.",
    "PAGE 3 — Final page\n\nAfter previewing, you should see the watermark on every page.",
  ];

  for (const content of pagesContent) {
    const page = doc.addPage([595, 842]); // A4
    page.drawText(content, {
      x: 50,
      y: 750,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await doc.save();
  const outPath = "/home/z/my-project/download/sample-3-page-document.pdf";
  await Bun.write(outPath, pdfBytes);
  console.log(`Test PDF written: ${outPath} (${pdfBytes.length} bytes)`);
}

main().catch(e => { console.error(e); process.exit(1); });
