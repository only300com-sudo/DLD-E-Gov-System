const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const sl = await p.secureLink.findMany({
    select: { id: true, token: true, isRevoked: true, caseNumber: true, purpose: true, usedCount: true, maxUses: true, createdAt: true, expiresAt: true, revokedAt: true }
  });
  console.log('--- SecureLinks (count=' + sl.length + ') ---');
  for (const s of sl) console.log(JSON.stringify(s));
  const slots = await p.appointmentSlot.findMany({ select: { id: true, isBooked: true, date: true, time: true, serviceType: true, appointmentId: true }, take: 10 });
  console.log('--- Slots (count=' + slots.length + ') ---');
  for (const s of slots) console.log(JSON.stringify(s));
  const tpls = await p.waTemplate.findMany({ select: { id: true, name: true, language: true, metaStatus: true, isActive: true, bodyEn: true, bodyAr: true } });
  console.log('--- Templates ---');
  for (const t of tpls) console.log(JSON.stringify({ id: t.id, name: t.name, lang: t.language, status: t.metaStatus, active: t.isActive, bodyEnLen: (t.bodyEn||'').length, bodyArLen: (t.bodyAr||'').length }));
  const auto = await p.waAutomationRule.findMany({ select: { id: true, name: true, trigger: true, priority: true, isActive: true } });
  console.log('--- Automations (count=' + auto.length + ') ---');
  for (const a of auto) console.log(JSON.stringify(a));
  const rt = await p.waRoutingRule.findMany({ select: { id: true, name: true, priority: true, isActive: true } });
  console.log('--- Routing Rules (count=' + rt.length + ') ---');
  for (const r of rt) console.log(JSON.stringify(r));
  await p.$disconnect();
})();
