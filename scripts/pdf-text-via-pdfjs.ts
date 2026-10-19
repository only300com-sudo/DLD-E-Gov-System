import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs/promises";

const buf = await fs.readFile("/home/z/my-project/download/watermarked-3-page-document.pdf");
const data = new Uint8Array(buf);
const doc = await pdfjsLib.getDocument({ data }).promise;
console.log("Total pages:", doc.numPages);

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const strings = content.items.map((item: any) => item.str).filter(s => s.trim());
  console.log(`\n=== Page ${i} ===`);
  console.log(`Text items: ${strings.length}`);
  // Look for watermark pattern — should contain "System Administrator", "ADMIN", or "TOP-2026-0001"
  const watermarkStrings = strings.filter(s => s.includes("System Administrator") || s.includes("ADMIN") || s.includes("TOP-2026") || s.includes("admin"));
  console.log(`Watermark-matching items: ${watermarkStrings.length}`);
  if (watermarkStrings.length > 0) {
    console.log(`  Sample watermarks (first 5):`);
    watermarkStrings.slice(0, 5).forEach(s => console.log(`    "${s}"`));
  }
  if (i === 1) {
    console.log(`  All strings on page 1 (first 20):`);
    strings.slice(0, 20).forEach(s => console.log(`    "${s}"`));
  }
}
