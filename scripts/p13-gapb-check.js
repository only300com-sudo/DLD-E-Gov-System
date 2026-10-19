// Find current button_reply automation rules + check if confirm_attendance rule exists
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rules = await db.waAutomationRule.findMany({ where: { trigger: "button_reply" } });
console.log("=== button_reply rules ===");
for (const r of rules) {
  console.log(`- id=${r.id} name="${r.name}" isActive=${r.isActive}`);
  console.log(`  conditions: ${r.conditions}`);
  console.log(`  actions: ${r.actions}`);
}
console.log("\n=== WaAutomationExecution sample (last 5 button-reply) ===");
const execs = await db.waAutomationExecution.findMany({ orderBy: { executedAt: "desc" }, take: 5, include: { rule: true } });
for (const e of execs) {
  console.log(`- id=${e.id} rule="${e.rule?.name}" convId=${e.conversationId} case=${e.caseNumber ?? "n/a"} status=${e.status}`);
  console.log(`  context: ${e.triggerContext}`);
  console.log(`  actionsRun: ${e.actionsRun}`);
}
console.log("\n=== Slots + Appointments state ===");
const slots = await db.appointmentSlot.findMany({ take: 5, orderBy: { date: "asc" } });
for (const s of slots) {
  console.log(`- slot ${s.id} svc=${s.serviceType} date=${s.date.toISOString().slice(0,10)} ${s.time} booked=${s.isBooked} apptId=${s.appointmentId ?? "null"}`);
}
const appts = await db.appointment.findMany({ take: 3, orderBy: { createdAt: "desc" }, select: { id: true, bookingRef: true, type: true, dateTime: true, attendees: true } });
console.log("\n=== Recent Appointments ===");
for (const a of appts) console.log(`- ${a.id} ref=${a.bookingRef} type=${a.type} when=${a.dateTime} who=${a.attendees}`);
await db.$disconnect();
