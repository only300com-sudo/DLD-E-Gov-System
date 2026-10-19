const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cs = await p.waContact.findMany({ select: { id: true, fullName: true, mobileE164: true, consentStatus: true, marketingConsent: true, preferredLanguage: true } });
  console.log('--- Contacts ---');
  for (const c of cs) console.log(JSON.stringify(c));
  const cr = await p.waConsentRecord.findMany({ select: { id: true, contactId: true, channel: true, purpose: true, status: true }, orderBy: { capturedAt: 'desc' }, take: 20 });
  console.log('--- Consents ---');
  for (const c of cr) console.log(JSON.stringify(c));
  const apps = await p.appointment.findMany({ take: 5, select: { id: true, caseRef: true, status: true, slotId: true, conversationId: true, contactId: true } });
  console.log('--- Appointments ---');
  for (const a of apps) console.log(JSON.stringify(a));
  await p.$disconnect();
})();
