import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const BASE = "http://localhost:3000";

// Login as reception
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "reception@trustee.ae", password: "trustee123" }),
});
const sess = await loginRes.json();
console.log("Login:", sess.ok, sess.user?.name);

const c = await p.case.findFirst({ where: { caseRef: "TOP-2026-0005" }, select: { id: true, caseRef: true, status: true } });
console.log(`Case: ${c?.caseRef}, status: ${c?.status}, id: ${c?.id}`);

const res = await fetch(`${BASE}/api/cases/${c!.id}/action`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.token}`, "X-CSRF-Token": sess.csrfToken },
  body: JSON.stringify({ action: "re_delegate", reason: "Color grid drag-drop test — docs ready" }),
});
const data = await res.json();
console.log(`HTTP ${res.status}`);
console.log(`Response:`, JSON.stringify(data, null, 2).slice(0, 500));

await p.$disconnect();
