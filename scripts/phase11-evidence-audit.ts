// scripts/phase11-evidence-audit.ts
// Evidence 3: Raw audit rows for AI_REPLY_DRAFTED, AI_ESCALATION_TRIGGERED, AI_OUTPUT_BLOCKED, AI_PAUSED_FOR_HUMAN_TAKEOVER
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const ACTIONS = [
  "AI_REPLY_DRAFTED",
  "AI_ESCALATION_TRIGGERED",
  "AI_OUTPUT_BLOCKED",
  "AI_PAUSED_FOR_HUMAN_TAKEOVER",
];

for (const action of ACTIONS) {
  const rows = await p.auditLog.findMany({
    where: { action },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, action: true, details: true, userId: true, entityId: true, createdAt: true, hash: true },
  });
  console.log(`\n=== ${action} (${rows.length} most recent rows) ===`);
  for (const r of rows) {
    console.log(`\nROW:`);
    console.log(`  id: ${r.id}`);
    console.log(`  action: ${r.action}`);
    console.log(`  userId: ${r.userId ?? "system"}`);
    console.log(`  entityId: ${r.entityId ?? "n/a"}`);
    console.log(`  createdAt: ${r.createdAt.toISOString()}`);
    console.log(`  hash: ${r.hash?.slice(0, 24)}…`);
    console.log(`  details: ${r.details}`);
  }
}

await p.$disconnect();
