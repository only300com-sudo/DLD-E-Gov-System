import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const p2 = await db.procedureCatalog.findMany({
  where: { priority: "P2" },
  select: { id: true, nameEn: true, category: true, isActive: true },
  orderBy: { id: "asc" },
});
console.log(`=== P2 procedures: ${p2.length} ===`);
for (let i = 0; i < p2.length; i++) {
  console.log(`${(i+1).toString().padStart(2, ' ')}. ${p2[i].id} — ${p2[i].nameEn} [${p2[i].category}] active=${p2[i].isActive}`);
}

// Also check: was RESTR-SALE-MORT-001 seeded as P1 or P2?
const restr = await db.procedureCatalog.findUnique({
  where: { id: "RESTR-SALE-MORT-001" },
  select: { id: true, priority: true, nameEn: true },
});
console.log(`\n=== RESTR-SALE-MORT-001 (duplicate check) ===`);
console.log(`  priority=${restr?.priority} name=${restr?.nameEn}`);

// Was CFG-EIDA-001 included?
const eida = await db.procedureCatalog.findUnique({
  where: { id: "CFG-EIDA-001" },
  select: { id: true, nameEn: true, category: true },
});
console.log(`\n=== CFG-EIDA-001 (config vs procedure check) ===`);
console.log(`  exists=${!!eida} name=${eida?.nameEn} category=${eida?.category}`);

const total = await db.procedureCatalog.count();
console.log(`\nTotal catalog: ${total}`);
await db.$disconnect();
