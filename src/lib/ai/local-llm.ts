// src/lib/ai/local-llm.ts
// Part 12B — Local LLM client (Ollama + Qwen3/Falcon-H1, zero cloud cost).
// Hardened: 60s timeout, p-limit(2) concurrency, rule dedup, metrics, prompt versioning.

import OpenAI from "openai";
import fs from "fs";
import path from "path";

const PROMPT_VERSION = "v1";
const PROMPT_PATH = path.join(process.cwd(), "src/lib/ai/prompts/rule-extraction.v1.txt");
const LLM_TIMEOUT_MS = 60_000;
const MAX_CONCURRENCY = 2;

let client: OpenAI | null = null;
let cachedPrompt: string | null = null;
let _timeoutOverride: number | null = null;

function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: "ollama",
  });
  return client;
}

function getTimeoutMs(): number {
  return _timeoutOverride ?? LLM_TIMEOUT_MS;
}

function getSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  try { cachedPrompt = fs.readFileSync(PROMPT_PATH, "utf-8"); } catch {
    cachedPrompt = 'Extract structured rules as JSON. Return {"rules":[{ruleType,subject,payload,confidence,rationale}]}';
  }
  return cachedPrompt;
}

export function arabicCharRatio(text: string): number {
  if (!text || text.length === 0) return 0;
  const arabicCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabicCount / text.length;
}

export function pickModel(text: string): string {
  const ratio = arabicCharRatio(text);
  const arabicModel = process.env.LLM_MODEL_ARABIC ?? "falcon-h1-arabic:7b";
  const defaultModel = process.env.LLM_MODEL ?? "qwen3:30b-a3b";
  return ratio > 0.4 ? arabicModel : defaultModel;
}

export type RuleType = "fee_rate" | "required_doc" | "workflow_step" | "threshold" | "deadline" | "procedure_def";

export interface ExtractedRuleData {
  ruleType: RuleType;
  subject: string | null;
  payload: Record<string, unknown>;
  confidence: number;
  rationale: string;
  promptVersion: string;
}

export interface RuleExtractionResult {
  rules: ExtractedRuleData[];
  model: string;
  arabicRatio: number;
  chunkId?: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ExtractionMetric {
  docId: string;
  chunkCount: number;
  rulesExtracted: number;
  rulesAfterDedup: number;
  avgConfidence: number;
  durationMs: number;
  modelUsed: string;
  timedOutChunks: number;
  promptVersion: string;
}

export async function extractRules(chunkText: string, chunkId?: string): Promise<RuleExtractionResult> {
  const model = pickModel(chunkText);
  const ratio = arabicCharRatio(chunkText);
  const start = Date.now();
  const timeoutMs = getTimeoutMs();

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

  const llmPromise = (async () => {
    const openai = getClient();
    const res = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: getSystemPrompt() },
        { role: "user", content: chunkText },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.1,
    });
    return res.choices[0]?.message?.content ?? "{}";
  })();

  const content = await Promise.race([llmPromise, timeoutPromise]);
  const elapsed = Date.now() - start;

  if (content === null) {
    console.warn(`[local-llm] TIMEOUT after ${elapsed}ms for chunk ${chunkId ?? "?"} (model=${model})`);
    return { rules: [], model, arabicRatio: ratio, chunkId, durationMs: elapsed, timedOut: true };
  }

  let parsed: { rules?: ExtractedRuleData[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try { parsed = JSON.parse(cleaned); } catch {
      console.warn(`[local-llm] JSON parse failed for chunk ${chunkId ?? "?"}`);
      return { rules: [], model, arabicRatio: ratio, chunkId, durationMs: elapsed, timedOut: false };
    }
  }

  const rules = (parsed.rules ?? []).map((r: any) => ({ ...r, promptVersion: PROMPT_VERSION }));
  return { rules, model, arabicRatio: ratio, chunkId, durationMs: elapsed, timedOut: false };
}

export async function extractRulesBatch(
  chunks: { id: string; text: string }[],
): Promise<{ rules: (ExtractedRuleData & { sourceChunkId: string; sourceChunkIds: string[] })[]; metrics: ExtractionMetric; rawRuleCount: number }> {
  const allRules: (ExtractedRuleData & { sourceChunkId: string })[] = [];
  let lastModel = "";
  let timedOutCount = 0;
  let totalMs = 0;

  const queue = [...chunks];
  const active: Promise<void>[] = [];

  async function processChunk(chunk: { id: string; text: string }): Promise<void> {
    try {
      const result = await extractRules(chunk.text, chunk.id);
      lastModel = result.model;
      totalMs += result.durationMs;
      if (result.timedOut) timedOutCount++;
      for (const rule of result.rules) {
        allRules.push({ ...rule, sourceChunkId: chunk.id });
      }
      console.info(`[local-llm] chunk ${chunk.id}: ${result.rules.length} rules (${result.durationMs}ms, model=${result.model})`);
    } catch (err) {
      console.error(`[local-llm] extraction failed for chunk ${chunk.id}:`, err);
    }
  }

  while (queue.length > 0 || active.length > 0) {
    while (active.length < MAX_CONCURRENCY && queue.length > 0) {
      const chunk = queue.shift()!;
      const p = processChunk(chunk).then(() => { active.splice(active.indexOf(p), 1); });
      active.push(p);
    }
    if (active.length > 0) { await Promise.race(active); }
  }

  const rawRuleCount = allRules.length;

  // Dedupe by (ruleType, subject, payload) — keep highest confidence, merge sourceChunkIds
  const dedupedMap = new Map<string, ExtractedRuleData & { sourceChunkId: string; sourceChunkIds: string[] }>();
  for (const rule of allRules) {
    const key = `${rule.ruleType}|${rule.subject ?? "null"}|${JSON.stringify(rule.payload)}`;
    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, { ...rule, sourceChunkIds: [rule.sourceChunkId] });
    } else {
      existing.sourceChunkIds.push(rule.sourceChunkId);
      if (rule.confidence > existing.confidence) {
        existing.confidence = rule.confidence;
        existing.rationale = rule.rationale;
      }
    }
  }
  const dedupedRules = [...dedupedMap.values()];

  const confidences = dedupedRules.map((r) => r.confidence);
  const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  const metrics: ExtractionMetric = {
    docId: "",
    chunkCount: chunks.length,
    rulesExtracted: rawRuleCount,
    rulesAfterDedup: dedupedRules.length,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    durationMs: totalMs,
    modelUsed: lastModel,
    timedOutChunks: timedOutCount,
    promptVersion: PROMPT_VERSION,
  };

  return { rules: dedupedRules, metrics, rawRuleCount };
}

export async function isLlmAvailable(): Promise<boolean> {
  try {
    const openai = getClient();
    const model = process.env.LLM_MODEL ?? "qwen3:30b-a3b";
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const llmPromise = openai.chat.completions.create({
      model, messages: [{ role: "user", content: "ping" }], max_tokens: 1,
    });
    const result = await Promise.race([llmPromise, timeoutPromise]);
    return result !== null;
  } catch { return false; }
}

export { PROMPT_VERSION };

export function __resetForTests(): void {
  client = null;
  cachedPrompt = null;
}

export function __setTimeoutForTests(ms: number | null): void {
  _timeoutOverride = ms;
}
