// scripts/phase11-part2-seed.ts
// Phase 11 Part 2 — seed additions for verification.
// Adds: 3 conversations with sample AI runs (approved/rejected/escalated),
// 2 pending knowledge sources, 1 archived source, 5 review queue items,
// 1 conversation with aiPaused=true, 2 documents expiring within 30 days.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("[SEED-P2] Phase 11 Part 2 — seed additions starting…");

  // Wipe all Phase 11 tables (clean slate for re-runs)
  await prisma.aiReviewQueueItem.deleteMany();
  await prisma.aiEscalation.deleteMany();
  await prisma.aiSuggestedReply.deleteMany();
  await prisma.aiConversationRun.deleteMany();
  console.log("[SEED-P2] Wiped Phase 11 tables");

  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  const managerUser = await prisma.user.findFirst({ where: { role: "TRUSTEE_MANAGER" }, select: { id: true, name: true } });
  const officerUser = await prisma.user.findFirst({ where: { role: "TRUSTEE_OFFICER" }, select: { id: true, name: true } });
  if (!adminUser || !managerUser || !officerUser) throw new Error("Required users not found");

  // Find existing conversations
  const convs = await prisma.waConversation.findMany({
    where: { status: "open" },
    include: { contact: true },
    take: 3,
  });
  console.log(`[SEED-P2] Found ${convs.length} open conversations to use`);

  // 1. Three conversations with sample AI runs:
  //    Conv A — approved suggested reply
  //    Conv B — rejected suggested reply
  //    Conv C — active escalation

  let convA = convs[0];
  let convB = convs[1] ?? convs[0];
  let convC = convs[2] ?? convs[0];

  // If we don't have 3 convs, create extra ones
  if (convs.length < 3) {
    // Create extra convs by re-using contacts
    const contacts = await prisma.waContact.findMany({ take: 3 });
    for (let i = convs.length; i < 3; i++) {
      const c = contacts[i % contacts.length];
      const newConv = await prisma.waConversation.create({
        data: {
          contactId: c.id,
          status: "open",
          priority: "normal",
        },
      });
      if (i === 0 && !convA) convA = newConv;
      if (i === 1 && !convB) convB = newConv;
      if (i === 2 && !convC) convC = newConv;
    }
  }

  // Conv A — approved draft
  const runA = await prisma.aiConversationRun.create({
    data: {
      conversationId: convA.id,
      promptVersion: "v1.0",
      modelKey: "rule_based",
      modelVersion: "rule-based-v1",
      mode: "internal",
      inputText: "What are your office hours?",
      outputText: "Based on our Trustee Center Service Overview: Office hours are Sunday to Thursday, 9:00 AM to 6:00 PM.\n\nWould you like me to connect you with a Trustee Center team member for more details?\n\n— AI Assistant — Human Review May Be Required",
      confidence: 0.75,
      sourcesUsed: JSON.stringify([{ sourceId: "service-overview", title: "Trustee Center Service Overview", score: 5 }]),
      escalated: false,
      blocked: false,
      latencyMs: 75,
      tokenCount: 0,
      costFils: 0,
      aiDisclaimer: "AI Assistant — Human Review May Be Required",
      reviewedBy: managerUser.id,
      reviewedAt: new Date(),
      reviewDecision: "approved",
      reviewNotes: "Approved by manager",
    },
  });
  const draftA = await prisma.aiSuggestedReply.create({
    data: {
      runId: runA.id,
      conversationId: convA.id,
      draftText: "Based on our Trustee Center Service Overview: Office hours are Sunday to Thursday, 9:00 AM to 6:00 PM.\n\nWould you like me to connect you with a Trustee Center team member for more details?\n\n— AI Assistant — Human Review May Be Required",
      status: "approved",
      approvedBy: managerUser.id,
      approvedAt: new Date(),
      finalText: "Based on our Trustee Center Service Overview: Office hours are Sunday to Thursday, 9:00 AM to 6:00 PM.\n\nWould you like me to connect you with a Trustee Center team member for more details?\n\n— AI Assistant — Human Review May Be Required",
      sentAt: new Date(),
      sentMessageId: "stub-sample-approved",
    },
  });
  await prisma.aiReviewQueueItem.create({
    data: {
      itemType: "suggested_reply",
      itemId: draftA.id,
      conversationId: convA.id,
      priority: "normal",
      status: "resolved",
      resolvedAt: new Date(),
      slaDueAt: new Date(Date.now() + 2 * 60 * 60_000),
    },
  });
  console.log(`[SEED-P2] Conv A: ${convA.id.slice(-6)} — approved draft ${draftA.id.slice(-6)}`);

  // Conv B — rejected draft
  const runB = await prisma.aiConversationRun.create({
    data: {
      conversationId: convB.id,
      promptVersion: "v1.0",
      modelKey: "rule_based",
      modelVersion: "rule-based-v1",
      mode: "internal",
      inputText: "Tell me about fees",
      outputText: "Based on our Fee Schedule: Trustee fees range from AED 1,500 to AED 4,000 + DLD fees.\n\n— AI Assistant — Human Review May Be Required",
      confidence: 0.6,
      sourcesUsed: JSON.stringify([{ sourceId: "fee-schedule", title: "Trustee Center Fee Schedule", score: 4 }]),
      escalated: false,
      blocked: false,
      latencyMs: 60,
      tokenCount: 0,
      costFils: 0,
      aiDisclaimer: "AI Assistant — Human Review May Be Required",
      reviewedBy: officerUser.id,
      reviewedAt: new Date(),
      reviewDecision: "rejected",
      reviewNotes: "Rejected — needs more specific info",
    },
  });
  const draftB = await prisma.aiSuggestedReply.create({
    data: {
      runId: runB.id,
      conversationId: convB.id,
      draftText: "Based on our Fee Schedule: Trustee fees range from AED 1,500 to AED 4,000 + DLD fees.",
      status: "rejected",
      rejectionReason: "Reply too vague — officer rejected to request more detail",
      approvedBy: officerUser.id,
      approvedAt: new Date(),
    },
  });
  await prisma.aiReviewQueueItem.create({
    data: {
      itemType: "suggested_reply",
      itemId: draftB.id,
      conversationId: convB.id,
      priority: "normal",
      status: "resolved",
      resolvedAt: new Date(),
      slaDueAt: new Date(Date.now() + 2 * 60 * 60_000),
    },
  });
  console.log(`[SEED-P2] Conv B: ${convB.id.slice(-6)} — rejected draft ${draftB.id.slice(-6)}`);

  // Conv C — active escalation
  const runC = await prisma.aiConversationRun.create({
    data: {
      conversationId: convC.id,
      promptVersion: "v1.0",
      modelKey: "rule_based",
      modelVersion: "rule-based-v1",
      mode: "internal",
      inputText: "Should I sue my tenant for unpaid rent?",
      outputText: null,
      confidence: null,
      sourcesUsed: JSON.stringify([]),
      escalated: true,
      escalationReason: "Client requested legal advice",
      blocked: false,
      latencyMs: 30,
      tokenCount: 0,
      costFils: 0,
      aiDisclaimer: "AI Assistant — Human Review May Be Required",
    },
  });
  const escalationC = await prisma.aiEscalation.create({
    data: {
      runId: runC.id,
      conversationId: convC.id,
      triggerType: "legal_advice",
      reason: "Client requested legal advice",
      priority: "high",
      status: "open",
    },
  });
  await prisma.aiReviewQueueItem.create({
    data: {
      itemType: "escalation",
      itemId: escalationC.id,
      conversationId: convC.id,
      priority: "high",
      status: "pending",
      slaDueAt: new Date(Date.now() + 4 * 60 * 60_000),
    },
  });
  console.log(`[SEED-P2] Conv C: ${convC.id.slice(-6)} — escalation ${escalationC.id.slice(-6)} (legal_advice, high)`);

  // 2. Two pending knowledge sources
  const pendingSources = [
    { title: "[DRAFT] New Ejari Registration Procedure", category: "procedure", bodyEn: "Draft procedure for Ejari registration under the new 2026 regulations. Pending review by legal team.", bodyAr: "مسودة إجراء تسجيل إيجاري بموجب اللوائح الجديدة لعام 2026. بانتظار مراجعة الفريق القانوني.", citationRef: "TC-PROC-DRAFT-1" },
    { title: "[DRAFT] Updated POA Requirements", category: "checklist", bodyEn: "Draft checklist for Power of Attorney registration with the latest DLD requirements. Includes notarization rules.", bodyAr: "مسودة قائمة التحقق لتسجيل التوكيل الرسمي مع أحدث متطلبات DLD. تتضمن قواعد التوثيق.", citationRef: "TC-CHK-DRAFT-2" },
  ];
  for (const s of pendingSources) {
    const existing = await prisma.aiKnowledgeSource.findFirst({ where: { title: s.title } });
    if (existing) continue;
    await prisma.aiKnowledgeSource.create({
      data: {
        ...s,
        sourceOwner: "Trustee Center Compliance",
        effectiveDate: new Date(),
        reviewDate: new Date(Date.now() + 365 * 86_400_000),
        version: 1,
        approvalStatus: "pending",
        accessLevel: "internal",
        isActive: true,
        createdBy: adminUser.id,
      },
    });
  }
  console.log(`[SEED-P2] ${pendingSources.length} pending knowledge sources ensured`);

  // 3. One archived source
  const archivedExisting = await prisma.aiKnowledgeSource.findFirst({ where: { title: "[ARCHIVED] Legacy Trustee Fee Schedule (2023)" } });
  if (!archivedExisting) {
    await prisma.aiKnowledgeSource.create({
      data: {
        title: "[ARCHIVED] Legacy Trustee Fee Schedule (2023)",
        category: "fee_schedule",
        sourceOwner: "Trustee Center Compliance",
        effectiveDate: new Date("2023-01-01"),
        reviewDate: new Date("2023-12-31"),
        version: 1,
        approvalStatus: "archived",
        bodyEn: "Legacy fee schedule from 2023. Superseded by the 2025 fee schedule.",
        bodyAr: "جدول الرسوم القديم لعام 2023. تم استبداله بجدول رسوم 2025.",
        citationRef: "TC-FEE-ARCHIVED-2023",
        accessLevel: "internal",
        isActive: false,
        createdBy: adminUser.id,
      },
    });
    console.log(`[SEED-P2] 1 archived knowledge source ensured`);
  }

  // 4. Five additional AiReviewQueueItem rows
  // Already have 3 above (1 resolved approved + 1 resolved rejected + 1 pending escalation)
  // Add 4 more for variety
  for (let i = 0; i < 4; i++) {
    const sampleRun = await prisma.aiConversationRun.create({
      data: {
        conversationId: convA.id,
        promptVersion: "v1.0",
        modelKey: "rule_based",
        modelVersion: "rule-based-v1",
        mode: "internal",
        inputText: `Sample question ${i + 1} for queue variety`,
        outputText: `Sample answer ${i + 1}.`,
        confidence: 0.65 + i * 0.05,
        sourcesUsed: JSON.stringify([]),
        escalated: false,
        blocked: i === 2,
        blockedReason: i === 2 ? "Cannot state case approval" : null,
        latencyMs: 50 + i * 10,
        tokenCount: 0,
        costFils: 0,
        aiDisclaimer: "AI Assistant — Human Review May Be Required",
      },
    });
    if (i < 2) {
      // Add as suggested_reply drafts
      const draft = await prisma.aiSuggestedReply.create({
        data: {
          runId: sampleRun.id,
          conversationId: convA.id,
          draftText: `Sample draft ${i + 1}`,
          status: "pending",
        },
      });
      await prisma.aiReviewQueueItem.create({
        data: {
          itemType: "suggested_reply",
          itemId: draft.id,
          conversationId: convA.id,
          priority: i === 0 ? "urgent" : "normal",
          status: "pending",
          slaDueAt: new Date(Date.now() + 2 * 60 * 60_000),
        },
      });
    } else if (i === 2) {
      // Add as escalation (blocked)
      const escalation = await prisma.aiEscalation.create({
        data: {
          runId: sampleRun.id,
          conversationId: convA.id,
          triggerType: "complaint",
          reason: "Guardrail block — escalated for review",
          priority: "urgent",
          status: "open",
        },
      });
      await prisma.aiReviewQueueItem.create({
        data: {
          itemType: "escalation",
          itemId: escalation.id,
          conversationId: convA.id,
          priority: "urgent",
          status: "pending",
          slaDueAt: new Date(Date.now() + 60 * 60_000),
        },
      });
    } else {
      // Add as low_confidence
      await prisma.aiReviewQueueItem.create({
        data: {
          itemType: "low_confidence",
          itemId: sampleRun.id,
          conversationId: convA.id,
          priority: "normal",
          status: "pending",
          slaDueAt: new Date(Date.now() + 4 * 60 * 60_000),
        },
      });
    }
  }
  console.log(`[SEED-P2] 4 additional review queue items ensured`);

  // 5. One conversation with aiPaused=true (extension C demo)
  await prisma.waConversation.update({
    where: { id: convA.id },
    data: {
      aiPaused: true,
      aiPausedAt: new Date(),
      aiPausedBy: adminUser.id,
    },
  });
  console.log(`[SEED-P2] Conv A marked aiPaused=true for extension C demo`);

  // 6. Two documents expiring within 30 days (extension A demo)
  // The expiry scan looks for documents with createdAt in the 30-90 day window
  // To simulate this, we'll create 2 documents with createdAt 35-40 days ago
  const oldDate = new Date(Date.now() - 40 * 86_400_000);
  const cases = await prisma.case.findMany({
    take: 2,
    select: {
      id: true,
      caseRef: true,
      service: { select: { internalCode: true } },
      client: { select: { internalId: true, fullNameEn: true } },
    },
  });
  for (let i = 0; i < Math.min(2, cases.length); i++) {
    const c = cases[i];
    const existing = await prisma.document.findFirst({ where: { caseId: c.id, docType: "EXPIRY_DEMO" } });
    if (existing) continue;
    await prisma.document.create({
      data: {
        caseId: c.id,
        docType: "EXPIRY_DEMO",
        docName: `Expiry Demo Doc ${i + 1} for ${c.caseRef}`,
        fileName: `expiry-demo-${i + 1}.pdf`,
        filePath: `/home/z/my-project/TrusteeCenterData/Clients/${c.client?.internalId ?? "UNKNOWN"}_${c.client?.fullNameEn ?? "Unknown"}/${c.caseRef}_${c.service?.internalCode ?? "GENERIC"}/09_Documents_Received_via_WhatsApp/expiry-demo-${i + 1}.pdf`,
        fileSize: 100,
        mimeType: "application/pdf",
        version: 1,
        isCurrentVersion: true,
        uploadedById: null,
        verificationStatus: "PENDING",
        clientCode: c.client?.internalId ?? "UNKNOWN",
        caseNumber: c.caseRef,
        serviceType: c.service?.internalCode ?? "UNKNOWN",
        documentCategory: "09_Documents_Received_via_WhatsApp",
        createdAt: oldDate,
      },
    });
  }
  console.log(`[SEED-P2] ${Math.min(2, cases.length)} expiry-demo documents ensured`);

  // Restore convA aiPaused to false at the end (so it doesn't interfere with subsequent test runs)
  // Actually — the spec says we want 1 aiPaused conv for demo. Let's keep it.

  console.log("[SEED-P2] Phase 11 Part 2 — seed additions complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
