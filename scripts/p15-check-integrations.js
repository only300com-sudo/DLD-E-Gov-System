import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const integrations = await db.integrationConfig.findMany({ orderBy: { key: "asc" } });
console.log(`=== ${integrations.length} IntegrationConfig rows ===`);
for (const i of integrations) {
  console.log(`- ${i.key} (${i.displayName}) category=${i.category} mode=${i.mode} isEnabled=${i.isEnabled} health=${i.healthStatus}`);
}
const mockLogs = await db.mockRequestLog.count();
console.log(`\nMockRequestLog count: ${mockLogs}`);
await db.$disconnect();
