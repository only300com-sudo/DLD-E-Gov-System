// Phase 16.5 Gap 3 — seed 2 cases in untested statuses
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Find an existing client + officer + service to use
const client = await db.client.findFirst({ where: { internalId: "C-2026-0001" } });
const officer = await db.user.findFirst({ where: { role: "TRUSTEE_OFFICER", name: "Khalid Al Rashid" } });
const service = await db.serviceCatalogItem.findFirst();
const branch = await db.branch.findFirst();

if (!client || !officer || !service) {
  console.log("Missing prerequisites:", { client: !!client, officer: !!officer, service: !!service });
  process.exit(1);
}

// 1. Case in UNDER_OFFICER_REVIEW (assigned to Officer Khalid)
const officerCase = await db.case.create({
  data: {
    caseRef: `TOP-2026-OFFICER`,
    clientId: client.id,
    serviceId: service.id,
    branchId: branch?.id,
    receptionAdminId: (await db.user.findFirst({ where: { role: "RECEPTION_ADMIN" } }))?.id,
    trusteeOfficerId: officer.id,
    status: "UNDER_OFFICER_REVIEW",
    priority: "HIGH",
    submittedAt: new Date(),
    internalNotes: "Phase 16.5 verification seed — case assigned to Officer Khalid for review",
  },
});
console.log(`Created case ${officerCase.caseRef} (status=UNDER_OFFICER_REVIEW, officer=${officer.name})`);

// 2. Case in MANAGER_APPROVED_READY_FOR_DLD
const managerApproved = await db.case.create({
  data: {
    caseRef: `TOP-2026-DLD-READY`,
    clientId: client.id,
    serviceId: service.id,
    branchId: branch?.id,
    receptionAdminId: (await db.user.findFirst({ where: { role: "RECEPTION_ADMIN" } }))?.id,
    trusteeOfficerId: officer.id,
    trusteeManagerId: (await db.user.findFirst({ where: { role: "TRUSTEE_MANAGER" } }))?.id,
    status: "MANAGER_APPROVED_READY_FOR_DLD",
    priority: "NORMAL",
    submittedAt: new Date(),
    readyForManagerAt: new Date(),
    approvedAt: new Date(),
    internalNotes: "Phase 16.5 verification seed — manager approved, ready for DLD submission",
  },
});
console.log(`Created case ${managerApproved.caseRef} (status=MANAGER_APPROVED_READY_FOR_DLD)`);

// Verify via the next-action API
const BASE = "http://localhost:3000";
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const { token } = await loginR.json();

console.log("\n=== Item 4: Case UNDER_OFFICER_REVIEW ===");
const r4 = await fetch(`${BASE}/api/workflow/next-action?entity=case&id=${officerCase.id}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const j4 = await r4.json();
console.log(`HTTP ${r4.status} | nextAction: ${j4.nextAction ? `"${j4.nextAction.title}" (priority=${j4.nextAction.priority}, owner=${j4.nextAction.ownerRole})` : "null"}`);
if (j4.nextAction) console.log(`  description: "${j4.nextAction.description}"`);

console.log("\n=== Item 5: Case MANAGER_APPROVED_READY_FOR_DLD ===");
const r5 = await fetch(`${BASE}/api/workflow/next-action?entity=case&id=${managerApproved.id}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const j5 = await r5.json();
console.log(`HTTP ${r5.status} | nextAction: ${j5.nextAction ? `"${j5.nextAction.title}" (priority=${j5.nextAction.priority}, owner=${j5.nextAction.ownerRole})` : "null"}`);
if (j5.nextAction) console.log(`  description: "${j5.nextAction.description}"`);

await db.$disconnect();
