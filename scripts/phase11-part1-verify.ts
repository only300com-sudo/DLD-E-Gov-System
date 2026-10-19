// scripts/phase11-part1-verify.ts
// Phase 11 Part 1 — Run the 7 API tests from §1.10 and report results.
// Uses bun's native TypeScript support to import the service functions directly.

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { searchApprovedKnowledge } from "../src/lib/services/ai/knowledgeBase";
import { checkEscalation } from "../src/lib/services/ai/escalationEngine";
import { applyGuardrails, appendDisclaimer, getAiDisclaimer } from "../src/lib/services/ai/guardrails";
import { getActiveProvider, getActivePromptVersion } from "../src/lib/services/ai/providerRegistry";
import { processAiMessage } from "../src/lib/services/ai/supportAgent";

const p = new PrismaClient();
const OUT = "/home/z/my-project/download/phase11-part1";
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
let token = "", csrf = "", userId = "", userName = "";

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@trustee.ae", password: "trustee123" }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error("login failed: " + JSON.stringify(d));
  token = d.token;
  csrf = d.csrfToken;
  userId = d.user.id;
  userName = d.user.name;
  console.log(`[LOGIN] logged in as ${userName}`);
}

// ============================================================
// TEST 1: searchApprovedKnowledge("how do I register a sale")
// ============================================================
async function test1() {
  console.log("\n=== TEST 1: searchApprovedKnowledge('how do I register a sale') ===");
  const query = "how do I register a property sale";
  const sources = await searchApprovedKnowledge(query, 5);
  console.log(`Query: "${query}"`);
  console.log(`Matching sources: ${sources.length}`);
  for (const s of sources.slice(0, 3)) {
    console.log(`  - "${s.title}" | category=${s.category} | score=${s.score}`);
    console.log(`    Excerpt: ${s.excerpt.slice(0, 100)}…`);
  }
  const passed = sources.length >= 1;
  writeFileSync(`${OUT}/test1-search.json`, JSON.stringify({ query, matches: sources.length, top: sources[0] ? { title: sources[0].title, score: sources[0].score } : null }, null, 2));
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `${sources.length} sources matched. Top: ${sources[0]?.title ?? "none"} (score=${sources[0]?.score ?? 0})` };
}

// ============================================================
// TEST 2: checkEscalation("Will DLD approve my case?")
// ============================================================
async function test2() {
  console.log("\n=== TEST 2: checkEscalation('Will DLD approve my case?') ===");
  const message = "Will DLD approve my case?";
  const result = checkEscalation({ message });
  console.log(`Message: "${message}"`);
  console.log(`Should escalate: ${result.shouldEscalate}`);
  console.log(`Trigger type: ${result.triggerType}`);
  console.log(`Reason: ${result.reason}`);
  console.log(`Priority: ${result.priority}`);
  writeFileSync(`${OUT}/test2-escalation-dld.json`, JSON.stringify({ message, result }, null, 2));
  const passed = result.shouldEscalate && result.triggerType === "dld_decision";
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `shouldEscalate=${result.shouldEscalate}, triggerType=${result.triggerType}, priority=${result.priority}` };
}

// ============================================================
// TEST 3: applyGuardrails("Your case is approved")
// ============================================================
async function test3() {
  console.log("\n=== TEST 3: applyGuardrails('Your case is approved') ===");
  const text = "Your case is approved. Congratulations!";
  const result = applyGuardrails(text);
  console.log(`Text: "${text}"`);
  console.log(`Blocked: ${result.blocked}`);
  console.log(`Blocked reason: ${result.blockedReason}`);
  console.log(`Matched pattern: ${result.matchedPattern}`);
  console.log(`Sanitized text: ${result.sanitizedText}`);
  writeFileSync(`${OUT}/test3-guardrails-approval.json`, JSON.stringify({ text, result }, null, 2));
  const passed = result.blocked && result.blockedReason === "Cannot state case approval";
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `blocked=${result.blocked}, reason=${result.blockedReason}` };
}

// ============================================================
// TEST 4: processAiMessage on a normal message
// Use a conversation with NO linked case (so case_in_review escalation won't trigger)
// and opted_in consent.
// ============================================================
async function test4() {
  console.log("\n=== TEST 4: processAiMessage on a normal message ===");
  // Use Gulf Properties LLC — no case linked, opted_in
  const conv = await p.waConversation.findFirst({
    where: { status: "open", contact: { consentStatus: "opted_in", fullName: "Gulf Properties LLC" } },
    select: { id: true, contactId: true, contact: { select: { fullName: true, preferredLanguage: true } } },
  });
  console.log(`Using conversation: ${conv?.id} (contact: ${conv?.contact?.fullName})`);
  if (!conv) {
    console.log("✗ FAIL — no eligible conversation");
    return { passed: false, evidence: "No eligible conversation with opted_in contact + no case linked" };
  }

  const result = await processAiMessage({
    conversationId: conv.id,
    message: "How do I register a property sale?",
    preferredLanguage: "en",
    contactId: conv.contactId,
  });
  console.log(`Run ID: ${result.run.id}`);
  console.log(`Escalated: ${result.run.escalated}`);
  console.log(`Blocked: ${result.run.blocked}`);
  console.log(`Confidence: ${result.run.confidence}`);
  console.log(`Sources used: ${result.run.sourcesUsed?.length ?? 0}`);
  console.log(`Output: ${(result.run.outputText ?? "").slice(0, 250)}…`);
  console.log(`Suggested reply ID: ${result.suggestedReply?.id ?? "none"}, status: ${result.suggestedReply?.status ?? "n/a"}`);
  writeFileSync(`${OUT}/test4-normal-message.json`, JSON.stringify({ conversation: conv.id, result }, null, 2));
  const passed = !result.run.escalated && !result.run.blocked && result.run.confidence !== null && result.run.outputText && result.suggestedReply;
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `run.id=${result.run.id}, escalated=${result.run.escalated}, blocked=${result.run.blocked}, confidence=${result.run.confidence?.toFixed(2)}, sources=${result.run.sourcesUsed?.length ?? 0}` };
}

// ============================================================
// TEST 5: processAiMessage on an escalation trigger
// ============================================================
async function test5() {
  console.log("\n=== TEST 5: processAiMessage on an escalation trigger ===");
  const conv = await p.waConversation.findFirst({
    where: { status: "open", contact: { consentStatus: "opted_in" } },
    select: { id: true, contactId: true, contact: { select: { fullName: true, preferredLanguage: true } } },
  });
  console.log(`Using conversation: ${conv?.id}`);
  if (!conv) {
    console.log("✗ FAIL — no eligible conversation");
    return { passed: false, evidence: "No eligible conversation" };
  }

  const result = await processAiMessage({
    conversationId: conv.id,
    message: "Will DLD approve my case?",
    preferredLanguage: "en",
    contactId: conv.contactId,
  });
  console.log(`Run ID: ${result.run.id}`);
  console.log(`Escalated: ${result.run.escalated}`);
  console.log(`Escalation: triggerType=${result.run.escalation?.triggerType}, reason=${result.run.escalation?.reason}`);
  // Check the queue item was created
  const queueItems = await p.aiReviewQueueItem.findMany({
    where: { conversationId: conv.id, itemType: "escalation" },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, itemType: true, priority: true, status: true, slaDueAt: true },
  });
  console.log(`Queue items for this conv (escalation type): ${queueItems.length}`);
  for (const q of queueItems.slice(0, 2)) {
    console.log(`  - ${q.itemType} | priority=${q.priority} | status=${q.status} | slaDue=${q.slaDueAt?.toISOString()}`);
  }
  // Check the escalation row was created
  const escalationRows = await p.aiEscalation.findMany({
    where: { conversationId: conv.id },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, triggerType: true, reason: true, priority: true, status: true },
  });
  console.log(`Escalation rows: ${escalationRows.length}`);
  for (const e of escalationRows.slice(0, 2)) {
    console.log(`  - ${e.triggerType} | reason=${e.reason?.slice(0, 50)} | priority=${e.priority} | status=${e.status}`);
  }
  writeFileSync(`${OUT}/test5-escalation.json`, JSON.stringify({ conversation: conv.id, result, queueItems, escalationRows }, null, 2));
  const passed = result.run.escalated && result.run.escalation?.triggerType === "dld_decision" && escalationRows.length > 0 && queueItems.length > 0;
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `escalated=${result.run.escalated}, triggerType=${result.run.escalation?.triggerType}, escalationRows=${escalationRows.length}, queueItems=${queueItems.length}` };
}

// ============================================================
// TEST 6: Provider fallback works when EXTERNAL_AI_ENABLED=false
// ============================================================
async function test6() {
  console.log("\n=== TEST 6: Provider fallback (EXTERNAL_AI_ENABLED=false) ===");
  const externalEnabled = process.env.EXTERNAL_AI_ENABLED === "true";
  console.log(`EXTERNAL_AI_ENABLED: ${process.env.EXTERNAL_AI_ENABLED ?? "undefined"}`);
  console.log(`OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY}`);
  const { provider, fallbackUsed, requestedKey } = await getActiveProvider();
  console.log(`Active provider: key=${provider.key}, mode=${provider.mode}`);
  console.log(`Fallback used: ${fallbackUsed}`);
  console.log(`Requested key: ${requestedKey ?? "n/a"}`);
  writeFileSync(`${OUT}/test6-provider-fallback.json`, JSON.stringify({ externalEnabled, hasOpenAiKey: !!process.env.OPENAI_API_KEY, provider: provider.key, mode: provider.mode, fallbackUsed, requestedKey }, null, 2));
  // Pass when fallback to internal is used (external disabled or unavailable)
  const passed = provider.key === "rule_based" && (provider.mode === "internal" || fallbackUsed);
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `provider.key=${provider.key}, mode=${provider.mode}, fallbackUsed=${fallbackUsed}, externalEnabled=${externalEnabled}` };
}

// ============================================================
// TEST 7: Prompt version seeds and is retrievable
// ============================================================
async function test7() {
  console.log("\n=== TEST 7: Prompt version v1.0 retrievable ===");
  const prompt = await getActivePromptVersion();
  console.log(`Active prompt: version=${prompt.version}, body length=${prompt.body.length}`);
  console.log(`Body excerpt: ${prompt.body.slice(0, 300)}…`);
  // Also check via DB
  const dbPrompt = await p.aiPromptVersion.findFirst({
    where: { isActive: true },
    select: { id: true, version: true, body: true, isActive: true, createdAt: true },
  });
  console.log(`DB check: id=${dbPrompt?.id?.slice(-6)}, version=${dbPrompt?.version}, isActive=${dbPrompt?.isActive}`);
  writeFileSync(`${OUT}/test7-prompt.json`, JSON.stringify({
    found: !!prompt,
    version: prompt.version,
    bodyLength: prompt.body.length,
    bodyExcerpt: prompt.body.slice(0, 500),
    dbRow: dbPrompt ? { id: dbPrompt.id, version: dbPrompt.version, isActive: dbPrompt.isActive } : null,
  }, null, 2));
  const passed = !!prompt && prompt.version === "v1.0" && prompt.body.length > 1000;
  console.log(passed ? "✓ PASS" : "✗ FAIL");
  return { passed, evidence: `version=${prompt.version}, bodyLength=${prompt.body.length}, dbRow=${dbPrompt ? "found" : "missing"}` };
}

(async () => {
  await login();
  const results: Record<string, { passed: boolean; evidence: string }> = {};
  try {
    results.test1_searchApprovedKnowledge = await test1();
    results.test2_checkEscalation_dld = await test2();
    results.test3_applyGuardrails_approval = await test3();
    results.test4_processAiMessage_normal = await test4();
    results.test5_processAiMessage_escalation = await test5();
    results.test6_providerFallback = await test6();
    results.test7_promptVersionRetrievable = await test7();
  } catch (e) {
    console.error("!!! TEST FAILED:", e);
  }
  console.log("\n=== SUMMARY ===");
  let pass = 0, fail = 0;
  for (const [k, v] of Object.entries(results)) {
    const status = v.passed ? "✓ PASS" : "✗ FAIL";
    if (v.passed) pass++; else fail++;
    console.log(`${status} | ${k} | ${v.evidence?.slice(0, 130) ?? ""}`);
  }
  console.log(`\n=== ${pass} pass / ${fail} fail / ${Object.keys(results).length} total ===`);
  writeFileSync(`${OUT}/all-tests-summary.json`, JSON.stringify(results, null, 2));
  await p.$disconnect();
})();
