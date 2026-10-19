// P13 Gap B — fire button reply automation directly via the TS function.
// Tests the full flow: button_id="confirm_attendance:<slotId>" → confirmAppointment()
// + appointment_confirmation template → Appointment row + slot booked + WhatsApp stub.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Dynamically import the TS module via bun
const { fireButtonReplyAutomation } = await import("/home/z/my-project/src/lib/services/whatsapp/buttonReplyAutomation.ts");

// Find the conversation + slot to use
const conv = await db.waConversation.findFirst({
  where: { caseNumber: "TOP-2026-0001", status: "open" },
  include: { contact: true },
});
if (!conv) throw new Error("No conversation with caseNumber=TOP-2026-0001");

const slot = await db.appointmentSlot.findFirst({
  where: { isBooked: false },
  orderBy: { date: "asc" },
});
if (!slot) throw new Error("No unbooked slot available");
console.log("=== Gap B verification ===");
console.log(`Conversation: ${conv.id} (case=${conv.caseNumber}, contact=${conv.contact?.fullName})`);
console.log(`Slot: ${slot.id} date=${slot.date.toISOString().slice(0,10)} ${slot.time} booked=${slot.isBooked}`);
console.log(`\nFiring automation with button_id="confirm_attendance:${slot.id}"...`);

const result = await fireButtonReplyAutomation({
  conversationId: conv.id,
  buttonId: `confirm_attendance:${slot.id}`,
  caseNumber: conv.caseNumber,
});

console.log(`\nFired: ${result.fired}, executionId=${result.executionId ?? "n/a"}`);

// Look up the resulting execution + appointment + slot
console.log("\n=== WaAutomationExecution row ===");
const exec = await db.waAutomationExecution.findUnique({
  where: { id: result.executionId },
  include: { rule: true },
});
if (exec) {
  console.log(`id=${exec.id}`);
  console.log(`rule="${exec.rule?.name}"`);
  console.log(`conversationId=${exec.conversationId}`);
  console.log(`caseNumber=${exec.caseNumber}`);
  console.log(`status=${exec.status}`);
  console.log(`triggerContext=${exec.triggerContext}`);
  console.log(`actionsRun=${exec.actionsRun}`);
}

// Slot state
console.log("\n=== Slot after ===");
const slotAfter = await db.appointmentSlot.findUnique({ where: { id: slot.id } });
console.log(`id=${slotAfter?.id}`);
console.log(`isBooked=${slotAfter?.isBooked}`);
console.log(`bookedBy=${slotAfter?.bookedBy ?? "null"}`);
console.log(`bookedAt=${slotAfter?.bookedAt ?? "null"}`);
console.log(`appointmentId=${slotAfter?.appointmentId ?? "null"}`);

// Appointment row
console.log("\n=== Appointment row created ===");
if (slotAfter?.appointmentId) {
  const appt = await db.appointment.findUnique({ where: { id: slotAfter.appointmentId } });
  if (appt) {
    console.log(`id=${appt.id}`);
    console.log(`bookingRef=${appt.bookingRef}`);
    console.log(`type=${appt.type}`);
    console.log(`dateTime=${appt.dateTime}`);
    console.log(`attendees=${appt.attendees}`);
    console.log(`caseId=${appt.caseId ?? "null"}`);
    console.log(`notes=${appt.notes}`);
  } else {
    console.log("Appointment NOT found");
  }
} else {
  console.log("No appointmentId set on slot — booking failed");
}

// Latest WaMessage (should be the outbound appointment_confirmation template)
console.log("\n=== WhatsApp stub log ===");
const lastMsg = await db.waMessage.findFirst({
  where: { conversationId: conv.id, direction: "outbound" },
  orderBy: { sentAt: "desc" },
});
if (lastMsg) {
  console.log(`id=${lastMsg.id}`);
  console.log(`externalMessageId=${lastMsg.externalMessageId}`);
  console.log(`templateName=${lastMsg.templateName ?? "n/a"}`);
  console.log(`messageType=${lastMsg.messageType}`);
  console.log(`direction=${lastMsg.direction}`);
  console.log(`content=${(lastMsg.content ?? "").slice(0, 200)}`);
} else {
  console.log("No outbound WaMessage found");
}

// Audit entries
console.log("\n=== Audit entries ===");
const audits = await db.auditLog.findMany({
  where: { entityId: exec?.id ?? "", action: "WHATSAPP_AUTOMATION_EXECUTED" },
  orderBy: { createdAt: "desc" },
  take: 3,
});
for (const a of audits) {
  console.log(`- ${a.createdAt.toISOString()} ${a.action}`);
  console.log(`  ${a.details}`);
}
const apptAudits = await db.auditLog.findMany({
  where: { action: "APPOINTMENT_CONFIRMED_VIA_WHATSAPP" },
  orderBy: { createdAt: "desc" },
  take: 2,
});
for (const a of apptAudits) {
  console.log(`- ${a.createdAt.toISOString()} ${a.action}`);
  console.log(`  ${a.details}`);
}

console.log("\n=== PASS/FAIL ===");
const pass = exec?.status === "success" && slotAfter?.isBooked === true && slotAfter?.appointmentId !== null && lastMsg !== null;
console.log(pass ? "✓ PASS — Appointment booked + slot marked + WhatsApp confirmation sent + execution row recorded" : "✗ FAIL");

await db.$disconnect();
process.exit(pass ? 0 : 1);
