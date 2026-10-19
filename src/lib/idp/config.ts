// src/lib/idp/config.ts
// IDP Foundation — Configuration constants. All env-overridable where noted.

export const IDP_CONFIG = {
  confidence: {
    autoAccept: 0.95,        // IDP_CONFIDENCE_AUTO_ACCEPT
    warn: 0.85,              // IDP_CONFIDENCE_WARN
    lowConfidence: 0.70,     // IDP_CONFIDENCE_LOW
  },
  docTypeOverrides: {
    emirates_id: { autoAccept: 0.97, lowConfidence: 0.90 },
    passport:    { autoAccept: 0.97, lowConfidence: 0.90 },
    receipt:     { autoAccept: 0.92, lowConfidence: 0.75 },
  } as Record<string, { autoAccept: number; lowConfidence: number }>,
  tools: {
    libreofficePath: process.env.LIBREOFFICE_PATH ?? 'soffice',
    ghostscriptPath: process.env.GHOSTSCRIPT_PATH ?? 'gs',
    tesseractLangs:  process.env.TESSERACT_LANGS ?? 'ara+eng',
  },
  storage: {
    workDir: process.env.IDP_WORK_DIR ?? './data/idp-work',
  },
  limits: {
    maxPagesPerDoc: 100,
    maxFileSizeBytes: 50 * 1024 * 1024,
  },
} as const;
