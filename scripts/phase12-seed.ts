// scripts/phase12-seed.ts
// Phase 12 seed: BiConnection + metabaseSql for 12 KPIs + interactive template + CRM integrations
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const METABASE_SQL: Record<string, string> = {
  first_response_time: `SELECT AVG((julianday(firstResponseAt) - julianday(createdAt)) * 24 * 60) AS value FROM WaConversation WHERE firstResponseAt IS NOT NULL AND createdAt >= :period_start`,
  first_response_sla: `SELECT (COUNT(CASE WHEN (julianday(firstResponseAt) - julianday(createdAt)) * 24 * 60 <= 5 THEN 1 END) * 100.0 / COUNT(*)) AS value FROM WaConversation WHERE firstResponseAt IS NOT NULL AND createdAt >= :period_start`,
  lead_to_case_conversion: `SELECT (COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN w.id END) * 100.0 / COUNT(*)) AS value FROM WaContact w LEFT JOIN \`Case\` c ON c.caseRef = w.clientCode WHERE w.contactType = 'inquiry'`,
  document_completion: `SELECT (COUNT(DISTINCT CASE WHEN dci.status = 'UPLOADED' THEN c.id END) * 100.0 / COUNT(DISTINCT c.id)) AS value FROM \`Case\` c JOIN DocumentChecklistItem dci ON dci.caseId = c.id WHERE c.status NOT IN ('CLOSED', 'CANCELLED', 'DRAFT')`,
  fee_collection: `SELECT (SUM(CASE WHEN f.status = 'paid' THEN f.paidFils ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN f.status IN ('quoted','pending_payment','partially_paid','paid') THEN f.quotedAmountFils ELSE 0 END), 0)) AS value FROM FeeLine f`,
  case_completion: `SELECT (COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN status NOT IN ('DRAFT','CANCELLED') THEN 1 END), 0)) AS value FROM \`Case\` WHERE createdAt >= :period_start`,
  avg_turnaround: `SELECT AVG((julianday(closedAt) - julianday(createdAt))) AS value FROM \`Case\` WHERE status = 'CLOSED' AND closedAt >= :period_start`,
  rework_rate: `SELECT (COUNT(DISTINCT CASE WHEN de.eventType = 'return' THEN de.caseId END) * 100.0 / NULLIF(COUNT(DISTINCT CASE WHEN de.eventType = 'delegation' THEN de.caseId END), 0)) AS value FROM DelegationEvent de WHERE de.createdAt >= :period_start`,
  dld_additional_docs: `SELECT (COUNT(CASE WHEN status = 'dld_additional_documents_required' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) AS value FROM DldSubmission WHERE createdAt >= :period_start`,
  template_delivery: `SELECT (COUNT(CASE WHEN deliveryStatus IN ('delivered','read') THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) AS value FROM WaMessage WHERE direction = 'outbound' AND createdAt >= :period_start`,
  ai_acceptance: `SELECT (COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN status IN ('accepted','rejected','corrected') THEN 1 END), 0)) AS value FROM AiExtractedField WHERE humanDecision IS NOT NULL`,
  appointment_attendance: `SELECT (COUNT(CASE WHEN checkInStatus IN ('checked_in','completed') THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) AS value FROM Appointment WHERE dateTime <= datetime('now') AND cancelReason IS NULL`,
};

async function main() {
  console.log("[SEED-P12] Phase 12 — starting…");

  // 1. BiConnection for Metabase
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  if (!adminUser) throw new Error("Admin user not found");

  await prisma.biConnection.upsert({
    where: { id: "metabase-default" },
    create: {
      id: "metabase-default",
      provider: "metabase",
      baseUrl: process.env.METABASE_URL || "http://localhost:3001",
      healthStatus: "unknown",
      dashboardIds: JSON.stringify({ executive: "1", financial: "2", operational: "3", audit: "4" }),
      embedSecret: process.env.METABASE_EMBED_SECRET || "phase12-stub-secret-key",
      isEnabled: true,
    },
    update: {},
  });
  console.log("[SEED-P12] BiConnection ensured (Metabase, enabled)");

  // 2. Populate metabaseSql for all 12 KPIs
  for (const [key, sql] of Object.entries(METABASE_SQL)) {
    await prisma.kpiDefinition.updateMany({
      where: { key },
      data: { metabaseSql: sql },
    });
  }
  const kpiCount = await prisma.kpiDefinition.count({ where: { metabaseSql: { not: null } } });
  console.log(`[SEED-P12] metabaseSql populated for ${kpiCount} KPIs`);

  // 3. Interactive WhatsApp template with buttons
  const interactiveTemplate = await prisma.waTemplate.findUnique({ where: { name: "appointment_confirmation_with_buttons" } });
  if (!interactiveTemplate) {
    await prisma.waTemplate.create({
      data: {
        name: "appointment_confirmation_with_buttons",
        category: "utility",
        language: "en",
        bodyEn: "Dear {{client_name}}, your appointment for {{service_name}} is confirmed for {{appointment_date}} at Dubai Marina Branch. Please confirm your attendance:",
        bodyAr: "عزيزي {{client_name}}، تم تأكيد موعدك لـ {{service_name}} في {{appointment_date}} في فرع دبي مارينا. يرجى تأكيد الحضور:",
        variables: JSON.stringify(["client_name", "service_name", "appointment_date"]),
        metaStatus: "approved",
        isActive: true,
        interactiveType: "buttons",
        buttonsJson: JSON.stringify([
          { id: "confirm_attendance", title: "Confirm" },
          { id: "reschedule", title: "Reschedule" },
          { id: "cancel_appointment", title: "Cancel" },
        ]),
      },
    });
    console.log("[SEED-P12] Interactive template 'appointment_confirmation_with_buttons' created with 3 buttons");
  } else {
    await prisma.waTemplate.update({
      where: { id: interactiveTemplate.id },
      data: {
        interactiveType: "buttons",
        buttonsJson: JSON.stringify([
          { id: "confirm_attendance", title: "Confirm" },
          { id: "reschedule", title: "Reschedule" },
          { id: "cancel_appointment", title: "Cancel" },
        ]),
      },
    });
    console.log("[SEED-P12] Interactive template updated with buttons");
  }

  // 4. CRM integrations (both disabled)
  for (const provider of ["hubspot", "salesforce"]) {
    const existing = await prisma.crmIntegration.findUnique({ where: { provider } });
    if (!existing) {
      await prisma.crmIntegration.create({
        data: {
          provider,
          isEnabled: false,
          credentialsRef: JSON.stringify({ apiKey: `${provider.toUpperCase()}_API_KEY`, token: `${provider.toUpperCase()}_TOKEN` }),
          fieldMappings: JSON.stringify({ contact: { phone: "phone", name: "name" }, case: { caseRef: "case_number" } }),
          syncFrequency: "15_min",
          healthStatus: "unknown",
        },
      });
    }
  }
  console.log("[SEED-P12] 2 CRM integrations ensured (HubSpot + Salesforce, both disabled)");

  // 5. Pending verification receipts for email digest
  const feeLine = await prisma.feeLine.findFirst({ where: { status: "paid" }, select: { id: true, caseId: true, caseNumber: true } });
  if (feeLine) {
    const existingPending = await prisma.feeReceipt.findFirst({ where: { status: "pending_verification" } });
    if (!existingPending) {
      await prisma.feeReceipt.create({
        data: {
          receiptNumber: "RCPT-2026-000010",
          feeLineId: feeLine.id,
          caseId: feeLine.caseId,
          caseNumber: feeLine.caseNumber,
          amountFils: 5000,
          paymentMethod: "bank_transfer",
          paidAt: new Date(),
          collectedByUserId: adminUser.id,
          createdBy: adminUser.name,
          status: "pending_verification",
        },
      });
      console.log("[SEED-P12] 1 pending_verification receipt created for email digest");
    }
  }

  console.log("[SEED-P12] Phase 12 — done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
