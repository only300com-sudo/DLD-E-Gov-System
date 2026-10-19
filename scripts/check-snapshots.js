const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const snapshots = await p.reportSnapshot.groupBy({
    by: ["snapshotType"],
    _count: { _all: true },
    _max: { computedAt: true },
    orderBy: { snapshotType: "asc" },
  });
  console.log("Snapshot counts per type (with most recent computedAt):");
  for (const s of snapshots) {
    console.log(`  ${s.snapshotType.padEnd(12)}: count=${s._count._all}, latest=${s._max.computedAt?.toISOString()}`);
  }
  await p.$disconnect();
})();
