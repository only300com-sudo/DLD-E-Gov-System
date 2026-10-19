import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const tables = ["ProcedureCatalog", "ProcedureWorkflowState", "WorkflowTransition", "MixpanelEventMap", "ProcedureWorkflowHistory"];
for (const t of tables) {
  const count = await (db as any)[t.charAt(0).toLowerCase() + t.slice(1)].count();
  console.log(`${t}: ${count} rows`);
}
await db.$disconnect();
