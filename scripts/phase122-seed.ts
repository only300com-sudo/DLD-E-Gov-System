// scripts/phase122-seed.ts
// Phase 12.2 seed: button_reply automation rule + CRM sync jobs + sync errors
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("[SEED-P12.2] Phase 12.2 — starting…");

  // 1. Button-reply automation rule (closes Phase 12.1 3c)
  const existing = await prisma.waAutomationRule.findFirst({ where: { name: "Appointment Confirmation Reply" } });
  if (!existing) {
    await prisma.waAutomationRule.create({
      data: {
        name: "Appointment Confirmation Reply",
        trigger: "button_reply",
        priority: 100,
        isActive: true,
        conditions: JSON.stringify({ button_id: "confirm_attendance" }),
        actions: JSON.stringify([
          { type: "update_case_status", status: "appointment_confirmed" },
          { type: "create_task", assignedTeam: "reception", title: "Client confirmed attendance", dueInHours: 1 },
        ]),
        description: "Fires when a client clicks the 'Confirm' button on an appointment confirmation template.",
      },
    });
    console.log("[SEED-P12.2] Button-reply automation rule created");
  } else {
    console.log("[SEED-P12.2] Button-reply automation rule already exists");
  }

  // 2. CRM sync jobs (10 — mix of success/partial/failed)
  const hubspotIntegration = await prisma.crmIntegration.findUnique({ where: { provider: "hubspot" } });
  const salesforceIntegration = await prisma.crmIntegration.findUnique({ where: { provider: "salesforce" } });

  if (hubspotIntegration) {
    // Find existing jobs
    const existingJobs = await prisma.syncJob.count({ where: { integrationId: hubspotIntegration.id } });
    if (existingJobs === 0) {
      const contacts = await prisma.waContact.findMany({ take: 5, select: { id: true, fullName: true } });
      const cases = await prisma.case.findMany({ take: 5, select: { id: true, caseRef: true } });
      for (let i = 0; i < 5; i++) {
        const isContact = i < 3;
        const entityId = isContact ? contacts[i % contacts.length]?.id ?? "test" : cases[i % cases.length]?.id ?? "test";
        const status = i === 4 ? "failed" : i === 3 ? "partial" : "success";
        await prisma.syncJob.create({
          data: {
            integrationId: hubspotIntegration.id,
            direction: "outbound",
            entityType: isContact ? "contact" : "case",
            entityId,
            status,
            responseBody: status !== "failed" ? JSON.stringify({ id: `stub-hs-${i}`, matched: true }) : null,
            errorMessage: status === "failed" ? "Connection timeout (stub)" : status === "partial" ? "2 of 3 fields synced" : null,
            completedAt: new Date(Date.now() - i * 3600000),
          },
        });
      }
      console.log("[SEED-P12.2] 5 HubSpot sync jobs created");
    }

    // Sync errors
    const failedJobs = await prisma.syncJob.findMany({ where: { integrationId: hubspotIntegration.id, status: "failed" }, take: 2 });
    for (const job of failedJobs) {
      const existingErrors = await prisma.syncError.count({ where: { jobId: job.id } });
      if (existingErrors === 0) {
        await prisma.syncError.create({
          data: {
            jobId: job.id,
            errorType: "connection_timeout",
            errorMessage: "HubSpot API connection timed out after 30s (stub)",
            payload: JSON.stringify({ endpoint: "/contacts", method: "POST" }),
          },
        });
      }
    }
    // Create 3 more sync errors on partial jobs
    const partialJobs = await prisma.syncJob.findMany({ where: { integrationId: hubspotIntegration.id, status: "partial" }, take: 3 });
    for (const job of partialJobs) {
      const existingErrors = await prisma.syncError.count({ where: { jobId: job.id } });
      if (existingErrors === 0) {
        await prisma.syncError.create({
          data: {
            jobId: job.id,
            errorType: "field_mapping_conflict",
            errorMessage: "Field 'phone' did not match HubSpot format (stub)",
            payload: JSON.stringify({ field: "phone", value: "+971501234567" }),
          },
        });
      }
    }
    console.log("[SEED-P12.2] Sync errors created for HubSpot");
  }

  if (salesforceIntegration) {
    const existingJobs = await prisma.syncJob.count({ where: { integrationId: salesforceIntegration.id } });
    if (existingJobs === 0) {
      const contacts = await prisma.waContact.findMany({ take: 3, select: { id: true } });
      for (let i = 0; i < 5; i++) {
        const status = i === 2 ? "failed" : "success";
        await prisma.syncJob.create({
          data: {
            integrationId: salesforceIntegration.id,
            direction: "outbound",
            entityType: "contact",
            entityId: contacts[i % 3]?.id ?? "test",
            status,
            responseBody: status === "success" ? JSON.stringify({ id: `stub-sf-${i}` }) : null,
            errorMessage: status === "failed" ? "OAuth token expired (stub)" : null,
            completedAt: new Date(Date.now() - i * 7200000),
          },
        });
      }
      console.log("[SEED-P12.2] 5 Salesforce sync jobs created");
    }

    const failedJobs = await prisma.syncJob.findMany({ where: { integrationId: salesforceIntegration.id, status: "failed" }, take: 2 });
    for (const job of failedJobs) {
      const existingErrors = await prisma.syncError.count({ where: { jobId: job.id } });
      if (existingErrors === 0) {
        await prisma.syncError.create({
          data: {
            jobId: job.id,
            errorType: "auth_failure",
            errorMessage: "Salesforce OAuth token expired (stub)",
            payload: JSON.stringify({ endpoint: "/services/data/v57.0/sobjects/Contact" }),
          },
        });
      }
    }
    console.log("[SEED-P12.2] Sync errors created for Salesforce");
  }

  console.log("[SEED-P12.2] Phase 12.2 — done.");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
