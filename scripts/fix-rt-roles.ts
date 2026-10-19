import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // Item 2: t-016 received → cancelled — change requiresRole from officer to admin
  // Cancelling a received (live TABU) procedure is a legal event requiring admin approval
  const t016 = await db.workflowTransition.update({
    where: { id: "t-016" },
    data: { requiresRole: "admin" },
  });
  console.log(`Updated t-016: ${t016.fromState} → ${t016.toState} | role=${t016.requiresRole}`);

  // Item 2: t-019 received → rejected — change requiresRole from auditor to admin
  // Rejecting a received (live TABU) procedure is a legal event requiring admin approval
  const t019 = await db.workflowTransition.update({
    where: { id: "t-019" },
    data: { requiresRole: "admin" },
  });
  console.log(`Updated t-019: ${t019.fromState} → ${t019.toState} | role=${t019.requiresRole}`);

  // Verify
  const t16 = await db.workflowTransition.findUnique({ where: { id: "t-016" } });
  const t19 = await db.workflowTransition.findUnique({ where: { id: "t-019" } });
  console.log(`\nVerification:`);
  console.log(`  t-016: ${t16?.fromState} → ${t16?.toState} | role=${t16?.requiresRole} (expected admin)`);
  console.log(`  t-019: ${t19?.fromState} → ${t19?.toState} | role=${t19?.requiresRole} (expected admin)`);

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
