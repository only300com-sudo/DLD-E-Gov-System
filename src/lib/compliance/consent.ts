// lib/compliance/consent.ts
// Phase 7b.2 — Consent capture + withdrawal helpers.
// Audits CONSENT_CAPTURED + CONSENT_WITHDRAWN.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export interface ConsentInput {
  clientId: string;
  privacyPolicyVersion?: string;
  consentPrivacyPolicy?: boolean;
  consentMarketing?: boolean;
  consentCommunications?: boolean;
  capturedBy?: string;
  capturedByName?: string;
  notes?: string;
}

export async function captureConsent(input: ConsentInput) {
  const now = new Date();
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new Error("Client not found");

  // Persist the consent snapshot to ConsentRecord (history)
  const record = await db.consentRecord.create({
    data: {
      clientId: input.clientId,
      privacyPolicyVersion: input.privacyPolicyVersion ?? null,
      consentPrivacyPolicyAt: input.consentPrivacyPolicy ? now : null,
      consentMarketingAt: input.consentMarketing ? now : null,
      consentCommunicationsAt: input.consentCommunications ? now : null,
      capturedBy: input.capturedBy ?? null,
      notes: input.notes ?? null,
    },
  });

  // Update denormalized fields on Client for fast lookup
  await db.client.update({
    where: { id: input.clientId },
    data: {
      dataConsent: input.consentPrivacyPolicy ?? false,
      commConsent: input.consentCommunications ?? false,
      consentPrivacyPolicyAt: input.consentPrivacyPolicy ? now : null,
      consentPrivacyPolicyVersion: input.privacyPolicyVersion ?? null,
      consentMarketingAt: input.consentMarketing ? now : null,
      consentCommunicationsAt: input.consentCommunications ? now : null,
      consentWithdrawnAt: null, // clear any prior withdrawal
    },
  });

  await logAudit({
    userId: input.capturedBy ?? undefined,
    action: "CONSENT_CAPTURED",
    entity: "Client",
    entityId: input.clientId,
    details: `${input.capturedByName ?? "System"} captured consent for client ${client.internalId}. PrivacyPolicy=${input.consentPrivacyPolicy ?? false}, Marketing=${input.consentMarketing ?? false}, Communications=${input.consentCommunications ?? false}. Policy version: ${input.privacyPolicyVersion ?? "n/a"}`,
  });

  return record;
}

export async function withdrawConsent(clientId: string, withdrawnBy: string, withdrawnByName: string, reason?: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const now = new Date();

  // Persist a withdrawal record (history)
  await db.consentRecord.create({
    data: {
      clientId,
      privacyPolicyVersion: client.consentPrivacyPolicyVersion,
      consentPrivacyPolicyAt: null,
      consentMarketingAt: null,
      consentCommunicationsAt: null,
      consentWithdrawnAt: now,
      capturedBy: withdrawnBy,
      notes: `Withdrawal: ${reason ?? "no reason given"}`,
    },
  });

  // Update Client — set all consents to false + record withdrawal timestamp
  await db.client.update({
    where: { id: clientId },
    data: {
      dataConsent: false,
      commConsent: false,
      consentMarketingAt: null,
      consentCommunicationsAt: null,
      consentPrivacyPolicyAt: null,
      consentWithdrawnAt: now,
    },
  });

  await logAudit({
    userId: withdrawnBy ?? undefined,
    action: "CONSENT_WITHDRAWN",
    entity: "Client",
    entityId: clientId,
    details: `${withdrawnByName} withdrew consent for client ${client.internalId}. Reason: ${reason ?? "n/a"}`,
  });

  return { ok: true };
}
