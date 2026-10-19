// Move the legacy phase91-test-emirates-id.pdf from staging to the structured path
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
const path = require('path');
(async () => {
  const docs = await p.document.findMany({
    where: { docType: 'SECURE_UPLOAD' },
    select: { id: true, docName: true, filePath: true, caseNumber: true, clientCode: true, documentCategory: true },
  });
  console.log(`Found ${docs.length} legacy SECURE_UPLOAD documents to migrate`);
  for (const d of docs) {
    if (d.filePath && /Clients\/[^/]+\/[^/]+\/[^/]+/.test(d.filePath)) {
      console.log(`  ✓ already structured: ${d.docName}`);
      continue;
    }
    if (!fs.existsSync(d.filePath)) {
      console.log(`  ✗ file not on disk: ${d.filePath}`);
      continue;
    }
    // Build the structured path
    const caseRow = await p.case.findFirst({
      where: { caseRef: d.caseNumber },
      select: { id: true, serviceId: true, service: { select: { internalCode: true } }, client: { select: { internalId: true, fullNameEn: true } } },
    });
    if (!caseRow) {
      console.log(`  ✗ case not found for ${d.caseNumber}`);
      continue;
    }
    const clientFolderPart = `${d.clientCode}_${caseRow.client?.fullNameEn?.replace(/[^a-zA-Z0-9]+/g, '_') ?? 'Unknown'}`;
    const serviceCode = caseRow.service?.internalCode ?? 'GENERIC';
    const caseFolderPart = `${d.caseNumber}_${serviceCode}`;
    const categoryFolder = '09_Documents_Received_via_Secure_Link';
    const fileName = `${d.clientCode}_${d.caseNumber}_${serviceCode}_SECURE_UPLOAD_V01_${new Date().toISOString().slice(0,10)}.pdf`;
    const newPath = `/home/z/my-project/TrusteeCenterData/Clients/${clientFolderPart}/${caseFolderPart}/${categoryFolder}/${fileName}`;
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.copyFileSync(d.filePath, newPath);
    await p.document.update({ where: { id: d.id }, data: { filePath: newPath, documentCategory: categoryFolder } });
    console.log(`  ✓ migrated ${d.docName} → ${newPath}`);
  }
  await p.$disconnect();
})();
