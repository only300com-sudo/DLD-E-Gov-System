const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Delete all SecureLinks created after 7:00 today (test artifacts only)
  const r = await p.secureLink.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  console.log('Deleted test secure links:', r.count);
  // Also delete associated audit entries + WaMessages
  await p.auditLog.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  await p.waMessage.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  // Also un-book any appointments created today
  const appts = await p.appointment.findMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  for (const a of appts) {
    await p.appointmentSlot.updateMany({ where: { appointmentId: a.id }, data: { isBooked: false, bookedBy: null, bookedAt: null, appointmentId: null } });
    await p.appointment.delete({ where: { id: a.id } });
  }
  console.log('Deleted appointments:', appts.length);
  // Delete test automations, routing rules, templates
  await p.waAutomationRule.deleteMany({ where: { name: { contains: 'Phase 9.1' } } });
  await p.waRoutingRule.deleteMany({ where: { name: { contains: 'Phase 9.1' } } });
  await p.waTemplate.deleteMany({ where: { name: { contains: 'phase91' } } });
  await p.$disconnect();
  console.log('Done.');
})();
