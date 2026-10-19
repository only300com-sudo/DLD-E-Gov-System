// scripts/phase10-seed.ts
// Phase 10 — seed defaults.
// Seeds: 12 KpiDefinition rows + 5 ReportAccess rules + 3 ScheduledReport rows
// + triggers 8 ReportSnapshot computations.

import { PrismaClient } from "@prisma/client";
import { KPI_DEFINITIONS } from "../src/lib/reporting/kpis";
import { computeExecutiveSnapshot } from "../src/lib/reporting/snapshots/executive";
import { computeOperationsSnapshot } from "../src/lib/reporting/snapshots/operations";
import { computeWhatsAppSnapshot } from "../src/lib/reporting/snapshots/whatsapp";
import { computeFinancialSnapshot } from "../src/lib/reporting/snapshots/financial";
import { computeServiceSnapshot } from "../src/lib/reporting/snapshots/service";
import { computeAuditSnapshot } from "../src/lib/reporting/snapshots/audit";
import { computeSecuritySnapshot } from "../src/lib/reporting/snapshots/security";
import { computeAiSnapshot } from "../src/lib/reporting/snapshots/ai";
import { computeNextRun } from "../src/lib/reporting/scheduledReports";

const prisma = new PrismaClient();

const REPORT_TYPES = ["executive", "operations", "whatsapp", "financial", "service", "audit", "security", "ai"] as const;

async function main() {
  console.log("[SEED] Phase 10 — starting…");

  // 1. KpiDefinitions (12 KPIs)
  for (const kpi of KPI_DEFINITIONS) {
    await prisma.kpiDefinition.upsert({
      where: { key: kpi.key },
      create: {
        key: kpi.key,
        name: kpi.name,
        nameAr: kpi.nameAr,
        formula: kpi.formula,
        numerator: kpi.numerator,
        denominator: kpi.denominator,
        dataSource: kpi.dataSource,
        ownerRole: kpi.ownerRole,
        target: kpi.target,
        warningThreshold: kpi.warningThreshold,
        criticalThreshold: kpi.criticalThreshold,
        refreshFrequency: kpi.refreshFrequency,
        exampleCalculation: kpi.exampleCalculation,
        approvedAt: new Date(),
        approvedBy: "system",
        changeHistory: JSON.stringify([{ at: new Date().toISOString(), by: "system", note: "Initial seed definition" }]),
      },
      update: {},
    });
  }
  console.log(`[SEED] ${KPI_DEFINITIONS.length} KpiDefinition rows ensured`);

  // 2. ReportAccess rules (5)
  const accessRules: Array<{ role: string; reportType: string; allowed: boolean; rowScope: string }> = [
    { role: "ADMIN", reportType: "executive", allowed: true, rowScope: "all" },
    { role: "TRUSTEE_MANAGER", reportType: "executive", allowed: true, rowScope: "all" },
    { role: "ADMIN", reportType: "financial", allowed: true, rowScope: "all" },
    { role: "TRUSTEE_MANAGER", reportType: "financial", allowed: true, rowScope: "all" },
    { role: "RECEPTION_ADMIN", reportType: "operations", allowed: true, rowScope: "all" },
    { role: "RECEPTION_ADMIN", reportType: "whatsapp", allowed: true, rowScope: "all" },
    { role: "TRUSTEE_OFFICER", reportType: "operations", allowed: true, rowScope: "own" },
    { role: "TRUSTEE_OFFICER", reportType: "service", allowed: true, rowScope: "own" },
  ];
  for (const rule of accessRules) {
    await prisma.reportAccess.upsert({
      where: { role_reportType: { role: rule.role, reportType: rule.reportType } },
      create: rule,
      update: {},
    });
  }
  console.log(`[SEED] ${accessRules.length} ReportAccess rules ensured`);

  // 3. ScheduledReport rows (3)
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (adminUser) {
    const scheduled: Array<{ name: string; reportType: string; format: string; schedule: string; recipients: string[] }> = [
      { name: "Daily Operations Summary", reportType: "operations", format: "pdf", schedule: "daily@09:00", recipients: ["ops@trustee.ae"] },
      { name: "Weekly Executive Digest", reportType: "executive", format: "pdf", schedule: "weekly@1@09:00", recipients: ["exec@trustee.ae"] },
      { name: "Monthly Financial Review", reportType: "financial", format: "xlsx", schedule: "monthly@1@09:00", recipients: ["finance@trustee.ae"] },
    ];
    for (const s of scheduled) {
      const existing = await prisma.scheduledReport.findFirst({ where: { name: s.name } });
      if (existing) continue;
      await prisma.scheduledReport.create({
        data: {
          ...s,
          filters: JSON.stringify({}),
          recipients: JSON.stringify(s.recipients),
          isActive: true,
          nextRunAt: computeNextRun(s.schedule),
          createdBy: adminUser.id,
        },
      });
    }
    console.log(`[SEED] ${scheduled.length} ScheduledReport rows ensured`);
  }

  // 4. ReportSnapshots — run all 8 computers once
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 30 * 86_400_000);
  const COMPUTERS: Record<string, (i: { periodStart: Date; periodEnd: Date }) => Promise<Record<string, unknown>>> = {
    executive: computeExecutiveSnapshot as any,
    operations: computeOperationsSnapshot as any,
    whatsapp: computeWhatsAppSnapshot as any,
    financial: computeFinancialSnapshot as any,
    service: computeServiceSnapshot as any,
    audit: computeAuditSnapshot as any,
    security: computeSecuritySnapshot as any,
    ai: computeAiSnapshot as any,
  };
  for (const type of REPORT_TYPES) {
    try {
      const data = await COMPUTERS[type]({ periodStart, periodEnd });
      await prisma.reportSnapshot.create({
        data: {
          snapshotType: type,
          periodStart,
          periodEnd,
          data: JSON.stringify(data),
          computedBy: "seed",
        },
      });
      console.log(`[SEED] ${type} snapshot computed (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error(`[SEED] ${type} snapshot failed:`, e);
    }
  }

  // 5. ReportExportLog rows (3) — show what previous exports look like
  const adminId = adminUser?.id ?? "system-seed";
  const sampleExports = [
    { reportId: crypto().uuid, reportType: "executive", format: "pdf", rowCount: 12, watermark: `CONFIDENTIAL · System Administrator · 2026-09-30T08:00:00.000Z` },
    { reportId: crypto().uuid, reportType: "operations", format: "csv", rowCount: 45, watermark: `CONFIDENTIAL · System Administrator · 2026-09-30T08:01:00.000Z` },
    { reportId: crypto().uuid, reportType: "financial", format: "xlsx", rowCount: 28, watermark: `CONFIDENTIAL · System Administrator · 2026-09-30T08:02:00.000Z` },
  ];
  for (const e of sampleExports) {
    const existing = await prisma.reportExportLog.findUnique({ where: { reportId: e.reportId } });
    if (existing) continue;
    await prisma.reportExportLog.create({
      data: { ...e, filters: "{}", generatedBy: adminId, generatedAt: new Date("2026-09-30T08:00:00.000Z") },
    });
  }
  console.log(`[SEED] ${sampleExports.length} ReportExportLog rows ensured`);

  console.log("[SEED] Phase 10 — done.");
}

function crypto() {
  // tiny uuid stub
  return { uuid: "seed-" + Math.random().toString(36).slice(2, 12) };
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
