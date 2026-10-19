import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// Reset case to RETURNED_FOR_CORRECTION
await p.case.update({ where: { caseRef: "TOP-2026-0005" }, data: { status: "RETURNED_FOR_CORRECTION" as any } });

// Login as reception
const BASE = "http://localhost:3000";
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "reception@trustee.ae", password: "trustee123" }),
});
const sess = await loginRes.json();

// Find case
const c = await p.case.findFirst({ where: { caseRef: "TOP-2026-0005" }, select: { id: true, caseRef: true, status: true } });
console.log(`Case: ${c?.caseRef}, status: ${c?.status}`);

// Re-delegate
const res = await fetch(`${BASE}/api/cases/${c!.id}/action`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.token}`, "X-CSRF-Token": sess.csrfToken },
  body: JSON.stringify({ action: "re_delegate", reason: "Color grid drag-drop test — docs ready for officer" }),
});
const d = await res.json();
console.log(`Re-delegate: ok=${d.ok}, case.status=${d.case?.status}, case.delegationMode=${d.case?.delegationMode}`);

// Now check ALL recent audits with no filter on action
const since = new Date(Date.now() - 30_000);
const allAudits = await p.auditLog.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: "desc" },
  take: 10,
  select: { id: true, action: true, details: true, createdAt: true, entityId: true, caseId: true },
});
console.log(`\nRecent audits (last 30s): ${allAudits.length}`);
for (const a of allAudits) {
  console.log(`  ${a.createdAt.toISOString()} | ${a.action} | entityId=${a.entityId?.slice(-6) ?? "n/a"} | caseId=${a.caseId?.slice(-6) ?? "n/a"} | ${a.details?.slice(0, 120)}`);
}

await p.$disconnect();
