// Trigger a fresh accountant confirmation on a brand new invoice + capture WhatsApp broadcast
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// Login as accountant + reception
const loginA = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "accountant@trustee.ae", password: "trustee123" }),
});
const { token: accToken, csrfToken: accCsrf } = await loginA.json();
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "reception@trustee.ae", password: "trustee123" }),
});
const { token: recToken, csrfToken: recCsrf } = await loginR.json();

// Pick a fresh case (TOP-2026-0001 — Mohammed Bin Ali, has WaContact Ahmed Al Mansoori with conversation)
const caseRef = "TOP-2026-0001";
const caseRow = await db.case.findUniqueOrThrow({
  where: { caseRef },
  select: { id: true, caseRef: true, client: { select: { internalId: true, fullNameEn: true } } },
});
console.log(`Case: ${caseRow.caseRef} client=${caseRow.client?.fullNameEn} internalId=${caseRow.client?.internalId}`);

// Find a contact + conversation for this case (via caseNumber or via contact's mobile)
const conversation = await db.waConversation.findFirst({
  where: { caseNumber: caseRef, status: "open" },
  include: { contact: true },
  orderBy: { createdAt: "desc" },
});
if (conversation) {
  console.log(`Existing conversation: ${conversation.id} contact=${conversation.contact?.fullName}`);
} else {
  // Look up contact by clientCode
  const contact = caseRow.client?.internalId
    ? await db.waContact.findFirst({ where: { clientCode: caseRow.client.internalId } })
    : null;
  if (contact) {
    const newConv = await db.waConversation.create({
      data: { contactId: contact.id, status: "open", priority: "normal", caseNumber: caseRef, lastMessageAt: new Date() },
    });
    console.log(`Created conversation ${newConv.id} linking contact ${contact.fullName} to ${caseRef}`);
  } else {
    // Link any contact to this case
    const anyContact = await db.waContact.findFirst({ where: { consentStatus: "opted_in" } });
    if (anyContact) {
      const newConv = await db.waConversation.create({
        data: { contactId: anyContact.id, status: "open", priority: "normal", caseNumber: caseRef, lastMessageAt: new Date() },
      });
      console.log(`Created conversation ${newConv.id} linking fallback contact ${anyContact.fullName} to ${caseRef}`);
    }
  }
}

// Step 1: Generate invoice
const invR = await fetch(`${BASE}/api/finance/invoices`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${recToken}`, "X-CSRF-Token": recCsrf },
  body: JSON.stringify({ caseNumber: caseRef, clientCode: caseRow.client?.internalId ?? "C-X", transactionType: "ready_sale" }),
});
const invJ = await invR.json();
console.log(`\n1. Invoice generated: HTTP ${invR.status}`, invJ.ok ? `invoiceNumber=${invJ.invoice.invoiceNumber}` : `error=${invJ.error}`);
if (!invJ.ok) process.exit(1);

// Step 2: Generate payment link (so invoice has gatewayReferenceId)
const linkR = await fetch(`${BASE}/api/finance/invoices/${invJ.invoice.id}/payment-link`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${recToken}`, "X-CSRF-Token": recCsrf },
  body: JSON.stringify({ expiryHours: 24 }),
});
const linkJ = await linkR.json();
console.log(`2. Payment link generated: HTTP ${linkR.status} gatewayRef=${linkJ.gatewayReferenceId}`);

// Step 3: Simulate webhook (calls processPaymentWebhook)
const webhookR = await fetch(`${BASE}/api/v1/payments/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-signature": "stub" },
  body: JSON.stringify({ invoiceId: invJ.invoice.id, status: "paid", referenceId: `stub-wa-test-${Date.now()}`, amountFils: invJ.invoice.totalAmountFils }),
});
const webhookJ = await webhookR.json();
console.log(`3. Webhook received: HTTP ${webhookR.status} status=${webhookJ.status}`);

// Step 4: Accountant confirms
const confirmR = await fetch(`${BASE}/api/finance/reconciliation/${invJ.invoice.id}/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accToken}`, "X-CSRF-Token": accCsrf },
  body: JSON.stringify({
    bankReference: `BNK-WA-${Date.now()}`,
    internalLedgerCode: "CLEARING-001",
    amountMatches: true, sourceCleared: true,
    notes: "Fresh confirmation to trigger WhatsApp payment_confirmed broadcast",
  }),
});
const confirmJ = await confirmR.json();
console.log(`\n4. Accountant confirm: HTTP ${confirmR.status} ok=${confirmJ.ok} verificationId=${confirmJ.verification?.id}`);

// Step 5: Capture WhatsApp message
const waMsg = await db.waMessage.findFirst({
  where: { templateName: "payment_confirmed", direction: "outbound" },
  orderBy: { sentAt: "desc" },
  include: { conversation: { include: { contact: true } } },
});
console.log(`\n=== WhatsApp payment_confirmed broadcast ===`);
if (waMsg) {
  console.log({
    id: waMsg.id,
    externalMessageId: waMsg.externalMessageId,
    templateName: waMsg.templateName,
    direction: waMsg.direction,
    contact: waMsg.conversation?.contact?.fullName,
    mobile: waMsg.conversation?.contact?.mobileE164,
    content: waMsg.content,
    sentAt: waMsg.sentAt?.toISOString(),
  });
} else {
  console.log("NOT FOUND");
}

// Also fetch the dev.log lines about the broadcast
const fs = await import("node:fs/promises");
const log = await fs.readFile("/home/z/my-project/dev.log", "utf-8").catch(() => "");
const match = log.match(/[\s\S]*\[ACCOUNTANT-CONFIRM\][\s\S]*?(?=\n\s*\[|$)/);
if (match) {
  console.log("\n=== Dev log evidence ===");
  console.log(match[0].slice(-500));
}

await db.$disconnect();
