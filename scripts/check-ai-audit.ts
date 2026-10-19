import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const since = new Date(Date.now() - 60 * 60 * 1000); // last 1h
const audits = await p.auditLog.findMany({
  where: { createdAt: { gte: since }, action: { startsWith: "AI_" } },
  orderBy: { createdAt: "desc" },
  take: 50,
  select: { action: true, details: true, createdAt: true },
});
const types = new Set(audits.map(a => a.action));
console.log(`AI audit entries in last 1h: ${audits.length}`);
console.log(`Action types found (${types.size}):`);
for (const t of Array.from(types).sort()) console.log(`  ${t}`);
const required = ["AI_REPLY_DRAFTED", "AI_OUTPUT_BLOCKED", "AI_ESCALATION_TRIGGERED", "AI_ESCALATION_ACKNOWLEDGED", "AI_ESCALATION_RESOLVED", "AI_DRAFT_APPROVED", "AI_DRAFT_EDITED", "AI_DRAFT_REJECTED", "AI_PAUSED_FOR_HUMAN_TAKEOVER", "AI_RESUMED", "AI_PROMPT_ACTIVATED", "AI_MODEL_CONFIG_UPDATED"];
const missing = required.filter(t => !types.has(t));
console.log(`\nRequired but missing: ${missing.length === 0 ? "NONE — all present" : missing.join(", ")}`);
await p.$disconnect();
