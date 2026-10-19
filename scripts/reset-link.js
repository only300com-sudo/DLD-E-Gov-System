const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Reset demo_active_link_token_123 to be reusable
  await p.secureLink.update({
    where: { token: 'demo_active_link_token_123' },
    data: { usedCount: 0, accessedAt: null, accessedFrom: null },
  });
  // Delete the SecureLinkUpload + Document rows from the previous upload
  const link = await p.secureLink.findUnique({ where: { token: 'demo_active_link_token_123' } });
  const deleted = await p.secureLinkUpload.deleteMany({ where: { secureLinkId: link.id } });
  console.log('Deleted SecureLinkUpload rows:', deleted.count);
  // Also delete the test Document row
  const docsDeleted = await p.document.deleteMany({ where: { caseNumber: 'TOP-2026-0001', docType: 'SECURE_UPLOAD', docName: 'phase91-test-emirates-id.pdf' } });
  console.log('Deleted Document rows:', docsDeleted.count);
  await p.$disconnect();
})();
