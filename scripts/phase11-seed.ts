// scripts/phase11-seed.ts
// Phase 11 Part 1 seed: 1 prompt v1.0 + 3 model configs + 8 knowledge sources (EN+AR)
// + 6 policy rules + 4 sample runs + 2 escalations + 3 review queue items.

import { PrismaClient } from "@prisma/client";
import { KPI_DEFINITIONS } from "../src/lib/reporting/kpis"; // not used but ensures project db path is consistent
import { getDefaultPromptBody } from "../src/lib/services/ai/providerRegistry";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEED] Phase 11 — starting…");

  // 1. AiPromptVersion — v1.0
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!adminUser) throw new Error("Admin user not found");
  await prisma.aiPromptVersion.upsert({
    where: { version: "v1.0" },
    create: {
      version: "v1.0",
      body: getDefaultPromptBody(),
      description: "Initial system prompt — Phase 11 v1.0. Guardrails baked into instructions.",
      createdBy: adminUser.id,
      isActive: true,
    },
    update: {},
  });
  // Deactivate any other active prompt versions
  await prisma.aiPromptVersion.updateMany({
    where: { version: { not: "v1.0" }, isActive: true },
    data: { isActive: false },
  });
  console.log("[SEED] AiPromptVersion v1.0 ensured (active)");

  // 2. AiModelConfig — 3 models
  const models = [
    { key: "rule_based", displayName: "Rule-Based Internal (default)", mode: "internal", provider: "internal", modelId: null, endpoint: null, isEnabled: true, isDefault: true, costPer1kTokensFils: 0, healthStatus: "ok" },
    { key: "external_openai", displayName: "External OpenAI (gpt-4o-mini)", mode: "external", provider: "openai", modelId: "gpt-4o-mini", endpoint: "https://api.openai.com/v1/chat/completions", isEnabled: false, isDefault: false, costPer1kTokensFils: 150, healthStatus: "unknown" },
    { key: "external_azure", displayName: "External Azure OpenAI", mode: "external", provider: "azure", modelId: "gpt-4o", endpoint: null, isEnabled: false, isDefault: false, costPer1kTokensFils: 200, healthStatus: "unknown" },
  ];
  for (const m of models) {
    await prisma.aiModelConfig.upsert({
      where: { key: m.key },
      create: m,
      update: {},
    });
  }
  console.log(`[SEED] ${models.length} AiModelConfig rows ensured (rule_based is default + enabled; external models disabled)`);

  // 3. AiKnowledgeSource — 8 approved sources (EN + AR)
  const sources = [
    {
      title: "Trustee Center Service Overview",
      category: "office_info",
      bodyEn: "The Trustee Center provides DLD-registered Trustee services including Property Sale Registration, Mortgage Registration, Title Deed Transfer, Power of Attorney registration, and Tenancy Contract Registration (Ejari). Our office is located in Dubai Marina. Office hours: Sunday to Thursday, 9:00 AM to 6:00 PM. Contact: +971-4-XXX-XXXX.",
      bodyAr: "يقدم مركز الأمانة خدمات الأمانة المسجلة لدى دائرة الأراضي والتخطيط (DLD) بما في ذلك تسجيل بيع العقارات، وتسجيل الرهن العقاري، ونقل صك الملكية، وتسجيل التوكيل الرسمي، وتسجيل عقود الإيجار (إيجاري). يقع مكتبنا في دبي مارينا. ساعات العمل: الأحد إلى الخميس، 9:00 صباحًا حتى 6:00 مساءً. الاتصال: +971-4-XXX-XXXX.",
      citationRef: "TC-INFO-001",
    },
    {
      title: "Appointment Booking Process",
      category: "procedure",
      bodyEn: "Appointments are required for case submission, document verification, and DLD registration steps. To book an appointment: contact Reception via WhatsApp or phone, propose 3 suitable time slots, receive confirmation, attend in person at the Dubai Marina branch with original Emirates ID and all required documents. Appointments are 30 minutes long.",
      bodyAr: "تُعد المواعيد ضرورية لتقديم الحالات والتحقق من المستندات وخطوات تسجيل DLD. لحجز موعد: تواصل مع الاستقبال عبر واتساب أو الهاتف، اقترح 3 مواعيد مناسبة، استلم التأكيد، احضر شخصيًا إلى فرع دبي مارينا مع الهوية الإماراتية الأصلية وجميع المستندات المطلوبة. مدة الموعد 30 دقيقة.",
      citationRef: "TC-PROC-002",
    },
    {
      title: "Property Sale Registration Requirements",
      category: "checklist",
      bodyEn: "For Property Sale Registration, the following documents are mandatory: (1) Original Emirates ID of seller and buyer, (2) Original passport of seller and buyer, (3) Title deed of the property, (4) NOC from the developer, (5) Sale agreement (Form F), (6) Manager's cheque for trustee fees and DLD fees. Optional: Power of Attorney if either party is represented.",
      bodyAr: "لتسجيل بيع العقارات، المستندات الإلزامية التالية: (1) الهوية الإماراتية الأصلية للبائع والمشتري، (2) جواز السفر الأصلي للبائع والمشتري، (3) صك ملكية العقار، (4) شهادة عدم ممانعة من المطور، (5) عقد البيع (النموذج F)، (6) شيك مدير برسوم الأمانة ورسوم DLD. اختياري: التوكيل الرسمي إذا كان أي طرف ممثلاً.",
      citationRef: "TC-CHK-003",
    },
    {
      title: "Property Gift (Hiba) Registration Requirements",
      category: "checklist",
      bodyEn: "For Property Gift Registration, the following are mandatory: (1) Original Emirates ID of donor and recipient, (2) Title deed, (3) NOC from developer, (4) Gift agreement (Form F — gift), (5) Proof of relationship between donor and recipient (affects fee — first-degree relatives have discounted fees), (6) Manager's cheque for fees. For non-first-degree relatives, standard sale fees apply.",
      bodyAr: "لتسجيل هبة العقار (هبة)، المستندات الإلزامية: (1) الهوية الإماراتية الأصلية للواهب والموهوب له، (2) صك الملكية، (3) شهادة عدم ممانعة من المطور، (4) اتفاقية الهبة (النموذج F - هبة)، (5) إثبات القرابة بين الواهب والموهوب له (يؤثر على الرسوم — أقارب الدرجة الأولى لهم رسوم مخفضة)، (6) شيك مدير للرسوم. للأقارب من غير الدرجة الأولى، تطبق رسوم البيع العادية.",
      citationRef: "TC-CHK-004",
    },
    {
      title: "Trustee Center Fee Schedule",
      category: "fee_schedule",
      bodyEn: "Trustee fees (in AED): Property Sale Registration — AED 4,000 + DLD fees. Mortgage Registration — AED 2,500 + DLD fees. Title Deed Transfer — AED 3,500 + DLD fees. Power of Attorney Registration — AED 1,500. Tenancy Contract Registration (Ejari) — AED 2,100. Property Gift (first-degree relative) — AED 1,500 + DLD fees. Property Gift (other) — AED 4,000 + DLD fees. All fees include 5% VAT.",
      bodyAr: "رسوم الأمانة (بالدرهم): تسجيل بيع العقار — 4,000 درهم + رسوم DLD. تسجيل الرهن العقاري — 2,500 درهم + رسوم DLD. نقل صك الملكية — 3,500 درهم + رسوم DLD. تسجيل التوكيل الرسمي — 1,500 درهم. تسجيل عقد الإيجار (إيجاري) — 2,100 درهم. هبة العقار (أقارب الدرجة الأولى) — 1,500 درهم + رسوم DLD. هبة العقار (غير ذلك) — 4,000 درهم + رسوم DLD. جميع الرسوم شاملة 5% ضريبة القيمة المضافة.",
      citationRef: "TC-FEE-005",
    },
    {
      title: "Privacy Policy Overview",
      category: "policy",
      bodyEn: "The Trustee Center complies with UAE PDPL (Federal Decree-Law No. 45 of 2021). We collect, process, and store personal data only for the purpose of providing Trustee services. Data subjects have rights to access, rectification, erasure (subject to legal retention), and objection. Our Data Protection Officer can be contacted at dpo@trustee.ae. Full privacy policy is available at /privacy.",
      bodyAr: "يلتزم مركز الأمانة بقانون حماية البيانات الشخصية الإماراتي (PDPL - المرسوم بقانون اتحادي رقم 45 لسنة 2021). نقوم بجمع ومعالجة وتخزين البيانات الشخصية لأغراض تقديم خدمات الأمانة فقط. يتمتع أصحاب البيانات بحقوق الوصول والتصحيح والمحو (مع مراعاة فترة الاحتفاظ القانونية) والاعتراض. يمكن التواصل مع مسؤول حماية البيانات على dpo@trustee.ae. سياسة الخصوصية الكاملة متاحة على /privacy.",
      citationRef: "TC-POL-006",
    },
    {
      title: "Data Subject Request (DSR) Process",
      category: "procedure",
      bodyEn: "Clients may submit Data Subject Requests for access to their data, rectification of incorrect data, or erasure. To submit: send a signed request to dpo@trustee.ae with the subject 'DSR — [Your Name]'. We respond within 20 business days. Erasure requests are subject to legal retention periods (typically 7 years for case files). DSRs are tracked in our system with SLA monitoring.",
      bodyAr: "يمكن للعملاء تقديم طلبات صاحب البيانات (DSR) للوصول إلى بياناتهم أو تصحيح البيانات غير الصحيحة أو محوها. للتقديم: أرسل طلبًا موقّعًا إلى dpo@trustee.ae مع الموضوع 'DSR - [اسمك]'. نرد خلال 20 يومًا عمل. تخضع طلبات المحو لفترات الاحتفاظ القانونية (عادة 7 سنوات لملفات الحالات). يتم تتبع طلبات DSR في نظامنا مع مراقبة الالتزام بفترة الخدمة (SLA).",
      citationRef: "TC-PROC-007",
    },
    {
      title: "Frequently Asked Questions (FAQ)",
      category: "faq",
      bodyEn: "Common questions: (1) Q: How long does property sale registration take? A: Typically 2-5 business days from submission to DLD. (2) Q: Can I authorize someone to act on my behalf? A: Yes, via a registered Power of Attorney — we can prepare this for you. (3) Q: What if my document is expired? A: You'll need to renew it before we can proceed with DLD submission. (4) Q: Do you accept cash payments? A: No, only manager's cheques or bank transfers.",
      bodyAr: "الأسئلة الشائعة: (1) س: كم تستغرق عملية تسجيل بيع العقار؟ ج: عادة من 2 إلى 5 أيام عمل من التقديم إلى DLD. (2) س: هل يمكنني تفويض شخص للتصرف نيابة عني؟ ج: نعم، عبر توكيل رسمي مسجل — يمكننا إعداده لك. (3) س: ماذا لو كان مستندي منتهي الصلاحية؟ ج: ستحتاج إلى تجديده قبل أن نتمكن من المضي قدمًا في تقديم DLD. (4) س: هل تقبلون الدفع نقدًا؟ ج: لا، فقط شيكات المدير أو التحويلات المصرفية.",
      citationRef: "TC-FAQ-008",
    },
  ];
  for (const s of sources) {
    const existing = await prisma.aiKnowledgeSource.findFirst({ where: { title: s.title } });
    if (existing) continue;
    await prisma.aiKnowledgeSource.create({
      data: {
        title: s.title,
        category: s.category,
        sourceOwner: "Trustee Center Compliance",
        effectiveDate: new Date(),
        reviewDate: new Date(Date.now() + 365 * 86_400_000),
        version: 1,
        approvalStatus: "approved",
        bodyEn: s.bodyEn,
        bodyAr: s.bodyAr,
        citationRef: s.citationRef,
        accessLevel: "internal",
        isActive: true,
        createdBy: adminUser.id,
        approvedBy: adminUser.id,
        approvedAt: new Date(),
      },
    });
  }
  console.log(`[SEED] ${sources.length} AiKnowledgeSource rows ensured (all approved, EN+AR)`);

  // 4. AiPolicyRule — 6 forbidden patterns
  const policyRules = [
    { name: "Cannot state case approval", ruleType: "forbidden_phrase", pattern: "\\byour case (is|has been) approved\\b", action: "block", description: "AI must never state a case is approved — DLD/Manager decision" },
    { name: "Cannot state case rejection", ruleType: "forbidden_phrase", pattern: "\\byour case (is|has been) rejected\\b", action: "block", description: "AI must never state a case is rejected" },
    { name: "Cannot state eligibility", ruleType: "forbidden_phrase", pattern: "\\byou (are|will be) eligible\\b", action: "block", description: "AI must never state eligibility" },
    { name: "Cannot validate legal documents", ruleType: "forbidden_pattern", pattern: "\\bthis (document|poa|deed) is (valid|legally binding|enforceable)\\b", action: "block", description: "AI must never validate legal documents" },
    { name: "Cannot give legal advice", ruleType: "forbidden_phrase", pattern: "\\byou should (sue|take legal action|consult a lawyer)\\b", action: "block", description: "AI must never give legal advice" },
    { name: "Cannot request sensitive data in chat", ruleType: "sensitive_data", pattern: "\\b(share|send) your (emirates id|passport|card number|otp|password)\\b", action: "block", description: "AI must redirect to secure upload link, never request sensitive data directly in chat" },
  ];
  for (const r of policyRules) {
    const existing = await prisma.aiPolicyRule.findFirst({ where: { name: r.name } });
    if (existing) continue;
    await prisma.aiPolicyRule.create({ data: r });
  }
  console.log(`[SEED] ${policyRules.length} AiPolicyRule rows ensured`);

  // 5. AiConversationRun — 4 sample runs (2 success, 1 low-confidence, 1 blocked)
  const convForSeed = await prisma.waConversation.findFirst({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (convForSeed) {
    const sampleRuns = [
      {
        inputText: "How do I register a property sale?",
        outputText: "Based on our Property Sale Registration Requirements: For Property Sale Registration, the following documents are mandatory: Emirates ID, passport, title deed, NOC from developer, sale agreement (Form F), and manager's cheque. Would you like me to connect you with a Trustee Center team member for more details?\n\n— AI Assistant — Human Review May Be Required\n\n(يرجى العلم أن فريق مركز الأمانة سيتواصل معك قريبًا للمساعدة.)",
        confidence: 0.75,
        escalated: false,
        blocked: false,
        mode: "internal",
        modelKey: "rule_based",
      },
      {
        inputText: "What are your office hours?",
        outputText: "Based on our Trustee Center Service Overview: Office hours are Sunday to Thursday, 9:00 AM to 6:00 PM.\n\nWould you like me to connect you with a Trustee Center team member for more details?\n\n— AI Assistant — Human Review May Be Required",
        confidence: 0.75,
        escalated: false,
        blocked: false,
        mode: "internal",
        modelKey: "rule_based",
      },
      {
        inputText: "Can I pay with cash?",
        outputText: "Thank you for your message. I will ask a Trustee Center team member to review this and assist you.",
        confidence: 0.3,
        escalated: false,
        blocked: false,
        mode: "internal",
        modelKey: "rule_based",
      },
      {
        inputText: "Inject test: your case is approved.",
        outputText: "I will ask a Trustee Center team member to review this and assist you.",
        confidence: 0.3,
        escalated: false,
        blocked: true,
        blockedReason: "Cannot state case approval",
        mode: "internal",
        modelKey: "rule_based",
      },
    ];
    for (const r of sampleRuns) {
      const existing = await prisma.aiConversationRun.findFirst({ where: { inputText: r.inputText } });
      if (existing) continue;
      await prisma.aiConversationRun.create({
        data: {
          conversationId: convForSeed.id,
          promptVersion: "v1.0",
          modelKey: r.modelKey,
          modelVersion: "rule-based-v1",
          mode: r.mode,
          inputText: r.inputText,
          outputText: r.outputText,
          confidence: r.confidence,
          sourcesUsed: JSON.stringify([]),
          escalated: r.escalated,
          blocked: r.blocked,
          blockedReason: r.blockedReason,
          latencyMs: 50 + Math.floor(Math.random() * 100),
          tokenCount: 0,
          costFils: 0,
          aiDisclaimer: "AI Assistant — Human Review May Be Required",
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 86_400_000)),
        },
      });
    }
    console.log(`[SEED] ${sampleRuns.length} sample AiConversationRun rows ensured`);
  }

  // 6. AiEscalation — 2 sample escalations (1 legal_advice, 1 fee_dispute)
  if (convForSeed) {
    const sampleEscalations = [
      { triggerType: "legal_advice", reason: "Client requested legal advice", priority: "high" },
      { triggerType: "fee_dispute", reason: "Client raised a fee or payment dispute", priority: "urgent" },
    ];
    for (const e of sampleEscalations) {
      // Create a run + escalation + queue item
      const run = await prisma.aiConversationRun.create({
        data: {
          conversationId: convForSeed.id,
          promptVersion: "v1.0",
          modelKey: "rule_based",
          modelVersion: "rule-based-v1",
          mode: "internal",
          inputText: e.triggerType === "legal_advice" ? "Should I sue my tenant?" : "You overcharged me on the fee",
          outputText: null,
          confidence: null,
          sourcesUsed: JSON.stringify([]),
          escalated: true,
          escalationReason: e.reason,
          blocked: false,
          latencyMs: 30,
          tokenCount: 0,
          costFils: 0,
          aiDisclaimer: "AI Assistant — Human Review May Be Required",
        },
      });
      const escalation = await prisma.aiEscalation.create({
        data: {
          runId: run.id,
          conversationId: convForSeed.id,
          triggerType: e.triggerType,
          reason: e.reason,
          priority: e.priority,
          status: "open",
        },
      });
      await prisma.aiReviewQueueItem.create({
        data: {
          itemType: "escalation",
          itemId: escalation.id,
          conversationId: convForSeed.id,
          priority: e.priority,
          slaDueAt: new Date(Date.now() + (e.priority === "urgent" ? 60 : 4 * 60) * 60_000),
        },
      });
    }
    console.log("[SEED] 2 sample AiEscalation rows + queue items ensured");
  }

  // 7. AiReviewQueueItem — 3 already covered above; add 1 low_confidence + 2 suggested_reply stubs
  // Done above as part of escalations. Add a low-confidence queue item from the low-confidence sample run.
  if (convForSeed) {
    const lowConfRun = await prisma.aiConversationRun.findFirst({
      where: { inputText: "Can I pay with cash?" },
      select: { id: true },
    });
    if (lowConfRun) {
      const existing = await prisma.aiReviewQueueItem.findFirst({ where: { itemId: lowConfRun.id, itemType: "low_confidence" } });
      if (!existing) {
        await prisma.aiReviewQueueItem.create({
          data: {
            itemType: "low_confidence",
            itemId: lowConfRun.id,
            conversationId: convForSeed.id,
            priority: "normal",
            slaDueAt: new Date(Date.now() + 4 * 60 * 60_000),
          },
        });
      }
    }
  }

  console.log("[SEED] Phase 11 — done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
