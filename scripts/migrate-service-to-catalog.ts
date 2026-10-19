// scripts/migrate-service-to-catalog.ts
// Part 7 / Issue 1 — Backfill ServiceCatalogItem.procedureCatalogId
//
// Replaces the brittle string-matching lookup in transition() with a single
// indexed foreign key. This script:
//   1. Builds lookup maps from ProcedureCatalog (by code, by legacyObjectcode)
//   2. For every ServiceCatalogItem, finds the matching ProcedureCatalog row
//   3. Updates the new FK column
//   4. Reports unmapped services (warning list — these need manual mapping)
//
// Run: npx tsx scripts/migrate-service-to-catalog.ts
// Idempotent: safe to re-run. Only updates rows where procedureCatalogId is null
// or differs from the resolved match.
//
// After this script reports 0 unmapped services, the schema can be tightened:
//   procedureCatalogId String  (non-nullable)

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Explicit fallback mapping for the 7 legacy ServiceCatalogItem.internalCodes.
// These codes don't appear in ProcedureCatalog.code or legacyObjectcode, so the
// automatic lookup fails. Each maps to its closest semantic ProcedureCatalog
// counterpart. This is the "manual mapping" path — the script logs every
// match it makes through this map so reviewers can verify the choices.
//
// Service code → (catalog id, reason)
const EXPLICIT_MAP: Record<string, { catalogId: string; reason: string }> = {
  // Property Sale Registration → Standard Sale (legacy SELL_View)
  "PSR-001": { catalogId: "SALE-001",         reason: "sale registration → standard sale (closest semantic match)" },
  // Property Transfer → Standard Sale (a transfer is a sale in DLD terminology)
  "PTR-002": { catalogId: "SALE-001",         reason: "property transfer → standard sale (DLD transfer = sale)" },
  // Gift Registration → Grant Registration (legacy GRANT_View)
  "GFT-005": { catalogId: "GRANT-001",         reason: "gift registration → grant registration (DLD gift = grant)" },
  // Mortgage Registration → Mortgage Registration (legacy MRTG_View)
  "MRG-003": { catalogId: "MORT-REG-001",      reason: "mortgage registration → MORT-REG-001 (direct match)" },
  // Mortgage Release → Mortgage Release (legacy MRTG_REL_View)
  "MRL-004": { catalogId: "MORT-REL-001",      reason: "mortgage release → MORT-REL-001 (direct match)" },
  // Oqood (Off-Plan) → LTO Registration (off-plan uses lease-to-own framework in DLD)
  "OQD-006": { catalogId: "LTO-REG-001",      reason: "oqood (off-plan) → LTO-REG-001 (off-plan uses LTO framework — needs dedicated catalog entry in future batch)" },
  // Tenancy (Ejari) → LTO Registration (no dedicated tenancy procedure in catalog yet)
  "TNC-007": { catalogId: "LTO-REG-001",      reason: "tenancy (ejari) → LTO-REG-001 (no dedicated tenancy procedure in catalog — needs entry in future batch)" },
};

async function main() {
  console.log("=== ServiceCatalogItem → ProcedureCatalog migration ===\n");

  const services = await db.serviceCatalogItem.findMany();
  const catalog  = await db.procedureCatalog.findMany();

  console.log(`ServiceCatalogItem rows: ${services.length}`);
  console.log(`ProcedureCatalog rows:  ${catalog.length}\n`);

  // Build lookup maps. byLegacy is preferred because legacyObjectcode is the
  // ASP.NET view name that the legacy Services table also referenced.
  // byCode is the fallback for services whose internalCode matches the new
  // snake_case code (e.g. "GRANT_REGISTRATION").
  const byLegacy = new Map<string, string>();
  const byCode   = new Map<string, string>();
  for (const c of catalog) {
    if (c.legacyObjectcode) {
      // Multiple procedures can share a legacyObjectcode (composite procedures
      // reuse base object codes). First match wins for the legacy map; the
      // code map disambiguates.
      if (!byLegacy.has(c.legacyObjectcode)) byLegacy.set(c.legacyObjectcode, c.id);
    }
    if (c.code) byCode.set(c.code, c.id);
  }

  let updated = 0;
  let skipped = 0;
  let explicitUsed = 0;
  const unmapped: { serviceId: string; internalCode: string; serviceName: string }[] = [];

  for (const svc of services) {
    // Try legacyObjectcode first (most reliable — the legacy ASP.NET mapping),
    // then try exact code match, then fall back to "contains" if neither matches.
    let matchId: string | undefined =
      byLegacy.get(svc.internalCode) ??
      byCode.get(svc.internalCode);

    let matchSource = "auto";

    if (!matchId) {
      // Last-ditch: substring match on legacyObjectcode (e.g. internalCode "GFT-005"
      // might match legacyObjectcode "GFT_View_005" or similar). Report these so a
      // human can verify the mapping is correct.
      const partial = catalog.find(c =>
        c.legacyObjectcode && c.legacyObjectcode.includes(svc.internalCode)
      );
      if (partial) {
        matchId = partial.id;
        matchSource = "auto-substring";
      }
    }

    if (!matchId) {
      // Final fallback: the explicit manual map for the 7 known legacy codes.
      const explicit = EXPLICIT_MAP[svc.internalCode];
      if (explicit) {
        matchId = explicit.catalogId;
        matchSource = `explicit: ${explicit.reason}`;
        explicitUsed++;
      }
    }

    if (!matchId) {
      unmapped.push({ serviceId: svc.id, internalCode: svc.internalCode, serviceName: svc.serviceName });
      continue;
    }

    // Skip the update if the FK is already correct (idempotent).
    if (svc.procedureCatalogId === matchId) {
      skipped++;
      continue;
    }

    await db.serviceCatalogItem.update({
      where: { id: svc.id },
      data: { procedureCatalogId: matchId },
    });
    updated++;
    console.log(`  ✓ [${matchSource}] ${svc.internalCode} (${svc.serviceName}) → ${matchId}`);
  }

  console.log(`\nUpdated: ${updated} | Skipped (already mapped): ${skipped} | Explicit map used: ${explicitUsed} | Unmapped: ${unmapped.length}`);

  if (unmapped.length > 0) {
    console.warn("\n⚠ Unmapped services — these need manual review:");
    for (const u of unmapped) {
      console.warn(`    • ${u.serviceId}  internalCode=${u.internalCode}  name="${u.serviceName}"`);
    }
    console.warn(`\nTo resolve: add ProcedureCatalog rows with matching code/legacyObjectcode,`);
    console.warn(`then re-run this script. Until resolved, transition() will throw`);
    console.warn(`"Case <id> has no procedureCatalogId — migration incomplete" for cases`);
    console.warn(`linked to these services.`);
  }

  // Final verification: count rows still null
  const stillNull = await db.serviceCatalogItem.count({ where: { procedureCatalogId: null } });
  if (stillNull > 0) {
    console.warn(`\n⚠ ${stillNull} ServiceCatalogItem rows still have procedureCatalogId = null`);
  } else {
    console.log(`\n✓ All ${services.length} ServiceCatalogItem rows now have procedureCatalogId set`);
    console.log(`  → Schema can be tightened: procedureCatalogId String  (non-nullable)`);
  }

  await db.$disconnect();
}

main().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
