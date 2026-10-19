// src/lib/ai/cross-reference/engine.ts
// Part 12C — Cross-reference engine.
// Compares extracted rules against live FeeCatalog / ProcedureCatalog / WorkflowTransition.
// Creates Advisory rows for mismatches with citation + confidence + severity.

import { db } from "@/lib/db";

export type AdvisoryType = "fee_change" | "doc_change" | "workflow_change" | "procedure_gap" | "procedure_deprecation" | "threshold_change";
export type Severity = "info" | "warning" | "critical";

export interface AdvisoryDraft {
  title: string;
  advisoryType: AdvisoryType;
  severity: Severity;
  currentState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  rationale: string;
  sourceRuleIds: string[];
  sourceCitations: { docId: string; docTitle: string; page: number | null; snippet: string }[];
  confidence: number;
}

/**
 * Analyze all ExtractedRules for a document against the live system state.
 * Returns AdvisoryDrafts — caller persists them to the Advisory table.
 */
export async function analyzeDocumentRules(docId: string): Promise<AdvisoryDraft[]> {
  const rules = await db.extractedRule.findMany({
    where: { docId },
    include: {
      doc: { select: { id: true, title: true, supersededAt: true, supersededBy: true } },
    },
  });

  if (rules.length === 0) {
    console.info(`[cross-ref] No rules to analyze for doc ${docId}`);
    return [];
  }

  const advisories: AdvisoryDraft[] = [];
  const isSuperseded = !!rules[0]?.doc?.supersededAt;

  for (const rule of rules) {
    try {
      // Build citation from source chunks
      const citations = await buildCitations(rule);

      // Route by rule type
      switch (rule.ruleType) {
        case "fee_rate":
          advisories.push(...await analyzeFeeRule(rule, citations, isSuperseded));
          break;
        case "required_doc":
          advisories.push(...await analyzeDocRule(rule, citations, isSuperseded));
          break;
        case "threshold":
          advisories.push(...await analyzeThresholdRule(rule, citations, isSuperseded));
          break;
        case "procedure_def":
          advisories.push(...await analyzeProcedureDefRule(rule, citations, isSuperseded));
          break;
        // workflow_step + deadline: deferred to later iteration
      }
    } catch (err) {
      console.error(`[cross-ref] rule ${rule.id} analysis failed:`, err);
    }
  }

  console.info(`[cross-ref] doc ${docId}: ${rules.length} rules → ${advisories.length} advisories`);
  return advisories;
}

async function buildCitations(rule: any): Promise<AdvisoryDraft["sourceCitations"]> {
  const chunkIds = JSON.parse(rule.sourceChunkIds || "[]") as string[];
  const chunks = await db.docChunk.findMany({
    where: { id: { in: chunkIds } },
    select: { text: true, pageNumber: true, docId: true, doc: { select: { title: true } } },
    take: 3, // cite up to 3 chunks for provenance
  });

  return chunks.map(c => ({
    docId: c.docId,
    docTitle: c.doc?.title ?? "Unknown",
    page: c.pageNumber,
    snippet: c.text.substring(0, 200),
  }));
}

// ── Fee rule analysis ──────────────────────────────────────────────────────
async function analyzeFeeRule(rule: any, citations: AdvisoryDraft["sourceCitations"], isSuperseded: boolean): Promise<AdvisoryDraft[]> {
  const payload = JSON.parse(rule.payload || "{}");
  const subject = rule.subjectCode;

  if (!subject) return []; // can't match without a fee code

  // Find the live fee in FeeCatalog
  const liveFee = await db.feeCatalog.findFirst({
    where: { code: subject, isActive: true },
  });

  if (!liveFee) {
    // Fee code not in catalog → potential new fee or gap
    return [{
      title: `New fee code '${subject}' found in regulation — not in catalog`,
      advisoryType: "fee_change" as AdvisoryType,
      severity: "warning" as Severity,
      currentState: { exists: false },
      proposedState: { code: subject, ...payload },
      rationale: `The regulation references fee code '${subject}' which does not exist in the FeeCatalog. This may be a new fee or a renamed code.`,
      sourceRuleIds: [rule.id],
      sourceCitations: citations,
      confidence: rule.confidence * 0.8, // slightly lower confidence for gap detection
    }];
  }

  // Compare rates
  const advisories: AdvisoryDraft[] = [];
  if (payload.percentage != null && liveFee.percentageRate != null) {
    const policyRate = payload.percentage;
    const liveRate = liveFee.percentageRate;
    if (Math.abs(policyRate - liveRate) > 0.001) {
      const severity = Math.abs(policyRate - liveRate) > 0.01 ? "critical" : "warning";
      advisories.push({
        title: `Fee rate mismatch: ${subject} — policy says ${(policyRate * 100).toFixed(3)}%, catalog has ${(liveRate * 100).toFixed(3)}%`,
        advisoryType: "fee_change" as AdvisoryType,
        severity: severity as Severity,
        currentState: { code: subject, percentageRate: liveRate },
        proposedState: { code: subject, percentageRate: policyRate },
        rationale: `The regulation specifies a ${(policyRate * 100).toFixed(3)}% rate for ${subject}, but the FeeCatalog currently has ${(liveRate * 100).toFixed(3)}%.${isSuperseded ? " NOTE: This regulation has been superseded — the change may already be reflected in a newer law." : ""}`,
        sourceRuleIds: [rule.id],
        sourceCitations: citations,
        confidence: rule.confidence,
      });
    }
  }

  // Compare fixed amounts
  if (payload.fixedAmount != null && liveFee.fixedAmount != null) {
    const policyAmount = payload.fixedAmount * 100; // AED → fils
    const liveAmount = liveFee.fixedAmount;
    if (policyAmount !== liveAmount) {
      advisories.push({
        title: `Fee amount mismatch: ${subject} — policy says ${payload.fixedAmount} AED, catalog has ${(liveAmount / 100).toFixed(0)} AED`,
        advisoryType: "fee_change" as AdvisoryType,
        severity: "critical" as Severity,
        currentState: { code: subject, fixedAmount: liveAmount },
        proposedState: { code: subject, fixedAmount: policyAmount },
        rationale: `The regulation specifies AED ${payload.fixedAmount} for ${subject}, but the FeeCatalog currently has AED ${(liveAmount / 100).toFixed(0)}.`,
        sourceRuleIds: [rule.id],
        sourceCitations: citations,
        confidence: rule.confidence,
      });
    }
  }

  // Compare minimum floor
  if (payload.minFloor != null && liveFee.percentageFloor != null) {
    const policyFloor = payload.minFloor * 100;
    const liveFloor = liveFee.percentageFloor;
    if (policyFloor !== liveFloor) {
      advisories.push({
        title: `Fee floor mismatch: ${subject} — policy says min ${payload.minFloor} AED, catalog has min ${(liveFloor / 100).toFixed(0)} AED`,
        advisoryType: "fee_change" as AdvisoryType,
        severity: "warning" as Severity,
        currentState: { code: subject, percentageFloor: liveFloor },
        proposedState: { code: subject, percentageFloor: policyFloor },
        rationale: `The regulation sets a minimum of AED ${payload.minFloor} for ${subject}, but the FeeCatalog has AED ${(liveFloor / 100).toFixed(0)}.`,
        sourceRuleIds: [rule.id],
        sourceCitations: citations,
        confidence: rule.confidence,
      });
    }
  }

  return advisories;
}

// ── Required document rule analysis ────────────────────────────────────────
async function analyzeDocRule(rule: any, citations: AdvisoryDraft["sourceCitations"], isSuperseded: boolean): Promise<AdvisoryDraft[]> {
  const payload = JSON.parse(rule.payload || "{}");
  const procCode = payload.procedureCode;
  const docName = payload.docName_en;

  if (!procCode || !docName) return [];

  // Check if the procedure exists
  const proc = await db.procedureCatalog.findUnique({ where: { id: procCode } });
  if (!proc) return []; // procedure doesn't exist — can't check docs

  // Check if the doc is already in the procedure's requiredDocs
  const requiredDocs = JSON.parse(proc.requiredDocs || "[]") as string[];
  const docExists = requiredDocs.some(d => d.toLowerCase().includes(docName.toLowerCase()));

  if (!docExists) {
    return [{
      title: `New required document: '${docName}' for ${procCode}`,
      advisoryType: "doc_change" as AdvisoryType,
      severity: "warning" as Severity,
      currentState: { procedureCode: procCode, requiredDocs },
      proposedState: { procedureCode: procCode, newDoc: docName, docNameAr: payload.docName_ar },
      rationale: `The regulation requires '${docName}' for ${procCode}, but it's not in the procedure's requiredDocs list.${isSuperseded ? " NOTE: This regulation has been superseded." : ""}`,
      sourceRuleIds: [rule.id],
      sourceCitations: citations,
      confidence: rule.confidence * 0.9,
    }];
  }

  return [];
}

// ── Threshold rule analysis ────────────────────────────────────────────────
async function analyzeThresholdRule(rule: any, citations: AdvisoryDraft["sourceCitations"], isSuperseded: boolean): Promise<AdvisoryDraft[]> {
  const payload = JSON.parse(rule.payload || "{}");
  const subject = rule.subjectCode;

  if (!subject) return [];

  // Try to find a fee with a tier threshold matching the subject
  const liveFee = await db.feeCatalog.findFirst({
    where: { code: subject, isActive: true },
  });

  if (!liveFee || liveFee.feeType !== "tiered") return [];

  const policyThreshold = payload.bracketAbove ? payload.bracketAbove * 100 : null; // AED → fils
  const liveThreshold = liveFee.tierThreshold;

  if (policyThreshold != null && liveThreshold != null && policyThreshold !== liveThreshold) {
    return [{
      title: `Threshold mismatch: ${subject} — policy says bracket at ${payload.bracketAbove} AED, catalog has ${(liveThreshold / 100).toFixed(0)} AED`,
      advisoryType: "threshold_change" as AdvisoryType,
      severity: "critical" as Severity,
      currentState: { code: subject, tierThreshold: liveThreshold },
      proposedState: { code: subject, tierThreshold: policyThreshold },
      rationale: `The regulation sets the tier threshold at AED ${payload.bracketAbove} for ${subject}, but the FeeCatalog has AED ${(liveThreshold / 100).toFixed(0)}.${isSuperseded ? " NOTE: This regulation has been superseded." : ""}`,
      sourceRuleIds: [rule.id],
      sourceCitations: citations,
      confidence: rule.confidence,
    }];
  }

  return [];
}

// ── Procedure definition rule analysis ─────────────────────────────────────
async function analyzeProcedureDefRule(rule: any, citations: AdvisoryDraft["sourceCitations"], isSuperseded: boolean): Promise<AdvisoryDraft[]> {
  const payload = JSON.parse(rule.payload || "{}");
  const code = payload.code;

  if (!code) return [];

  // Check if the procedure exists in the catalog
  const proc = await db.procedureCatalog.findUnique({ where: { id: code } });

  if (!proc) {
    return [{
      title: `New procedure in regulation not in catalog: ${code}`,
      advisoryType: "procedure_gap" as AdvisoryType,
      severity: "info" as Severity,
      currentState: { exists: false },
      proposedState: { code, nameEn: payload.name_en, nameAr: payload.name_ar, category: payload.category },
      rationale: `The regulation defines a procedure '${code}' (${payload.name_en}) that does not exist in the ProcedureCatalog. This may be a new procedure type.`,
      sourceRuleIds: [rule.id],
      sourceCitations: citations,
      confidence: rule.confidence * 0.7,
    }];
  }

  return [];
}
