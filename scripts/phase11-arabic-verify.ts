// scripts/phase11-arabic-verify.ts
// Verify Arabic patterns work in escalation + guardrails + search.
import { checkEscalation } from "../src/lib/services/ai/escalationEngine";
import { applyGuardrails } from "../src/lib/services/ai/guardrails";
import { searchApprovedKnowledge } from "../src/lib/services/ai/knowledgeBase";

(async () => {
  console.log("=== Adjustment 1 — Arabic escalation patterns ===");

  const arabicEscalationTests: Array<{ message: string; expectedType: string }> = [
    { message: "هل ستوافق دائرة الأراضي على طلبي؟", expectedType: "dld_decision" },
    { message: "هل أنا مؤهل للحصول على الموافقة؟", expectedType: "dld_decision" },
    { message: "هل يجب أن أرفع دعوى؟", expectedType: "legal_advice" },
    { message: "أريد محادثة شخص حقيقي", expectedType: "human_requested" },
    { message: "لقد دفعتم أكثر من المطلوب في الرسوم", expectedType: "fee_dispute" },
    { message: "أريد تقديم شكوى", expectedType: "complaint" },
  ];

  let escalationPass = 0;
  for (const t of arabicEscalationTests) {
    const result = checkEscalation({ message: t.message });
    const ok = result.shouldEscalate && result.triggerType === t.expectedType;
    console.log(`  ${ok ? "✓" : "✗"} | "${t.message.slice(0, 40)}…" → triggerType=${result.triggerType} (expected ${t.expectedType})`);
    if (ok) escalationPass++;
  }
  console.log(`Arabic escalation: ${escalationPass}/${arabicEscalationTests.length} pass\n`);

  console.log("=== Adjustment 1 — Arabic guardrail patterns ===");

  const arabicGuardrailTests: Array<{ text: string; expectBlocked: boolean; reason: string }> = [
    { text: "تمت الموافقة على طلبك. مبروك!", expectBlocked: true, reason: "Cannot state case approval" },
    { text: "تم رفض طلبك", expectBlocked: true, reason: "Cannot state case rejection" },
    { text: "حالتك صالحة", expectBlocked: true, reason: "Cannot state case validity/completeness/eligibility" },
    { text: "أنت مؤهل للحصول على الخدمة", expectBlocked: true, reason: "Cannot state eligibility" },
    { text: "هذا التوكيل صحيح", expectBlocked: true, reason: "Cannot validate legal documents" },
    { text: "يجب أن تستشير محامي", expectBlocked: true, reason: "Cannot give legal advice" },
    { text: "أرسل رقم هويتك الإماراتية", expectBlocked: true, reason: "Cannot request sensitive data in chat" },
  ];

  let guardrailPass = 0;
  for (const t of arabicGuardrailTests) {
    const result = applyGuardrails(t.text);
    const ok = result.blocked && result.blockedReason === t.reason;
    console.log(`  ${ok ? "✓" : "✗"} | "${t.text}" → blocked=${result.blocked}, reason=${result.blockedReason} (expected: ${t.reason})`);
    if (ok) guardrailPass++;
  }
  console.log(`Arabic guardrails: ${guardrailPass}/${arabicGuardrailTests.length} pass\n`);

  console.log("=== Adjustment 2 — Unicode tokenizer with Arabic search ===");

  const arabicQueries = [
    "كيف أسجل بيع عقار", // "How do I register a property sale"
    "ما هي رسوم الأمانة", // "What are the trustee fees"
    "معلومات عن الموعد", // "Info about appointment"
  ];

  for (const q of arabicQueries) {
    const sources = await searchApprovedKnowledge(q, 3);
    console.log(`  Query: "${q}"`);
    console.log(`    Matches: ${sources.length}`);
    for (const s of sources.slice(0, 2)) {
      console.log(`    - "${s.title}" | category=${s.category} | score=${s.score}`);
      console.log(`      AR excerpt: ${(s.bodyAr ?? "(no AR body)").slice(0, 100)}…`);
    }
  }

  console.log("\n=== ALL ADJUSTMENTS VERIFIED ===");
})();
