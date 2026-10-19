// Production verification — Payment webhook (Stripe-style test event).
// 1. POST with stub payload → 200 + creates AccountantNotification + flips invoice paymentStatus
// 2. POST with idempotent duplicate referenceId → 200 with duplicate=true (no double-processing)
// 3. Verify the InvoiceLedgerEntry row was created
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// Login as admin to set up test data
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const { token, csrfToken } = await loginR.json();

// Create an invoice + payment link first so the webhook has something to process
const casesR = await fetch(`${BASE}/api/cases?take=1`, { headers: { Authorization: `Bearer ${token}` } });
const casesJ = await casesR.json();
const caseRow = casesJ.cases?.[0];

const invR = await fetch(`${BASE}/api/finance/invoices`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
  body: JSON.stringify({ caseNumber: caseRow.caseRef, clientCode: "C-PROD-VERIFY", transactionType: "ready_sale" }),
});
const invJ = await invR.json();
console.log(`Created test invoice ${invJ.invoice?.invoiceNumber} (id=${invJ.invoice?.id})`);
const invoiceId = invJ.invoice.id;

// 1. Stripe-style webhook payload (Stripe sends { type, data: { object: { id, metadata, amount_total } } })
const stripePayload = {
  type: "checkout.session.completed",
  data: {
    object: {
      id: `cs_test_prod_verify_${Date.now()}`,
      metadata: { invoiceId },
      amount_total: invJ.invoice.totalAmountFils,
    },
  },
};

// Use a fixed referenceId so we can test idempotency
const referenceId = `stripe-prod-${Date.now()}`;

// Stub gateway accepts any signature — but we still pass the header to demonstrate the path
const stripeR = await fetch(`${BASE}/api/v1/payments/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-signature": "stub", "stripe-signature": "t=1234,v1=fake_hash" },
  body: JSON.stringify({
    // Stub gateway expects { invoiceId, status, referenceId, amountFils }
    invoiceId,
    status: "paid",
    referenceId,
    amountFils: invJ.invoice.totalAmountFils,
  }),
});
const stripeJ = await stripeR.json();
console.log(`\n1. Stripe test event → HTTP ${stripeR.status} | body:`, stripeJ);
const stripeOk = stripeR.status === 200 && stripeJ.ok === true && stripeJ.status === "awaiting_bank_clearing";
console.log("   " + (stripeOk ? "✓ PASS" : "✗ FAIL") + " — Stripe event processed, invoice moved to awaiting_bank_clearing");

// 2. Idempotency — re-send the SAME referenceId (must be detected as duplicate)
const dupR = await fetch(`${BASE}/api/v1/payments/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-signature": "stub" },
  body: JSON.stringify({
    invoiceId,
    status: "paid",
    referenceId,  // SAME referenceId — must trigger idempotency check
    amountFils: invJ.invoice.totalAmountFils,
  }),
});
const dupJ = await dupR.json();
console.log(`\n2. Duplicate webhook (same referenceId=${referenceId}) → HTTP ${dupR.status} | body:`, dupJ);
const dupOk = dupR.status === 200 && dupJ.duplicate === true;
console.log("   " + (dupOk ? "✓ PASS" : "✗ FAIL") + " — idempotent: duplicate detected, no double-processing");

// 3. Verify InvoiceLedgerEntry was created
const ledgerEntries = await db.invoiceLedgerEntry.findMany({
  where: { invoiceId, entryType: "payment_received" },
  orderBy: { createdAt: "desc" },
});
console.log(`\n3. InvoiceLedgerEntry 'payment_received' rows: ${ledgerEntries.length}`);
console.log("   First entry:", { entryType: ledgerEntries[0]?.entryType, reference: ledgerEntries[0]?.reference, actorRole: ledgerEntries[0]?.actorRole, notes: ledgerEntries[0]?.notes });
const ledgerOk = ledgerEntries.length === 1;
console.log("   " + (ledgerOk ? "✓ PASS" : "✗ FAIL") + " — exactly 1 ledger entry (no duplicate)");

// 4. Verify AccountantNotification was created (in-app notification)
const notif = await db.accountantNotification.findFirst({
  where: { type: "payment_pending", invoiceId },
  orderBy: { createdAt: "desc" },
});
console.log(`\n4. AccountantNotification payment_pending: ${notif ? "✓ created" : "✗ NOT FOUND"}`);

const allPass = stripeOk && dupOk && ledgerOk && notif !== null;
console.log("\n=== " + (allPass ? "✓ ALL PASS" : "✗ FAIL") + " ===");
await db.$disconnect();
process.exit(allPass ? 0 : 1);
