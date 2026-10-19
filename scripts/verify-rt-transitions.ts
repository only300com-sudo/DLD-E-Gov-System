import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const transitions = await db.workflowTransition.findMany({ orderBy: { id: "asc" } });
console.log("=== All transitions ===");
for (const t of transitions) {
  console.log(`  ${t.id}: ${t.fromState} → ${t.toState} | trigger=${t.triggerType}/${t.triggerId ?? "null"} | role=${t.requiresRole ?? "any"} | event=${t.mixpanelEvent ?? "none"}`);
}
console.log(`\nTotal: ${transitions.length}`);
await db.$disconnect();
