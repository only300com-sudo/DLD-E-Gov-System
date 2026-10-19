// Phase 15.2 seed — Agent + leads + commissions + payouts + notes
// Creates 3 agents, 12 leads, 5 commissions, 2 payouts, 3 notes
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
const db = new PrismaClient();

const passwordHash = await argon2.hash("trustee123", { type: argon2.argon2id });

// Cleanup
await db.session.deleteMany({ where: { user: { role: "AGENT" } } });
await db.agentNote.deleteMany();
await db.agentCommission.deleteMany();
await db.agentPayout.deleteMany();
await db.agentLead.deleteMany();
await db.agentSequence.deleteMany();
await db.agentLeadSequence.deleteMany();
await db.agentPayoutSequence.deleteMany();
// Clear referredByAgentId on cases before deleting agents (FK)
await db.case.updateMany({ data: { referredByAgentId: null } });
await db.agent.deleteMany();
// Remove any existing AGENT-role users
await db.user.deleteMany({ where: { role: "AGENT" } });

const adminUser = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });

// Helper to create agent + user account
async function createSeedAgent(input: {
  agentCode: string;
  fullName: string;
  arabicFullName?: string;
  phoneE164: string;
  email: string;
  companyName?: string;
  brokerRegistration?: string;
  contactType: string;
  status: string;
  commissionType: string;
  commissionRateBps?: number;
  fixedFilsPerService?: Record<string, number>;
  paymentTermsDays?: number;
  referralCode: string;
  totalLeads?: number;
  totalConverted?: number;
  lifetimeCommissionFils?: number;
}) {
  // Create user account (with AGENT role)
  let user = await db.user.findUnique({ where: { email: input.email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: input.email,
        name: input.fullName,
        nameAr: input.arabicFullName,
        passwordHash,
        role: "AGENT",
        active: input.status === "active",
        mfaEnabled: false,
      },
    });
  }

  const agent = await db.agent.create({
    data: {
      agentCode: input.agentCode,
      fullName: input.fullName,
      arabicFullName: input.arabicFullName,
      phoneE164: input.phoneE164,
      email: input.email,
      companyName: input.companyName,
      brokerRegistration: input.brokerRegistration,
      contactType: input.contactType,
      status: input.status,
      commissionType: input.commissionType,
      commissionRateBps: input.commissionRateBps,
      fixedFilsPerService: input.fixedFilsPerService ? JSON.stringify(input.fixedFilsPerService) : null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      referralCode: input.referralCode,
      referralLink: `http://localhost:3000/r/${input.referralCode}`,
      qrCodeUrl: `/api/agents/${input.agentCode}/qr`,
      userId: user.id,
      onboardingCompletedAt: input.status === "active" ? new Date(Date.now() - 14 * 86400_000) : null,
      activatedAt: input.status === "active" ? new Date(Date.now() - 14 * 86400_000) : null,
      totalLeads: input.totalLeads ?? 0,
      totalConverted: input.totalConverted ?? 0,
      lifetimeCommissionFils: input.lifetimeCommissionFils ?? 0,
      createdBy: adminUser.id,
    },
  });

  // Bump the AgentSequence so nextAgentCode doesn't collide
  const year = new Date().getFullYear();
  const seqNum = parseInt(input.agentCode.split("-").pop() ?? "1");
  await db.agentSequence.upsert({
    where: { year },
    update: { lastValue: Math.max(seqNum, (await db.agentSequence.findUnique({ where: { year } }))?.lastValue ?? 0) },
    create: { year, lastValue: seqNum },
  });

  return agent;
}

// 3 agents: 1 active broker (percentage), 1 active property_manager (fixed), 1 pending broker
const agent1 = await createSeedAgent({
  agentCode: "AGT-2026-000001",
  fullName: "Ahmed Broker",
  arabicFullName: "أحمد الوسيط",
  phoneE164: "+971501111111",
  email: "ahmed.broker@example.ae",
  companyName: "Marina Realty Brokers LLC",
  brokerRegistration: "RERA-12345",
  contactType: "broker",
  status: "active",
  commissionType: "percentage",
  commissionRateBps: 200, // 2%
  paymentTermsDays: 30,
  referralCode: "AHMED001",
  totalLeads: 5,
  totalConverted: 2,
  lifetimeCommissionFils: 500000, // AED 5,000
});

const agent2 = await createSeedAgent({
  agentCode: "AGT-2026-000002",
  fullName: "Fatima PropertyManager",
  arabicFullName: "فاطمة مدير العقارات",
  phoneE164: "+971502222222",
  email: "fatima.pm@example.ae",
  companyName: "Emaar Property Management",
  contactType: "property_manager",
  status: "active",
  commissionType: "fixed",
  fixedFilsPerService: { property_sale: 50000, mortgage: 25000, gift: 30000, transfer: 40000, ejari: 20000 },
  paymentTermsDays: 45,
  referralCode: "FATIMA2",
  totalLeads: 3,
  totalConverted: 1,
  lifetimeCommissionFils: 250000,
});

const agent3 = await createSeedAgent({
  agentCode: "AGT-2026-000003",
  fullName: "Salem PendingBroker",
  phoneE164: "+971503333333",
  email: "salem.pending@example.ae",
  contactType: "broker",
  status: "pending",
  commissionType: "percentage",
  commissionRateBps: 150, // 1.5%
  referralCode: "SALEM03",
  totalLeads: 0,
  totalConverted: 0,
  lifetimeCommissionFils: 0,
});

console.log(`Created 3 agents: ${agent1.agentCode}, ${agent2.agentCode}, ${agent3.agentCode}`);

// 12 leads across agents
const leadData = [
  { agent: agent1, name: "Khalifa Client1", phone: "+971551111111", service: "property_sale", status: "converted", source: "link", attribution: "code_used", caseRef: "TOP-2026-0001" },
  { agent: agent1, name: "Mariam Client2", phone: "+971552222222", service: "mortgage", status: "qualified", source: "portal", attribution: "agent_confirmed" },
  { agent: agent1, name: "Omar Client3", phone: "+971553333333", service: "gift", status: "contacted", source: "qr", attribution: "qr_scan" },
  { agent: agent1, name: "Nora Client4", phone: "+971554444444", service: "transfer", status: "new", source: "portal", attribution: "agent_confirmed" },
  { agent: agent1, name: "Duplicate Client5", phone: "+971555555555", service: "ejari", status: "duplicate", source: "link", attribution: "first_touch" }, // duplicate
  { agent: agent2, name: "Hassan Client6", phone: "+971556666666", service: "property_sale", status: "converted", source: "portal", attribution: "agent_confirmed", caseRef: "TOP-2026-0002" },
  { agent: agent2, name: "Aisha Client7", phone: "+971557777777", service: "transfer", status: "qualified", source: "link", attribution: "code_used" },
  { agent: agent2, name: "Yusuf Client8", phone: "+971558888888", service: "mortgage", status: "new", source: "portal", attribution: "agent_confirmed" },
  { agent: agent1, name: "Layla Client9", phone: "+971559999999", service: "property_sale", status: "not_proceeding", source: "in_person", attribution: "agent_confirmed" },
  { agent: agent1, name: "Sultan Client10", phone: "+971550000001", service: "gift", status: "lost", source: "link", attribution: "code_used" },
  { agent: agent2, name: "Reem Client11", phone: "+971550000002", service: "ejari", status: "new", source: "qr", attribution: "qr_scan" },
  { agent: agent1, name: "Tariq Client12", phone: "+971550000003", service: "transfer", status: "contacted", source: "portal", attribution: "agent_confirmed" },
];

let leadSeq = 1;
const leads: any[] = [];
for (const l of leadData) {
  const lead = await db.agentLead.create({
    data: {
      agentId: l.agent.id,
      leadNumber: `LEAD-2026-${String(leadSeq).padStart(6, "0")}`,
      clientName: l.name,
      clientPhone: l.phone,
      serviceInterest: l.service,
      status: l.status,
      source: l.source,
      attributionMethod: l.attribution,
      convertedCaseNumber: l.caseRef ?? null,
      convertedAt: l.status === "converted" ? new Date(Date.now() - 7 * 86400_000) : null,
      createdAt: new Date(Date.now() - (12 - leadSeq) * 86400_000),
    },
  });
  leads.push(lead);
  leadSeq++;
  // If converted, set Case.referredByAgentId
  if (l.caseRef) {
    await db.case.update({ where: { caseRef: l.caseRef }, data: { referredByAgentId: l.agent.id } }).catch(() => {});
  }
}
console.log(`Created ${leads.length} leads`);

// Bump AgentLeadSequence
await db.agentLeadSequence.upsert({
  where: { year: new Date().getFullYear() },
  update: { lastValue: leadSeq - 1 },
  create: { year: new Date().getFullYear(), lastValue: leadSeq - 1 },
});

// 5 commissions: 3 accrued, 1 pending_payout, 1 paid
const commissions = [];
// 2 commissions for agent1 (accrued)
commissions.push(await db.agentCommission.create({
  data: {
    agentId: agent1.id, caseNumber: "TOP-2026-0001", leadId: leads[0].id, serviceType: "property_sale",
    baseAmountFils: 250000, commissionType: "percentage", commissionRateBps: 200, commissionFils: 5000,
    status: "accrued", payableAt: new Date(Date.now() + 23 * 86400_000), accruedAt: new Date(Date.now() - 7 * 86400_000),
  },
}));
commissions.push(await db.agentCommission.create({
  data: {
    agentId: agent1.id, caseNumber: "TOP-2026-0003", serviceType: "transfer",
    baseAmountFils: 200000, commissionType: "percentage", commissionRateBps: 200, commissionFils: 4000,
    status: "accrued", payableAt: new Date(Date.now() + 25 * 86400_000), accruedAt: new Date(Date.now() - 5 * 86400_000),
  },
}));
commissions.push(await db.agentCommission.create({
  data: {
    agentId: agent2.id, caseNumber: "TOP-2026-0002", leadId: leads[5].id, serviceType: "property_sale",
    baseAmountFils: 250000, commissionType: "fixed", commissionFils: 50000,
    status: "accrued", payableAt: new Date(Date.now() + 20 * 86400_000), accruedAt: new Date(Date.now() - 6 * 86400_000),
  },
}));

// 1 pending_payout commission (linked to payout batch 1 below)
commissions.push(await db.agentCommission.create({
  data: {
    agentId: agent1.id, caseNumber: "TOP-2026-0004", serviceType: "mortgage",
    baseAmountFils: 100000, commissionType: "percentage", commissionRateBps: 200, commissionFils: 2000,
    status: "accrued", payableAt: new Date(Date.now() - 1 * 86400_000), // already payable
    accruedAt: new Date(Date.now() - 35 * 86400_000),
  },
}));

// 1 paid commission (will be linked to payout batch 2)
commissions.push(await db.agentCommission.create({
  data: {
    agentId: agent2.id, caseNumber: "TOP-2026-0005", serviceType: "ejari",
    baseAmountFils: 50000, commissionType: "fixed", commissionFils: 20000,
    status: "accrued", payableAt: new Date(Date.now() - 7 * 86400_000),
    accruedAt: new Date(Date.now() - 50 * 86400_000),
  },
}));

console.log(`Created ${commissions.length} commissions`);

// 2 payouts: 1 pending_approval (for agent1, with 1 commission), 1 paid (for agent2, with 1 commission)
const payout1 = await db.agentPayout.create({
  data: {
    batchNumber: "PAYOUT-2026-10-001",
    agentId: agent1.id,
    periodStart: new Date(Date.now() - 30 * 86400_000),
    periodEnd: new Date(),
    commissionCount: 1,
    totalFils: 2000,
    status: "pending_approval",
    paymentMethod: "bank_transfer",
    createdBy: adminUser.id,
  },
});
// Link the payable commission to payout 1
await db.agentCommission.update({
  where: { id: commissions[3].id },
  data: { status: "pending_payout", payoutBatchId: payout1.id },
});

const payout2 = await db.agentPayout.create({
  data: {
    batchNumber: "PAYOUT-2026-09-001",
    agentId: agent2.id,
    periodStart: new Date(Date.now() - 60 * 86400_000),
    periodEnd: new Date(Date.now() - 31 * 86400_000),
    commissionCount: 1,
    totalFils: 20000,
    status: "paid",
    approvedBy: adminUser.id,
    approvedAt: new Date(Date.now() - 30 * 86400_000),
    paidAt: new Date(Date.now() - 25 * 86400_000),
    paymentReference: "BANK-REF-2026-001",
    paymentMethod: "bank_transfer",
    statementPdfPath: "/home/z/my-project/TrusteeCenterData/agents/statements/PAYOUT-2026-09-001.txt",
    createdBy: adminUser.id,
  },
});
// Mark commission 5 as paid, linked to payout 2
await db.agentCommission.update({
  where: { id: commissions[4].id },
  data: { status: "paid", payoutBatchId: payout2.id, paidAt: new Date(Date.now() - 25 * 86400_000), paidReference: "BANK-REF-2026-001" },
});

console.log(`Created 2 payouts: ${payout1.batchNumber} (pending_approval), ${payout2.batchNumber} (paid)`);

// Bump AgentPayoutSequence
const now = new Date();
await db.agentPayoutSequence.upsert({
  where: { year_month: { year: now.getFullYear(), month: now.getMonth() + 1 } },
  update: { lastValue: 1 },
  create: { year: now.getFullYear(), month: now.getMonth() + 1, lastValue: 1 },
});

// Write the statement PDF for payout 2
const fs = await import("node:fs/promises");
const path = await import("node:path");
const dir = "/home/z/my-project/TrusteeCenterData/agents/statements";
await fs.mkdir(dir, { recursive: true });
const statementContent = `======================================================================
TRUSTEE OPERATIONS CENTER — AGENT PAYOUT STATEMENT
======================================================================
Batch Number: ${payout2.batchNumber}
Agent: ${agent2.fullName} (${agent2.agentCode})
Contact Type: ${agent2.contactType}
Period: ${payout2.periodStart.toLocaleDateString()} → ${payout2.periodEnd.toLocaleDateString()}
Status: ${payout2.status}
Payment Method: ${payout2.paymentMethod}
Payment Reference: ${payout2.paymentReference}

Commission Items:
----------------------------------------------------------------------
Case #            | Service Type       | Base (AED) | Commission (AED)
----------------------------------------------------------------------
TOP-2026-0005     | ejari              |     500.00 |          200.00
----------------------------------------------------------------------
Total Commissions: 1
Total Amount: AED 200.00

Approved by: ${adminUser.id}
Approved at: ${payout2.approvedAt?.toISOString()}
Paid at: ${payout2.paidAt?.toISOString()}

Internal Trustee Office System — Confidential. Do not share outside the agent + finance team.
======================================================================`;
await fs.writeFile(path.join(dir, `${payout2.batchNumber}.txt`), statementContent);

// 3 AgentNotes
await db.agentNote.create({ data: { agentId: agent1.id, noteType: "internal", body: "Top-performing agent — high conversion rate. Consider tier upgrade next quarter.", authorId: adminUser.id } });
await db.agentNote.create({ data: { agentId: agent1.id, noteType: "performance", body: "Monthly review: 5 leads submitted, 2 converted. AED 90 commission accrued this month.", authorId: adminUser.id } });
await db.agentNote.create({ data: { agentId: agent2.id, noteType: "compliance", body: "Trade licence verified. RERA registration pending for property_manager role.", authorId: adminUser.id } });
console.log("Created 3 AgentNotes");

console.log("\n=== Phase 15.2 Seed Summary ===");
console.log(`3 agents: ${agent1.agentCode} (active broker), ${agent2.agentCode} (active property_manager), ${agent3.agentCode} (pending broker)`);
console.log(`12 leads: statuses - ${leadData.map((l) => l.status).join(", ")}`);
console.log(`5 commissions: 3 accrued + 1 pending_payout + 1 paid`);
console.log(`2 payouts: ${payout1.batchNumber} (pending_approval), ${payout2.batchNumber} (paid)`);
console.log(`3 AgentNotes`);

console.log("\n=== Demo Agent login ===");
console.log(`Email: ${agent1.email}`);
console.log(`Password: trustee123`);
console.log(`(status=active, can log in + see portal)`);

await db.$disconnect();
