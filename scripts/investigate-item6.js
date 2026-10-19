const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
(async () => {
  const docs = await p.document.findMany({
    take: 20,
    select: { id: true, docName: true, fileName: true, filePath: true, caseNumber: true, clientCode: true, documentCategory: true, docType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log("All recent documents:");
  for (const d of docs) {
    const followsPattern = d.filePath && /Clients\/[^/]+\/[^/]+\/[^/]+/.test(d.filePath);
    console.log(`  ${followsPattern ? '✓' : '✗'} | ${d.docType} | ${d.docName} | cat=${d.documentCategory} | path=${d.filePath}`);
  }
  const nonMatching = docs.filter(d => !(d.filePath && /Clients\/[^/]+\/[^/]+\/[^/]+/.test(d.filePath)));
  console.log(`\nNon-matching documents: ${nonMatching.length}`);
  for (const d of nonMatching) {
    console.log(`  ID: ${d.id}`);
    console.log(`  Type: ${d.docType}`);
    console.log(`  Name: ${d.docName}`);
    console.log(`  Category: ${d.documentCategory}`);
    console.log(`  Path: ${d.filePath}`);
    console.log(`  Case: ${d.caseNumber} | Client: ${d.clientCode}`);
    console.log(`  Created: ${d.createdAt.toISOString()}`);
    console.log('---');
  }
  await p.$disconnect();
})();
