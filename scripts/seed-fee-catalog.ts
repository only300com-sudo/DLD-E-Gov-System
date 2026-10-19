// scripts/seed-fee-catalog.ts
// Part 9.5 / Step 2 — Seed 38 DLD + Trustee fee codes.
// Single source of truth for fee rates. The calculateFees service reads
// from this table; preparation-sheet templates reference fee codes, not formulas.
//
// Idempotent — upserts by code. Safe to run multiple times.
//
// Run: npx tsx scripts/seed-fee-catalog.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// All amounts in fils (1 AED = 100 fils). E.g. 0.04 = 4%, 200000 fils = AED 2,000.
// This avoids floating-point money drift.
export const FEE_CATALOG = [
  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — SALE
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_SALE",
    nameEn: "DLD Sale Registration Fee",
    nameAr: "رسوم تسجيل البيع",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.04,
    baseField: "saleValue",
    appliesToProcedures: JSON.stringify([
      "SALE-001", "SALE-PRE-001", "SALE-DEL-001", "SALE-PAY-001", "SALE-DELC-001",
      "CMP-SALE-MORT-001", "CMP-SALE-MORT-PRE-001",
    ]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — GIFT (0.125% with floor AED 2,000)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_GIFT",
    nameEn: "DLD Gift Registration Fee",
    nameAr: "رسوم تسجيل الهبة",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.00125,         // 0.125%
    percentageFloor: 200000,          // AED 2,000 minimum
    baseField: "propertyValue",
    appliesToProcedures: JSON.stringify([
      "GRANT-001", "GRANT-PRE-001", "GRANT-NM-001", "GRANT-DEL-001",
      "CMP-REL-GRNT-MORT-001",
    ]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — MORTGAGE (0.25% — NOT 0.4%)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_MORTGAGE",
    nameEn: "DLD Mortgage Registration Fee",
    nameAr: "رسوم تسجيل الرهن",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.0025,           // 0.25%
    baseField: "mortgageAmount",
    appliesToProcedures: JSON.stringify([
      "MORT-REG-001", "MORT-REG-PRE-001", "MORT-MOD-001", "MORT-MOD-PRE-001",
      "MORT-TRF-001", "MORT-DEL-001", "MORT-DEL-MOD-001",
      "USF-MORT-REG-001", "USF-MORT-MOD-001",
      "CMP-SALE-MORT-001", "CMP-SALE-MORT-PRE-001",
    ]),
  },
  {
    code: "DLD_REGISTRATION_MORTGAGE_PORTFOLIO",
    nameEn: "DLD Portfolio Mortgage Registration Fee",
    nameAr: "رسوم تسجيل رهن المحافظ",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.0025,           // 0.25%
    baseField: "portfolioLoanAmount",
    appliesToProcedures: JSON.stringify([
      "MORT-PRTF-REG-001", "MORT-PRTF-MOD-001", "MORT-PRTF-MOD-PRE-001",
    ]),
  },
  {
    code: "DLD_RELEASE_MORTGAGE",
    nameEn: "DLD Mortgage Release Fee",
    nameAr: "رسوم فك الرهن",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 100000,              // AED 1,000
    appliesToProcedures: JSON.stringify([
      "MORT-REL-001", "MORT-DEL-REL-001",
      "MORT-PRTF-REL-001", "MORT-PRTF-REL-PRE-001",
      "USF-MORT-REL-001",
    ]),
  },
  {
    code: "DLD_RELEASE_MORTGAGE_BUNDLED",
    nameEn: "DLD Mortgage Release Fee — Bundled with Sale",
    nameAr: "رسوم فك الرهن — مع البيع",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 129000,              // AED 1,290
    appliesToProcedures: JSON.stringify([
      "CMP-REL-SALE-001", "CMP-REL-SALE-MORT-001",
      "CMP-REL-DEL-MORT-DEL-SALE-001", "CMP-REL-DEL-MORT-DEL-SALE-DEL-MORT-001",
    ]),
  },
  {
    code: "REGISTRAR_RELEASE_FEE",
    nameEn: "Registrar Release Fee",
    nameAr: "رسوم المسجل — فك الرهن",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 31500,               // AED 315
    dropWhen: JSON.stringify({ field: "newMortgageSameDay", equals: true }),
    appliesToProcedures: JSON.stringify([
      "CMP-REL-SALE-001", "CMP-REL-SALE-MORT-001",
      "CMP-REL-DEL-MORT-DEL-SALE-001",
    ]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — LEASE-TO-OWN (COMPOUND: 4% sale + 0.25% rental)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_LTO_SALE",
    nameEn: "DLD LTO Registration — Sale Component",
    nameAr: "رسوم تسجيل الإجارة المنتهية بالتملك — مكوّن البيع",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.04,
    baseField: "saleValue",
    appliesToProcedures: JSON.stringify([
      "LTO-REG-001", "LTO-REG-PRE-001",
      "LTO-MOD-001", "LTO-MOD-PRE-001",
      "LTO-TRF-001", "LTO-TRF-PRE-001",
      "USF-LTO-REG-001", "USF-LTO-MOD-001", "USF-LTO-TRF-001",
      "CMP-LTO-REL-LTO-001",
    ]),
  },
  {
    code: "DLD_REGISTRATION_LTO_RENTAL",
    nameEn: "DLD LTO Registration — Rental Component",
    nameAr: "رسوم تسجيل الإجارة — مكوّن الإيجار",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.0025,           // 0.25%
    baseField: "rentalValue",
    appliesToProcedures: JSON.stringify([
      "LTO-REG-001", "LTO-REG-PRE-001",
      "LTO-MOD-001", "LTO-MOD-PRE-001",
      "LTO-TRF-001", "LTO-TRF-PRE-001",
      "USF-LTO-REG-001", "USF-LTO-MOD-001", "USF-LTO-TRF-001",
    ]),
  },
  {
    code: "DLD_RELEASE_LTO",
    nameEn: "DLD LTO Release Fee",
    nameAr: "رسوم فك الإجارة",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 100000,              // AED 1,000
    appliesToProcedures: JSON.stringify([
      "LTO-REL-001", "LTO-REL-PRE-001",
      "LTO-DEL-REL-001", "LTO-DEL-REL2-001",
      "USF-LTO-REL-001",
      "CMP-LTO-REL-SALE-001", "CMP-LTO-REL-SALE-MORT-001",
      "CMP-LTO-REL-LTO-001", "CMP-LTO-REL-MORT-001",
    ]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — USUFRUCT (2% of RENTAL value, not property value)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_USUFRUCT_OWNER",
    nameEn: "DLD Usufruct Registration — Owner Share",
    nameAr: "رسوم تسجيل حق المنفعة — حصة المالك",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.02,             // 2%
    baseField: "rentalValue",
    appliesToProcedures: JSON.stringify([
      "USF-REG-001", "USF-MOD-001",
      "USF-SALE-001", "USF-SALE-PRE-001",
      "USF-SALE-MORT-001", "USF-SALE-DEL-001",
      "USF-GRNT-001", "USF-FREE-001",
      "USF-COMP-LEASE-001",
    ]),
  },
  {
    code: "DLD_REGISTRATION_USUFRUCT_TENANT",
    nameEn: "DLD Usufruct Registration — Usufructuary Share",
    nameAr: "رسوم تسجيل حق المنفعة — حصة المنتفع",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.02,
    baseField: "rentalValue",
    appliesToProcedures: JSON.stringify([
      "USF-REG-001", "USF-MOD-001",
      "USF-SALE-001", "USF-SALE-PRE-001",
      "USF-SALE-MORT-001", "USF-SALE-DEL-001",
      "USF-GRNT-001", "USF-FREE-001",
      "USF-COMP-LEASE-001",
    ]),
  },
  {
    code: "DLD_USUFRUCT_AMENDMENT_FIXED",
    nameEn: "DLD Usufruct Amendment — Fixed",
    nameAr: "رسوم تعديل حق المنفعة — ثابت",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 100000,              // AED 1,000
    appliesToProcedures: JSON.stringify(["USF-MOD-001", "USF-TERM-001"]),
  },
  {
    code: "DLD_USUFRUCT_AMENDMENT_PCT",
    nameEn: "DLD Usufruct Amendment — Value Change",
    nameAr: "رسوم تعديل حق المنفعة — تغيير القيمة",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.02,
    baseField: "amendedValueChange",
    appliesToProcedures: JSON.stringify(["USF-MOD-001"]),
  },
  {
    code: "DLD_USUFRUCT_TERMINATION",
    nameEn: "DLD Usufruct Termination Fee",
    nameAr: "رسوم إنهاء حق المنفعة",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 100000,              // AED 1,000
    appliesToProcedures: JSON.stringify(["USF-TERM-001"]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — NEW PROCEDURES (added in Step 4)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "DLD_REGISTRATION_OQOOD",
    nameEn: "DLD Off-Plan (Oqood) Registration Fee",
    nameAr: "رسوم تسجيل العقارات على الخارطة",
    feeType: "percentage",
    feeCategory: "government",
    percentageRate: 0.04,
    baseField: "saleValue",
    appliesToProcedures: JSON.stringify(["OQOOD-REG-001"]),
  },
  {
    code: "DLD_PROPERTY_VALUATION",
    nameEn: "Property Valuation Fee",
    nameAr: "رسوم تقييم العقار",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 400000,              // AED 4,000
    appliesToProcedures: JSON.stringify(["PROP-VAL-001"]),
  },
  {
    code: "DLD_TITLE_AMENDMENT",
    nameEn: "Title Deed Amendment Fee",
    nameAr: "رسوم تعديل سند الملكية",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 25000,               // AED 250
    appliesToProcedures: JSON.stringify(["TITLE-AMEND-001"]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // TRUSTEE OFFICE FEES (tiered: AED 2,000 below threshold, 4,000 above)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "TRUSTEE_FEE_SALE",
    nameEn: "Trustee Office Fee — Sale",
    nameAr: "رسوم أمين التسجيل — بيع",
    feeType: "tiered",
    feeCategory: "trustee",
    tierThreshold: 50000000,          // AED 500,000
    tierAmountAbove: 400000,            // AED 4,000
    tierAmountBelow: 200000,            // AED 2,000
    baseField: "saleValue",
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "SALE-001", "SALE-PRE-001", "SALE-DEL-001", "SALE-PAY-001", "SALE-DELC-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_GIFT",
    nameEn: "Trustee Office Fee — Gift",
    nameAr: "رسوم أمين التسجيل — هبة",
    feeType: "tiered",
    feeCategory: "trustee",
    tierThreshold: 200000000,         // AED 2,000,000 (higher threshold for gifts)
    tierAmountAbove: 400000,            // AED 4,000
    tierAmountBelow: 200000,            // AED 2,000
    baseField: "propertyValue",
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "GRANT-001", "GRANT-PRE-001", "GRANT-NM-001", "GRANT-DEL-001",
      "CMP-REL-GRNT-MORT-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_LTO",
    nameEn: "Trustee Office Fee — LTO",
    nameAr: "رسوم أمين التسجيل — إجارة منتهية بالتملك",
    feeType: "tiered",
    feeCategory: "trustee",
    tierThreshold: 50000000,          // AED 500,000
    tierAmountAbove: 400000,
    tierAmountBelow: 200000,
    baseField: "saleValue",
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "LTO-REG-001", "LTO-REG-PRE-001",
      "LTO-MOD-001", "LTO-MOD-PRE-001",
      "LTO-TRF-001", "LTO-TRF-PRE-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_LTO_RELEASE",
    nameEn: "Trustee Office Fee — LTO Release",
    nameAr: "رسوم أمين التسجيل — فك الإجارة",
    feeType: "fixed",
    feeCategory: "trustee",
    fixedAmount: 30000,                // AED 300
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "LTO-REL-001", "LTO-REL-PRE-001",
      "LTO-DEL-REL-001", "LTO-DEL-REL2-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_USUFRUCT",
    nameEn: "Trustee Office Fee — Usufruct",
    nameAr: "رسوم أمين التسجيل — حق المنفعة",
    feeType: "tiered",
    feeCategory: "trustee",
    tierThreshold: 50000000,          // AED 500,000
    tierAmountAbove: 400000,
    tierAmountBelow: 200000,
    baseField: "rentalValue",
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "USF-REG-001", "USF-MOD-001",
      "USF-SALE-001", "USF-SALE-PRE-001",
      "USF-SALE-MORT-001", "USF-SALE-DEL-001",
      "USF-GRNT-001", "USF-FREE-001",
      "USF-COMP-LEASE-001",
      "USF-LTO-REG-001", "USF-LTO-MOD-001", "USF-LTO-TRF-001",
      "USF-LTO-REL-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_USUFRUCT_TERMINATION",
    nameEn: "Trustee Office Fee — Usufruct Termination",
    nameAr: "رسوم أمين التسجيل — إنهاء حق المنفعة",
    feeType: "fixed",
    feeCategory: "trustee",
    fixedAmount: 30000,                // AED 300
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify(["USF-TERM-001"]),
  },
  {
    code: "TRUSTEE_FEE_MORTGAGE_READY",
    nameEn: "Trustee Office Fee — Mortgage (Ready Property)",
    nameAr: "رسوم أمين التسجيل — رهن جاهز",
    feeType: "fixed",
    feeCategory: "trustee",
    fixedAmount: 400000,               // AED 4,000 (flat — not tiered)
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "MORT-REG-001", "MORT-REG-PRE-001", "MORT-MOD-001", "MORT-MOD-PRE-001",
      "CMP-SALE-MORT-001", "CMP-SALE-MORT-PRE-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_MORTGAGE_OQOOD",
    nameEn: "Trustee Office Fee — Mortgage (Oqood / Off-plan)",
    nameAr: "رسوم أمين التسجيل — رهن على الخارطة",
    feeType: "fixed",
    feeCategory: "trustee",
    fixedAmount: 500000,               // AED 5,000 (flat)
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "OQOOD-REG-001",
      "MORT-PRTF-REG-001", "MORT-PRTF-MOD-001",
    ]),
  },
  {
    code: "TRUSTEE_FEE_MORTGAGE_RELEASE",
    nameEn: "Trustee Office Fee — Mortgage Release",
    nameAr: "رسوم أمين التسجيل — فك الرهن",
    feeType: "fixed",
    feeCategory: "trustee",
    fixedAmount: 30000,                // AED 300
    vatApplicable: true,
    vatRate: 0.05,
    appliesToProcedures: JSON.stringify([
      "MORT-REL-001", "MORT-DEL-REL-001",
      "MORT-PRTF-REL-001", "MORT-PRTF-REL-PRE-001",
      "USF-MORT-REL-001",
    ]),
  },

  // ════════════════════════════════════════════════════════════════════════
  // MANDATORY FIXED FEES (apply to most procedures)
  // ════════════════════════════════════════════════════════════════════════
  {
    code: "TITLE_DEED_CERT",
    nameEn: "Title Deed Certificate Issuance",
    nameAr: "إصدار شهادة سند الملكية",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 25000,               // AED 250
    perProperty: false,
    appliesToProcedures: JSON.stringify([
      "SALE-001", "SALE-PRE-001", "SALE-DEL-001", "SALE-PAY-001", "SALE-DELC-001",
      "GRANT-001", "GRANT-PRE-001", "GRANT-NM-001", "GRANT-DEL-001",
      "MORT-REG-001", "MORT-REG-PRE-001",
      "MORT-REL-001", "MORT-DEL-REL-001",
      "LTO-REG-001", "LTO-REL-001",
      "USF-REG-001", "USF-MOD-001", "USF-TERM-001",
      "OQOOD-REG-001", "TITLE-AMEND-001",
      "CMP-SALE-MORT-001", "CMP-REL-SALE-001", "CMP-REL-SALE-MORT-001",
    ]),
  },
  {
    code: "TITLE_DEED_CERT_PORTFOLIO",
    nameEn: "Title Deed Certificate — Per Property (Portfolio)",
    nameAr: "إصدار شهادة سند الملكية — لكل عقار (محفظة)",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 25000,               // AED 250 per property
    perProperty: true,
    appliesToProcedures: JSON.stringify([
      "MORT-PRTF-REG-001", "MORT-PRTF-MOD-001", "MORT-PRTF-MOD-PRE-001",
      "MORT-PRTF-REL-001", "MORT-PRTF-REL-PRE-001",
      "MORT-PRTF-DEL-001", "MORT-PRTF-DEL-MOD-001", "MORT-PRTF-DEL-REL-001",
      "MORT-PRTF-USF-REG-001", "MORT-PRTF-USF-MOD-001", "MORT-PRTF-USF-REL-001",
    ]),
  },
  {
    code: "DUBAI_MUNI_MAP",
    nameEn: "Unified Map — Dubai Municipality",
    nameAr: "الخريطة الموحدة — بلدية دبي",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 25000,               // AED 250
    mutualExclusionGroup: "map_fee",
    appliesToProcedures: JSON.stringify(["*"]),
  },
  {
    code: "NON_DUBAI_MAP",
    nameEn: "Map — Non-Dubai Municipality",
    nameAr: "خريطة غير بلدية دبي",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 10000,                // AED 100
    mutualExclusionGroup: "map_fee",
    appliesToProcedures: JSON.stringify(["*"]),
  },
  {
    code: "KNOWLEDGE_FEE",
    nameEn: "Knowledge Fee",
    nameAr: "رسوم المعرفة",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 1000,                 // AED 10
    appliesToProcedures: JSON.stringify(["*"]),
  },
  {
    code: "INNOVATION_FEE",
    nameEn: "Innovation Fee",
    nameAr: "رسوم الابتكار",
    feeType: "fixed",
    feeCategory: "government",
    fixedAmount: 1000,                 // AED 10
    appliesToProcedures: JSON.stringify(["*"]),
  },
];

async function main() {
  console.log(`=== Seeding FeeCatalog (${FEE_CATALOG.length} fee codes) ===\n`);
  let upserted = 0;
  for (const fee of FEE_CATALOG) {
    await db.feeCatalog.upsert({
      where: { code: fee.code },
      create: fee,
      update: fee,
    });
    upserted++;
  }
  console.log(`✓ ${upserted} fee codes upserted`);

  // Verify
  const count = await db.feeCatalog.count({ where: { isActive: true } });
  console.log(`\nActive fees: ${count} (expected ${FEE_CATALOG.length})`);

  // Categorize
  const govCount = await db.feeCatalog.count({ where: { feeCategory: "government", isActive: true } });
  const trusteeCount = await db.feeCatalog.count({ where: { feeCategory: "trustee", isActive: true } });
  console.log(`  government: ${govCount} | trustee: ${trusteeCount}`);

  // List
  const all = await db.feeCatalog.findMany({
    where: { isActive: true },
    select: { code: true, feeType: true, feeCategory: true, fixedAmount: true, percentageRate: true, baseField: true },
    orderBy: [{ feeCategory: "asc" }, { code: "asc" }],
  });
  console.log("\nAll fees:");
  for (const f of all) {
    const detail = f.feeType === "fixed"
      ? `fixed=${f.fixedAmount ? f.fixedAmount / 100 : 0} AED`
      : f.feeType === "percentage"
      ? `pct=${f.percentageRate} × ${f.baseField}`
      : `tiered`;
    console.log(`  ${f.code.padEnd(38)} ${f.feeCategory.padEnd(10)} ${f.feeType.padEnd(11)} ${detail}`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
