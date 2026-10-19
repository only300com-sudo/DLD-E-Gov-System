import { PDFDocument } from "pdf-lib";
import fs from "fs/promises";

const buf = await fs.readFile("/home/z/my-project/download/watermarked-3-page-document.pdf");
const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
console.log(`Pages: ${doc.getPageCount()}`);
console.log("");
for (let i = 0; i < doc.getPageCount(); i++) {
  const page = doc.getPages()[i];
  const ops = await page.getOperators?.() ?? [];
  console.log(`Page ${i+1} — operators: ${ops.length}`);
  // Try to extract text operators
  let textCount = 0;
  for (const op of ops) {
    if (op.operator === "Tj" || op.operator === "TJ" || op.operator === "'") {
      textCount++;
    }
  }
  console.log(`  Text operators: ${textCount}`);
}
