import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const BASE = "http://localhost:3000";

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const sess = await loginRes.json();

// Use TOP-2026-0005 which is in UNDER_OFFICER_REVIEW (in Ready column)
// Drag it to Pending Confirmation by calling return_for_correction (UNDER_OFFICER_REVIEW → RETURNED_FOR_CORRECTION)
const c = await p.case.findFirst({ where: { caseRef: "TOP-2026-0005" }, select: { id: true, caseRef: true, status: true } });
console.log(`Case: ${c?.caseRef}, status: ${c?.status}`);

const res = await fetch(`${BASE}/api/cases/${c!.id}/action`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.token}`, "X-CSRF-Token": sess.csrfToken },
  body: JSON.stringify({ action: "return_for_correction", reason: "Dragged to Pending Confirmation column — color grid drag-drop test" }),
});
const d = await res.json();
console.log(`HTTP ${res.status}, ok: ${d.ok}, new status: ${d.case?.status ?? d.error}`);

const since = new Date(Date.now() - 30_000);
const audits = await p.auditLog.findMany({
  where: { createdAt: { gte: since }, entityId: c!.id },
  orderBy: { createdAt: "desc" },
  take: 5,
  select: { id: true, action: true, details: true, createdAt: true, entityId: true, caseId: true },
});
console.log(`\nAudit rows (${audits.length}):`);
for (const a of audits) {
  console.log(`  id: ${a.id}`);
  console.log(`  action: ${a.action}`);
  console.log(`  entityId: ${a.entityId}`);
  console.log(`  caseId: ${a.caseId ?? "n/a"}`);
  console.log(`  createdAt: ${a.createdAt.toISOString()}`);
  console.log(`  details: ${a.details}`);
  console.log(`  ---`);
}
await p.$disconnect();
