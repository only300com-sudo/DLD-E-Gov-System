// src/lib/idp/audit.ts
// IDP Foundation — Audit helpers. Reuses the existing hash-chain audit log.
// Never writes raw document text — only hashes, IDs, and metadata.

import { logAudit } from "@/lib/audit";

export type IdpAuditAction =
  | 'IDP_PREPROCESSED'
  | 'IDP_PREPROCESS_FAILED'
  | 'IDP_EXTRACTED'
  | 'IDP_FIELD_FLAGGED'
  | 'IDP_CONSISTENCY_CHECKED'
  | 'IDP_FLAG_RESOLVED';

export async function logIdpAudit(
  action: IdpAuditAction,
  details: Record<string, unknown>,
): Promise<void> {
  await logAudit({
    action: 'IDP_ACTION',
    entity: 'idp',
    entityId: (details.jobId ?? details.extractionId ?? details.caseId ?? 'idp') as string,
    details: JSON.stringify({ idpAction: action, ...details }),
  });
}
