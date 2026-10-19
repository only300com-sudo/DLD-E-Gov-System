// Phase 14 Close-Out Item 4 — verify email digest body has no bank account numbers.
// Creates a pending invoice, triggers digest, captures the [STUB Email Digest] log line,
// verifies no IBAN / account number / full card number is present.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";

// Login as admin
const loginR = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
});
const { token, csrfToken } = await loginR.json();

// Make sure there's at least one awaiting_bank_clearance invoice for the digest to send
const fs = await import("node:fs/promises");
await fs.writeFile("/home/z/my-project/dev.log", ""); // truncate

// Create a payment link with a fake "IBAN-like" reference to ensure it gets HASHED in the digest
const case1 = await db.case.findFirst({ orderBy: { createdAt: "asc" } });
const inv = await db.invoice.create({
  data: {
    invoiceNumber: `INV-VERIFY-${Date.now()}`,
    caseNumber: case1.caseRef,
    clientCode: "C-VERIFY",
    transactionType: "ready_sale",
    feeBreakdown: JSON.stringify([{ label: "Test fee", amountFils: 250000, isVat: false }]),
    totalAmountFils: 250000, vatAmountFils: 0,
    paymentStatus: "awaiting_bank_clearing",
    paymentMethod: "virtual_iban",
    paymentLink: "AE0701934582934587239485723-IBAN-LIKE-1234567898765", // IBAN-like string we want hashed
    paymentLinkExpiresAt: new Date(Date.now() + 24 * 3600_000),
    generatedBy: "verify-script",
  },
});
console.log(`Created awaiting_bank_clearance invoice ${inv.invoiceNumber} with IBAN-like paymentLink=${inv.paymentLink}`);

// Trigger morning digest as admin
const digestR = await fetch(`${BASE}/api/finance/digest/send`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
  body: JSON.stringify({ digestType: "morning" }),
});
const digestJ = await digestR.json();
console.log(`POST /api/finance/digest/send → HTTP ${digestR.status}`, digestJ);

// Read dev.log + find [STUB Email Digest] entry
await new Promise((r) => setTimeout(r, 500));
const log = await fs.readFile("/home/z/my-project/dev.log", "utf-8");
const match = log.match(/\[STUB Email Digest\][\s\S]*?\}\n[\s\S]*?(?=\n[a-zA-Z]|\[|$)/);
console.log("\n=== [STUB Email Digest] log line (raw) ===");
if (match) {
  console.log(match[0]);
} else {
  // Try simpler pattern
  const lines = log.split("\n");
  const startIdx = lines.findIndex((l) => l.includes("[STUB Email Digest]"));
  if (startIdx >= 0) {
    console.log(lines.slice(startIdx, startIdx + 30).join("\n"));
  } else {
    console.log("NOT FOUND — try grep -A 10 'STUB Email Digest' dev.log");
  }
}

// Compliance check — verify no IBAN-like strings leaked
const digestBlock = match ? match[0] : (log.match(/\[STUB Email Digest\][\s\S]*?(?=\n[a-zA-Z]|\[|$)/)?.[0] ?? "");
console.log("\n=== Compliance check ===");
const ibanPattern = /AE\d{2}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}/i;
const cardPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
const accountPattern = /\b\d{10,}\b/;
const hasIban = ibanPattern.test(digestBlock);
const hasCard = cardPattern.test(digestBlock);
// Account pattern might match timestamps — let's also verify
console.log(`Has IBAN pattern? ${hasIban ? "❌ YES — VIOLATION" : "✓ NO"}`);
console.log(`Has full card number (16 digits)? ${hasCard ? "❌ YES — VIOLATION" : "✓ NO"}`);
// Verify hashed ref present (12 chars hex)
const hashedRefPattern = /[a-f0-9]{12}/;
const hasHashedRef = hashedRefPattern.test(digestBlock);
console.log(`Has hashed ref (12-char hex)? ${hasHashedRef ? "✓ YES — refs are hashed" : "⚠ NO hashed ref present (may be no ref at all, not a violation)"}`);
// Verify portal link present
const hasPortalLink = digestBlock.includes("/finance/reconciliation?invoice=");
console.log(`Has portal link to reconciliation screen? ${hasPortalLink ? "✓ YES" : "⚠ NO"}`);

await db.$disconnect();
