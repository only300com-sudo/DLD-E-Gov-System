// Update the "Appointment Confirmation Reply" rule's conditions + actions so:
// - conditions use button_id_prefix so we match "confirm_attendance:<slotId>" button IDs
// - actions = [confirm_appointment] only — confirmAppointment() already sends the
//   appointment_confirmation WhatsApp template internally (Phase 9 spec)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const ruleId = "cmuqk2fhq0000nrylinggjknz"; // existing "Appointment Confirmation Reply" rule

await db.waAutomationRule.update({
  where: { id: ruleId },
  data: {
    conditions: JSON.stringify({ button_id_prefix: "confirm_attendance" }),
    actions: JSON.stringify([
      { type: "confirm_appointment" },
    ]),
  },
});

const r = await db.waAutomationRule.findUnique({ where: { id: ruleId } });
console.log("=== Updated rule ===");
console.log(`id=${r.id} name="${r.name}" isActive=${r.isActive}`);
console.log(`conditions: ${r.conditions}`);
console.log(`actions: ${r.actions}`);

// Create a fresh unbooked slot for the test
const slot = await db.appointmentSlot.create({
  data: {
    date: new Date(Date.now() + 14 * 86400_000), // 2 weeks from now (avoid clobbering existing slots)
    time: "13:00",
    durationMinutes: 30,
    serviceType: "trustee_appointment",
    isBooked: false,
  },
});
console.log(`\n=== Fresh slot created ===`);
console.log(`slotId=${slot.id} date=${slot.date.toISOString().slice(0,10)} ${slot.time} booked=${slot.isBooked}`);

await db.$disconnect();
