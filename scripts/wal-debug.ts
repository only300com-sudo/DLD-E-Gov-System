import { db } from "@/lib/db";
const result = await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);") as any[];
console.log("Result count:", result.length);
if (result[0]) {
  const row = result[0];
  console.log("Keys:", Object.keys(row));
  for (const [k, v] of Object.entries(row)) {
    console.log(`  ${k}:`, typeof v, v?.toString());
  }
}
await db.$disconnect();
process.exit(0);
