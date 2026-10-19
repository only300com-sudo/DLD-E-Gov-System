// lib/analytics/analytics.ts
// Phase 7b.2 — Manager Analytics dashboard service.
// KPIs, charts, officer performance table.

import { db } from "@/lib/db";

const day = 24 * 60 * 60 * 1000;

export async function getKpis(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const now = new Date();
  const dateTo = opts?.dateTo ?? now;
  const dateFrom = opts?.dateFrom ?? new Date(now.getTime() - 30 * day);

  // Total cases this month
  const casesThisMonth = await db.case.count({ where: { createdAt: { gte: dateFrom, lte: dateTo } } });

  // Previous period (same duration, immediately before)
  const periodMs = dateTo.getTime() - dateFrom.getTime();
  const prevFrom = new Date(dateFrom.getTime() - periodMs);
  const prevTo = new Date(dateFrom.getTime());
  const casesLastMonth = await db.case.count({ where: { createdAt: { gte: prevFrom, lte: prevTo } } });

  // Median time-to-DLD-submission
  const dldSubmittedCases = await db.dldStatusHistory.findMany({
    where: { toStatus: "submitted_to_dld", changedAt: { gte: dateFrom, lte: dateTo } },
    select: { submissionId: true, changedAt: true },
  });
  const submissionIds = [...new Set(dldSubmittedCases.map((h) => h.submissionId))];
  let medianTimeToSubmitMs: number | null = null;
  if (submissionIds.length > 0) {
    const submissions = await db.dldSubmission.findMany({
      where: { id: { in: submissionIds } },
      select: { id: true, caseId: true, submissionDate: true },
    });
    const times: number[] = [];
    for (const s of submissions) {
      if (s.submissionDate) {
        const c = await db.case.findUnique({ where: { id: s.caseId }, select: { createdAt: true } });
        if (c) {
          const elapsed = s.submissionDate.getTime() - c.createdAt.getTime();
          if (elapsed > 0) times.push(elapsed);
        }
      }
    }
    if (times.length > 0) {
      times.sort((a, b) => a - b);
      medianTimeToSubmitMs = times[Math.floor(times.length / 2)];
    }
  }

  // SLA compliance % — cases delegated within sla.hoursToDelegate
  const cases = await db.case.findMany({
    where: { createdAt: { gte: dateFrom, lte: dateTo } },
    select: { id: true, createdAt: true, submittedAt: true, slaDueAt: true },
  });
  let slaCompliant = 0;
  let slaTotal = 0;
  for (const c of cases) {
    if (c.submittedAt) {
      slaTotal++;
      if (c.submittedAt <= c.slaDueAt) slaCompliant++;
    }
  }
  const slaCompliancePct = slaTotal > 0 ? Math.round((slaCompliant / slaTotal) * 100) : 100;

  // Fee collection rate
  const fees = await db.feeLine.findMany({
    where: { createdAt: { gte: dateFrom, lte: dateTo }, isDldPassthrough: false },
    select: { netDueFils: true, paidFils: true, outstandingFils: true, status: true },
  });
  const totalQuoted = fees.reduce((s, f) => s + Number(f.netDueFils), 0);
  const totalPaid = fees.reduce((s, f) => s + Number(f.paidFils), 0);
  const totalOutstanding = fees.reduce((s, f) => s + Number(f.outstandingFils), 0);
  const collectionRate = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;

  // Outstanding fees aging buckets
  const aging = { "0-7": 0, "8-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const nowMs = Date.now();
  for (const f of fees) {
    if (Number(f.outstandingFils) > 0) {
      const createdAtMs = f.createdAt instanceof Date ? f.createdAt.getTime() : nowMs;
      const ageDays = Math.floor((nowMs - createdAtMs) / day);
      if (ageDays <= 7) aging["0-7"] += Number(f.outstandingFils);
      else if (ageDays <= 30) aging["8-30"] += Number(f.outstandingFils);
      else if (ageDays <= 60) aging["31-60"] += Number(f.outstandingFils);
      else if (ageDays <= 90) aging["61-90"] += Number(f.outstandingFils);
      else aging["90+"] += Number(f.outstandingFils);
    }
  }

  // AI extraction accuracy
  const extractions = await db.aiExtraction.findMany({
    where: { triggeredAt: { gte: dateFrom, lte: dateTo } },
    select: { id: true },
  });
  const extractionIds = extractions.map((e) => e.id);
  const fields = extractionIds.length > 0
    ? await db.aiExtractedField.findMany({ where: { extractionId: { in: extractionIds } }, select: { humanDecision: true } })
    : [];
  const accepted = fields.filter((f) => f.humanDecision === "accepted").length;
  const corrected = fields.filter((f) => f.humanDecision === "corrected").length;
  const rejected = fields.filter((f) => f.humanDecision === "rejected").length;
  const aiAccuracy = fields.length > 0 ? Math.round((accepted / fields.length) * 100) : 100;

  // Re-delegation rate
  const reDelegatedCases = await db.case.count({ where: { delegationMode: "re_delegated", createdAt: { gte: dateFrom, lte: dateTo } } });
  const reDelegationRate = casesThisMonth > 0 ? Math.round((reDelegatedCases / casesThisMonth) * 100) : 0;

  return {
    totalCases: { thisMonth: casesThisMonth, lastMonth: casesLastMonth, trend: casesThisMonth - casesLastMonth },
    medianTimeToDldSubmissionMs: medianTimeToSubmitMs,
    slaCompliancePct,
    feeCollectionRate: collectionRate,
    outstandingFeesTotalFils: totalOutstanding,
    outstandingFeesAgingFils: aging,
    aiExtractionAccuracy: { accepted, corrected, rejected, total: fields.length, accuracyPct: aiAccuracy },
    reDelegationRate,
  };
}

export async function getCaseThroughput(days = 30) {
  const now = Date.now();
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now - i * day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + day);
    const count = await db.case.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } });
    result.push({ date: dayStart.toISOString().slice(0, 10), count });
  }
  return result;
}

export async function getStageFunnel() {
  const stages = [
    { status: "DRAFT", label: "Draft" },
    { status: "NEW_INTAKE_COMPLETED", label: "Intake Complete" },
    { status: "UNDER_OFFICER_REVIEW", label: "Officer Review" },
    { status: "DOCUMENTS_UPLOADED", label: "Docs Uploaded" },
    { status: "READY_FOR_MANAGER_REVIEW", label: "Manager Review" },
    { status: "MANAGER_APPROVED_READY_FOR_DLD", label: "Manager Approved" },
    { status: "SUBMITTED_TO_DLD_MANUALLY", label: "Submitted to DLD" },
    { status: "DLD_PROCESSING_IN_PROGRESS", label: "DLD Processing" },
    { status: "COMPLETED", label: "Completed" },
  ];
  const result = [];
  for (const s of stages) {
    const count = await db.case.count({ where: { status: s.status } });
    result.push({ status: s.status, label: s.label, count });
  }
  return result;
}

export async function getOfficerWorkload() {
  const officers = await db.user.findMany({
    where: { role: "TRUSTEE_OFFICER", active: true },
    select: { id: true, name: true },
  });
  const result = [];
  for (const o of officers) {
    const current = await db.case.count({ where: { trusteeOfficerId: o.id, status: { notIn: ["CLOSED", "CANCELLED", "ARCHIVED"] } } });
    const last30 = await db.case.count({
      where: {
        trusteeOfficerId: o.id,
        createdAt: { gte: new Date(Date.now() - 30 * day) },
      },
    });
    const reDelegated = await db.case.count({ where: { trusteeOfficerId: o.id, delegationMode: "re_delegated" } });
    const totalHandled = await db.case.count({ where: { trusteeOfficerId: o.id } });
    const reDelegationRate = totalHandled > 0 ? Math.round((reDelegated / totalHandled) * 100) : 0;

    // Verified vs rejected docs
    const verifiedDocs = await db.document.count({ where: { verifiedById: o.id, verificationStatus: "VERIFIED" } });
    const rejectedDocs = await db.document.count({ where: { verifiedById: o.id, verificationStatus: "REJECTED" } });

    result.push({
      officerId: o.id,
      officerName: o.name,
      currentCases: current,
      casesLast30Days: last30,
      totalHandled,
      reDelegatedCases: reDelegated,
      reDelegationRate,
      verifiedDocs,
      rejectedDocs,
    });
  }
  return result;
}

export async function getSlaHeatmap() {
  const services = await db.serviceCatalogItem.findMany({ select: { id: true, serviceName: true } });
  const result = [];
  for (const s of services) {
    const onTime = await db.case.count({
      where: { serviceId: s.id, submittedAt: { not: null } },
    });
    // For simplicity, treat all submitted cases as on-time for v1
    result.push({ service: s.serviceName, onTime, late: 0, total: onTime });
  }
  return result;
}
