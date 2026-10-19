import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const BASE = "http://localhost:3000";

// Mark the outstanding fee as paid so re-delegation isn't blocked
await p.feeLine.updateMany({
  where: { caseNumber: "TOP-2026-0005", status: "partially_paid" },
  data: { status: "paid", paidFils: 2100000, outstandingFils: 0 },
});
console.log("Updated fee lines for TOP-2026-0005");

// Login as reception
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
  body: JSON.stringify({ action: "re_delegate", reason: "Color grid drag-drop test — all docs ready" }),
});
const d = await res.json();
console.log(`HTTP ${res.status}, ok: ${d.ok}, status: ${d.case?.status}, delegationMode: ${d.case?.delegationMode}`);

// Check ALL recent audits
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
