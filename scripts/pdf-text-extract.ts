// Use pdf-lib to extract text operators from each page
import { PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";
import fs from "fs/promises";

const buf = await fs.readFile("/home/z/my-project/download/watermarked-3-page-document.pdf");
const doc = await PDFDocument.load(buf, { ignoreEncryption: true });

console.log(`Total pages: ${doc.getPageCount()}`);

for (let i = 0; i < doc.getPageCount(); i++) {
  const page = doc.getPages()[i];
  console.log(`\nPage ${i + 1}:`);
  // Look at the page contents stream
  const node = page.node;
  const contents = node.Contents();
  if (contents) {
    // Get the stream data
    const refs = contents.asArray ? contents.asArray() : [contents];
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      if (stream && 'getContents' in stream) {
        try {
          const raw = stream.getContents();
          console.log(`  Stream length: ${raw.length} bytes`);
          // Look for text operators: Tj, TJ, ', "
          const text = Buffer.from(raw).toString('latin1');
          const tjMatches = text.match(/\(([^)]+)\)\s*Tj/g);
          if (tjMatches) {
            console.log(`  Text strings found: ${tjMatches.length}`);
            const firstFew = tjMatches.slice(0, 5).map(m => m.replace(/\)$/, ' Tj'));
            console.log(`  First 5:`, firstFew);
          }
        } catch (e) {
          console.log(`  Error: ${(e as Error).message}`);
        }
      }
    }
  }
}
