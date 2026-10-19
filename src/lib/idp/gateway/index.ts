// src/lib/idp/gateway/index.ts
// IDP Foundation — preprocessFile() public entry point.
//
// Rules:
//   1. Compute SHA-256 of the input file.
//   2. Look up job by input hash. If DONE, return cached result (idempotent).
//   3. Route by detectFileKind():
//      - image/* → sharp-preprocess (STUB)
//      - office → libreoffice (STUB)
//      - pdf_text → check hasTextLayer(); if true → passthrough; if false → pdf_image → ghostscript (STUB)
//      - unknown → return error
//   4. If a tool is unavailable, mark job TOOL_MISSING and return
//      { status: 'TOOL_MISSING', error: '<tool> not installed' }.
//      Do NOT throw — the caller decides.
//   5. On success, write IdpPreprocessJob DONE + audit IDP_PREPROCESSED.
//   6. On failure, write IdpPreprocessJob FAILED + audit IDP_PREPROCESS_FAILED.
//   7. Never re-process the same input hash twice.

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { PreprocessResult } from "../types";
import { detectFileKind } from "./router";
import { hasTextLayer, getPdfPageCount } from "./tools/pdfjs-inspect";
import { findJobByInputHash, createJob, completeJob, failJob, markToolMissing } from "./job-store";
import { logIdpAudit } from "../audit";
import { IDP_CONFIG } from "../config";

export async function preprocessFile(
  inputPath: string,
  inputMime: string,
): Promise<PreprocessResult> {
  const start = Date.now();

  // Step 1: Compute SHA-256 of the input file
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(inputPath);
  } catch (e: any) {
    // File doesn't exist — create a FAILED job + audit
    const inputHash = "missing";
    const job = await createJob({ inputHash, inputMime, toolChain: "unknown" });
    const errorMsg = `File not found: ${inputPath}`;
    await failJob(job.id, errorMsg, 0);
    await logIdpAudit("IDP_PREPROCESS_FAILED", { jobId: job.id, inputHash, error: errorMsg });
    return { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain: "unknown", status: "FAILED" as const, latencyMs: 0, error: errorMsg };
  }
  const inputHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  // Step 2: Idempotency check — look up existing job
  const existing = await findJobByInputHash(inputHash);
  if (existing && existing.status === "DONE") {
    return {
      jobId: existing.id,
      inputHash,
      outputPath: existing.outputPath,
      outputHash: existing.outputHash,
      toolChain: existing.toolChain,
      status: "DONE",
      latencyMs: 0,
    };
  }
  // If a previous job FAILED or TOOL_MISSING, we'll create a new one to retry

  // Step 3: Route by file kind
  const kind = detectFileKind(inputPath, inputMime);

  let toolChain: string;
  let result: PreprocessResult;

  switch (kind) {
    case "image": {
      toolChain = "sharp";
      const job = await createJob({ inputHash, inputMime, toolChain });
      try {
        const { preprocessImage } = await import("./tools/sharp-preprocess");
        const toolResult = await preprocessImage(inputPath, inputPath);
        if (toolResult.status === "TOOL_MISSING") {
          await markToolMissing(job.id, "sharp", Date.now() - start);
          result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: toolResult.error };
          return result;
        }
        throw new Error("not implemented — Prompt 2");
      } catch (e: any) {
        if (e.message?.includes("not implemented")) {
          await markToolMissing(job.id, "sharp", Date.now() - start);
          result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: "sharp not installed" };
          return result;
        }
        await failJob(job.id, e.message, Date.now() - start);
        await logIdpAudit("IDP_PREPROCESS_FAILED", { jobId: job.id, inputHash, error: e.message });
        result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "FAILED", latencyMs: Date.now() - start, error: e.message };
        return result;
      }
    }

    case "office": {
      toolChain = "libreoffice";
      const job = await createJob({ inputHash, inputMime, toolChain });
      try {
        const { convertOffice } = await import("./tools/libreoffice");
        const toolResult = await convertOffice(inputPath, inputPath);
        if (toolResult.status === "TOOL_MISSING") {
          await markToolMissing(job.id, "libreoffice", Date.now() - start);
          result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: toolResult.error };
          return result;
        }
        throw new Error("not implemented — Prompt 2");
      } catch (e: any) {
        if (e.message?.includes("not implemented")) {
          await markToolMissing(job.id, "libreoffice", Date.now() - start);
          result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: "libreoffice not installed" };
          return result;
        }
        await failJob(job.id, e.message, Date.now() - start);
        await logIdpAudit("IDP_PREPROCESS_FAILED", { jobId: job.id, inputHash, error: e.message });
        result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "FAILED", latencyMs: Date.now() - start, error: e.message };
        return result;
      }
    }

    case "pdf_text": {
      // Check if the PDF actually has a text layer
      const hasText = await hasTextLayer(inputPath);
      const pageCount = await getPdfPageCount(inputPath);

      if (hasText) {
        // Digital PDF with text — passthrough (no preprocessing needed)
        toolChain = "passthrough";
        const job = await createJob({ inputHash, inputMime, toolChain });
        const outputHash = inputHash; // same file, same hash
        const latencyMs = Date.now() - start;
        await completeJob(job.id, { outputPath: inputPath, outputHash, latencyMs, hasTextLayer: true, pageCount });
        await logIdpAudit("IDP_PREPROCESSED", { jobId: job.id, inputHash, toolChain, hasTextLayer: true, pageCount, latencyMs });
        result = { jobId: job.id, inputHash, outputPath: inputPath, outputHash, toolChain, status: "DONE", latencyMs, hasTextLayer: true, pageCount };
        return result;
      } else {
        // Image-only PDF (scanned) — needs ghostscript rasterization
        toolChain = "ghostscript";
        const job = await createJob({ inputHash, inputMime, toolChain });
        try {
          const { rasterizePdf } = await import("./tools/ghostscript");
          const toolResult = await rasterizePdf(inputPath, path.dirname(inputPath));
          if (toolResult.status === "TOOL_MISSING") {
            await markToolMissing(job.id, "ghostscript", Date.now() - start);
            result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: toolResult.error };
            return result;
          }
          throw new Error("not implemented — Prompt 2");
        } catch (e: any) {
          if (e.message?.includes("not implemented")) {
            await markToolMissing(job.id, "ghostscript", Date.now() - start);
            result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "TOOL_MISSING", latencyMs: Date.now() - start, error: "ghostscript not installed" };
            return result;
          }
          await failJob(job.id, e.message, Date.now() - start);
          await logIdpAudit("IDP_PREPROCESS_FAILED", { jobId: job.id, inputHash, error: e.message });
          result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "FAILED", latencyMs: Date.now() - start, error: e.message };
          return result;
        }
      }
    }

    case "unknown":
    default: {
      toolChain = "unknown";
      const job = await createJob({ inputHash, inputMime, toolChain });
      const errorMsg = `Unknown file kind for: ${inputPath} (${inputMime})`;
      await failJob(job.id, errorMsg, Date.now() - start);
      await logIdpAudit("IDP_PREPROCESS_FAILED", { jobId: job.id, inputHash, error: errorMsg });
      result = { jobId: job.id, inputHash, outputPath: null, outputHash: null, toolChain, status: "FAILED", latencyMs: Date.now() - start, error: errorMsg };
      return result;
    }
  }
}
