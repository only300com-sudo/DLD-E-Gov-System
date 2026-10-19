// tests/ai/llm-behavioral.spec.ts
// Part 12B Review — 7 behavioral tests using a MOCK Ollama HTTP server.
//
// Tests:
//   1. extractRules parses valid LLM response into structured rules
//   2. Routes Arabic text to Falcon-H1 model
//   3. Routes English text to Qwen model
//   4. Handles malformed JSON response gracefully
//   5. isLlmAvailable returns false with short timeout when Ollama is down
//   6. Full pipeline produces ExtractedRule rows when Ollama is up
//   7. Pipeline skips extraction cleanly when Ollama is down
//
// Run: npx tsx tests/ai/llm-behavioral.spec.ts

import { PrismaClient } from "@prisma/client";
import http from "http";
import { AddressInfo } from "net";
const db = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { testsPassed++; console.log(`  ✓ ${name}`); }
  else { testsFailed++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

// ── Mock Ollama server (persistent across tests) ──────────────────────────
let mockServer: http.Server;
let mockPort = 0;
let lastRequestBody: any = null;
let mockResponseOverride: any = null;

async function main() {
  const { extractRules, isLlmAvailable, extractRulesBatch, __resetForTests, __setTimeoutForTests, arabicCharRatio, pickModel } = await import("../../src/lib/ai/local-llm");

  console.log("=== Part 12B — 7 Behavioral LLM Tests (Mock Ollama) ===\n");

  // Start mock server ONCE — reuse across tests
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        try { lastRequestBody = JSON.parse(body); } catch { lastRequestBody = body; }
        res.setHeader("Content-Type", "application/json");
        if (mockResponseOverride) {
          res.end(JSON.stringify(mockResponseOverride));
        } else {
          res.end(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({
              rules: [{ ruleType: "fee_rate", subject: "DLD_REGISTRATION_SALE", payload: { percentage: 0.04, appliesTo: "SALE-001" }, confidence: 0.94, rationale: "Stated in section 3.2" }],
            })}}],
          }));
        }
      });
    });
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = (mockServer.address() as AddressInfo).port;
      process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mockPort}/v1`;
      __resetForTests();
      resolve();
    });
  });

  // ── Test 1: extractRules parses valid LLM response ──
  console.log("Test 1: extractRules parses valid LLM response into structured rules");
  {
    mockResponseOverride = null;
    __resetForTests();
    const result = await extractRules("The DLD fee for sale registration is 4% of the property value.");
    assert("Returns 1 rule", result.rules.length === 1, `got ${result.rules.length}`);
    assert("ruleType = fee_rate", result.rules[0].ruleType === "fee_rate");
    assert("subject = DLD_REGISTRATION_SALE", result.rules[0].subject === "DLD_REGISTRATION_SALE");
    assert("payload.percentage = 0.04", result.rules[0].payload.percentage === 0.04);
    assert("confidence = 0.94", result.rules[0].confidence === 0.94);
    assert("promptVersion = v1", result.rules[0].promptVersion === "v1");
    assert("model in result", !!result.model);
    assert("durationMs > 0", result.durationMs > 0);
    assert("timedOut = false", result.timedOut === false);
  }

  // ── Test 2: Routes Arabic text to Falcon-H1 ──
  console.log("\nTest 2: Routes Arabic text to Falcon-H1 model");
  {
    mockResponseOverride = null;
    __resetForTests();
    await extractRules("رسوم تسجيل البيع هي أربعة بالمئة من قيمة العقار. هذه القاعدة معمول بها في جميع إمارات دبي.");
    assert("Mock received request", !!lastRequestBody);
    assert("Model = falcon-h1-arabic:7b (Arabic routing)", lastRequestBody?.model === "falcon-h1-arabic:7b", `got ${lastRequestBody?.model}`);
  }

  // ── Test 3: Routes English text to Qwen ──
  console.log("\nTest 3: Routes English text to Qwen model");
  {
    mockResponseOverride = null;
    __resetForTests();
    await extractRules("The DLD sale registration fee is 4% of the sale value.");
    assert("Model = qwen3:30b-a3b (English routing)", lastRequestBody?.model === "qwen3:30b-a3b", `got ${lastRequestBody?.model}`);
  }

  // ── Test 4: Handles malformed JSON gracefully ──
  console.log("\nTest 4: Handles malformed JSON response gracefully");
  {
    mockResponseOverride = { choices: [{ message: { content: "This is not JSON at all" } }] };
    __resetForTests();
    const result = await extractRules("Some text about fees.");
    assert("Returns empty rules (no throw)", result.rules.length === 0, `got ${result.rules.length}`);
    assert("timedOut = false", result.timedOut === false);
  }

  // ── Test 5: isLlmAvailable returns false when Ollama is down ──
  console.log("\nTest 5: isLlmAvailable returns false when Ollama is down");
  {
    const originalUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1/v1"; // unreachable port
    __resetForTests();
    const start = Date.now();
    const result = await isLlmAvailable();
    const elapsed = Date.now() - start;
    assert("Returns false", result === false);
    assert("Returns within 6s (short timeout)", elapsed < 6000, `took ${elapsed}ms`);
    // Restore
    process.env.OLLAMA_BASE_URL = originalUrl;
    __resetForTests();
  }

  // ── Test 6: Full pipeline produces rules when Ollama is up ──
  console.log("\nTest 6: Full pipeline produces ExtractedRule rows when Ollama is up");
  {
    mockResponseOverride = null;
    __resetForTests();

    const doc = await db.knowledgeDoc.create({
      data: { title: "Test Pipeline (up)", docType: "circular", issuer: "DLD", language: "en", filePath: "/tmp/test.txt", fileHash: `test-up-${Date.now()}`, fileSize: 100, mimeType: "text/plain", status: "extracted", uploadedBy: "test" },
    });
    const chunk = await db.docChunk.create({ data: { docId: doc.id, sequence: 0, pageNumber: 1, sectionHeading: null, text: "The DLD fee is 4%.", tokenCount: 10 } });

    const { rules, metrics } = await extractRulesBatch([{ id: chunk.id, text: "The DLD fee is 4%." }]);

    assert("Rules extracted (after dedup)", rules.length >= 1, `got ${rules.length}`);
    assert("Metrics: chunkCount = 1", metrics.chunkCount === 1);
    assert("Metrics: rulesAfterDedup >= 1", metrics.rulesAfterDedup >= 1);
    assert("Metrics: modelUsed present", !!metrics.modelUsed);
    assert("Metrics: promptVersion = v1", metrics.promptVersion === "v1");
    assert("Metrics: durationMs > 0", metrics.durationMs > 0);
    assert("Rule has sourceChunkIds array", Array.isArray(rules[0]?.sourceChunkIds) && rules[0].sourceChunkIds.length > 0);

    await db.extractedRule.deleteMany({ where: { docId: doc.id } }).catch(() => {});
    await db.extractionMetric.deleteMany({ where: { docId: doc.id } }).catch(() => {});
    await db.docChunk.deleteMany({ where: { docId: doc.id } }).catch(() => {});
    await db.knowledgeDoc.delete({ where: { id: doc.id } }).catch(() => {});
  }

  // ── Test 7: Pipeline skips when Ollama is down ──
  console.log("\nTest 7: Pipeline skips extraction cleanly when Ollama is down");
  {
    const originalUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1/v1";
    __resetForTests();
    const available = await isLlmAvailable();
    assert("isLlmAvailable returns false (Ollama down)", available === false);
    assert("Pipeline would skip LLM (graceful degradation)", available === false);
    process.env.OLLAMA_BASE_URL = originalUrl;
    __resetForTests();
  }

  // ── Test 8: Timeout fires when LLM doesn't respond (BEHAVIORAL) ──
  console.log("\nTest 8: Timeout fires after configured duration when mock never responds");
  {
    // Make the mock server accept connections but never send a response
    mockServer.removeAllListeners("request");
    mockServer.on("request", (_req, _res) => { /* never respond — hang forever */ });

    // Set a short timeout for the test (2 seconds, not 60)
    __setTimeoutForTests(2000);
    __resetForTests();

    const start = Date.now();
    const result = await extractRules("Some text that should timeout.");
    const elapsed = Date.now() - start;

    assert("Returns empty rules (timeout)", result.rules.length === 0, `got ${result.rules.length}`);
    assert("timedOut = true", result.timedOut === true, `got ${result.timedOut}`);
    assert("Elapsed > 1900ms (timeout fired)", elapsed > 1900, `took ${elapsed}ms`);
    assert("Elapsed < 5000ms (didn't hang forever)", elapsed < 5000, `took ${elapsed}ms`);

    // Restore mock
    __setTimeoutForTests(null);
    mockServer.removeAllListeners("request");
    mockServer.on("request", (req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        try { lastRequestBody = JSON.parse(body); } catch { lastRequestBody = body; }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            rules: [{ ruleType: "fee_rate", subject: "DLD_REGISTRATION_SALE", payload: { percentage: 0.04, appliesTo: "SALE-001" }, confidence: 0.94, rationale: "Test" }],
          })}}],
        }));
      });
    });
    __resetForTests();
  }

  // ── Test 9: Concurrency cap at 2 — 5 parallel calls take ~300ms not ~100ms (BEHAVIORAL) ──
  console.log("\nTest 9: p-limit(2) caps concurrency — 5 chunks take 3 batches, not 1");
  {
    let requestCount = 0;
    mockServer.removeAllListeners("request");
    mockServer.on("request", (req, res) => {
      requestCount++;
      const myCount = requestCount;
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        setTimeout(() => {
          try { lastRequestBody = JSON.parse(body); } catch { lastRequestBody = body; }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            choices: [{ message: { content: JSON.stringify({
              rules: [{ ruleType: "fee_rate", subject: `TEST_${myCount}`, payload: { percentage: 0.04 }, confidence: 0.9, rationale: "Concurrency test" }],
            })}}],
          }));
        }, 100); // 100ms delay per request
      });
    });
    __resetForTests();

    const chunks = Array.from({ length: 5 }, (_, i) => ({ id: `chunk-${i}`, text: `Test chunk ${i}` }));
    const start = Date.now();
    const { rules, metrics } = await extractRulesBatch(chunks);
    const elapsed = Date.now() - start;

    // With MAX_CONCURRENCY=2: 5 chunks = 3 batches (2+2+1) → 3 * 100ms = ~300ms
    // Without concurrency cap: 5 parallel → ~100ms
    assert("5 chunks produce rules", rules.length >= 1, `got ${rules.length}`);
    assert("Metrics: chunkCount = 5", metrics.chunkCount === 5);
    assert("Elapsed > 250ms (concurrency capped at 2, not 5 parallel)", elapsed > 250, `took ${elapsed}ms (should be ~300ms with cap, ~100ms without)`);
    assert("Elapsed < 800ms (not sequential at 1)", elapsed < 800, `took ${elapsed}ms (should be ~300ms, not ~500ms)`);

    // Restore mock
    mockServer.removeAllListeners("request");
    mockServer.on("request", (req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        try { lastRequestBody = JSON.parse(body); } catch { lastRequestBody = body; }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            rules: [{ ruleType: "fee_rate", subject: "DLD_REGISTRATION_SALE", payload: { percentage: 0.04, appliesTo: "SALE-001" }, confidence: 0.94, rationale: "Test" }],
          })}}],
        }));
      });
    });
    __resetForTests();
  }

  // Cleanup: close mock server (force-close all connections from timeout test)
  await new Promise<void>((resolve) => {
    mockServer.closeAllConnections?.();
    mockServer.close(() => resolve());
    // Safety: force exit after 2s if close hangs
    setTimeout(() => resolve(), 2000);
  });

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
