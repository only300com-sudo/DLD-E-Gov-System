import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // Fix 1: USF-SALE-001 was seeded in P2 without pending_smart_app
  // The P3 spec lists it as smart-app-enabled. Update the P2 row.
  const usfSale = await db.procedureCatalog.findUnique({ where: { id: "USF-SALE-001" } });
  if (usfSale) {
    const states = JSON.parse(usfSale.workspaceStates) as string[];
    if (!states.includes("pending_smart_app")) {
      // Insert after draft (same pattern as other smart-app procedures)
      states.splice(1, 0, "pending_smart_app");
      await db.procedureCatalog.update({
        where: { id: "USF-SALE-001" },
        data: { workspaceStates: JSON.stringify(states) },
      });
      console.log(`Updated USF-SALE-001: added pending_smart_app → ${states.length} states`);
    }
  }

  // Verify final counts
  const total = await db.procedureCatalog.count();
  const p1 = await db.procedureCatalog.count({ where: { priority: "P1" } });
  const p2 = await db.procedureCatalog.count({ where: { priority: "P2" } });
  const p3 = await db.procedureCatalog.count({ where: { priority: "P3" } });
  const smartApp = await db.procedureCatalog.count({ where: { workspaceStates: { contains: "pending_smart_app" } } });
  const preRegWithNotReceived = await db.procedureCatalog.count({
    where: { id: { contains: "-PRE-" }, workspaceStates: { contains: "not_received" } },
  });
  const states = await db.procedureWorkflowState.count();
  const trans = await db.workflowTransition.count();
  const events = await db.mixpanelEventMap.count();

  console.log(`\n=== Final Verification ===`);
  console.log(`Total: ${total} (expected 103) ✓=${total === 103}`);
  console.log(`P1: ${p1} | P2: ${p2} | P3: ${p3}`);
  console.log(`Smart-app: ${smartApp} (expected 10) ✓=${smartApp === 10}`);
  console.log(`Pre-reg WITH not_received: ${preRegWithNotReceived} (expected 0) ✓=${preRegWithNotReceived === 0}`);
  console.log(`States: ${states} (expected 8) ✓=${states === 8}`);
  console.log(`Transitions: ${trans} (expected 19) ✓=${trans === 19}`);
  console.log(`Events: ${events} (expected 12) ✓=${events === 12}`);

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
