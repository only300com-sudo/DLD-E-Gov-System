// scripts/phase11-adjustments-verify.ts
// Verify Adjustment 1 (Arabic patterns) + Adjustment 2 (Unicode tokenizer).

import { PrismaClient } from "@prisma/client";
import { searchApprovedKnowledge } from "../src/lib/services/ai/knowledgeBase";
import { checkEscalation } from "../src/lib/services/ai/escalationEngine";
import { applyGuardrails } from "../src/lib/services/ai/guardrails";
import { writeFileSync, mkdirSync } from "fs";

const p = new PrismaClient();
const OUT = "/home/z/my-project/download/phase11-adjustments";
mkdirSync(OUT, { recursive: true });

async function main() {
  console.log("=== Adjustment 1 — Arabic escalation triggers ===\n");
  const escalationTests = [
    { msg: "Will DLD approve my case?", expected: "dld_decision" },
    { msg: "هل ستوافق دائرة الأراضي على طلبي؟", expected: "dld_decision", arabic: true },
    { msg: "Should I sue my tenant?", expected: "legal_advice" },
    { msg: "هل أقاضي المستأجر؟", expected: "legal_advice", arabic: true },
    { msg: "You overcharged me on the fee", expected: "fee_dispute" },
    { msg: "لقد دفعتم أكثر من اللازم في الرسوم", expected: "fee_dispute", arabic: true },
  ];
  for (const t of escalationTests) {
    const result = checkEscalation({ message: t.msg });
    const passed = result.shouldEscalate && result.triggerType === t.expected;
    console.log(`${passed ? "✓ PASS" : "✗ FAIL"} | msg="${t.msg}" | expected=${t.expected} | got=${result.triggerType ?? "none"} | ${t.arabic ? "(AR)" : "(EN)"}`);
  }

  console.log("\n=== Adjustment 1 — Arabic guardrails ===\n");
  const guardrailTests = [
    { text: "Your case is approved. Congratulations!", expected: "Cannot state case approval" },
    { text: "تمت الموافقة على طلبك. مبروك!", expected: "Cannot state case approval", arabic: true },
    { text: "Your case is rejected.", expected: "Cannot state case rejection" },
    { text: "تم رفض طلبك.", expected: "Cannot state case rejection", arabic: true },
    { text: "This document is valid and legally binding.", expected: "Cannot validate legal documents" },
    { text: "هذا المستند ساري وملزم قانونيا.", expected: "Cannot validate legal documents", arabic: true },
    { text: "You should sue your tenant.", expected: "Cannot give legal advice" },
    { text: "يجب عليك رفع دعوى ضد المستأجر.", expected: "Cannot give legal advice", arabic: true },
    { text: "Please share your Emirates ID number here.", expected: "Cannot request sensitive data in chat" },
    { text: "أرسل رقم هويتك الإماراتية هنا.", expected: "Cannot request sensitive data in chat", arabic: true },
    { text: "DLD has approved your application.", expected: "Cannot speak for DLD" },
    { text: "وافقت دائرة الأراضي على طلبك.", expected: "Cannot speak for DLD", arabic: true },
  ];
  for (const t of guardrailTests) {
    const result = applyGuardrails(t.text);
    const passed = result.blocked && result.blockedReason === t.expected;
    console.log(`${passed ? "✓ PASS" : "✗ FAIL"} | text="${t.text}" | expected=${t.expected} | got=${result.blockedReason ?? "none"} | ${t.arabic ? "(AR)" : "(EN)"}`);
  }

  console.log("\n=== Adjustment 2 — Unicode tokenizer (Arabic search) ===\n");
  const searchTests = [
    { q: "how do I register a property sale", minMatches: 1, label: "EN — sale registration" },
    { q: "كيف أسجل بيع عقار", minMatches: 1, label: "AR — how do I register a property sale" },
    { q: "ما هي رسوم الأمانة", minMatches: 1, label: "AR — what are the trustee fees" },
    { q: "مواعيد العمل", minMatches: 1, label: "AR — office hours" },
    { q: "سياسة الخصوصية", minMatches: 1, label: "AR — privacy policy" },
  ];
  for (const t of searchTests) {
    const results = await searchApprovedKnowledge(t.q, 5);
    const passed = results.length >= t.minMatches;
    console.log(`${passed ? "✓ PASS" : "✗ FAIL"} | ${t.label} | query="${t.q}" | matches=${results.length} | top="${results[0]?.title ?? "none"}" score=${results[0]?.score ?? 0}`);
  }

  writeFileSync(`${OUT}/adjustments-verify-results.json`, JSON.stringify({
    escalationTests: escalationTests.length,
    guardrailTests: guardrailTests.length,
    searchTests: searchTests.length,
  }, null, 2));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
