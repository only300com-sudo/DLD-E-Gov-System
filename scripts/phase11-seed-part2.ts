// scripts/phase11-seed-part2.ts
// Phase 11 Part 2 — additional seed: 3 convs with sample AI runs +
// 2 pending KB sources + 1 archived source + 5 queue items + 1 paused conv +
// 2 documents expiring within 30 days.

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  console.log("[SEED-P2] Phase 11 Part 2 — starting…");

  // 1. 2 pending knowledge sources (for approval workflow demo)
  const admin = await p.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("Admin not found");
  const pendingSources = [
    {
      title: "Trustee Center Holiday Schedule (2026)",
      category: "office_info",
      bodyEn: "The Trustee Center observes UAE public holidays. Closed: Eid al-Fitr (3 days), Eid al-Adha (4 days), National Day (Dec 2-3), Prophet's Birthday, Islamic New Year, Ascension Day, Martyr's Day. Emergency contact during holidays: +971-50-XXX-XXXX (WhatsApp only).",
      bodyAr: "يحترم مركز الأمانة أيام العطل الرسمية في الإمارات. مغلق: عيد الفطر (3 أيام)، عيد الأضحى (4 أيام)، اليوم الوطني (2-3 ديسمبر)، المولد النبوي، رأس السنة الهجرية، ليلة الإسراء والمعراج، يوم الشهيد. للطوارئ خلال العطل: +971-50-XXX-XXXX (واتساب فقط).",
      citationRef: "TC-INFO-009",
    },
    {
      title: "Refund Policy (Pending)",
      category: "policy",
      bodyEn: "Trustee fees are non-refundable once DLD submission has been initiated. If the case is cancelled before submission, 50% of the trustee fee is refunded. DLD fees are non-refundable once paid to DLD. Refund requests must be submitted in writing to dpo@trustee.ae.",
      bodyAr: "رسوم الأمانة غير قابلة للاسترداد بمجرد بدء تقديم DLD. في حال إلغاء الحالة قبل التقديم، يتم استرداد 50% من رسوم الأمانة. رسوم DLD غير قابلة للاسترداد بمجرد دفعها لدائرة الأراضي. يجب تقديم طلبات الاسترداد كتابيًا إلى dpo@trustee.ae.",
      citationRef: "TC-POL-010",
    },
  ];
  for (const s of pendingSources) {
    const existing = await p.aiKnowledgeSource.findFirst({ where: { title: s.title } });
    if (existing) continue;
    await p.aiKnowledgeSource.create({
      data: {
        ...s,
        sourceOwner: "Trustee Center Compliance",
        effectiveDate: new Date(),
        reviewDate: new Date(Date.now() + 365 * 86_400_000),
        version: 1,
        approvalStatus: "pending",
        accessLevel: "internal",
        isActive: true,
        createdBy: admin.id,
      },
    });
  }
  console.log(`[SEED-P2] ${pendingSources.length} pending AiKnowledgeSource rows ensured`);

  // 2. 1 archived source
  const archivedSource = {
    title: "Legacy Office Location (Old Address)",
    category: "office_info",
    bodyEn: "The Trustee Center was previously located at the Old Address — please disregard. We have moved to Dubai Marina.",
    bodyAr: "كان مركز الأمانة سابقًا في العنوان القديم — يرجى تجاهل ذلك. انتقلنا إلى دبي مارينا.",
    citationRef: "TC-INFO-ARCHIVED-001",
  };
  const existingArchived = await p.aiKnowledgeSource.findFirst({ where: { title: archivedSource.title } });
  if (!existingArchived) {
    await p.aiKnowledgeSource.create({
      data: {
        ...archivedSource,
        sourceOwner: "Trustee Center",
        effectiveDate: new Date(Date.now() - 365 * 86_400_000),
        reviewDate: new Date(Date.now() - 30 * 86_400_000),
        version: 1,
        approvalStatus: "archived",
        accessLevel: "internal",
        isActive: false,
        createdBy: admin.id,
      },
    });
  }
  console.log("[SEED-P2] 1 archived AiKnowledgeSource ensured");

  // 3. 1 conversation with aiPaused=true (Extension C demo)
  const convs = await p.waConversation.findMany({ where: { status: "open" }, select: { id: true } });
  if (convs.length > 0) {
    const convToPause = convs[0];
    const existing = await p.waConversation.findUnique({ where: { id: convToPause.id }, select: { aiPaused: true } });
    if (!existing?.aiPaused) {
      await p.waConversation.update({
        where: { id: convToPause.id },
        data: { aiPaused: true, aiPausedAt: new Date(), aiPausedBy: admin.id },
      });
      console.log(`[SEED-P2] Set aiPaused=true on conversation ${convToPause.id.slice(-6)}`);
    }
  }

  // 4. 5 additional AiReviewQueueItem rows (variety: 2 suggested_reply, 2 escalation, 1 low_confidence)
  const optedInConv = await p.waConversation.findFirst({
    where: { status: "open", contact: { consentStatus: "opted_in" } },
    select: { id: true, contactId: true, contact: { select: { preferredLanguage: true, fullName: true } } },
  });
  if (optedInConv) {
    for (let i = 0; i < 2; i++) {
      const run = await p.aiConversationRun.create({
        data: {
          conversationId: optedInConv.id,
          promptVersion: "v1.0",
          modelKey: "rule_based",
          modelVersion: "rule-based-v1",
          mode: "internal",
          inputText: i === 0 ? "What are your office hours?" : "How do I book an appointment?",
          outputText: i === 0
            ? "Based on our Trustee Center Service Overview: Office hours: Sunday to Thursday, 9:00 AM to 6:00 PM.\n\n— AI Assistant — Human Review May Be Required"
            : "Based on our Appointment Booking Process: To book an appointment, contact Reception via WhatsApp or phone, propose 3 suitable time slots, receive confirmation, attend in person.\n\n— AI Assistant — Human Review May Be Required",
          confidence: 0.75,
          sourcesUsed: JSON.stringify([]),
          escalated: false,
          blocked: false,
          latencyMs: 50 + Math.floor(Math.random() * 100),
          tokenCount: 0,
          costFils: 0,
          aiDisclaimer: "AI Assistant — Human Review May Be Required",
        },
      });
      const draft = await p.aiSuggestedReply.create({
        data: {
          runId: run.id,
          conversationId: optedInConv.id,
          draftText: run.outputText ?? "",
          status: "pending",
        },
      });
      await p.aiReviewQueueItem.create({
        data: {
          itemType: "suggested_reply",
          itemId: draft.id,
          conversationId: optedInConv.id,
          priority: "normal",
          slaDueAt: new Date(Date.now() + 2 * 60 * 60_000),
        },
      });
    }

    // 2 escalation queue items (1 fee_dispute, 1 legal_advice)
    for (const trig of [
      { triggerType: "fee_dispute", reason: "Client raised a fee or payment dispute", priority: "urgent" },
      { triggerType: "legal_advice", reason: "Client requested legal advice", priority: "high" },
    ]) {
      const run = await p.aiConversationRun.create({
        data: {
          conversationId: optedInConv.id,
          promptVersion: "v1.0",
          modelKey: "rule_based",
          modelVersion: "rule-based-v1",
          mode: "internal",
          inputText: trig.triggerType === "fee_dispute" ? "You overcharged me on the fee" : "Should I sue my tenant?",
          outputText: null,
          confidence: null,
          sourcesUsed: JSON.stringify([]),
          escalated: true,
          escalationReason: trig.reason,
          blocked: false,
          latencyMs: 30,
          tokenCount: 0,
          costFils: 0,
          aiDisclaimer: "AI Assistant — Human Review May Be Required",
        },
      });
      const escalation = await p.aiEscalation.create({
        data: {
          runId: run.id,
          conversationId: optedInConv.id,
          triggerType: trig.triggerType,
          reason: trig.reason,
          priority: trig.priority as "urgent" | "high",
        },
      });
      await p.aiReviewQueueItem.create({
        data: {
          itemType: "escalation",
          itemId: escalation.id,
          conversationId: optedInConv.id,
          priority: trig.priority as "urgent" | "high",
          slaDueAt: new Date(Date.now() + (trig.priority === "urgent" ? 60 : 4 * 60) * 60_000),
        },
      });
    }

    // 1 low_confidence queue item
    const lowConfRun = await p.aiConversationRun.create({
      data: {
        conversationId: optedInConv.id,
        promptVersion: "v1.0",
        modelKey: "rule_based",
        modelVersion: "rule-based-v1",
        mode: "internal",
        inputText: "I have a question about a complex multi-party inheritance case.",
        outputText: "Thank you for your message. I will ask a Trustee Center team member to review this and assist you.",
        confidence: 0.3,
        sourcesUsed: JSON.stringify([]),
        escalated: false,
        blocked: false,
        latencyMs: 40,
        tokenCount: 0,
        costFils: 0,
        aiDisclaimer: "AI Assistant — Human Review May Be Required",
      },
    });
    await p.aiReviewQueueItem.create({
      data: {
        itemType: "low_confidence",
        itemId: lowConfRun.id,
        conversationId: optedInConv.id,
        priority: "normal",
        slaDueAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
    console.log("[SEED-P2] 5 additional AiReviewQueueItem rows ensured (2 suggested_reply + 2 escalation + 1 low_confidence)");
  }

  // 5. 2 documents expiring within 30 days (Extension A demo)
  // Since Document model has no expiryDate, we use createdAt 60 days ago (within 90-day validity window)
  // The expiry scheduler flags docs whose createdAt is in the 30-90 day window.
  const cases = await p.case.findMany({ select: { id: true, caseRef: true, clientId: true, client: { select: { internalId: true, fullNameEn: true } } }, take: 3 });
  if (cases.length >= 2) {
    for (let i = 0; i < 2; i++) {
      const c = cases[i];
      const doc = await p.document.findFirst({ where: { caseId: c.id, docType: "EMIRATES_ID" } });
      if (doc) continue; // skip if already exists
      // Create a document with createdAt 60 days ago (within the 30-day pre-expiry window)
      const created60dAgo = new Date(Date.now() - 60 * 86_400_000);
      await p.document.create({
        data: {
          caseId: c.id,
          docType: "EMIRATES_ID",
          docName: `Emirates ID — ${c.client?.fullNameEn ?? "Unknown"}`,
          fileName: `emirates-id-expiry-demo-${i + 1}.pdf`,
          filePath: `/home/z/my-project/TrusteeCenterData/Clients/${c.client?.internalId ?? "UNKNOWN"}_${c.client?.fullNameEn?.replace(/[^a-zA-Z0-9]+/g, "_") ?? "Unknown"}/${c.caseRef}_DEMO/02_Identity_Documents/expiry-demo-${i + 1}.pdf`,
          fileSize: 1024,
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          uploadedById: admin.id,
          verificationStatus: "VERIFIED",
          clientCode: c.client?.internalId ?? "UNKNOWN",
          caseNumber: c.caseRef,
          serviceType: "DEMO",
          documentCategory: "02_Identity_Documents",
          createdAt: created60dAgo,
          updatedAt: created60dAgo,
        },
      });
    }
    console.log("[SEED-P2] 2 expiring Document rows ensured (createdAt 60d ago — within 90-day window)");
  }

  console.log("[SEED-P2] Phase 11 Part 2 — done.");
}

main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
