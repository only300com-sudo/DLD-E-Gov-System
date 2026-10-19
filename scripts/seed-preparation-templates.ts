// scripts/seed-preparation-templates.ts
// Part 8B — Seed 3 starter PreparationSheetTemplate rows for proof-of-concept.
//
// Per the Part 7 closure review: start with SALE-001, SALE-DEL-001, MORT-REG-001
// as proof-of-concept. The remaining 10 P1 procedures can be added iteratively
// as DLD's required fields are confirmed. Fallback for unmapped procedures is
// a `default` template that covers title deed + parties + financials.
//
// Template JSON shape (stored as a string in the `templateJson` column):
// {
//   "sections": [
//     {
//       "id": "property",
//       "label_en": "Property Details",
//       "label_ar": "بيانات العقار",
//       "fields": [
//         { "key": "title_deed_number", "type": "string", "required": true, "label_en": "Title Deed No.", "label_ar": "رقم سند الملكية" },
//         { "key": "title_deed_year",   "type": "number", "required": true },
//         { "key": "property_area",     "type": "number", "required": true, "label_en": "Area (sqft)" },
//         { "key": "property_type",     "type": "enum",   "required": true, "options": ["land", "building", "unit"] }
//       ]
//     },
//     { "id": "seller",  "label_en": "Seller",  "label_ar": "البائع",  "fields": [...] },
//     { "id": "buyer",   "label_en": "Buyer",   "label_ar": "المشتري", "fields": [...] },
//     { "id": "financials", "label_en": "Financial", "label_ar": "المالية", "fields": [...] }
//   ]
// }
//
// Field types: string | number | enum | boolean | date | datetime | decimal
// Field props: key (required), type (required), required, label_en, label_ar,
//              options (enum only), pattern (regex string), readonly,
//              computed (string expression for derived fields, evaluated by
//              the renderer — e.g. "saleValue * 0.04" for DLD fee calculation)
//
// Run: npx tsx scripts/seed-preparation-templates.ts
// Idempotent: upserts by (procedureCatalogId, version). Re-running is safe.

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Common section: Property Details — appears in every property transaction
const PROPERTY_SECTION = {
  id: "property",
  label_en: "Property Details",
  label_ar: "بيانات العقار",
  fields: [
    { key: "title_deed_number", type: "string", required: true, label_en: "Title Deed No.", label_ar: "رقم سند الملكية" },
    { key: "title_deed_year",   type: "number", required: true, label_en: "Title Deed Year", label_ar: "سنة السند" },
    { key: "property_area",     type: "number", required: true, label_en: "Area (sqft)", label_ar: "المساحة (قدم²)" },
    { key: "property_type",     type: "enum",   required: true, label_en: "Property Type", label_ar: "نوع العقار",
      options: ["land", "building", "unit"] },
    { key: "location",          type: "string", required: true, label_en: "Location", label_ar: "الموقع" },
  ],
};

// Common section: Seller
const SELLER_SECTION = {
  id: "seller",
  label_en: "Seller Details",
  label_ar: "بيانات البائع",
  fields: [
    { key: "seller_name",         type: "string", required: true, label_en: "Seller Name", label_ar: "اسم البائع" },
    { key: "seller_emirates_id",  type: "string", required: true, label_en: "Emirates ID", label_ar: "الإمارات",
      pattern: "^784-\\d{4}-\\d{7}-\\d$" },
    { key: "seller_nationality",  type: "string", required: true, label_en: "Nationality", label_ar: "الجنسية" },
    { key: "seller_mobile",       type: "string", required: false, label_en: "Mobile", label_ar: "الجوال" },
  ],
};

// Common section: Buyer
const BUYER_SECTION = {
  id: "buyer",
  label_en: "Buyer Details",
  label_ar: "بيانات المشتري",
  fields: [
    { key: "buyer_name",          type: "string", required: true, label_en: "Buyer Name", label_ar: "اسم المشتري" },
    { key: "buyer_emirates_id",   type: "string", required: true, label_en: "Emirates ID", label_ar: "الإمارات",
      pattern: "^784-\\d{4}-\\d{7}-\\d$" },
    { key: "buyer_nationality",   type: "string", required: true, label_en: "Nationality", label_ar: "الجنسية" },
    { key: "buyer_mobile",        type: "string", required: false, label_en: "Mobile", label_ar: "الجوال" },
  ],
};

// Common section: Financials — references fee codes from the FeeCatalog.
// Per Part 9.5 Step 6, formulas are replaced with feeCode references so
// the renderer looks up the rate from the FeeCatalog table (single source
// of truth). Computed fields like "monthly_installment" stay as inline
// formulas because they're derived math, not a fee.
const FINANCIALS_SECTION = {
  id: "financials",
  label_en: "Financial",
  label_ar: "البيانات المالية",
  fields: [
    { key: "sale_value",      type: "number",  required: true,  label_en: "Sale Value (AED)", label_ar: "قيمة البيع (درهم)" },
    { key: "payment_method",  type: "enum",    required: true,  label_en: "Payment Method", label_ar: "طريقة الدفع",
      options: ["cash", "bank_transfer", "cheque"] },
    // Fee reference — DLD_REGISTRATION_SALE is 4% in the FeeCatalog
    { key: "dld_fee",         type: "fee",     readonly: true,  feeCode: "DLD_REGISTRATION_SALE",
      label_en: "DLD Fee (4%)", label_ar: "رسومة دبي للأراضي (4%)" },
    // Fee reference — TRUSTEE_FEE_SALE is tiered (2k/4k based on saleValue)
    { key: "trustee_fee",     type: "fee",     readonly: true,  feeCode: "TRUSTEE_FEE_SALE",
      label_en: "Trustee Fee (AED)", label_ar: "رسوم المكتب (درهم)" },
  ],
};

const PREPARATION_TEMPLATES = [
  // ── SALE-001: Standard Sale ──
  {
    procedureCatalogId: "SALE-001",
    templateJson: JSON.stringify({
      sections: [PROPERTY_SECTION, SELLER_SECTION, BUYER_SECTION, FINANCIALS_SECTION],
    }),
  },
  // ── SALE-DEL-001: Delayed Sale ──
  // Adds a delayed-sale-agreement section with payment plan fields
  {
    procedureCatalogId: "SALE-DEL-001",
    templateJson: JSON.stringify({
      sections: [
        PROPERTY_SECTION,
        SELLER_SECTION,
        BUYER_SECTION,
        {
          id: "delayed_sale_agreement",
          label_en: "Delayed Sale Agreement",
          label_ar: "اتفاقية البيع المؤجل",
          fields: [
            { key: "agreement_date",      type: "date",    required: true, label_en: "Agreement Date", label_ar: "تاريخ الاتفاقية" },
            { key: "completion_date",     type: "date",    required: true, label_en: "Completion Date", label_ar: "تاريخ الإتمام" },
            { key: "installment_count",   type: "number",  required: true, label_en: "Installments", label_ar: "عدد الأقساط" },
            { key: "installment_amount",  type: "number",  required: true, label_en: "Installment Amount (AED)", label_ar: "قيمة القسط (درهم)" },
            { key: "down_payment",        type: "number",  required: true, label_en: "Down Payment (AED)", label_ar: "الدفعة المقدمة (درهم)" },
          ],
        },
        FINANCIALS_SECTION,
      ],
    }),
  },
  // ── MORT-REG-001: Mortgage Registration ──
  // Adds a lender + mortgage terms section; buyer becomes mortgagor
  {
    procedureCatalogId: "MORT-REG-001",
    templateJson: JSON.stringify({
      sections: [
        PROPERTY_SECTION,
        {
          id: "mortgagor",
          label_en: "Mortgagor (Owner)",
          label_ar: "الراهن (المالك)",
          fields: [
            { key: "mortgagor_name",        type: "string", required: true, label_en: "Mortgagor Name", label_ar: "اسم الراهن" },
            { key: "mortgagor_emirates_id", type: "string", required: true, label_en: "Emirates ID", label_ar: "الإمارات",
              pattern: "^784-\\d{4}-\\d{7}-\\d$" },
          ],
        },
        {
          id: "lender",
          label_en: "Lender (Bank)",
          label_ar: "المرتهن (البنك)",
          fields: [
            { key: "lender_name",          type: "string", required: true, label_en: "Bank Name", label_ar: "اسم البنك" },
            { key: "lender_license",       type: "string", required: true, label_en: "Bank License No.", label_ar: "رقم رخصة البنك" },
            { key: "lender_representative", type: "string", required: true, label_en: "Representative", label_ar: "الممثل" },
          ],
        },
        {
          id: "mortgage_terms",
          label_en: "Mortgage Terms",
          label_ar: "شروط الرهن",
          fields: [
            { key: "mortgage_amount",     type: "number", required: true, label_en: "Mortgage Amount (AED)", label_ar: "مبلغ الرهن (درهم)" },
            { key: "mortgage_period_years", type: "number", required: true, label_en: "Period (years)", label_ar: "المدة (سنوات)" },
            { key: "interest_rate",       type: "number", required: true, label_en: "Interest Rate (%)", label_ar: "معدل الفائدة (%)" },
            { key: "monthly_installment", type: "number", readonly: true, computed: "mortgageAmount / (mortgagePeriodYears * 12)",
              label_en: "Monthly Installment (AED)", label_ar: "القسط الشهري (درهم)" },
          ],
        },
        {
          id: "financials",
          label_en: "Fees",
          label_ar: "الرسوم",
          fields: [
            // Part 9.5 Step 6 — fee code reference (was incorrectly 0.4% inline;
            // the actual DLD mortgage fee is 0.25%, enforced by FeeCatalog)
            { key: "dld_fee", type: "fee", readonly: true, feeCode: "DLD_REGISTRATION_MORTGAGE",
              label_en: "DLD Mortgage Fee (0.25%)", label_ar: "رسوم رهن دبي للأراضي (0.25%)" },
            // Trustee mortgage fee is flat 4,000 AED for ready properties
            { key: "trustee_fee", type: "fee", readonly: true, feeCode: "TRUSTEE_FEE_MORTGAGE_READY",
              label_en: "Trustee Fee (AED)", label_ar: "رسوم المكتب (درهم)" },
          ],
        },
      ],
    }),
  },
];

async function main() {
  console.log("=== Seed Preparation Sheet Templates ===\n");
  console.log(`Templates to seed: ${PREPARATION_TEMPLATES.length}`);

  let created = 0;
  let updated = 0;

  for (const t of PREPARATION_TEMPLATES) {
    // Check if the procedure exists in the catalog
    const proc = await db.procedureCatalog.findUnique({
      where: { id: t.procedureCatalogId },
      select: { id: true, nameEn: true, priority: true },
    });
    if (!proc) {
      console.warn(`⚠ Skipping ${t.procedureCatalogId} — not in ProcedureCatalog`);
      continue;
    }

    // Upsert: unique on (procedureCatalogId, version=1)
    const existing = await db.preparationSheetTemplate.findFirst({
      where: { procedureCatalogId: t.procedureCatalogId, version: 1 },
    });

    if (existing) {
      await db.preparationSheetTemplate.update({
        where: { id: existing.id },
        data: { templateJson: t.templateJson, isActive: true, renderer: "web" },
      });
      updated++;
      console.log(`  ✓ Updated ${t.procedureCatalogId} (v1) — ${proc.nameEn}`);
    } else {
      await db.preparationSheetTemplate.create({
        data: {
          procedureCatalogId: t.procedureCatalogId,
          version: 1,
          isActive: true,
          templateJson: t.templateJson,
          renderer: "web",
        },
      });
      created++;
      console.log(`  ✓ Created ${t.procedureCatalogId} (v1) — ${proc.nameEn}`);
    }
  }

  console.log(`\nCreated: ${created} | Updated: ${updated}`);

  // Final verification — count templates
  const total = await db.preparationSheetTemplate.count();
  console.log(`\nTotal templates in DB: ${total}`);

  // List them
  const all = await db.preparationSheetTemplate.findMany({
    include: { procedureCatalog: { select: { nameEn: true } } },
    orderBy: { procedureCatalogId: "asc" },
  });
  for (const t of all) {
    const sections = JSON.parse(t.templateJson).sections?.length ?? 0;
    console.log(`  • ${t.procedureCatalogId} v${t.version} (active=${t.isActive}, renderer=${t.renderer}, sections=${sections}) — ${t.procedureCatalog.nameEn}`);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
