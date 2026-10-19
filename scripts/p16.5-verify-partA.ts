// Phase 16.5 verification — Part A: 8 API responses across all 4 entity types
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const { token } = await loginR.json();
const headers = { Authorization: `Bearer ${token}` };

let itemNum = 1;
async function test(name, entity, id) {
  const r = await fetch(`${BASE}/api/workflow/next-action?entity=${entity}&id=${id}`, { headers });
  const j = await r.json();
  const action = j.nextAction;
  console.log(`\n${itemNum}. ${name}`);
  console.log(`   GET /api/workflow/next-action?entity=${entity}&id=${id?.slice(-8) ?? id}`);
  console.log(`   HTTP ${r.status} | nextAction: ${action ? `"${action.title}" (priority=${action.priority}, owner=${action.ownerRole}, action=${action.actionLabel ?? "none"})` : "null (no action needed)"}`);
  if (action) console.log(`   description: "${action.description}"`);
  itemNum++;
  return action;
}

// Find test entities
// 1. Client with no cases → need to create one or find one
const allClients = await db.client.findMany({ select: { id: true, internalId: true, fullNameEn: true, status: true }, take: 10 });
const clientsWithCaseCounts = await Promise.all(
  allClients.map(async (c) => ({ ...c, caseCount: await db.case.count({ where: { clientId: c.id } }) }))
);
const clientNoCases = clientsWithCaseCounts.find((c) => c.caseCount === 0);
const clientWithCases = clientsWithCaseCounts.find((c) => c.caseCount > 0);

// 2. Cases in various statuses
const caseIntake = await db.case.findFirst({ where: { status: "NEW_INTAKE_COMPLETED" }, select: { id: true, caseRef: true, status: true } });
const caseOfficer = await db.case.findFirst({ where: { status: "UNDER_OFFICER_REVIEW" }, select: { id: true, caseRef: true, status: true } });
const caseReady = await db.case.findFirst({ where: { status: "MANAGER_APPROVED_READY_FOR_DLD" }, select: { id: true, caseRef: true, status: true } });
const caseCompleted = await db.case.findFirst({ where: { status: "COMPLETED" }, select: { id: true, caseRef: true, status: true } });
// Also check AWAITING_PAYMENT
const casePayment = await db.case.findFirst({ where: { status: "AWAITING_PAYMENT" }, select: { id: true, caseRef: true, status: true } });

// 3. Ejari case
const ejariCase = await db.ejariCase.findFirst({ select: { id: true, caseNumber: true, status: true } });

// 4. Agent lead
const agentLead = await db.agentLead.findFirst({ where: { status: "new" }, select: { id: true, leadNumber: true, status: true } });
const agentLeadConverted = await db.agentLead.findFirst({ where: { status: "converted" }, select: { id: true, leadNumber: true, status: true } });

console.log("=== Phase 16.5 — Part A: Resolver Rules (8 API responses) ===");

// Item 1: Client with no cases → "Create a service case"
if (clientNoCases) {
  await test("Client with no cases", "client", clientNoCases.id);
} else {
  console.log(`\n${itemNum}. Client with no cases — NOT FOUND (all clients have cases)`);
  itemNum++;
}

// Item 2: Client with pending docs case → "Continue case X"
if (clientWithCases) {
  await test("Client with cases (pending action)", "client", clientWithCases.id);
} else {
  console.log(`\n${itemNum}. Client with cases — NOT FOUND`);
  itemNum++;
}

// Item 3: Case with status NEW_INTAKE_COMPLETED → "Send requirements"
if (caseIntake) {
  await test(`Case ${caseIntake.caseRef} (status=${caseIntake.status})`, "case", caseIntake.id);
} else {
  console.log(`\n${itemNum}. Case with NEW_INTAKE_COMPLETED — NOT FOUND, trying AWAITING_PAYMENT`);
  if (casePayment) await test(`Case ${casePayment.caseRef} (status=${casePayment.status})`, "case", casePayment.id);
  else console.log("   No suitable case found");
  itemNum++;
}

// Item 4: Case with UNDER_OFFICER_REVIEW → "With Officer X"
if (caseOfficer) {
  await test(`Case ${caseOfficer.caseRef} (status=${caseOfficer.status})`, "case", caseOfficer.id);
} else {
  console.log(`\n${itemNum}. Case with UNDER_OFFICER_REVIEW — NOT FOUND`);
  itemNum++;
}

// Item 5: Case with MANAGER_APPROVED_READY_FOR_DLD → "Ready for DLD"
if (caseReady) {
  await test(`Case ${caseReady.caseRef} (status=${caseReady.status})`, "case", caseReady.id);
} else {
  console.log(`\n${itemNum}. Case with MANAGER_APPROVED_READY_FOR_DLD — NOT FOUND`);
  itemNum++;
}

// Item 6: Case with COMPLETED → "Case complete"
if (caseCompleted) {
  await test(`Case ${caseCompleted.caseRef} (status=${caseCompleted.status})`, "case", caseCompleted.id);
} else {
  console.log(`\n${itemNum}. Case with COMPLETED — NOT FOUND`);
  itemNum++;
}

// Item 7: Ejari case
if (ejariCase) {
  await test(`Ejari case ${ejariCase.caseNumber} (status=${ejariCase.status})`, "ejari_case", ejariCase.id);
} else {
  console.log(`\n${itemNum}. Ejari case — NOT FOUND`);
  itemNum++;
}

// Item 8: Agent lead
if (agentLead) {
  await test(`Agent lead ${agentLead.leadNumber} (status=new)`, "agent_lead", agentLead.id);
} else if (agentLeadConverted) {
  await test(`Agent lead ${agentLeadConverted.leadNumber} (status=converted)`, "agent_lead", agentLeadConverted.id);
} else {
  console.log(`\n${itemNum}. Agent lead — NOT FOUND`);
  itemNum++;
}

console.log("\n=== Part A complete ===");
await db.$disconnect();
