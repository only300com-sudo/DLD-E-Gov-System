// Phase 14 seed — Accountant workflow test data
// Creates:
//   - 3 Invoices (one unpaid, one link_generated, one awaiting_bank_clearance)
//   - 2 AccountantVerification rows (one confirmed, one rejected)
//   - 8 InvoiceLedgerEntry rows across the invoices
//   - 4 AccountantNotification rows (2 unread, 1 high-priority)
//   - 2 EmailDigestLog rows (morning + evening stubs)
//   - 1 FeeReceipt with paymentMethodExtended=payment_link + gatewayReferenceId=stub-xxx
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const accountantEmail = "accountant@trustee.ae";
const accountant = await db.user.findUniqueOrThrow({ where: { email: accountantEmail } });
const reception = await db.user.findFirstOrThrow({ where: { role: "RECEPTION_ADMIN" } });
const manager = await db.user.findFirstOrThrow({ where: { role: "TRUSTEE_MANAGER" } });

// Pick three cases to attach invoices to
const cases = await db.case.findMany({ take: 3, orderBy: { createdAt: "asc" }, include: { client: { select: { internalId: true } } } });
console.log(`Using ${cases.length} cases for invoice seeding`);

// Wipe existing Phase 14 data (idempotent)
await db.accountantNotification.deleteMany();
await db.emailDigestLog.deleteMany();
await db.accountantVerification.deleteMany();
await db.invoiceLedgerEntry.deleteMany();
await db.feeReceipt.deleteMany({ where: { invoiceId: { not: null } } });
await db.invoice.deleteMany();
await db.invoiceSequence.deleteMany();

const year = new Date().getFullYear();

async function createInvoice(opts: {
  case: any; paymentStatus: string; paymentMethod?: string; paymentLink?: string;
  refSuffix: string; ledgerEntries: Array<{ entryType: string; amountFils: number; actorId: string; actorRole: string; reference?: string; notes?: string }>;
}) {
  const seq = await db.invoiceSequence.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });
  const invoiceNumber = `INV-${year}-${String(seq.lastValue).padStart(6, "0")}${opts.refSuffix}`;
  const breakdown = [
    { label: "Trustee Center service fee", amountFils: 200000, isVat: false, isDld: false, isTrusteeFee: true },
    { label: "VAT (5%) on trustee fee", amountFils: 10000, isVat: true, isDld: false, isTrusteeFee: false },
    { label: "DLD transfer fee", amountFils: 40000, isVat: false, isDld: true, isTrusteeFee: false },
  ];
  const total = breakdown.reduce((s, f) => s + f.amountFils, 0);
  const vat = breakdown.filter(f => f.isVat).reduce((s, f) => s + f.amountFils, 0);

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      caseNumber: opts.case.caseRef,
      clientCode: opts.case.client?.internalId ?? "C-UNKNOWN",
      transactionType: "ready_sale",
      feeBreakdown: JSON.stringify(breakdown),
      totalAmountFils: total,
      vatAmountFils: vat,
      paymentStatus: opts.paymentStatus,
      paymentMethod: opts.paymentMethod,
      paymentLink: opts.paymentLink,
      paymentLinkExpiresAt: opts.paymentLink ? new Date(Date.now() + 24 * 3600_000) : null,
      generatedBy: reception.id,
    },
  });

  for (const e of opts.ledgerEntries) {
    await db.invoiceLedgerEntry.create({
      data: {
        invoiceId: invoice.id,
        entryType: e.entryType,
        amountFils: e.amountFils,
        actorId: e.actorId,
        actorRole: e.actorRole,
        reference: e.reference,
        notes: e.notes,
      },
    });
  }
  console.log(`  Created ${invoiceNumber} (${opts.paymentStatus}) on ${opts.case.caseRef}`);
  return invoice;
}

// Invoice 1: unpaid (ready for payment link generation)
const inv1 = await createInvoice({
  case: cases[0],
  paymentStatus: "unpaid",
  refSuffix: "",
  ledgerEntries: [
    { entryType: "created", amountFils: 250000, actorId: reception.id, actorRole: "reception", notes: "Invoice created." },
  ],
});

// Invoice 2: link_generated (Stripe stub link)
const inv2 = await createInvoice({
  case: cases[1],
  paymentStatus: "link_generated",
  paymentMethod: "payment_link",
  paymentLink: "http://localhost:3000/mock-payment/inv2",
  refSuffix: "",
  ledgerEntries: [
    { entryType: "created", amountFils: 250000, actorId: reception.id, actorRole: "reception" },
    { entryType: "payment_received", amountFils: 0, actorId: reception.id, actorRole: "reception", reference: "stub-link-inv2", notes: "Payment link generated via stub." },
  ],
});

// Invoice 3: awaiting_bank_clearing (webhook received, waiting for accountant)
const inv3 = await createInvoice({
  case: cases[2],
  paymentStatus: "awaiting_bank_clearing",
  paymentMethod: "payment_link",
  paymentLink: "http://localhost:3000/mock-payment/inv3",
  refSuffix: "",
  ledgerEntries: [
    { entryType: "created", amountFils: 250000, actorId: reception.id, actorRole: "reception" },
    { entryType: "payment_received", amountFils: 250000, actorId: "system", actorRole: "system", reference: "stub-webhook-inv3", notes: "Webhook received from stub gateway." },
  ],
});

// Set case 2 (inv2) + case 3 (inv3) to AWAITING_PAYMENT — they're locked from Officer
await db.case.update({ where: { caseRef: cases[1].caseRef }, data: { status: "AWAITING_PAYMENT" } });
await db.case.update({ where: { caseRef: cases[2].caseRef }, data: { status: "AWAITING_PAYMENT" } });

// 1 FeeReceipt with paymentMethodExtended=payment_link + gatewayReferenceId=stub-xxx
// We need a FeeLine to attach to. Let's use the first fee line on case 3.
const feeLine = await db.feeLine.findFirst({ where: { caseId: cases[2].id }, orderBy: { createdAt: "asc" } });
if (feeLine) {
  await db.feeReceipt.create({
    data: {
      receiptNumber: `RCPT-${year}-${String(Date.now()).slice(-6)}`,
      feeLineId: feeLine.id,
      caseId: cases[2].id,
      caseNumber: cases[2].caseRef,
      amountFils: 250000,
      paymentMethod: "online",
      paidAt: new Date(),
      collectedByUserId: reception.id,
      status: "pending_verification",
      createdBy: reception.name,
      // Phase 14 fields
      paymentMethodExtended: "payment_link",
      gatewayReferenceId: "stub-webhook-inv3",
      settlementStatus: "pending_bank_clearance",
      invoiceId: inv3.id,
    },
  });
  console.log(`  Created FeeReceipt with gatewayReferenceId=stub-webhook-inv3`);
}

// 2 AccountantVerification rows — one confirmed (on inv2), one rejected (would be on a separate scenario)
const verification1 = await db.accountantVerification.create({
  data: {
    receiptId: `seed-verify-${Date.now()}-1`,
    invoiceId: inv2.id,
    bankReference: "BNK-SEED-0001",
    internalLedgerCode: "CLEARING-004",
    amountMatches: true,
    sourceCleared: true,
    verifiedBy: accountant.id,
    notes: "Seeded verification — confirmed by accountant.",
  },
});
// Confirm inv2 → flip case to ACCOUNTS_LOCKED so Officer can see it
await db.invoice.update({ where: { id: inv2.id }, data: { paymentStatus: "confirmed_by_accounts" } });
await db.case.update({ where: { caseRef: cases[1].caseRef }, data: { status: "ACCOUNTS_LOCKED" } });

// For the "rejected" verification, create a 4th invoice that was rejected
const inv4 = await createInvoice({
  case: cases[2],
  paymentStatus: "failed",
  refSuffix: "R",
  ledgerEntries: [
    { entryType: "created", amountFils: 250000, actorId: reception.id, actorRole: "reception" },
    { entryType: "void", amountFils: -250000, actorId: accountant.id, actorRole: "accountant", notes: "Rejected by accounts — bank reference mismatch." },
  ],
});
await db.accountantVerification.create({
  data: {
    receiptId: `seed-verify-${Date.now()}-2`,
    invoiceId: inv4.id,
    verifiedBy: accountant.id,
    notes: "Bank statement showed AED 240 only — bounced.",
    rejectionReason: "Bank reference mismatch — amount below invoice total",
    amountMatches: false,
    sourceCleared: false,
  },
});

// 4 AccountantNotification rows (2 unread, 1 high-priority)
const notifs = await Promise.all([
  db.accountantNotification.create({ data: { type: "payment_pending", invoiceId: inv3.id, priority: "high", isRead: false } }),
  db.accountantNotification.create({ data: { type: "payment_pending", invoiceId: inv2.id, priority: "normal", isRead: false } }),
  db.accountantNotification.create({ data: { type: "payment_confirmed", invoiceId: inv2.id, priority: "normal", isRead: true, readAt: new Date() } }),
  db.accountantNotification.create({ data: { type: "payment_bounced", invoiceId: inv4.id, priority: "urgent", isRead: true, readAt: new Date() } }),
]);
console.log(`  Created ${notifs.length} AccountantNotifications (2 unread, 1 high, 1 urgent)`);

// 2 EmailDigestLog rows (morning + evening stubs)
const digests = await Promise.all([
  db.emailDigestLog.create({ data: { digestType: "accountant_morning", recipients: JSON.stringify([accountantEmail]), itemCount: 2, status: "stubbed" } }),
  db.emailDigestLog.create({ data: { digestType: "accountant_evening", recipients: JSON.stringify([accountantEmail]), itemCount: 2, status: "stubbed" } }),
]);
console.log(`  Created ${digests.length} EmailDigestLog rows (morning + evening stubs)`);

// Summary
console.log("\n=== Phase 14 Seed Summary ===");
console.log(`Accountant user: ${accountant.email} (id=${accountant.id})`);
console.log(`Invoices: 4 (${inv1.invoiceNumber}, ${inv2.invoiceNumber}, ${inv3.invoiceNumber}, ${inv4.invoiceNumber})`);
console.log(`AccountantVerifications: 2 (one confirmed on ${inv2.invoiceNumber}, one rejected on ${inv4.invoiceNumber})`);
console.log(`AccountantNotifications: 4`);
console.log(`EmailDigestLogs: 2`);
console.log(`Case states: ${cases[0].caseRef}=unchanged, ${cases[1].caseRef}=ACCOUNTS_LOCKED, ${cases[2].caseRef}=AWAITING_PAYMENT`);

await db.$disconnect();
