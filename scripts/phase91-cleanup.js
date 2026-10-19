// Clean up Phase 9.1 verification artifacts so the script can re-run cleanly.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Revoke the slot booking so we can re-book
  const slotId = 'cmup6o5b8009pphbu3q2imr6k';
  const existingAppt = await p.appointment.findFirst({ where: { bookingRef: { startsWith: 'WA-' } }, orderBy: { createdAt: 'desc' } });
  if (existingAppt) {
    await p.appointmentSlot.updateMany({ where: { appointmentId: existingAppt.id }, data: { isBooked: false, bookedBy: null, bookedAt: null, appointmentId: null } });
    await p.appointment.delete({ where: { id: existingAppt.id } });
    console.log('Cleaned: deleted appointment + reset slot');
  } else {
    // Still reset the slot if it's still booked but no appointment was created
    const slot = await p.appointmentSlot.findUnique({ where: { id: slotId } });
    if (slot?.isBooked && !slot.appointmentId) {
      await p.appointmentSlot.update({ where: { id: slotId }, data: { isBooked: false, bookedBy: null, bookedAt: null } });
      console.log('Reset orphaned slot');
    }
  }

  // Clean the Phase 9.1 verification rule + template + link
  const r = await p.waAutomationRule.deleteMany({ where: { name: { contains: 'Phase 9.1 Verification' } } });
  console.log('Deleted automation rules:', r.count);
  const r2 = await p.waRoutingRule.deleteMany({ where: { name: { contains: 'Phase 9.1 Verification' } } });
  console.log('Deleted routing rules:', r2.count);
  const t = await p.waTemplate.deleteMany({ where: { name: { contains: 'phase91' } } });
  console.log('Deleted templates:', t.count);
  const l = await p.secureLink.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  console.log('Deleted secure links:', l.count);

  // Also delete the WaMessages from the test sends
  const m = await p.waMessage.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  console.log('Deleted WaMessages:', m.count);

  // Delete APPOINTMENT_CONFIRMED_VIA_WHATSAPP / SECURE_LINK_REVOKED / etc audit entries from the test
  const a = await p.auditLog.deleteMany({ where: { createdAt: { gt: new Date('2026-10-01T07:00:00Z') } } });
  console.log('Deleted audit logs:', a.count);

  await p.$disconnect();
})();
