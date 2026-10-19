// Trigger a fresh accountant confirmation and capture the WhatsApp stub log
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// Login as accountant
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "accountant@trustee.ae", password: "trustee123" }),
});
const { token, csrfToken } = await loginR.json();

// Find an awaiting_bank_clearance invoice where the case's client has a WaContact
const invoice = await db.invoice.findFirst({
  where: { paymentStatus: "awaiting_bank_clearing" },
  include: { receipts: true },
});
let activeInvoice = invoice;
if (!activeInvoice) {
  console.log("No awaiting_bank_clearance invoice found — seeding one");
  // Use INV-2026-000003 (TOP-2026-0003)
  const inv3 = await db.invoice.findFirst({ where: { invoiceNumber: "INV-2026-000003" } });
  if (inv3) {
    await db.invoice.update({ where: { id: inv3.id }, data: { paymentStatus: "awaiting_bank_clearing" } });
    activeInvoice = await db.invoice.findUnique({ where: { id: inv3.id } });
    console.log(`Updated ${activeInvoice.invoiceNumber} → ${activeInvoice.paymentStatus}`);
  }
}
if (!activeInvoice) { console.log("FAIL: no invoice to work with"); process.exit(1); }
const invoiceFinal = activeInvoice;

// Find the case + its client + the client's WaContact
const caseRow = await db.case.findUnique({
  where: { caseRef: invoiceFinal.caseNumber },
  select: { id: true, caseRef: true, clientId: true, client: { select: { internalId: true, fullNameEn: true } } },
});
console.log(`Case ${caseRow.caseRef} client=${caseRow.client?.fullNameEn} internalId=${caseRow.client?.internalId}`);

const waContact = caseRow.client?.internalId
  ? await db.waContact.findFirst({ where: { clientCode: caseRow.client.internalId } })
  : null;
console.log(`WaContact linked to client:`, waContact ? { id: waContact.id, fullName: waContact.fullName, mobile: waContact.mobileE164, consentStatus: waContact.consentStatus } : "NONE");

// If no contact, find any contact with opted_in consent
const fallbackContact = waContact ?? await db.waContact.findFirst({ where: { consentStatus: "opted_in" } });
if (fallbackContact) {
  console.log(`Using fallback WaContact:`, { id: fallbackContact.id, fullName: fallbackContact.fullName });
  // Manually link this contact's mobile to the case client by creating a fake conversation
  const existingConv = await db.waConversation.findFirst({
    where: { contactId: fallbackContact.id, status: "open" },
  });
  let conv = existingConv;
  if (!conv) {
    conv = await db.waConversation.create({
      data: {
        contactId: fallbackContact.id, status: "open", priority: "normal",
        caseNumber: caseRow.caseRef, lastMessageAt: new Date(),
      },
    });
    console.log(`Created new conversation ${conv.id} linking contact ${fallbackContact.id} to case ${caseRow.caseRef}`);
  } else {
    await db.waConversation.update({ where: { id: conv.id }, data: { caseNumber: caseRow.caseRef } });
    console.log(`Linked existing conversation ${conv.id} to case ${caseRow.caseRef}`);
  }
}

// Confirm payment
const confirmR = await fetch(`${BASE}/api/finance/reconciliation/${invoiceFinal.id}/confirm`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
  body: JSON.stringify({
    bankReference: "BNK-WA-TEST-2026-001",
    internalLedgerCode: "CLEARING-004",
    amountMatches: true, sourceCleared: true,
    notes: "Triggering payment_confirmed WhatsApp broadcast for verification",
  }),
});
const confirmJ = await confirmR.json();
console.log(`\nAccountant confirm → HTTP ${confirmR.status}`);
console.log(`Response:`, JSON.stringify({ ok: confirmJ.ok, verificationId: confirmJ.verification?.id, invoiceStatus: confirmJ.updatedInvoice?.paymentStatus }));

// Check for the WhatsApp message
const waMsg = await db.waMessage.findFirst({
  where: { templateName: "payment_confirmed", direction: "outbound" },
  orderBy: { sentAt: "desc" },
  include: { conversation: { include: { contact: true } } },
});
console.log(`\n=== WhatsApp payment_confirmed message ===`);
if (waMsg) {
  console.log({
    id: waMsg.id,
    externalMessageId: waMsg.externalMessageId,
    templateName: waMsg.templateName,
    direction: waMsg.direction,
    contact: waMsg.conversation?.contact?.fullName,
    content: waMsg.content,
    sentAt: waMsg.sentAt?.toISOString(),
  });
} else {
  console.log("NOT FOUND");
}

await db.$disconnect();
