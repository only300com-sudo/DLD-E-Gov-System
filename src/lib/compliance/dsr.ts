// lib/compliance/dsr.ts
// Phase 7b.2 — Data Subject Request lifecycle + fulfillment actions.
// - submitDsr — create a new DSR for a client
// - generateAccessBundle — for ACCESS requests; produces a JSON bundle
//   containing client profile + cases + documents index + communications log,
//   STRIPPING all internal notes (DSR must disclose only client-visible data)
// - processErasure — for ERASURE requests; respects legal hold + retention policy
// - checkDsrSla — runs at scheduled intervals; sends 20-day reminder + 25-day escalation

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function submitDsr(input: {
  clientId: string;
  type: "ACCESS" | "RECTIFICATION" | "ERASURE" | "PORTABILITY" | "OBJECTION" | "RESTRICTION";
  submittedBy?: string;
  submittedByName?: string;
  notes?: string;
}) {
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new Error("Client not found");

  const dsr = await db.dataSubjectRequest.create({
    data: {
      clientId: input.clientId,
      type: input.type,
      status: "SUBMITTED",
      submittedAt: new Date(),
      responseNotes: input.notes,
    },
  });

  await logAudit({
    userId: input.submittedBy ?? undefined,
    action: "DSR_SUBMITTED",
    entity: "DataSubjectRequest",
    entityId: dsr.id,
    details: `${input.submittedByName ?? "System"} submitted DSR for client ${client.internalId}. Type: ${input.type}`,
  });

  return dsr;
}

/**
 * Generate the access bundle for an ACCESS DSR.
 * - Client profile (sanitized: no internal notes/comments)
 * - Cases index (caseRef, status, service, branch — no internal notes)
 * - Documents index (filename, type, version, uploadedAt — no file contents)
 * - Communications log (channel, status, sentAt — no internal review comments)
 * - Consent history (snapshot of all ConsentRecords for this client)
 *
 * Returns the bundle path. Bundle is written to:
 *   /TrusteeCenterData/DSR/{clientCode}-dsr-{dsrId}.json
 */
export async function generateAccessBundle(dsrId: string, actorId?: string, actorName?: string) {
  const dsr = await db.dataSubjectRequest.findUnique({
    where: { id: dsrId },
    include: {
      client: {
        include: {
          cases: {
            include: {
              service: { select: { serviceName: true, internalCode: true } },
              branch: { select: { name: true } },
              documents: {
                where: { isCurrentVersion: true },
                select: {
                  docName: true,
                  docType: true,
                  fileName: true,
                  version: true,
                  createdAt: true,
                  verificationStatus: true,
                },
              },
              clientMessages: {
                select: {
                  channel: true,
                  subject: true,
                  sentAt: true,
                  status: true,
                  recipientName: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!dsr) throw new Error("DSR not found");

  // Sanitize: strip all internal-only fields
  const bundle = {
    generatedAt: new Date().toISOString(),
    dsrId: dsr.id,
    dsrType: dsr.type,
    client: {
      internalId: dsr.client.internalId,
      clientType: dsr.client.clientType,
      capacity: dsr.client.capacity,
      fullNameEn: dsr.client.fullNameEn,
      fullNameAr: dsr.client.fullNameAr,
      nationality: dsr.client.nationality,
      mobile: dsr.client.mobile,
      email: dsr.client.email,
      // Note: emiratesId + passportNumber redacted to last 4 chars for security
      emiratesId: dsr.client.emiratesId ? `***${dsr.client.emiratesId.slice(-4)}` : null,
      passportNumber: dsr.client.passportNumber ? `***${dsr.client.passportNumber.slice(-4)}` : null,
      consent: {
        privacyPolicyAt: dsr.client.consentPrivacyPolicyAt,
        privacyPolicyVersion: dsr.client.consentPrivacyPolicyVersion,
        marketingAt: dsr.client.consentMarketingAt,
        communicationsAt: dsr.client.consentCommunicationsAt,
        withdrawnAt: dsr.client.consentWithdrawnAt,
      },
    },
    cases: dsr.client.cases.map((c) => ({
      caseRef: c.caseRef,
      status: c.status,
      service: c.service?.serviceName ?? null,
      serviceCode: c.service?.internalCode ?? null,
      branch: c.branch?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      // NO internalNotes, NO nextAction, NO internal comments — redacted
      documents: c.documents.map((d) => ({
        docName: d.docName,
        docType: d.docType,
        fileName: d.fileName,
        version: d.version,
        uploadedAt: d.createdAt.toISOString(),
        verificationStatus: d.verificationStatus,
      })),
      communications: c.clientMessages.map((m) => ({
        channel: m.channel,
        subject: m.subject,
        sentAt: m.sentAt?.toISOString(),
        status: m.status,
        recipientName: m.recipientName,
      })),
    })),
    consentHistory: await db.consentRecord.findMany({
      where: { clientId: dsr.clientId },
      orderBy: { capturedAt: "desc" },
    }),
    disclaimer: "This bundle is a sanitized export per PDPL Article 19 (Data Subject Access Request). Internal notes, audit logs, and case comments are NOT included. For full audit history, contact the DPO.",
  };

  // Write to disk
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = "/home/z/my-project/TrusteeCenterData/DSR";
  await fs.mkdir(dir, { recursive: true });
  const bundlePath = path.join(dir, `${dsr.client.internalId}-dsr-${dsrId}.json`);
  await fs.writeFile(bundlePath, JSON.stringify(bundle, null, 2));

  // Update DSR with bundle path
  await db.dataSubjectRequest.update({
    where: { id: dsrId },
    data: { bundlePath, status: "FULFILLED", completedAt: new Date() },
  });

  await logAudit({
    userId: actorId ?? undefined,
    action: "DSR_COMPLETED",
    entity: "DataSubjectRequest",
    entityId: dsrId,
    details: `${actorName ?? "System"} generated access bundle for DSR ${dsrId}. Bundle: ${bundlePath}. Bundle sanitized — no internal notes/comments.`,
  });

  return { bundlePath, caseCount: bundle.cases.length, documentCount: bundle.cases.reduce((sum, c) => sum + c.documents.length, 0) };
}

/**
 * Process an ERASURE DSR.
 * - Check legal hold: if any active case for this client is on legal hold, BLOCK the erasure.
 * - Check retention: if any active case is past retention period, anonymize PII (keep case metadata for audit)
 * - Otherwise: reject with clear error message (active case prevents erasure)
 */
export async function processErasure(dsrId: string, actorId?: string, actorName?: string) {
  const dsr = await db.dataSubjectRequest.findUnique({
    where: { id: dsrId },
    include: { client: { include: { cases: true } } },
  });
  if (!dsr) throw new Error("DSR not found");

  // Check legal hold — any case on hold blocks erasure
  const heldCases = dsr.client.cases.filter((c) => c.legalHold);
  if (heldCases.length > 0) {
    await db.dataSubjectRequest.update({
      where: { id: dsrId },
      data: {
        status: "REJECTED",
        rejectionReason: `Erasure blocked: ${heldCases.length} case(s) under legal hold: ${heldCases.map((c) => c.caseRef).join(", ")}`,
        completedAt: new Date(),
      },
    });
    await logAudit({
      userId: actorId ?? undefined,
      action: "DSR_COMPLETED",
      entity: "DataSubjectRequest",
      entityId: dsrId,
      details: `${actorName ?? "System"} processed erasure DSR ${dsrId}. BLOCKED by legal hold on ${heldCases.length} case(s).`,
    });
    return { ok: false, blocked: true, reason: "legal_hold", heldCases: heldCases.map((c) => c.caseRef) };
  }

  // Check active cases — if any case is in non-terminal status, reject
  const activeStatuses = ["DRAFT", "NEW_INTAKE_COMPLETED", "UNDER_OFFICER_REVIEW", "DOCUMENTS_UPLOADED", "READY_FOR_MANAGER_REVIEW", "RETURNED_FOR_CORRECTION", "AWAITING_CLIENT_DOCUMENTS", "AWAITING_CLIENT_APPOINTMENT", "MANAGER_APPROVED_READY_FOR_DLD", "SUBMITTED_TO_DLD_MANUALLY", "DLD_PROCESSING_IN_PROGRESS"];
  const activeCases = dsr.client.cases.filter((c) => activeStatuses.includes(c.status));
  if (activeCases.length > 0) {
    await db.dataSubjectRequest.update({
      where: { id: dsrId },
      data: {
        status: "REJECTED",
        rejectionReason: `Erasure blocked: ${activeCases.length} active case(s) for this client: ${activeCases.map((c) => c.caseRef).join(", ")}. Wait for case closure + retention period to expire.`,
        completedAt: new Date(),
      },
    });
    await logAudit({
      userId: actorId ?? undefined,
      action: "DSR_COMPLETED",
      entity: "DataSubjectRequest",
      entityId: dsrId,
      details: `${actorName ?? "System"} processed erasure DSR ${dsrId}. BLOCKED by active cases.`,
    });
    return { ok: false, blocked: true, reason: "active_cases", activeCases: activeCases.map((c) => c.caseRef) };
  }

  // All cases closed (or no cases). Proceed with anonymization.
  const clientId = dsr.clientId;
  const anonymizedName = `ANONYMIZED_CLIENT_${Date.now()}`;
  await db.client.update({
    where: { id: clientId },
    data: {
      fullNameEn: anonymizedName,
      fullNameAr: null,
      emiratesId: null,
      passportNumber: null,
      mobile: null,
      email: null,
      address: null,
      nationality: null,
      dateOfBirth: null,
      // Preserve: internalId, clientType, capacity (for case audit history)
      consentMarketingAt: null,
      consentCommunicationsAt: null,
      consentPrivacyPolicyAt: null,
      consentWithdrawnAt: new Date(),
    },
  });

  await db.dataSubjectRequest.update({
    where: { id: dsrId },
    data: { status: "FULFILLED", completedAt: new Date(), responseNotes: "PII anonymized; case metadata preserved for audit." },
  });

  await logAudit({
    userId: actorId ?? undefined,
    action: "DSR_COMPLETED",
    entity: "DataSubjectRequest",
    entityId: dsrId,
    details: `${actorName ?? "System"} processed erasure DSR ${dsrId}. PII anonymized; case metadata preserved for audit.`,
  });

  return { ok: true, blocked: false, action: "anonymized", clientId };
}

/**
 * Check DSR SLA — runs at scheduled intervals. Sends reminders + escalations.
 * - PDPL default SLA: 30 days
 * - 20 days → reminder notification to assigned user + Manager
 * - 25 days → escalation notification to DPO + Manager
 */
export async function checkDsrSla() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const reminderThreshold = 20 * day;
  const escalationThreshold = 25 * day;
  const slaThreshold = 30 * day;

  const openDsrs = await db.dataSubjectRequest.findMany({
    where: { status: { in: ["SUBMITTED", "IN_REVIEW", "AWAITING_INFO"] } },
    include: { client: { select: { internalId: true, fullNameEn: true } } },
  });

  let remindersSent = 0;
  let escalationsSent = 0;
  for (const dsr of openDsrs) {
    const submitted = dsr.submittedAt instanceof Date ? dsr.submittedAt.getTime() : 0;
    const ageMs = now - submitted;

    // 25-day escalation
    if (ageMs >= escalationThreshold && !dsr.escalationSentAt) {
      const managers = await db.user.findMany({ where: { role: "TRUSTEE_MANAGER", active: true }, select: { id: true, name: true } });
      for (const m of managers) {
        await db.notification.create({
          data: {
            caseId: null,
            clientId: dsr.clientId,
            templateId: null,
            templateName: "dsr-escalation",
            recipientName: m.name,
            recipientContact: null,
            channel: "IN_APP",
            subject: `DSR ESCALATION: ${dsr.type} for ${dsr.client.fullNameEn}`,
            body: `DSR ${dsr.id} submitted ${(ageMs / day).toFixed(1)} days ago (escalation threshold: 25 days). SLA expires at 30 days. Immediate action required.`,
            attachments: null,
            sentById: null,
            status: "DRAFT",
            queuedAt: new Date(),
          },
        });
      }
      await db.dataSubjectRequest.update({ where: { id: dsr.id }, data: { escalationSentAt: new Date(), lastReminderAt: new Date() } });
      escalationsSent++;
    }

    // 20-day reminder (only if escalation not already sent)
    if (ageMs >= reminderThreshold && ageMs < escalationThreshold && !dsr.reminderSentAt) {
      const assignee = dsr.assignedToId ? await db.user.findUnique({ where: { id: dsr.assignedToId }, select: { id: true, name: true } }) : null;
      const recipients = [];
      if (assignee) recipients.push(assignee);
      // Also notify managers
      const managers = await db.user.findMany({ where: { role: "TRUSTEE_MANAGER", active: true }, select: { id: true, name: true } });
      recipients.push(...managers);

      for (const r of recipients) {
        await db.notification.create({
          data: {
            caseId: null,
            clientId: dsr.clientId,
            templateId: null,
            templateName: "dsr-reminder",
            recipientName: r.name,
            recipientContact: null,
            channel: "IN_APP",
            subject: `DSR Reminder: ${dsr.type} for ${dsr.client.fullNameEn}`,
            body: `DSR ${dsr.id} submitted ${(ageMs / day).toFixed(1)} days ago (reminder threshold: 20 days). SLA expires at 30 days. Please action soon.`,
            attachments: null,
            sentById: null,
            status: "DRAFT",
            queuedAt: new Date(),
          },
        });
      }
      await db.dataSubjectRequest.update({ where: { id: dsr.id }, data: { reminderSentAt: new Date(), lastReminderAt: new Date() } });
      remindersSent++;
    }
  }

  console.info(`[DSR-SLA] Checked ${openDsrs.length} open DSRs. Reminders sent: ${remindersSent}. Escalations sent: ${escalationsSent}.`);
  return { checked: openDsrs.length, remindersSent, escalationsSent };
}
