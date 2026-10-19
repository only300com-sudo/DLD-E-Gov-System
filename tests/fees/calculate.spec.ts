// tests/fees/calculate.spec.ts
// Part 9.5 Step 7 — Fee calculation tests. Verifies the actual DLD fee rates
// from the FeeCatalog match the expected schedule.
//
// Ported from the hand-off's vitest spec to the existing custom runner
// pattern (no vitest dependency).
//
// Key rate verification:
//   - Sale: 4%
//   - Gift: 0.125% with floor AED 2,000
//   - Mortgage: 0.25% (NOT 0.4% — the old template had the wrong rate)
//   - LTO: compound — 4% sale + 0.25% rental
//   - Usufruct: 2% of RENTAL value (not property value)
//   - Trustee fees: tiered (2k below threshold, 4k above)
//   - Mutual exclusion: only one map fee survives
//   - dropWhen: REGISTRAR_RELEASE_FEE skipped if newMortgageSameDay
//   - perProperty: portfolio title deeds multiply by propertyCount
//
// Run: npx tsx tests/fees/calculate.spec.ts

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  const { calculateFees } = await import("../../src/lib/fees/calculate");

  console.log("=== Fee calculation — DLD rate verification ===\n");

  // ── Test 1: Sale — AED 1,000,000 → 4% DLD + tiered trustee + fixed fees ──
  console.log("Test 1: Sale — AED 1,000,000 → 4% DLD (40,000) + trustee (4,000) + map (250)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "SALE-001",
      saleValue: 100_000_000,  // AED 1,000,000 in fils
      propertyIsInDubaiMunicipality: true,
    });
    const dld = fees.find(f => f.code === "DLD_REGISTRATION_SALE");
    assert("DLD_REGISTRATION_SALE base = 40,000", dld?.baseAmount === 40_000, `got ${dld?.baseAmount}`);
    const trustee = fees.find(f => f.code === "TRUSTEE_FEE_SALE");
    assert("TRUSTEE_FEE_SALE base = 4,000 (tier above)", trustee?.baseAmount === 4_000, `got ${trustee?.baseAmount}`);
    assert("TRUSTEE_FEE_SALE VAT = 200", trustee?.vatAmount === 200, `got ${trustee?.vatAmount}`);
    const map = fees.find(f => f.code === "DUBAI_MUNI_MAP");
    assert("DUBAI_MUNI_MAP base = 250", map?.baseAmount === 250, `got ${map?.baseAmount}`);
  }

  // ── Test 2: Gift — AED 1,000,000 → floor 2,000 applies (0.125% = 1,250 < 2,000) ──
  console.log("\nTest 2: Gift — AED 1,000,000 → floor 2,000 applies (0.125% = 1,250 < 2,000)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "GRANT-001",
      propertyValue: 100_000_000,  // AED 1,000,000 in fils
      propertyIsInDubaiMunicipality: true,
    });
    const gift = fees.find(f => f.code === "DLD_REGISTRATION_GIFT");
    assert("DLD_REGISTRATION_GIFT base = 2,000 (floor applies)", gift?.baseAmount === 2_000, `got ${gift?.baseAmount}`);
  }

  // ── Test 3: Gift — AED 10,000,000 → 0.125% = 12,500 (above floor) ──
  console.log("\nTest 3: Gift — AED 10,000,000 → 0.125% = 12,500 (above floor)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "GRANT-001",
      propertyValue: 1_000_000_000,  // AED 10,000,000 in fils
      propertyIsInDubaiMunicipality: true,
    });
    const gift = fees.find(f => f.code === "DLD_REGISTRATION_GIFT");
    assert("DLD_REGISTRATION_GIFT base = 12,500 (above floor)", gift?.baseAmount === 12_500, `got ${gift?.baseAmount}`);
  }

  // ── Test 4: Mortgage — AED 1,000,000 → 0.25% = 2,500 (NOT 0.4%!) ──
  console.log("\nTest 4: Mortgage — AED 1,000,000 → 0.25% = 2,500 (NOT 0.4% which would be 4,000)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "MORT-REG-001",
      mortgageAmount: 100_000_000,  // AED 1,000,000 in fils
      propertyIsInDubaiMunicipality: true,
    });
    const mort = fees.find(f => f.code === "DLD_REGISTRATION_MORTGAGE");
    assert("DLD_REGISTRATION_MORTGAGE base = 2,500 (0.25%)", mort?.baseAmount === 2_500, `got ${mort?.baseAmount}`);
    // Explicitly NOT 4,000 (which would be the 0.4% rate from the old template)
    assert("DLD_REGISTRATION_MORTGAGE base NOT 4,000 (the wrong 0.4% rate)", mort?.baseAmount !== 4_000, `got ${mort?.baseAmount}`);
  }

  // ── Test 5: Mortgage Release — full structure AED 1,570 + VAT ──
  console.log("\nTest 5: Mortgage Release — DLD 1,000 + trustee 300 + VAT 15 + title 250 + fees");
  {
    const fees = await calculateFees({
      procedureCatalogId: "MORT-REL-001",
      propertyIsInDubaiMunicipality: true,
    });
    assert("DLD_RELEASE_MORTGAGE base = 1,000", fees.find(f => f.code === "DLD_RELEASE_MORTGAGE")?.baseAmount === 1_000, `got ${fees.find(f => f.code === "DLD_RELEASE_MORTGAGE")?.baseAmount}`);
    const trustee = fees.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_RELEASE");
    assert("TRUSTEE_FEE_MORTGAGE_RELEASE base = 300", trustee?.baseAmount === 300, `got ${trustee?.baseAmount}`);
    assert("TRUSTEE_FEE_MORTGAGE_RELEASE VAT = 15", trustee?.vatAmount === 15, `got ${trustee?.vatAmount}`);
    assert("TITLE_DEED_CERT base = 250", fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount === 250, `got ${fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount}`);
    assert("KNOWLEDGE_FEE base = 10", fees.find(f => f.code === "KNOWLEDGE_FEE")?.baseAmount === 10, `got ${fees.find(f => f.code === "KNOWLEDGE_FEE")?.baseAmount}`);
    assert("INNOVATION_FEE base = 10", fees.find(f => f.code === "INNOVATION_FEE")?.baseAmount === 10, `got ${fees.find(f => f.code === "INNOVATION_FEE")?.baseAmount}`);
  }

  // ── Test 6: dropWhen — REGISTRAR_RELEASE_FEE waived when newMortgageSameDay ──
  console.log("\nTest 6: dropWhen — REGISTRAR_RELEASE_FEE waived when newMortgageSameDay=true");
  {
    const waived = await calculateFees({
      procedureCatalogId: "CMP-REL-SALE-001",
      propertyValue: 100_000_000,
      newMortgageSameDay: true,
    });
    assert("REGISTRAR_RELEASE_FEE not present when newMortgageSameDay=true",
      !waived.find(f => f.code === "REGISTRAR_RELEASE_FEE"));

    const notWaived = await calculateFees({
      procedureCatalogId: "CMP-REL-SALE-001",
      propertyValue: 100_000_000,
      newMortgageSameDay: false,
    });
    const reg = notWaived.find(f => f.code === "REGISTRAR_RELEASE_FEE");
    assert("REGISTRAR_RELEASE_FEE present when newMortgageSameDay=false", !!reg);
    assert("REGISTRAR_RELEASE_FEE base = 315", reg?.baseAmount === 315, `got ${reg?.baseAmount}`);
  }

  // ── Test 7: Mutual exclusion — only one map fee survives ──
  console.log("\nTest 7: Mutual exclusion — DUBAI_MUNI_MAP wins when in Dubai, NON_DUBAI_MAP wins when not");
  {
    const dubaiFees = await calculateFees({
      procedureCatalogId: "SALE-001",
      saleValue: 100_000_000,
      propertyIsInDubaiMunicipality: true,
    });
    assert("DUBAI_MUNI_MAP present in Dubai", !!dubaiFees.find(f => f.code === "DUBAI_MUNI_MAP"));
    assert("NON_DUBAI_MAP NOT present in Dubai", !dubaiFees.find(f => f.code === "NON_DUBAI_MAP"));

    const nonDubaiFees = await calculateFees({
      procedureCatalogId: "SALE-001",
      saleValue: 100_000_000,
      propertyIsInDubaiMunicipality: false,
    });
    assert("NON_DUBAI_MAP present outside Dubai", !!nonDubaiFees.find(f => f.code === "NON_DUBAI_MAP"));
    assert("DUBAI_MUNI_MAP NOT present outside Dubai", !nonDubaiFees.find(f => f.code === "DUBAI_MUNI_MAP"));
    assert("NON_DUBAI_MAP base = 100", nonDubaiFees.find(f => f.code === "NON_DUBAI_MAP")?.baseAmount === 100, `got ${nonDubaiFees.find(f => f.code === "NON_DUBAI_MAP")?.baseAmount}`);
  }

  // ── Test 8: LTO Registration — compound: 4% sale + 0.25% rental ──
  console.log("\nTest 8: LTO Registration — compound: 4% sale (40,000) + 0.25% rental (250)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "LTO-REG-001",
      saleValue: 100_000_000,    // AED 1,000,000
      rentalValue: 10_000_000,   // AED 100,000
      propertyIsInDubaiMunicipality: true,
    });
    assert("DLD_REGISTRATION_LTO_SALE base = 40,000 (4% of saleValue)",
      fees.find(f => f.code === "DLD_REGISTRATION_LTO_SALE")?.baseAmount === 40_000, `got ${fees.find(f => f.code === "DLD_REGISTRATION_LTO_SALE")?.baseAmount}`);
    assert("DLD_REGISTRATION_LTO_RENTAL base = 250 (0.25% of rentalValue)",
      fees.find(f => f.code === "DLD_REGISTRATION_LTO_RENTAL")?.baseAmount === 250, `got ${fees.find(f => f.code === "DLD_REGISTRATION_LTO_RENTAL")?.baseAmount}`);
  }

  // ── Test 9: LTO Release — full structure ──
  console.log("\nTest 9: LTO Release — DLD 1,000 + trustee 300 + title 250");
  {
    const fees = await calculateFees({
      procedureCatalogId: "LTO-REL-001",
      propertyIsInDubaiMunicipality: true,
    });
    assert("DLD_RELEASE_LTO base = 1,000", fees.find(f => f.code === "DLD_RELEASE_LTO")?.baseAmount === 1_000, `got ${fees.find(f => f.code === "DLD_RELEASE_LTO")?.baseAmount}`);
    assert("TRUSTEE_FEE_LTO_RELEASE base = 300", fees.find(f => f.code === "TRUSTEE_FEE_LTO_RELEASE")?.baseAmount === 300, `got ${fees.find(f => f.code === "TRUSTEE_FEE_LTO_RELEASE")?.baseAmount}`);
    assert("TITLE_DEED_CERT base = 250", fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount === 250, `got ${fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount}`);
  }

  // ── Test 10: USF Registration — based on RENTAL value, not property value ──
  console.log("\nTest 10: USF Registration — 2% of RENTAL value (not property value)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "USF-REG-001",
      rentalValue: 20_000_000,    // AED 200,000
      propertyValue: 500_000_000, // AED 5,000,000 (should be ignored)
      propertyIsInDubaiMunicipality: true,
    });
    // 2% of 200,000 = 4,000 — both owner and tenant shares
    assert("DLD_REGISTRATION_USUFRUCT_OWNER base = 4,000 (2% of rentalValue)",
      fees.find(f => f.code === "DLD_REGISTRATION_USUFRUCT_OWNER")?.baseAmount === 4_000, `got ${fees.find(f => f.code === "DLD_REGISTRATION_USUFRUCT_OWNER")?.baseAmount}`);
    assert("DLD_REGISTRATION_USUFRUCT_TENANT base = 4,000 (2% of rentalValue)",
      fees.find(f => f.code === "DLD_REGISTRATION_USUFRUCT_TENANT")?.baseAmount === 4_000, `got ${fees.find(f => f.code === "DLD_REGISTRATION_USUFRUCT_TENANT")?.baseAmount}`);
  }

  // ── Test 11: USF Amendment — single 2% line + fixed 1,000 ──
  console.log("\nTest 11: USF Amendment — 2% of amendedValueChange + fixed 1,000");
  {
    const fees = await calculateFees({
      procedureCatalogId: "USF-MOD-001",
      amendedValueChange: 50_000_000, // AED 500,000
      propertyIsInDubaiMunicipality: true,
    });
    const pctFees = fees.filter(f => f.code === "DLD_USUFRUCT_AMENDMENT_PCT");
    assert("DLD_USUFRUCT_AMENDMENT_PCT appears once", pctFees.length === 1, `got ${pctFees.length}`);
    assert("DLD_USUFRUCT_AMENDMENT_PCT base = 10,000 (2% of 500,000)",
      pctFees[0]?.baseAmount === 10_000, `got ${pctFees[0]?.baseAmount}`);
    assert("DLD_USUFRUCT_AMENDMENT_FIXED base = 1,000",
      fees.find(f => f.code === "DLD_USUFRUCT_AMENDMENT_FIXED")?.baseAmount === 1_000, `got ${fees.find(f => f.code === "DLD_USUFRUCT_AMENDMENT_FIXED")?.baseAmount}`);
  }

  // ── Test 12: USF Termination — 1,000 + trustee 300 + VAT + title ──
  console.log("\nTest 12: USF Termination — DLD 1,000 + trustee 300 + VAT 15 + title 250");
  {
    const fees = await calculateFees({
      procedureCatalogId: "USF-TERM-001",
      propertyIsInDubaiMunicipality: true,
    });
    assert("DLD_USUFRUCT_TERMINATION base = 1,000", fees.find(f => f.code === "DLD_USUFRUCT_TERMINATION")?.baseAmount === 1_000, `got ${fees.find(f => f.code === "DLD_USUFRUCT_TERMINATION")?.baseAmount}`);
    const trustee = fees.find(f => f.code === "TRUSTEE_FEE_USUFRUCT_TERMINATION");
    assert("TRUSTEE_FEE_USUFRUCT_TERMINATION base = 300", trustee?.baseAmount === 300, `got ${trustee?.baseAmount}`);
    assert("TRUSTEE_FEE_USUFRUCT_TERMINATION VAT = 15", trustee?.vatAmount === 15, `got ${trustee?.vatAmount}`);
    assert("TITLE_DEED_CERT base = 250", fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount === 250, `got ${fees.find(f => f.code === "TITLE_DEED_CERT")?.baseAmount}`);
  }

  // ── Test 13: Portfolio Mortgage — 0.25% aggregate + 250 title PER property ──
  console.log("\nTest 13: Portfolio Mortgage — 0.25% aggregate + 250 title × 5 properties");
  {
    const fees = await calculateFees({
      procedureCatalogId: "MORT-PRTF-REG-001",
      portfolioLoanAmount: 1_000_000_000,  // AED 10,000,000
      propertyCount: 5,
      propertyIsInDubaiMunicipality: true,
    });
    assert("DLD_REGISTRATION_MORTGAGE_PORTFOLIO base = 25,000 (0.25% of 10M)",
      fees.find(f => f.code === "DLD_REGISTRATION_MORTGAGE_PORTFOLIO")?.baseAmount === 25_000, `got ${fees.find(f => f.code === "DLD_REGISTRATION_MORTGAGE_PORTFOLIO")?.baseAmount}`);
    const td = fees.find(f => f.code === "TITLE_DEED_CERT_PORTFOLIO");
    assert("TITLE_DEED_CERT_PORTFOLIO base = 1,250 (250 × 5)", td?.baseAmount === 1_250, `got ${td?.baseAmount}`);
    assert("TITLE_DEED_CERT_PORTFOLIO quantity = 5", td?.quantity === 5, `got ${td?.quantity}`);
  }

  // ── Test 14: Trustee Mortgage Ready — FLAT 4,000 regardless of loan size ──
  console.log("\nTest 14: Trustee Mortgage Ready — FLAT 4,000 regardless of loan size");
  {
    const small = await calculateFees({
      procedureCatalogId: "MORT-REG-001",
      mortgageAmount: 10_000_000,  // AED 100,000
      propertyIsInDubaiMunicipality: true,
    });
    const large = await calculateFees({
      procedureCatalogId: "MORT-REG-001",
      mortgageAmount: 1_000_000_000,  // AED 10,000,000
      propertyIsInDubaiMunicipality: true,
    });
    assert("TRUSTEE_FEE_MORTGAGE_READY base = 4,000 for small loan",
      small.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_READY")?.baseAmount === 4_000, `got ${small.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_READY")?.baseAmount}`);
    assert("TRUSTEE_FEE_MORTGAGE_READY base = 4,000 for large loan",
      large.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_READY")?.baseAmount === 4_000, `got ${large.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_READY")?.baseAmount}`);
  }

  // ── Test 15: Trustee Mortgage Oqood — FLAT 5,000 ──
  console.log("\nTest 15: Trustee Mortgage Oqood — FLAT 5,000");
  {
    const fees = await calculateFees({
      procedureCatalogId: "OQOOD-REG-001",
      saleValue: 150_000_000,  // AED 1,500,000
      propertyIsInDubaiMunicipality: true,
    });
    assert("TRUSTEE_FEE_MORTGAGE_OQOOD base = 5,000",
      fees.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_OQOOD")?.baseAmount === 5_000, `got ${fees.find(f => f.code === "TRUSTEE_FEE_MORTGAGE_OQOOD")?.baseAmount}`);
  }

  // ── Test 16: Sale under trustee threshold (AED 500,000) — trustee = 2,000 ──
  console.log("\nTest 16: Sale under trustee threshold (AED 500,000) — trustee = 2,000 (below tier)");
  {
    const fees = await calculateFees({
      procedureCatalogId: "SALE-001",
      saleValue: 30_000_000,  // AED 300,000 (below 500,000 threshold)
      propertyIsInDubaiMunicipality: true,
    });
    const trustee = fees.find(f => f.code === "TRUSTEE_FEE_SALE");
    assert("TRUSTEE_FEE_SALE base = 2,000 (below tier threshold)", trustee?.baseAmount === 2_000, `got ${trustee?.baseAmount}`);
    assert("TRUSTEE_FEE_SALE VAT = 100", trustee?.vatAmount === 100, `got ${trustee?.vatAmount}`);
  }

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
